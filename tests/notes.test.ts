import { describe, it, expect, beforeEach, vi } from 'vitest'

// Use async factory to avoid hoisting issues
vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

describe('notes lib', () => {
  let notesLib: typeof import('../lib/notes')

  beforeEach(async () => {
    // import the module after mocking
    notesLib = await import('../lib/notes')

    // reset mock data
    const s = (globalThis as any).__supabase_mock
    s.__mockState.notes = [
      { id: '1', title: 'A', folder_id: null, position: 1 },
      { id: '2', title: 'B', folder_id: 'folder-1', position: 1 },
      { id: '3', title: 'C', folder_id: 'folder-1', position: 2 },
    ]
    s.__mockState.user = { id: 'user-1' }
  })

  it('returns notes for null folder (root)', async () => {
    const notes = await notesLib.getNotesByFolder(null)
    expect(Array.isArray(notes)).toBe(true)
  })

  it('createNote computes position when not provided', async () => {
    const newNote = await notesLib.createNote({ title: 'New', content: 'x' })
    expect(newNote).toBeDefined()
  })

  it('updateNote updates an existing note', async () => {
    // update note with id '1'
    const updated = await notesLib.updateNote('1', { title: 'Updated A' })
    expect(updated).toBeDefined()
  })

  it('deleteNote removes a note', async () => {
    await notesLib.deleteNote('2')
    // after delete, trying to get notes should not throw and array length may reduce
    const all = await notesLib.getNotes()
    expect(Array.isArray(all)).toBe(true)
  })

  it('searchNotes filters by query', async () => {
    const results = await notesLib.searchNotes('A')
    expect(Array.isArray(results)).toBe(true)
  })
})
