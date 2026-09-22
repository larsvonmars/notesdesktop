import { describe, it, expect } from 'vitest'
import {
  PALM_CONTACT_SIZE_PX,
  computeAnchoredScroll,
  hitSlop,
  isDoubleTap,
  isPalmTouch,
  normalizePressure,
  pinchDistance,
  pinchMidpoint,
  pinchZoom,
  toPointerKind,
  type TapRecord,
} from '../lib/editor/pdf-touch'

describe('pdf-touch / toPointerKind', () => {
  it('maps the three pointer kinds', () => {
    expect(toPointerKind('pen')).toBe('pen')
    expect(toPointerKind('touch')).toBe('touch')
    expect(toPointerKind('mouse')).toBe('mouse')
  })

  it('falls back to mouse for unknown or missing values', () => {
    expect(toPointerKind(undefined)).toBe('mouse')
    expect(toPointerKind('')).toBe('mouse')
    expect(toPointerKind('eraser')).toBe('mouse')
  })
})

describe('pdf-touch / normalizePressure', () => {
  it('keeps real stylus pressure', () => {
    expect(normalizePressure('pen', 0.83)).toBeCloseTo(0.83)
  })

  it('clamps stylus pressure to 1', () => {
    expect(normalizePressure('pen', 1.4)).toBe(1)
  })

  it('replaces zero / missing pressure with the neutral value', () => {
    // A zero-pressure point renders as an invisible dot in perfect-freehand
    expect(normalizePressure('pen', 0)).toBe(0.5)
    expect(normalizePressure('pen', undefined)).toBe(0.5)
  })

  it('never lets touchscreens contribute pressure', () => {
    expect(normalizePressure('touch', 0)).toBe(0.5)
    expect(normalizePressure('touch', 1)).toBe(0.5)
    expect(normalizePressure('mouse', 0.5)).toBe(0.5)
  })
})

describe('pdf-touch / isPalmTouch', () => {
  const base = { pointerType: 'touch', width: 10, height: 10, activePointerKind: null } as const

  it('accepts a normal fingertip', () => {
    expect(isPalmTouch({ ...base, pointerType: 'touch' })).toBe(false)
  })

  it('rejects an oversized contact patch', () => {
    expect(isPalmTouch({ ...base, pointerType: 'touch', width: PALM_CONTACT_SIZE_PX + 1 })).toBe(true)
    expect(isPalmTouch({ ...base, pointerType: 'touch', height: PALM_CONTACT_SIZE_PX + 1 })).toBe(true)
  })

  it('rejects any finger while a stylus is down', () => {
    expect(
      isPalmTouch({
        pointerType: 'touch',
        width: 8,
        height: 8,
        activePointerKind: 'pen',
      }),
    ).toBe(true)
  })

  it('never rejects a stylus or mouse', () => {
    expect(isPalmTouch({ ...base, pointerType: 'pen', width: 40, height: 40 })).toBe(false)
    expect(isPalmTouch({ ...base, pointerType: 'mouse', width: 40, height: 40 })).toBe(false)
  })
})

describe('pdf-touch / isDoubleTap', () => {
  const first: TapRecord = { time: 1_000, x: 100, y: 100 }

  it('detects a quick, close second tap', () => {
    expect(isDoubleTap(first, { time: 1_150, x: 106, y: 104 }, 'touch')).toBe(true)
  })

  it('rejects a slow second tap', () => {
    expect(isDoubleTap(first, { time: 1_400, x: 100, y: 100 }, 'touch')).toBe(false)
  })

  it('rejects a second tap that moved too far', () => {
    expect(isDoubleTap(first, { time: 1_150, x: 160, y: 100 }, 'touch')).toBe(false)
  })

  it('is far more tolerant for fingers than for a mouse', () => {
    const second: TapRecord = { time: 1_250, x: 120, y: 100 }
    expect(isDoubleTap(first, second, 'touch')).toBe(true)
    expect(isDoubleTap(first, second, 'mouse')).toBe(false)
  })

  it('returns false without a previous tap', () => {
    expect(isDoubleTap(null, first, 'touch')).toBe(false)
  })
})

describe('pdf-touch / pinch helpers', () => {
  it('measures distance and midpoint', () => {
    const a = { clientX: 0, clientY: 0 }
    const b = { clientX: 30, clientY: 40 }
    expect(pinchDistance(a, b)).toBe(50)
    expect(pinchMidpoint(a, b)).toEqual({ x: 15, y: 20 })
  })

  it('scales the starting zoom by the pinch ratio', () => {
    expect(pinchZoom(1, 100, 200, 0.25, 4)).toBe(2)
    expect(pinchZoom(2, 200, 100, 0.25, 4)).toBe(1)
  })

  it('clamps to the zoom limits', () => {
    expect(pinchZoom(1, 100, 10_000, 0.25, 4)).toBe(4)
    expect(pinchZoom(1, 100, 1, 0.25, 4)).toBe(0.25)
  })

  it('is stable when the starting distance is degenerate', () => {
    expect(pinchZoom(1.5, 0, 100, 0.25, 4)).toBe(1.5)
    expect(pinchZoom(1.5, 100, Number.NaN, 0.25, 4)).toBe(1.5)
  })
})

describe('pdf-touch / computeAnchoredScroll', () => {
  const viewport = {
    scrollLeft: 0,
    scrollTop: 0,
    viewportWidth: 800,
    viewportHeight: 600,
    viewportLeft: 0,
    viewportTop: 0,
  }

  it('is a no-op when the scale does not change', () => {
    expect(computeAnchoredScroll({ ...viewport, anchorX: 400, anchorY: 300, scaleRatio: 1 }))
      .toEqual({ scrollLeft: 0, scrollTop: 0 })
  })

  it('ignores invalid ratios', () => {
    expect(computeAnchoredScroll({ ...viewport, anchorX: 400, anchorY: 300, scaleRatio: 0 }).scrollLeft).toBe(0)
    expect(computeAnchoredScroll({ ...viewport, anchorX: 400, anchorY: 300, scaleRatio: Number.NaN }).scrollTop).toBe(0)
  })

  it('keeps the anchor at the viewport centre stationary', () => {
    // Zooming about the exact centre needs no scroll adjustment
    const result = computeAnchoredScroll({
      ...viewport,
      anchorX: 400,
      anchorY: 300,
      scaleRatio: 2,
    })
    expect(result.scrollLeft).toBeCloseTo(400)
    expect(result.scrollTop).toBeCloseTo(300)
  })

  it('scrolls towards content right of the centre when zooming in', () => {
    const centre = computeAnchoredScroll({
      ...viewport,
      anchorX: 400,
      anchorY: 300,
      scaleRatio: 2,
    })
    const right = computeAnchoredScroll({
      ...viewport,
      anchorX: 700,
      anchorY: 300,
      scaleRatio: 2,
    })
    // The anchor sits further right, so we must scroll further right too
    expect(right.scrollLeft).toBeGreaterThan(centre.scrollLeft)
  })

  it('scales existing scroll offsets by the ratio', () => {
    const result = computeAnchoredScroll({
      scrollLeft: 200,
      scrollTop: 100,
      viewportWidth: 800,
      viewportHeight: 600,
      viewportLeft: 0,
      viewportTop: 0,
      anchorX: 400,
      anchorY: 300,
      scaleRatio: 2,
    })
    // scrollTop 100, viewport 600 → the content under the centre (client 300)
    // is at content-y 400; doubling the scale puts it at 800, so the offset
    // must become 800 - 300 = 500.
    expect(result.scrollLeft).toBeCloseTo(800)
    expect(result.scrollTop).toBeCloseTo(500)
  })

  it('accounts for a viewport that does not start at the origin', () => {
    const result = computeAnchoredScroll({
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 800,
      viewportHeight: 600,
      viewportLeft: 100,
      viewportTop: 50,
      anchorX: 500,
      anchorY: 350,
      scaleRatio: 2,
    })
    // Anchor is dead centre of the viewport → only the centre scaling applies
    expect(result.scrollLeft).toBeCloseTo(400)
    expect(result.scrollTop).toBeCloseTo(300)
  })
})

describe('pdf-touch / hitSlop', () => {
  it('never shrinks the stroke width', () => {
    expect(hitSlop(20, false)).toBe(20)
    expect(hitSlop(20, true)).toBe(20)
  })

  it('gives fingers a much larger minimum target', () => {
    expect(hitSlop(3, false)).toBe(6)
    expect(hitSlop(3, true)).toBe(16)
  })
})
