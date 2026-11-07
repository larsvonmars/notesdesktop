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

  it('serializes overlapping saves when the DB trigger rewrites updated_at', async () => {
    await notes.getNote('note-1')
    // Production has a trigger that sets updated_at = now() server-side, so the
    // optimistic local timestamp can never be used as the conflict base.
    mockState().serverUpdatedAt = true

    const page2 = notes.updateNote('note-1', { title: 'Page 2' })
    const page3 = notes.updateNote('note-1', { title: 'Page 3' })
    const [first, second] = await Promise.all([page2, page3])

    // Both saves resolve against the latest cached copy (later edit wins).
    expect(first.title).toBe('Page 3')
    expect(second.title).toBe('Page 3')

    const state = await sync.getSyncState()
    expect(state.conflicts).toBe(0)
    expect(state.pending).toBe(0)
    expect(mockState().notes[0].title).toBe('Page 3')

    // A later save still matches the server-issued timestamp.
    await expect(notes.updateNote('note-1', { title: 'Page 4' })).resolves.toMatchObject({
      title: 'Page 4',
    })
    expect(mockState().notes[0].title).toBe('Page 4')
    expect((await sync.getSyncState()).conflicts).toBe(0)
  })

  it('re-sends an edit merged while the outbox mutation was in flight', async () => {
    await notes.getNote('note-1')
    mockState().serverUpdatedAt = true
    mockState().latencyMs = 60

    const save = notes.updateNote('note-1', { title: 'In flight' })
    // Let the flusher start its network request.
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Simulates a second window coalescing a newer edit into the same mutation
    // while the first payload is still in flight.
    await queue.enqueueMutation({
      table: 'notes',
      operation: 'update',
      recordId: 'note-1',
      userId: 'user-1',
      payload: { title: 'Merged while in flight' },
      baseUpdatedAt: BASE_TIME,
    })

    await save

    const state = await sync.getSyncState()
    expect(state.conflicts).toBe(0)
    expect(state.pending).toBe(0)
    expect(mockState().notes[0].title).toBe('Merged while in flight')
    expect(await queue.listOutbox()).toHaveLength(0)
  })

  it('turns an insert into an update when an edit lands while it is in flight', async () => {
    mockState().offline = true
    const created = await notes.createNote({ title: 'New note', content: 'v1' })

    mockState().offline = false
    mockState().serverUpdatedAt = true
    mockState().latencyMs = 60

    const flush = sync.flushOutbox()
    // Let the insert request start, then edit the note before it completes.
    await new Promise((resolve) => setTimeout(resolve, 20))
    const save = notes.updateNote(created.id, { content: 'v2' })
    await Promise.all([flush, save])

    const row = mockState().notes.find((note: any) => note.id === created.id)
    expect(row?.content).toBe('v2')
    expect(await queue.listOutbox()).toHaveLength(0)
    const state = await sync.getSyncState()
    expect(state.pending).toBe(0)
    expect(state.conflicts).toBe(0)
  })

  it('does not remove a mutation that changed mid-flight', async () => {
    const entry = await queue.enqueueMutation({
      table: 'notes',
      operation: 'update',
      recordId: 'note-1',
      userId: 'user-1',
      payload: { title: 'First' },
      baseUpdatedAt: BASE_TIME,
    })
    expect(entry?.revision).toBe(0)

    const merged = await queue.enqueueMutation({
      table: 'notes',
      operation: 'update',
      recordId: 'note-1',
      userId: 'user-1',
      payload: { title: 'Second' },
      baseUpdatedAt: BASE_TIME,
    })
    expect(merged?.id).toBe(entry?.id)
    expect(merged?.revision).toBe(1)

    expect(
      await queue.removeMutationIfUnchanged(entry!.id, 'notes', 'note-1', 0)
    ).toBe('changed')
    expect(await queue.listOutbox()).toHaveLength(1)

    expect(
      await queue.removeMutationIfUnchanged(entry!.id, 'notes', 'note-1', 1)
    ).toBe('removed')
    expect(await queue.listOutbox()).toHaveLength(0)
  })

  it('serializes overlapping folder renames without a false conflict', async () => {
    mockState().folders = [
      {
        id: 'folder-1',
        user_id: 'user-1',
        name: 'Alpha',
        parent_id: null,
        project_id: null,
        position: 1,
        created_at: BASE_TIME,
        updated_at: BASE_TIME,
      },
    ]
    mockState().serverUpdatedAt = true

    await folders.getFolders()
    const first = folders.updateFolder('folder-1', { name: 'Beta' })
    const second = folders.updateFolder('folder-1', { name: 'Gamma' })
    await Promise.all([first, second])

    expect(mockState().folders[0].name).toBe('Gamma')
    const state = await sync.getSyncState()
    expect(state.conflicts).toBe(0)
    expect(state.pending).toBe(0)
  })

  it('ignores a stale realtime echo older than the cached server row', async () => {
    await notes.getNote('note-1')
    mockState().serverUpdatedAt = true
    await notes.updateNote('note-1', { title: 'Latest' })

    const stale = makeNote({ title: 'Stale echo', updated_at: BASE_TIME })
    await notes.applyRealtimeNote(stale as never)

    expect((await notes.getNote('note-1'))?.title).toBe('Latest')
    expect((await sync.getSyncState()).pending).toBe(0)
  })

  it('does not clobber a genuine external edit when a newer local edit coalesced in flight', async () => {
    await notes.getNote('note-1')
    mockState().offline = true
    await notes.updateNote('note-1', { title: 'Local v1' })

    // Another device edits the row while our save is queued.
    mockState().offline = false
    mockState().serverUpdatedAt = true
    mockState().latencyMs = 60
    mockState().notes = [
      makeNote({ title: 'External edit', updated_at: '2026-01-02T10:00:00.000Z' }),
    ]

    const flush = sync.flushOutbox()
    await new Promise((resolve) => setTimeout(resolve, 20))
    // A newer local edit coalesces into the in-flight mutation…
    const save = notes.updateNote('note-1', { title: 'Local v2' }).catch((error) => error)
    await Promise.all([flush, save])

    // …but the external edit must surface as a conflict, not be overwritten.
    expect(mockState().notes[0].title).toBe('External edit')
    expect((await sync.getSyncState()).conflicts).toBe(1)
    // The local copy is kept for the user to resolve.
    expect((await notes.getNote('note-1'))?.title).toBe('Local v2')
  })

  it('records the server row when our own write is recognised after a zero-row guard', async () => {
    await notes.getNote('note-1')
    mockState().offline = true
    await notes.updateNote('note-1', { title: 'Same edit' })

    // Another window applied exactly this payload; the server timestamp moved.
    mockState().offline = false
    mockState().notes = [
      makeNote({ title: 'Same edit', updated_at: '2026-01-02T10:00:00.000Z' }),
    ]

    const result = await sync.flushOutbox()
    expect(result.conflicts).toHaveLength(0)
    expect((await sync.getSyncState()).conflicts).toBe(0)

    // The next save must use the refreshed base and not false-conflict.
    await expect(notes.updateNote('note-1', { title: 'Next edit' })).resolves.toMatchObject({
      title: 'Next edit',
    })
    expect(mockState().notes[0].title).toBe('Next edit')
    expect((await sync.getSyncState()).conflicts).toBe(0)
  })

  it('upgrades the conflict base to the freshest stored server timestamp', async () => {
    await notes.getNote('note-1')
    const cached = await storage.getRow<Record<string, unknown>>('notes', 'note-1')
    await storage.putRow('notes', {
      ...cached,
      __serverUpdatedAt: '2026-01-05T00:00:00.000Z',
    } as unknown as { id: string })

    const entry = await queue.enqueueMutation({
      table: 'notes',
      operation: 'update',
      recordId: 'note-1',
      userId: 'user-1',
      payload: { title: 'Stale base supplied' },
      baseUpdatedAt: BASE_TIME,
    })

    expect(entry?.baseUpdatedAt).toBe('2026-01-05T00:00:00.000Z')
  })

  it('does not resurrect a note deleted while its update was in flight', async () => {
    await notes.getNote('note-1')
    mockState().serverUpdatedAt = true
    mockState().latencyMs = 60

    const save = notes.updateNote('note-1', { title: 'In flight then deleted' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    await notes.deleteNote('note-1')
    await save

    expect(await notes.getNote('note-1')).toBeNull()

    await sync.flushOutbox()
    expect(mockState().notes.find((note: any) => note.id === 'note-1')).toBeUndefined()
    expect((await sync.getSyncState()).conflicts).toBe(0)
  })

  it('queues a delete for a note created offline so no ghost row remains', async () => {
    mockState().offline = true
    const created = await notes.createNote({ title: 'Temp', content: 'x' })
    await notes.deleteNote(created.id)

    mockState().offline = false
    await sync.flushOutbox()

    expect(mockState().notes.find((note: any) => note.id === created.id)).toBeUndefined()
    expect(await queue.listOutbox()).toHaveLength(0)
  })

  it('drops a late update once the record has a queued deletion', async () => {
    await notes.getNote('note-1')
    mockState().offline = true
    await notes.deleteNote('note-1')

    const late = await queue.enqueueMutation({
      table: 'notes',
      operation: 'update',
      recordId: 'note-1',
      userId: 'user-1',
      payload: { title: 'Late' },
      baseUpdatedAt: BASE_TIME,
    })
    expect(late).toBeNull()
  })

  it('restores a remote-deleted row on keep-local without cache-only columns', async () => {
    await notes.getNote('note-1')
    mockState().offline = true
    await notes.updateNote('note-1', { title: 'Local keep' })

    // The row was deleted on another device while we were offline.
    mockState().offline = false
    mockState().notes = []
    const result = await sync.flushOutbox()
    expect(result.conflicts).toHaveLength(1)

    const conflicts = await queue.getConflictedMutations()
    await sync.resolveConflict(conflicts[0].id, 'keep-local')

    const row = mockState().notes.find((note: any) => note.id === 'note-1')
    expect(row?.title).toBe('Local keep')
    // Cache-only bookkeeping columns must never reach PostgREST.
    expect(Object.keys(row ?? {}).some((key) => key.startsWith('__'))).toBe(false)
    expect((await notes.getNote('note-1'))?.title).toBe('Local keep')
    expect((await sync.getSyncState()).conflicts).toBe(0)
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
