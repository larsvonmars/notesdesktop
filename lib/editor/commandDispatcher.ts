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
  const common = range.commonAncestorContainer
  const root = common.nodeType === Node.TEXT_NODE ? common.parentNode : common
  if (!root) return textNodes

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const textNode = node as Text
        const text = textNode.textContent ?? ''
        if (text.length === 0) {
          return NodeFilter.FILTER_REJECT
        }

        try {
          return range.intersectsNode(textNode)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT
        } catch {
          return NodeFilter.FILTER_REJECT
        }
      }
    }
  )
  
  let node: Node | null
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text)
  }
  
  return textNodes
}

function isNodeStyledWithTag(node: Node, tagName: string): boolean {
  return isWrappedInTag(node, tagName) !== null
}

function isRangeFullyStyled(range: Range, tagName: string): boolean {
  const textNodes = getTextNodesInRange(range)
  if (textNodes.length === 0) {
    return (
      isNodeStyledWithTag(range.startContainer, tagName) &&
      isNodeStyledWithTag(range.endContainer, tagName)
    )
  }

  return textNodes.every((node) => isNodeStyledWithTag(node, tagName))
}

function unwrapTagInContainer(container: ParentNode, tagName: string): void {
  const targetTag = tagName.toLowerCase()
  const wrappers = Array.from(container.querySelectorAll(targetTag))
  wrappers.forEach((wrapper) => {
    unwrapElement(wrapper)
  })
}

function splitElementAroundChild(element: Element, child: Node): void {
  if (!element.parentNode || child.parentNode !== element) return

  const parent = element.parentNode
  const beforeClone = element.cloneNode(false) as Element
  const afterClone = element.cloneNode(false) as Element

  while (element.firstChild && element.firstChild !== child) {
    beforeClone.appendChild(element.firstChild)
  }

  while (child.nextSibling) {
    afterClone.appendChild(child.nextSibling)
  }

  const hasRenderableContent = (node: Node): boolean => {
    if (node.nodeType === Node.ELEMENT_NODE) return true
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? '').length > 0
    }
    return false
  }

  const cloneHasRenderableContent = (clone: Element): boolean =>
    Array.from(clone.childNodes).some(hasRenderableContent)

  if (cloneHasRenderableContent(beforeClone)) {
    parent.insertBefore(beforeClone, element)
  }

  parent.insertBefore(child, element)

  if (cloneHasRenderableContent(afterClone)) {
    parent.insertBefore(afterClone, element)
  }

  element.remove()
}

function removeInlineStyleFromRange(range: Range, tagName: string): void {
  const selection = window.getSelection()
  if (!selection || range.collapsed) return

  const extracted = range.extractContents()
  const staging = document.createElement('div')
  staging.appendChild(extracted)

  unwrapTagInContainer(staging, tagName)

  const marker = document.createElement('span')
  marker.setAttribute('data-inline-remove-marker', 'true')
  while (staging.firstChild) {
    marker.appendChild(staging.firstChild)
  }

  range.insertNode(marker)

  let parent = marker.parentElement
  while (parent && parent.tagName.toLowerCase() === tagName.toLowerCase()) {
    splitElementAroundChild(parent, marker)
    parent = marker.parentElement
  }

  unwrapTagInContainer(marker, tagName)

  const insertedNodes = Array.from(marker.childNodes)
  if (insertedNodes.length === 0) {
    marker.remove()
    return
  }

  const replacement = document.createDocumentFragment()
  insertedNodes.forEach((node) => replacement.appendChild(node))
  marker.replaceWith(replacement)

  const newRange = document.createRange()
  newRange.setStartBefore(insertedNodes[0])
  newRange.setEndAfter(insertedNodes[insertedNodes.length - 1])
  selection.removeAllRanges()
  selection.addRange(newRange)
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
    
    // Validate range is still connected to DOM
    if (!range.commonAncestorContainer.isConnected) {
      console.warn('Selection range not connected to DOM')
      return
    }
    
    // Check if already wrapped in this tag
    const wrapper = isWrappedInTag(range.commonAncestorContainer, tagName)
    
    if (wrapper && range.toString().length === 0) {
      // Cursor inside wrapper, unwrap it
      const parent = wrapper.parentNode
      unwrapElement(wrapper)
      
      // Restore cursor position after unwrap
      if (parent) {
        try {
          const newRange = document.createRange()
          newRange.selectNodeContents(parent)
          newRange.collapse(true)
          selection.removeAllRanges()
          selection.addRange(newRange)
        } catch (e) {
          console.warn('Failed to restore cursor after unwrap:', e)
        }
      }
      return
    }
    
    if (!range.collapsed && isRangeFullyStyled(range, tagName)) {
      // Remove style only from selected content; do not unwrap whole line/wrapper.
      removeInlineStyleFromRange(range, tagName)
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
 * Wrap a range in a tag
 */
function wrapRangeInTag(range: Range, tagName: string): void {
  const wrapper = document.createElement(tagName)
  
  try {
    // Validate range before extraction
    if (!range.commonAncestorContainer.isConnected) {
      console.warn('Range not connected to DOM, cannot wrap')
      return
    }
    
    // Extract and wrap contents
    const contents = range.extractContents()
    
    // Ensure we have content to wrap
    if (!contents.childNodes.length) {
      console.warn('No content to wrap')
      return
    }
    
    wrapper.appendChild(contents)
    range.insertNode(wrapper)
    
    // Normalize adjacent text nodes
    if (wrapper.parentNode) {
      wrapper.parentNode.normalize()
    }
    
    // Select the wrapped content
    const selection = window.getSelection()
    if (selection) {
      const newRange = document.createRange()
      newRange.selectNodeContents(wrapper)
      selection.removeAllRanges()
      selection.addRange(newRange)
    }
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
export function getBlockAncestor(node: Node | null): HTMLElement | null {
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
    
    // Validate range is connected to DOM
    if (!range.startContainer.isConnected) {
      console.warn('Selection not connected to DOM')
      return
    }
    
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
        if (editorElement && editorElement.isConnected) {
          setTimeout(() => {
            if (editorElement.isConnected) {
              editorElement.focus()
            }
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
      
      if (editorElement && editorElement.isConnected) {
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
      if (editorElement && editorElement.isConnected) {
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
      try {
        newBlock.appendChild(child)
      } catch (e) {
        console.warn('Failed to move child node:', e)
      }
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
    if (editorElement && editorElement.isConnected) {
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
        try {
          if (editorElement && editorElement.isConnected) {
            positionCursorInElement(newBlock, 'end', editorElement)
          } else {
            positionCursorInElement(newBlock, 'end')
          }
        } catch (e) {
          console.warn('Failed to position cursor at end:', e)
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
 * Apply text alignment to the block ancestor of the current selection.
 * Sets CSS textAlign on the block-level element.
 */
export function applyTextAlignment(
  alignment: 'left' | 'center' | 'right',
  editorElement?: HTMLElement | null
): void {
  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      console.warn('No selection available for text alignment')
      return
    }

    const range = selection.getRangeAt(0)
    if (!range.startContainer.isConnected) {
      console.warn('Selection not connected to DOM')
      return
    }

    // Collect all block ancestors touched by the selection
    const blocks: HTMLElement[] = []
    const startBlock = getBlockAncestor(range.startContainer)
    const endBlock = getBlockAncestor(range.endContainer)

    if (startBlock) {
      blocks.push(startBlock)
    }

    // If selection spans multiple blocks, walk siblings between them
    if (startBlock && endBlock && startBlock !== endBlock) {
      let current: HTMLElement | null = startBlock
      while (current && current !== endBlock) {
        const next = current.nextElementSibling as HTMLElement | null
        if (next) {
          blocks.push(next)
        }
        current = next
      }
    }

    // If no block found, try the editor root's direct child containing the selection
    if (blocks.length === 0 && editorElement) {
      let node: Node | null = range.startContainer
      while (node && node.parentNode !== editorElement) {
        node = node.parentNode
      }
      if (node && node instanceof HTMLElement) {
        blocks.push(node)
      }
    }

    if (blocks.length === 0) {
      console.warn('No block found for text alignment')
      return
    }

    // Check if all blocks already have this alignment — toggle to 'left' (default)
    const allAligned = blocks.every(b => b.style.textAlign === alignment)
    const newAlign = allAligned && alignment !== 'left' ? '' : (alignment === 'left' ? '' : alignment)

    for (const block of blocks) {
      if (newAlign) {
        block.style.textAlign = newAlign
      } else {
        block.style.removeProperty('text-align')
        // Clean up empty style attribute
        if (!block.getAttribute('style')?.trim()) {
          block.removeAttribute('style')
        }
      }
    }

    // Re-focus the editor
    if (editorElement && editorElement.isConnected) {
      editorElement.focus()
    }
  } catch (error) {
    console.error('Error in applyTextAlignment:', error)
  }
}

/**
 * Get the current text alignment of the block at the selection.
 * Returns 'left' if no explicit alignment is set.
 */
export function getTextAlignment(
  editorElement?: HTMLElement | null
): 'left' | 'center' | 'right' {
  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return 'left'

    const range = selection.getRangeAt(0)
    const block = getBlockAncestor(range.startContainer)

    if (!block) {
      // Try editor root's direct child
      if (editorElement) {
        let node: Node | null = range.startContainer
        while (node && node.parentNode !== editorElement) {
          node = node.parentNode
        }
        if (node && node instanceof HTMLElement) {
          const align = node.style.textAlign
          if (align === 'center' || align === 'right') return align
        }
      }
      return 'left'
    }

    const align = block.style.textAlign
    if (align === 'center' || align === 'right') return align
    return 'left'
  } catch {
    return 'left'
  }
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
