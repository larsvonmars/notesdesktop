/**
 * Grammar squiggles built on the CSS Custom Highlight API — the same
 * non-mutating paint trick as the search highlights
 * (see `lib/editor/searchHighlight.ts`).
 *
 * Painting works through ranges only, so the editor DOM is never touched:
 * there is nothing extra to sanitize, normalise or save, and highlights can
 * never leak into the saved note.
 *
 * The API exists in Chromium 105+ and Safari 17.2+ (the renderers behind
 * Tauri's WebViews). Where it is missing these helpers are a silent no-op.
 */

const ISSUE_HIGHLIGHT_KEY = 'note-grammar-issue'
const ACTIVE_HIGHLIGHT_KEY = 'note-grammar-active'

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

/** True when the browser can paint grammar highlights. */
export function supportsGrammarHighlights(): boolean {
  return !!(getHighlightConstructor() && getHighlightRegistry())
}

/**
 * Paint every issue, with `active` (the one the popover is anchored to, if
 * any) using the stronger styling. Pass an empty list to clear.
 */
export function applyGrammarHighlights(
  ranges: readonly Range[],
  active: Range | null
): void {
  const ctor = getHighlightConstructor()
  const registry = getHighlightRegistry()
  if (!ctor || !registry) return

  try {
    const usable = ranges.filter(
      (range) => range.startContainer.isConnected && range.endContainer.isConnected
    )

    if (usable.length > 0) {
      registry.set(ISSUE_HIGHLIGHT_KEY, new ctor(...usable))
    } else {
      registry.delete(ISSUE_HIGHLIGHT_KEY)
    }

    if (active) {
      registry.set(ACTIVE_HIGHLIGHT_KEY, new ctor(active))
    } else {
      registry.delete(ACTIVE_HIGHLIGHT_KEY)
    }
  } catch {
    // A misbehaving Highlight API must never break the editor.
  }
}

/** Remove every grammar highlight from the registry. */
export function clearGrammarHighlights(): void {
  const registry = getHighlightRegistry()
  if (!registry) return

  try {
    registry.delete(ISSUE_HIGHLIGHT_KEY)
    registry.delete(ACTIVE_HIGHLIGHT_KEY)
  } catch {
    /* ignore */
  }
}
