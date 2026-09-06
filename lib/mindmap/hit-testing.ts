// ============================================================================
// Mindmap — connection/edge hit testing
// ============================================================================

import type { Point } from './types'
import { distanceToSegment, getEdgePolyline } from './geometry'

export type NodeHitArea = 'body' | 'collapse'

export interface NodeHit {
  nodeId: string
  area: NodeHitArea
}

export interface EdgeHit {
  edgeId: string
}

export function hitTestConnectionEdge(
  point: Point,
  from: Point,
  to: Point,
  tolerance: number,
  curved = false
): boolean {
  const polyline = getEdgePolyline(from, to, curved)
  // Also check against the wider glow/tap area for better hit detection
  const extendedTolerance = Math.max(tolerance, 8)
  for (let i = 1; i < polyline.length; i += 1) {
    const distance = distanceToSegment(point, polyline[i - 1], polyline[i])
    if (distance <= extendedTolerance) return true
  }
  return false
}
