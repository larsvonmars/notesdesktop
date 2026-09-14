/**
 * Lint "units" — the pieces of an editor document that Harper analyses.
 *
 * A unit maps 1:1 to a slice of text the linter can reason about:
 *
 * - most top-level blocks (paragraphs, headings, quotes, …) are one unit,
 * - every list item is its own unit (so items cannot bleed into each other),
 * - code (`pre`), tables and custom-block islands are never linted.
 *
 * Offsets are always **relative to the unit's flattened text**, which is what
 * keeps lints (and their fixes) stable across inline formatting: a lint that
 * spans `hello <strong>world</strong>` is still one contiguous range.
 *
 * The helpers are pure DOM — no Harper, no editor internals — so they can be
 * exercised in the unit tests without WebAssembly.
 */

/** One text node inside a unit, and where it lives in the flattened text. */
export interface UnitTextSegment {
  node: Text
  /** Offset of the first character of `node` inside the unit text. */
  start: number
  /** Offset just past the last character of `node`. */
  end: number
}

/** The flattened text of a unit plus the node map used to resolve offsets. */
export interface UnitText {
  unit: HTMLElement
  text: string
  segments: UnitTextSegment[]
}

export type DirtyTarget =
  | { kind: 'unit'; unit: HTMLElement }
  | { kind: 'skip' }
  | { kind: 'document' }

/** Guard rails so a pathological document cannot stall the scheduler. */
export const MAX_LINT_UNITS = 600
export const MAX_LINT_CHARS = 120_000
export const MAX_UNIT_CHARS = 12_000

/** Block-level tags that act as paragraph separators inside a unit. */
const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'BLOCKQUOTE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'DD', 'DT', 'FIGCAPTION',
])

/** Subtrees that are never part of the prose (app UI, data, code, media). */
const SKIP_TAGS = new Set([
  'PRE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'CAPTION',
  'UL', 'OL',
  'SVG', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'HR',
])

const TEXT_NODE = 3
const ELEMENT_NODE = 1

/** True when this element (and its subtree) must stay out of the lint text. */
export function isSkippedElement(element: Element): boolean {
  if (SKIP_TAGS.has(element.tagName)) return true
  if (element.getAttribute('contenteditable') === 'false') return true
  if (element.hasAttribute('data-block')) return true
  return false
}

/**
 * The units to lint, in document order. Text-less blocks are dropped later
 * (in `lintUnits`), because counting their exact text is the linter's job.
 */
export function collectLintUnits(root: HTMLElement): HTMLElement[] {
  const units: HTMLElement[] = []
  let totalChars = 0

  const push = (element: HTMLElement): boolean => {
    if (units.length >= MAX_LINT_UNITS) return false
    const length = (element.textContent || '').length
    if (length < 2 || length > MAX_UNIT_CHARS) return true
    if (totalChars + length > MAX_LINT_CHARS) return false
    totalChars += length
    units.push(element)
    return true
  }

  for (let i = 0; i < root.children.length; i += 1) {
    const block = root.children[i] as HTMLElement

    // Lists are containers: their items are the units (top-level lists are
    // never "skipped", unlike the nested lists inside another unit).
    if (block.tagName === 'UL' || block.tagName === 'OL') {
      const items = block.querySelectorAll('li')
      for (let j = 0; j < items.length; j += 1) {
        const item = items[j] as HTMLElement
        if (isSkippedElement(item)) continue
        if (!push(item)) return units
      }
      continue
    }

    if (isSkippedElement(block)) continue
    if (!push(block)) return units
  }

  return units
}

/**
 * Flatten a unit into lintable text. Nested block elements contribute a
 * newline so separate paragraphs/rows never read as one run-on sentence.
 */
export function collectUnitText(unit: HTMLElement): UnitText {
  const segments: UnitTextSegment[] = []
  let text = ''

  const appendText = (node: Text): void => {
    if (!node.data) return
    segments.push({ node, start: text.length, end: text.length + node.data.length })
    text += node.data
  }

  const appendSeparator = (): void => {
    if (text.length > 0 && !text.endsWith('\n')) text += '\n'
  }

  const walk = (element: Element): void => {
    const children = element.childNodes
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i]

      if (child.nodeType === TEXT_NODE) {
        appendText(child as Text)
        continue
      }
      if (child.nodeType !== ELEMENT_NODE) continue

      const childElement = child as HTMLElement
      if (isSkippedElement(childElement)) continue

      const isNestedBlock = childElement !== unit && BLOCK_TAGS.has(childElement.tagName)
      if (isNestedBlock) appendSeparator()

      walk(childElement)

      if (isNestedBlock) appendSeparator()
    }
  }

  walk(unit)

  // Trailing separators/whitespace are not part of the prose. Node ranges stay
  // valid because nothing after the last segment is removed.
  text = text.replace(/\s+$/, '')

  return { unit, text, segments }
}

/**
 * Resolve an arbitrary DOM node to the unit a mutation or click belongs to.
 * `document` means the change was structural (list rebuilt, note reloaded) and
 * the whole document should be re-linted.
 */
export function resolveDirtyTarget(editor: HTMLElement, node: Node | null): DirtyTarget {
  if (!node) return { kind: 'document' }

  let element: HTMLElement | null =
    node.nodeType === ELEMENT_NODE ? (node as HTMLElement) : node.parentElement

  while (element && element !== editor) {
    if (element.parentElement === editor) {
      // Lists are containers — resolve to the item the node lives in.
      if (element.tagName === 'UL' || element.tagName === 'OL') {
        const from: HTMLElement | null =
          node.nodeType === ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
        const item = from ? from.closest('li') : null
        if (!item || !element.contains(item)) return { kind: 'document' }
        if (isSkippedElement(item)) return { kind: 'skip' }
        return { kind: 'unit', unit: item }
      }

      if (isSkippedElement(element)) return { kind: 'skip' }
      return { kind: 'unit', unit: element }
    }
    element = element.parentElement
  }

  // Direct child of the editor (root content swap) or detached node.
  return { kind: 'document' }
}

/**
 * Map a DOM position (as reported by `caretPositionFromPoint`) back to an
 * offset in the unit text. Returns `null` when the position is outside.
 */
export function offsetForNodePosition(
  info: UnitText,
  node: Node,
  nodeOffset: number
): number | null {
  for (let i = 0; i < info.segments.length; i += 1) {
    const segment = info.segments[i]
    if (segment.node === node) {
      const clamped = Math.max(0, Math.min(segment.node.data.length, nodeOffset))
      return segment.start + clamped
    }
  }

  // Element container: map the child index onto the nearest text position.
  if (node.nodeType === ELEMENT_NODE && info.unit.contains(node)) {
    const children = node.childNodes
    const index = Math.max(0, Math.min(children.length, nodeOffset))

    for (let i = index; i < children.length; i += 1) {
      const first = firstSegmentIn(info, children[i])
      if (first) return first.start
    }
    for (let i = index - 1; i >= 0; i -= 1) {
      const last = lastSegmentIn(info, children[i])
      if (last) return last.end
    }

    const lastSegment = info.segments[info.segments.length - 1]
    return lastSegment ? lastSegment.end : null
  }

  return null
}

function firstSegmentIn(info: UnitText, container: Node): UnitTextSegment | null {
  for (let i = 0; i < info.segments.length; i += 1) {
    if (containsNode(container, info.segments[i].node)) return info.segments[i]
  }
  return null
}

function lastSegmentIn(info: UnitText, container: Node): UnitTextSegment | null {
  for (let i = info.segments.length - 1; i >= 0; i -= 1) {
    if (containsNode(container, info.segments[i].node)) return info.segments[i]
  }
  return null
}

function containsNode(container: Node, node: Node): boolean {
  if (container === node) return true
  if (container.nodeType !== ELEMENT_NODE) return false
  return (container as HTMLElement).contains(node)
}

interface TextPosition {
  node: Text
  offset: number
}

function locateStart(info: UnitText, offset: number): TextPosition | null {
  const segments = info.segments
  if (segments.length === 0) return null

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    if (segment.end > offset) {
      const clamped = Math.max(0, Math.min(segment.node.data.length, offset - segment.start))
      return { node: segment.node, offset: clamped }
    }
  }

  // Past the end of the unit text (e.g. an insertion at the last character).
  const last = segments[segments.length - 1]
  return { node: last.node, offset: last.node.data.length }
}

function locateEnd(info: UnitText, offset: number): TextPosition | null {
  const segments = info.segments
  if (segments.length === 0) return null

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    if (offset > segment.end) continue

    if (offset <= segment.start) {
      // Offset sits in a separator gap (or exactly on the boundary).
      const previous = i > 0 ? segments[i - 1] : null
      if (previous && previous.end < offset) {
        return { node: previous.node, offset: previous.node.data.length }
      }
      return { node: segment.node, offset: 0 }
    }

    return { node: segment.node, offset: offset - segment.start }
  }

  const last = segments[segments.length - 1]
  return { node: last.node, offset: last.node.data.length }
}

/** A DOM range covering `[start, end)` of the unit text, or `null`. */
export function rangeForOffsets(info: UnitText, start: number, end: number): Range | null {
  if (info.segments.length === 0) return null

  const from = locateStart(info, start)
  const to = locateEnd(info, Math.max(start, end))
  if (!from || !to) return null

  try {
    const range = document.createRange()
    range.setStart(from.node, from.offset)
    range.setEnd(to.node, to.offset)
    return range
  } catch {
    return null
  }
}

/**
 * Replace `[start, end)` of the unit text with `replacement`.
 *
 * Single-node spans (words, most lints) are patched in place so inline
 * formatting around them survives untouched; spans across inline elements fall
 * back to a range splice.
 */
export function applyReplacementAtOffsets(
  info: UnitText,
  start: number,
  end: number,
  replacement: string
): boolean {
  if (info.segments.length === 0) return false

  // Collapsed (insertion) — both ends must resolve to the same position, which
  // the start/end locators do not guarantee around separator gaps.
  if (end <= start) {
    const position = locateEnd(info, start)
    if (!position) return false
    try {
      position.node.replaceData(position.offset, 0, replacement)
      return true
    } catch {
      return false
    }
  }

  const from = locateStart(info, start)
  const to = locateEnd(info, Math.max(start, end))
  if (!from || !to) return false

  if (from.node === to.node) {
    const node = from.node
    const low = Math.min(from.offset, to.offset)
    const high = Math.max(from.offset, to.offset)
    try {
      node.replaceData(low, high - low, replacement)
      return true
    } catch {
      return false
    }
  }

  try {
    const range = document.createRange()
    range.setStart(from.node, from.offset)
    range.setEnd(to.node, to.offset)
    range.deleteContents()
    if (replacement) range.insertNode(document.createTextNode(replacement))
    return true
  } catch {
    return false
  }
}
