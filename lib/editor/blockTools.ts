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
import {
  getBlockLevel,
  isHiddenBlock,
  setBlockLevel,
  shiftSubtreeLevel,
  MAX_BLOCK_LEVEL,
} from './blockTree'

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
 * Top-level block at a viewport height, used when the pointer is not over any
 * text — the block handle lives in the editor's left gutter, where the element
 * under the cursor is the editor itself. Blocks whose box is at most
 * `tolerance` px away also count, so the tiny gaps and margins between blocks
 * (and the editor's own padding) never turn into dead zones where the handle
 * would disappear just as the user reaches for it.
 */
export function blockAtPoint(
  editor: HTMLElement,
  clientY: number,
  tolerance = 14
): HTMLElement | null {
  let nearest: HTMLElement | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const block of getElementChildren(editor)) {
    const rect = block.getBoundingClientRect()
    if (rect.height <= 0) continue
    if (isHiddenBlock(block)) continue

    if (clientY >= rect.top && clientY <= rect.bottom) return block

    const distance = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = block
    }
  }

  return nearestDistance <= tolerance ? nearest : null
}

/**
 * Block that a drop at `clientY` would be inserted before (null = append).
 * Dragged blocks are ignored so the calculation is stable mid-drag — pass the
 * whole run when a multi-block selection is being dragged.
 */
export function findDropReference(
  editor: HTMLElement,
  clientY: number,
  dragged: HTMLElement | readonly HTMLElement[] | null
): HTMLElement | null {
  const ignored: readonly HTMLElement[] =
    dragged === null ? [] : Array.isArray(dragged) ? dragged : [dragged as HTMLElement]

  for (const block of getElementChildren(editor)) {
    if (ignored.includes(block)) continue
    // Blocks inside a collapsed subtree are not valid drop targets.
    if (isHiddenBlock(block)) continue
    const rect = block.getBoundingClientRect()
    if (rect.height <= 0) continue
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

  const clone = cloneBlockForDuplicate(editor, block)
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

// ── Indentation ───────────────────────────────────────────────────────────

/** Furthest a block can be pushed in with Tab. */
export const MAX_BLOCK_INDENT = MAX_BLOCK_LEVEL

/** Current indentation level of a block (0 when unset, clamped to the max). */
export function getBlockIndent(block: HTMLElement | null | undefined): number {
  return getBlockLevel(block)
}

/**
 * Blocks that Tab moves sideways. Lists nest through their own indent/outdent
 * (see listHandler) and custom islands never move at all.
 */
export function canIndentBlock(block: HTMLElement | null | undefined): boolean {
  if (!block) return false

  const kind = blockKind(block)
  return (
    kind !== 'ul' && kind !== 'ol' && kind !== 'checklist' && kind !== 'table' && kind !== 'block'
  )
}

/** Write an indentation level, dropping the attribute entirely at 0. */
export function setBlockIndent(block: HTMLElement, level: number): boolean {
  return setBlockLevel(block, level)
}

/**
 * Tab / Shift+Tab entry point: move a block **and its child blocks** one step
 * further in or out, so the nesting under it survives the move.
 * Returns false when the block cannot be indented or nothing would change.
 */
export function indentBlock(block: HTMLElement, delta: number): boolean {
  if (!canIndentBlock(block)) return false

  const editor = block.parentElement
  if (!editor) return false

  return shiftSubtreeLevel(editor, block, delta)
}

/**
 * Give an empty block its `<br>` placeholder back. Without it the block has no
 * line height — it cannot be clicked and the caret has nowhere to live (e.g.
 * after the slash menu removed its `/query` text).
 */
export function ensureBlockPlaceholder(block: HTMLElement | null | undefined): boolean {
  if (!block || !block.isConnected) return false
  // Custom islands render their own content — never inject nodes into them.
  if (block.hasAttribute('data-block') || block.hasAttribute('data-block-type')) return false
  if ((block.textContent ?? '').trim().length > 0) return false
  if (block.querySelector('br, img, hr, input, table, [data-block]')) return false

  // Typing and deleting can leave empty text nodes behind — drop them so the
  // block is only treated as content-less when it really is.
  Array.from(block.childNodes).forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE && !child.textContent) child.remove()
  })
  if (block.childNodes.length > 0) return false

  block.appendChild(document.createElement('br'))
  return true
}

// ── Multi-block selections ────────────────────────────────────────────────

/** Contiguous run between two blocks (order of the arguments does not matter). */
export function getBlockRange(
  editor: HTMLElement,
  from: HTMLElement,
  to: HTMLElement
): HTMLElement[] {
  const children = getElementChildren(editor)
  const fromIndex = children.indexOf(from)
  const toIndex = children.indexOf(to)
  if (fromIndex === -1 || toIndex === -1) return []

  const start = Math.min(fromIndex, toIndex)
  const end = Math.max(fromIndex, toIndex)
  return children.slice(start, end + 1)
}

/**
 * Reduce an arbitrary set of blocks to the contiguous run they span.
 * Selections always come from `getBlockRange`, but resolving again here keeps
 * the group helpers safe to call with stale or gappy input.
 */
function resolveBlockRun(editor: HTMLElement, blocks: readonly HTMLElement[]): HTMLElement[] {
  const children = getElementChildren(editor)
  const indexes = blocks
    .filter((block) => !!block && block.parentElement === editor)
    .map((block) => children.indexOf(block))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)

  if (indexes.length === 0) return []

  const run: HTMLElement[] = []
  for (let index = indexes[0]; index <= indexes[indexes.length - 1]; index += 1) {
    run.push(children[index])
  }
  return run
}

/** True when the whole run can still move one step in `direction`. */
export function canMoveBlocks(
  editor: HTMLElement,
  blocks: readonly HTMLElement[],
  direction: 'up' | 'down'
): boolean {
  const run = resolveBlockRun(editor, blocks)
  if (run.length === 0) return false

  if (direction === 'up') {
    const before = run[0].previousElementSibling
    return !!before && before.parentElement === editor
  }

  const after = run[run.length - 1].nextElementSibling
  return !!after && after.parentElement === editor
}

/**
 * True when dropping the run in front of `reference` would change the order.
 * The reference must stay outside of the run.
 */
export function canMoveBlocksBefore(
  editor: HTMLElement,
  blocks: readonly HTMLElement[],
  reference: HTMLElement | null
): boolean {
  const run = resolveBlockRun(editor, blocks)
  if (run.length === 0) return false

  if (reference === null) return editor.lastElementChild !== run[run.length - 1]
  if (!editor.contains(reference) || run.includes(reference)) return false

  return run[run.length - 1].nextElementSibling !== reference
}

/** Insert the whole run before `reference` (null = append), keeping its order. */
export function moveBlocksBefore(
  editor: HTMLElement,
  blocks: readonly HTMLElement[],
  reference: HTMLElement | null
): boolean {
  const run = resolveBlockRun(editor, blocks)
  if (run.length === 0 || !canMoveBlocksBefore(editor, run, reference)) return false

  for (const block of run) {
    if (reference === null) {
      editor.appendChild(block)
    } else {
      editor.insertBefore(block, reference)
    }
  }

  return true
}

/**
 * Move a contiguous run one block up or down. The run stays intact: only the
 * element crossing the boundary is re-inserted.
 */
export function moveBlocks(
  editor: HTMLElement,
  blocks: readonly HTMLElement[],
  direction: 'up' | 'down'
): boolean {
  const run = resolveBlockRun(editor, blocks)
  if (run.length === 0 || !canMoveBlocks(editor, run, direction)) return false

  if (direction === 'up') {
    // The block just above the run has to jump below it (append when it ends
    // the document), which slides the whole run up by one.
    const before = run[0].previousElementSibling as HTMLElement
    editor.insertBefore(before, run[run.length - 1].nextSibling)
  } else {
    // Mirror image: the block just below the run jumps above it.
    const last = run[run.length - 1]
    const after = last.nextElementSibling as HTMLElement
    editor.insertBefore(after, run[0])
  }

  return true
}

/** Deep-copy a block with fresh ids (shared by single and group duplication). */
function cloneBlockForDuplicate(editor: HTMLElement, block: HTMLElement): HTMLElement {
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

  return clone
}

/**
 * Duplicate a run of blocks, keeping the original order. The clones land
 * directly below the selection, so they can be dragged away as a group.
 */
export function duplicateBlocks(
  editor: HTMLElement,
  blocks: readonly HTMLElement[]
): HTMLElement[] {
  const run = resolveBlockRun(editor, blocks)
  if (run.length === 0) return []

  const clones: HTMLElement[] = []
  let anchor: HTMLElement = run[run.length - 1]

  for (const block of run) {
    const clone = cloneBlockForDuplicate(editor, block)
    anchor.after(clone)
    clones.push(clone)
    anchor = clone
  }

  return clones
}

/**
 * Remove a run of blocks, caret to the following (or previous) block.
 * Removing everything leaves a single empty paragraph behind.
 */
export function removeBlocks(editor: HTMLElement, blocks: readonly HTMLElement[]): boolean {
  const run = resolveBlockRun(editor, blocks)
  if (run.length === 0) return false

  // Never leave the editor without a block to type into.
  if (run.length >= getElementChildren(editor).length) {
    const paragraph = document.createElement('p')
    paragraph.appendChild(document.createElement('br'))
    editor.replaceChildren(paragraph)
    setCursorAtStart(paragraph)
    return true
  }

  const next = run[run.length - 1].nextElementSibling as HTMLElement | null
  const previous = run[0].previousElementSibling as HTMLElement | null
  run.forEach((block) => block.remove())

  const focusTarget = next ?? previous
  if (focusTarget) setCursorAtStart(focusTarget)

  return true
}
