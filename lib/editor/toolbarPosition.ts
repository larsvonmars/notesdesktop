/**
 * Pure geometry for the floating text-selection toolbar.
 *
 * The module deliberately avoids DOM/browser access so the placement rules can
 * be unit-tested without a real layout engine. The hook that owns the toolbar
 * (lib/editor/useFloatingToolbar.ts) feeds it the selection line rects plus the
 * measured toolbar size and applies the returned coordinates.
 */

export interface RectLike {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export type ToolbarPlacement = 'above' | 'below'

export interface ToolbarPosition {
  top: number
  left: number
  placement: ToolbarPlacement
}

export interface ComputeToolbarPositionOptions {
  /** One client rect per rendered selection line (a single bounding rect also works). */
  lineRects: readonly RectLike[]
  /** Measured toolbar size — `width` may be 0 before the first measurement. */
  size: Size
  /** Visible viewport (window.innerWidth / window.innerHeight). */
  viewport: Size
  /** Minimum distance kept from every viewport edge. */
  margin?: number
  /** Vertical gap between the selection and the toolbar. */
  gap?: number
}

/** Rects that carry no usable geometry (empty lines report 0×0) are ignored. */
function isUsableRect(rect: RectLike | null | undefined): rect is RectLike {
  return (
    !!rect &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    (rect.width > 0 || rect.height > 0)
  )
}

/**
 * Compute where the floating toolbar should sit for a given selection.
 *
 * Placement rules (in order):
 *  1. Prefer directly **above the first selected line**, centred on that line.
 *  2. When there is not enough room above, place it **below the last line**,
 *     centred on that line.
 *  3. When neither side fully fits, pick the side with more room and clamp into
 *     the viewport — the toolbar stays reachable instead of drifting off-screen.
 *
 * The horizontal position is clamped to `margin` from both viewport edges so a
 * selection at the start/end of a line never pushes the toolbar half off-screen.
 *
 * Returns `null` when no usable selection rect exists.
 */
export function computeToolbarPosition({
  lineRects,
  size,
  viewport,
  margin = 12,
  gap = 8,
}: ComputeToolbarPositionOptions): ToolbarPosition | null {
  const lines = lineRects
    .filter(isUsableRect)
    .slice()
    .sort((a, b) => a.top - b.top || a.left - b.left)

  if (lines.length === 0) return null

  const firstLine = lines[0]
  const lastLine = lines[lines.length - 1]

  // Horizontal anchor: prefer a line that actually has width (blank lines /
  // trailing line-break rects report width 0 and would centre on their edge).
  let firstAnchor = firstLine
  for (const line of lines) {
    if (line.width > 0) {
      firstAnchor = line
      break
    }
  }
  let lastAnchor = lastLine
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].width > 0) {
      lastAnchor = lines[i]
      break
    }
  }

  const viewportWidth = Math.max(viewport.width, 1)
  const viewportHeight = Math.max(viewport.height, 1)
  const maxWidth = Math.max(viewportWidth - margin * 2, 0)
  const width = Math.max(0, Math.min(size.width, maxWidth))
  const height = Math.max(0, size.height)

  const clampLeft = (centerX: number): number => {
    const ideal = centerX - width / 2
    const maxLeft = Math.max(margin, viewportWidth - margin - width)
    return Math.min(Math.max(ideal, margin), maxLeft)
  }

  const roomAbove = firstLine.top - gap - margin
  const roomBelow = viewportHeight - (lastLine.bottom + gap) - margin

  let placement: ToolbarPlacement
  if (height <= roomAbove) {
    placement = 'above'
  } else if (height <= roomBelow) {
    placement = 'below'
  } else {
    placement = roomAbove >= roomBelow ? 'above' : 'below'
  }

  if (placement === 'above') {
    const top = Math.max(firstLine.top - gap - height, margin)
    return {
      top,
      left: clampLeft(firstAnchor.left + firstAnchor.width / 2),
      placement,
    }
  }

  const maxTop = Math.max(margin, viewportHeight - margin - height)
  const top = Math.min(Math.max(lastLine.bottom + gap, margin), maxTop)
  return {
    top,
    left: clampLeft(lastAnchor.left + lastAnchor.width / 2),
    placement,
  }
}
