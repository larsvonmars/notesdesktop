/**
 * Snapshot/restore helpers for an active text selection inside a contentEditable
 * editor.
 *
 * Why this exists: the floating formatting toolbar must not lose the user's
 * selection when a toolbar button is pressed. Depending on the platform
 * (desktop mouse, touch, WebView quirks) the browser may:
 *   - move focus to the button and collapse the document selection, or
 *   - drop the selection entirely while the previous command rewrote the DOM.
 *
 * A snapshot keeps two ways to get the selection back:
 *   1. Node identity — `Range.cloneRange()`. Most commands move the original
 *      nodes (wrapping/unwrapping only reparents them), so the exact nodes are
 *      still connected and can be re-selected.
 *   2. Block index + text offsets — survives commands that rebuild the block
 *      element (heading/list conversions) by re-locating the block inside the
 *      editor and resolving the captured character offsets again.
 *
 * Both paths are validated against the text the user had selected, so a
 * mutated DOM can never silently move the selection to different words.
 */

import {
  captureBlockSelection,
  positionFromTextOffset,
  type BlockSelectionSnapshot,
} from './cursorPosition'

export interface SavedSelectionSnapshot {
  /** Cloned range — valid as long as its boundary nodes stay connected. */
  range: Range
  /** Text the range selected at capture time (used to validate a restore). */
  text: string
  /** Index of the containing top-level block among the editor's children. */
  blockIndex: number
  /** Text-offset snapshot inside that block (fallback locator). */
  blockSnapshot: BlockSelectionSnapshot | null
}

/**
 * Find the top-level block element (direct child of the editor) that contains
 * `node`, drilling up through inline wrappers.
 */
export function findSelectionBlock(
  node: Node | null,
  editor: HTMLElement
): HTMLElement | null {
  if (!node || !editor) return null

  let element: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement

  while (element && element !== editor) {
    if (element.parentElement === editor) return element
    element = element.parentElement
  }

  return null
}

/**
 * Capture a restorable snapshot of `range` when it lives inside `editor`.
 * Returns `null` for missing, collapsed or foreign ranges.
 */
export function captureSelectionSnapshot(
  range: Range | null | undefined,
  editor: HTMLElement | null | undefined
): SavedSelectionSnapshot | null {
  if (!range || !editor || !editor.isConnected) return null

  try {
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) return null
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      return null
    }

    const block = findSelectionBlock(range.startContainer, editor)
    const blockSnapshot = block ? captureBlockSelection(block) : null
    const blockIndex = block ? Array.prototype.indexOf.call(editor.children, block) : -1

    return {
      range: range.cloneRange(),
      text: range.toString(),
      blockIndex,
      blockSnapshot,
    }
  } catch {
    return null
  }
}

function resolveBlockByIndex(editor: HTMLElement, blockIndex: number): HTMLElement | null {
  if (blockIndex < 0 || blockIndex >= editor.children.length) return null
  const child = editor.children[blockIndex]
  return child instanceof HTMLElement ? child : null
}

function selectionMatches(selection: Selection, expected: string): boolean {
  if (!expected) return true
  try {
    return selection.toString() === expected
  } catch {
    return false
  }
}

/**
 * Last-resort restore: walk the block's text content and re-apply the captured
 * character offsets. The result is validated against the captured text so a
 * shifted block (list conversion, inserted text) never selects the wrong words.
 */
function restoreFromBlockOffsets(
  snapshot: SavedSelectionSnapshot,
  editor: HTMLElement
): boolean {
  const blockSnapshot = snapshot.blockSnapshot
  if (!blockSnapshot) return false

  const block = resolveBlockByIndex(editor, snapshot.blockIndex)
  if (!block) return false

  const selection = window.getSelection()
  if (!selection) return false

  try {
    const start = positionFromTextOffset(block, blockSnapshot.startTextOffset)
    const range = document.createRange()
    range.setStart(start.node, start.offset)

    const spansText =
      !blockSnapshot.collapsed && blockSnapshot.endTextOffset > blockSnapshot.startTextOffset

    if (spansText) {
      const end = positionFromTextOffset(block, blockSnapshot.endTextOffset)
      range.setEnd(end.node, end.offset)
    } else {
      range.collapse(true)
    }

    selection.removeAllRanges()
    selection.addRange(range)

    return spansText ? selectionMatches(selection, snapshot.text) : true
  } catch {
    return false
  }
}

/**
 * Re-apply a snapshot. Focuses the editor first so the restored range becomes
 * the live selection (required before running exec-style commands).
 *
 * The restore is validated: a range whose text no longer matches the captured
 * selection is rejected rather than silently applied to the wrong words.
 *
 * @returns `true` when a usable selection was applied.
 */
export function restoreSelectionSnapshot(
  snapshot: SavedSelectionSnapshot | null | undefined,
  editor: HTMLElement | null | undefined
): boolean {
  if (!snapshot || !editor || !editor.isConnected) return false

  try {
    const selection = window.getSelection()
    if (!selection) return false

    // Focus first: a range applied while another element owns focus is not
    // necessarily the active selection in every WebView.
    try {
      editor.focus({ preventScroll: true })
    } catch {
      try {
        editor.focus()
      } catch {
        /* best effort */
      }
    }

    // 1) Exact node-identity restore.
    const { range } = snapshot
    if (range.startContainer.isConnected && range.endContainer.isConnected) {
      try {
        selection.removeAllRanges()
        selection.addRange(range)
        // Browsers keep live ranges in sync when a wrapping command splits the
        // text node, so the clone already covers the styled text. If it does
        // not (or the offsets no longer line up), reject and try the fallback.
        if (selectionMatches(selection, snapshot.text)) return true
      } catch {
        // Fall through to the block-offset fallback.
      }
    }

    // 2) Block index + text offsets (survives block replacement).
    if (restoreFromBlockOffsets(snapshot, editor)) return true

    return false
  } catch {
    return false
  }
}
