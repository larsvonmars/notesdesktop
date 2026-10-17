import { getCurrentUserId } from './identity'
import { deleteRow, getAllRows, putRow } from './storage'
import type { MutationOperation, OfflineTable, QueuedMutation } from './types'

/** Records with unsynced local changes (pending, failed or conflicted). */
const unsyncedKeys = new Set<string>()
/** Records that still have a retryable mutation. */
const pendingKeys = new Set<string>()
let pendingStateLoaded = false

export function mutationKey(table: OfflineTable, recordId: string): string {
  return `${table}:${recordId}`
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
  for (const entry of entries) {
    unsyncedKeys.add(mutationKey(entry.table, entry.recordId))
    if (entry.status === 'pending') pendingKeys.add(mutationKey(entry.table, entry.recordId))
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

export function hasAnyPendingMutation(): boolean {
  return pendingKeys.size > 0
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
 */
export async function enqueueMutation(input: EnqueueMutationInput): Promise<QueuedMutation | null> {
  await loadPendingState()

  const entries = await listOutbox()
  const existing = entries.filter(
    (entry) => entry.table === input.table && entry.recordId === input.recordId
  )

  const pendingInsert = existing.find((entry) => entry.operation === 'insert')
  const pendingUpdate = existing.find((entry) => entry.operation === 'update')

  if (input.operation === 'update' && (pendingInsert || pendingUpdate)) {
    const target = (pendingInsert ?? pendingUpdate) as QueuedMutation
    target.payload = { ...target.payload, ...input.payload }
    await putRow('outbox', target)
    unsyncedKeys.add(mutationKey(target.table, target.recordId))
    if (target.status === 'pending') pendingKeys.add(mutationKey(target.table, target.recordId))
    return target
  }

  if (input.operation === 'delete') {
    // A record that was never sent to the server only needs local deletion.
    if (pendingInsert) {
      for (const entry of existing) {
        await deleteRow('outbox', entry.id)
      }
      unsyncedKeys.delete(mutationKey(input.table, input.recordId))
      pendingKeys.delete(mutationKey(input.table, input.recordId))
      return null
    }
    for (const entry of existing) {
      await deleteRow('outbox', entry.id)
    }
  }

  if (input.operation === 'insert' && existing.length > 0) {
    for (const entry of existing) {
      await deleteRow('outbox', entry.id)
    }
  }

  const entry: QueuedMutation = {
    id: createId(),
    table: input.table,
    operation: input.operation,
    recordId: input.recordId,
    userId: input.userId,
    payload: input.payload,
    baseUpdatedAt: input.baseUpdatedAt ?? null,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  }

  await putRow('outbox', entry)
  unsyncedKeys.add(mutationKey(input.table, input.recordId))
  pendingKeys.add(mutationKey(input.table, input.recordId))
  return entry
}

export async function getMutation(id: string): Promise<QueuedMutation | undefined> {
  const entries = await getAllRows<QueuedMutation>('outbox')
  return entries.find((entry) => entry.id === id)
}

export async function updateMutation(entry: QueuedMutation): Promise<void> {
  await putRow('outbox', entry)
  const key = mutationKey(entry.table, entry.recordId)
  unsyncedKeys.add(key)
  if (entry.status === 'pending') pendingKeys.add(key)
  else pendingKeys.delete(key)
}

export async function removeMutation(id: string, table: OfflineTable, recordId: string): Promise<void> {
  await deleteRow('outbox', id)
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
  } else {
    unsyncedKeys.add(key)
    if (stillQueued.some((entry) => entry.status === 'pending')) pendingKeys.add(key)
    else pendingKeys.delete(key)
  }
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
  pendingStateLoaded = false
}
