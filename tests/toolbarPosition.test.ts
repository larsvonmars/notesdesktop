import { describe, it, expect } from 'vitest'
import {
  computeToolbarPosition,
  type RectLike,
} from '../lib/editor/toolbarPosition'

const rect = (top: number, left: number, width: number, height = 20): RectLike => ({
  top,
  left,
  right: left + width,
  bottom: top + height,
  width,
  height,
})

const VIEWPORT = { width: 1000, height: 800 }
const SIZE = { width: 200, height: 40 }
const MARGIN = 16
const GAP = 10

describe('computeToolbarPosition', () => {
  it('places the toolbar above the first line of a single-line selection', () => {
    const position = computeToolbarPosition({
      lineRects: [rect(300, 400, 100)],
      size: SIZE,
      viewport: VIEWPORT,
      margin: MARGIN,
      gap: GAP,
    })

    expect(position).toEqual({
      top: 300 - GAP - 40, // above the line
      left: 450 - 100, // centred on the line
      placement: 'above',
    })
  })

  it('uses the topmost line for the vertical anchor of a multi-line selection', () => {
    const position = computeToolbarPosition({
      lineRects: [rect(100, 200, 300), rect(120, 200, 300), rect(140, 200, 120)],
      size: SIZE,
      viewport: VIEWPORT,
      margin: MARGIN,
      gap: GAP,
    })

    expect(position?.placement).toBe('above')
    expect(position?.top).toBe(100 - GAP - 40)
    expect(position?.left).toBe(350 - 100)
  })

  it('flips below the last line when there is no room above', () => {
    const position = computeToolbarPosition({
      lineRects: [rect(4, 100, 80), rect(24, 100, 80)],
      size: SIZE,
      viewport: VIEWPORT,
      margin: MARGIN,
      gap: GAP,
    })

    expect(position?.placement).toBe('below')
    expect(position?.top).toBe(44 + GAP) // last line bottom + gap
    expect(position?.left).toBe(140 - 100)
  })

  it('clamps to the left edge and keeps the margin', () => {
    const position = computeToolbarPosition({
      lineRects: [rect(300, 0, 40)],
      size: SIZE,
      viewport: VIEWPORT,
      margin: MARGIN,
      gap: GAP,
    })

    expect(position?.left).toBe(MARGIN)
  })

  it('clamps to the right edge and keeps the margin', () => {
    const position = computeToolbarPosition({
      lineRects: [rect(300, 950, 40)],
      size: SIZE,
      viewport: VIEWPORT,
      margin: MARGIN,
      gap: GAP,
    })

    expect(position?.left).toBe(VIEWPORT.width - MARGIN - SIZE.width)
  })

  it('never exceeds the viewport when the toolbar is wider than the screen', () => {
    const position = computeToolbarPosition({
      lineRects: [rect(300, 100, 120)],
      size: { width: 2000, height: 40 },
      viewport: VIEWPORT,
      margin: MARGIN,
      gap: GAP,
    })

    expect(position?.left).toBe(MARGIN)
  })

  it('picks the side with more room when neither side fully fits', () => {
    const above = computeToolbarPosition({
      lineRects: [rect(140, 100, 80)],
      size: SIZE,
      viewport: { width: 1000, height: 200 },
      margin: MARGIN,
      gap: GAP,
    })
    // room above = 140 - 10 - 16 = 114, room below = 200 - (160 + 10) - 16 = 14
    expect(above?.placement).toBe('above')

    const below = computeToolbarPosition({
      lineRects: [rect(40, 100, 80)],
      size: SIZE,
      viewport: { width: 1000, height: 200 },
      margin: MARGIN,
      gap: GAP,
    })
    // room above = 40 - 10 - 16 = 14, room below = 200 - (60 + 10) - 16 = 114
    expect(below?.placement).toBe('below')
  })

  it('ignores empty (0×0) rects and anchors on lines that have width', () => {
    const position = computeToolbarPosition({
      lineRects: [
        rect(100, 400, 0), // zero-width wrapper rect reported for line breaks
        rect(120, 500, 100),
      ],
      size: SIZE,
      viewport: VIEWPORT,
      margin: MARGIN,
      gap: GAP,
    })

    // Vertical anchor is the topmost line, horizontal the first one with width.
    expect(position?.top).toBe(100 - GAP - 40)
    expect(position?.left).toBe(550 - 100)
  })

  it('returns null when there are no usable rects', () => {
    expect(
      computeToolbarPosition({
        lineRects: [],
        size: SIZE,
        viewport: VIEWPORT,
        margin: MARGIN,
        gap: GAP,
      })
    ).toBeNull()

    expect(
      computeToolbarPosition({
        lineRects: [rect(100, 100, 0, 0)],
        size: SIZE,
        viewport: VIEWPORT,
        margin: MARGIN,
        gap: GAP,
      })
    ).toBeNull()
  })

  it('tolerates NaN geometry instead of producing NaN coordinates', () => {
    const position = computeToolbarPosition({
      lineRects: [
        { top: NaN, left: NaN, right: NaN, bottom: NaN, width: NaN, height: NaN },
        rect(300, 400, 100),
      ],
      size: SIZE,
      viewport: VIEWPORT,
      margin: MARGIN,
      gap: GAP,
    })

    expect(position).not.toBeNull()
    expect(Number.isFinite(position!.top)).toBe(true)
    expect(Number.isFinite(position!.left)).toBe(true)
  })
})
