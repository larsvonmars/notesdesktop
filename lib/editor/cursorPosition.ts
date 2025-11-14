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
        // Element node - position after it
        range.setStartAfter(lastNode)
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
