import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

const now = '2026-01-01T10:00:00.000Z'

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    title: 'A',
    content: '<p>A body</p>',
    created_at: now,
    updated_at: now,
    user_id: 'user-1',
    folder_id: null,
    project_id: null,
    position: 1,
    note_type: 'rich-text',
    ...overrides,
  }
}

describe('notes lib', () => {
  let notesLib: typeof import('../lib/notes')

  beforeEach(async () => {
    vi.resetModules()
    notesLib = await import('../lib/notes')
    const storage = await import('../lib/offline/storage')
    storage.__resetOfflineStorageForTests()
    notesLib.__resetNotesOfflineForTests()

    const s = (globalThis as any).__supabase_mock
    s.__resetMockState()
    s.__mockState.notes = [
      makeNote({ id: '1', title: 'A', position: 1 }),
      makeNote({ id: '2', title: 'B', folder_id: 'folder-1', position: 1 }),
      makeNote({ id: '3', title: 'C', folder_id: 'folder-1', position: 2 }),
    ]
    s.__mockState.folders = [
      {
        id: 'folder-1',
        user_id: 'user-1',
        name: 'Folder',
        parent_id: null,
        project_id: null,
        position: 1,
        created_at: now,
        updated_at: now,
      },
    ]
    s.__mockState.user = { id: 'user-1' }
  })

  it('returns notes for null folder (root)', async () => {
    const notes = await notesLib.getNotesByFolder(null)
    expect(Array.isArray(notes)).toBe(true)
    expect(notes).toHaveLength(1)
    expect(notes[0].id).toBe('1')
  })

  it('returns summaries without note bodies for folder listings', async () => {
    const notes = await notesLib.getNotesByFolder('folder-1')
    expect(notes).toHaveLength(2)
    expect('content' in notes[0]).toBe(false)
  })

  it('createNote computes position when not provided', async () => {
    const newNote = await notesLib.createNote({ title: 'New', content: 'x' })
    expect(newNote).toBeDefined()
    expect(newNote.folder_id).toBe(null)
    expect(newNote.content).toBe('x')
  })

  it('createNote handles null folder_id correctly', async () => {
    const newNote = await notesLib.createNote({
      title: 'Root Note',
      content: 'In root folder',
      folder_id: null,
    })
    expect(newNote).toBeDefined()
    expect(newNote.folder_id).toBe(null)
  })

  it('createNote handles specific folder_id correctly', async () => {
    const newNote = await notesLib.createNote({
      title: 'Folder Note',
      content: 'In specific folder',
      folder_id: 'folder-1',
    })
    expect(newNote).toBeDefined()
    expect(newNote.folder_id).toBe('folder-1')
  })

  it('updateNote updates an existing note', async () => {
    const updated = await notesLib.updateNote('1', { title: 'Updated A' })
    expect(updated).toBeDefined()
    expect(updated.title).toBe('Updated A')
  })

  it('deleteNote removes a note', async () => {
    await notesLib.deleteNote('2')
    const all = await notesLib.getNotes()
    expect(Array.isArray(all)).toBe(true)
    expect(all.some(note => note.id === '2')).toBe(false)
  })

  it('searchNotes filters by query', async () => {
    const results = await notesLib.searchNotes('A')
    expect(Array.isArray(results)).toBe(true)
    expect(results.some(note => note.title === 'A')).toBe(true)
  })

  it('moveNote calculates position when moving to null folder', async () => {
    const moved = await notesLib.moveNote('2', null)
    expect(moved).toBeDefined()
    expect(moved.folder_id).toBe(null)
  })

  it('moveNote calculates position when moving to specific folder', async () => {
    const moved = await notesLib.moveNote('1', 'folder-1')
    expect(moved).toBeDefined()
    expect(moved.folder_id).toBe('folder-1')
  })

  it('paginates note summaries', async () => {
    const page = await notesLib.getNoteSummaries({ limit: 2, offset: 1 })
    expect(page).toHaveLength(2)
  })

  it('builds a lightweight backlink index without caching note bodies', async () => {
    const s = (globalThis as any).__supabase_mock
    const linkHtml = '<p>See also</p><div data-block-type="note-link" data-note-id="1"></div>'
    s.__mockState.notes = [
      makeNote({ id: '1', title: 'A' }),
      makeNote({ id: '2', title: 'Links to A', content: linkHtml }),
    ]

    const index = await notesLib.getNoteLinkIndex()
    expect(index).toHaveLength(1)
    expect(index[0]).toMatchObject({ id: '2', linkIds: ['1'] })

    // Fetching the index must not persist the fetched bodies in the note cache.
    const storage = await import('../lib/offline/storage')
    const cachedBody = await storage.getRow<{ __full?: boolean }>('notes', '2')
    expect(cachedBody?.__full).not.toBe(true)

    // The persisted index is served while offline.
    s.__mockState.offline = true
    const offlineIndex = await notesLib.getNoteLinkIndex()
    expect(offlineIndex).toHaveLength(1)
    expect(offlineIndex[0].linkIds).toEqual(['1'])
  })
})
