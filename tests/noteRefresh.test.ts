import { describe, expect, it } from 'vitest'

import type { NoteType } from '@/lib/notes'
import { isSameNoteContent, shouldAdoptExternalNote } from '@/lib/workspace/noteRefresh'

type Row = { id: string; title: string; content: string; note_type: NoteType; updated_at: string }

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'note-1',
    title: 'Weekly plan',
    content: '<p>Ship the release</p>',
    note_type: 'rich-text',
    updated_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('isSameNoteContent', () => {
  it('matches identical rows', () => {
    expect(isSameNoteContent(row(), row())).toBe(true)
  })

  it('detects a changed body, title or note type', () => {
    expect(isSameNoteContent(row(), row({ content: '<p>Changed</p>' }))).toBe(false)
    expect(isSameNoteContent(row(), row({ title: 'Renamed' }))).toBe(false)
    expect(isSameNoteContent(row(), row({ note_type: 'mindmap' }))).toBe(false)
  })

  it('ignores timestamp-only changes (moves, no-op writes)', () => {
    expect(isSameNoteContent(row(), row({ updated_at: '2026-01-02T10:00:00.000Z' }))).toBe(true)
  })
})

describe('shouldAdoptExternalNote', () => {
  it('adopts a newer row for the open note', () => {
    const fresh = row({ content: '<p>Ship the release</p><p>AI appended this</p>', updated_at: '2026-01-01T10:05:00.000Z' })
    expect(shouldAdoptExternalNote(row(), fresh, false)).toBe(true)
  })

  it('never adopts while the editor has unsaved edits', () => {
    const fresh = row({ content: '<p>External write</p>', updated_at: '2026-01-01T10:05:00.000Z' })
    expect(shouldAdoptExternalNote(row(), fresh, true)).toBe(false)
  })

  it('ignores rows that did not change', () => {
    expect(shouldAdoptExternalNote(row(), row(), false)).toBe(false)
  })

  it('ignores other notes', () => {
    expect(shouldAdoptExternalNote(row(), row({ id: 'note-2', content: 'x' }), false)).toBe(false)
  })

  it('handles missing rows', () => {
    expect(shouldAdoptExternalNote(null, row(), false)).toBe(false)
    expect(shouldAdoptExternalNote(row(), null, false)).toBe(false)
    expect(shouldAdoptExternalNote(undefined, undefined, false)).toBe(false)
  })
})
