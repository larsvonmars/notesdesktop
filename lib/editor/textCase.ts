/**
 * Text case transforms (UPPERCASE / lowercase / Title Case).
 *
 * The selected text is re-assembled across text nodes before transforming, so
 * a selection that spans inline markup (`hel**lo** world`) is title-cased as a
 * whole instead of per node. Blocks are separated by a virtual newline so words
 * never merge across paragraphs.
 */

export type TextCaseTransform = 'upper' | 'lower' | 'title'

const WORD_SPLIT = /(\s+)/

/** Pure transform — used for whole-selection conversions and unit tests. */
export function transformTextCase(text: string, transform: TextCaseTransform): string {
  switch (transform) {
    case 'upper':
      return text.toUpperCase()
    case 'lower':
      return text.toLowerCase()
    case 'title':
      return text
        .split(WORD_SPLIT)
        .map((part) => {
          if (!part || /^\s+$/.test(part)) return part
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        })
        .join('')
    default:
      return text
  }
}

interface SelectedChar {
  node: Text
  /** Offset of this character inside `node`. */
  offset: number
}

/**
 * Collect the characters covered by `range`, in document order, together with
 * their DOM position. Virtual separators (null) are inserted between blocks.
 */
function collectSelectedChars(range: Range, root: HTMLElement): {
  chars: string[]
  refs: (SelectedChar | null)[]
} {
  const chars: string[] = []
  const refs: (SelectedChar | null)[] = []

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let previousBlock: Node | null = null

  let node = walker.nextNode() as Text | null
  while (node) {
    const text = node.data
    if (!text) {
      node = walker.nextNode() as Text | null
      continue
    }

    // Does this text node intersect the range?
    let startOffset = 0
    let endOffset = text.length

    if (node === range.startContainer) startOffset = range.startOffset
    if (node === range.endContainer) endOffset = range.endOffset

    const intersects = (() => {
      try {
        return range.intersectsNode(node)
      } catch {
        return false
      }
    })()

    if (!intersects) {
      // Still remember the block so separators stay correct across siblings.
      previousBlock = blockOf(node, root)
      node = walker.nextNode() as Text | null
      continue
    }

    const block = blockOf(node, root)
    if (previousBlock && block && previousBlock !== block) {
      chars.push('\n')
      refs.push(null)
    }
    previousBlock = block

    for (let index = startOffset; index < Math.min(endOffset, text.length); index += 1) {
      chars.push(text.charAt(index))
      refs.push({ node, offset: index })
    }

    node = walker.nextNode() as Text | null
  }

  return { chars, refs }
}

function blockOf(node: Node, root: HTMLElement): Node | null {
  let element: Node | null = node
  while (element && element.parentNode !== root) {
    element = element.parentNode
  }
  return element
}

/**
 * Apply a case transform to the current selection — or to the whole block when
 * the caret is collapsed.
 *
 * @returns true when the document text changed.
 */
export function applyTextCase(
  editorElement: HTMLElement | null | undefined,
  transform: TextCaseTransform
): boolean {
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
      const block = blockOf(liveRange.startContainer, editorElement ?? document.body)
      if (!block || !(block instanceof HTMLElement)) return false
      range = document.createRange()
      range.selectNodeContents(block)
    } else {
      range = liveRange.cloneRange()
    }

    const root = editorElement ?? document.body
    const { chars, refs } = collectSelectedChars(range, root)
    if (chars.length === 0) return false

    const original = chars.join('')
    const transformed = transformTextCase(original, transform)
    if (transformed === original) return false

    // Group the selected offsets back onto their text nodes. Inside one node
    // the selected offsets are contiguous, so one splice per node is enough.
    const perNode = new Map<Text, { start: number; end: number; indices: number[] }>()
    refs.forEach((ref, index) => {
      if (!ref) return
      const entry = perNode.get(ref.node)
      if (!entry) {
        perNode.set(ref.node, { start: ref.offset, end: ref.offset + 1, indices: [index] })
      } else {
        entry.end = ref.offset + 1
        entry.indices.push(index)
      }
    })

    // Case changes may alter the string length (ß → SS, İ → i̇). Character
    // mapping only works when the length is stable; otherwise each node is
    // transformed on its own.
    const sameLength = transformed.length === original.length

    perNode.forEach(({ start, end, indices }, node) => {
      if (!node.isConnected) return

      const source = node.data
      const selected = source.slice(start, end)
      if (!selected) return

      const replacement = sameLength
        ? indices.map((index) => transformed.charAt(index)).join('')
        : transformTextCase(selected, transform)

      const next = source.slice(0, start) + replacement + source.slice(end)
      if (next !== source) node.data = next
    })

    return true
  } catch (error) {
    console.error('Failed to change text case:', error)
    return false
  }
}
