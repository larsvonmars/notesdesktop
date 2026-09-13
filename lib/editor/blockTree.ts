/**
 * Block tree — nesting on top of the flat block list.
 *
 * Blocks stay direct children of the editor. "Child blocks" are the following
 * siblings whose `data-indent` is deeper than the block's own level:
 *
 *   <h2>Plan</h2>          level 0   ← parent
 *   <p>Intro</p>           level 1   ← child
 *   <p>Detail</p>          level 2   ← grandchild
 *   <p>After</p>           level 0   ← sibling again
 *
 * Everything (parent, children, subtree) is derived from the levels, so no
 * extra markup and no migration is needed. Collapsed state is persisted as
 * `data-collapsed` on the parent and applied to its descendants as
 * `data-hidden`, which the stylesheet turns into `display: none`.
 *
 * This module deliberately has no imports so it can be used from anywhere
 * (including the DOM normaliser) without creating cycles.
 */

export const MAX_BLOCK_LEVEL = 3

export const INDENT_ATTRIBUTE = 'data-indent'
export const COLLAPSED_ATTRIBUTE = 'data-collapsed'
export const HIDDEN_ATTRIBUTE = 'data-hidden'

/** Direct element children of the editor, in document order. */
function elementChildren(editor: HTMLElement): HTMLElement[] {
  return Array.from(editor.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  )
}

/** How deep a block is nested (0 = top level). */
export function getBlockLevel(block: HTMLElement | null | undefined): number {
  if (!block) return 0

  const parsed = Number.parseInt(block.getAttribute(INDENT_ATTRIBUTE) ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0

  return Math.min(parsed, MAX_BLOCK_LEVEL)
}

/** Write a level, dropping the attribute entirely at 0. */
export function setBlockLevel(block: HTMLElement, level: number): boolean {
  const clamped = Math.max(0, Math.min(MAX_BLOCK_LEVEL, Math.floor(level)))
  if (clamped === getBlockLevel(block)) return false

  if (clamped === 0) {
    block.removeAttribute(INDENT_ATTRIBUTE)
  } else {
    block.setAttribute(INDENT_ATTRIBUTE, String(clamped))
  }

  return true
}

/**
 * A block plus every following sibling that is nested deeper than it —
 * the blocks that travel with it when dragging, collapsing or duplicating.
 */
export function getSubtree(editor: HTMLElement, block: HTMLElement): HTMLElement[] {
  const blocks = elementChildren(editor)
  const index = blocks.indexOf(block)
  if (index === -1) return []

  const level = getBlockLevel(block)
  const run = [block]
  for (let i = index + 1; i < blocks.length; i += 1) {
    if (getBlockLevel(blocks[i]) <= level) break
    run.push(blocks[i])
  }

  return run
}

/** The blocks nested under `block` (everything but the block itself). */
export function getDescendants(editor: HTMLElement, block: HTMLElement): HTMLElement[] {
  return getSubtree(editor, block).slice(1)
}

/** The block `block` belongs to (nearest preceding block with a lower level). */
export function getParentBlock(editor: HTMLElement, block: HTMLElement): HTMLElement | null {
  const blocks = elementChildren(editor)
  const index = blocks.indexOf(block)
  if (index <= 0) return null

  const level = getBlockLevel(block)
  for (let i = index - 1; i >= 0; i -= 1) {
    if (getBlockLevel(blocks[i]) < level) return blocks[i]
  }

  return null
}

/** True when the next block is nested under `block`. */
export function hasChildBlocks(editor: HTMLElement, block: HTMLElement): boolean {
  const blocks = elementChildren(editor)
  const index = blocks.indexOf(block)
  if (index === -1 || index + 1 >= blocks.length) return false

  return getBlockLevel(blocks[index + 1]) > getBlockLevel(block)
}

/** True for blocks whose parent is currently collapsed. */
export function isHiddenBlock(block: HTMLElement | null | undefined): boolean {
  return !!block && block.getAttribute(HIDDEN_ATTRIBUTE) === 'true'
}

/** Collapse state of a block (persisted in the note). */
export function isCollapsed(block: HTMLElement | null | undefined): boolean {
  return !!block && block.getAttribute(COLLAPSED_ATTRIBUTE) === 'true'
}

export function setCollapsed(block: HTMLElement, collapsed: boolean): boolean {
  if (collapsed === isCollapsed(block)) return false

  if (collapsed) {
    block.setAttribute(COLLAPSED_ATTRIBUTE, 'true')
  } else {
    block.removeAttribute(COLLAPSED_ATTRIBUTE)
  }

  return true
}

function setHidden(block: HTMLElement, hidden: boolean): boolean {
  const isHidden = isHiddenBlock(block)
  if (hidden === isHidden) return false

  if (hidden) {
    block.setAttribute(HIDDEN_ATTRIBUTE, 'true')
  } else {
    block.removeAttribute(HIDDEN_ATTRIBUTE)
  }

  return true
}

/**
 * Re-derive `data-hidden` from every `data-collapsed` root. Runs after
 * structural edits, undo/redo and loading, so hidden subtrees always match
 * their root (and markers left behind by a deleted parent are cleared).
 *
 * Returns true when the DOM actually changed.
 */
export function updateCollapsedVisibility(editor: HTMLElement): boolean {
  const blocks = elementChildren(editor)
  const collapsedLevels: number[] = []
  let changed = false

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    const level = getBlockLevel(block)

    // Close collapsed scopes the current block is no longer inside of.
    while (collapsedLevels.length > 0 && level <= collapsedLevels[collapsedLevels.length - 1]) {
      collapsedLevels.pop()
    }

    const hidden = collapsedLevels.length > 0
    changed = setHidden(block, hidden) || changed

    const next = blocks[index + 1]
    const hasChildren = !!next && getBlockLevel(next) > level
    if (!hidden && hasChildren && isCollapsed(block)) {
      collapsedLevels.push(level)
    }
  }

  return changed
}

/** Blocks a user can interact with (collapsed subtrees are display:none). */
export function getVisibleBlocks(editor: HTMLElement): HTMLElement[] {
  return elementChildren(editor).filter((block) => !isHiddenBlock(block))
}

/** True when `level` can be applied to the whole subtree. */
export function canShiftSubtreeLevel(
  editor: HTMLElement,
  block: HTMLElement,
  delta: number
): boolean {
  const subtree = getSubtree(editor, block)
  if (subtree.length === 0) return false

  if (delta < 0) return getBlockLevel(block) > 0

  return subtree.every((item) => getBlockLevel(item) < MAX_BLOCK_LEVEL)
}

/**
 * Move a block *and everything nested under it* in or out, keeping the
 * relative structure intact (indenting only the parent would orphan its
 * children).
 */
export function shiftSubtreeLevel(editor: HTMLElement, block: HTMLElement, delta: number): boolean {
  if (!canShiftSubtreeLevel(editor, block, delta)) return false

  let changed = false
  for (const item of getSubtree(editor, block)) {
    changed = setBlockLevel(item, getBlockLevel(item) + delta) || changed
  }

  return changed
}
