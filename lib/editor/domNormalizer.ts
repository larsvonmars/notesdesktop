/**
 * DOM Normalization Utilities
 * Keeps the editor DOM structure clean and predictable
 */

/**
 * Merge adjacent text nodes
 */
function mergeAdjacentTextNodes(parent: Node): void {
  const childNodes = Array.from(parent.childNodes)
  
  for (let i = 0; i < childNodes.length - 1; i++) {
    const current = childNodes[i]
    const next = childNodes[i + 1]
    
    if (current.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE) {
      current.textContent = (current.textContent || '') + (next.textContent || '')
      parent.removeChild(next)
      childNodes.splice(i + 1, 1)
      i-- // Recheck this position
    }
  }
}

/**
 * Merge adjacent identical inline elements
 */
function mergeAdjacentIdenticalElements(parent: Node): void {
  const childNodes = Array.from(parent.childNodes)
  
  for (let i = 0; i < childNodes.length - 1; i++) {
    const current = childNodes[i]
    const next = childNodes[i + 1]
    
    if (
      current.nodeType === Node.ELEMENT_NODE &&
      next.nodeType === Node.ELEMENT_NODE &&
      areElementsIdentical(current as Element, next as Element)
    ) {
      // Move all children from next to current
      while (next.firstChild) {
        current.appendChild(next.firstChild)
      }
      parent.removeChild(next)
      childNodes.splice(i + 1, 1)
      
      // Recursively merge within the combined element
      mergeAdjacentTextNodes(current)
      mergeAdjacentIdenticalElements(current)
      
      i-- // Recheck this position
    }
  }
}

/**
 * Check if two elements are identical (same tag and attributes)
 */
function areElementsIdentical(a: Element, b: Element): boolean {
  if (a.tagName !== b.tagName) return false
  
  // For inline formatting tags, we consider them identical
  const inlineTags = ['STRONG', 'EM', 'CODE', 'U', 'S', 'B', 'I']
  if (inlineTags.includes(a.tagName)) {
    return true
  }
  
  return false
}

/**
 * Remove empty inline elements
 */
function removeEmptyInlineElements(parent: Node): void {
  const childNodes = Array.from(parent.childNodes)
  const inlineTags = ['STRONG', 'EM', 'CODE', 'U', 'S', 'B', 'I', 'SPAN']
  
  for (const node of childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      
      // Recursively clean children first
      removeEmptyInlineElements(element)
      
      // Remove if empty and inline
      if (inlineTags.includes(element.tagName) && element.textContent?.trim() === '') {
        parent.removeChild(element)
      }
    }
  }
}

/**
 * Unwrap redundant nested tags (e.g., <strong><strong>text</strong></strong>)
 */
function unwrapRedundantNestedTags(parent: Node): void {
  const childNodes = Array.from(parent.childNodes)
  
  for (const node of childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      
      // Check if this element has a single child of the same type
      if (
        element.children.length === 1 &&
        element.children[0].tagName === element.tagName
      ) {
        const child = element.children[0]
        
        // Move child's content to parent
        while (child.firstChild) {
          element.appendChild(child.firstChild)
        }
        element.removeChild(child)
      }
      
      // Recursively process children
      unwrapRedundantNestedTags(element)
    }
  }
}

/**
 * Normalize inline nodes within a range
 */
export function sanitizeInlineNodes(range: Range): void {
  const container = range.commonAncestorContainer
  const element = container.nodeType === Node.TEXT_NODE 
    ? container.parentElement 
    : (container as Element)
  
  if (!element) return
  
  // Save selection before modifications
  const selection = window.getSelection()
  const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null
  
  // Normalize the container
  normalizeElement(element)
  
  // Restore selection
  if (savedRange) {
    try {
      selection?.removeAllRanges()
      selection?.addRange(savedRange)
    } catch (error) {
      console.warn('Failed to restore selection after normalization:', error)
    }
  }
}

/**
 * Normalize an element and its descendants
 */
function normalizeElement(element: Element): void {
  // Merge adjacent text nodes
  mergeAdjacentTextNodes(element)
  
  // Merge adjacent identical elements
  mergeAdjacentIdenticalElements(element)
  
  // Remove empty inline elements
  removeEmptyInlineElements(element)
  
  // Unwrap redundant nested tags
  unwrapRedundantNestedTags(element)
  
  // Recursively normalize children
  Array.from(element.children).forEach(child => {
    normalizeElement(child)
  })
}

/**
 * Normalize the entire editor content
 */
export function normalizeEditorContent(editorElement: HTMLElement): void {
  normalizeElement(editorElement)
  
  // Ensure editor has at least one block element
  // Only add a paragraph if the editor is truly empty (no children at all)
  if (editorElement.children.length === 0) {
    const p = document.createElement('p')
    p.appendChild(document.createElement('br'))
    editorElement.appendChild(p)
  }
  // Note: Removed the check for single empty child to avoid interfering with
  // empty headings or other block elements that are being edited
}

/**
 * Normalize inline nodes - main export for use in command flow
 */
export function normalizeInlineNodes(element: Element): void {
  mergeAdjacentTextNodes(element)
  mergeAdjacentIdenticalElements(element)
  removeEmptyInlineElements(element)
  unwrapRedundantNestedTags(element)
}

/**
 * Unwrap empty elements in the entire editor
 */
export function unwrapEmptyElements(editorElement: HTMLElement): void {
  removeEmptyInlineElements(editorElement)
}
