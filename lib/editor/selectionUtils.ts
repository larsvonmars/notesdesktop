/**
 * Selection utilities for contentEditable editors.
 *
 * Centralizes common selection/range helpers so editor components avoid
 * duplicating fragile DOM selection logic.
 */

export interface SelectionContext {
  selection: Selection
  range: Range
  anchorNode: Node
  element: HTMLElement
}

const nodeToElement = (node: Node | null): HTMLElement | null => {
  if (!node) return null
  return node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
}

/**
 * Returns normalized selection context for the current browser selection.
 * If `root` is provided, selection must be inside `root`.
 */
export function getSelectionContext(root?: HTMLElement | null): SelectionContext | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  if (!range.commonAncestorContainer.isConnected) return null

  if (root && !root.contains(range.commonAncestorContainer)) {
    return null
  }

  const anchorNode = range.startContainer
  if (!anchorNode.isConnected) return null

  const element = nodeToElement(anchorNode)
  if (!element) return null

  if (root && !root.contains(element)) {
    return null
  }

  return {
    selection,
    range,
    anchorNode,
    element,
  }
}

/**
 * Checks if the active browser selection is inside `root`.
 */
export function isSelectionInsideRoot(root: HTMLElement | null): boolean {
  if (!root) return false
  return getSelectionContext(root) !== null
}

/**
 * Save current selection range (clone) if selection exists and is within `root`.
 */
export function saveSelectionRange(root?: HTMLElement | null): Range | null {
  const context = getSelectionContext(root)
  if (!context) return null
  return context.range.cloneRange()
}

/**
 * Restore a previously saved range if it is still connected (and within `root`, if provided).
 */
export function restoreSelectionRange(range: Range | null, root?: HTMLElement | null): boolean {
  if (!range) return false

  if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
    return false
  }

  if (root && (!root.contains(range.startContainer) || !root.contains(range.endContainer))) {
    return false
  }

  const selection = window.getSelection()
  if (!selection) return false

  try {
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  } catch {
    return false
  }
}

/**
 * Finds the closest element matching `selector` from the current selection anchor.
 */
export function getClosestFromSelection(
  selector: string,
  root?: HTMLElement | null
): HTMLElement | null {
  const context = getSelectionContext(root)
  if (!context) return null

  const match = context.element.closest(selector)
  if (!(match instanceof HTMLElement)) return null
  if (root && !root.contains(match)) return null

  return match
}
