/**
 * Smart Enter Handling — guaranteed paragraph blocks
 *
 * Block model guarantee:
 *   • Enter (no modifier) → always starts a new `<p>` block. Headings,
 *     blockquotes and legacy divs are NOT cloned into the next line — the
 *     remainder of a split always lands in a paragraph, and Enter on an empty
 *     non-paragraph block turns it into a paragraph so it never stacks empty
 *     heading/quote wrappers.
 *   • Shift+Enter → soft line break (`<br>`) inside the current block. This
 *     handler is not involved; see RichTextEditor's keydown handling.
 *
 * Contexts with their own Enter semantics are intentionally skipped:
 *   • list items (see `handleListEnter` in listHandler.ts)
 *   • code blocks (`<pre>` — literal newlines)
 *   • tables / custom blocks (images, files, embeds, data-sheet tables)
 */

import { setCursorAtStart, positionCursorInElement } from './cursorPosition'
import { getClosestListItem } from './listHandler'
import { getBlockLevel, setBlockLevel, shiftSubtreeLevel } from './blockTree'

/** Block-level tags that participate in the normal paragraph flow */
const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'])

/** Inline/block content that counts as real content even without text */
const MEDIA_SELECTOR = 'img, hr, input, table, [data-block-type]'

function getStartElement(node: Node | null): HTMLElement | null {
  if (!node) return null
  return node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
}

/**
 * Walk up the tree to find the closest block-level ancestor inside the editor.
 * The editor element itself is not considered a block.
 */
export function getClosestBlock(node: Node | null, editorEl: HTMLElement): HTMLElement | null {
  let current: Node | null = node
  while (current && current !== editorEl) {
    if (current instanceof HTMLElement && BLOCK_TAGS.has(current.tagName)) {
      return current
    }
    current = current.parentElement
  }
  return null
}

/** A block is "visually empty" when it has neither text nor media content. */
function isVisuallyEmpty(block: HTMLElement): boolean {
  if ((block.textContent || '').trim().length > 0) return false
  return !block.querySelector(MEDIA_SELECTOR)
}

function hasRenderableContent(p: HTMLElement): boolean {
  if ((p.textContent || '').trim().length > 0) return true
  return !!p.querySelector(`br, ${MEDIA_SELECTOR}`)
}

/** Create a paragraph from (optional) content, adding the `<br>` placeholder when empty. */
function createParagraph(content: DocumentFragment | null): HTMLParagraphElement {
  const p = document.createElement('p')
  if (content) p.appendChild(content)
  if (!hasRenderableContent(p)) {
    p.appendChild(document.createElement('br'))
  }
  return p
}

/**
 * New blocks stay on the level of the block they were split from, so pressing
 * Enter inside a child block keeps writing children instead of jumping back
 * out of the parent.
 */
function inheritBlockLevel(source: HTMLElement, target: HTMLElement): void {
  const level = getBlockLevel(source)
  if (level > 0) setBlockLevel(target, level)
}

/** True when there is no text before the caret inside the block. */
function isCaretAtBlockStart(block: HTMLElement, range: Range): boolean {
  try {
    const probe = document.createRange()
    probe.selectNodeContents(block)
    probe.setEnd(range.startContainer, range.startOffset)
    return probe.toString().length === 0
  } catch {
    return false
  }
}

/** Move everything after the caret out of the block into a fragment. */
function extractContentAfterCaret(block: HTMLElement, range: Range): DocumentFragment | null {
  try {
    const after = document.createRange()
    after.setStart(range.endContainer, range.endOffset)
    after.setEnd(block, block.childNodes.length)
    return after.extractContents()
  } catch {
    return null
  }
}

/**
 * Place the caret at the start of a newly created block.
 * Set synchronously so fast typing / key auto-repeat can't land in the wrong
 * node, then re-asserted with WebView-friendly timing.
 */
function placeCaret(el: HTMLElement, editorEl: HTMLElement): void {
  setCursorAtStart(el)
  positionCursorInElement(el, 'start', editorEl)
}

/**
 * Handle Enter for blocks in the normal paragraph flow.
 * Returns true when the event was handled (caller should preventDefault).
 */
export function handleParagraphEnter(editorEl: HTMLElement | null): boolean {
  if (!editorEl || !editorEl.isConnected) return false

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false

  const range = selection.getRangeAt(0)
  if (!editorEl.contains(range.startContainer)) return false

  const startEl = getStartElement(range.startContainer)
  if (!startEl) return false

  // Contexts that own their Enter behavior — leave them untouched
  if (getClosestListItem(range.startContainer)) return false
  if (startEl.closest('pre')) return false
  if (startEl.closest('td, th')) return false
  // Custom blocks (images, files, embeds, data-sheet tables) but not inline
  // spans (e.g. note links), which can safely split with their paragraph.
  const customBlock = startEl.closest('[data-block], [contenteditable="false"]')
  if (customBlock && customBlock.tagName !== 'SPAN') return false

  // A non-collapsed selection is removed first, mirroring native Enter behavior
  if (!range.collapsed) {
    range.deleteContents()
    range.collapse(true)
  }

  const block = getClosestBlock(range.startContainer, editorEl)

  // ── Bare inline content directly at the editor root ──
  if (!block) {
    if (range.startContainer.nodeType === Node.TEXT_NODE && range.startContainer.parentElement === editorEl) {
      const textNode = range.startContainer as Text
      const remainder = textNode.splitText(range.startOffset)
      const fragment = document.createDocumentFragment()
      fragment.appendChild(remainder)
      const p = createParagraph(fragment)
      textNode.parentNode?.insertBefore(p, textNode.nextSibling)
      placeCaret(p, editorEl)
      return true
    }

    const p = createParagraph(null)
    range.insertNode(p)
    placeCaret(p, editorEl)
    return true
  }

  const parent = block.parentNode
  if (!parent) return false

  // ── Enter on an empty indented block steps back out one level ──
  // (Outliner habit: it ends the child list instead of stacking empty blocks.)
  if (isVisuallyEmpty(block) && getBlockLevel(block) > 0) {
    shiftSubtreeLevel(editorEl, block, -1)
    placeCaret(block, editorEl)
    return true
  }

  // ── Paragraph: split into two paragraphs ──
  if (block.tagName === 'P') {
    const p = createParagraph(extractContentAfterCaret(block, range))
    // Keep the line visible when the split consumed the placeholder <br>
    if (!hasRenderableContent(block)) {
      block.appendChild(document.createElement('br'))
    }
    parent.insertBefore(p, block.nextSibling)
    inheritBlockLevel(block, p)
    placeCaret(p, editorEl)
    return true
  }

  // ── Empty heading / quote / div → it becomes the paragraph ──
  if (isVisuallyEmpty(block)) {
    const p = document.createElement('p')
    while (block.firstChild) p.appendChild(block.firstChild)
    if (!hasRenderableContent(p)) p.appendChild(document.createElement('br'))
    inheritBlockLevel(block, p)
    parent.replaceChild(p, block)
    placeCaret(p, editorEl)
    return true
  }

  // ── Enter at the very start → new empty paragraph above, block stays intact ──
  if (isCaretAtBlockStart(block, range)) {
    const p = createParagraph(null)
    inheritBlockLevel(block, p)
    parent.insertBefore(p, block)
    placeCaret(p, editorEl)
    return true
  }

  // ── Split: the remainder after the caret becomes the new paragraph ──
  const p = createParagraph(extractContentAfterCaret(block, range))
  inheritBlockLevel(block, p)
  parent.insertBefore(p, block.nextSibling)
  placeCaret(p, editorEl)
  return true
}
