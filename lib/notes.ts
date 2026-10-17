import { supabase } from './supabase'
import { emitDataChanged } from './offline/events'
import { NoteConflictError, NoteSyncError } from './offline/errors'
import { createOfflineId, getCurrentUserId } from './offline/identity'
import {
  enqueueMutation,
  getMutation,
  hasPendingMutation,
  loadPendingState,
} from './offline/queue'
import { flushOutbox, notifySyncState } from './offline/sync'
import {
  getAllRows,
  getMeta,
  getRow,
  putRow,
  putRows,
  deleteRow,
  setMeta,
} from './offline/storage'

export type NoteType = 'rich-text' | 'drawing' | 'mindmap' | 'bullet-journal' | 'data-sheet' | 'pdf-annotation'

/** Metadata for a note. Bodies are fetched lazily with {@link getNote}. */
export interface NoteSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
  user_id: string
  folder_id: string | null
  project_id: string | null
  position: number
  note_type: NoteType
}

export interface Note extends NoteSummary {
  content: string
}

export interface CreateNoteInput {
  title: string
  content: string
  folder_id?: string | null
  project_id?: string | null
  position?: number
  note_type?: NoteType
}

export interface UpdateNoteInput {
  title?: string
  content?: string
  folder_id?: string | null
  project_id?: string | null
  position?: number
  note_type?: NoteType
}

export type NoteAttachmentKind = 'image' | 'file'
export type NoteAttachmentSourceType = 'insert' | 'paste' | 'drop' | 'migration'

export interface NoteAttachment {
  id: string
  note_id: string | null
  user_id: string
  kind: NoteAttachmentKind
  storage_path: string
  url: string | null
  mime_type: string | null
  size_bytes: number | null
  width: number | null
  height: number | null
  alt_text: string | null
  source_type: NoteAttachmentSourceType
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface CreateNoteAttachmentInput {
  note_id?: string | null
  kind: NoteAttachmentKind
  storage_path: string
  url?: string | null
  mime_type?: string | null
  size_bytes?: number | null
  width?: number | null
  height?: number | null
  alt_text?: string | null
  source_type?: NoteAttachmentSourceType
  metadata?: Record<string, unknown> | null
}

export interface UpdateNoteAttachmentInput {
  note_id?: string | null
  storage_path?: string
  url?: string | null
  mime_type?: string | null
  size_bytes?: number | null
  width?: number | null
  height?: number | null
  alt_text?: string | null
  source_type?: NoteAttachmentSourceType
  metadata?: Record<string, unknown> | null
}

export interface NoteQueryOptions {
  limit?: number
  offset?: number
}

export interface NoteLinkIndexEntry {
  id: string
  title: string
  folder_id: string | null
  note_type: NoteType
  content: string
}

export const NOTE_SUMMARY_COLUMNS =
  'id,title,created_at,updated_at,user_id,folder_id,project_id,position,note_type'
export const NOTE_FULL_COLUMNS = `${NOTE_SUMMARY_COLUMNS},content`

const DEFAULT_PAGE_SIZE = 500
const DEFAULT_SEARCH_LIMIT = 50
const MAX_SEARCH_LIMIT = 200
const REFRESH_TTL_MS = 15_000

type CachedNote = NoteSummary & {
  content?: string
  /** True when the cached row contains the full body. */
  __full?: boolean
}

type CachedFolder = {
  id: string
  user_id: string
  project_id: string | null
}

const lastRefresh = new Map<string, number>()

function shouldRefresh(key: string): boolean {
  const now = Date.now()
  const previous = lastRefresh.get(key) ?? 0
  if (now - previous < REFRESH_TTL_MS) return false
  lastRefresh.set(key, now)
  return true
}

function metaKey(kind: string, userId: string | null): string {
  return `${kind}:${userId ?? 'anonymous'}`
}

function toSummary(row: CachedNote): NoteSummary {
  const { content: _content, __full: _full, ...summary } = row
  return summary
}

function toNote(row: CachedNote): Note {
  return {
    ...toSummary(row),
    content: row.content ?? '',
  }
}

function sortSummaries<T extends NoteSummary>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

async function readCachedNotes(userId: string | null): Promise<CachedNote[]> {
  // Pending edits must be known before we decide whether remote rows may
  // overwrite the cache (important on the first render after a restart).
  await loadPendingState()
  const rows = await getAllRows<CachedNote>('notes')
  return userId ? rows.filter((row) => row.user_id === userId) : rows
}

async function readCachedFolders(userId: string | null): Promise<CachedFolder[]> {
  const rows = await getAllRows<CachedFolder>('folders')
  return userId ? rows.filter((row) => row.user_id === userId) : rows
}

async function getCachedNote(id: string): Promise<CachedNote | undefined> {
  return getRow<CachedNote>('notes', id)
}

interface MergeOptions {
  full: boolean
  userId: string | null
}

/**
 * Writes fetched rows into the cache without clobbering local edits that still
 * have pending outbox entries. Returns true when cached data actually changed.
 */
async function mergeNoteRows(rows: CachedNote[], options: MergeOptions): Promise<boolean> {
  if (rows.length === 0) return false

  const cached = await readCachedNotes(options.userId)
  const cachedById = new Map(cached.map((row) => [row.id, row]))
  const changed: CachedNote[] = []

  for (const incoming of rows) {
    if (hasPendingMutation('notes', incoming.id)) continue

    const existing = cachedById.get(incoming.id)
    if (!existing) {
      changed.push({ ...incoming, __full: options.full })
      continue
    }

    const merged: CachedNote = options.full
      ? { ...existing, ...incoming, __full: true }
      : {
          ...existing,
          ...incoming,
          content: existing.content,
          __full: existing.__full ?? false,
        }

    const isChanged =
      existing.updated_at !== merged.updated_at ||
      existing.title !== merged.title ||
      existing.folder_id !== merged.folder_id ||
      existing.project_id !== merged.project_id ||
      existing.position !== merged.position ||
      existing.note_type !== merged.note_type ||
      existing.__full !== merged.__full ||
      (options.full && existing.content !== merged.content)

    if (isChanged) changed.push(merged)
  }

  if (changed.length === 0) return false
  await putRows('notes', changed)
  return true
}

/**
 * Remove cached notes that no longer exist remotely. Only called after a
 * complete (untruncated) note sync so paged views cannot delete valid rows.
 */
async function reconcileMissingNotes(
  remoteIds: Set<string>,
  userId: string | null
): Promise<boolean> {
  if (remoteIds.size >= 5000) return false
  const cached = await readCachedNotes(userId)
  const missing = cached.filter(
    (row) => !remoteIds.has(row.id) && !hasPendingMutation('notes', row.id)
  )
  for (const row of missing) {
    await deleteRow('notes', row.id)
  }
  return missing.length > 0
}

async function putCachedNote(note: Note): Promise<void> {
  await putRow('notes', { ...note, __full: true })
}

function stripCacheFields(note: Note): Record<string, unknown> {
  const { ...rest } = note
  return rest
}

async function fetchNotesPageFromNetwork(options: {
  full: boolean
  limit: number
  offset: number
}): Promise<CachedNote[]> {
  const { data, error } = await supabase
    .from('notes')
    .select(options.full ? NOTE_FULL_COLUMNS : NOTE_SUMMARY_COLUMNS)
    .order('updated_at', { ascending: false })
    .range(options.offset, options.offset + options.limit - 1)

  if (error) throw error
  return (data ?? []) as unknown as CachedNote[]
}

async function fetchNoteFromNetwork(id: string): Promise<Note | null> {
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_FULL_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return (data as unknown as Note | null) ?? null
}

async function refreshFullNotes(userId: string | null): Promise<void> {
  try {
    const remote = await fetchNotesPageFromNetwork({ full: true, limit: 1000, offset: 0 })
    const changed = await mergeNoteRows(remote, { full: true, userId })
    await setMeta(metaKey('notes.fullSyncedAt', userId), new Date().toISOString())
    if (changed) emitDataChanged('notes')
  } catch {
    // Keep serving the cache while offline.
  }
}

async function fetchAllSummariesFromNetwork(limit = 5000): Promise<CachedNote[]> {
  const rows: CachedNote[] = []
  let offset = 0
  while (rows.length < limit) {
    const page = await fetchNotesPageFromNetwork({
      full: false,
      limit: Math.min(DEFAULT_PAGE_SIZE, limit - rows.length),
      offset,
    })
    rows.push(...page)
    if (page.length < DEFAULT_PAGE_SIZE) break
    offset += page.length
  }
  return rows
}

async function refreshSummaries(userId: string | null): Promise<void> {
  try {
    const remote = await fetchAllSummariesFromNetwork()
    const changed = await mergeNoteRows(remote, { full: false, userId })
    const reconciled = await reconcileMissingNotes(
      new Set(remote.map((row) => row.id)),
      userId
    )
    await setMeta(metaKey('notes.summarySyncedAt', userId), new Date().toISOString())
    if (changed || reconciled) emitDataChanged('notes')
  } catch {
    // Keep serving the cache while offline.
  }
}

function applyPagination<T>(rows: T[], options?: NoteQueryOptions): T[] {
  const offset = options?.offset ?? 0
  if (options?.limit === undefined) return rows.slice(offset)
  return rows.slice(offset, offset + options.limit)
}

/**
 * Fetch all notes, including bodies. Prefer {@link getNoteSummaries} and
 * {@link getNote} unless the full body of every note is really required.
 */
export async function getNotes(): Promise<Note[]> {
  const userId = await getCurrentUserId()
  const cached = await readCachedNotes(userId)
  const fullCached = cached.filter((row) => row.__full)
  const marker = await getMeta<string>(metaKey('notes.fullSyncedAt', userId))

  if (marker && fullCached.length > 0) {
    if (shouldRefresh(`full:${userId ?? 'anonymous'}`)) {
      void refreshFullNotes(userId)
    }
    return sortSummaries(fullCached).map(toNote)
  }

  try {
    const remote = await fetchAllSummariesFromNetwork()
    // Fetch bodies only for rows we did not already cache in full.
    const missingIds = remote
      .filter((row) => !cached.find((entry) => entry.id === row.id && entry.__full))
      .map((row) => row.id)
    const fullRows: CachedNote[] = []
    for (let index = 0; index < missingIds.length; index += 100) {
      const chunk = missingIds.slice(index, index + 100)
      const { data, error } = await supabase
        .from('notes')
        .select(NOTE_FULL_COLUMNS)
        .in('id', chunk)
      if (error) throw error
      fullRows.push(...((data ?? []) as unknown as CachedNote[]))
    }

    const metadataChanged = await mergeNoteRows(remote, { full: false, userId })
    const contentChanged = await mergeNoteRows(fullRows, { full: true, userId })
    const reconciled = await reconcileMissingNotes(
      new Set(remote.map((row) => row.id)),
      userId
    )
    await setMeta(metaKey('notes.fullSyncedAt', userId), new Date().toISOString())
    if (metadataChanged || contentChanged || reconciled) emitDataChanged('notes')

    const merged = await readCachedNotes(userId)
    return sortSummaries(merged.filter((row) => row.__full)).map(toNote)
  } catch (error) {
    // Offline: return whatever we have, including summary rows so lists still
    // render. Callers that need a body should use getNote(id).
    if (cached.length > 0) return sortSummaries(cached).map(toNote)
    throw error
  }
}

/** Paginated note metadata (no bodies). */
export async function getNoteSummaries(options?: NoteQueryOptions): Promise<NoteSummary[]> {
  const userId = await getCurrentUserId()
  const marker = await getMeta<string>(metaKey('notes.summarySyncedAt', userId))
  const cached = await readCachedNotes(userId)

  if (marker) {
    if (shouldRefresh(`summaries:${userId ?? 'anonymous'}`)) {
      void refreshSummaries(userId)
    }
    return applyPagination(sortSummaries(cached), options).map(toSummary)
  }

  try {
    const remote = await fetchAllSummariesFromNetwork()
    const changed = await mergeNoteRows(remote, { full: false, userId })
    const reconciled = await reconcileMissingNotes(
      new Set(remote.map((row) => row.id)),
      userId
    )
    await setMeta(metaKey('notes.summarySyncedAt', userId), new Date().toISOString())
    if (changed || reconciled) emitDataChanged('notes')
    const merged = await readCachedNotes(userId)
    return applyPagination(sortSummaries(merged), options).map(toSummary)
  } catch (error) {
    if (cached.length > 0) return applyPagination(sortSummaries(cached), options).map(toSummary)
    throw error
  }
}

/** Fetch every note summary (bounded) for workspace/AI listings. */
export async function getAllNoteSummaries(limit = 5000): Promise<NoteSummary[]> {
  return getNoteSummaries({ limit, offset: 0 })
}

/** Fetch a single note, including its body, from cache or the network. */
export async function getNote(id: string): Promise<Note | null> {
  const cached = await getCachedNote(id)

  if (cached?.__full) {
    if (shouldRefresh(`note:${id}`)) {
      void fetchNoteFromNetwork(id)
        .then(async (remote) => {
          if (hasPendingMutation('notes', id)) return
          if (!remote) {
            // Deleted on another device while this note was cached.
            await deleteRow('notes', id)
            emitDataChanged('notes', id)
            return
          }
          const changed = await mergeNoteRows([remote as CachedNote], { full: true, userId: remote.user_id })
          if (changed) emitDataChanged('notes', id)
        })
        .catch(() => {})
    }
    return toNote(cached)
  }

  const remote = await fetchNoteFromNetwork(id)
  if (!remote) return null

  const userId = remote.user_id
  await mergeNoteRows([remote as CachedNote], { full: true, userId })
  const fresh = await getCachedNote(id)
  return fresh ? toNote(fresh) : remote
}

/** Fetch full notes by ID in one request, using the cache when possible. */
export async function getNotesByIds(ids: string[]): Promise<Note[]> {
  if (ids.length === 0) return []
  const uniqueIds = Array.from(new Set(ids))
  const cached = await getAllRows<CachedNote>('notes')
  const cachedById = new Map(cached.map((row) => [row.id, row]))
  const missing = uniqueIds.filter((id) => !cachedById.get(id)?.__full)

  if (missing.length > 0) {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select(NOTE_FULL_COLUMNS)
        .in('id', missing)
      if (error) throw error
      const rows = (data ?? []) as unknown as CachedNote[]
      if (rows.length > 0) {
        await mergeNoteRows(rows, { full: true, userId: rows[0]?.user_id ?? null })
        for (const row of rows) cachedById.set(row.id, row)
      }
    } catch {
      // Offline: fall back to the partial cache below.
    }
  }

  return uniqueIds
    .map((id) => cachedById.get(id))
    .filter((row): row is CachedNote => !!row)
    .map(toNote)
}

/**
 * Content index for backlinks. Only rich-text rows are requested, and the
 * query is scoped to the columns the link parser needs.
 */
export async function getNoteLinkIndex(): Promise<NoteLinkIndexEntry[]> {
  const userId = await getCurrentUserId()
  const cached = (await readCachedNotes(userId)).filter(
    (row) => row.note_type === 'rich-text' && typeof row.content === 'string'
  )

  const toEntries = (rows: CachedNote[]): NoteLinkIndexEntry[] =>
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      folder_id: row.folder_id,
      note_type: row.note_type,
      content: row.content ?? '',
    }))

  const fetchIndex = async (): Promise<void> => {
    const { data, error } = await supabase
      .from('notes')
      .select(NOTE_FULL_COLUMNS)
      .eq('note_type', 'rich-text')
      .order('updated_at', { ascending: false })
      .limit(5000)
    if (error) throw error

    const rows = (data ?? []) as unknown as CachedNote[]
    const changed = await mergeNoteRows(rows, { full: true, userId })
    await setMeta(metaKey('notes.linkIndexSyncedAt', userId), new Date().toISOString())
    if (changed) emitDataChanged('notes')
  }

  const marker = await getMeta<string>(metaKey('notes.linkIndexSyncedAt', userId))
  if (marker) {
    if (shouldRefresh(`links:${userId ?? 'anonymous'}`)) {
      void fetchIndex().catch(() => {})
    }
    return toEntries(cached)
  }

  try {
    await fetchIndex()
    const merged = (await readCachedNotes(userId)).filter(
      (row) => row.note_type === 'rich-text' && typeof row.content === 'string'
    )
    return toEntries(merged)
  } catch {
    return toEntries(cached)
  }
}

async function nextPositionInCache(
  folderId: string | null,
  projectId: string | null,
  userId: string | null
): Promise<number> {
  const rows = await readCachedNotes(userId)
  const matches = rows.filter(
    (row) => (row.folder_id ?? null) === folderId && (row.project_id ?? null) === projectId
  )
  if (matches.length === 0) return 1
  return Math.max(...matches.map((row) => row.position ?? 0)) + 1
}

async function resolveProjectId(
  userId: string | null,
  folderId: string | null,
  projectId: string | null | undefined
): Promise<string | null> {
  if (projectId !== undefined) return projectId
  if (!folderId) return null

  const cachedFolders = await readCachedFolders(userId)
  const cached = cachedFolders.find((folder) => folder.id === folderId)
  if (cached) return cached.project_id ?? null

  try {
    const { data } = await supabase
      .from('folders')
      .select('project_id')
      .eq('id', folderId)
      .maybeSingle()
    return data?.project_id ?? null
  } catch {
    return null
  }
}

async function flushEntry(entryId: string, timeoutMs = 4000): Promise<void> {
  // Never hold an editor save open on a stalled connection — the local write
  // already succeeded and the queue keeps flushing in the background.
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })

  const result = await Promise.race([flushOutbox(entryId), timeout])
  if (timer) clearTimeout(timer)
  if (result === 'timeout') return

  const entry = await getMutation(entryId)

  if (entry?.status === 'conflicted') {
    throw new NoteConflictError(
      entry.recordId,
      ((await getCachedNote(entry.recordId)) as unknown as Record<string, unknown> | undefined) ?? null,
      entry.remote ?? null
    )
  }

  if (entry?.status === 'failed') {
    throw new NoteSyncError(entry.recordId, entry.lastError ?? 'Could not sync this note.')
  }

  // `result.networkError` / pending entries are expected while offline: the
  // local write already succeeded and the queue will retry automatically.
  void result
}

/**
 * Fetch notes in a folder as metadata. Bodies are loaded on demand.
 */
export async function getNotesByFolder(
  folderId: string | null,
  options?: NoteQueryOptions
): Promise<NoteSummary[]> {
  const userId = await getCurrentUserId()
  const folderKey = metaKey(`notes.folderSyncedAt.${folderId ?? 'root'}`, userId)
  const marker = await getMeta<string>(folderKey)
  const summaryMarker = await getMeta<string>(metaKey('notes.summarySyncedAt', userId))
  const cached = (await readCachedNotes(userId)).filter(
    (row) => (row.folder_id ?? null) === folderId
  )

  if (marker || summaryMarker) {
    if (shouldRefresh(`folder:${folderId ?? 'root'}:${userId ?? 'anonymous'}`)) {
      void (async () => {
        try {
          const remote = await fetchNotesByFolderFromNetwork(folderId)
          const changed = await mergeNoteRows(remote, { full: false, userId })
          await setMeta(folderKey, new Date().toISOString())
          if (changed) emitDataChanged('notes')
        } catch {
          // offline
        }
      })()
    }
    return applyPagination(
      cached.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      options
    ).map(toSummary)
  }

  try {
    const remote = await fetchNotesByFolderFromNetwork(folderId)
    const changed = await mergeNoteRows(remote, { full: false, userId })
    await setMeta(folderKey, new Date().toISOString())
    if (changed) emitDataChanged('notes')
    const merged = (await readCachedNotes(userId)).filter(
      (row) => (row.folder_id ?? null) === folderId
    )
    return applyPagination(
      merged.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      options
    ).map(toSummary)
  } catch (error) {
    if (cached.length > 0) {
      return applyPagination(
        cached.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
        options
      ).map(toSummary)
    }
    throw error
  }
}

async function fetchNotesByFolderFromNetwork(folderId: string | null): Promise<CachedNote[]> {
  const rows: CachedNote[] = []
  let offset = 0
  const maxRows = 5000

  while (rows.length < maxRows) {
    const query = supabase
      .from('notes')
      .select(NOTE_SUMMARY_COLUMNS)
      .order('position', { ascending: true })
      .range(offset, offset + DEFAULT_PAGE_SIZE - 1)

    if (folderId === null) query.is('folder_id', null)
    else query.eq('folder_id', folderId)

    const { data, error } = await query
    if (error) throw error

    const page = (data ?? []) as unknown as CachedNote[]
    rows.push(...page)
    if (page.length < DEFAULT_PAGE_SIZE) break
    offset += page.length
  }

  return rows
}

/** Fetch notes that belong to a project (metadata only). */
export async function getNotesByProject(
  projectId: string | null,
  options?: NoteQueryOptions
): Promise<NoteSummary[]> {
  const userId = await getCurrentUserId()
  const query = supabase
    .from('notes')
    .select(NOTE_SUMMARY_COLUMNS)
    .order('position', { ascending: true })
    .limit(5000)

  if (projectId === null) query.is('project_id', null)
  else query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) {
    const cached = (await readCachedNotes(userId)).filter(
      (row) => (row.project_id ?? null) === projectId
    )
    if (cached.length > 0) {
      return applyPagination(
        cached.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
        options
      ).map(toSummary)
    }
    throw error
  }

  const rows = (data ?? []) as unknown as CachedNote[]
  await mergeNoteRows(rows, { full: false, userId })
  const merged = (await readCachedNotes(userId)).filter(
    (row) => (row.project_id ?? null) === projectId
  )
  return applyPagination(
    merged.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    options
  ).map(toSummary)
}

/** Full note rows for a project, used by the project dashboard. */
export async function getNotesWithContentByProject(projectId: string): Promise<Note[]> {
  const userId = await getCurrentUserId()
  try {
    const { data, error } = await supabase
      .from('notes')
      .select(NOTE_FULL_COLUMNS)
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(1000)
    if (error) throw error

    const rows = (data ?? []) as unknown as Note[]
    await mergeNoteRows(rows, { full: true, userId })
    return rows
  } catch {
    const cached = (await readCachedNotes(userId)).filter(
      (row) => row.project_id === projectId && row.__full
    )
    return sortSummaries(cached).map(toNote)
  }
}

/**
 * Full note rows of a single type (for pickers that genuinely need bodies,
 * e.g. data-sheet previews). Never use this for the general note list.
 */
export async function getNotesWithContentByType(
  noteType: NoteType,
  limit = 200
): Promise<Note[]> {
  const userId = await getCurrentUserId()
  try {
    const { data, error } = await supabase
      .from('notes')
      .select(NOTE_FULL_COLUMNS)
      .eq('note_type', noteType)
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (error) throw error

    const rows = (data ?? []) as unknown as Note[]
    await mergeNoteRows(rows, { full: true, userId })
    return rows
  } catch {
    const cached = (await readCachedNotes(userId)).filter(
      (row) => row.note_type === noteType && row.__full
    )
    return sortSummaries(cached).slice(0, limit).map(toNote)
  }
}

/** Get the project_id for a folder, preferring the offline cache. */
export async function getFolderProjectId(folderId: string): Promise<string | null> {
  const cached = await getRow<CachedFolder>('folders', folderId)
  if (cached) return cached.project_id ?? null

  try {
    const { data } = await supabase
      .from('folders')
      .select('project_id')
      .eq('id', folderId)
      .maybeSingle()
    return data?.project_id ?? null
  } catch {
    return null
  }
}

/**
 * Create a note. The note is written to the local cache first and queued for
 * insertion, so creating notes works offline and returns instantly.
 */
export async function createNote(input: CreateNoteInput): Promise<Note> {
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')

  const folderId = input.folder_id ?? null
  const projectId = await resolveProjectId(userId, folderId, input.project_id)
  const position =
    input.position ?? (await nextPositionInCache(folderId, projectId, userId))
  const now = new Date().toISOString()

  const note: Note = {
    id: createOfflineId('note'),
    title: input.title,
    content: input.content,
    folder_id: folderId,
    project_id: projectId,
    position,
    user_id: userId,
    note_type: input.note_type ?? 'rich-text',
    created_at: now,
    updated_at: now,
  }

  await putCachedNote(note)
  emitDataChanged('notes', note.id)

  const entry = await enqueueMutation({
    table: 'notes',
    operation: 'insert',
    recordId: note.id,
    userId,
    payload: stripCacheFields(note),
  })

  void notifySyncState()
  if (entry) await flushEntry(entry.id)

  const stored = await getCachedNote(note.id)
  return stored ? toNote(stored) : note
}

/**
 * Update a note optimistically. A conditional `updated_at` guard is sent with
 * the queued mutation so concurrent edits are detected instead of clobbered.
 */
export async function updateNote(id: string, input: UpdateNoteInput): Promise<Note> {
  let cached = await getCachedNote(id)

  if (!cached) {
    const remote = await fetchNoteFromNetwork(id)
    if (!remote) throw new Error('Note not found')
    await mergeNoteRows([remote as CachedNote], { full: true, userId: remote.user_id })
    cached = await getCachedNote(id)
    if (!cached) throw new Error('Note not found')
  }

  const userId = cached.user_id ?? (await getCurrentUserId())
  const now = new Date().toISOString()
  const optimistic: Note = {
    ...toNote(cached),
    ...input,
    updated_at: now,
  }

  await putCachedNote(optimistic)
  emitDataChanged('notes', id)

  const entry = await enqueueMutation({
    table: 'notes',
    operation: 'update',
    recordId: id,
    userId,
    payload: { ...input, updated_at: now },
    baseUpdatedAt: cached.updated_at,
  })

  void notifySyncState()
  if (entry) await flushEntry(entry.id)

  const latest = await getCachedNote(id)
  return latest ? toNote(latest) : optimistic
}

/** Delete a note locally and queue the remote deletion. */
export async function deleteNote(id: string): Promise<void> {
  const cached = await getCachedNote(id)
  const userId = cached?.user_id ?? (await getCurrentUserId())

  await deleteRow('notes', id)
  emitDataChanged('notes', id)

  const entry = await enqueueMutation({
    table: 'notes',
    operation: 'delete',
    recordId: id,
    userId,
    payload: {},
  })

  void notifySyncState()
  if (entry) await flushEntry(entry.id)
}

/**
 * Move a note to a different folder. Moving to a folder inherits its project;
 * moving to root clears the project unless one is explicitly provided.
 */
export async function moveNote(
  noteId: string,
  newFolderId: string | null,
  newPosition?: number,
  newProjectId?: string | null
): Promise<Note> {
  const userId = await getCurrentUserId()
  let targetProjectId: string | null

  if (newProjectId !== undefined) {
    targetProjectId = newProjectId
  } else if (newFolderId) {
    targetProjectId = await getFolderProjectId(newFolderId)
  } else {
    targetProjectId = null
  }

  const position =
    newPosition ?? (await nextPositionInCache(newFolderId, targetProjectId, userId))

  return updateNote(noteId, {
    folder_id: newFolderId,
    position,
    project_id: targetProjectId,
  })
}

/**
 * Search notes by title or content. The query is sanitized for LIKE patterns
 * and capped so large workspaces cannot flood the client.
 */
export async function searchNotes(
  query: string,
  options?: { limit?: number }
): Promise<Note[]> {
  const sanitizedQuery = query
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/'/g, "''")
    // Commas/parentheses would change the structure of PostgREST's `or` filter.
    .replace(/[,()]/g, ' ')

  const limit = Math.max(
    1,
    Math.min(options?.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)
  )

  try {
    const { data, error } = await supabase
      .from('notes')
      .select(NOTE_FULL_COLUMNS)
      .or(`title.ilike.%${sanitizedQuery}%,content.ilike.%${sanitizedQuery}%`)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return ((data ?? []) as unknown as Note[]).map((row) => ({ ...row }))
  } catch (error) {
    const userId = await getCurrentUserId()
    const term = query.toLowerCase()
    const cached = (await readCachedNotes(userId)).filter(
      (row) =>
        typeof row.content === 'string' &&
        (row.title.toLowerCase().includes(term) || row.content.toLowerCase().includes(term))
    )
    if (cached.length > 0) {
      return sortSummaries(cached).slice(0, limit).map(toNote)
    }
    throw error
  }
}

/**
 * Apply a realtime row to the offline cache. Local pending edits win over the
 * echo so an in-flight autosave is never rolled back.
 */
export async function applyRealtimeNote(row: CachedNote | null, deletedId?: string): Promise<void> {
  await loadPendingState()
  if (deletedId) {
    if (hasPendingMutation('notes', deletedId)) return
    await deleteRow('notes', deletedId)
    emitDataChanged('notes', deletedId)
    return
  }

  if (!row || typeof row.id !== 'string') return
  if (hasPendingMutation('notes', row.id)) return

  const existing = await getCachedNote(row.id)
  const hasContent = typeof row.content === 'string'
  await putRow('notes', {
    ...existing,
    ...row,
    content: hasContent ? row.content : existing?.content,
    __full: hasContent || (existing?.__full ?? false),
  })
  emitDataChanged('notes', row.id)
}

/** Subscribe to real-time changes for notes. */
export function subscribeToNotes(
  userId: string,
  callback: (payload: unknown) => void
) {
  const channel = supabase
    .channel('notes-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notes',
        filter: `user_id=eq.${userId}`,
      },
      callback
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/** Create an attachment record for a note. */
export async function createNoteAttachment(input: CreateNoteAttachmentInput): Promise<NoteAttachment> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('note_attachments')
    .insert({
      note_id: input.note_id ?? null,
      user_id: user.id,
      kind: input.kind,
      storage_path: input.storage_path,
      url: input.url ?? null,
      mime_type: input.mime_type ?? null,
      size_bytes: input.size_bytes ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      alt_text: input.alt_text ?? null,
      source_type: input.source_type ?? 'insert',
      metadata: input.metadata ?? null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as NoteAttachment
}

/** Create multiple attachment records in one request. */
export async function createNoteAttachments(inputs: CreateNoteAttachmentInput[]): Promise<NoteAttachment[]> {
  if (inputs.length === 0) return []

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const payload = inputs.map((input) => ({
    note_id: input.note_id ?? null,
    user_id: user.id,
    kind: input.kind,
    storage_path: input.storage_path,
    url: input.url ?? null,
    mime_type: input.mime_type ?? null,
    size_bytes: input.size_bytes ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    alt_text: input.alt_text ?? null,
    source_type: input.source_type ?? 'insert',
    metadata: input.metadata ?? null,
  }))

  const { data, error } = await supabase
    .from('note_attachments')
    .insert(payload)
    .select('*')

  if (error) throw error
  return (data ?? []) as NoteAttachment[]
}

/** Fetch attachments for a note. */
export async function getNoteAttachments(noteId: string): Promise<NoteAttachment[]> {
  const { data, error } = await supabase
    .from('note_attachments')
    .select('id,note_id,user_id,kind,storage_path,url,mime_type,size_bytes,width,height,alt_text,source_type,metadata,created_at,updated_at')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as NoteAttachment[]
}

/** Update an attachment record. */
export async function updateNoteAttachment(
  id: string,
  input: UpdateNoteAttachmentInput
): Promise<NoteAttachment> {
  const { data, error } = await supabase
    .from('note_attachments')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as NoteAttachment
}

/** Delete an attachment record. */
export async function deleteNoteAttachment(id: string): Promise<void> {
  const { error } = await supabase
    .from('note_attachments')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/** Test helper: reset refresh throttles between tests. */
export function __resetNotesOfflineForTests(): void {
  lastRefresh.clear()
}
