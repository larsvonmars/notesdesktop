// ============================================================================
// Mindmap — canvas rendering utilities (pure, ctx-based)
// ============================================================================

import type {
  LayoutSnapshot,
  MindmapData,
  MindmapEdgeMeta,
  MindmapNode,
  NodeMetrics,
  Point,
} from './types'
import {
  COLLAPSE_INDICATOR_SIZE,
  EDGE_DEFAULTS,
  MIN_NODE_WIDTH,
  NODE_HEIGHT,
  NODE_PADDING,
} from './constants'
import { getEdgePolyline, getPolylineMidpoint } from './geometry'

export interface RenderContext {
  ctx: CanvasRenderingContext2D
  mindmapData: MindmapData
  selectedNodeId: string | null
  now: number
  resolveVisibility: (nodeId: string, now: number) => { value: number; animating: boolean }
}

/**
 * Computes the metrics (dimensions, bounding rect, collapse button bounds) for a node
 */
export function computeNodeMetrics(
  ctx: CanvasRenderingContext2D,
  node: MindmapNode,
  isRoot: boolean
): NodeMetrics {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.font = isRoot ? 'bold 16px sans-serif' : '14px sans-serif'
  const label = node.text || ''
  const textWidth = ctx.measureText(label).width
  ctx.restore()

  const width = Math.max(textWidth + NODE_PADDING * 2, MIN_NODE_WIDTH)
  const height = NODE_HEIGHT
  const halfWidth = width / 2
  const halfHeight = height / 2

  const rect = {
    left: node.x - halfWidth,
    right: node.x + halfWidth,
    top: node.y - halfHeight,
    bottom: node.y + halfHeight,
  }

  // Position the collapse indicator centred on the right edge of the node
  // so it protrudes outward and never overlaps the node text.
  const halfIndicator = COLLAPSE_INDICATOR_SIZE / 2
  const nodeCenterY = node.y
  const collapseBounds = node.children.length > 0
    ? {
        left: rect.right - halfIndicator,
        right: rect.right + halfIndicator,
        top: nodeCenterY - halfIndicator,
        bottom: nodeCenterY + halfIndicator,
      }
    : null

  return { width, height, rect, collapseBounds }
}

/**
 * Draws an edge (connection line) between nodes with rich visual styling:
 * - Cubic Bézier curves with tension
 * - Gradient coloring (parent → child node color)
 * - Glow/shadow layer for depth
 * - Tapered width (thicker at parent, thinner at child)
 * - Animated dash offset (flowing lines)
 * - Enhanced selection highlight with pulse
 * - Proportionally scaled arrowheads
 * - Rounded line caps and joins
 */
export function drawEdge(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  visibility: number,
  edgeColor: string,
  meta?: MindmapEdgeMeta,
  isSelected?: boolean,
  curved?: boolean,
  fromColor?: string,
  toColor?: string,
  now?: number
): void {
  const width = Math.max(1.5, meta?.style?.width ?? EDGE_DEFAULTS.width)
  const lineType = meta?.style?.lineType ?? EDGE_DEFAULTS.lineType
  const opacity = Math.max(0.15, Math.min(1, meta?.style?.opacity ?? EDGE_DEFAULTS.opacity))
  const userColor = meta?.style?.color?.trim()
  const arrowType = meta?.style?.arrowType ?? EDGE_DEFAULTS.arrowType
  const effectiveVisibility = Math.max(0.08, visibility * opacity)
  const effectiveWidth = Math.max(1, width * visibility)

  const polyline = getEdgePolyline(from, to, curved ?? false)
  if (polyline.length < 2) return

  // Determine gradient colors
  const startColor = fromColor || userColor || edgeColor
  const endColor = toColor || userColor || edgeColor
  const hasGradient = !!(fromColor || toColor || userColor)

  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // ── Build gradient along the polyline ──
  let strokeStyle: string | CanvasGradient = startColor
  if (hasGradient && startColor !== endColor) {
    const first = polyline[0]
    const last = polyline[polyline.length - 1]
    const gradient = ctx.createLinearGradient(first.x, first.y, last.x, last.y)
    gradient.addColorStop(0, startColor)
    gradient.addColorStop(1, endColor)
    strokeStyle = gradient
  }

  // ── Dash pattern ──
  const dashPattern = lineType === 'dashed' ? [10, 7] : lineType === 'dotted' ? [3, 8] : []

  // ── Layer 1: Glow / ambient shadow ──
  if (effectiveVisibility > 0.3) {
    ctx.globalAlpha = effectiveVisibility * 0.18
    ctx.lineWidth = effectiveWidth + 5
    ctx.strokeStyle = startColor
    ctx.shadowColor = startColor
    ctx.shadowBlur = Math.min(12, effectiveWidth * 3)
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(polyline[0].x, polyline[0].y)
    for (let i = 1; i < polyline.length; i += 1) {
      ctx.lineTo(polyline[i].x, polyline[i].y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  // ── Layer 2: Tapered middle layer (slightly wider, more transparent) ──
  if (effectiveWidth >= 2) {
    ctx.globalAlpha = effectiveVisibility * 0.35
    ctx.lineWidth = effectiveWidth + 2
    ctx.strokeStyle = strokeStyle
    ctx.setLineDash(dashPattern)
    if (dashPattern.length > 0 && now !== undefined) {
      ctx.lineDashOffset = -((now * 0.03) % 100)
    }
    ctx.beginPath()
    ctx.moveTo(polyline[0].x, polyline[0].y)
    const midIdx = Math.floor(polyline.length * 0.6)
    for (let i = 1; i <= midIdx; i += 1) {
      ctx.lineTo(polyline[i].x, polyline[i].y)
    }
    ctx.stroke()
  }

  // ── Layer 3: Main edge stroke ──
  ctx.globalAlpha = effectiveVisibility
  ctx.lineWidth = effectiveWidth
  ctx.strokeStyle = strokeStyle
  ctx.setLineDash(dashPattern)
  if (dashPattern.length > 0 && now !== undefined) {
    ctx.lineDashOffset = -((now * 0.03) % 100)
  }
  ctx.beginPath()
  ctx.moveTo(polyline[0].x, polyline[0].y)
  for (let i = 1; i < polyline.length; i += 1) {
    ctx.lineTo(polyline[i].x, polyline[i].y)
  }
  ctx.stroke()

  // ── Layer 4: Inner highlight stripe (thin bright line in center) ──
  if (effectiveWidth >= 3 && effectiveVisibility > 0.5) {
    ctx.globalAlpha = effectiveVisibility * 0.25
    ctx.lineWidth = Math.max(1, effectiveWidth * 0.35)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(polyline[0].x, polyline[0].y)
    for (let i = 1; i < polyline.length; i += 1) {
      ctx.lineTo(polyline[i].x, polyline[i].y)
    }
    ctx.stroke()
  }

  // ── Arrowhead ──
  if (arrowType !== 'none' && polyline.length >= 2) {
    const last = polyline[polyline.length - 1]
    const prev = polyline[Math.max(0, polyline.length - 2)]
    const dx = last.x - prev.x
    const dy = last.y - prev.y
    const len = Math.max(1, Math.hypot(dx, dy))
    const ux = dx / len
    const uy = dy / len
    const arrowSize = Math.max(8, effectiveWidth * 2.2 + 6)
    const arrowLength = arrowSize
    const arrowHalfWidth = arrowSize * 0.45
    const baseX = last.x - ux * arrowLength
    const baseY = last.y - uy * arrowLength
    const leftX = baseX - uy * arrowHalfWidth
    const leftY = baseY + ux * arrowHalfWidth
    const rightX = baseX + uy * arrowHalfWidth
    const rightY = baseY - ux * arrowHalfWidth

    ctx.globalAlpha = effectiveVisibility
    ctx.lineWidth = Math.max(1.5, effectiveWidth * 0.8)
    ctx.setLineDash([])
    ctx.shadowBlur = 0
    ctx.lineJoin = 'round'

    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(leftX, leftY)
    ctx.lineTo(rightX, rightY)
    ctx.closePath()
    if (arrowType === 'filled') {
      ctx.fillStyle = endColor
      ctx.fill()
    } else {
      ctx.strokeStyle = endColor
      ctx.stroke()
    }
  }

  // ── Selection highlight with pulsing glow ──
  if (isSelected) {
    ctx.globalAlpha = 0.9
    ctx.setLineDash([])
    ctx.shadowBlur = 0
    const pulse = now !== undefined ? 1 + Math.sin(now * 0.005) * 0.15 : 1
    const glowWidth = (effectiveWidth + 5) * pulse

    // Outer glow ring
    ctx.globalAlpha = 0.35
    ctx.lineWidth = glowWidth + 4
    ctx.strokeStyle = '#0ea5e9'
    ctx.beginPath()
    ctx.moveTo(polyline[0].x, polyline[0].y)
    for (let i = 1; i < polyline.length; i += 1) {
      ctx.lineTo(polyline[i].x, polyline[i].y)
    }
    ctx.stroke()

    // Main selection line
    ctx.globalAlpha = 0.85
    ctx.lineWidth = glowWidth
    ctx.strokeStyle = '#38bdf8'
    ctx.beginPath()
    ctx.moveTo(polyline[0].x, polyline[0].y)
    for (let i = 1; i < polyline.length; i += 1) {
      ctx.lineTo(polyline[i].x, polyline[i].y)
    }
    ctx.stroke()

    // Bright inner core
    ctx.globalAlpha = 0.7
    ctx.lineWidth = Math.max(1.5, glowWidth * 0.4)
    ctx.strokeStyle = '#e0f2fe'
    ctx.beginPath()
    ctx.moveTo(polyline[0].x, polyline[0].y)
    for (let i = 1; i < polyline.length; i += 1) {
      ctx.lineTo(polyline[i].x, polyline[i].y)
    }
    ctx.stroke()

    ctx.shadowBlur = 0
  }

  ctx.setLineDash([])
  ctx.restore()
}

export function drawEdgeTitle(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  title: string,
  isDark: boolean,
  visibility: number,
  curved = false
): void {
  const trimmed = title.trim()
  if (!trimmed) return

  const polyline = getEdgePolyline(from, to, curved)
  const midpoint = getPolylineMidpoint(polyline)
  const midX = midpoint.x
  const midY = midpoint.y

  ctx.save()
  ctx.globalAlpha = Math.max(0.75, Math.min(1, visibility))
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const textWidth = ctx.measureText(trimmed).width
  const width = textWidth + 14
  const height = 22
  const x = midX - width / 2
  const y = midY - height / 2

  ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.95)'
  ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, 10)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = isDark ? '#e2e8f0' : '#0f172a'
  ctx.fillText(trimmed, midX, midY)
  ctx.restore()
}

/**
 * Draws the collapse/expand indicator button on a node
 */
export function drawCollapseIndicator(
  ctx: CanvasRenderingContext2D,
  collapseBounds: NonNullable<NodeMetrics['collapseBounds']>,
  nodeColor: string,
  isCollapsed: boolean,
  isSelected: boolean,
  indicatorBg: string,
  indicatorBgHover: string
): void {
  const centerX = (collapseBounds.left + collapseBounds.right) / 2
  const centerY = (collapseBounds.top + collapseBounds.bottom) / 2
  const indicatorRadius = COLLAPSE_INDICATOR_SIZE / 2

  // Background circle
  ctx.fillStyle = isSelected ? indicatorBg : indicatorBgHover
  ctx.beginPath()
  ctx.arc(centerX, centerY, indicatorRadius, 0, Math.PI * 2)
  ctx.fill()

  // Border
  ctx.strokeStyle = nodeColor
  ctx.lineWidth = 2
  ctx.stroke()

  // Plus/Minus icon
  ctx.beginPath()
  ctx.moveTo(centerX - indicatorRadius + 5, centerY)
  ctx.lineTo(centerX + indicatorRadius - 5, centerY)
  if (isCollapsed) {
    ctx.moveTo(centerX, centerY - indicatorRadius + 5)
    ctx.lineTo(centerX, centerY + indicatorRadius - 5)
  }
  ctx.stroke()
}

/**
 * Draws a single node (rounded rectangle with text)
 */
export function drawNodeBody(
  ctx: CanvasRenderingContext2D,
  node: MindmapNode,
  metrics: NodeMetrics,
  isRoot: boolean,
  isSelected: boolean,
  visibility: number,
  renderX: number,
  renderY: number,
  selectedBorderColor: string,
  indicatorBg: string,
  indicatorBgHover: string
): void {
  ctx.save()
  ctx.globalAlpha = Math.max(visibility, 0.1)
  ctx.fillStyle = node.color
  ctx.strokeStyle = isSelected ? selectedBorderColor : node.color
  ctx.lineWidth = isSelected ? 3 : 2

  // Node background
  ctx.beginPath()
  ctx.roundRect(
    metrics.rect.left,
    metrics.rect.top,
    metrics.rect.right - metrics.rect.left,
    metrics.rect.bottom - metrics.rect.top,
    Math.min(metrics.height / 2, 20)
  )
  ctx.fill()
  if (isSelected) ctx.stroke()

  // Node text
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = isRoot ? 'bold 16px sans-serif' : '14px sans-serif'
  ctx.fillText(node.text, renderX, renderY)

  // Collapse indicator
  if (metrics.collapseBounds) {
    drawCollapseIndicator(ctx, metrics.collapseBounds, node.color, node.collapsed, isSelected, indicatorBg, indicatorBgHover)
  }

  ctx.restore()
}

/**
 * Calculates the interpolated render position based on visibility (for animations)
 */
export function calculateRenderPosition(
  node: MindmapNode,
  visibility: number,
  parentPosition?: Point
): Point {
  if (!parentPosition) {
    return { x: node.x, y: node.y }
  }
  return {
    x: parentPosition.x + (node.x - parentPosition.x) * visibility,
    y: parentPosition.y + (node.y - parentPosition.y) * visibility,
  }
}

/**
 * Creates an empty layout snapshot for collecting render data
 */
export function createEmptyLayoutSnapshot(): LayoutSnapshot {
  return {
    nodes: [],
    edges: [],
    bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  }
}

/**
 * Updates the layout snapshot bounds with node metrics
 */
export function updateSnapshotBounds(snapshot: LayoutSnapshot, metrics: NodeMetrics): void {
  snapshot.bounds.minX = Math.min(snapshot.bounds.minX, metrics.rect.left)
  snapshot.bounds.minY = Math.min(snapshot.bounds.minY, metrics.rect.top)
  snapshot.bounds.maxX = Math.max(snapshot.bounds.maxX, metrics.rect.right)
  snapshot.bounds.maxY = Math.max(snapshot.bounds.maxY, metrics.rect.bottom)
}

export function getCanvasTheme(isDark: boolean) {
  return {
    background: isDark ? '#1e293b' : '#f8fafc',
    edgeColor: isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(100, 116, 139, 0.35)',
    edgeGlowBlur: 6,
    edgeGlowAlpha: 0.15,
    edgeGlowWidthBoost: 4,
    minimapBg: isDark ? 'rgba(2, 6, 23, 0.85)' : 'rgba(15, 23, 42, 0.7)',
    minimapEdge: isDark ? 'rgba(148, 163, 184, 0.5)' : 'rgba(148, 163, 184, 0.6)',
    nodeSelectedBorder: isDark ? '#e2e8f0' : '#0f172a',
    nodeTextColor: '#fff',
    collapseIndicatorBg: isDark ? 'rgba(30, 41, 59, 0.98)' : 'rgba(255, 255, 255, 0.98)',
    collapseIndicatorBgHover: isDark ? 'rgba(30, 41, 59, 0.93)' : 'rgba(255, 255, 255, 0.93)',
  }
}

export function getDevicePixelRatio(): number {
  return typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
    ? window.devicePixelRatio
    : 1
}

export function getCanvasContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!canvas) return null
  return canvas.getContext('2d')
}
