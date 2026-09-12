/**
 * Command Dispatcher - Modern Range-based editing commands
 * Replaces document.execCommand with manual DOM manipulation
 */

import { 
  captureBlockSelection,
  isCaretAnchoredToEditorRoot,
  keepCaretVisibleInEditor,
  positionCursorInElement,
  restoreBlockSelection,
  setCursorAtEnd,
  setCursorAtStart,
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
  tagName: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote',
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
        
        // Keep keyboard focus in the editor without scrolling the caret around
        ensureEditorFocus(editorElement)
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
        // Position synchronously so fast typing can't land in the wrong node,
        // then re-assert with WebView-friendly timing.
        setCursorAtStart(newBlock)
        positionCursorInElement(newBlock, 'start', editorElement)
      } else {
        range.insertNode(newBlock)
        setCursorAtStart(newBlock)
      }
      
      return
    }

    if (editorElement && block === editorElement) {
      console.warn('Unable to identify block ancestor for formatBlock without execCommand fallback.')
      return
    }

    // Never touch DOM outside the editor (e.g. a stray selection in a menu)
    if (editorElement && !editorElement.contains(block)) {
      console.warn('Block is outside the editor, skipping format change')
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
      ensureEditorFocus(editorElement)
      return
    }

    // Capture the caret / selection BEFORE the DOM change. The block's children
    // are moved (not cloned) into the replacement element, so this snapshot
    // stays valid and can be re-applied synchronously below.
    const restoreSnapshot = captureBlockSelection(block)
    
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
    
    // Re-apply the caret in the SAME task. Replacing the block detaches the
    // browser's selection and it snaps to the editor root (top of the note)
    // until something restores it — that intermediate state is what users see
    // as "the cursor jumped to the top", and fast typing would land outside
    // the new block.
    const restored = restoreBlockSelection(restoreSnapshot, newBlock)
    
    ensureEditorFocus(editorElement)
    
    if (!restored) {
      // Last-resort synchronous fallback (e.g. selection was lost entirely)
      setCursorAtEnd(newBlock)
    }
    
    keepCaretVisibleInEditor(editorElement)
    
    // WebView safety net: some engines adjust the selection a tick later.
    // This only repairs the detached "caret on the editor root" state and never
    // fights the user — if they typed or moved the caret, it is inside a block
    // and the check fails.
    const repairCaretIfDetached = () => {
      if (!newBlock.isConnected) return
      const root = editorElement && editorElement.isConnected
        ? editorElement
        : (newBlock.parentElement as HTMLElement | null)
      if (!isCaretAnchoredToEditorRoot(root)) return
      
      if (!restoreBlockSelection(restoreSnapshot, newBlock)) {
        setCursorAtEnd(newBlock)
      }
      keepCaretVisibleInEditor(editorElement)
    }
    
    requestAnimationFrame(repairCaretIfDetached)
    setTimeout(repairCaretIfDetached, CURSOR_TIMING.LONG)
  } catch (error) {
    console.error('Error in applyBlockFormat:', error)
  }
}

/**
 * Focus the editor without scrolling the caret into view — scrolling on focus
 * is a common source of visible "jumps" (WebKit scrolls to the top when the
 * selection is momentarily attached to the editor root).
 */
function ensureEditorFocus(editorElement?: HTMLElement | null): void {
  if (!editorElement || !editorElement.isConnected) return
  if (document.activeElement === editorElement) return
  
  try {
    editorElement.focus({ preventScroll: true })
  } catch {
    editorElement.focus()
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

/** Inline wrappers that "clear formatting" removes. */
const STRIP_INLINE_SELECTOR = [
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'code',
  'mark',
  'sub',
  'sup',
  'span[data-highlight]',
  'span[data-color]',
  'span[style*="font-size"]',
].join(', ')

/** Never touched: code blocks, custom islands and note links. */
function shouldKeepWrapper(element: Element): boolean {
  if (element.closest('pre')) return true
  if (element.hasAttribute('data-block') || element.hasAttribute('data-block-type')) return true
  if (element.hasAttribute('data-note-id')) return true
  return false
}

/** Move a wrapper's children up and drop the wrapper itself. */

/** True when the selection covers the whole content of `wrapper`. */
function isFullyCovered(range: Range, wrapper: Element): boolean {
  try {
    const content = document.createRange()
    content.selectNodeContents(wrapper)

    return (
      range.compareBoundaryPoints(Range.START_TO_START, content) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, content) >= 0
    )
  } catch {
    return false
  }
}

/**
 * Selection covers only part of the wrapper: pull the covered run out of it
 * (leaving the surrounding pieces wrapped) and re-insert the run unwrapped.
 */
function unwrapCoveredPart(wrapper: Element, range: Range): boolean {
  const parent = wrapper.parentNode
  if (!parent || !wrapper.firstChild) return false

  try {
    const content = document.createRange()
    content.selectNodeContents(wrapper)

    // The part of the selection that lives inside this wrapper.
    const covered = document.createRange()
    const startInside = wrapper.contains(range.startContainer)
    const endInside = wrapper.contains(range.endContainer)

    if (startInside) {
      covered.setStart(range.startContainer, range.startOffset)
    } else {
      covered.setStart(content.startContainer, content.startOffset)
    }

    if (endInside) {
      covered.setEnd(range.endContainer, range.endOffset)
    } else {
      covered.setEnd(content.endContainer, content.endOffset)
    }

    // The browser splits text nodes here, so the wrapper keeps every unselected
    // character. `covered` collapses to the extraction point afterwards.
    const coveredFragment = covered.extractContents()
    if (!coveredFragment.textContent && !coveredFragment.childNodes.length) return false

    // Anything after the extraction point stays wrapped in a clone of this
    // wrapper, so only the covered run ends up unformatted.
    let trailingWrapper: Element | null = null
    const tailStartContainer = covered.startContainer
    const tailStartOffset = covered.startOffset
    const lastChild = wrapper.lastChild

    if (lastChild) {
      try {
        const tailRange = document.createRange()
        tailRange.setStart(tailStartContainer, tailStartOffset)
        tailRange.setEndAfter(lastChild)
        const tail = tailRange.extractContents()

        if (tail.childNodes.length > 0) {
          trailingWrapper = wrapper.cloneNode(false) as Element
          trailingWrapper.appendChild(tail)
        }
      } catch {
        trailingWrapper = null
      }
    }

    if (trailingWrapper) {
      parent.insertBefore(trailingWrapper, wrapper.nextSibling)
    }
    parent.insertBefore(coveredFragment, wrapper.nextSibling)

    return true
  } catch (error) {
    console.warn('Failed to split formatted element:', error)
    return false
  }
}

/**
 * Clear inline formatting (bold, italic, underline, strike, inline code,
 * highlight, text colour, font size) for the current selection.
 *
 * With a collapsed caret the whole block is cleared. Formatting that only
 * partially overlaps the selection is split first, so text outside the
 * selection keeps its formatting. Links, code blocks and custom blocks are
 * preserved.
 *
 * @returns true when something was changed.
 */
export function clearInlineFormatting(editorElement?: HTMLElement | null): boolean {
  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return false

    const liveRange = selection.getRangeAt(0)
    if (!liveRange.startContainer.isConnected) return false
    if (editorElement && !editorElement.contains(liveRange.commonAncestorContainer)) {
      return false
    }

    let range: Range
    if (liveRange.collapsed) {
      // Nothing selected — clear the block the caret sits in.
      const block = getBlockAncestor(liveRange.startContainer)
      const target = block && (!editorElement || editorElement.contains(block)) ? block : null
      if (!target) return false

      range = document.createRange()
      range.selectNodeContents(target)
    } else {
      range = liveRange.cloneRange()
    }

    const root: ParentNode = editorElement ?? document
    // Deepest wrappers first: splitting an inner wrapper must not invalidate the
    // coverage test of an outer one.
    const wrappers = Array.from(root.querySelectorAll(STRIP_INLINE_SELECTOR))
      .filter((element) => !shouldKeepWrapper(element))
      .sort((a, b) => depthOf(b) - depthOf(a))

    let changed = 0
    for (const wrapper of wrappers) {
      if (!wrapper.isConnected || !wrapper.textContent) continue

      let intersects = false
      try {
        intersects = range.intersectsNode(wrapper)
      } catch {
        intersects = false
      }
      if (!intersects) continue

      if (isFullyCovered(range, wrapper)) {
        unwrapElement(wrapper)
        changed += 1
      } else if (unwrapCoveredPart(wrapper, range)) {
        changed += 1
      }
    }

    return changed > 0
  } catch (error) {
    console.error('Failed to clear inline formatting:', error)
    return false
  }
}

/** DOM depth, used to process the innermost wrappers first. */
function depthOf(element: Element): number {
  let depth = 0
  let current: Node | null = element
  while (current.parentNode) {
    depth += 1
    current = current.parentNode
  }
  return depth
}
