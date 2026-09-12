/**
 * Cursor Position Management Utilities
 * 
 * Centralizes cursor positioning logic for better consistency across the editor.
 * Handles WebView-specific timing and focus management.
 */

/**
 * Position cursor at the end of an element
 */
export function setCursorAtEnd(element: HTMLElement): boolean {
  try {
    const selection = window.getSelection()
    if (!selection) return false

    const range = document.createRange()
    
    // Check if element has content
    if (element.childNodes.length > 0) {
      const lastNode = element.childNodes[element.childNodes.length - 1]
      
      if (lastNode.nodeType === Node.TEXT_NODE) {
        // Text node - position at end of text
        range.setStart(lastNode, lastNode.textContent?.length ?? 0)
      } else if (lastNode.nodeType === Node.ELEMENT_NODE) {
        const lastElement = lastNode as Element
        if (lastElement.tagName === 'BR' && element.childNodes.length === 1) {
          // Empty block whose only content is a placeholder <br>:
          // the caret belongs *before* the break, otherwise typing inserts a
          // line after it (<h3><br>text</h3>) instead of filling the block.
          range.setStart(element, 0)
        } else {
          // Element node - position after it
          range.setStartAfter(lastNode)
        }
      } else {
        // Other node types - position at end of element
        range.selectNodeContents(element)
        range.collapse(false)
      }
    } else {
      // Empty element - position at start
      range.setStart(element, 0)
    }
    
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    
    return true
  } catch (error) {
    console.error('Failed to set cursor at end:', error)
    return false
  }
}

/**
 * Position cursor at the start of an element
 */
export function setCursorAtStart(element: HTMLElement): boolean {
  try {
    const selection = window.getSelection()
    if (!selection) return false

    const range = document.createRange()
    
    // Check if element has content
    if (element.childNodes.length > 0) {
      const firstNode = element.childNodes[0]
      range.setStart(firstNode, 0)
    } else {
      range.setStart(element, 0)
    }
    
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    
    return true
  } catch (error) {
    console.error('Failed to set cursor at start:', error)
    return false
  }
}

/**
 * Position cursor inside an element with proper focus management
 * Handles WebView timing requirements
 */
export function positionCursorInElement(
  element: HTMLElement,
  position: 'start' | 'end' = 'end',
  editorElement?: HTMLElement
): void {
  // Ensure editor has focus first (critical for WebView)
  if (editorElement) {
    editorElement.focus()
  }

  // Use requestAnimationFrame to ensure DOM is ready
  requestAnimationFrame(() => {
    // Verify element is still in DOM (important for Tauri)
    if (!element.isConnected) {
      console.warn('Element was removed from DOM before cursor positioning')
      return
    }

    // Position the cursor
    const success = position === 'start' 
      ? setCursorAtStart(element) 
      : setCursorAtEnd(element)

    if (!success && editorElement) {
      // Fallback: position at end of editor
      setCursorAtEnd(editorElement)
    }
  })
}

/**
 * Save and restore cursor position pattern for dialog operations
 */
export interface CursorSnapshot {
  range: Range
  element: HTMLElement
}

/**
 * Create a snapshot of the current cursor position
 */
export function saveCursorPosition(): CursorSnapshot | null {
  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0).cloneRange()
    
    // Find the closest block element for context
    let element: HTMLElement | null = null
    let node: Node | null = range.startContainer
    
    while (node && node.nodeType !== Node.ELEMENT_NODE) {
      node = node.parentElement
    }
    
    if (node) {
      element = node as HTMLElement
    }

    if (!element) return null

    return { range, element }
  } catch (error) {
    console.error('Failed to save cursor position:', error)
    return null
  }
}

/**
 * Restore cursor position from a snapshot
 */
export function restoreCursorPosition(
  snapshot: CursorSnapshot | null,
  editorElement?: HTMLElement
): boolean {
  if (!snapshot) return false

  try {
    const { range, element } = snapshot

    // Verify the element is still in the DOM
    if (!element.isConnected) {
      console.warn('Saved cursor element was removed from DOM')
      return false
    }

    // Focus editor first if provided
    if (editorElement) {
      editorElement.focus()
    }

    // Restore the selection
    const selection = window.getSelection()
    if (!selection) return false

    selection.removeAllRanges()
    selection.addRange(range)

    return true
  } catch (error) {
    console.error('Failed to restore cursor position:', error)
    return false
  }
}

/**
 * Get the text offset within a block element
 * Useful for preserving cursor position across DOM changes
 */
export function getTextOffsetInBlock(block: HTMLElement): number {
  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return 0

    const range = selection.getRangeAt(0)
    let offset = 0
    const walker = document.createTreeWalker(
      block,
      NodeFilter.SHOW_TEXT
    )

    let node: Node | null
    while ((node = walker.nextNode())) {
      if (node === range.startContainer) {
        return offset + range.startOffset
      }
      offset += node.textContent?.length || 0
    }

    return offset
  } catch (error) {
    console.error('Failed to get text offset:', error)
    return 0
  }
}

/**
 * Restore cursor position to a specific text offset within a block
 */
export function restoreTextOffsetInBlock(
  block: HTMLElement,
  targetOffset: number
): boolean {
  try {
    let currentOffset = 0
    const walker = document.createTreeWalker(
      block,
      NodeFilter.SHOW_TEXT
    )

    let node: Node | null
    while ((node = walker.nextNode())) {
      const nodeLength = node.textContent?.length || 0
      
      if (currentOffset + nodeLength >= targetOffset) {
        // Found the target node
        const selection = window.getSelection()
        if (!selection) return false

        const range = document.createRange()
        const offset = Math.min(targetOffset - currentOffset, nodeLength)
        range.setStart(node, offset)
        range.collapse(true)
        
        selection.removeAllRanges()
        selection.addRange(range)
        
        return true
      }
      
      currentOffset += nodeLength
    }

    // If we couldn't find the exact position, set at the end
    return setCursorAtEnd(block)
  } catch (error) {
    console.error('Failed to restore text offset:', error)
    return false
  }
}

/**
 * Snapshot of a selection that is taken *before* a block is replaced.
 *
 * Block format changes (paragraph → heading, list creation, …) move the
 * block's children into a replacement element instead of cloning them, so the
 * captured node references stay valid. That allows the selection to be
 * re-applied synchronously — without it browsers drop the caret to the editor
 * root (the infamous "cursor jumps to the top") for at least one frame, and
 * fast typing lands outside the new block.
 */
export interface BlockSelectionSnapshot {
  startContainer: Node
  startOffset: number
  endContainer: Node
  endOffset: number
  collapsed: boolean
  /** Plain-text offset of the selection start within the block (fallback). */
  startTextOffset: number
  /** Plain-text offset of the selection end within the block (fallback). */
  endTextOffset: number
}

/** Character offset of a DOM position relative to the start of `block`. */
function getCharacterOffsetWithin(
  block: HTMLElement,
  node: Node,
  offset: number
): number | null {
  if (!block.contains(node) && node !== block) return null

  try {
    const probe = document.createRange()
    probe.selectNodeContents(block)
    probe.setEnd(node, offset)
    return probe.toString().length
  } catch {
    return null
  }
}

/** Clamp an offset so it is valid for its node (text length / child count). */
function clampRangeOffset(node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return Math.max(0, Math.min(offset, node.textContent?.length ?? 0))
  }
  return Math.max(0, Math.min(offset, node.childNodes.length))
}

/** Resolve a character offset inside a block to a concrete DOM position. */
function positionFromTextOffset(
  block: HTMLElement,
  offset: number
): { node: Node; offset: number } {
  let remaining = Math.max(0, offset)
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let lastText: Text | null = null

  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node as Text
    lastText = text
    const length = text.data.length
    if (remaining <= length) {
      return { node: text, offset: remaining }
    }
    remaining -= length
  }

  if (lastText) {
    return { node: lastText, offset: lastText.data.length }
  }

  // Block without text nodes (e.g. <p><br></p>) — caret goes before the
  // placeholder so typing fills the block rather than adding a line after it.
  return { node: block, offset: 0 }
}

/**
 * Capture the current selection if it lives inside `block`.
 * Returns null when there is no usable selection (or it belongs elsewhere).
 */
export function captureBlockSelection(block: HTMLElement): BlockSelectionSnapshot | null {
  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) return null
    if (!block.contains(range.startContainer) && range.startContainer !== block) return null

    const startTextOffset =
      getCharacterOffsetWithin(block, range.startContainer, range.startOffset) ?? 0
    const endTextOffset =
      getCharacterOffsetWithin(block, range.endContainer, range.endOffset) ?? startTextOffset

    return {
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset,
      collapsed: range.collapsed,
      startTextOffset,
      endTextOffset,
    }
  } catch (error) {
    console.warn('Failed to capture block selection:', error)
    return null
  }
}

/**
 * Re-apply a captured selection, ideally straight after the block swap.
 *
 * 1. Exact restore using the original nodes (valid because children were moved).
 * 2. Text-offset fallback inside the replacement block.
 *
 * Returns true when a selection was applied.
 */
export function restoreBlockSelection(
  snapshot: BlockSelectionSnapshot | null,
  block?: HTMLElement | null
): boolean {
  if (!snapshot) return false

  const selection = window.getSelection()
  if (!selection) return false

  // 1) Exact restore — same nodes, same offsets.
  if (snapshot.startContainer.isConnected && snapshot.endContainer.isConnected) {
    try {
      const range = document.createRange()
      range.setStart(
        snapshot.startContainer,
        clampRangeOffset(snapshot.startContainer, snapshot.startOffset)
      )
      range.setEnd(
        snapshot.endContainer,
        clampRangeOffset(snapshot.endContainer, snapshot.endOffset)
      )
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    } catch {
      // Fall through to offset-based restore
    }
  }

  // 2) Text-offset fallback within the replacement block.
  if (!block || !block.isConnected) return false

  try {
    const start = positionFromTextOffset(block, snapshot.startTextOffset)
    const range = document.createRange()
    range.setStart(start.node, start.offset)

    if (!snapshot.collapsed && snapshot.endTextOffset > snapshot.startTextOffset) {
      const end = positionFromTextOffset(block, snapshot.endTextOffset)
      range.setEnd(end.node, end.offset)
    } else {
      range.collapse(true)
    }

    selection.removeAllRanges()
    selection.addRange(range)
    return true
  } catch (error) {
    console.warn('Failed to restore block selection:', error)
    return false
  }
}

/**
 * True when the caret is attached to the editor root rather than to a block.
 * This is the state browsers fall back to when the node containing the caret
 * is removed from the DOM (e.g. during a block swap) — and it renders at the
 * very top of the editor, which is what users perceive as "the cursor jumped".
 */
export function isCaretAnchoredToEditorRoot(editorElement: HTMLElement | null | undefined): boolean {
  if (!editorElement) return false

  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return false
    return selection.getRangeAt(0).startContainer === editorElement
  } catch {
    return false
  }
}

/**
 * Scroll the editor minimally so the caret stays visible.
 * Unlike `scrollCursorIntoView` this never animates and never scrolls to a
 * zero-sized (empty block) caret rect, so it cannot cause a visible jump.
 */
export function keepCaretVisibleInEditor(editorElement: HTMLElement | null | undefined): void {
  if (!editorElement || !editorElement.isConnected) return

  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const rect = selection.getRangeAt(0).getBoundingClientRect()
    // Empty blocks report a zero rect at 0,0 — nothing sensible to scroll to.
    if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) return

    const editorRect = editorElement.getBoundingClientRect()
    const margin = 8

    if (rect.top < editorRect.top + margin) {
      editorElement.scrollTop -= editorRect.top + margin - rect.top
    } else if (rect.bottom > editorRect.bottom - margin) {
      editorElement.scrollTop += rect.bottom - (editorRect.bottom - margin)
    }
  } catch {
    // Best-effort only
  }
}

/**
 * Structural caret description that survives a full document replacement
 * (`innerHTML = …`, e.g. undo/redo). Node-based snapshots cannot be used there
 * because every node is recreated, which used to leave undo with the caret at
 * the top of the note.
 */
export interface BlockCursorPath {
  /** Index of the caret's top-level block among the editor's children */
  blockIndex: number
  /** Character offset of the caret inside that block */
  textOffset: number
  /** Whether the captured selection was collapsed */
  collapsed: boolean
  /** Block index of the selection end (only for non-collapsed selections) */
  endBlockIndex?: number
  /** Character offset of the selection end inside its own block */
  endTextOffset?: number
}

/** Closest descendant of `editorElement` that contains `node`. */
function getTopLevelBlock(editorElement: HTMLElement, node: Node): HTMLElement | null {
  let current: Node | null = node
  while (current && current.parentNode !== editorElement) {
    current = current.parentNode
  }
  return current instanceof HTMLElement ? current : null
}

/** Capture the caret as block index + text offset (survives innerHTML swaps). */
export function captureBlockCursorPath(
  editorElement: HTMLElement | null | undefined
): BlockCursorPath | null {
  if (!editorElement) return null

  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    if (!range.startContainer.isConnected) return null
    if (!editorElement.contains(range.startContainer)) return null

    const startBlock = getTopLevelBlock(editorElement, range.startContainer)
    if (!startBlock) return null

    const blockIndex = Array.prototype.indexOf.call(editorElement.children, startBlock)
    if (blockIndex < 0) return null

    const path: BlockCursorPath = {
      blockIndex,
      textOffset:
        getCharacterOffsetWithin(startBlock, range.startContainer, range.startOffset) ?? 0,
      collapsed: range.collapsed,
    }

    if (!range.collapsed) {
      const endBlock = getTopLevelBlock(editorElement, range.endContainer)
      const endBlockIndex = endBlock
        ? Array.prototype.indexOf.call(editorElement.children, endBlock)
        : -1
      if (endBlock && endBlockIndex >= 0) {
        path.endBlockIndex = endBlockIndex
        path.endTextOffset =
          getCharacterOffsetWithin(endBlock, range.endContainer, range.endOffset) ??
          path.textOffset
      }
    }

    return path
  } catch (error) {
    console.warn('Failed to capture block cursor path:', error)
    return null
  }
}

/** Re-apply a caret captured with `captureBlockCursorPath`. */
export function restoreBlockCursorPath(
  editorElement: HTMLElement | null | undefined,
  path: BlockCursorPath | null
): boolean {
  if (!editorElement || !path) return false

  const blocks = editorElement.children
  if (blocks.length === 0) return false

  const selection = window.getSelection()
  if (!selection) return false

  try {
    const clampIndex = (index: number) => Math.max(0, Math.min(index, blocks.length - 1))
    const startBlock = blocks[clampIndex(path.blockIndex)] as HTMLElement
    const start = positionFromTextOffset(startBlock, path.textOffset)

    const range = document.createRange()
    range.setStart(start.node, start.offset)

    if (!path.collapsed && path.endBlockIndex !== undefined && path.endTextOffset !== undefined) {
      const endBlock = blocks[clampIndex(path.endBlockIndex)] as HTMLElement
      const end = positionFromTextOffset(endBlock, path.endTextOffset)
      try {
        range.setEnd(end.node, end.offset)
      } catch {
        range.collapse(true)
      }
    } else {
      range.collapse(true)
    }

    selection.removeAllRanges()
    selection.addRange(range)
    return true
  } catch (error) {
    console.warn('Failed to restore block cursor path:', error)
    return false
  }
}

/**
 * Ensure cursor is visible by scrolling it into view
 */
export function scrollCursorIntoView(): void {
  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const container = range.startContainer
    
    // Get the element to scroll into view
    const element = container.nodeType === Node.ELEMENT_NODE
      ? container as Element
      : container.parentElement

    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      })
    }
  } catch (error) {
    console.error('Failed to scroll cursor into view:', error)
  }
}

/**
 * Create a marker element after cursor position
 * Useful for maintaining position across complex DOM operations
 */
export function createCursorMarker(): HTMLSpanElement | null {
  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    const marker = document.createElement('span')
    marker.id = `cursor-marker-${Date.now()}`
    marker.style.display = 'none'
    
    range.insertNode(marker)
    
    return marker
  } catch (error) {
    console.error('Failed to create cursor marker:', error)
    return null
  }
}

/**
 * Restore cursor position to a marker and remove the marker
 */
export function restoreCursorToMarker(marker: HTMLSpanElement): boolean {
  try {
    if (!marker.isConnected) return false

    const selection = window.getSelection()
    if (!selection) return false

    const range = document.createRange()
    range.setStartBefore(marker)
    range.collapse(true)
    
    selection.removeAllRanges()
    selection.addRange(range)
    
    // Remove the marker
    marker.remove()
    
    return true
  } catch (error) {
    console.error('Failed to restore cursor to marker:', error)
    // Try to clean up the marker anyway
    try {
      if (marker.isConnected) marker.remove()
    } catch {}
    return false
  }
}

/**
 * Platform-specific delays for cursor operations
 */
export const CURSOR_TIMING = {
  // Short delay for simple operations
  SHORT: 10,
  // Medium delay for DOM changes
  MEDIUM: 50,
  // Long delay for complex operations (WebView)
  LONG: 80,
  // Extra long for operations that need significant settling time
  EXTRA_LONG: 150
} as const

/**
 * Apply cursor operation with appropriate timing for the environment
 * Automatically uses requestAnimationFrame for reliability
 */
export function applyCursorOperation(
  operation: () => void,
  delay: number = CURSOR_TIMING.MEDIUM
): void {
  requestAnimationFrame(() => {
    setTimeout(operation, delay)
  })
}
