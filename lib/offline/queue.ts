import { getCurrentUserId } from './identity'
import { deleteRow, deleteRowIf, getAllRows, getRow, putRow } from './storage'
import type { MutationOperation, OfflineTable, QueuedMutation } from './types'

/** Records with unsynced local changes (pending, failed or conflicted). */
const unsyncedKeys = new Set<string>()
/** Records that still have a retryable mutation. */
const pendingKeys = new Set<string>()
/** Records with a queued deletion (updates for them must not resurrect them). */
const deleteKeys = new Set<string>()
let pendingStateLoaded = false

/**
 * Per-record promise chains. Every read-modify-write of a queued mutation for
 * the same record runs through its chain, so an enqueue that merges an edit
 * cannot interleave with the flusher removing the mutation it just applied.
 */
const recordLocks = new Map<string, Promise<unknown>>()

export function mutationKey(table: OfflineTable, recordId: string): string {
  return `${table}:${recordId}`
}

/** Serializes queue mutations for one record (across this app instance). */
function withRecordLock<T>(
  table: OfflineTable,
  recordId: string,
  task: () => Promise<T>
): Promise<T> {
  const key = mutationKey(table, recordId)
  const previous = recordLocks.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const guard = run.then(
    () => undefined,
    () => undefined
  )
  recordLocks.set(key, guard)
  void guard.finally(() => {
    if (recordLocks.get(key) === guard) recordLocks.delete(key)
  })
  return run
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function sortByCreatedAt(entries: QueuedMutation[]): QueuedMutation[] {
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function listOutbox(): Promise<QueuedMutation[]> {
  const entries = await getAllRows<QueuedMutation>('outbox')
  unsyncedKeys.clear()
  pendingKeys.clear()
  deleteKeys.clear()
  for (const entry of entries) {
    const key = mutationKey(entry.table, entry.recordId)
    unsyncedKeys.add(key)
    if (entry.status === 'pending') pendingKeys.add(key)
    if (entry.operation === 'delete') deleteKeys.add(key)
  }
  pendingStateLoaded = true
  return sortByCreatedAt(entries)
}

export async function loadPendingState(): Promise<void> {
  if (pendingStateLoaded) return
  await listOutbox()
}

/** Force a re-read after another window changed the shared outbox. */
export async function reloadPendingState(): Promise<void> {
  pendingStateLoaded = false
  await listOutbox()
}

/**
 * Synchronous check used by realtime handlers to ignore stale echoes. Returns
 * true for any unsynced local version, including conflicts that still need to
 * be resolved by the user.
 */
export function hasPendingMutation(table: OfflineTable, recordId: string): boolean {
  return unsyncedKeys.has(mutationKey(table, recordId))
}

/** True while the record has a queued deletion (updates must not revive it). */
export function hasPendingDelete(table: OfflineTable, recordId: string): boolean {
  return deleteKeys.has(mutationKey(table, recordId))
}

export function hasAnyPendingMutation(): boolean {
  return pendingKeys.size > 0
}

/** Re-derive the in-memory bookkeeping for a record from storage. */
async function refreshRecordFlags(table: OfflineTable, recordId: string): Promise<void> {
  const key = mutationKey(table, recordId)
  // Other entries for the same record may remain (e.g. a conflict plus a
  // coalesced retry), so re-derive the flags from storage.
  const remaining = await getAllRows<QueuedMutation>('outbox')
  const stillQueued = remaining.filter(
    (entry) => entry.table === table && entry.recordId === recordId
  )
  if (stillQueued.length === 0) {
    unsyncedKeys.delete(key)
    pendingKeys.delete(key)
    deleteKeys.delete(key)
  } else {
    unsyncedKeys.add(key)
    if (stillQueued.some((entry) => entry.status === 'pending')) pendingKeys.add(key)
    else pendingKeys.delete(key)
    if (stillQueued.some((entry) => entry.operation === 'delete')) deleteKeys.add(key)
    else deleteKeys.delete(key)
  }
}

export interface EnqueueMutationInput {
  table: OfflineTable
  operation: MutationOperation
  recordId: string
  userId: string | null
  payload: Record<string, unknown>
  baseUpdatedAt?: string | null
}

/**
 * Adds a mutation to the write-behind queue. Repeated edits to the same record
 * are coalesced so a burst of autosaves produces one network round-trip and
 * keeps the original conflict base.
 *
 * If the mutation is already in flight, the merge bumps `revision`; the
 * flusher uses that to detect the newer payload and re-send it against the
 * freshly written server version instead of dropping it (see
 * {@link removeMutationIfUnchanged}).
 */
export async function enqueueMutation(input: EnqueueMutationInput): Promise<QueuedMutation | null> {
  await loadPendingState()
  return withRecordLock(input.table, input.recordId, async () => {
    const entries = await listOutbox()
    const existing = entries.filter(
      (entry) => entry.table === input.table && entry.recordId === input.recordId
    )

    const pendingInsert = existing.find((entry) => entry.operation === 'insert')
    const pendingUpdate = existing.find((entry) => entry.operation === 'update')
    const pendingDelete = existing.find((entry) => entry.operation === 'delete')

    if (input.operation === 'update' && pendingDelete) {
      // The record is being removed: a late autosave must not resurrect it.
      return null
    }

    if (input.operation === 'update' && (pendingInsert || pendingUpdate)) {
      const target = (pendingInsert ?? pendingUpdate) as QueuedMutation
      target.payload = { ...target.payload, ...input.payload }
      target.revision = (target.revision ?? 0) + 1
      // A new edit gives a failed mutation another chance to sync. Conflicts
      // stay conflicted until the user resolves them.
      if (target.status === 'failed') {
        target.status = 'pending'
        target.attempts = 0
        target.lastError = undefined
      }
      await putRow('outbox', target)
      unsyncedKeys.add(mutationKey(target.table, target.recordId))
      if (target.status === 'pending') pendingKeys.add(mutationKey(target.table, target.recordId))
      return target
    }

    if (input.operation === 'delete') {
      for (const entry of existing) {
        await deleteRow('outbox', entry.id)
      }
      // Always queue the remote delete, even when the insert has not been
      // observed yet: it may already be in flight, and dropping it would leave
      // a ghost row on the server. Deleting a missing row is a harmless no-op.
    }

    if (input.operation === 'insert' && existing.length > 0) {
      for (const entry of existing) {
        await deleteRow('outbox', entry.id)
      }
    }

    // Resolve the conflict-guard base from the freshest stored server
    // timestamp while the record lock is held. The caller's snapshot can
    // predate a flush that just recorded a newer `__serverUpdatedAt`, which
    // would otherwise create a false conflict on the next retry.
    let baseUpdatedAt = input.baseUpdatedAt ?? null
    if (input.operation === 'update') {
      const cached = await getRow<Record<string, unknown>>(input.table, input.recordId)
      const marker =
        typeof cached?.__serverUpdatedAt === 'string' ? cached.__serverUpdatedAt : undefined
      if (marker && (!baseUpdatedAt || marker > baseUpdatedAt)) baseUpdatedAt = marker
    }

    const entry: QueuedMutation = {
      id: createId(),
      table: input.table,
      operation: input.operation,
      recordId: input.recordId,
      userId: input.userId,
      payload: input.payload,
      baseUpdatedAt,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending',
      revision: 0,
    }

    await putRow('outbox', entry)
    unsyncedKeys.add(mutationKey(input.table, input.recordId))
    pendingKeys.add(mutationKey(input.table, input.recordId))
    if (entry.operation === 'delete') deleteKeys.add(mutationKey(input.table, input.recordId))
    return entry
  })
}

export async function getMutation(id: string): Promise<QueuedMutation | undefined> {
  const entries = await getAllRows<QueuedMutation>('outbox')
  return entries.find((entry) => entry.id === id)
}

/**
 * Persists control fields (status/attempts/error/conflict snapshots) of a
 * mutation. A payload merged after `entry` was read is always preserved — the
 * flusher must never roll back an edit that arrived while the previous payload
 * was in flight. Payload/operation rewrites go through {@link rebaseMutation}.
 */
export async function updateMutation(entry: QueuedMutation): Promise<void> {
  await withRecordLock(entry.table, entry.recordId, async () => {
    const entries = await getAllRows<QueuedMutation>('outbox')
    const current = entries.find((candidate) => candidate.id === entry.id)
    if (!current) {
      // Another window deleted/resolved it; never resurrect the entry.
      await refreshRecordFlags(entry.table, entry.recordId)
      return
    }

    let next = entry
    if ((current.revision ?? 0) > (entry.revision ?? 0)) {
      next = {
        ...current,
        status: entry.status,
        attempts: entry.attempts,
        lastError: entry.lastError,
        local: entry.local,
        remote: entry.remote,
        baseUpdatedAt: entry.baseUpdatedAt ?? current.baseUpdatedAt,
      }
    }

    await putRow('outbox', next)
    await refreshRecordFlags(entry.table, entry.recordId)
  })
}

export interface RebaseMutationInput {
  id: string
  table: OfflineTable
  recordId: string
  /** New conflict-guard base (the server-confirmed updated_at). */
  baseUpdatedAt?: string | null
  /** Optionally replace the operation (insert → update after an in-flight insert). */
  operation?: MutationOperation
  /** Optionally replace the payload (conflict "keep local" restore). */
  payload?: Record<string, unknown>
}

/**
 * Atomically rewrites a queued mutation so it can be sent again against a new
 * server base. The read-modify-write runs under the record lock, so an edit
 * coalesced concurrently is never overwritten (the flusher and the enqueuer
 * both go through the same lock).
 */
export async function rebaseMutation(
  input: RebaseMutationInput
): Promise<QueuedMutation | undefined> {
  return withRecordLock(input.table, input.recordId, async () => {
    const entries = await getAllRows<QueuedMutation>('outbox')
    const entry = entries.find((candidate) => candidate.id === input.id)
    if (!entry) return undefined

    entry.baseUpdatedAt = input.baseUpdatedAt ?? null
    if (input.payload) entry.payload = input.payload
    if (input.operation) entry.operation = input.operation
    entry.status = 'pending'
    entry.attempts = 0
    entry.lastError = undefined
    entry.local = undefined
    entry.remote = undefined

    await putRow('outbox', entry)
    await refreshRecordFlags(input.table, input.recordId)
    return entry
  })
}

/** Marks a mutation conflicted atomically (never resurrects a removed entry). */
export async function markMutationConflicted(input: {
  id: string
  table: OfflineTable
  recordId: string
  message: string
  local: Record<string, unknown> | null
  remote: Record<string, unknown> | null
}): Promise<QueuedMutation | undefined> {
  return withRecordLock(input.table, input.recordId, async () => {
    const entries = await getAllRows<QueuedMutation>('outbox')
    const entry = entries.find((candidate) => candidate.id === input.id)
    if (!entry) return undefined

    entry.status = 'conflicted'
    entry.attempts += 1
    entry.lastError = input.message
    entry.local = input.local
    entry.remote = input.remote

    await putRow('outbox', entry)
    await refreshRecordFlags(input.table, input.recordId)
    return entry
  })
}

export async function removeMutation(
  id: string,
  table: OfflineTable,
  recordId: string
): Promise<void> {
  await withRecordLock(table, recordId, async () => {
    await deleteRow('outbox', id)
    await refreshRecordFlags(table, recordId)
  })
}

export type RemoveMutationResult = 'removed' | 'changed' | 'missing'

/**
 * Removes a mutation only if its revision still matches the revision the
 * flusher applied. If an edit was coalesced while the request was in flight
 * (`changed`), the mutation is kept so the caller can rebase it on the server
 * row that was just written and send the newer payload.
 */
export async function removeMutationIfUnchanged(
  id: string,
  table: OfflineTable,
  recordId: string,
  revision: number
): Promise<RemoveMutationResult> {
  return withRecordLock(table, recordId, async () => {
    // The revision check and the delete happen in one IndexedDB transaction so
    // another window cannot bump the revision in between.
    const result = await deleteRowIf<QueuedMutation>(
      'outbox',
      id,
      (row) => (row.revision ?? 0) === revision
    )
    if (!result.deleted) return result.row ? 'changed' : 'missing'

    await refreshRecordFlags(table, recordId)
    return 'removed'
  })
}

export async function getConflictedMutations(): Promise<QueuedMutation[]> {
  const entries = await getAllRows<QueuedMutation>('outbox')
  const userId = await getCurrentUserId()
  return entries.filter(
    (entry) =>
      entry.status === 'conflicted' && (!userId || !entry.userId || entry.userId === userId)
  )
}

export async function discardMutation(id: string, table: OfflineTable, recordId: string): Promise<void> {
  await removeMutation(id, table, recordId)
}

/** Test helper: clear the in-memory sync bookkeeping. */
export function __resetOfflineQueueForTests(): void {
  unsyncedKeys.clear()
  pendingKeys.clear()
  deleteKeys.clear()
  pendingStateLoaded = false
  recordLocks.clear()
}
