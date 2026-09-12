/**
 * Text search over a contentEditable root.
 *
 * Matches are always confined to a **single text node**. That keeps counts,
 * highlighting and replacement honest: a match that spans two text nodes (for
 * example `hello **world**`) cannot be highlighted or replaced reliably, so it
 * is not reported as a match in the first place.
 *
 * Non-editable islands (custom blocks, embeds, inputs) are skipped — their text
 * must never be replaced by find & replace.
 */

export interface SearchMatch {
  /** Text node containing the match. */
  node: Text
  /** Character offset of the match start inside `node`. */
  start: number
  /** Character offset of the match end (exclusive) inside `node`. */
  end: number
}

export interface SearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
}

/** Guard rails so a pathological query cannot freeze the editor. */
export const MAX_SEARCH_MATCHES = 1000
export const MAX_REPLACE_MATCHES = 1000

const WORD_CHAR_FALLBACK = /[0-9A-Za-z_]/
let wordCharPattern: RegExp | null = null

/**
 * Word-character test used by whole-word search. The Unicode property escapes
 * need the `u` flag, which the project's ES5 compile target rejects as a
 * literal — so it is built at runtime with an ASCII fallback.
 */
function isWordChar(char: string | undefined): boolean {
  if (!char) return false

  if (!wordCharPattern) {
    try {
      wordCharPattern = new RegExp('[\\p{L}\\p{N}_]', 'u')
    } catch {
      wordCharPattern = WORD_CHAR_FALLBACK
    }
  }

  return wordCharPattern.test(char)
}

/**
 * Text nodes that belong to editable content, in document order.
 * Subtrees with `contenteditable="false"` are skipped.
 */
export function collectSearchableTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = []

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest('[contenteditable="false"]')) return NodeFilter.FILTER_REJECT
      if (!node.textContent) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  let node = walker.nextNode()
  while (node) {
    nodes.push(node as Text)
    node = walker.nextNode()
  }

  return nodes
}

/**
 * Find every occurrence of `query` inside the editable text of `root`.
 * Results are in document order.
 */
export function findMatches(
  root: HTMLElement | null | undefined,
  query: string,
  options: SearchOptions = {}
): SearchMatch[] {
  const matches: SearchMatch[] = []
  if (!root || !query) return matches

  const { caseSensitive = false, wholeWord = false } = options
  const needle = caseSensitive ? query : query.toLowerCase()
  if (!needle) return matches

  for (const node of collectSearchableTextNodes(root)) {
    const text = node.data
    if (!text || text.length < needle.length) continue

    // `toLowerCase()` can change a string's length for rare characters
    // (e.g. 'İ'), which would misalign offsets — stay case-sensitive then.
    const lowered = caseSensitive ? text : text.toLowerCase()
    const haystack = lowered.length === text.length ? lowered : text
    const effectiveNeedle = lowered.length === text.length ? needle : query

    let from = 0
    const lastPossible = haystack.length - effectiveNeedle.length

    while (from <= lastPossible) {
      const start = haystack.indexOf(effectiveNeedle, from)
      if (start === -1) break

      const end = start + effectiveNeedle.length
      const wholeWordOk =
        !wholeWord || (!isWordChar(text[start - 1]) && !isWordChar(text[end]))

      if (wholeWordOk) {
        matches.push({ node, start, end })
        if (matches.length >= MAX_SEARCH_MATCHES) return matches
      }

      from = start + Math.max(1, effectiveNeedle.length)
    }
  }

  return matches
}

/** A DOM range covering the match (call sites add it to a selection/highlight). */
export function matchRange(match: SearchMatch): Range {
  const range = document.createRange()
  range.setStart(match.node, match.start)
  range.setEnd(match.node, match.end)
  return range
}

/**
 * Replace every match with plain `replacement` text.
 *
 * Matches are applied back-to-front so earlier offsets in the same text node
 * stay valid, and the replacement keeps the surrounding inline formatting.
 *
 * @returns the number of replacements performed.
 */
export function replaceMatches(
  root: HTMLElement | null | undefined,
  matches: readonly SearchMatch[],
  replacement: string
): number {
  if (!root || matches.length === 0) return 0
  if (matches.length > MAX_REPLACE_MATCHES) return 0

  let replaced = 0

  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i]
    const node = match.node
    if (!node.isConnected || !root.contains(node)) continue

    const length = match.end - match.start
    if (length <= 0 || match.start < 0 || match.end > node.data.length) continue

    try {
      node.replaceData(match.start, length, replacement)
      replaced += 1
    } catch {
      /* node changed underneath us — skip this match */
    }
  }

  return replaced
}
