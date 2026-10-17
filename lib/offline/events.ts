import type { ConflictInfo, OfflineTable, SyncState } from './types'

export const OFFLINE_DATA_CHANGED_EVENT = 'mindviz:offline-data-changed'
export const SYNC_STATE_CHANGED_EVENT = 'mindviz:sync-state-changed'
export const OFFLINE_CONFLICT_EVENT = 'mindviz:offline-conflict'

type CrossWindowMessage =
  | { type: 'data-changed'; table: OfflineTable; recordId?: string }
  | { type: 'sync-state'; state: SyncState }
  | { type: 'conflict'; conflict: ConflictInfo }

const CROSS_WINDOW_ENABLED =
  process.env.NODE_ENV !== 'test' &&
  typeof window !== 'undefined' &&
  typeof BroadcastChannel !== 'undefined'

let crossWindowChannel: BroadcastChannel | null = null

function dispatchLocalDataChanged(detail: { table: OfflineTable; recordId?: string }): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OFFLINE_DATA_CHANGED_EVENT, { detail }))
}

function dispatchLocalSyncState(state: SyncState): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SYNC_STATE_CHANGED_EVENT, { detail: state }))
}

function dispatchLocalConflict(conflict: ConflictInfo): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OFFLINE_CONFLICT_EVENT, { detail: conflict }))
}

function handleCrossWindowMessage(event: MessageEvent<CrossWindowMessage>): void {
  const message = event.data
  if (!message) return

  if (message.type === 'data-changed') {
    // Another window may have flushed or edited rows: refresh the shared
    // outbox bookkeeping before telling this window to re-read the cache.
    void import('./queue')
      .then(({ reloadPendingState }) => reloadPendingState())
      .then(() => dispatchLocalDataChanged({ table: message.table, recordId: message.recordId }))
      .catch(() => {})
    return
  }

  if (message.type === 'sync-state') {
    dispatchLocalSyncState(message.state)
    return
  }

  if (message.type === 'conflict') {
    dispatchLocalConflict(message.conflict)
  }
}

function getCrossWindowChannel(): BroadcastChannel | null {
  if (!CROSS_WINDOW_ENABLED) return null
  if (!crossWindowChannel) {
    crossWindowChannel = new BroadcastChannel('mindviz-offline')
    crossWindowChannel.onmessage = handleCrossWindowMessage
  }
  return crossWindowChannel
}

function broadcast(message: CrossWindowMessage): void {
  getCrossWindowChannel()?.postMessage(message)
}

export function emitDataChanged(table: OfflineTable, recordId?: string): void {
  dispatchLocalDataChanged({ table, recordId })
  broadcast({ type: 'data-changed', table, recordId })
}

export function subscribeToDataChanges(
  listener: (detail: { table: OfflineTable; recordId?: string }) => void
): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ table: OfflineTable; recordId?: string }>
    if (customEvent.detail) listener(customEvent.detail)
  }
  window.addEventListener(OFFLINE_DATA_CHANGED_EVENT, handler)
  return () => window.removeEventListener(OFFLINE_DATA_CHANGED_EVENT, handler)
}

export function emitSyncState(state: SyncState): void {
  dispatchLocalSyncState(state)
  broadcast({ type: 'sync-state', state })
}

export function subscribeToSyncState(listener: (state: SyncState) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<SyncState>
    if (customEvent.detail) listener(customEvent.detail)
  }
  window.addEventListener(SYNC_STATE_CHANGED_EVENT, handler)
  return () => window.removeEventListener(SYNC_STATE_CHANGED_EVENT, handler)
}

export function emitConflict(conflict: ConflictInfo): void {
  dispatchLocalConflict(conflict)
  broadcast({ type: 'conflict', conflict })
}

export function subscribeToConflicts(listener: (conflict: ConflictInfo) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ConflictInfo>
    if (customEvent.detail) listener(customEvent.detail)
  }
  window.addEventListener(OFFLINE_CONFLICT_EVENT, handler)
  return () => window.removeEventListener(OFFLINE_CONFLICT_EVENT, handler)
}
