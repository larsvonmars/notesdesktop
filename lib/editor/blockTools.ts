/**
 * Structural helpers for top-level editor blocks.
 *
 * A "block" is a direct child of the contentEditable root — paragraph, heading,
 * quote, code block, list, table wrapper or custom `[data-block]` island. These
 * helpers power the hover handle (duplicate / delete / turn into / drag) and the
 * Alt+↑/↓ keyboard reordering, and they never touch inline formatting.
 */

import { generateHeadingId } from './commandDispatcher'
import { setCursorAtStart } from './cursorPosition'

export type BlockKind =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'quote'
  | 'code'
  | 'ul'
  | 'ol'
  | 'checklist'
  | 'table'
  | 'divider'
  | 'block'
  | 'other'

const HEADING_PATTERN = /^h[1-6]$/

/** Direct children of the editor that represent content. */
export function getElementChildren(editor: HTMLElement): HTMLElement[] {
  return Array.from(editor.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  )
}

/** The top-level block containing `node`, or null when it is not in a block. */
export function getTopLevelBlock(
  node: Node | null | undefined,
  editor: HTMLElement | null | undefined
): HTMLElement | null {
  if (!node || !editor) return null

  let element: HTMLElement | null =
    node.nodeType === Node.TEXT_NODE
      ? node.parentElement
      : node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : null

  if (!element || element === editor) return null

  while (element && element.parentElement && element.parentElement !== editor) {
    element = element.parentElement
  }

  return element && element.parentElement === editor ? element : null
}

/** Classify a block for the handle label and the "turn into" menu. */
export function blockKind(block: HTMLElement | null | undefined): BlockKind {
  if (!block) return 'other'

  const tag = block.tagName.toLowerCase()

  if (tag === 'ul' || tag === 'ol') {
    return block.getAttribute('data-checklist') === 'true' ? 'checklist' : (tag as 'ul' | 'ol')
  }
  if (HEADING_PATTERN.test(tag)) return tag as BlockKind
  if (tag === 'p') return 'paragraph'
  if (tag === 'blockquote') return 'quote'
  if (tag === 'pre') return 'code'
  if (tag === 'hr') return 'divider'
  if (tag === 'table' || !!block.querySelector('table')) return 'table'
  if (block.hasAttribute('data-block')) return 'block'

  return 'other'
}

/** Short label shown inside the hover handle. */
export function blockLabel(kind: BlockKind): string {
  switch (kind) {
    case 'paragraph':
      return 'P'
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return kind.toUpperCase()
    case 'quote':
      return '\u201C'
    case 'code':
      return '</>'
    case 'ul':
      return '\u2022'
    case 'ol':
      return '1.'
    case 'checklist':
      return '\u2611'
    case 'table':
      return '\u25A6'
    case 'divider':
      return '\u2014'
    case 'block':
      return '\u25AB'
    default:
      return '\u00B6'
  }
}

/** Blocks whose content cannot be re-typed (custom islands, dividers, tables). */
export function isStructuralBlock(kind: BlockKind): boolean {
  return kind === 'block' || kind === 'divider' || kind === 'table'
}

/** Move the caret to the start of a block (used before running commands on it). */
export function placeCaretInBlock(block: HTMLElement): boolean {
  if (!block.isConnected) return false
  return setCursorAtStart(block)
}

/** Swap a block with its previous/next sibling. */
export function moveBlock(
  editor: HTMLElement,
  block: HTMLElement,
  direction: 'up' | 'down'
): boolean {
  if (!editor.contains(block) || block.parentElement !== editor) return false

  const siblings = getElementChildren(editor)
  const index = siblings.indexOf(block)
  if (index === -1) return false

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= siblings.length) return false

  const neighbour = siblings[targetIndex]
  if (direction === 'up') {
    editor.insertBefore(block, neighbour)
  } else {
    editor.insertBefore(block, neighbour.nextSibling)
  }

  return true
}

/** True when the block would actually change position for this drop target. */
export function canMoveBlockBefore(
  editor: HTMLElement,
  block: HTMLElement,
  reference: HTMLElement | null
): boolean {
  if (!editor.contains(block) || block.parentElement !== editor) return false
  if (reference === null) return editor.lastElementChild !== block
  if (reference === block || !editor.contains(reference)) return false
  return block.nextElementSibling !== reference
}

/** Insert `block` before `reference` (null = append at the end). */
export function moveBlockBefore(
  editor: HTMLElement,
  block: HTMLElement,
  reference: HTMLElement | null
): boolean {
  if (!canMoveBlockBefore(editor, block, reference)) return false

  if (reference === null) {
    editor.appendChild(block)
    return true
  }

  editor.insertBefore(block, reference)
  return true
}

/**
 * Block that a drop at `clientY` would be inserted before (null = append).
 * The dragged block itself is ignored so the calculation is stable mid-drag.
 */
export function findDropReference(
  editor: HTMLElement,
  clientY: number,
  dragged: HTMLElement | null
): HTMLElement | null {
  for (const block of getElementChildren(editor)) {
    if (block === dragged) continue
    const rect = block.getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) return block
  }
  return null
}

/** Y offset (relative to the editor box) of the drop indicator line. */
export function dropIndicatorTop(
  editor: HTMLElement,
  reference: HTMLElement | null
): number | null {
  const editorRect = editor.getBoundingClientRect()

  if (reference) {
    return reference.getBoundingClientRect().top - editorRect.top
  }

  const last = editor.lastElementChild
  if (!last) return null
  return last.getBoundingClientRect().bottom - editorRect.top
}

/** Deep-copy a block directly below itself, keeping ids unique. */
export function duplicateBlock(editor: HTMLElement, block: HTMLElement): HTMLElement | null {
  if (!editor.contains(block) || block.parentElement !== editor) return null

  const clone = block.cloneNode(true) as HTMLElement

  // Never duplicate `id`s — heading ids are TOC anchors, other ids belong to
  // injected widgets. Headings get a fresh, unique generated anchor instead.
  clone.removeAttribute('id')
  clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'))
  if (HEADING_PATTERN.test(clone.tagName.toLowerCase())) {
    try {
      const base = generateHeadingId(clone.textContent || '')
      if (base) {
        let candidate = base
        let suffix = 2
        while (editor.querySelector(`[id="${candidate}"]`)) {
          candidate = `${base}-${suffix}`
          suffix += 1
        }
        clone.id = candidate
      }
    } catch {
      /* best effort */
    }
  }

  block.after(clone)
  return clone
}

/** Remove a block, caret to the following (or previous) block. */
export function removeBlock(editor: HTMLElement, block: HTMLElement): boolean {
  if (!editor.contains(block) || block.parentElement !== editor) return false

  // Never leave the editor without a block to type into.
  if (getElementChildren(editor).length <= 1) {
    const paragraph = document.createElement('p')
    paragraph.appendChild(document.createElement('br'))
    editor.replaceChild(paragraph, block)
    setCursorAtStart(paragraph)
    return true
  }

  const next = block.nextElementSibling as HTMLElement | null
  const previous = block.previousElementSibling as HTMLElement | null
  block.remove()

  const focusTarget = next ?? previous
  if (focusTarget) setCursorAtStart(focusTarget)

  return true
}

/**
 * Turn a paragraph-like block into a `<pre><code>` code block, keeping its text.
 * Lists and structural islands are left alone.
 */
export function convertBlockToCode(
  editor: HTMLElement,
  block: HTMLElement
): HTMLElement | null {
  if (!editor.contains(block) || block.parentElement !== editor) return null

  const kind = blockKind(block)
  if (kind === 'code' || isStructuralBlock(kind) || kind === 'ul' || kind === 'ol' || kind === 'checklist') {
    return null
  }

  const pre = document.createElement('pre')
  const code = document.createElement('code')

  // Move the inline content over (children are shared, not cloned).
  while (block.firstChild) {
    code.appendChild(block.firstChild)
  }
  if (!code.firstChild) {
    code.appendChild(document.createElement('br'))
  }

  pre.appendChild(code)
  block.replaceWith(pre)
  setCursorAtStart(code)

  return pre
}
