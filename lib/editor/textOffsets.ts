/**
 * Character-offset helpers for the contentEditable editor.
 *
 * Browsers love to shuffle text nodes around (`<br>` placeholders, caret
 * re-assertion in WebViews, DOM normalisation), so switching between the caret
 * and a character offset inside a block is much more reliable than holding on
 * to a specific text node. Offsets follow `Range.toString()` semantics: text
 * nodes only, no line breaks for `<br>`.
 */

/** Text of an element the way `Range.toString()` sees it. */
export function getElementText(element: HTMLElement): string {
  const range = document.createRange()
  range.selectNodeContents(element)
  return range.toString()
}

/**
 * Character offset of a caret position inside `block`, or null when the caret
 * is outside of it.
 */
export function getTextOffsetInBlock(
  block: HTMLElement,
  node: Node,
  offset: number
): number | null {
  if (!block.contains(node)) return null

  const probe = document.createRange()
  probe.selectNodeContents(block)
  try {
    probe.setEnd(node, offset)
  } catch {
    return null
  }

  return probe.toString().length
}

/**
 * Turn a character offset back into a concrete caret position.
 * Returns null when the offset lies outside of the block's text.
 */
export function findTextPosition(
  block: HTMLElement,
  charIndex: number
): { node: Text; offset: number } | null {
  if (charIndex < 0) return null

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)

  let travelled = 0
  let current = walker.nextNode() as Text | null

  while (current) {
    const length = (current.textContent ?? '').length
    if (charIndex <= travelled + length) {
      return { node: current, offset: charIndex - travelled }
    }
    travelled += length
    current = walker.nextNode() as Text | null
  }

  return null
}
