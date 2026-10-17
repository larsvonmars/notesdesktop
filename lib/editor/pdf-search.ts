import { findItemIndexAtOffset, normalizeForSearch } from './pdf-text-layout'

/** Per-page search index: normalized text plus the string offset of each text item. */
export interface SearchIndexPage {
  pageNumber: number
  normalized: string
  itemOffsets: number[]
}

/** A search hit mapped to a range of text items on one page. */
export interface SearchMatch {
  pageNumber: number
  itemStart: number
  itemEnd: number
}

/** Minimal shape of a pdf.js text item that matters for searching. */
export interface PdfTextItemLike {
  str: string
  hasEOL?: boolean
}

/**
 * Joins a page's text items into one searchable string while remembering the
 * offset of each item, so match offsets can be mapped back to text-layer spans.
 */
export function buildSearchIndexEntry(
  pageNumber: number,
  items: PdfTextItemLike[]
): SearchIndexPage {
  const itemOffsets: number[] = []
  let raw = ''
  for (const item of items) {
    itemOffsets.push(raw.length)
    raw += item.str
    if (item.hasEOL) raw += '\n'
  }
  return { pageNumber, normalized: normalizeForSearch(raw), itemOffsets }
}

/**
 * Finds every occurrence of `query` across the indexed pages. Matching happens
 * on the joined page text so phrases can span text items.
 */
export function findSearchMatches(index: SearchIndexPage[], query: string): SearchMatch[] {
  const normalizedQuery = normalizeForSearch(query.trim())
  if (!normalizedQuery) return []

  const matches: SearchMatch[] = []
  for (const entry of index) {
    if (!entry.normalized) continue
    let from = entry.normalized.indexOf(normalizedQuery)
    while (from !== -1) {
      matches.push({
        pageNumber: entry.pageNumber,
        itemStart: findItemIndexAtOffset(entry.itemOffsets, from),
        itemEnd: findItemIndexAtOffset(entry.itemOffsets, from + normalizedQuery.length - 1),
      })
      from = entry.normalized.indexOf(normalizedQuery, from + Math.max(1, normalizedQuery.length))
    }
  }
  return matches
}
