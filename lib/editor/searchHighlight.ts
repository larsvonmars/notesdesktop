/**
 * Non-mutating search highlights built on the CSS Custom Highlight API.
 *
 * The CSS Custom Highlight API paints ranges without touching the DOM, so the
 * note content stays untouched (nothing extra to sanitize or save). It is
 * available in Chromium 105+ and Safari 17.2+; everywhere else these helpers
 * are a silent no-op and callers fall back to selecting the current match.
 */

const ALL_HIGHLIGHT_KEY = 'note-search-all'
const CURRENT_HIGHLIGHT_KEY = 'note-search-current'

type HighlightConstructor = new (...ranges: Range[]) => unknown

interface HighlightRegistryLike {
  set: (key: string, value: unknown) => void
  delete: (key: string) => void
  has?: (key: string) => boolean
}

function getHighlightConstructor(): HighlightConstructor | null {
  const ctor = (globalThis as { Highlight?: HighlightConstructor }).Highlight
  if (typeof ctor !== 'function') return null
  return ctor
}

function getHighlightRegistry(): HighlightRegistryLike | null {
  if (typeof CSS === 'undefined') return null
  const registry = (CSS as unknown as { highlights?: HighlightRegistryLike }).highlights
  if (!registry || typeof registry.set !== 'function' || typeof registry.delete !== 'function') {
    return null
  }
  return registry
}

/** True when the browser supports all-match highlighting. */
export function supportsSearchHighlights(): boolean {
  return !!(getHighlightConstructor() && getHighlightRegistry())
}

/**
 * Paint all matches, with `current` (if any) using the accent colour.
 * Pass an empty list to clear.
 */
export function applySearchHighlights(ranges: readonly Range[], current: Range | null): void {
  const ctor = getHighlightConstructor()
  const registry = getHighlightRegistry()
  if (!ctor || !registry) return

  try {
    const usable = ranges.filter(
      (range) => range.startContainer.isConnected && range.endContainer.isConnected
    )

    if (usable.length > 0) {
      registry.set(ALL_HIGHLIGHT_KEY, new ctor(...usable))
    } else {
      registry.delete(ALL_HIGHLIGHT_KEY)
    }

    if (current) {
      registry.set(CURRENT_HIGHLIGHT_KEY, new ctor(current))
    } else {
      registry.delete(CURRENT_HIGHLIGHT_KEY)
    }
  } catch {
    // Highlight API misbehaving — search still works without the paint layer.
  }
}

/** Remove every search highlight from the registry. */
export function clearSearchHighlights(): void {
  const registry = getHighlightRegistry()
  if (!registry) return

  try {
    registry.delete(ALL_HIGHLIGHT_KEY)
    registry.delete(CURRENT_HIGHLIGHT_KEY)
  } catch {
    /* ignore */
  }
}
