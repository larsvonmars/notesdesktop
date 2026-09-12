'use client'

/**
 * Owns the floating text-selection formatting toolbar.
 *
 * Reliability rules implemented here (learned from real WebView behaviour):
 *  - The toolbar is only shown once a selection gesture is finished. While the
 *    pointer is down the toolbar stays hidden, so it can never sit under the
 *    cursor and swallow drag events.
 *  - `selectionchange` (keyboard selection, Select-All, programmatic changes)
 *    updates the toolbar as well, but never during a pointer drag.
 *  - Touching the toolbar itself is invisible to this hook: pressing a button
 *    must not count as "clicked elsewhere" and must not hide the toolbar.
 *  - Every valid selection is snapshotted. If the browser drops the selection
 *    before a command runs (focus moves to the button, touch taps, WebView
 *    quirks), `ensureEditorSelection()` restores it synchronously so the
 *    command still applies to the text the user selected.
 *  - Geometry uses per-line rects: above the first line by default, below the
 *    last line when there is no room above, clamped into the viewport, and
 *    hidden when the selection itself scrolled out of view.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  computeToolbarPosition,
  type RectLike,
  type ToolbarPlacement,
} from './toolbarPosition'
import {
  captureSelectionSnapshot,
  restoreSelectionSnapshot,
  type SavedSelectionSnapshot,
} from './selectionSnapshot'

/** Fallback height used before the toolbar has been measured once. */
const FALLBACK_HEIGHT = 44
const VIEWPORT_MARGIN = 16
const SELECTION_GAP = 10
/** Safety valve: never let a missed `click` keep the toolbar in "interaction" mode. */
const TOOLBAR_INTERACTION_TIMEOUT = 1500

export interface FloatingToolbarState {
  visible: boolean
  top: number
  left: number
  placement: ToolbarPlacement
}

export interface UseFloatingToolbarOptions {
  /** Resolved lazily on every check so the hook never depends on a DOM node instance. */
  getEditorElement: () => HTMLElement | null
  /** When false the toolbar is force-hidden (e.g. while saving or deleting). */
  enabled?: boolean
  /**
   * Touch/compact layouts dock the toolbar at the bottom edge — position is
   * then CSS-driven and no selection geometry is computed.
   */
  docked?: boolean
}

export interface FloatingToolbarApi {
  state: FloatingToolbarState
  /** Attach to the toolbar element: used for measuring and click-through detection. */
  toolbarRef: React.RefObject<HTMLDivElement | null>
  /** Recompute visibility/position (rAF-coalesced). Safe to call on every keystroke. */
  refresh: () => void
  /** Hide immediately. Keeps the last selection snapshot for a pending command. */
  hide: () => void
  /** Hide and drop the snapshot (note switched, editor torn down). */
  reset: () => void
  /**
   * Guarantee a live selection inside the editor before running a command.
   * Restores the last snapshot when the browser lost the selection.
   */
  ensureEditorSelection: () => boolean
}

/**
 * Client rects describing the selection, one per rendered line where the
 * browser reports them. Returns an empty array when the selection has no
 * usable geometry or has scrolled out of the visible editor/window.
 */
function collectSelectionLineRects(range: Range, editorRect: DOMRect): RectLike[] {
  const usable: RectLike[] = []
  const isUsable = (rect: { top: number; left: number; width: number; height: number }) =>
    (rect.width > 0 || rect.height > 0) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.left)

  try {
    const rects = range.getClientRects()
    for (let i = 0; i < rects.length; i += 1) {
      if (isUsable(rects[i])) usable.push(rects[i])
    }
  } catch {
    /* fall back to the bounding rect below */
  }

  if (usable.length === 0) {
    try {
      const rect = range.getBoundingClientRect()
      if (isUsable(rect)) usable.push(rect)
    } catch {
      return []
    }
  }

  if (usable.length === 0) return []

  let top = Infinity
  let bottom = -Infinity
  for (const rect of usable) {
    top = Math.min(top, rect.top)
    bottom = Math.max(bottom, rect.bottom)
  }

  // Selection scrolled out of the editor's visible box (editor scrolls internally)…
  if (bottom <= editorRect.top || top >= editorRect.bottom) return []

  // …or out of the window entirely.
  if (bottom <= 0 || top >= window.innerHeight) return []

  return usable
}

/** A selection inside a read-only island (custom block, input, …) cannot be formatted. */
function isInsideNonEditableRegion(range: Range, editor: HTMLElement): boolean {
  const node = range.startContainer
  const element =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  if (!element) return false

  const region = element.closest(
    '[contenteditable="false"], input, textarea, select'
  )
  return !!region && region !== editor && editor.contains(region)
}

export function useFloatingToolbar({
  getEditorElement,
  enabled = true,
  docked = false,
}: UseFloatingToolbarOptions): FloatingToolbarApi {
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const sizeRef = useRef({ width: 0, height: FALLBACK_HEIGHT })
  const savedRef = useRef<SavedSelectionSnapshot | null>(null)
  const frameRef = useRef<number | null>(null)
  const pointerDownRef = useRef(false)
  /** True after the user clicked outside editor+toolbar — stays hidden until they touch the text again. */
  const dismissedRef = useRef(false)
  /** True from pressing a toolbar button until its `click` has been processed. */
  const toolbarInteractionRef = useRef(false)
  const interactionTimerRef = useRef<number | null>(null)

  const [state, setState] = useState<FloatingToolbarState>({
    visible: false,
    top: 0,
    left: 0,
    placement: 'above',
  })

  // Latest prop values without re-creating the callbacks below.
  const getEditorRef = useRef(getEditorElement)
  getEditorRef.current = getEditorElement
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const dockedRef = useRef(docked)
  dockedRef.current = docked

  const visibleRef = useRef(false)
  visibleRef.current = state.visible

  const commit = useCallback(
    (nextVisible: boolean, position?: { top: number; left: number; placement: ToolbarPlacement } | null) => {
      setState((previous) => {
        if (!nextVisible) {
          return previous.visible ? { ...previous, visible: false } : previous
        }

        const top = position ? position.top : previous.top
        const left = position ? position.left : previous.left
        const placement = position ? position.placement : previous.placement

        if (
          previous.visible &&
          Math.abs(previous.top - top) < 0.5 &&
          Math.abs(previous.left - left) < 0.5
        ) {
          return previous
        }

        return { visible: true, top, left, placement }
      })
    },
    []
  )

  const evaluate = useCallback(() => {
    // A toolbar button is being pressed — leave the current state untouched
    // until its click has been handled.
    if (toolbarInteractionRef.current) return

    // The user clicked outside the editor: keep the toolbar hidden even when
    // the browser kept the old selection alive until the text is touched again.
    if (dismissedRef.current) {
      commit(false)
      return
    }

    const editor = getEditorRef.current()

    if (!enabledRef.current || !editor || !editor.isConnected) {
      commit(false)
      return
    }

    // A pointer gesture is in progress (selection drag) — stay out of the way.
    if (pointerDownRef.current) {
      commit(false)
      return
    }

    const selection = typeof window.getSelection === 'function' ? window.getSelection() : null
    if (!selection || selection.rangeCount === 0) {
      commit(false)
      return
    }

    const range = selection.getRangeAt(0)
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
      commit(false)
      return
    }

    const insideEditor =
      editor.contains(range.startContainer) && editor.contains(range.endContainer)

    if (selection.isCollapsed || !insideEditor) {
      // Placing a caret inside the editor is a deliberate new position —
      // the previous snapshot must not be resurrected later.
      if (selection.isCollapsed && insideEditor) savedRef.current = null
      commit(false)
      return
    }

    if (!selection.toString().trim() || isInsideNonEditableRegion(range, editor)) {
      commit(false)
      return
    }

    if (dockedRef.current) {
      savedRef.current = captureSelectionSnapshot(range, editor)
      commit(true)
      return
    }

    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const editorRect = editor.getBoundingClientRect()
    const lineRects = collectSelectionLineRects(range, editorRect)
    if (lineRects.length === 0) {
      commit(false)
      return
    }

    const position = computeToolbarPosition({
      lineRects,
      size: sizeRef.current,
      viewport,
      margin: VIEWPORT_MARGIN,
      gap: SELECTION_GAP,
    })

    if (!position) {
      commit(false)
      return
    }

    savedRef.current = captureSelectionSnapshot(range, editor)
    commit(true, position)
  }, [commit])

  const scheduleEvaluate = useCallback(() => {
    if (typeof window === 'undefined') return
    if (frameRef.current !== null) return

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      evaluate()
    })
  }, [evaluate])

  const cancelScheduled = useCallback(() => {
    if (frameRef.current === null) return
    window.cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  const hide = useCallback(() => {
    cancelScheduled()
    commit(false)
  }, [cancelScheduled, commit])

  const reset = useCallback(() => {
    savedRef.current = null
    hide()
  }, [hide])

  const endToolbarInteraction = useCallback(() => {
    if (interactionTimerRef.current !== null) {
      window.clearTimeout(interactionTimerRef.current)
      interactionTimerRef.current = null
    }
    toolbarInteractionRef.current = false
    scheduleEvaluate()
  }, [scheduleEvaluate])

  const beginToolbarInteraction = useCallback(() => {
    toolbarInteractionRef.current = true
    if (interactionTimerRef.current !== null) {
      window.clearTimeout(interactionTimerRef.current)
    }
    interactionTimerRef.current = window.setTimeout(() => {
      interactionTimerRef.current = null
      toolbarInteractionRef.current = false
      scheduleEvaluate()
    }, TOOLBAR_INTERACTION_TIMEOUT)
  }, [scheduleEvaluate])

  const ensureEditorSelection = useCallback((): boolean => {
    const editor = getEditorRef.current()
    if (!editor || !editor.isConnected) return false

    const selection = typeof window.getSelection === 'function' ? window.getSelection() : null
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (
        !range.collapsed &&
        range.startContainer.isConnected &&
        range.endContainer.isConnected &&
        editor.contains(range.startContainer) &&
        editor.contains(range.endContainer)
      ) {
        return true
      }
    }

    return restoreSelectionSnapshot(savedRef.current, editor)
  }, [])

  // ── Event wiring ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return

    const isInsideToolbar = (target: EventTarget | null): boolean => {
      const toolbar = toolbarRef.current
      return !!toolbar && !!target && toolbar.contains(target as Node)
    }

    const handleSelectionChange = () => {
      // Drag selection in progress or button press in flight: no updates.
      if (pointerDownRef.current || toolbarInteractionRef.current) return
      scheduleEvaluate()
    }

    const handlePointerDown = (event: PointerEvent) => {
      // Primary button only — a right-click must not hide the toolbar behind a
      // native context menu that may never deliver a matching pointerup.
      if (event.button !== 0) return

      if (isInsideToolbar(event.target)) {
        beginToolbarInteraction()
        return
      }

      // Anywhere else: a new gesture begins, the previous selection is replaced.
      // Presses inside the editor are a new selection gesture; presses outside
      // dismiss the toolbar until the text is touched again.
      const editor = getEditorRef.current()
      const insideEditor =
        !!editor && !!event.target && editor.contains(event.target as Node)
      dismissedRef.current = !insideEditor

      toolbarInteractionRef.current = false
      if (interactionTimerRef.current !== null) {
        window.clearTimeout(interactionTimerRef.current)
        interactionTimerRef.current = null
      }
      pointerDownRef.current = true
      cancelScheduled()
      commit(false)
    }

    const handlePointerUp = () => {
      if (!pointerDownRef.current) return
      pointerDownRef.current = false
      // A frame after release: the browser finalizes the selection at mouseup.
      scheduleEvaluate()
    }

    const handlePointerCancel = () => {
      if (!pointerDownRef.current) return
      pointerDownRef.current = false
      scheduleEvaluate()
    }

    const handleClick = () => {
      if (toolbarInteractionRef.current) endToolbarInteraction()
    }

    const handleViewportChange = () => {
      if (pointerDownRef.current || toolbarInteractionRef.current) return
      scheduleEvaluate()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const editor = getEditorRef.current()

      // Keyboard interaction with the text re-arms the toolbar (e.g. Tab back
      // into the editor, then Shift+Arrow).
      if (editor && event.target instanceof Node && editor.contains(event.target)) {
        dismissedRef.current = false
      }

      if (event.key !== 'Escape' || !visibleRef.current) return
      hide()
      if (editor && editor.isConnected) {
        try {
          editor.focus({ preventScroll: true })
        } catch {
          /* best effort */
        }
      }
    }

    const handleWindowBlur = () => {
      pointerDownRef.current = false
      hide()
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointerup', handlePointerUp, true)
    document.addEventListener('pointercancel', handlePointerCancel, true)
    document.addEventListener('touchend', handlePointerUp, true)
    document.addEventListener('touchcancel', handlePointerCancel, true)
    document.addEventListener('click', handleClick, true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointerup', handlePointerUp, true)
      document.removeEventListener('pointercancel', handlePointerCancel, true)
      document.removeEventListener('touchend', handlePointerUp, true)
      document.removeEventListener('touchcancel', handlePointerCancel, true)
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleViewportChange, true)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [
    beginToolbarInteraction,
    endToolbarInteraction,
    commit,
    cancelScheduled,
    scheduleEvaluate,
    hide,
  ])

  // Re-measure whenever the toolbar element changes size (expanding the "more"
  // panel, wrapping on narrow screens, …) and re-run the placement math.
  useLayoutEffect(() => {
    if (!state.visible) return
    const element = toolbarRef.current
    if (!element) return

    const measure = () => {
      const width = element.offsetWidth
      const height = element.offsetHeight
      if (width <= 0 && height <= 0) return

      const previous = sizeRef.current
      if (Math.abs(previous.width - width) > 0.5 || Math.abs(previous.height - height) > 0.5) {
        sizeRef.current = { width, height }
        scheduleEvaluate()
      }
    }

    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [state.visible, scheduleEvaluate])

  // Force-hide as soon as the toolbar is disabled (saving, deleting, …).
  useEffect(() => {
    if (!enabled) {
      cancelScheduled()
      commit(false)
    }
  }, [enabled, cancelScheduled, commit])

  // Layout mode changed (desktop ↔ touch): recompute with the new rules.
  useEffect(() => {
    scheduleEvaluate()
  }, [docked, scheduleEvaluate])

  // Clean up pending timers/frames on unmount.
  useEffect(
    () => () => {
      cancelScheduled()
      if (interactionTimerRef.current !== null) {
        window.clearTimeout(interactionTimerRef.current)
        interactionTimerRef.current = null
      }
    },
    [cancelScheduled]
  )

  return {
    state,
    toolbarRef,
    refresh: scheduleEvaluate,
    hide,
    reset,
    ensureEditorSelection,
  }
}
