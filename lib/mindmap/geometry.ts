// ============================================================================
// Mindmap — pure geometry helpers
// ============================================================================

import type { NodeMetrics, Point } from './types'

export function getCubicControlPoints(from: Point, to: Point): [Point, Point] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.max(1, Math.hypot(dx, dy))
  const nx = -dy / length
  const ny = dx / length
  const bend = Math.min(70, length * 0.18)
  const tension = 0.4
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  return [
    { x: from.x + dx * tension + nx * bend, y: from.y + dy * tension + ny * bend },
    { x: to.x - dx * tension + nx * bend, y: to.y - dy * tension + ny * bend },
  ]
}

export function getEdgePolyline(from: Point, to: Point, curved: boolean): Point[] {
  if (!curved) return [from, to]

  const [cp1, cp2] = getCubicControlPoints(from, to)
  const points: Point[] = []
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.max(1, Math.hypot(dx, dy))
  const segments = Math.max(16, Math.min(48, Math.round(length / 12)))
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const inv = 1 - t
    const inv2 = inv * inv
    const t2 = t * t
    points.push({
      x: inv2 * inv * from.x + 3 * inv2 * t * cp1.x + 3 * inv * t2 * cp2.x + t2 * t * to.x,
      y: inv2 * inv * from.y + 3 * inv2 * t * cp1.y + 3 * inv * t2 * cp2.y + t2 * t * to.y,
    })
  }
  return points
}

/**
 * Computes the point on a node's rounded-rect boundary that lies along
 * the ray from the node center toward a target point.
 */
export function getNodeConnectionPoint(
  nodeCenter: Point,
  nodeMetrics: NodeMetrics,
  targetDirection: Point
): Point {
  const { rect } = nodeMetrics
  const dx = targetDirection.x - nodeCenter.x
  const dy = targetDirection.y - nodeCenter.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.001) return { x: nodeCenter.x, y: nodeCenter.y }

  const nx = dx / dist
  const ny = dy / dist
  const cornerRadius = Math.min(nodeMetrics.height / 2, 20)

  // Check intersection with each side of the rounded rect
  const halfW = (rect.right - rect.left) / 2
  const halfH = (rect.bottom - rect.top) / 2

  // Right edge
  if (nx > 0) {
    const t = (halfW - cornerRadius) / Math.max(nx, 0.001)
    const y = nodeCenter.y + ny * t
    if (y >= rect.top + cornerRadius && y <= rect.bottom - cornerRadius) {
      return { x: rect.right, y }
    }
  }
  // Left edge
  if (nx < 0) {
    const t = -(halfW - cornerRadius) / Math.min(nx, -0.001)
    const y = nodeCenter.y + ny * t
    if (y >= rect.top + cornerRadius && y <= rect.bottom - cornerRadius) {
      return { x: rect.left, y }
    }
  }
  // Bottom edge
  if (ny > 0) {
    const t = (halfH - cornerRadius) / Math.max(ny, 0.001)
    const x = nodeCenter.x + nx * t
    if (x >= rect.left + cornerRadius && x <= rect.right - cornerRadius) {
      return { x, y: rect.bottom }
    }
  }
  // Top edge
  if (ny < 0) {
    const t = -(halfH - cornerRadius) / Math.min(ny, -0.001)
    const x = nodeCenter.x + nx * t
    if (x >= rect.left + cornerRadius && x <= rect.right - cornerRadius) {
      return { x, y: rect.top }
    }
  }

  // Corner case: ray hits a corner
  const cornerX = nx > 0 ? rect.right - cornerRadius : rect.left + cornerRadius
  const cornerY = ny > 0 ? rect.bottom - cornerRadius : rect.top + cornerRadius
  const cx = cornerX + cornerRadius * nx
  const cy = cornerY + cornerRadius * ny
  return { x: cx, y: cy }
}

export function getPolylineMidpoint(polyline: Point[]): Point {
  if (polyline.length === 0) return { x: 0, y: 0 }
  if (polyline.length === 1) return polyline[0]

  let totalLength = 0
  for (let i = 1; i < polyline.length; i += 1) {
    totalLength += Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].y - polyline[i - 1].y)
  }

  if (totalLength === 0) {
    return {
      x: (polyline[0].x + polyline[polyline.length - 1].x) / 2,
      y: (polyline[0].y + polyline[polyline.length - 1].y) / 2,
    }
  }

  const target = totalLength / 2
  let traversed = 0

  for (let i = 1; i < polyline.length; i += 1) {
    const start = polyline[i - 1]
    const end = polyline[i]
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y)

    if (traversed + segmentLength >= target) {
      const remain = target - traversed
      const t = segmentLength === 0 ? 0 : remain / segmentLength
      return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      }
    }

    traversed += segmentLength
  }

  return polyline[polyline.length - 1]
}

export function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y)
  }
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)))
  const projX = from.x + t * dx
  const projY = from.y + t * dy
  return Math.hypot(point.x - projX, point.y - projY)
}
