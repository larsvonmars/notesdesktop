import { useCallback, useMemo, useRef, useState } from 'react'
import type { WorkspaceView } from '@/lib/workspace/types'

/**
 * Small, pure, in-memory navigation history for the shell.
 *
 * The app deliberately does not use React Router. This module gives the shell
 * browser-like back/forward semantics over a serialisable location so the top
 * bar's back/forward buttons (and ⌘[ / ⌘]) work without touching the URL.
 *
 * Reducer functions are pure and exported for unit tests; {@link useNavHistory}
 * is a thin React wrapper.
 */
export interface NavLocation {
  view: WorkspaceView
  folderId: string | null
  projectId: string | null
  noteId: string | null
}

export interface NavHistoryState {
  /** Oldest → newest. Never empty once created. */
  entries: NavLocation[]
  /** Index of the current entry inside `entries`. */
  index: number
}

export const DEFAULT_MAX_NAV_HISTORY = 50

/** Normalise a location so equality checks are stable. */
export function normaliseNavLocation(location: NavLocation): NavLocation {
  return {
    view: location.view,
    folderId: location.folderId ?? null,
    projectId: location.projectId ?? null,
    noteId: location.noteId ?? null,
  }
}

/** Deep equality for two locations (all four serialisable fields). */
export function navLocationsEqual(a: NavLocation | null, b: NavLocation | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.view === b.view &&
    a.folderId === b.folderId &&
    a.projectId === b.projectId &&
    a.noteId === b.noteId
  )
}

/** Create a history containing a single location. */
export function createNavHistory(initial: NavLocation): NavHistoryState {
  return { entries: [normaliseNavLocation(initial)], index: 0 }
}

/** The entry the user is currently looking at. */
export function currentNavLocation(state: NavHistoryState): NavLocation | null {
  return state.entries[state.index] ?? null
}

export function canGoBack(state: NavHistoryState): boolean {
  return state.index > 0
}

export function canGoForward(state: NavHistoryState): boolean {
  return state.index < state.entries.length - 1
}

/**
 * Push a new location. No-ops when it equals the current entry, drops any
 * forward entries, and trims the oldest entries past `maxEntries`.
 */
export function pushNavLocation(
  state: NavHistoryState,
  location: NavLocation,
  maxEntries: number = DEFAULT_MAX_NAV_HISTORY
): NavHistoryState {
  const next = normaliseNavLocation(location)
  const current = state.entries[state.index] ?? null
  if (navLocationsEqual(current, next)) return state

  const entries = state.entries.slice(0, state.index + 1)
  entries.push(next)

  const limit = Math.max(1, Math.floor(maxEntries))
  while (entries.length > limit) entries.shift()

  return { entries, index: entries.length - 1 }
}

/** Replace the current entry in place (used for in-place URL/state sync). */
export function replaceNavLocation(
  state: NavHistoryState,
  location: NavLocation
): NavHistoryState {
  const next = normaliseNavLocation(location)
  const current = state.entries[state.index] ?? null
  if (navLocationsEqual(current, next)) return state

  const entries = state.entries.slice()
  entries[state.index] = next
  return { entries, index: state.index }
}

export function backNavLocation(state: NavHistoryState): NavHistoryState {
  if (!canGoBack(state)) return state
  return { entries: state.entries, index: state.index - 1 }
}

export function forwardNavLocation(state: NavHistoryState): NavHistoryState {
  if (!canGoForward(state)) return state
  return { entries: state.entries, index: state.index + 1 }
}

/** Drop the whole history and start again from `location`. */
export function resetNavHistory(location: NavLocation): NavHistoryState {
  return createNavHistory(location)
}

export interface UseNavHistoryOptions {
  /** Maximum retained entries. Defaults to {@link DEFAULT_MAX_NAV_HISTORY}. */
  maxEntries?: number
}

export interface UseNavHistoryResult {
  /** Current location (never `null` after mount). */
  location: NavLocation
  state: NavHistoryState
  canGoBack: boolean
  canGoForward: boolean
  /** Number of entries behind / ahead of the current one. */
  backCount: number
  forwardCount: number
  push: (location: NavLocation) => void
  replace: (location: NavLocation) => void
  back: () => void
  forward: () => void
  reset: (location: NavLocation) => void
}

/**
 * React wrapper around the pure history reducers. The initial location is only
 * read on first render — use `reset` to restart from a new location.
 */
export function useNavHistory(
  initial: NavLocation,
  options: UseNavHistoryOptions = {}
): UseNavHistoryResult {
  const [state, setState] = useState<NavHistoryState>(() => createNavHistory(initial))

  const maxEntriesRef = useRef(options.maxEntries ?? DEFAULT_MAX_NAV_HISTORY)
  maxEntriesRef.current = options.maxEntries ?? DEFAULT_MAX_NAV_HISTORY

  const push = useCallback((location: NavLocation) => {
    setState((previous) => pushNavLocation(previous, location, maxEntriesRef.current))
  }, [])

  const replace = useCallback((location: NavLocation) => {
    setState((previous) => replaceNavLocation(previous, location))
  }, [])

  const back = useCallback(() => {
    setState((previous) => backNavLocation(previous))
  }, [])

  const forward = useCallback(() => {
    setState((previous) => forwardNavLocation(previous))
  }, [])

  const reset = useCallback((location: NavLocation) => {
    setState(resetNavHistory(location))
  }, [])

  const location = currentNavLocation(state) ?? normaliseNavLocation(initial)

  return useMemo(
    () => ({
      location,
      state,
      canGoBack: canGoBack(state),
      canGoForward: canGoForward(state),
      backCount: state.index,
      forwardCount: state.entries.length - 1 - state.index,
      push,
      replace,
      back,
      forward,
      reset,
    }),
    [location, state, push, replace, back, forward, reset]
  )
}
