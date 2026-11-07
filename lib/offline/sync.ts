import { supabase } from '../supabase'
import { emitConflict, emitDataChanged, emitSyncState } from './events'
import {
  getMutation,
  listOutbox,
  loadPendingState,
  hasAnyPendingMutation,
  markMutationConflicted,
  rebaseMutation,
  removeMutation,
  removeMutationIfUnchanged,
  updateMutation,
} from './queue'
import { getCurrentUserId } from './identity'
import { deleteRow, getMeta, getRow, mutateRow, setMeta } from './storage'
import type { ConflictInfo, FlushResult, OfflineTable, QueuedMutation, SyncState } from './types'

const LAST_SYNCED_KEY = 'sync.lastSyncedAt'
const MAX_ATTEMPTS = 5
/** Safety cap on re-sending a mutation whose payload changed while in flight. */
const MAX_REBASES_PER_FLUSH = 3

/**
 * Flushes are serialized. Every request gets its own pass, so a save that
 * arrives while another flush is running is not swallowed by the earlier one.
 */
let flushChain: Promise<unknown> = Promise.resolve()
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

async function cacheServerRow(
  table: OfflineTable,
  row: Record<string, unknown>,
  options?: { force?: boolean }
): Promise<void> {
  if (typeof row.id !== 'string') return
  const rowId = row.id

  const incomingUpdatedAt = typeof row.updated_at === 'string' ? row.updated_at : undefined

  // One transaction: never let an out-of-order response overwrite a newer
  // cached server row, and never let a concurrent save clobber the record we
  // just fetched. Conflict resolution passes `force` because the user
  // explicitly chose the server version (its timestamp can look older under
  // clock skew).
  await mutateRow<Record<string, unknown> & { id: string }>(table, rowId, (existing) => {
    const knownServerUpdatedAt = existing?.__serverUpdatedAt as string | undefined
    if (
      !options?.force &&
      incomingUpdatedAt &&
      knownServerUpdatedAt &&
      incomingUpdatedAt < knownServerUpdatedAt
    ) {
      return null
    }

    return {
      ...existing,
      ...row,
      id: rowId,
      // A server row for a note always contains the full body.
      ...(table === 'notes' ? { __full: true } : {}),
      // The authoritative server timestamp (the DB trigger rewrites updated_at).
      // Local edits use this as their conflict-guard base.
      ...(incomingUpdatedAt ? { __serverUpdatedAt: incomingUpdatedAt } : {}),
    }
  })
}

/** Removes cache-only fields (`__full`, `__serverUpdatedAt`, …) before a
 * cached row is sent back to PostgREST. */
function stripCacheFields(row: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith('__')) payload[key] = value
  }
  return payload
}

/**
 * True when the remote row already contains every field this mutation wanted
 * to write. Used to recognise our own write from another window: its response
 * is lost, the guard update matches zero rows, but the server state is already
 * exactly what we asked for — that is success, not a conflict.
 */
function payloadMatchesRemote(
  payload: Record<string, unknown>,
  remote: Record<string, unknown>
): boolean {
  return Object.entries(payload).every(([key, value]) => {
    if (key === 'updated_at') return true
    const remoteValue = remote[key]
    if (value === null || value === undefined) return remoteValue === null || remoteValue === undefined
    if (typeof value === 'object') return JSON.stringify(value) === JSON.stringify(remoteValue)
    return remoteValue === value
  })
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
  // conditional timestamp no longer matches. The caller decides whether this
  // is a real conflict, a successful write from another window, or an edit
  // that must be rebased and retried.
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

  // Entries can be re-queued during the loop when a newer edit was coalesced
  // into a mutation that was already in flight. `rebaseCounts` bounds that.
  const rebaseCounts = new Map<string, number>()

  for (const queuedEntry of queued) {
    // Re-read so edits coalesced while the flush was starting are included.
    const entry = await getMutation(queuedEntry.id)
    if (!entry || (entry.status !== 'pending' && !options?.retryFailed)) continue

    const appliedRevision = entry.revision ?? 0

    try {
      const result = await applyMutation(entry)

      if (result.conflict) {
        const latest = await getMutation(entry.id)
        if (!latest) {
          // Another window applied and removed this mutation; the write landed.
          processed += 1
          continue
        }

        if (
          (latest.revision ?? 0) !== appliedRevision &&
          result.conflict.remote &&
          // Only auto-rebase when the remote row is our own write (e.g. the
          // same mutation also flushed from another window). A genuine edit
          // from another device must surface as a conflict, never be silently
          // overwritten by the newer local edit.
          payloadMatchesRemote(entry.payload, result.conflict.remote)
        ) {
          // A newer edit was coalesced into this mutation while it was in
          // flight. Rebase it on the server row we just wrote and retry.
          const remoteUpdatedAt =
            (result.conflict.remote.updated_at as string | undefined) ?? null
          const rebased = await rebaseMutation({
            id: entry.id,
            table: entry.table,
            recordId: entry.recordId,
            baseUpdatedAt: remoteUpdatedAt,
            operation: latest.operation === 'insert' ? 'update' : undefined,
          })
          if (rebased) {
            const rebases = (rebaseCounts.get(rebased.id) ?? 0) + 1
            rebaseCounts.set(rebased.id, rebases)
            processed += 1
            emitDataChanged(entry.table, entry.recordId)
            if (rebases <= MAX_REBASES_PER_FLUSH) queued.push(rebased)
          }
          continue
        }

        if (
          result.conflict.remote &&
          (latest.revision ?? 0) === appliedRevision &&
          payloadMatchesRemote(entry.payload, result.conflict.remote)
        ) {
          // Our own write (e.g. the same mutation flushed from another window)
          // already landed; the zero-row guard was just a lost response. Record
          // the server row/timestamp first so the next save uses a fresh base.
          const localRow = await getRow<Record<string, unknown>>(entry.table, entry.recordId)
          if (localRow) {
            try {
              await cacheServerRow(entry.table, result.conflict.remote, { force: true })
            } catch {
              // Cache refresh is best-effort.
            }
          }
          const removal = await removeMutationIfUnchanged(
            entry.id,
            entry.table,
            entry.recordId,
            appliedRevision
          )
          if (removal !== 'changed') {
            processed += 1
            emitDataChanged(entry.table, entry.recordId)
            continue
          }
        }

        const marked = await markMutationConflicted({
          id: entry.id,
          table: entry.table,
          recordId: entry.recordId,
          message: result.conflict.message,
          local: result.conflict.local,
          remote: result.conflict.remote,
        })
        if (!marked) {
          // Removed concurrently (another window resolved it): not a conflict.
          processed += 1
          continue
        }
        conflicts.push(result.conflict)
        emitConflict(result.conflict)
        continue
      }

      // Cache the authoritative server row *before* releasing the mutation:
      // it carries the server-generated `updated_at` the next save must use as
      // its conflict-guard base. Never cache a row the user deleted locally
      // while the request was in flight — that would resurrect it.
      const localRow = await getRow<Record<string, unknown>>(entry.table, entry.recordId)
      if (result.row && localRow) {
        try {
          await cacheServerRow(entry.table, result.row)
        } catch {
          // The server write already succeeded; the cache is best-effort.
        }
      }

      const removal = await removeMutationIfUnchanged(
        entry.id,
        entry.table,
        entry.recordId,
        appliedRevision
      )

      if (removal === 'changed') {
        // An edit was coalesced while this payload was in flight. Rebase it on
        // the server row we just wrote and send the newer payload too.
        const cachedRow = await getRow<Record<string, unknown>>(entry.table, entry.recordId)
        const serverUpdatedAt =
          (cachedRow?.__serverUpdatedAt as string | undefined) ??
          (result.row?.updated_at as string | undefined) ??
          null

        const rebased = await rebaseMutation({
          id: entry.id,
          table: entry.table,
          recordId: entry.recordId,
          baseUpdatedAt: serverUpdatedAt,
          // The row now exists on the server, so a coalesced edit on top of an
          // insert must be sent as an update (an insert would violate the PK).
          operation: entry.operation === 'insert' ? 'update' : undefined,
        })

        if (rebased) {
          const rebases = (rebaseCounts.get(rebased.id) ?? 0) + 1
          rebaseCounts.set(rebased.id, rebases)
          processed += 1
          emitDataChanged(entry.table, entry.recordId)
          if (rebases <= MAX_REBASES_PER_FLUSH) queued.push(rebased)
        }
        continue
      }

      if (removal === 'missing') {
        // Another window already applied and removed it.
        processed += 1
        continue
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

/**
 * Flush the write-behind queue. Flushes are chained rather than shared: a call
 * made while another flush is running gets its own pass afterwards, so a save
 * triggered by a newer edit is never swallowed by an earlier flush.
 */
export function flushOutbox(
  entryId?: string,
  options?: { retryFailed?: boolean }
): Promise<FlushResult> {
  const run = () => doFlush(entryId, options)
  const next = flushChain.then(run, run)
  flushChain = next.then(
    () => undefined,
    () => undefined
  )
  return next
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
      await cacheServerRow(entry.table, remote, { force: true })
    } else {
      await deleteRow(entry.table, entry.recordId)
    }
    await removeMutation(entry.id, entry.table, entry.recordId)
    emitDataChanged(entry.table, entry.recordId)
    await notifySyncState()
    return
  }

  const local = await getRow<Record<string, unknown>>(entry.table, entry.recordId)

  if (!remote) {
    if (!local) {
      // Nothing left to restore locally.
      await removeMutation(entry.id, entry.table, entry.recordId)
      emitDataChanged(entry.table, entry.recordId)
      await notifySyncState()
      return
    }
    // The remote row was deleted: restore the local copy as an insert. Strip
    // cache-only columns so PostgREST accepts the payload.
    const rebased = await rebaseMutation({
      id: entry.id,
      table: entry.table,
      recordId: entry.recordId,
      operation: 'insert',
      payload: stripCacheFields(local),
      baseUpdatedAt: null,
    })
    if (rebased) await flushOutbox(rebased.id)
  } else {
    const rebased = await rebaseMutation({
      id: entry.id,
      table: entry.table,
      recordId: entry.recordId,
      baseUpdatedAt: (remote.updated_at as string | undefined) ?? null,
    })
    if (rebased) await flushOutbox(rebased.id)
  }

  await notifySyncState()
}

/** Test helper: clear module-level flush state. */
export function __resetOfflineSyncForTests(): void {
  flushChain = Promise.resolve()
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
