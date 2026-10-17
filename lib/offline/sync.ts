import { supabase } from '../supabase'
import { emitConflict, emitDataChanged, emitSyncState } from './events'
import {
  getMutation,
  listOutbox,
  loadPendingState,
  hasAnyPendingMutation,
  removeMutation,
  updateMutation,
} from './queue'
import { getCurrentUserId } from './identity'
import { getMeta, getRow, putRow, setMeta } from './storage'
import type { ConflictInfo, FlushResult, OfflineTable, QueuedMutation, SyncState } from './types'

const LAST_SYNCED_KEY = 'sync.lastSyncedAt'
const MAX_ATTEMPTS = 5

let flushPromise: Promise<FlushResult> | null = null
let networkUnreachable = false

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

function isNetworkError(error: unknown): boolean {
  if (!error) return false
  const candidate = error as { name?: string; message?: string; status?: number }
  if (candidate.status && candidate.status >= 400 && candidate.status < 500) return false
  const message = (candidate.message ?? String(error)).toLowerCase()
  return (
    candidate.name === 'TypeError' ||
    candidate.name === 'AbortError' ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('load failed') ||
    message.includes('offline') ||
    message.includes('timeout')
  )
}

function isPermanentError(error: unknown): boolean {
  const candidate = error as { status?: number; code?: string } | null
  if (!candidate) return false
  if (candidate.status && candidate.status >= 400 && candidate.status < 500) return true
  // RLS/foreign-key/validation failures will not succeed on retry.
  return ['42501', '23503', '22P02', 'PGRST116'].includes(candidate.code ?? '')
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  const candidate = error as { message?: string; details?: string } | null
  return candidate?.message ?? candidate?.details ?? 'Unknown sync error'
}

function asRowData(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as Record<string, unknown>
}

async function fetchRemoteRow(table: OfflineTable, recordId: string): Promise<Record<string, unknown> | null> {
  // The table name is a closed union of typed tables; the dynamic access keeps
  // the flush engine generic without duplicating note/folder code.
  const query = (supabase.from(table) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>
      }
    }
  })
  const { data, error } = await query.select('*').eq('id', recordId).maybeSingle()
  if (error) throw error
  return asRowData(data)
}

async function cacheServerRow(table: OfflineTable, row: Record<string, unknown>): Promise<void> {
  if (typeof row.id !== 'string') return
  const existing = await getRow<Record<string, unknown>>(table, row.id)
  await putRow(table, {
    ...existing,
    ...row,
    // A server row for a note always contains the full body.
    ...(table === 'notes' ? { __full: true } : {}),
  } as { id: string })
}

interface ApplyResult {
  row: Record<string, unknown> | null
  conflict?: ConflictInfo
}

async function applyMutation(entry: QueuedMutation): Promise<ApplyResult> {
  const table = supabase.from(entry.table) as unknown as {
    insert: (payload: Record<string, unknown>) => {
      select: (columns: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> }
    }
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          select: (columns: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> }
        }
        select: (columns: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> }
      }
    }
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>
    }
  }

  if (entry.operation === 'insert') {
    const { data, error } = await table.insert(entry.payload).select('*').maybeSingle()
    if (error) {
      // The insert may have succeeded before the response was lost.
      if ((error as { code?: string }).code === '23505') {
        return { row: await fetchRemoteRow(entry.table, entry.recordId) }
      }
      throw error
    }
    return { row: asRowData(data) }
  }

  if (entry.operation === 'delete') {
    const { error } = await table.delete().eq('id', entry.recordId)
    if (error) throw error
    return { row: null }
  }

  const baseUpdate = table.update(entry.payload).eq('id', entry.recordId)
  const query = entry.baseUpdatedAt
    ? baseUpdate.eq('updated_at', entry.baseUpdatedAt)
    : baseUpdate

  const { data, error } = await query.select('*').maybeSingle()
  if (error) throw error

  if (data) {
    return { row: asRowData(data) }
  }

  // Zero rows updated: either the note moved on another device or the
  // conditional timestamp no longer matches.
  const remote = await fetchRemoteRow(entry.table, entry.recordId)
  if (remote && entry.baseUpdatedAt && remote.updated_at === entry.baseUpdatedAt) {
    // The timestamp guard was the only blocker (e.g. clock skew). Retry
    // without it now that the base still matches.
    const retry = await table
      .update(entry.payload)
      .eq('id', entry.recordId)
      .select('*')
      .maybeSingle()
    if (retry.error) throw retry.error
    return { row: asRowData(retry.data) }
  }

  const local = (await getRow<{ id: string }>(entry.table, entry.recordId)) ?? null
  const conflict: ConflictInfo = {
    mutationId: entry.id,
    table: entry.table,
    recordId: entry.recordId,
    message: remote
      ? 'The record was changed on another device.'
      : 'The record was deleted on another device.',
    local: local as Record<string, unknown> | null,
    remote,
  }

  entry.status = 'conflicted'
  entry.attempts += 1
  entry.lastError = conflict.message
  entry.local = local as Record<string, unknown> | null
  entry.remote = remote
  await updateMutation(entry)
  emitConflict(conflict)

  return { row: null, conflict }
}

async function entriesForCurrentUser(): Promise<QueuedMutation[]> {
  const entries = await listOutbox()
  const userId = await getCurrentUserId()
  // Never replay another account's queued writes under the current session.
  if (!userId) return entries
  return entries.filter((entry) => !entry.userId || entry.userId === userId)
}

async function doFlush(
  entryId?: string,
  options?: { retryFailed?: boolean }
): Promise<FlushResult> {
  const conflicts: ConflictInfo[] = []
  let processed = 0
  let networkError = false

  if (!isOnline()) {
    const entries = await entriesForCurrentUser()
    emitSyncState(await getSyncState())
    return {
      processed: 0,
      pending: entries.filter((entry) => entry.status === 'pending').length,
      conflicts,
      networkError: true,
    }
  }

  const queued = (await entriesForCurrentUser()).filter(
    (entry) =>
      (entry.status === 'pending' || (options?.retryFailed && entry.status === 'failed')) &&
      (!entryId || entry.id === entryId)
  )

  for (const queuedEntry of queued) {
    // Re-read so edits coalesced while the flush was starting are included.
    const entry = await getMutation(queuedEntry.id)
    if (!entry || (entry.status !== 'pending' && !options?.retryFailed)) continue

    try {
      const result = await applyMutation(entry)
      if (result.conflict) {
        conflicts.push(result.conflict)
        continue
      }

      await removeMutation(entry.id, entry.table, entry.recordId)
      if (result.row) {
        await cacheServerRow(entry.table, result.row)
      }
      processed += 1
      emitDataChanged(entry.table, entry.recordId)
    } catch (error) {
      entry.attempts += 1
      entry.lastError = describeError(error)

      if (isNetworkError(error)) {
        entry.status = 'pending'
        await updateMutation(entry)
        networkError = true
        break
      }

      entry.status =
        isPermanentError(error) || entry.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
      await updateMutation(entry)
    }
  }

  networkUnreachable = networkError
  if (!networkError) {
    await setMeta(LAST_SYNCED_KEY, new Date().toISOString())
  }

  const remaining = await entriesForCurrentUser()
  const result: FlushResult = {
    processed,
    pending: remaining.filter((entry) => entry.status === 'pending').length,
    conflicts,
    networkError,
  }

  emitSyncState(await getSyncState())
  return result
}

/** Flush the write-behind queue. Concurrent calls share one flush. */
export function flushOutbox(
  entryId?: string,
  options?: { retryFailed?: boolean }
): Promise<FlushResult> {
  if (!flushPromise) {
    flushPromise = doFlush(entryId, options).finally(() => {
      flushPromise = null
    })
  }
  return flushPromise
}

export async function getSyncState(): Promise<SyncState> {
  const entries = await entriesForCurrentUser()
  if (!entries.some((entry) => entry.status === 'pending')) {
    networkUnreachable = false
  }
  return {
    online: isOnline() && !networkUnreachable,
    pending: entries.filter((entry) => entry.status === 'pending').length,
    failed: entries.filter((entry) => entry.status === 'failed').length,
    conflicts: entries.filter((entry) => entry.status === 'conflicted').length,
    lastSyncedAt: (await getMeta<string>(LAST_SYNCED_KEY)) ?? null,
  }
}

export async function notifySyncState(): Promise<void> {
  emitSyncState(await getSyncState())
}

/**
 * Resolve a recorded conflict by either re-queuing the local copy against the
 * current remote version or replacing the local copy with the remote row.
 */
export async function resolveConflict(
  mutationId: string,
  strategy: 'keep-local' | 'use-remote'
): Promise<void> {
  const entry = await getMutation(mutationId)
  if (!entry) return

  const remote = await fetchRemoteRow(entry.table, entry.recordId)

  if (strategy === 'use-remote') {
    if (remote) {
      await cacheServerRow(entry.table, remote)
    } else {
      const { deleteRow } = await import('./storage')
      await deleteRow(entry.table, entry.recordId)
    }
    await removeMutation(entry.id, entry.table, entry.recordId)
    emitDataChanged(entry.table, entry.recordId)
    await notifySyncState()
    return
  }

  const local = await getRow<Record<string, unknown>>(entry.table, entry.recordId)

  if (!remote && local) {
    // The remote row was deleted: restore the local copy as an insert.
    const payload = { ...local }
    delete payload.__full
    entry.operation = 'insert'
    entry.payload = payload
    entry.baseUpdatedAt = null
  } else {
    entry.baseUpdatedAt = (remote?.updated_at as string | undefined) ?? null
  }

  entry.status = 'pending'
  entry.attempts = 0
  entry.lastError = undefined
  entry.remote = undefined
  await updateMutation(entry)
  await flushOutbox(entry.id)
}

/** Test helper: clear module-level flush state. */
export function __resetOfflineSyncForTests(): void {
  flushPromise = null
  networkUnreachable = false
}

let installedCleanup: (() => void) | null = null

/**
 * Installs online/visibility listeners and a periodic retry. Returns a cleanup
 * function; repeated calls are safe.
 */
export function installOfflineSync(): () => void {
  if (typeof window === 'undefined') return () => {}

  if (installedCleanup) return installedCleanup

  void loadPendingState().then(async () => {
    if (hasAnyPendingMutation() && isOnline()) {
      await flushOutbox()
    }
  })

  const handleOnline = () => {
    networkUnreachable = false
    void flushOutbox()
  }
  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && hasAnyPendingMutation()) {
      void flushOutbox()
    }
  }

  window.addEventListener('online', handleOnline)
  document.addEventListener('visibilitychange', handleVisibility)
  const interval = window.setInterval(() => {
    if (hasAnyPendingMutation() && isOnline()) {
      void flushOutbox()
    }
  }, 30_000)

  installedCleanup = () => {
    window.removeEventListener('online', handleOnline)
    document.removeEventListener('visibilitychange', handleVisibility)
    window.clearInterval(interval)
    installedCleanup = null
  }

  return installedCleanup
}
