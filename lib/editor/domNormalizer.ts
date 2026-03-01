/**
 * DOM Normalization Utilities
 * Keeps the editor DOM structure clean and predictable
 */

/**
 * Map of semantically equivalent tag names. For example, <b> and <strong> are equivalent.
 */
const TAG_EQUIVALENCES: Record<string, string> = {
  B: 'STRONG',
  I: 'EM',
}

/**
 * Normalize a tag name to its canonical form using equivalences.
 */
function canonicalTag(tagName: string): string {
  return TAG_EQUIVALENCES[tagName] || tagName
}

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
 * Check if two elements are identical (same tag and attributes) and should be merged.
 * Treats <b>/<strong> and <i>/<em> as equivalent.
 */
function areElementsIdentical(a: Element, b: Element): boolean {
  const canonA = canonicalTag(a.tagName)
  const canonB = canonicalTag(b.tagName)
  
  if (canonA !== canonB) return false
  
  // For inline formatting tags, we consider them identical if they share the same canonical tag
  const inlineTags = ['STRONG', 'EM', 'CODE', 'U', 'S', 'MARK', 'SPAN']
  if (inlineTags.includes(canonA)) {
    // For SPAN and MARK, also check that they share the same class and style
    if (canonA === 'SPAN' || canonA === 'MARK') {
      return a.className === b.className && (a as HTMLElement).style.cssText === (b as HTMLElement).style.cssText
    }
    return true
  }
  
  return false
}

/**
 * Check if an element contains only whitespace and/or <br> elements (visually empty but structurally meaningful)
 */
function hasOnlyBrContent(element: Element): boolean {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === 'BR') {
      return true // Contains a <br>, not truly empty
    }
    if (child.nodeType === Node.TEXT_NODE && (child.textContent || '').trim() !== '') {
      return false // Has visible text content
    }
  }
  return false
}

/**
 * Remove empty inline elements
 */
function removeEmptyInlineElements(parent: Node): void {
  const childNodes = Array.from(parent.childNodes)
  const inlineTags = ['STRONG', 'EM', 'CODE', 'U', 'S', 'B', 'I', 'SPAN', 'MARK']
  
  for (const node of childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      
      // Recursively clean children first
      removeEmptyInlineElements(element)
      
      // Remove if empty and inline, but preserve elements containing <br>
      if (inlineTags.includes(element.tagName) && element.textContent?.trim() === '' && !hasOnlyBrContent(element)) {
        parent.removeChild(element)
      }
    }
  }
}

/**
 * Unwrap redundant nested tags (e.g., <strong><strong>text</strong></strong>)
 * Also handles semantic equivalences like <b><strong>text</strong></b>
 */
function unwrapRedundantNestedTags(parent: Node): void {
  const childNodes = Array.from(parent.childNodes)
  
  for (const node of childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      
      // Check if this element has a single child of the same (or equivalent) type
      if (
        element.children.length === 1 &&
        canonicalTag(element.children[0].tagName) === canonicalTag(element.tagName)
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
 * Normalize an element and its descendants.
 * Children are normalized before the parent applies merge/cleanup rules,
 * so recursive processing in merge functions is no longer needed for children
 * that have already been visited.
 */
function normalizeElement(element: Element): void {
  // First normalize all children (bottom-up)
  Array.from(element.children).forEach(child => {
    normalizeElement(child)
  })

  // Then apply normalization passes on this element
  mergeAdjacentTextNodes(element)
  mergeAdjacentIdenticalElements(element)
  removeEmptyInlineElements(element)
  unwrapRedundantNestedTags(element)
}

/**
 * Normalize the entire editor content, preserving selection where possible.
 */
export function normalizeEditorContent(editorElement: HTMLElement): void {
  // Save selection before normalization
  const selection = window.getSelection()
  const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null

  normalizeElement(editorElement)
  
  // Ensure editor has at least one block element
  if (editorElement.children.length === 0 || 
      (editorElement.children.length === 1 && editorElement.textContent?.trim() === '')) {
    const p = document.createElement('p')
    p.appendChild(document.createElement('br'))
    editorElement.appendChild(p)
  }

  // Restore selection after normalization
  if (savedRange && selection) {
    try {
      // Only restore if the range is still valid within the editor
      if (editorElement.contains(savedRange.startContainer) && editorElement.contains(savedRange.endContainer)) {
        selection.removeAllRanges()
        selection.addRange(savedRange)
      }
    } catch {
      // Range may be stale if normalization removed the target nodes
    }
  }
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
