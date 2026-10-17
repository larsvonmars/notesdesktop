export type OfflineTable = 'notes' | 'folders'

export type MutationOperation = 'insert' | 'update' | 'delete'
export type MutationStatus = 'pending' | 'failed' | 'conflicted'

export interface QueuedMutation {
  id: string
  table: OfflineTable
  operation: MutationOperation
  recordId: string
  userId: string | null
  payload: Record<string, unknown>
  /**
   * `updated_at` the local edit was based on. Used to make the server update
   * conditional (`WHERE id = ? AND updated_at = ?`) so concurrent edits from
   * another window/device are detected instead of silently overwritten.
   */
  baseUpdatedAt?: string | null
  createdAt: string
  attempts: number
  status: MutationStatus
  lastError?: string
  /** Local row kept when a conflict was detected. */
  local?: Record<string, unknown> | null
  /** Latest server row captured when a conflict was detected. */
  remote?: Record<string, unknown> | null
}

export interface ConflictInfo {
  mutationId: string
  table: OfflineTable
  recordId: string
  message: string
  local: Record<string, unknown> | null
  remote: Record<string, unknown> | null
}

export interface SyncState {
  online: boolean
  pending: number
  failed: number
  conflicts: number
  lastSyncedAt: string | null
}

export interface FlushResult {
  processed: number
  pending: number
  conflicts: ConflictInfo[]
  networkError: boolean
}
