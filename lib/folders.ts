import { supabase } from './supabase'
import { emitDataChanged } from './offline/events'
import { createOfflineId, getCurrentUserId } from './offline/identity'
import { NoteSyncError } from './offline/errors'
import {
  enqueueMutation,
  getMutation,
  hasPendingDelete,
  hasPendingMutation,
  listOutbox,
  loadPendingState,
  removeMutation,
} from './offline/queue'
import { flushOutbox, notifySyncState } from './offline/sync'
import {
  getAllRows,
  getMeta,
  getRow,
  mutateRow,
  putRow,
  putRows,
  deleteRow,
  setMeta,
} from './offline/storage'

export interface Folder {
  id: string
  user_id: string
  name: string
  parent_id: string | null
  project_id: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface CreateFolderInput {
  name: string
  parent_id?: string | null
  project_id?: string | null
  position?: number
}

export interface UpdateFolderInput {
  name?: string
  parent_id?: string | null
  project_id?: string | null
  position?: number
}

export interface FolderQueryOptions {
  limit?: number
  offset?: number
}

type CachedFolder = Folder & {
  /** Last `updated_at` confirmed by the server (the DB trigger rewrites it). */
  __serverUpdatedAt?: string
}

type CachedNoteRow = {
  id: string
  user_id: string
  updated_at: string
  folder_id: string | null
  project_id: string | null
  __serverUpdatedAt?: string
}

/** Strip cache-only fields before a folder leaves the data layer. */
function toFolder(row: CachedFolder): Folder {
  const { __serverUpdatedAt: _serverUpdatedAt, ...folder } = row
  return folder
}

/** Newest of two ISO-8601 timestamps (undefined-safe). */
function newestTimestamp(a?: string, b?: string): string | undefined {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

const FOLDER_COLUMNS =
  'id,user_id,name,parent_id,project_id,position,created_at,updated_at'
const REFRESH_TTL_MS = 15_000

const lastRefresh = new Map<string, number>()

/** Serializes folder saves so overlapping writes can't race the conflict guard. */
const folderWriteChains = new Map<string, Promise<unknown>>()

function withFolderWriteLock<T>(folderId: string, task: () => Promise<T>): Promise<T> {
  const previous = folderWriteChains.get(folderId) ?? Promise.resolve()
  const run = previous.then(task, task)
  const guard = run.then(
    () => undefined,
    () => undefined
  )
  folderWriteChains.set(folderId, guard)
  void guard.finally(() => {
    if (folderWriteChains.get(folderId) === guard) folderWriteChains.delete(folderId)
  })
  return run
}

function shouldRefresh(key: string): boolean {
  const now = Date.now()
  const previous = lastRefresh.get(key) ?? 0
  if (now - previous < REFRESH_TTL_MS) return false
  lastRefresh.set(key, now)
  return true
}

function metaKey(userId: string | null): string {
  return `folders.syncedAt:${userId ?? 'anonymous'}`
}

function applyPagination<T>(rows: T[], options?: FolderQueryOptions): T[] {
  const offset = options?.offset ?? 0
  if (options?.limit === undefined) return rows.slice(offset)
  return rows.slice(offset, offset + options.limit)
}

async function readCachedFolders(userId: string | null): Promise<CachedFolder[]> {
  await loadPendingState()
  const rows = await getAllRows<CachedFolder>('folders')
  return userId ? rows.filter((row) => row.user_id === userId) : rows
}

async function mergeFolderRows(rows: CachedFolder[], userId: string | null): Promise<boolean> {
  if (rows.length === 0) return false
  const cached = await readCachedFolders(userId)
  const cachedById = new Map(cached.map((row) => [row.id, row]))
  const changed: CachedFolder[] = []

  for (const incoming of rows) {
    if (hasPendingMutation('folders', incoming.id)) continue
    const existing = cachedById.get(incoming.id)

    // Ignore a stale fetch that lost the race with a newer save. Only compare
    // against server-confirmed timestamps (a legacy row without one is accepted
    // so the marker can be recorded).
    if (existing) {
      const newestKnown = existing.__serverUpdatedAt
      if (
        newestKnown &&
        typeof incoming.updated_at === 'string' &&
        incoming.updated_at < newestKnown
      ) {
        continue
      }
    }
    if (
      !existing ||
      existing.name !== incoming.name ||
      existing.parent_id !== incoming.parent_id ||
      existing.project_id !== incoming.project_id ||
      existing.position !== incoming.position ||
      existing.updated_at !== incoming.updated_at ||
      existing.__serverUpdatedAt !== incoming.updated_at
    ) {
      changed.push({ ...existing, ...incoming, __serverUpdatedAt: incoming.updated_at })
    }
  }

  if (changed.length > 0) await putRows('folders', changed)
  return changed.length > 0
}

async function reconcileMissingFolders(
  remoteIds: Set<string>,
  userId: string | null
): Promise<boolean> {
  const cached = await readCachedFolders(userId)
  const missing = cached.filter(
    (row) => !remoteIds.has(row.id) && !hasPendingMutation('folders', row.id)
  )
  for (const row of missing) await deleteRow('folders', row.id)
  return missing.length > 0
}

async function fetchFoldersFromNetwork(): Promise<CachedFolder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select(FOLDER_COLUMNS)
    .order('position', { ascending: true })
    .limit(5000)
  if (error) throw error
  return (data ?? []) as unknown as CachedFolder[]
}

async function refreshFolders(userId: string | null): Promise<void> {
  try {
    const remote = await fetchFoldersFromNetwork()
    const changed = await mergeFolderRows(remote, userId)
    const reconciled = await reconcileMissingFolders(
      new Set(remote.map((row) => row.id)),
      userId
    )
    await setMeta(metaKey(userId), new Date().toISOString())
    if (changed || reconciled) emitDataChanged('folders')
  } catch {
    // Keep serving cache while offline.
  }
}

/** Fetch all folders for the current user (cache-first). */
export async function getFolders(options?: FolderQueryOptions): Promise<Folder[]> {
  const userId = await getCurrentUserId()
  const marker = await getMeta<string>(metaKey(userId))
  const cached = await readCachedFolders(userId)

  if (marker) {
    if (shouldRefresh(`folders:${userId ?? 'anonymous'}`)) {
      void refreshFolders(userId)
    }
    return applyPagination(
      cached.map(toFolder).slice().sort((a, b) => a.position - b.position),
      options
    )
  }

  try {
    const remote = await fetchFoldersFromNetwork()
    const changed = await mergeFolderRows(remote, userId)
    const reconciled = await reconcileMissingFolders(
      new Set(remote.map((row) => row.id)),
      userId
    )
    await setMeta(metaKey(userId), new Date().toISOString())
    if (changed || reconciled) emitDataChanged('folders')
    const merged = await readCachedFolders(userId)
    return applyPagination(
      merged.map(toFolder).slice().sort((a, b) => a.position - b.position),
      options
    )
  } catch (error) {
    if (cached.length > 0) {
      return applyPagination(
        cached.map(toFolder).slice().sort((a, b) => a.position - b.position),
        options
      )
    }
    throw error
  }
}

/** Fetch root-level folders (no parent). */
export async function getRootFolders(): Promise<Folder[]> {
  const folders = await getFolders()
  return folders.filter((folder) => folder.parent_id === null)
}

/** Fetch subfolders of a specific folder. */
export async function getSubfolders(parentId: string): Promise<Folder[]> {
  const folders = await getFolders()
  return folders.filter((folder) => folder.parent_id === parentId)
}

/** Get a single folder by ID. */
export async function getFolder(id: string): Promise<Folder | null> {
  const cached = await getRow<CachedFolder>('folders', id)
  if (cached) return toFolder(cached)

  const { data, error } = await supabase
    .from('folders')
    .select(FOLDER_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  await mergeFolderRows([data as CachedFolder], data.user_id)
  return data as CachedFolder
}

async function nextPositionInCache(
  parentId: string | null,
  projectId: string | null,
  userId: string | null
): Promise<number> {
  const folders = await readCachedFolders(userId)
  const siblings = folders.filter(
    (folder) =>
      (folder.parent_id ?? null) === parentId && (folder.project_id ?? null) === projectId
  )
  if (siblings.length === 0) return 1
  return Math.max(...siblings.map((folder) => folder.position ?? 0)) + 1
}

async function flushEntry(entryId: string, timeoutMs = 4000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })

  const result = await Promise.race([flushOutbox(entryId), timeout])
  if (timer) clearTimeout(timer)
  if (result === 'timeout') return

  const entry = await getMutation(entryId)
  if (entry?.status === 'failed') {
    throw new NoteSyncError(entry.recordId, entry.lastError ?? 'Could not sync this folder.')
  }
}

/** Create a folder locally, then queue it for insertion. */
export async function createFolder(input: CreateFolderInput): Promise<Folder> {
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')

  const parentId = input.parent_id ?? null
  const projectId = input.project_id ?? null
  const position =
    input.position ?? (await nextPositionInCache(parentId, projectId, userId))
  const now = new Date().toISOString()

  const folder: Folder = {
    id: createOfflineId('folder'),
    user_id: userId,
    name: input.name,
    parent_id: parentId,
    project_id: projectId,
    position,
    created_at: now,
    updated_at: now,
  }

  await putRow('folders', folder)
  emitDataChanged('folders', folder.id)

  const entry = await enqueueMutation({
    table: 'folders',
    operation: 'insert',
    recordId: folder.id,
    userId,
    payload: { ...folder },
  })

  void notifySyncState()
  if (entry) await flushEntry(entry.id)

  const stored = await getRow<CachedFolder>('folders', folder.id)
  return stored ? toFolder(stored) : folder
}

/**
 * Update a folder optimistically with an `updated_at` conflict guard. The
 * cache+enqueue phase is serialized per folder and uses the last
 * server-confirmed timestamp as the guard base (the DB trigger rewrites
 * `updated_at`); the flush happens outside the lock.
 */
export function updateFolder(id: string, input: UpdateFolderInput): Promise<Folder> {
  const prepared = withFolderWriteLock(id, () => prepareFolderUpdate(id, input))
  return prepared.then(async ({ optimistic, entry }) => {
    void notifySyncState()
    if (entry) await flushEntry(entry.id)
    const stored = await getRow<CachedFolder>('folders', id)
    return stored ? toFolder(stored) : optimistic
  })
}

interface PreparedFolderUpdate {
  optimistic: Folder
  entry: Awaited<ReturnType<typeof enqueueMutation>>
}

async function prepareFolderUpdate(
  id: string,
  input: UpdateFolderInput
): Promise<PreparedFolderUpdate> {
  if (hasPendingDelete('folders', id)) {
    throw new Error('This folder is being deleted.')
  }

  let cached = await getRow<CachedFolder>('folders', id)

  if (!cached) {
    const remote = await getFolder(id)
    if (!remote) throw new Error('Folder not found')
    // Re-read so the server-confirmed timestamp marker is available.
    cached = (await getRow<CachedFolder>('folders', id)) ?? { ...remote }
  }

  const now = new Date().toISOString()
  const optimistic: Folder = { ...toFolder(cached), ...input, updated_at: now }

  const storedAfterWrite = await mutateRow<CachedFolder>('folders', id, (current) => {
    const serverUpdatedAt = newestTimestamp(current?.__serverUpdatedAt, cached.__serverUpdatedAt)
    return {
      ...optimistic,
      ...(serverUpdatedAt ? { __serverUpdatedAt: serverUpdatedAt } : {}),
    }
  })
  emitDataChanged('folders', id)

  const entry = await enqueueMutation({
    table: 'folders',
    operation: 'update',
    recordId: id,
    userId: cached.user_id ?? (await getCurrentUserId()),
    payload: { ...input, updated_at: now },
    // Guard against the last server version, not the optimistic local clock.
    baseUpdatedAt:
      storedAfterWrite?.__serverUpdatedAt ?? cached.__serverUpdatedAt ?? cached.updated_at,
  })

  return { optimistic, entry }
}

async function collectDescendantIds(folderId: string, folders: Folder[]): Promise<Set<string>> {
  const ids = new Set<string>([folderId])
  let added = true
  while (added) {
    added = false
    for (const folder of folders) {
      if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
        ids.add(folder.id)
        added = true
      }
    }
  }
  return ids
}

/** Delete a folder locally and queue the remote deletion. */
export async function deleteFolder(id: string): Promise<void> {
  const userId = await getCurrentUserId()
  const folders = await readCachedFolders(userId)
  const folder = folders.find((entry) => entry.id === id)
  const ids = await collectDescendantIds(id, folders)

  for (const folderId of ids) {
    await deleteRow('folders', folderId)
  }

  // Mirror the database cascade for notes that live in the removed folders.
  const notes = await getAllRows<CachedNoteRow>('notes')
  const removedNoteIds = new Set<string>()
  for (const note of notes) {
    if (note.folder_id && ids.has(note.folder_id)) {
      removedNoteIds.add(note.id)
      await deleteRow('notes', note.id)
    }
  }

  // Drop queued edits for local rows that the deletion just removed.
  const queued = await listOutbox()
  for (const mutation of queued) {
    if (mutation.table === 'notes' && removedNoteIds.has(mutation.recordId)) {
      await removeMutation(mutation.id, mutation.table, mutation.recordId)
    }
    if (
      mutation.table === 'folders' &&
      ids.has(mutation.recordId) &&
      mutation.recordId !== id
    ) {
      await removeMutation(mutation.id, mutation.table, mutation.recordId)
    }
  }

  emitDataChanged('folders', id)

  const entry = await enqueueMutation({
    table: 'folders',
    operation: 'delete',
    recordId: id,
    userId: folder?.user_id ?? userId,
    payload: {},
  })

  if (entry) await flushEntry(entry.id)
  void notifySyncState()
}

/** Check whether a folder is a descendant of another folder. */
async function isDescendantOf(
  potentialDescendantId: string,
  potentialAncestorId: string
): Promise<boolean> {
  const userId = await getCurrentUserId()
  let folders = await readCachedFolders(userId)

  if (folders.length === 0) {
    try {
      folders = await fetchFoldersFromNetwork()
    } catch {
      return false
    }
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  let currentId: string | null = potentialDescendantId
  const visited = new Set<string>()

  while (currentId) {
    if (visited.has(currentId)) {
      console.warn('Circular reference detected in folder hierarchy')
      return true
    }
    visited.add(currentId)
    if (currentId === potentialAncestorId) return true
    currentId = byId.get(currentId)?.parent_id ?? null
  }

  return false
}

/**
 * Move a folder to a new parent. The folder and its notes are updated in the
 * local cache immediately and queued for sync.
 */
export async function moveFolder(
  folderId: string,
  newParentId: string | null,
  newPosition?: number
): Promise<Folder> {
  if (folderId === newParentId) {
    throw new Error('Cannot move a folder into itself')
  }

  if (newParentId !== null && (await isDescendantOf(newParentId, folderId))) {
    throw new Error('Cannot move a folder into one of its subfolders')
  }

  const userId = await getCurrentUserId()
  const folders = await readCachedFolders(userId)
  const current = folders.find((folder) => folder.id === folderId)

  let targetProjectId: string | null = null
  if (newParentId) {
    targetProjectId = folders.find((folder) => folder.id === newParentId)?.project_id ?? null
  } else {
    targetProjectId = current?.project_id ?? null
  }

  const position =
    newPosition ??
    (await nextPositionInCache(newParentId, targetProjectId, userId))

  const updated = await updateFolder(folderId, {
    parent_id: newParentId,
    position,
    project_id: targetProjectId,
  })

  // Keep folder-project-note consistency, just like the previous server-side
  // batch update, but now through the offline queue.
  const now = new Date().toISOString()
  const notes = (await getAllRows<CachedNoteRow>('notes')).filter(
    (note) => note.folder_id === folderId
  )

  for (const note of notes) {
    const optimistic = { ...note, project_id: targetProjectId, updated_at: now }
    await putRow('notes', optimistic)
    emitDataChanged('notes', note.id)
    await enqueueMutation({
      table: 'notes',
      operation: 'update',
      recordId: note.id,
      userId: note.user_id ?? userId,
      payload: { project_id: targetProjectId, updated_at: now },
      // Use the server-confirmed timestamp when the note was never edited
      // locally; a queued note update keeps its own (older) base.
      baseUpdatedAt: note.__serverUpdatedAt ?? note.updated_at,
    })
  }

  if (notes.length > 0) void flushOutbox()

  return updated
}

/** Get folder breadcrumb path (from root to folder). */
export async function getFolderPath(folderId: string): Promise<Folder[]> {
  const folders = await getFolders()
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: Folder[] = []
  let currentId: string | null = folderId
  const visited = new Set<string>()

  while (currentId) {
    if (visited.has(currentId)) break
    visited.add(currentId)
    const folder = byId.get(currentId)
    if (!folder) break
    path.unshift(folder)
    currentId = folder.parent_id
  }

  return path
}

/** Build a nested folder tree structure. */
export function buildFolderTree(folders: Folder[]): FolderNode[] {
  const folderMap = new Map<string, FolderNode>()
  const rootFolders: FolderNode[] = []

  folders.forEach((folder) => {
    folderMap.set(folder.id, {
      ...folder,
      children: [],
      expanded: false,
    })
  })

  folders.forEach((folder) => {
    const node = folderMap.get(folder.id)!
    if (folder.parent_id) {
      const parent = folderMap.get(folder.parent_id)
      if (parent) parent.children.push(node)
    } else {
      rootFolders.push(node)
    }
  })

  return rootFolders
}

export interface FolderNode extends Folder {
  children: FolderNode[]
  expanded: boolean
}

/** Apply a realtime row to the folder cache, preferring pending local edits. */
export async function applyRealtimeFolder(row: CachedFolder | null, deletedId?: string): Promise<void> {
  await loadPendingState()
  if (deletedId) {
    if (hasPendingMutation('folders', deletedId)) return
    await deleteRow('folders', deletedId)
    emitDataChanged('folders', deletedId)
    return
  }

  if (!row || typeof row.id !== 'string') return
  if (hasPendingMutation('folders', row.id)) return

  const existing = await getRow<CachedFolder>('folders', row.id)
  // Realtime echoes can arrive out of order; keep the newest server version.
  if (
    existing?.__serverUpdatedAt &&
    typeof row.updated_at === 'string' &&
    row.updated_at < existing.__serverUpdatedAt
  ) {
    return
  }
  await putRow('folders', {
    ...existing,
    ...row,
    ...(typeof row.updated_at === 'string' ? { __serverUpdatedAt: row.updated_at } : {}),
  })
  emitDataChanged('folders', row.id)
}

/** Subscribe to real-time changes for folders. */
export function subscribeToFolders(
  userId: string,
  callback: (payload: unknown) => void
) {
  const channel = supabase
    .channel('folders-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'folders',
        filter: `user_id=eq.${userId}`,
      },
      callback
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/** Reorder folders within the same parent. */
export async function reorderFolders(
  folderId: string,
  newPosition: number,
  parentId: string | null
): Promise<void> {
  const userId = await getCurrentUserId()
  const folders = await readCachedFolders(userId)
  const siblings = folders
    .filter((folder) => (folder.parent_id ?? null) === parentId)
    .sort((a, b) => a.position - b.position)

  if (siblings.length === 0) return

  const now = new Date().toISOString()
  const updates = siblings.map((sibling, index) => {
    let position: number
    if (sibling.id === folderId) position = newPosition
    else if (index >= newPosition) position = index + 1
    else position = index
    return { sibling, position }
  })

  for (const { sibling, position } of updates) {
    if (sibling.position === position) continue
    // Re-read and write under the per-folder lock so a concurrent rename is
    // not clobbered by the reorder snapshot.
    await withFolderWriteLock(sibling.id, async () => {
      const latest = (await getRow<CachedFolder>('folders', sibling.id)) ?? sibling
      const optimistic: Folder = { ...toFolder(latest), position, updated_at: now }
      await putRow('folders', {
        ...optimistic,
        __serverUpdatedAt: latest.__serverUpdatedAt,
      })
      await enqueueMutation({
        table: 'folders',
        operation: 'update',
        recordId: sibling.id,
        userId: latest.user_id ?? userId,
        payload: { position, updated_at: now },
        baseUpdatedAt: latest.__serverUpdatedAt ?? latest.updated_at,
      })
    })
  }

  emitDataChanged('folders', folderId)
  void notifySyncState()
  void flushOutbox()
}

/** Test helper: reset refresh throttles between tests. */
export function __resetFoldersOfflineForTests(): void {
  lastRefresh.clear()
  folderWriteChains.clear()
}
