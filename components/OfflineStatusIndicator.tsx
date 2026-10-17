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

  const tone = state.conflicts > 0 || state.failed > 0
    ? 'border-amber-400/60 bg-amber-50 text-amber-900 dark:bg-amber-950/70 dark:text-amber-100'
    : state.online
      ? 'border-border bg-surface text-foreground'
      : 'border-slate-400/60 bg-slate-900 text-slate-100'

  const Icon = !state.online
    ? CloudOff
    : state.conflicts > 0 || state.failed > 0
      ? AlertTriangle
      : isSyncing
        ? RefreshCw
        : CloudUpload

  return (
    <div className="fixed bottom-4 right-4 z-[90] max-w-sm text-xs">
      <div
        className={`flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 shadow-lg backdrop-blur transition-colors ${tone}`}
        aria-live="polite"
      >
        <button
          type="button"
          onClick={() => void openDetails()}
          className="flex items-center gap-2 py-1 text-left"
          title="Open offline sync details"
        >
          <Icon size={14} className={isSyncing ? 'animate-spin' : undefined} />
          <span className="font-medium">{label}</span>
        </button>
        {state.online && (state.pending > 0 || state.failed > 0) && (
          <button
            type="button"
            onClick={() => void retry()}
            className="rounded-full border border-current/20 px-2 py-0.5 font-semibold hover:bg-black/5"
          >
            Retry
          </button>
        )}
      </div>

      {showDetails && (
        <div className="mt-2 rounded-xl border border-border bg-surface p-3 text-foreground shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Offline sync
            </div>
            <button
              type="button"
              onClick={() => setShowDetails(false)}
              className="rounded p-1 text-muted hover:bg-surface-hover"
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
                <div key={entry.id} className="rounded-lg border border-border/70 p-2">
                  <div className="mb-1 truncate text-[11px] font-medium" title={conflictLabel(entry)}>
                    {conflictLabel(entry)}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => void resolve(entry.id, 'keep-local')}
                      className="rounded border border-border px-2 py-1 text-[10px] font-medium hover:bg-surface-hover disabled:opacity-50"
                    >
                      Keep my version
                    </button>
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => void resolve(entry.id, 'use-remote')}
                      className="rounded border border-border px-2 py-1 text-[10px] font-medium hover:bg-surface-hover disabled:opacity-50"
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
