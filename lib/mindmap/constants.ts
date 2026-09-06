// ============================================================================
// Mindmap — rendering & behaviour constants
// ============================================================================

import type { MindmapEdgeStyle } from './types'

export const DEFAULT_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
]

export const NODE_PADDING = 16
export const NODE_HEIGHT = 44
export const MIN_NODE_WIDTH = 120
export const COLLAPSE_INDICATOR_SIZE = 36
export const COLLAPSE_ANIMATION_DURATION = 260
export const NOTE_ATTACHMENT_PREFIX = 'note://'

export const EDGE_DEFAULTS: Required<MindmapEdgeStyle> = {
  color: '',
  width: 2,
  lineType: 'solid',
  opacity: 1,
  arrowType: 'none',
}
