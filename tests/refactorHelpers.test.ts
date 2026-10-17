import { describe, it, expect } from 'vitest'
import { parseAIResponse } from '@/lib/ai/parse-response'
import { buildContextFolderGroups, truncateAtBoundary } from '@/lib/ai/context-groups'
import { findItemIndexAtOffset, normalizeForSearch } from '@/lib/editor/pdf-text-layout'
import { buildSearchIndexEntry, findSearchMatches } from '@/lib/editor/pdf-search'
import {
  containsLegacyImageSources,
  extractReferencedImageAttachments,
  sanitizeImageAltText,
} from '@/lib/editor/noteImageHtml'
import {
  collapseSoftWrappedLines,
  normalizePastedText,
  shouldPreferPlainTextOverHtml,
  stripGeminiCitationTags,
} from '@/lib/editor/pasteNormalization'
import type { FolderNode } from '@/lib/folders'
import type { Note } from '@/lib/notes'

const note = (id: string, title: string, folderId: string | null = null): Note => ({
  id,
  title,
  content: '',
  created_at: '',
  updated_at: '',
  user_id: 'u1',
  folder_id: folderId,
  project_id: null,
  position: 0,
  note_type: 'rich-text',
})

const folderNode = (id: string, name: string, children: FolderNode[] = []): FolderNode =>
  ({ id, name, children } as unknown as FolderNode)

describe('parseAIResponse', () => {
  it('extracts structured JSON from a fenced code block', () => {
    const result = parseAIResponse('Here you go:\n```json\n{"summary":"S","keyPoints":["a"],"suggestedTasks":["t"]}\n```')
    expect(result).toEqual({ type: 'structured', summary: 'S', keyPoints: ['a'], suggestedTasks: ['t'] })
  })

  it('extracts structured JSON without a fence', () => {
    const result = parseAIResponse('Text before {"summary":"S"} text after')
    expect(result.type).toBe('structured')
    expect(result.summary).toBe('S')
  })

  it('falls back to raw text', () => {
    expect(parseAIResponse('just prose')).toEqual({ type: 'text', rawText: 'just prose' })
  })
})

describe('truncateAtBoundary', () => {
  it('returns short text unchanged', () => {
    expect(truncateAtBoundary('hello', 10)).toBe('hello')
  })

  it('cuts at a word boundary', () => {
    expect(truncateAtBoundary('alpha beta gamma delta', 15)).toBe('alpha beta')
  })
})

describe('buildContextFolderGroups', () => {
  it('drops empty folders and sorts notes by title', () => {
    const folders = [folderNode('f1', 'One'), folderNode('f2', 'Empty'), folderNode('f3', 'Parent', [folderNode('f4', 'Child')])]
    const notes = new Map<string, Note[]>([
      ['f1', [note('n2', 'Zeta'), note('n1', 'Alpha')]],
      ['f4', [note('n3', 'Beta')]],
    ])

    const groups = buildContextFolderGroups(folders, notes)
    expect(groups.map((g) => g.folder.id)).toEqual(['f1', 'f3'])
    expect(groups[0].notes.map((n) => n.title)).toEqual(['Alpha', 'Zeta'])
    expect(groups[1].children[0].folder.id).toBe('f4')
  })
})

describe('pdf search helpers', () => {
  it('normalizes case and diacritics while preserving length', () => {
    const input = 'Café ÜBER'
    const output = normalizeForSearch(input)
    expect(output).toBe('cafe uber')
    expect(output.length).toBe(input.length)
  })

  it('finds the text item containing an offset', () => {
    expect(findItemIndexAtOffset([0, 5, 10], 0)).toBe(0)
    expect(findItemIndexAtOffset([0, 5, 10], 6)).toBe(1)
    expect(findItemIndexAtOffset([0, 5, 10], 999)).toBe(2)
  })
})

describe('pasteNormalization', () => {
  it('strips Gemini citation tags', () => {
    expect(stripGeminiCitationTags('a[cite_start]b[cite: 1, 2]c')).toBe('abc')
  })

  it('normalizes whitespace and collapses blank lines', () => {
    expect(normalizePastedText('\r\n\r\n  a  \r\n\r\n\r\n\r\nb\r\n\r\n')).toBe('  a\n\nb')
  })

  it('joins soft-wrapped prose but keeps structured lines', () => {
    const prose = 'This is a long first line of prose that continues\nand continues on a second physical line here'
    expect(collapseSoftWrappedLines(prose)).toBe(
      'This is a long first line of prose that continues and continues on a second physical line here'
    )
    expect(collapseSoftWrappedLines('- one\n- two')).toBe('- one\n- two')
  })

  it('prefers plain text for wrapper-only HTML', () => {
    expect(shouldPreferPlainTextOverHtml('<div><span>hello</span></div>', 'hello')).toBe(true)
    expect(shouldPreferPlainTextOverHtml('<ul><li>hello</li></ul>', 'hello')).toBe(false)
  })
})

describe('pdf search index', () => {
  it('maps matches back to text items', () => {
    const entry = buildSearchIndexEntry(3, [{ str: 'Hello ' }, { str: 'world' }])
    expect(entry.normalized).toBe('hello world')
    expect(findSearchMatches([entry], 'hello')).toEqual([
      { pageNumber: 3, itemStart: 0, itemEnd: 0 },
    ])
    expect(findSearchMatches([entry], 'world')).toEqual([
      { pageNumber: 3, itemStart: 1, itemEnd: 1 },
    ])
  })

  it('matches phrases that span text items', () => {
    const entry = buildSearchIndexEntry(1, [{ str: 'Hello ' }, { str: 'world' }])
    expect(findSearchMatches([entry], 'lo wo')).toEqual([
      { pageNumber: 1, itemStart: 0, itemEnd: 1 },
    ])
  })

  it('finds every occurrence and ignores case', () => {
    const entry = buildSearchIndexEntry(2, [{ str: 'AB ab' }])
    expect(findSearchMatches([entry], 'ab')).toHaveLength(2)
    expect(findSearchMatches([entry], '   ')).toEqual([])
  })
})

describe('noteImageHtml', () => {
  it('collects attachment ids from block attributes and payloads', () => {
    const html = `
      <div data-block-type="image" data-attachment-id="a1" data-storage-path="p1"></div>
      <div data-block-type="image" data-block-payload="${encodeURIComponent(JSON.stringify({ attachmentId: 'a2', storagePath: 'p2' }))}"></div>
      <div data-block-type="image" data-block-payload="not-json"></div>
    `
    const result = extractReferencedImageAttachments(html)
    expect([...result.attachmentIds].sort()).toEqual(['a1', 'a2'])
    expect([...result.storagePaths].sort()).toEqual(['p1', 'p2'])
  })

  it('returns empty sets for empty input', () => {
    const result = extractReferencedImageAttachments('')
    expect(result.attachmentIds.size).toBe(0)
    expect(result.storagePaths.size).toBe(0)
  })

  it('detects legacy data/file image sources', () => {
    expect(containsLegacyImageSources('<img src="data:image/png;base64,abc">')).toBe(true)
    expect(containsLegacyImageSources('<img src="file:///tmp/a.png">')).toBe(true)
    expect(containsLegacyImageSources('<img src="https://cdn.example/a.png">')).toBe(false)
    expect(containsLegacyImageSources('')).toBe(false)
  })

  it('sanitizes alt text and falls back', () => {
    expect(sanitizeImageAltText('<bad>"alt"')).toBe('badalt')
    expect(sanitizeImageAltText('   ')).toBe('Image')
    expect(sanitizeImageAltText(null, 'Pasted image')).toBe('Pasted image')
  })
})
