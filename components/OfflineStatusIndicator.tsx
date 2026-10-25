'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CloudOff, CloudUpload, RefreshCw, X } from 'lucide-react'
import { subscribeToSyncState } from '@/lib/offline/events'
import { getConflictedMutations } from '@/lib/offline/queue'
import { flushOutbox, getSyncState, resolveConflict } from '@/lib/offline/sync'
import type { QueuedMutation, SyncState } from '@/lib/offline/types'

function conflictLabel(entry: QueuedMutation): string {
  const title = (entry.local?.title ?? entry.local?.name ?? entry.remote?.title ?? entry.remote?.name) as
    | string
    | undefined
  return title || `${entry.table === 'notes' ? 'Note' : 'Folder'} ${entry.recordId.slice(0, 8)}`
}

export default function OfflineStatusIndicator() {
  const [state, setState] = useState<SyncState | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [conflicts, setConflicts] = useState<QueuedMutation[]>([])

  const refresh = useCallback(async () => {
    setState(await getSyncState())
  }, [])

  useEffect(() => {
    void refresh()
    const unsubscribe = subscribeToSyncState(setState)
    const handleOnline = () => void refresh()
    const handleOffline = () => void refresh()
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      unsubscribe()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refresh])

  const openDetails = useCallback(async () => {
    const next = await getConflictedMutations()
    setConflicts(next)
    setShowDetails((previous) => !previous)
  }, [])

  const retry = useCallback(async () => {
    setIsSyncing(true)
    try {
      await flushOutbox(undefined, { retryFailed: true })
      await refresh()
      setConflicts(await getConflictedMutations())
    } finally {
      setIsSyncing(false)
    }
  }, [refresh])

  const resolve = useCallback(
    async (mutationId: string, strategy: 'keep-local' | 'use-remote') => {
      setIsSyncing(true)
      try {
        await resolveConflict(mutationId, strategy)
        await refresh()
        setConflicts(await getConflictedMutations())
      } finally {
        setIsSyncing(false)
      }
    },
    [refresh]
  )

  if (!state) return null

  const needsAttention =
    !state.online || state.pending > 0 || state.failed > 0 || state.conflicts > 0
  if (!needsAttention) return null

  const label = !state.online
    ? 'Offline — changes saved locally'
    : state.conflicts > 0
      ? `${state.conflicts} conflict${state.conflicts === 1 ? '' : 's'}`
      : state.failed > 0
        ? `${state.failed} change${state.failed === 1 ? '' : 's'} need attention`
        : state.pending > 0
          ? `Syncing ${state.pending} change${state.pending === 1 ? '' : 's'}…`
          : 'Synced'

  const isAttention = state.conflicts > 0 || state.failed > 0
  const iconTone = !state.online
    ? 'bg-[var(--surface-sunken)] text-muted'
    : isAttention
      ? 'bg-[var(--warning-light)] text-warning'
      : 'bg-[var(--accent-light)] text-accent'

  const Icon = !state.online
    ? CloudOff
    : isAttention
      ? AlertTriangle
      : isSyncing
        ? RefreshCw
        : CloudUpload

  return (
    <div className="fixed bottom-4 right-4 z-[90] max-w-sm text-xs">
      <div
        className="glass-strong flex items-center gap-1 rounded-full py-1 pl-1.5 pr-1"
        aria-live="polite"
      >
        <button
          type="button"
          onClick={() => void openDetails()}
          className="focus-ring flex min-w-0 items-center gap-2 rounded-full py-1 pl-0.5 pr-1.5 text-left"
          title="Open offline sync details"
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded-full ${iconTone}`} aria-hidden>
            <Icon size={13} className={isSyncing ? 'animate-spin' : undefined} strokeWidth={2} />
          </span>
          <span className="min-w-0 truncate font-medium text-foreground" title={label}>{label}</span>
        </button>
        {state.online && (state.pending > 0 || state.failed > 0) && (
          <button
            type="button"
            onClick={() => void retry()}
            className="focus-ring rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-semibold text-foreground transition-colors duration-150 hover:bg-[var(--surface-hover)]"
          >
            Retry
          </button>
        )}
      </div>

      {showDetails && (
        <div className="glass-popover mt-2 animate-rise-in rounded-2xl p-3 text-foreground">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              Offline sync
            </div>
            <button
              type="button"
              onClick={() => setShowDetails(false)}
              className="focus-ring rounded-full p-1 text-muted transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-foreground"
              aria-label="Close sync details"
            >
              <X size={12} />
            </button>
          </div>

          {!state.online && (
            <p className="mb-2 text-[11px] leading-relaxed text-muted">
              You are offline. Edits are written to this device and will sync automatically
              when the connection returns.
            </p>
          )}

          {conflicts.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted">
              {state.pending > 0
                ? `${state.pending} local change${state.pending === 1 ? '' : 's'} waiting to sync.`
                : 'No conflicts. Everything local has been sent.'}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] leading-relaxed text-muted">
                These items changed elsewhere while you had unsynced edits. Choose which
                version to keep.
              </p>
              {conflicts.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-2"
                >
                  <div className="mb-1 truncate text-[11px] font-medium" title={conflictLabel(entry)}>
                    {conflictLabel(entry)}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => void resolve(entry.id, 'keep-local')}
                      className="focus-ring rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] font-medium transition-colors duration-150 hover:bg-[var(--surface-hover)] disabled:opacity-50"
                    >
                      Keep my version
                    </button>
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => void resolve(entry.id, 'use-remote')}
                      className="focus-ring rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] font-medium transition-colors duration-150 hover:bg-[var(--surface-hover)] disabled:opacity-50"
                    >
                      Use server version
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {state.lastSyncedAt && (
            <p className="mt-2 text-[10px] text-muted">
              Last synced {new Date(state.lastSyncedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}