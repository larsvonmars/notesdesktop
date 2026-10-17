import { getStroke } from 'perfect-freehand'

export const HIGHLIGHTER_OPACITY = 0.35

export interface StrokePoint {
  x: number
  y: number
  pressure?: number
}

export interface StrokeSource {
  color: string
  size: number
  tool: 'pen' | 'highlighter'
  points: StrokePoint[]
}

export function getSvgPathFromStroke(stroke: number[][]): string {
  if (stroke.length === 0) return ''
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      if (i === 0) return `M ${x0} ${y0}`
      const [x1, y1] = arr[(i + 1) % arr.length]
      return `${acc} Q ${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`
    },
    ''
  )
  return `${d} Z`
}

export function renderStrokeToCtx(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeSource,
  scale: number
) {
  const options = stroke.tool === 'highlighter'
    ? { size: stroke.size * scale, thinning: 0.1, smoothing: 0.5, streamline: 0.5, simulatePressure: false }
    : { size: stroke.size * scale, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: true }

  const scaledPoints = stroke.points.map(p => [p.x * scale, p.y * scale, p.pressure ?? 0.5])
  const outline = getStroke(scaledPoints, options)
  const path = getSvgPathFromStroke(outline)
  const path2D = new Path2D(path)

  ctx.save()
  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_OPACITY
    ctx.globalCompositeOperation = 'multiply'
  }
  ctx.fillStyle = stroke.color
  ctx.fill(path2D)
  ctx.restore()
}
