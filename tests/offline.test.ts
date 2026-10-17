import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

const BASE_TIME = '2026-01-01T10:00:00.000Z'

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    title: 'Original',
    content: '<p>Original body</p>',
    created_at: BASE_TIME,
    updated_at: BASE_TIME,
    user_id: 'user-1',
    folder_id: null,
    project_id: null,
    position: 1,
    note_type: 'rich-text',
    ...overrides,
  }
}

function mockState() {
  return (globalThis as any).__supabase_mock.__mockState
}

describe('offline-first notes', () => {
  let notes: typeof import('../lib/notes')
  let folders: typeof import('../lib/folders')
  let queue: typeof import('../lib/offline/queue')
  let sync: typeof import('../lib/offline/sync')
  let storage: typeof import('../lib/offline/storage')

  beforeEach(async () => {
    vi.resetModules()
    notes = await import('../lib/notes')
    folders = await import('../lib/folders')
    queue = await import('../lib/offline/queue')
    sync = await import('../lib/offline/sync')
    storage = await import('../lib/offline/storage')

    storage.__resetOfflineStorageForTests()
    queue.__resetOfflineQueueForTests()
    sync.__resetOfflineSyncForTests()
    notes.__resetNotesOfflineForTests()
    folders.__resetFoldersOfflineForTests()

    const mock = (globalThis as any).__supabase_mock
    mock.__resetMockState()
    mock.__mockState.notes = [makeNote()]
    mock.__mockState.user = { id: 'user-1' }
  })

  it('serves the local cache when the network is unavailable', async () => {
    const first = await notes.getNotesByFolder(null)
    expect(first).toHaveLength(1)

    mockState().offline = true
    const cached = await notes.getNotesByFolder(null)
    expect(cached).toHaveLength(1)
    expect(cached[0].title).toBe('Original')
  })

  it('writes updates to the cache and outbox while offline', async () => {
    await notes.getNote('note-1')

    mockState().offline = true
    const optimistic = await notes.updateNote('note-1', { title: 'Local edit' })

    expect(optimistic.title).toBe('Local edit')
    expect((await notes.getNote('note-1'))?.title).toBe('Local edit')

    const state = await sync.getSyncState()
    expect(state.pending).toBe(1)
    expect(state.failed).toBe(0)
  })

  it('flushes queued updates when connectivity returns', async () => {
    await notes.getNote('note-1')
    mockState().offline = true
    await notes.updateNote('note-1', { title: 'Synced later' })

    mockState().offline = false
    const result = await sync.flushOutbox()

    expect(result.pending).toBe(0)
    expect(mockState().notes[0].title).toBe('Synced later')
  })

  it('keeps pending local edits when the cache state is reloaded after a restart', async () => {
    await notes.getNotesByFolder(null)
    mockState().offline = true
    await notes.updateNote('note-1', { title: 'Still local' })

    // Simulate a fresh page load: module-level queue bookkeeping is empty but
    // the IndexedDB outbox still contains the pending mutation.
    queue.__resetOfflineQueueForTests()
    mockState().offline = false

    await notes.getNoteSummaries()
    expect((await notes.getNote('note-1'))?.title).toBe('Still local')
  })

  it('coalesces a burst of edits into one queued mutation', async () => {
    await notes.getNote('note-1')
    mockState().offline = true

    await notes.updateNote('note-1', { title: 'First' })
    await notes.updateNote('note-1', { title: 'Second' })

    const entries = await queue.listOutbox()
    expect(entries).toHaveLength(1)
    expect(entries[0].payload.title).toBe('Second')
    expect(entries[0].baseUpdatedAt).toBe(BASE_TIME)
  })

  it('detects a concurrent remote edit instead of overwriting it', async () => {
    await notes.getNote('note-1')
    mockState().offline = true
    await notes.updateNote('note-1', { title: 'My offline edit' })

    // Another device wrote while we were offline.
    mockState().offline = false
    mockState().notes = [
      makeNote({ title: 'Remote edit', updated_at: '2026-01-02T10:00:00.000Z' }),
    ]

    const result = await sync.flushOutbox()
    expect(result.conflicts).toHaveLength(1)

    const state = await sync.getSyncState()
    expect(state.conflicts).toBe(1)

    // Local content is preserved for the user to decide.
    expect((await notes.getNote('note-1'))?.title).toBe('My offline edit')

    const conflicts = await queue.getConflictedMutations()
    await sync.resolveConflict(conflicts[0].id, 'use-remote')

    expect((await notes.getNote('note-1'))?.title).toBe('Remote edit')
    expect((await sync.getSyncState()).conflicts).toBe(0)
  })

  it('creates notes offline and coalesces later edits into the insert', async () => {
    mockState().offline = true

    const created = await notes.createNote({ title: 'Offline note', content: 'v1' })
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )

    await notes.updateNote(created.id, { content: 'v2' })

    const entries = await queue.listOutbox()
    expect(entries).toHaveLength(1)
    expect(entries[0].operation).toBe('insert')
    expect(entries[0].payload.content).toBe('v2')

    mockState().offline = false
    await sync.flushOutbox()

    const row = mockState().notes.find((note: any) => note.id === created.id)
    expect(row?.content).toBe('v2')
    expect((await sync.getSyncState()).pending).toBe(0)
  })

  it('creates folders offline and syncs them later', async () => {
    mockState().offline = true
    const created = await folders.createFolder({ name: 'Offline folder' })
    expect(created.name).toBe('Offline folder')

    expect((await folders.getFolders()).some(folder => folder.id === created.id)).toBe(true)
    expect((await sync.getSyncState()).pending).toBe(1)

    mockState().offline = false
    await sync.flushOutbox()

    expect(mockState().folders.some((folder: any) => folder.id === created.id)).toBe(true)
    expect((await sync.getSyncState()).pending).toBe(0)
  })

  it('propagates a failed mutation as a sync error for manual saves', async () => {
    await notes.getNote('note-1')
    mockState().nextError = { code: '42501', message: 'permission denied' }

    await expect(notes.updateNote('note-1', { title: 'Denied' })).rejects.toThrow(
      /permission denied|Could not sync/i
    )
  })
})
