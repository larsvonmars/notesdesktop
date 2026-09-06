// ============================================================================
// Mindmap — shared domain types
// ============================================================================

export interface MindmapNode {
  id: string
  text: string
  x: number
  y: number
  parentId: string | null
  children: string[]
  collapsed: boolean
  color: string
  description: string
  attachments: MindmapAttachment[]
}

export interface MindmapData {
  nodes: { [key: string]: MindmapNode }
  rootId: string
  customEdges?: MindmapEdge[]
  parentEdgeMeta?: Record<string, MindmapEdgeMeta>
}

export type MindmapLineType = 'solid' | 'dashed' | 'dotted'
export type MindmapArrowType = 'none' | 'standard' | 'filled'

export interface MindmapEdgeStyle {
  color?: string
  width?: number
  lineType?: MindmapLineType
  opacity?: number
  arrowType?: MindmapArrowType
}

export interface MindmapEdgeMeta {
  title?: string
  style?: MindmapEdgeStyle
}

export interface MindmapEdge extends MindmapEdgeMeta {
  id: string
  fromNodeId: string
  toNodeId: string
}

export interface MindmapAttachment {
  id: string
  label: string
  url: string
  type: 'image' | 'link'
}

export interface Point {
  x: number
  y: number
}

export interface MindmapTextNote {
  id: string
  title: string
  content: string
}

export interface NodeDetailDraft {
  text: string
  description: string
  attachments: MindmapAttachment[]
  color: string
}

export interface AttachmentInput {
  label: string
  url: string
  type: 'image' | 'link'
}

export interface NodeMetrics {
  width: number
  height: number
  rect: {
    left: number
    right: number
    top: number
    bottom: number
  }
  collapseBounds: {
    left: number
    right: number
    top: number
    bottom: number
  } | null
}

export interface LayoutSnapshotNode {
  id: string
  x: number
  y: number
  color: string
  visibility: number
  isRoot: boolean
  isSelected: boolean
}

export interface LayoutSnapshotEdge {
  from: { x: number; y: number }
  to: { x: number; y: number }
  visibility: number
}

export interface LayoutBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface LayoutSnapshot {
  nodes: LayoutSnapshotNode[]
  edges: LayoutSnapshotEdge[]
  bounds: LayoutBounds
}

export interface MindmapEditorHandle {
  getData: () => MindmapData
  setData: (data: MindmapData) => void
  clear: () => void
  getSelectedNodeId: () => string | null
  fitToView: () => void
  resetView: () => void
  openSearch: () => void
  toggleMinimap: () => void
  exportImage: () => void
}

export interface MindmapEditorProps {
  initialData?: MindmapData
  onChange?: (data: MindmapData) => void
  onSelectedNodeChange?: (nodeId: string | null, node: MindmapNode | null) => void
  textNotes?: MindmapTextNote[]
  onCreateTextNote?: (input: { title: string; description: string }) => Promise<MindmapTextNote>
  onOpenTextNote?: (noteId: string) => void
  readOnly?: boolean
  allowViewerControls?: boolean
  allowViewerSearch?: boolean
  defaultShowMinimap?: boolean
}
