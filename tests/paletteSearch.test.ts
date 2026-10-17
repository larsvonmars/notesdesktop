import { describe, it, expect } from 'vitest'
import { flattenFolderTree, matchesPaletteQuery } from '@/lib/workspace/palette-search'
import type { FolderNode } from '@/lib/folders'

function folder(id: string, name: string, children: FolderNode[] = []): FolderNode {
  return { id, name, children } as FolderNode
}

describe('flattenFolderTree', () => {
  it('returns an empty list for no folders', () => {
    expect(flattenFolderTree([])).toEqual([])
  })

  it('keeps a readable path for nested folders', () => {
    const tree = [
      folder('a', 'Work', [
        folder('b', 'Sprint 12', [folder('c', 'Retro')]),
      ]),
      folder('d', 'Personal'),
    ]

    expect(flattenFolderTree(tree)).toEqual([
      { id: 'a', name: 'Work', path: 'Work' },
      { id: 'b', name: 'Sprint 12', path: 'Work / Sprint 12' },
      { id: 'c', name: 'Retro', path: 'Work / Sprint 12 / Retro' },
      { id: 'd', name: 'Personal', path: 'Personal' },
    ])
  })
})

describe('matchesPaletteQuery', () => {
  it('matches everything for an empty query', () => {
    expect(matchesPaletteQuery('Anything', undefined, '')).toBe(true)
    expect(matchesPaletteQuery('Anything', 'hint', '   ')).toBe(true)
  })

  it('matches labels case-insensitively', () => {
    expect(matchesPaletteQuery('Weekly Review', undefined, 'weekly')).toBe(true)
    expect(matchesPaletteQuery('Weekly Review', undefined, 'REVIEW')).toBe(true)
  })

  it('matches hints as well as labels', () => {
    expect(matchesPaletteQuery('New Mind Map', 'Visualize concepts', 'visualize')).toBe(true)
  })

  it('rejects non-matching queries', () => {
    expect(matchesPaletteQuery('Weekly Review', 'Notes', 'invoice')).toBe(false)
  })
})
