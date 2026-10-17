import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/folders', () => ({ createFolder: vi.fn() }))
vi.mock('@/lib/notes', () => ({ createNote: vi.fn(), getNote: vi.fn() }))

import { collectFolderSubtreeIds, restoreDeletedFolder, type DeletedFolderSnapshot } from '@/lib/workspace/folderSnapshot'
import type { Folder } from '@/lib/folders'
import { createFolder } from '@/lib/folders'
import { createNote } from '@/lib/notes'

function folder(id: string, parent_id: string | null): Folder {
  return {
    id,
    user_id: 'u1',
    name: id,
    parent_id,
    project_id: null,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

describe('collectFolderSubtreeIds', () => {
  const folders = [
    folder('root', null),
    folder('child', 'root'),
    folder('grandchild', 'child'),
    folder('sibling', null),
  ]

  it('collects the folder and all descendants', () => {
    expect([...collectFolderSubtreeIds('root', folders)].sort()).toEqual(
      ['child', 'grandchild', 'root']
    )
  })

  it('collects a single leaf', () => {
    expect([...collectFolderSubtreeIds('grandchild', folders)]).toEqual(['grandchild'])
  })
})

describe('restoreDeletedFolder', () => {
  beforeEach(() => {
    vi.mocked(createFolder).mockReset()
    vi.mocked(createNote).mockReset()
  })

  it('recreates parents before children and remaps note folders', async () => {
    const order: string[] = []
    let created = 0
    vi.mocked(createFolder).mockImplementation(async (input) => {
      order.push(input.name)
      created += 1
      return { id: `new-${created}`, ...input } as Folder
    })
    vi.mocked(createNote).mockResolvedValue({} as never)

    const snapshot: DeletedFolderSnapshot = {
      folders: [
        { id: 'old-root', name: 'Root', parent_id: null, project_id: null },
        { id: 'old-child', name: 'Child', parent_id: 'old-root', project_id: null },
      ],
      notes: [
        {
          title: 'Inside child',
          content: '<p>hi</p>',
          note_type: 'rich-text',
          folder_id: 'old-child',
          project_id: null,
        },
      ],
    }

    const rootId = await restoreDeletedFolder(snapshot)

    expect(order).toEqual(['Root', 'Child'])
    expect(rootId).toBe('new-1')
    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({ folder_id: 'new-2', title: 'Inside child' })
    )
  })

  it('returns null when there is nothing to restore', async () => {
    expect(await restoreDeletedFolder({ folders: [], notes: [] })).toBeNull()
  })
})
