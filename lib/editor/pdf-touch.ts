/**
 * Pure helpers behind the PDF annotation editor's touch/tablet support.
 *
 * Everything here is DOM-free and side-effect free so the gesture and
 * palm-rejection rules can be unit tested without a browser.
 */

/** The three pointer kinds the editor distinguishes. */
export type PointerKind = 'mouse' | 'touch' | 'pen'

/** Contact area (CSS px) above which a touch is treated as a palm/cheek. */
export const PALM_CONTACT_SIZE_PX = 24

/** Neutral pressure used for input devices that report no real pressure. */
export const NEUTRAL_PRESSURE = 0.5

/** Two taps within this window count as a double-tap on touch. */
export const TOUCH_DOUBLE_TAP_MS = 320
/** Max finger travel between two taps for them to still be a double-tap. */
export const TOUCH_DOUBLE_TAP_SLOP_PX = 28
/** Mouse double-click tuning (matches the browser default). */
export const MOUSE_DOUBLE_CLICK_MS = 400
export const MOUSE_DOUBLE_CLICK_SLOP_PX = 10

/** Normalizes `PointerEvent.pointerType` to the three kinds we support. */
export function toPointerKind(pointerType: string | undefined): PointerKind {
  return pointerType === 'pen' ? 'pen' : pointerType === 'touch' ? 'touch' : 'mouse'
}

/**
 * Stylus pressure, or the neutral value for devices that cannot report it.
 *
 * Touchscreens report either 0 or a flat 1 for every contact. `perfect-freehand`
 * renders a zero-pressure point as an invisible dot, so those values are
 * replaced rather than passed through.
 */
export function normalizePressure(
  pointerType: string | undefined,
  pressure: number | undefined,
): number {
  if (pointerType === 'pen' && pressure != null && pressure > 0) {
    return Math.min(1, pressure)
  }
  return NEUTRAL_PRESSURE
}

export interface PalmRejectionInput {
  pointerType: string | undefined
  /** Contact width in CSS px (`PointerEvent.width`). */
  width: number
  height: number
  /** Kind of the pointer that currently owns the drawing gesture, if any. */
  activePointerKind: PointerKind | null
}

/**
 * True when a touch should be discarded as accidental input.
 *
 * Two rules, in order:
 * 1. Any finger landing while a stylus is down belongs to the resting hand.
 * 2. A very large contact patch is a palm or cheek, not a fingertip.
 */
export function isPalmTouch(input: PalmRejectionInput): boolean {
  if (input.pointerType !== 'touch') return false
  if (input.activePointerKind === 'pen') return true
  return input.width > PALM_CONTACT_SIZE_PX || input.height > PALM_CONTACT_SIZE_PX
}

export interface TapRecord {
  time: number
  x: number
  y: number
}

/**
 * Double-tap / double-click detection.
 *
 * The canvas calls `preventDefault()` on pointerdown (which suppresses the
 * browser's native `dblclick`), and fingers need far more tolerance than a
 * mouse cursor, so both are handled here.
 */
export function isDoubleTap(
  previous: TapRecord | null,
  current: TapRecord,
  pointerKind: PointerKind,
): boolean {
  if (!previous) return false
  const windowMs = pointerKind === 'mouse' ? MOUSE_DOUBLE_CLICK_MS : TOUCH_DOUBLE_TAP_MS
  const slop = pointerKind === 'mouse' ? MOUSE_DOUBLE_CLICK_SLOP_PX : TOUCH_DOUBLE_TAP_SLOP_PX
  if (current.time - previous.time >= windowMs) return false
  return Math.hypot(current.x - previous.x, current.y - previous.y) < slop
}

export interface AnchoredZoomInput {
  scrollLeft: number
  scrollTop: number
  viewportWidth: number
  viewportHeight: number
  /** Anchor point, in client coordinates (typically the pinch midpoint). */
  anchorX: number
  anchorY: number
  /** Scroll viewport rect, in client coordinates. */
  viewportLeft: number
  viewportTop: number
  /** Multiplicative zoom change: `nextZoom / previouslyAppliedZoom`. */
  scaleRatio: number
}

export interface ScrollOffsets {
  scrollLeft: number
  scrollTop: number
}

/**
 * Scroll offsets that keep the content under `anchor` in place while the view
 * scales by `scaleRatio`.
 *
 * The page surface is a single scaled element, so its content coordinates scale
 * by `k`. The viewport centre is scaled first (which is exact for any k), then
 * the anchor's offset from that centre is corrected by `k - 1`. This stays
 * correct even though pdf.js only applies the new canvas size a frame later.
 */
export function computeAnchoredScroll(input: AnchoredZoomInput): ScrollOffsets {
  const { scrollLeft, scrollTop, viewportWidth, viewportHeight, scaleRatio: k } = input
  if (!Number.isFinite(k) || k <= 0 || k === 1) {
    return { scrollLeft, scrollTop }
  }
  const dx = input.anchorX - (input.viewportLeft + viewportWidth / 2)
  const dy = input.anchorY - (input.viewportTop + viewportHeight / 2)
  return {
    scrollLeft: (scrollLeft + viewportWidth / 2) * k - viewportWidth / 2 + dx * (k - 1),
    scrollTop: (scrollTop + viewportHeight / 2) * k - viewportHeight / 2 + dy * (k - 1),
  }
}

/** Distance between the first two touches of a pinch gesture. */
export function pinchDistance(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }): number {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
}

/** Midpoint between the first two touches of a pinch gesture. */
export function pinchMidpoint(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
}

/**
 * Zoom level implied by a pinch, clamped to the editor's limits.
 * `startZoom` is the zoom when the gesture began, so the result never drifts.
 */
export function pinchZoom(startZoom: number, startDist: number, dist: number, min: number, max: number): number {
  if (!(startDist > 0) || !Number.isFinite(dist)) return startZoom
  const next = startZoom * (dist / startDist)
  const clamped = Math.max(min, Math.min(max, next))
  return Math.round(clamped * 100) / 100
}

/** Grab radius (in page units) for hit-testing, scaled for the input device. */
export function hitSlop(pageUnits: number, touchUI: boolean): number {
  return Math.max(touchUI ? 16 : 6, pageUnits)
}
