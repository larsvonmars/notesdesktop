'use client'

import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo, useReducer } from 'react'
import {
  Plus,
  Minus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Edit2,
  Check,
  X,
  RotateCcw
} from 'lucide-react'

// ============================================================================
// Types & Interfaces
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
}

export interface MindmapAttachment {
  id: string
  label: string
  url: string
  type: 'image' | 'link'
}

interface LayoutSnapshotNode {
  id: string
  x: number
  y: number
  color: string
  visibility: number
  isRoot: boolean
  isSelected: boolean
}

interface LayoutSnapshotEdge {
  from: { x: number; y: number }
  to: { x: number; y: number }
  visibility: number
}

interface LayoutBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface LayoutSnapshot {
  nodes: LayoutSnapshotNode[]
  edges: LayoutSnapshotEdge[]
  bounds: LayoutBounds
}

export interface MindmapEditorHandle {
  getData: () => MindmapData
  setData: (data: MindmapData) => void
  clear: () => void
  getSelectedNodeId: () => string | null
}

interface MindmapEditorProps {
  initialData?: MindmapData
  onChange?: (data: MindmapData) => void
  onSelectedNodeChange?: (nodeId: string | null, node: MindmapNode | null) => void
  readOnly?: boolean
}

interface NodeDetailDraft {
  text: string
  description: string
  attachments: MindmapAttachment[]
  color: string
}

interface AttachmentInput {
  label: string
  url: string
  type: 'image' | 'link'
}

interface Point {
  x: number
  y: number
}

interface NodeMetrics {
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

// ============================================================================
// State Management - Reducer
// ============================================================================

interface EditorState {
  mindmapData: MindmapData
  scale: number
  offset: Point
  selectedNodeId: string | null
  detailNodeId: string | null
  detailDraft: NodeDetailDraft | null
  newAttachmentInput: AttachmentInput
  draggingNodeId: string | null
  dragStart: Point | null
  isPanning: boolean
  panStart: Point | null
  isHoveringEmptySpace: boolean
}

type EditorAction =
  | { type: 'SET_MINDMAP_DATA'; payload: MindmapData }
  | { type: 'UPDATE_NODE'; payload: { nodeId: string; updates: Partial<MindmapNode> } }
  | { type: 'UPDATE_NODES'; payload: { [nodeId: string]: Partial<MindmapNode> } }
  | { type: 'ADD_NODE'; payload: { parentId: string; node: MindmapNode } }
  | { type: 'DELETE_NODE'; payload: { nodeId: string; parentId: string } }
  | { type: 'SET_SCALE'; payload: number }
  | { type: 'SET_OFFSET'; payload: Point }
  | { type: 'SET_SELECTED_NODE_ID'; payload: string | null }
  | { type: 'SET_DETAIL_NODE_ID'; payload: string | null }
  | { type: 'SET_DETAIL_DRAFT'; payload: NodeDetailDraft | null }
  | { type: 'UPDATE_DETAIL_DRAFT'; payload: Partial<NodeDetailDraft> }
  | { type: 'SET_NEW_ATTACHMENT_INPUT'; payload: AttachmentInput }
  | { type: 'START_DRAGGING'; payload: { nodeId: string; start: Point } }
  | { type: 'STOP_DRAGGING' }
  | { type: 'START_PANNING'; payload: Point }
  | { type: 'STOP_PANNING' }
  | { type: 'SET_HOVERING_EMPTY_SPACE'; payload: boolean }
  | { type: 'RESET_VIEW' }
  | { type: 'RESET_ALL'; payload: MindmapData }
  | { type: 'OPEN_DETAIL'; payload: { nodeId: string; draft: NodeDetailDraft } }
  | { type: 'CLOSE_DETAIL' }

const DEFAULT_ATTACHMENT_INPUT: AttachmentInput = { label: '', url: '', type: 'image' }

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_MINDMAP_DATA':
      return { ...state, mindmapData: action.payload }

    case 'UPDATE_NODE': {
      const { nodeId, updates } = action.payload
      const node = state.mindmapData.nodes[nodeId]
      if (!node) return state
      return {
        ...state,
        mindmapData: {
          ...state.mindmapData,
          nodes: {
            ...state.mindmapData.nodes,
            [nodeId]: { ...node, ...updates },
          },
        },
      }
    }

    case 'UPDATE_NODES': {
      const newNodes = { ...state.mindmapData.nodes }
      for (const [nodeId, updates] of Object.entries(action.payload)) {
        if (newNodes[nodeId]) {
          newNodes[nodeId] = { ...newNodes[nodeId], ...updates }
        }
      }
      return {
        ...state,
        mindmapData: { ...state.mindmapData, nodes: newNodes },
      }
    }

    case 'ADD_NODE': {
      const { parentId, node } = action.payload
      const parent = state.mindmapData.nodes[parentId]
      if (!parent) return state
      return {
        ...state,
        mindmapData: {
          ...state.mindmapData,
          nodes: {
            ...state.mindmapData.nodes,
            [parentId]: {
              ...parent,
              children: [...parent.children, node.id],
              collapsed: false,
            },
            [node.id]: node,
          },
        },
      }
    }

    case 'DELETE_NODE': {
      const { nodeId, parentId } = action.payload
      const parent = state.mindmapData.nodes[parentId]
      if (!parent) return state
      
      // Collect all nodes to delete (including descendants)
      const nodesToRemove = new Set<string>()
      const collectNodes = (id: string) => {
        nodesToRemove.add(id)
        const node = state.mindmapData.nodes[id]
        if (node) node.children.forEach(collectNodes)
      }
      collectNodes(nodeId)

      const newNodes = { ...state.mindmapData.nodes }
      nodesToRemove.forEach(id => delete newNodes[id])
      newNodes[parentId] = {
        ...parent,
        children: parent.children.filter(id => id !== nodeId),
      }

      return {
        ...state,
        mindmapData: { ...state.mindmapData, nodes: newNodes },
        selectedNodeId: null,
      }
    }

    case 'SET_SCALE':
      return { ...state, scale: action.payload }

    case 'SET_OFFSET':
      return { ...state, offset: action.payload }

    case 'SET_SELECTED_NODE_ID':
      return { ...state, selectedNodeId: action.payload }

    case 'SET_DETAIL_NODE_ID':
      return { ...state, detailNodeId: action.payload }

    case 'SET_DETAIL_DRAFT':
      return { ...state, detailDraft: action.payload }

    case 'UPDATE_DETAIL_DRAFT':
      if (!state.detailDraft) return state
      return { ...state, detailDraft: { ...state.detailDraft, ...action.payload } }

    case 'SET_NEW_ATTACHMENT_INPUT':
      return { ...state, newAttachmentInput: action.payload }

    case 'START_DRAGGING':
      return {
        ...state,
        draggingNodeId: action.payload.nodeId,
        dragStart: action.payload.start,
      }

    case 'STOP_DRAGGING':
      return { ...state, draggingNodeId: null, dragStart: null }

    case 'START_PANNING':
      return { ...state, isPanning: true, panStart: action.payload }

    case 'STOP_PANNING':
      return { ...state, isPanning: false, panStart: null }

    case 'SET_HOVERING_EMPTY_SPACE':
      return { ...state, isHoveringEmptySpace: action.payload }

    case 'RESET_VIEW':
      return { ...state, scale: 1, offset: { x: 0, y: 0 } }

    case 'RESET_ALL':
      return {
        ...state,
        mindmapData: action.payload,
        selectedNodeId: action.payload.rootId,
        scale: 1,
        offset: { x: 0, y: 0 },
        detailNodeId: null,
        detailDraft: null,
        newAttachmentInput: DEFAULT_ATTACHMENT_INPUT,
      }

    case 'OPEN_DETAIL':
      return {
        ...state,
        detailNodeId: action.payload.nodeId,
        detailDraft: action.payload.draft,
        newAttachmentInput: DEFAULT_ATTACHMENT_INPUT,
      }

    case 'CLOSE_DETAIL':
      return {
        ...state,
        detailNodeId: null,
        detailDraft: null,
        newAttachmentInput: DEFAULT_ATTACHMENT_INPUT,
      }

    default:
      return state
  }
}

function createInitialState(initialData?: MindmapData): EditorState {
  const mindmapData = normalizeMindmapData(initialData)
  return {
    mindmapData,
    scale: 1,
    offset: { x: 0, y: 0 },
    selectedNodeId: null,
    detailNodeId: null,
    detailDraft: null,
    newAttachmentInput: DEFAULT_ATTACHMENT_INPUT,
    draggingNodeId: null,
    dragStart: null,
    isPanning: false,
    panStart: null,
    isHoveringEmptySpace: false,
  }
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
]

const NODE_PADDING = 16
const NODE_HEIGHT = 44
const MIN_NODE_WIDTH = 120
const COLLAPSE_INDICATOR_SIZE = 26
const COLLAPSE_ANIMATION_DURATION = 260

// ============================================================================
// Hit Testing Types
// ============================================================================

type NodeHitArea = 'body' | 'collapse'

interface NodeHit {
  nodeId: string
  area: NodeHitArea
}

// ============================================================================
// Canvas Rendering Utilities
// ============================================================================

interface RenderContext {
  ctx: CanvasRenderingContext2D
  mindmapData: MindmapData
  selectedNodeId: string | null
  now: number
  resolveVisibility: (nodeId: string, now: number) => { value: number; animating: boolean }
}

/**
 * Computes the metrics (dimensions, bounding rect, collapse button bounds) for a node
 */
function computeNodeMetrics(
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

  const collapsePadding = 8
  const collapseBounds = node.children.length > 0
    ? {
        left: rect.right - COLLAPSE_INDICATOR_SIZE - collapsePadding,
        right: rect.right - collapsePadding,
        top: rect.bottom - COLLAPSE_INDICATOR_SIZE - collapsePadding,
        bottom: rect.bottom - collapsePadding,
      }
    : null

  return { width, height, rect, collapseBounds }
}

/**
 * Draws an edge (connection line) between parent and child nodes
 */
function drawEdge(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  visibility: number
): void {
  ctx.save()
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)'
  ctx.lineWidth = Math.max(1, 2 * visibility)
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draws the collapse/expand indicator button on a node
 */
function drawCollapseIndicator(
  ctx: CanvasRenderingContext2D,
  collapseBounds: NonNullable<NodeMetrics['collapseBounds']>,
  nodeColor: string,
  isCollapsed: boolean,
  isSelected: boolean
): void {
  const centerX = (collapseBounds.left + collapseBounds.right) / 2
  const centerY = (collapseBounds.top + collapseBounds.bottom) / 2
  const indicatorRadius = COLLAPSE_INDICATOR_SIZE / 2

  // Background circle
  ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.93)'
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
function drawNodeBody(
  ctx: CanvasRenderingContext2D,
  node: MindmapNode,
  metrics: NodeMetrics,
  isRoot: boolean,
  isSelected: boolean,
  visibility: number,
  renderX: number,
  renderY: number
): void {
  ctx.save()
  ctx.globalAlpha = Math.max(visibility, 0.1)
  ctx.fillStyle = node.color
  ctx.strokeStyle = isSelected ? '#0f172a' : node.color
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
    drawCollapseIndicator(ctx, metrics.collapseBounds, node.color, node.collapsed, isSelected)
  }

  ctx.restore()
}

/**
 * Calculates the interpolated render position based on visibility (for animations)
 */
function calculateRenderPosition(
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
function createEmptyLayoutSnapshot(): LayoutSnapshot {
  return {
    nodes: [],
    edges: [],
    bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  }
}

/**
 * Updates the layout snapshot bounds with node metrics
 */
function updateSnapshotBounds(snapshot: LayoutSnapshot, metrics: NodeMetrics): void {
  snapshot.bounds.minX = Math.min(snapshot.bounds.minX, metrics.rect.left)
  snapshot.bounds.minY = Math.min(snapshot.bounds.minY, metrics.rect.top)
  snapshot.bounds.maxX = Math.max(snapshot.bounds.maxX, metrics.rect.right)
  snapshot.bounds.maxY = Math.max(snapshot.bounds.maxY, metrics.rect.bottom)
}

// ============================================================================
// Data Normalization
// ============================================================================

// ============================================================================
// Data Normalization
// ============================================================================

const createDefaultMindmap = (): MindmapData => {
  const rootId = 'root'
  return {
    rootId,
    nodes: {
      [rootId]: {
        id: rootId,
        text: 'Central Idea',
        x: 400,
        y: 300,
        parentId: null,
        children: [],
        collapsed: false,
        color: DEFAULT_COLORS[0],
        description: '',
        attachments: [],
      },
    },
  }
}

const normalizeMindmapData = (input?: MindmapData | null): MindmapData => {
  if (!input || !input.rootId || !input.nodes || !input.nodes[input.rootId]) {
    return createDefaultMindmap()
  }

  const normalizedNodes: Record<string, MindmapNode> = {}

  Object.entries(input.nodes).forEach(([nodeId, raw]) => {
    const id = raw?.id || nodeId
    const text = typeof raw?.text === 'string' && raw.text.trim() ? raw.text : 'New Node'
    const x = Number.isFinite(raw?.x) ? Number(raw?.x) : 0
    const y = Number.isFinite(raw?.y) ? Number(raw?.y) : 0
    const parentId = typeof raw?.parentId === 'string' ? raw.parentId : null
    const children = Array.isArray(raw?.children)
      ? raw.children.filter((child) => typeof child === 'string')
      : []
    const collapsed = Boolean(raw?.collapsed)
    const color = typeof raw?.color === 'string' && raw.color.trim() ? raw.color : DEFAULT_COLORS[0]
    const description = typeof raw?.description === 'string' ? raw.description : ''

    const attachments: MindmapAttachment[] = Array.isArray(raw?.attachments)
      ? raw.attachments
          .map((item) => {
            const id = typeof item?.id === 'string' ? item.id : undefined
            const label = typeof item?.label === 'string' ? item.label : undefined
            const url = typeof item?.url === 'string' ? item.url : undefined
            const type = item?.type === 'image' || item?.type === 'link' ? item.type : undefined
            if (!id || !url) return null
            return {
              id,
              label: label ?? 'Attachment',
              url,
              type: type ?? 'image',
            }
          })
          .filter((item): item is MindmapAttachment => Boolean(item))
      : []

    normalizedNodes[id] = {
      id,
      text,
      x,
      y,
      parentId,
      children,
      collapsed,
      color,
      description,
      attachments,
    }
  })

  const rootNode = normalizedNodes[input.rootId]
  if (!rootNode) {
    return createDefaultMindmap()
  }

  rootNode.parentId = null

  Object.values(normalizedNodes).forEach((node) => {
    node.children = node.children.filter((childId) => normalizedNodes[childId] && normalizedNodes[childId].id !== node.id)
    node.children.forEach((childId) => {
      const child = normalizedNodes[childId]
      if (child) child.parentId = node.id
    })
  })

  return {
    rootId: rootNode.id,
    nodes: normalizedNodes,
  }
}

// ============================================================================
// Device Pixel Ratio Utility
// ============================================================================

function getDevicePixelRatio(): number {
  return typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
    ? window.devicePixelRatio
    : 1
}

// ============================================================================
// Canvas Context Utility
// ============================================================================

function getCanvasContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!canvas) return null
  return canvas.getContext('2d')
}

// ============================================================================
// Main Component
// ============================================================================

const MindmapEditor = forwardRef<MindmapEditorHandle, MindmapEditorProps>(
  ({ initialData, onChange, onSelectedNodeChange, readOnly = false }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    
    // Consolidated state using reducer
    const [state, dispatch] = useReducer(editorReducer, initialData, createInitialState)
    const {
      mindmapData,
      scale,
      offset,
      selectedNodeId,
      detailNodeId,
      detailDraft,
      newAttachmentInput,
      draggingNodeId,
      dragStart,
      isPanning,
      panStart,
      isHoveringEmptySpace,
    } = state

    // Refs for values that don't need to trigger re-renders
    const skipOnChangeRef = useRef(false)
    const mindmapDataRef = useRef<MindmapData>(mindmapData)
    const animationsRef = useRef<Map<string, { direction: 'collapse' | 'expand'; startTime: number }>>(new Map())
    const animationFrameRef = useRef<number | null>(null)
    const lastRenderTimeRef = useRef<number>(performance.now())
    const suppressClickRef = useRef(false)
    const collapseTargetRef = useRef<string | null>(null)
    const collapsePointerStartRef = useRef<Point | null>(null)
    const miniMapCanvasRef = useRef<HTMLCanvasElement>(null)
    const miniMapTransformRef = useRef<{
      minX: number
      minY: number
      scale: number
      offsetX: number
      offsetY: number
    } | null>(null)

    useImperativeHandle(ref, () => ({
      getData: () => mindmapData,
      setData: (data: MindmapData) => {
        const normalized = normalizeMindmapData(data)
        skipOnChangeRef.current = true
        animationsRef.current.clear()
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }
        dispatch({ type: 'RESET_ALL', payload: normalized })
      },
      clear: () => {
        const reset = createDefaultMindmap()
        skipOnChangeRef.current = true
        animationsRef.current.clear()
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }
        dispatch({ type: 'RESET_ALL', payload: reset })
      },
      getSelectedNodeId: () => selectedNodeId,
    }))

    useEffect(() => {
      mindmapDataRef.current = mindmapData
    }, [mindmapData])

    // Notify parent when selected node changes (for AI integration)
    useEffect(() => {
      if (onSelectedNodeChange) {
        const node = selectedNodeId ? mindmapData.nodes[selectedNodeId] : null
        onSelectedNodeChange(selectedNodeId, node)
      }
    }, [selectedNodeId, mindmapData, onSelectedNodeChange])

    useEffect(() => {
      const nextData = normalizeMindmapData(initialData)
      const currentSignature = JSON.stringify(mindmapDataRef.current)
      const incomingSignature = JSON.stringify(nextData)

      if (currentSignature === incomingSignature) return

      skipOnChangeRef.current = true
      animationsRef.current.clear()
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      dispatch({ type: 'RESET_ALL', payload: nextData })
    }, [initialData])

    useEffect(() => {
      if (skipOnChangeRef.current) {
        skipOnChangeRef.current = false
        return
      }
      onChange?.(mindmapData)
    }, [mindmapData, onChange])
    const resolveChildrenVisibility = useCallback(
      (nodeId: string, now: number): { value: number; animating: boolean } => {
        const animation = animationsRef.current.get(nodeId)
        if (animation) {
          const elapsed = Math.min((now - animation.startTime) / COLLAPSE_ANIMATION_DURATION, 1)
          if (elapsed >= 1) {
            animationsRef.current.delete(nodeId)
            return {
              value: animation.direction === 'collapse' ? 0 : 1,
              animating: false,
            }
          }
          return {
            value: animation.direction === 'collapse' ? 1 - elapsed : elapsed,
            animating: true,
          }
        }

        const node = mindmapData.nodes[nodeId]
        return {
          value: node && !node.collapsed ? 1 : 0,
          animating: false,
        }
      },
      [mindmapData.nodes]
    )

    const mapClientToWorld = useCallback(
      (clientX: number, clientY: number) => {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return null

        const screenX = clientX - rect.left
        const screenY = clientY - rect.top

        return {
          screenX,
          screenY,
          worldX: (screenX - offset.x) / scale,
          worldY: (screenY - offset.y) / scale,
        }
      },
      [offset, scale]
    )

    const renderMiniMap = useCallback(
      (snapshot: LayoutSnapshot) => {
        const miniCanvas = miniMapCanvasRef.current
        if (!miniCanvas) return

        const ctx = getCanvasContext(miniCanvas)
        if (!ctx) return

        const styleWidth = miniCanvas.clientWidth || 1
        const styleHeight = miniCanvas.clientHeight || 1
        if (styleWidth === 0 || styleHeight === 0) {
          miniMapTransformRef.current = null
          return
        }

        const devicePixelRatio = getDevicePixelRatio()
        const requiredWidth = Math.max(1, Math.round(styleWidth * devicePixelRatio))
        const requiredHeight = Math.max(1, Math.round(styleHeight * devicePixelRatio))

        if (miniCanvas.width !== requiredWidth || miniCanvas.height !== requiredHeight) {
          miniCanvas.width = requiredWidth
          miniCanvas.height = requiredHeight
        }

        ctx.save()
        ctx.scale(devicePixelRatio, devicePixelRatio)
        ctx.clearRect(0, 0, styleWidth, styleHeight)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)'
        ctx.fillRect(0, 0, styleWidth, styleHeight)

        if (!snapshot || snapshot.nodes.length === 0) {
          ctx.restore()
          miniMapTransformRef.current = null
          return
        }

        const { minX, minY, maxX, maxY } = snapshot.bounds
        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
          ctx.restore()
          miniMapTransformRef.current = null
          return
        }

        const padding = 16
        const mapWidth = Math.max(maxX - minX, 1)
        const mapHeight = Math.max(maxY - minY, 1)
        const availableWidth = Math.max(styleWidth - padding * 2, 1)
        const availableHeight = Math.max(styleHeight - padding * 2, 1)
        const mapScale = Math.min(availableWidth / mapWidth, availableHeight / mapHeight)

        const mapPixelWidth = mapWidth * mapScale
        const mapPixelHeight = mapHeight * mapScale
        const offsetX = (styleWidth - mapPixelWidth) / 2
        const offsetY = (styleHeight - mapPixelHeight) / 2

        miniMapTransformRef.current = {
          minX,
          minY,
          scale: mapScale,
          offsetX,
          offsetY,
        }

        // Draw edges
        snapshot.edges.forEach((edge) => {
          const alpha = Math.max(Math.min(edge.visibility, 1), 0.15)
          ctx.globalAlpha = alpha
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(offsetX + (edge.from.x - minX) * mapScale, offsetY + (edge.from.y - minY) * mapScale)
          ctx.lineTo(offsetX + (edge.to.x - minX) * mapScale, offsetY + (edge.to.y - minY) * mapScale)
          ctx.stroke()
        })

        // Draw nodes
        ctx.globalAlpha = 1
        snapshot.nodes.forEach((node) => {
          const x = offsetX + (node.x - minX) * mapScale
          const y = offsetY + (node.y - minY) * mapScale
          const radius = node.isRoot ? 5 : 4

          ctx.globalAlpha = Math.max(node.visibility, 0.25)
          ctx.fillStyle = node.color
          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fill()

          if (node.isSelected) {
            ctx.globalAlpha = 1
            ctx.lineWidth = 2
            ctx.strokeStyle = '#0f172a'
            ctx.beginPath()
            ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2)
            ctx.stroke()
          }
        })

        ctx.globalAlpha = 1

        // Draw viewport indicator
        const mainCanvas = canvasRef.current
        if (mainCanvas && miniMapTransformRef.current) {
          const viewportWidthWorld = mainCanvas.width / scale
          const viewportHeightWorld = mainCanvas.height / scale
          const worldLeft = -offset.x / scale
          const worldTop = -offset.y / scale

          const rectX = offsetX + (worldLeft - minX) * mapScale
          const rectY = offsetY + (worldTop - minY) * mapScale
          const rectWidth = viewportWidthWorld * mapScale
          const rectHeight = viewportHeightWorld * mapScale

          ctx.globalAlpha = 1
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.95)'
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 3])
          ctx.strokeRect(rectX, rectY, rectWidth, rectHeight)
          ctx.setLineDash([])
        }

        ctx.restore()
      },
      [offset, scale]
    )

    const hitTestNodes = useCallback(
      (worldX: number, worldY: number): NodeHit | null => {
        const ctx = getCanvasContext(canvasRef.current)
        if (!ctx) return null

        const now = lastRenderTimeRef.current ?? performance.now()

        const traverse = (
          nodeId: string,
          visibility: number,
          parentPosition?: Point
        ): NodeHit | null => {
          const node = mindmapData.nodes[nodeId]
          if (!node) return null

          const clampedVisibility = Math.max(0, Math.min(visibility, 1))
          const parentNode = node.parentId ? mindmapData.nodes[node.parentId] : null
          const origin = parentPosition ?? (parentNode ? { x: parentNode.x, y: parentNode.y } : undefined)
          const renderPos = calculateRenderPosition(node, clampedVisibility, origin)

          const metrics = computeNodeMetrics(ctx, { ...node, x: renderPos.x, y: renderPos.y }, nodeId === mindmapData.rootId)

          if (
            worldX >= metrics.rect.left &&
            worldX <= metrics.rect.right &&
            worldY >= metrics.rect.top &&
            worldY <= metrics.rect.bottom
          ) {
            if (
              metrics.collapseBounds &&
              worldX >= metrics.collapseBounds.left &&
              worldX <= metrics.collapseBounds.right &&
              worldY >= metrics.collapseBounds.top &&
              worldY <= metrics.collapseBounds.bottom
            ) {
              return { nodeId, area: 'collapse' }
            }
            return { nodeId, area: 'body' }
          }

          const { value: childProgress } = resolveChildrenVisibility(nodeId, now)
          const childVisibility = clampedVisibility * childProgress
          if (childVisibility <= 0) {
            return null
          }

          const nextParentPosition = { x: renderPos.x, y: renderPos.y }
          for (const childId of node.children) {
            const hit = traverse(childId, childVisibility, nextParentPosition)
            if (hit) return hit
          }

          return null
        }

        return traverse(mindmapData.rootId, 1)
      },
      [mindmapData, resolveChildrenVisibility]
    )

    const renderMindmap = useCallback(
      (timestamp?: number) => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = getCanvasContext(canvas)
        if (!ctx) return

        if (typeof timestamp === 'number') {
          animationFrameRef.current = null
        }

        const now = timestamp ?? performance.now()
        let hasActiveAnimation = false

        ctx.save()
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.translate(offset.x, offset.y)
        ctx.scale(scale, scale)

        // Draw background
        ctx.fillStyle = '#f8fafc'
        ctx.fillRect(-offset.x / scale, -offset.y / scale, canvas.width / scale, canvas.height / scale)

        const layoutSnapshot = createEmptyLayoutSnapshot()

        // Recursive node drawing function
        const drawNode = (
          nodeId: string,
          visibility: number,
          parentPosition?: Point
        ): void => {
          const node = mindmapData.nodes[nodeId]
          if (!node) return

          const clampedVisibility = Math.max(0, Math.min(visibility, 1))
          const parentNode = node.parentId ? mindmapData.nodes[node.parentId] : null
          const origin = parentPosition ?? (parentNode ? { x: parentNode.x, y: parentNode.y } : undefined)
          const renderPos = calculateRenderPosition(node, clampedVisibility, origin)

          // Draw edge to parent
          const edgeFrom = parentNode
            ? parentPosition ?? { x: parentNode.x, y: parentNode.y }
            : null

          if (edgeFrom) {
            drawEdge(ctx, edgeFrom, renderPos, clampedVisibility)
            layoutSnapshot.edges.push({
              from: edgeFrom,
              to: renderPos,
              visibility: clampedVisibility,
            })
          }

          // Compute node metrics
          const isRoot = nodeId === mindmapData.rootId
          const metrics = computeNodeMetrics(ctx, { ...node, x: renderPos.x, y: renderPos.y }, isRoot)
          const isSelected = selectedNodeId === nodeId

          // Update layout snapshot
          layoutSnapshot.nodes.push({
            id: nodeId,
            x: renderPos.x,
            y: renderPos.y,
            color: node.color,
            visibility: clampedVisibility,
            isRoot,
            isSelected,
          })
          updateSnapshotBounds(layoutSnapshot, metrics)

          // Draw the node
          drawNodeBody(ctx, node, metrics, isRoot, isSelected, clampedVisibility, renderPos.x, renderPos.y)

          // Process children
          const { value: childProgress, animating } = resolveChildrenVisibility(nodeId, now)
          if (animating) {
            hasActiveAnimation = true
          }

          const childVisibility = clampedVisibility * childProgress
          if (childVisibility <= 0 && !animating) {
            return
          }

          node.children.forEach((childId) => {
            drawNode(childId, Math.max(childVisibility, 0), renderPos)
          })
        }

        // Start drawing from root
        drawNode(mindmapData.rootId, 1)

        ctx.restore()
        renderMiniMap(layoutSnapshot)
        lastRenderTimeRef.current = now

        // Schedule next frame if animating
        if (hasActiveAnimation) {
          animationFrameRef.current = requestAnimationFrame(renderMindmap)
        } else {
          animationFrameRef.current = null
        }
      },
      [mindmapData, offset, scale, selectedNodeId, resolveChildrenVisibility, renderMiniMap]
    )

    useEffect(() => {
      renderMindmap()
    }, [renderMindmap])

    useEffect(() => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const resizeCanvas = () => {
        canvas.width = container.clientWidth
        canvas.height = container.clientHeight
        renderMindmap()
      }

      resizeCanvas()
      window.addEventListener('resize', resizeCanvas)
      return () => window.removeEventListener('resize', resizeCanvas)
    }, [renderMindmap])

    useEffect(() => {
      return () => {
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }
      }
    }, [])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const preventBrowserZoom = (event: WheelEvent) => {
        if (event.ctrlKey) {
          event.preventDefault()
        }
      }

      const preventGesture = (event: Event) => {
        event.preventDefault()
      }

      const wheelOptions: AddEventListenerOptions = { passive: false }
      const gestureListener = preventGesture as EventListener

      container.addEventListener('wheel', preventBrowserZoom, wheelOptions)
      container.addEventListener('gesturestart' as any, gestureListener, wheelOptions)
      container.addEventListener('gesturechange' as any, gestureListener, wheelOptions)
      container.addEventListener('gestureend' as any, gestureListener, wheelOptions)

      return () => {
        container.removeEventListener('wheel', preventBrowserZoom)
        container.removeEventListener('gesturestart' as any, gestureListener)
        container.removeEventListener('gesturechange' as any, gestureListener)
        container.removeEventListener('gestureend' as any, gestureListener)
      }
    }, [])


    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (readOnly) return

      if (suppressClickRef.current) {
        suppressClickRef.current = false
        collapseTargetRef.current = null
        collapsePointerStartRef.current = null
        return
      }

      const coordinates = mapClientToWorld(e.clientX, e.clientY)
      if (!coordinates) return

      const hit = hitTestNodes(coordinates.worldX, coordinates.worldY)

      if (!hit) {
        collapseTargetRef.current = null
        collapsePointerStartRef.current = null
        // Don't deselect on empty click - user might just be panning
        return
      }

      if (hit.area === 'collapse') {
        e.preventDefault()
        collapseTargetRef.current = null
        collapsePointerStartRef.current = null
        toggleCollapse(hit.nodeId)
        return
      }

      collapseTargetRef.current = null
      collapsePointerStartRef.current = null
      if (hit.area === 'body') {
        dispatch({ type: 'SET_SELECTED_NODE_ID', payload: hit.nodeId })
        // keep detail drawer untouched on simple select
      }
    }

    const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (readOnly) return

      collapseTargetRef.current = null
      collapsePointerStartRef.current = null
      const coordinates = mapClientToWorld(e.clientX, e.clientY)
      if (!coordinates) return

      const hit = hitTestNodes(coordinates.worldX, coordinates.worldY)
      if (hit?.area === 'body') {
        openNodeDetail(hit.nodeId)
      }
    }

    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (readOnly) return
      suppressClickRef.current = false

      const coordinates = mapClientToWorld(e.clientX, e.clientY)
      if (!coordinates) return
      const { screenX, screenY, worldX, worldY } = coordinates

      if (e.button === 0) {
        const hit = hitTestNodes(worldX, worldY)
        if (hit?.area === 'collapse') {
          collapseTargetRef.current = hit.nodeId
          collapsePointerStartRef.current = { x: screenX, y: screenY }
          dispatch({ type: 'SET_SELECTED_NODE_ID', payload: hit.nodeId })
          return
        }

        collapseTargetRef.current = null
        collapsePointerStartRef.current = null

        if (hit?.nodeId) {
          dispatch({ type: 'SET_SELECTED_NODE_ID', payload: hit.nodeId })
          dispatch({ type: 'START_DRAGGING', payload: { nodeId: hit.nodeId, start: { x: screenX, y: screenY } } })
        } else {
          // Click on empty canvas - start panning (no modifier keys needed)
          dispatch({ type: 'START_PANNING', payload: { x: screenX - offset.x, y: screenY - offset.y } })
        }
      } else if (e.button === 1 || e.button === 2) {
        e.preventDefault()
        collapseTargetRef.current = null
        collapsePointerStartRef.current = null
        dispatch({ type: 'START_PANNING', payload: { x: screenX - offset.x, y: screenY - offset.y } })
      }
    }

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (readOnly) return

      const coordinates = mapClientToWorld(e.clientX, e.clientY)
      if (!coordinates) return

      const { screenX, screenY, worldX, worldY } = coordinates

      if (draggingNodeId && dragStart) {
        const dx = (screenX - dragStart.x) / scale
        const dy = (screenY - dragStart.y) / scale

        if (!suppressClickRef.current) {
          const distance = Math.hypot(screenX - dragStart.x, screenY - dragStart.y)
          if (distance > 3) {
            suppressClickRef.current = true
            collapseTargetRef.current = null
            collapsePointerStartRef.current = null
          }
        }

        const node = mindmapData.nodes[draggingNodeId]
        if (node) {
          dispatch({
            type: 'UPDATE_NODE',
            payload: {
              nodeId: draggingNodeId,
              updates: { x: node.x + dx, y: node.y + dy },
            },
          })
        }

        dispatch({ type: 'START_DRAGGING', payload: { nodeId: draggingNodeId, start: { x: screenX, y: screenY } } })
      } else if (isPanning && panStart) {
        suppressClickRef.current = true
        collapseTargetRef.current = null
        collapsePointerStartRef.current = null
        dispatch({ type: 'SET_OFFSET', payload: { x: screenX - panStart.x, y: screenY - panStart.y } })
      } else if (collapseTargetRef.current && collapsePointerStartRef.current) {
        const distance = Math.hypot(
          screenX - collapsePointerStartRef.current.x,
          screenY - collapsePointerStartRef.current.y
        )
        if (distance > 6) {
          collapseTargetRef.current = null
          collapsePointerStartRef.current = null
        }
      } else {
        // Update hover state for cursor feedback
        const hit = hitTestNodes(worldX, worldY)
        dispatch({ type: 'SET_HOVERING_EMPTY_SPACE', payload: !hit })
      }
    }

    const handleCanvasMouseUp = () => {
      if (draggingNodeId || isPanning) {
        suppressClickRef.current = true
      }
      dispatch({ type: 'STOP_DRAGGING' })
      dispatch({ type: 'STOP_PANNING' })
    }

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault()

      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.max(0.1, Math.min(3, scale * delta))

      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return

      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const worldX = (mouseX - offset.x) / scale
      const worldY = (mouseY - offset.y) / scale

      const newOffset = {
        x: mouseX - worldX * newScale,
        y: mouseY - worldY * newScale,
      }

      dispatch({ type: 'SET_SCALE', payload: newScale })
      dispatch({ type: 'SET_OFFSET', payload: newOffset })
    }

    const openNodeDetail = useCallback(
      (nodeId: string) => {
        const node = mindmapData.nodes[nodeId]
        if (!node) return

        dispatch({
          type: 'OPEN_DETAIL',
          payload: {
            nodeId,
            draft: {
              text: node.text,
              description: node.description,
              attachments: node.attachments.map((attachment) => ({ ...attachment })),
              color: node.color,
            },
          },
        })
      },
      [mindmapData.nodes]
    )

    const closeNodeDetail = useCallback(() => {
      dispatch({ type: 'CLOSE_DETAIL' })
    }, [])

    const saveNodeDetail = useCallback(() => {
      if (!detailNodeId || !detailDraft) return

      const nextText = detailDraft.text.trim() || 'Untitled Node'

      dispatch({
        type: 'UPDATE_NODE',
        payload: {
          nodeId: detailNodeId,
          updates: {
            text: nextText,
            description: detailDraft.description,
            attachments: detailDraft.attachments.map((attachment) => ({ ...attachment })),
            color: detailDraft.color,
          },
        },
      })

      dispatch({ type: 'SET_SELECTED_NODE_ID', payload: detailNodeId })
      closeNodeDetail()
    }, [detailDraft, detailNodeId, closeNodeDetail])

    const addAttachmentToDraft = useCallback(() => {
      const url = newAttachmentInput.url.trim()
      if (!detailDraft || !url) return

      const attachment: MindmapAttachment = {
        id: `att-${Date.now()}`,
        label: newAttachmentInput.label.trim() || 'Attachment',
        url,
        type: newAttachmentInput.type,
      }

      dispatch({
        type: 'UPDATE_DETAIL_DRAFT',
        payload: { attachments: [...detailDraft.attachments, attachment] },
      })
      dispatch({ type: 'SET_NEW_ATTACHMENT_INPUT', payload: DEFAULT_ATTACHMENT_INPUT })
    }, [detailDraft, newAttachmentInput])

    const removeAttachmentFromDraft = useCallback((attachmentId: string) => {
      if (!detailDraft) return
      dispatch({
        type: 'UPDATE_DETAIL_DRAFT',
        payload: { attachments: detailDraft.attachments.filter((attachment) => attachment.id !== attachmentId) },
      })
    }, [detailDraft])

    useEffect(() => {
      if (!detailNodeId) return

      if (!mindmapData.nodes[detailNodeId]) {
        closeNodeDetail()
      }
    }, [detailNodeId, mindmapData, closeNodeDetail])

    useEffect(() => {
      if (!detailNodeId) return

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeNodeDetail()
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [detailNodeId, closeNodeDetail])

    const addChildNode = () => {
      if (!selectedNodeId || readOnly) return

      const parentNode = mindmapData.nodes[selectedNodeId]
      if (!parentNode) return
      
      const newNodeId = `node-${Date.now()}`

      // Calculate position for new child
      const childCount = parentNode.children.length
      const angle = (Math.PI * 2 * childCount) / Math.max(parentNode.children.length + 1, 4)
      const distance = 150
      const newX = parentNode.x + Math.cos(angle) * distance
      const newY = parentNode.y + Math.sin(angle) * distance

      // Get a color (cycle through or inherit)
      const colorIndex = (parentNode.children.length) % DEFAULT_COLORS.length
      const newColor = DEFAULT_COLORS[colorIndex]

      const parentWasCollapsed = parentNode.collapsed

      const newNode: MindmapNode = {
        id: newNodeId,
        text: 'New Node',
        x: newX,
        y: newY,
        parentId: selectedNodeId,
        children: [],
        collapsed: false,
        color: newColor,
        description: '',
        attachments: [],
      }

      dispatch({ type: 'ADD_NODE', payload: { parentId: selectedNodeId, node: newNode } })

      if (parentWasCollapsed) {
        animationsRef.current.set(selectedNodeId, {
          direction: 'expand',
          startTime: performance.now(),
        })
        if (animationFrameRef.current === null) {
          animationFrameRef.current = requestAnimationFrame(renderMindmap)
        }
      }

      dispatch({ type: 'SET_SELECTED_NODE_ID', payload: newNodeId })
    }

    const deleteNode = () => {
      if (!selectedNodeId || selectedNodeId === mindmapData.rootId || readOnly) return

      const nodeToDelete = mindmapData.nodes[selectedNodeId]
      if (!nodeToDelete?.parentId) return

      dispatch({ type: 'DELETE_NODE', payload: { nodeId: selectedNodeId, parentId: nodeToDelete.parentId } })
    }

    const toggleCollapse = useCallback(
      (nodeId?: string) => {
        if (readOnly) return

        const targetId = nodeId ?? selectedNodeId
        if (!targetId) return

        const targetNode = mindmapData.nodes[targetId]
        if (!targetNode || targetNode.children.length === 0) return

        const direction: 'collapse' | 'expand' = targetNode.collapsed ? 'expand' : 'collapse'
        animationsRef.current.set(targetId, {
          direction,
          startTime: performance.now(),
        })

        dispatch({
          type: 'UPDATE_NODE',
          payload: { nodeId: targetId, updates: { collapsed: !targetNode.collapsed } },
        })

        if (animationFrameRef.current === null) {
          animationFrameRef.current = requestAnimationFrame(renderMindmap)
        }
      },
      [readOnly, selectedNodeId, mindmapData.nodes, renderMindmap]
    )

    // Keyboard navigation for moving between nodes
    useEffect(() => {
      if (detailNodeId || readOnly) return // Don't navigate when detail panel is open

      const handleKeyDown = (event: KeyboardEvent) => {
        // Ignore if focus is on an input element
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return
        }

        const currentNode = selectedNodeId ? mindmapData.nodes[selectedNodeId] : null

        switch (event.key) {
          case 'ArrowUp':
          case 'ArrowLeft': {
            event.preventDefault()
            if (!currentNode) {
              // No selection - select root
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: mindmapData.rootId })
              return
            }
            // Navigate to parent
            if (currentNode.parentId && mindmapData.nodes[currentNode.parentId]) {
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: currentNode.parentId })
            }
            break
          }
          case 'ArrowDown':
          case 'ArrowRight': {
            event.preventDefault()
            if (!currentNode) {
              // No selection - select root
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: mindmapData.rootId })
              return
            }
            // Navigate to first visible child
            if (currentNode.children.length > 0 && !currentNode.collapsed) {
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: currentNode.children[0] })
            }
            break
          }
          case 'Tab': {
            event.preventDefault()
            if (!currentNode) {
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: mindmapData.rootId })
              return
            }
            // Navigate to next sibling (or wrap to first)
            const parentNode = currentNode.parentId ? mindmapData.nodes[currentNode.parentId] : null
            if (parentNode) {
              const siblings = parentNode.children
              const currentIndex = siblings.indexOf(currentNode.id)
              const direction = event.shiftKey ? -1 : 1
              const nextIndex = (currentIndex + direction + siblings.length) % siblings.length
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: siblings[nextIndex] })
            } else if (currentNode.children.length > 0 && !currentNode.collapsed) {
              // Root node - go to first child
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: currentNode.children[0] })
            }
            break
          }
          case 'Enter': {
            event.preventDefault()
            if (currentNode) {
              openNodeDetail(currentNode.id)
            }
            break
          }
          case ' ': { // Space bar to toggle collapse
            event.preventDefault()
            if (currentNode && currentNode.children.length > 0) {
              toggleCollapse(currentNode.id)
            }
            break
          }
          case 'Escape': {
            event.preventDefault()
            dispatch({ type: 'SET_SELECTED_NODE_ID', payload: null })
            break
          }
          case 'Home': {
            event.preventDefault()
            dispatch({ type: 'SET_SELECTED_NODE_ID', payload: mindmapData.rootId })
            // Center on root node
            const rootNode = mindmapData.nodes[mindmapData.rootId]
            if (rootNode && canvasRef.current) {
              dispatch({
                type: 'SET_OFFSET',
                payload: {
                  x: canvasRef.current.width / 2 - rootNode.x * scale,
                  y: canvasRef.current.height / 2 - rootNode.y * scale,
                },
              })
            }
            break
          }
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [detailNodeId, readOnly, selectedNodeId, mindmapData, scale, toggleCollapse, openNodeDetail])

    const zoomIn = () => {
      dispatch({ type: 'SET_SCALE', payload: Math.min(3, scale * 1.2) })
    }

    const zoomOut = () => {
      dispatch({ type: 'SET_SCALE', payload: Math.max(0.1, scale / 1.2) })
    }

    const resetView = () => {
      dispatch({ type: 'RESET_VIEW' })
    }

    const fitToView = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Calculate bounding box of all nodes
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

      Object.values(mindmapData.nodes).forEach(node => {
        minX = Math.min(minX, node.x)
        minY = Math.min(minY, node.y)
        maxX = Math.max(maxX, node.x)
        maxY = Math.max(maxY, node.y)
      })

      const padding = 100
      const contentWidth = maxX - minX + padding * 2
      const contentHeight = maxY - minY + padding * 2

      const scaleX = canvas.width / contentWidth
      const scaleY = canvas.height / contentHeight
      const newScale = Math.min(scaleX, scaleY, 1)

      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2

      dispatch({ type: 'SET_SCALE', payload: newScale })
      dispatch({
        type: 'SET_OFFSET',
        payload: {
          x: canvas.width / 2 - centerX * newScale,
          y: canvas.height / 2 - centerY * newScale,
        },
      })
    }

    const detailNode = detailNodeId ? mindmapData.nodes[detailNodeId] ?? null : null

    const breadcrumbPath = useMemo((): MindmapNode[] => {
      const path: MindmapNode[] = []
      const targetId = selectedNodeId ?? mindmapData.rootId
      let current = targetId ? mindmapData.nodes[targetId] : undefined
      const visited = new Set<string>()

      while (current && !visited.has(current.id)) {
        path.push(current)
        visited.add(current.id)
        if (!current.parentId) break
        current = mindmapData.nodes[current.parentId]
      }

      return path.reverse()
    }, [mindmapData, selectedNodeId])

    const handleBreadcrumbClick = useCallback(
      (nodeId: string) => {
        if (!mindmapData.nodes[nodeId]) return
        dispatch({ type: 'SET_SELECTED_NODE_ID', payload: nodeId })
        dispatch({ type: 'CLOSE_DETAIL' })
      },
      [mindmapData]
    )

    const handleMiniMapClick = useCallback(
      (event: React.MouseEvent<HTMLCanvasElement>) => {
        event.preventDefault()
        const transform = miniMapTransformRef.current
        const miniCanvas = miniMapCanvasRef.current
        const mainCanvas = canvasRef.current
        if (!transform || !miniCanvas || !mainCanvas) return

        const rect = miniCanvas.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return

        const pointerX = event.clientX - rect.left
        const pointerY = event.clientY - rect.top

        const worldX = (pointerX - transform.offsetX) / transform.scale + transform.minX
        const worldY = (pointerY - transform.offsetY) / transform.scale + transform.minY

        dispatch({
          type: 'SET_OFFSET',
          payload: {
            x: mainCanvas.width / 2 - worldX * scale,
            y: mainCanvas.height / 2 - worldY * scale,
          },
        })
      },
      [scale]
    )

    return (
      <div className="relative w-full h-full" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={handleWheel}
          className="w-full h-full touch-none"
          style={{ 
            cursor: draggingNodeId ? 'grabbing' : isPanning ? 'grabbing' : isHoveringEmptySpace ? 'grab' : 'default', 
            touchAction: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          }}
        />

        {breadcrumbPath.length > 0 && (
          <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
            <nav className="flex flex-wrap items-center justify-center gap-1 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm backdrop-blur">
              {breadcrumbPath.map((node, index) => {
                const isActive = index === breadcrumbPath.length - 1
                return (
                  <React.Fragment key={node.id}>
                    <button
                      type="button"
                      onClick={() => handleBreadcrumbClick(node.id)}
                      disabled={isActive}
                      className={`max-w-[160px] truncate transition-colors ${
                        isActive ? 'cursor-default text-alpine-600' : 'hover:text-alpine-600'
                      }`}
                      title={node.text}
                    >
                      {node.text}
                    </button>
                    {index < breadcrumbPath.length - 1 && <span className="text-slate-300">/</span>}
                  </React.Fragment>
                )
              })}
            </nav>
          </div>
        )}

        {/* Toolbar */}
        {!readOnly && (
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 bg-white rounded-lg shadow-lg p-1.5 border border-gray-200">
            <button
              onClick={addChildNode}
              disabled={!selectedNodeId}
              className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Add child node (selected node must be selected)"
            >
              <Plus size={20} />
            </button>
            <button
              onClick={deleteNode}
              disabled={!selectedNodeId || selectedNodeId === mindmapData.rootId}
              className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-red-600"
              title="Delete node"
            >
              <Trash2 size={20} />
            </button>
            <button
              onClick={() => toggleCollapse()}
              disabled={!selectedNodeId || mindmapData.nodes[selectedNodeId]?.children.length === 0}
              className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Collapse/Expand node"
            >
              {selectedNodeId && mindmapData.nodes[selectedNodeId]?.collapsed ? <Plus size={20} /> : <Minus size={20} />}
            </button>
            <div className="h-px bg-gray-200 my-1" />
            <button
              onClick={zoomIn}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Zoom in"
            >
              <ZoomIn size={20} />
            </button>
            <button
              onClick={zoomOut}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Zoom out"
            >
              <ZoomOut size={20} />
            </button>
            <button
              onClick={resetView}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Reset view"
            >
              <RotateCcw size={20} />
            </button>
            <button
              onClick={fitToView}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Fit to view"
            >
              <Maximize2 size={20} />
            </button>
          </div>
        )}

        {/* Node detail view */}
        {detailNodeId && detailDraft && detailNode && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-3">
            <div
              className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-start justify-between gap-4 px-5 py-3 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                    <Edit2 size={18} />
                    Node Details
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mt-1 leading-tight break-words">
                    {detailNode.text}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                      Children: {detailNode.children.length}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                      Attachments: {detailDraft.attachments.length}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                      Position: {Math.round(detailNode.x)}, {Math.round(detailNode.y)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={closeNodeDetail}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                  aria-label="Close node detail"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="mindmap-node-title">
                    Title
                  </label>
                  <input
                    id="mindmap-node-title"
                    type="text"
                    value={detailDraft.text}
                    onChange={(e) =>
                      dispatch({ type: 'UPDATE_DETAIL_DRAFT', payload: { text: e.target.value } })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
                    placeholder="Node title"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="mindmap-node-description">
                    Description
                  </label>
                  <textarea
                    id="mindmap-node-description"
                    value={detailDraft.description}
                    onChange={(e) =>
                      dispatch({ type: 'UPDATE_DETAIL_DRAFT', payload: { description: e.target.value } })
                    }
                    rows={5}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
                    placeholder="Add more context, notes, or action items"
                  />
                </div>

                <div className="space-y-3">
                  <span className="text-sm font-medium text-slate-700">Accent color</span>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_COLORS.map((color) => {
                      const isActive = detailDraft.color === color
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() =>
                            dispatch({ type: 'UPDATE_DETAIL_DRAFT', payload: { color } })
                          }
                          className={`h-9 w-9 rounded-full border-2 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-alpine-400 ${
                            isActive ? 'border-slate-900 scale-105' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Set node color ${color}`}
                        />
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Attachments</span>
                    <span className="text-xs text-slate-400">Drop in image URLs or external resources</span>
                  </div>

                  {detailDraft.attachments.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No attachments yet. Add an image or link below to enrich this idea.
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      {detailDraft.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                        >
                          {attachment.type === 'image' ? (
                            <div className="h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-white">
                              <img
                                src={attachment.url}
                                alt={attachment.label}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400">
                              ↗
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-slate-700 truncate">{attachment.label}</p>
                              <span className="text-xs uppercase tracking-wide text-slate-400">{attachment.type}</span>
                            </div>
                            <a
                              href={attachment.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-alpine-600 hover:underline break-all"
                            >
                              {attachment.url}
                            </a>
                          </div>
                          <button
                            onClick={() => removeAttachmentFromDraft(attachment.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                            aria-label="Remove attachment"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,0.7fr)_auto]">
                    <input
                      type="text"
                      value={newAttachmentInput.label}
                      onChange={(e) =>
                        dispatch({ type: 'SET_NEW_ATTACHMENT_INPUT', payload: { ...newAttachmentInput, label: e.target.value } })
                      }
                      placeholder="Attachment label"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
                    />
                    <input
                      type="url"
                      value={newAttachmentInput.url}
                      onChange={(e) =>
                        dispatch({ type: 'SET_NEW_ATTACHMENT_INPUT', payload: { ...newAttachmentInput, url: e.target.value } })
                      }
                      placeholder="https://example.com/image.png"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
                    />
                    <select
                      value={newAttachmentInput.type}
                      onChange={(e) =>
                        dispatch({
                          type: 'SET_NEW_ATTACHMENT_INPUT',
                          payload: { ...newAttachmentInput, type: e.target.value === 'link' ? 'link' : 'image' },
                        })
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
                    >
                      <option value="image">Image</option>
                      <option value="link">Link</option>
                    </select>
                    <button
                      onClick={addAttachmentToDraft}
                      disabled={!newAttachmentInput.url.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-alpine-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-alpine-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
                <button
                  onClick={closeNodeDetail}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} />
                  Close
                </button>
                <button
                  onClick={saveNodeDetail}
                  className="inline-flex items-center gap-2 rounded-lg bg-alpine-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-alpine-700 transition-colors"
                >
                  <Check size={16} />
                  Save changes
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-4 left-4 z-10">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-lg backdrop-blur">
            <canvas
              ref={miniMapCanvasRef}
              onClick={handleMiniMapClick}
              className="block h-32 w-48 cursor-pointer rounded-lg bg-slate-900/30"
            />
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-600">Mini-map</span>
              <span className="flex-1 truncate text-right">
                {selectedNodeId ? mindmapData.nodes[selectedNodeId]?.text : 'No selection'}
              </span>
            </div>
          </div>
        </div>

        {/* Info overlay */}
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 border border-gray-200 text-sm">
          <div className="text-gray-600">
            <div>Zoom: {Math.round(scale * 100)}%</div>
            {selectedNodeId && (
              <div className="mt-1 text-alpine-600 font-medium">
                Selected: {mindmapData.nodes[selectedNodeId]?.text}
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
              <div className="font-medium mb-1">Navigation:</div>
              <div>Drag empty space to pan</div>
              <div>Scroll to zoom</div>
              <div>←↑ Parent • →↓ Child</div>
              <div>Tab: Next sibling</div>
              <div>Home: Center on root</div>
            </div>
          </div>
        </div>
      </div>
    )
  }
)

MindmapEditor.displayName = 'MindmapEditor'

export default MindmapEditor
