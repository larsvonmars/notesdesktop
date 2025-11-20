/**
 * Command Dispatcher - Modern Range-based editing commands
 * Replaces document.execCommand with manual DOM manipulation
 */

import { 
  getTextOffsetInBlock,
  restoreTextOffsetInBlock,
  positionCursorInElement,
  CURSOR_TIMING
} from './cursorPosition'

export interface SelectionSnapshot {
  startContainer: Node
  startOffset: number
  endContainer: Node
  endOffset: number
}

/**
 * Save current selection as a snapshot
 */
export function saveSelection(): SelectionSnapshot | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  
  const range = selection.getRangeAt(0)
  return {
    startContainer: range.startContainer,
    startOffset: range.startOffset,
    endContainer: range.endContainer,
    endOffset: range.endOffset
  }
}

/**
 * Restore selection from a snapshot
 */
export function restoreSelection(snapshot: SelectionSnapshot): void {
  try {
    const range = document.createRange()
    range.setStart(snapshot.startContainer, snapshot.startOffset)
    range.setEnd(snapshot.endContainer, snapshot.endOffset)
    
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  } catch (error) {
    console.warn('Failed to restore selection:', error)
  }
}

/**
 * Check if a node is wrapped in a specific tag
 */
function isWrappedInTag(node: Node, tagName: string): Element | null {
  let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
  
  while (current && current !== document.body) {
    if (current.tagName?.toLowerCase() === tagName.toLowerCase()) {
      return current
    }
    current = current.parentElement
  }
  
  return null
}

/**
 * Get all text nodes within a range
 */
function getTextNodesInRange(range: Range): Text[] {
  const textNodes: Text[] = []
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const nodeRange = document.createRange()
        nodeRange.selectNode(node)
        
        // Check if this text node intersects with our range
        if (
          range.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0 &&
          range.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0
        ) {
          return NodeFilter.FILTER_ACCEPT
        }
        return NodeFilter.FILTER_REJECT
      }
    }
  )
  
  let node: Node | null
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text)
  }
  
  return textNodes
}

/**
 * Apply inline style by wrapping selection with a semantic tag
 * Improved cursor positioning for collapsed ranges and better error handling
 */
export function applyInlineStyle(tagName: 'strong' | 'em' | 'code' | 'u' | 's'): void {
  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      console.warn('No selection available for inline style')
      return
    }
    
    const range = selection.getRangeAt(0)
    
    // Check if already wrapped in this tag
    const wrapper = isWrappedInTag(range.commonAncestorContainer, tagName)
    
    if (wrapper && range.toString().length === 0) {
      // Cursor inside wrapper, unwrap it
      unwrapElement(wrapper)
      return
    }
    
    if (wrapper && isRangeFullyWithinElement(range, wrapper)) {
      // Selection fully within wrapper, unwrap it
      unwrapElement(wrapper)
      return
    }
    
    // Apply the style
    if (range.collapsed) {
      // No selection - insert placeholder with improved cursor positioning
      const element = document.createElement(tagName)
      const textNode = document.createTextNode(tagName)
      element.appendChild(textNode)
      
      try {
        range.insertNode(element)
        
        // Select the text inside for better UX - user can immediately type to replace
        const newRange = document.createRange()
        newRange.setStart(textNode, 0)
        newRange.setEnd(textNode, textNode.length)
        selection.removeAllRanges()
        selection.addRange(newRange)
      } catch (error) {
        console.error('Failed to insert inline style element:', error)
      }
    } else {
      // Has selection - wrap it
      wrapRangeInTag(range, tagName)
    }
  } catch (error) {
    console.error('Error in applyInlineStyle:', error)
  }
}

/**
 * Check if range is fully within an element
 */
function isRangeFullyWithinElement(range: Range, element: Element): boolean {
  const rangeStart = range.startContainer
  const rangeEnd = range.endContainer
  
  return element.contains(rangeStart) && element.contains(rangeEnd)
}

/**
 * Wrap a range in a tag
 */
function wrapRangeInTag(range: Range, tagName: string): void {
  const wrapper = document.createElement(tagName)
  
  try {
    // Extract and wrap contents
    const contents = range.extractContents()
    wrapper.appendChild(contents)
    range.insertNode(wrapper)
    
    // Select the wrapped content
    const selection = window.getSelection()
    const newRange = document.createRange()
    newRange.selectNodeContents(wrapper)
    selection?.removeAllRanges()
    selection?.addRange(newRange)
  } catch (error) {
    console.warn('Failed to wrap range:', error)
  }
}

/**
 * Unwrap an element, moving its children up
 */
function unwrapElement(element: Element): void {
  try {
    const parent = element.parentNode
    if (!parent) {
      console.warn('Cannot unwrap element without parent')
      return
    }
    
    // Store children in array to avoid live collection issues
    const children = Array.from(element.childNodes)
    
    // Move all children before the element
    children.forEach(child => {
      parent.insertBefore(child, element)
    })
    
    // Remove the empty element
    parent.removeChild(element)
  } catch (error) {
    console.error('Error unwrapping element:', error)
  }
}

/**
 * Get the closest block-level ancestor of a node
 */
function getBlockAncestor(node: Node | null): HTMLElement | null {
  if (!node) return null
  
  const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'LI']
  let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  
  while (current && current !== document.body) {
    if (blockTags.includes(current.tagName)) {
      return current
    }
    current = current.parentElement
  }
  
  return null
}

/**
 * Apply block format by swapping the tag of the block ancestor
 * Improved cursor positioning with WebView compatibility and better error handling
 */
export function applyBlockFormat(
  tagName: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote',
  editorElement?: HTMLElement | null
): void {
  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      console.warn('No selection available for block format')
      return
    }
    
    const range = selection.getRangeAt(0)
    const block = getBlockAncestor(range.startContainer)

    const shouldFallbackToExecCommand =
      typeof document !== 'undefined' &&
      typeof document.execCommand === 'function' &&
      editorElement != null &&
      (!block || block === editorElement)

    if (shouldFallbackToExecCommand) {
      try {
        document.execCommand('formatBlock', false, `<${tagName}>`)
        
        // Ensure cursor is properly positioned after execCommand
        if (editorElement) {
          setTimeout(() => {
            editorElement.focus()
          }, CURSOR_TIMING.SHORT)
        }
        return
      } catch (error) {
        console.warn('formatBlock fallback via execCommand failed:', error)
      }
    }
    
    if (!block) {
      // No block found, create one
      const newBlock = document.createElement(tagName)
      newBlock.appendChild(document.createElement('br'))
      
      if (editorElement) {
        editorElement.appendChild(newBlock)
        // Use improved cursor positioning
        positionCursorInElement(newBlock, 'start', editorElement)
      } else {
        range.insertNode(newBlock)
        positionCursorInElement(newBlock, 'start')
      }
      
      return
    }

    if (editorElement && block === editorElement) {
      console.warn('Unable to identify block ancestor for formatBlock without execCommand fallback.')
      return
    }
    
    // Prevent converting list items to headings/paragraphs as this breaks list structure
    // User should first exit the list, then apply heading format
    if (block.tagName === 'LI') {
      console.warn('Cannot convert list items to headings directly. Exit the list first.')
      return
    }
    
    // Check if already the same tag - only convert to paragraph if explicitly requested
    const currentTag = block.tagName.toLowerCase()
    const targetTag = (currentTag === tagName && tagName !== 'p') ? 'p' : tagName
    
    // If no change needed, just ensure focus and return
    if (currentTag === targetTag) {
      if (editorElement) {
        editorElement.focus()
      }
      return
    }
    
    // Save text offset within the block for better cursor restoration
    const textOffset = getTextOffsetInBlock(block)
    
    // Create new block with the target tag
    const newBlock = document.createElement(targetTag)
    
    // Copy attributes (like ID for headings) but only if target is also a heading
    if (block.id && (targetTag.startsWith('h') || currentTag.startsWith('h'))) {
      newBlock.id = block.id
    }
    
    // Copy children safely by creating an array first
    const children = Array.from(block.childNodes)
    children.forEach(child => {
      newBlock.appendChild(child)
    })
    
    // Verify parent exists before replacement
    const parent = block.parentNode
    if (!parent) {
      console.warn('Block has no parent, cannot replace')
      return
    }
    
    // Replace the old block with the new one
    try {
      parent.replaceChild(newBlock, block)
    } catch (error) {
      console.error('Failed to replace block:', error)
      return
    }
    
    // Focus editor first (critical for WebView)
    if (editorElement) {
      editorElement.focus()
    }
    
    // Restore cursor position with improved timing
    setTimeout(() => {
      // Verify block is still in DOM
      if (!newBlock.isConnected) {
        console.warn('Block was removed from DOM after creation')
        return
      }
      
      try {
        restoreTextOffsetInBlock(newBlock, textOffset)
      } catch (error) {
        console.warn('Failed to restore cursor position:', error)
        // Fallback: position at end of block
        if (editorElement) {
          positionCursorInElement(newBlock, 'end', editorElement)
        } else {
          positionCursorInElement(newBlock, 'end')
        }
      }
    }, CURSOR_TIMING.LONG)
  } catch (error) {
    console.error('Error in applyBlockFormat:', error)
  }
}

/**
 * Get character offset within a block
 */
function getOffsetWithinBlock(node: Node, offset: number, block: HTMLElement): number {
  let totalOffset = 0
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  
  let currentNode: Node | null
  while ((currentNode = walker.nextNode())) {
    if (currentNode === node) {
      return totalOffset + offset
    }
    totalOffset += currentNode.textContent?.length || 0
  }
  
  return totalOffset
}

/**
 * Restore cursor position within a block using character offset
 */
function restoreOffsetWithinBlock(block: HTMLElement, offset: number, selection: Selection): void {
  let currentOffset = 0
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  
  let node: Node | null
  while ((node = walker.nextNode())) {
    const nodeLength = node.textContent?.length || 0
    if (currentOffset + nodeLength >= offset) {
      const range = document.createRange()
      range.setStart(node, offset - currentOffset)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    currentOffset += nodeLength
  }
  
  // If we couldn't find the exact position, set at the end
  const range = document.createRange()
  range.selectNodeContents(block)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Generate a unique heading ID from text
 */
export function generateHeadingId(text: string): string {
  const id = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  
  return id || `heading-${Date.now()}`
}
