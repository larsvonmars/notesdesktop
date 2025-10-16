/**
 * Command Dispatcher - Modern Range-based editing commands
 * Replaces document.execCommand with manual DOM manipulation
 */

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
 */
export function applyInlineStyle(tagName: 'strong' | 'em' | 'code' | 'u' | 's'): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  
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
    // No selection - insert placeholder
    const element = document.createElement(tagName)
    const textNode = document.createTextNode(tagName)
    element.appendChild(textNode)
    range.insertNode(element)
    
    // Select the text inside
    const newRange = document.createRange()
    newRange.setStart(textNode, 0)
    newRange.setEnd(textNode, textNode.length)
    selection.removeAllRanges()
    selection.addRange(newRange)
  } else {
    // Has selection - wrap it
    wrapRangeInTag(range, tagName)
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
  const parent = element.parentNode
  if (!parent) return
  
  // Move all children before the element
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element)
  }
  
  // Remove the empty element
  parent.removeChild(element)
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
 */
export function applyBlockFormat(
  tagName: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote',
  editorElement?: HTMLElement | null
): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  
  const range = selection.getRangeAt(0)
  const block = getBlockAncestor(range.startContainer)
  
  if (!block) {
    // No block found, create one
    const newBlock = document.createElement(tagName)
    newBlock.appendChild(document.createElement('br'))
    
    if (editorElement) {
      editorElement.appendChild(newBlock)
    } else {
      range.insertNode(newBlock)
    }
    
    // Move cursor to the new block
    const newRange = document.createRange()
    newRange.setStart(newBlock, 0)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)
    
    return
  }
  
  // If already the same tag, convert to paragraph
  const targetTag = block.tagName.toLowerCase() === tagName ? 'p' : tagName
  
  // Save selection offset within the block
  const offset = getOffsetWithinBlock(range.startContainer, range.startOffset, block)
  
  // Create new block with the target tag
  const newBlock = document.createElement(targetTag)
  
  // Copy attributes (like ID for headings)
  if (block.id) {
    newBlock.id = block.id
  }
  
  // Move all children to the new block
  while (block.firstChild) {
    newBlock.appendChild(block.firstChild)
  }
  
  // If the new block is empty, add a <br> to make it editable
  if (newBlock.childNodes.length === 0 || newBlock.textContent?.trim() === '') {
    if (newBlock.childNodes.length === 0) {
      newBlock.appendChild(document.createElement('br'))
    }
  }
  
  // Replace the old block with the new one
  const parent = block.parentNode
  if (parent) {
    parent.replaceChild(newBlock, block)
    
    // Restore selection
    try {
      restoreOffsetWithinBlock(newBlock, offset, selection)
    } catch (error) {
      console.warn('Failed to restore selection after block format:', error)
      // Fallback: place cursor at start of block
      const fallbackRange = document.createRange()
      fallbackRange.setStart(newBlock, 0)
      fallbackRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(fallbackRange)
    }
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
  
  // If we couldn't find the exact position (e.g., block is empty or has only <br>)
  // Place cursor at the start of the block
  const range = document.createRange()
  
  // Check if block is empty or only has a <br> element
  if (block.childNodes.length === 0) {
    // Empty block - set cursor at start
    range.setStart(block, 0)
    range.collapse(true)
  } else if (block.childNodes.length === 1 && block.firstChild?.nodeName === 'BR') {
    // Only has <br> - set cursor before it
    range.setStart(block, 0)
    range.collapse(true)
  } else {
    // Has content but no text nodes were found - set at the end
    range.selectNodeContents(block)
    range.collapse(false)
  }
  
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
