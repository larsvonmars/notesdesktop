'use client'

import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo, useReducer } from 'react'
import { useTheme } from '../lib/theme-context'
import { useIsMobile } from '../lib/useIsMobile'

import {
  calculateRenderPosition,
  collectVisibleNodeIds,
  COLLAPSE_ANIMATION_DURATION,
  computeNodeMetrics,
  createDefaultMindmap,
  createEmptyLayoutSnapshot,
  createInitialState,
  customEdgeId,
  DEFAULT_ATTACHMENT_INPUT,
  DEFAULT_COLORS,
  drawEdge,
  drawEdgeTitle,
  drawNodeBody,
  EDGE_DEFAULTS,
  editorReducer,
  getCanvasContext,
  getCanvasTheme,
  getDevicePixelRatio,
  getLinkedTextNoteIdFromAttachments,
  getNodeConnectionPoint,
  getTextNoteIdFromAttachment,
  hitTestConnectionEdge,
  htmlToPlainText,
  isCustomEdgeSelection,
  isParentEdgeSelection,
  layoutMindmap,
  mergeEdgeStyle,
  MIN_NODE_WIDTH,
  NODE_HEIGHT,
  normalizeMindmapData,
  parentEdgeId,
  updateSnapshotBounds,
  withLinkedTextNoteAttachment,
  type AttachmentInput,
  type EdgeHit,
  type LayoutSnapshot,
  type MindmapAttachment,
  type MindmapArrowType,
  type MindmapData,
  type MindmapEdgeMeta,
  type MindmapEditorHandle,
  type MindmapEditorProps,
  type MindmapLayoutDirection,
  type MindmapLineType,
  type MindmapNode,
  type NodeDetailDraft,
  type NodeHit,
  type Point,
} from '../lib/mindmap'

import MindmapContextMenu from './mindmap/MindmapContextMenu'
import MindmapEdgePanel from './mindmap/MindmapEdgePanel'
import MindmapExportDialog from './mindmap/MindmapExportDialog'
import MindmapInfoOverlay from './mindmap/MindmapInfoOverlay'
import MindmapMinimap from './mindmap/MindmapMinimap'
import MindmapNodeDetailPanel from './mindmap/MindmapNodeDetailPanel'
import MindmapSearchDropdown from './mindmap/MindmapSearchDropdown'
import MindmapToolbar from './mindmap/MindmapToolbar'

// Public re-exports — existing consumers import these from this file.
export { hitTestConnectionEdge, normalizeMindmapData }
export type {
  MindmapArrowType,
  MindmapAttachment,
  MindmapData,
  MindmapEdge,
  MindmapEdgeMeta,
  MindmapEdgeStyle,
  MindmapEditorHandle,
  MindmapLineType,
  MindmapNode,
} from '../lib/mindmap'


// ============================================================================
// Main Component
// ============================================================================

const MindmapEditor = forwardRef<MindmapEditorHandle, MindmapEditorProps>(
  ({
    initialData,
    onChange,
    onSelectedNodeChange,
    textNotes = [],
    onCreateTextNote,
    onOpenTextNote,
    readOnly = false,
    allowViewerControls = false,
    allowViewerSearch = false,
    defaultShowMinimap,
  }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const fitToViewImperativeRef = useRef<(() => void) | null>(null)
    const resetViewImperativeRef = useRef<(() => void) | null>(null)
    const exportImageImperativeRef = useRef<(() => void) | null>(null)
    const openSearchImperativeRef = useRef<(() => void) | null>(null)
    const toggleMinimapImperativeRef = useRef<(() => void) | null>(null)

    // Theme & mobile
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'
    const isMobile = useIsMobile()
    
    // Consolidated state using reducer
    const [state, dispatch] = useReducer(editorReducer, initialData, createInitialState)
    const {
      mindmapData,
      scale,
      offset,
      selectedNodeId,
      selectedEdgeId,
      connectionMode,
      connectionStartNodeId,
      detailNodeId,
      detailDraft,
      newAttachmentInput,
      draggingNodeId,
      dragStart,
      isPanning,
      panStart,
      isHoveringEmptySpace,
    } = state
    const [linkedTextNoteId, setLinkedTextNoteId] = React.useState<string>('')
    const [isCreatingTextNote, setIsCreatingTextNote] = React.useState(false)
    const [textNoteActionError, setTextNoteActionError] = React.useState<string | null>(null)

    // Search state
    const [searchQuery, setSearchQuery] = React.useState('')
    const [isSearchOpen, setIsSearchOpen] = React.useState(false)
    const canShowViewerControls = readOnly && allowViewerControls
    const showToolbar = !readOnly || canShowViewerControls
    const canSearch = !readOnly || (canShowViewerControls && allowViewerSearch)
    const canToggleMinimap = !readOnly || canShowViewerControls

    // Minimap visibility toggle (default hidden on mobile)
    const [showMinimap, setShowMinimap] = React.useState(
      defaultShowMinimap ?? !isMobile
    )
    const [useCurvedEdges, setUseCurvedEdges] = React.useState(false)

    // Auto-layout state
    const [layoutDirection, setLayoutDirection] = React.useState<MindmapLayoutDirection>('lr')
    const [preserveManualPositions, setPreserveManualPositions] = React.useState(false)
    const [isLayoutMenuOpen, setIsLayoutMenuOpen] = React.useState(false)
    const manuallyPositionedRef = useRef<Set<string>>(new Set())

    // Info panel visibility
    const [showInfo, setShowInfo] = React.useState(true)
    const [sheetDragOffset, setSheetDragOffset] = React.useState(0)
    const [isSheetDragging, setIsSheetDragging] = React.useState(false)

    // Context menu state
    const [contextMenu, setContextMenu] = React.useState<{ nodeId: string; x: number; y: number } | null>(null)

    // Export dialog state
    const [isExportDialogOpen, setIsExportDialogOpen] = React.useState(false)
    const [exportScale, setExportScale] = React.useState<number>(2)
    const [exportFormat, setExportFormat] = React.useState<'png' | 'jpeg'>('png')
    const [exportQuality, setExportQuality] = React.useState(0.92)
    const [exportBackground, setExportBackground] = React.useState<'canvas' | 'transparent' | 'white' | 'custom'>('canvas')
    const [exportCustomBg, setExportCustomBg] = React.useState('#ffffff')
    const [exportFilename, setExportFilename] = React.useState('mindmap')
    const [isExporting, setIsExporting] = React.useState(false)
    const exportOffscreenRef = useRef<HTMLCanvasElement | null>(null)

    // Inline rename state
    const [inlineEditNodeId, setInlineEditNodeId] = React.useState<string | null>(null)
    const [inlineEditText, setInlineEditText] = React.useState('')
    const inlineEditRef = useRef<HTMLInputElement>(null)

    // Refs for values that don't need to trigger re-renders
    const skipOnChangeRef = useRef(false)
    const mindmapDataRef = useRef<MindmapData>(mindmapData)
    const animationsRef = useRef<Map<string, { direction: 'collapse' | 'expand'; startTime: number }>>(new Map())
    const animationFrameRef = useRef<number | null>(null)
    const lastRenderTimeRef = useRef<number>(performance.now())
    const dashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const renderMindmapRef = useRef<((timestamp?: number) => void) | null>(null)
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
    // Pointer tracking for multi-touch (pinch-to-zoom, two-finger pan)
    const activePointersRef = useRef<Map<number, Point>>(new Map())
    const prevPinchDistRef = useRef<number | null>(null)
    // Long-press detection (open detail on touch)
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const longPressNodeIdRef = useRef<string | null>(null)
    // Tracks whether a right-button drag (panning gesture) is in progress
    const rightButtonPanningRef = useRef(false)
    const sheetPointerIdRef = useRef<number | null>(null)
    const sheetStartYRef = useRef(0)
    const sheetStartOffsetRef = useRef(0)

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
        if (dashIntervalRef.current !== null) {
          clearInterval(dashIntervalRef.current)
          dashIntervalRef.current = null
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
        if (dashIntervalRef.current !== null) {
          clearInterval(dashIntervalRef.current)
          dashIntervalRef.current = null
        }
        dispatch({ type: 'RESET_ALL', payload: reset })
      },
      getSelectedNodeId: () => selectedNodeId,
      fitToView: () => fitToViewImperativeRef.current?.(),
      resetView: () => resetViewImperativeRef.current?.(),
      openSearch: () => openSearchImperativeRef.current?.(),
      toggleMinimap: () => toggleMinimapImperativeRef.current?.(),
      exportImage: () => exportImageImperativeRef.current?.(),
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
      // Fast path: the parent echoes back the exact object this editor emitted
      // via onChange (this happens on every pointer-move during a node drag).
      // Skip the expensive deep normalize + JSON.stringify round-trip in that
      // case — it's the hottest path in this component.
      if (initialData && initialData === mindmapDataRef.current) return

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
      if (dashIntervalRef.current !== null) {
        clearInterval(dashIntervalRef.current)
        dashIntervalRef.current = null
      }
      dispatch({ type: 'RESET_ALL', payload: nextData })
    }, [initialData])

    useEffect(() => {
      if (skipOnChangeRef.current) {
        skipOnChangeRef.current = false
        return
      }
      // Defer emitting while a node is being dragged: dragging dispatches an
      // UPDATE_NODE per pointer-move, and emitting on each move forces the
      // parent (and this component) to re-render at pointer-move rate. The
      // final position is emitted once the drag stops (draggingNodeId → null).
      if (draggingNodeId) return
      onChange?.(mindmapData)
    }, [mindmapData, onChange, draggingNodeId])
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

        const theme = getCanvasTheme(isDark)

        ctx.save()
        ctx.scale(devicePixelRatio, devicePixelRatio)
        ctx.clearRect(0, 0, styleWidth, styleHeight)
        ctx.fillStyle = theme.minimapBg
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
          ctx.strokeStyle = theme.minimapEdge
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
      [offset, scale, isDark]
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

    const hitTestEdges = useCallback(
      (worldX: number, worldY: number): EdgeHit | null => {
        const visibleNodes = collectVisibleNodeIds(mindmapData)
        const point = { x: worldX, y: worldY }
        const tolerance = Math.max(8, 8 / Math.max(scale, 0.35))
        const ctx = getCanvasContext(canvasRef.current)
        if (!ctx) return null

        // Helper to compute boundary-to-boundary connection points
        const getBoundaryPoints = (fromNode: MindmapNode, toNode: MindmapNode): [Point, Point] => {
          const fromCenter = { x: fromNode.x, y: fromNode.y }
          const toCenter = { x: toNode.x, y: toNode.y }
          const fromMetrics = computeNodeMetrics(ctx, { ...fromNode, x: fromCenter.x, y: fromCenter.y }, fromNode.id === mindmapData.rootId)
          const toMetrics = computeNodeMetrics(ctx, { ...toNode, x: toCenter.x, y: toCenter.y }, toNode.id === mindmapData.rootId)
          return [
            getNodeConnectionPoint(fromCenter, fromMetrics, toCenter),
            getNodeConnectionPoint(toCenter, toMetrics, fromCenter),
          ]
        }

        for (const edge of mindmapData.customEdges ?? []) {
          if (!visibleNodes.has(edge.fromNodeId) || !visibleNodes.has(edge.toNodeId)) continue
          const fromNode = mindmapData.nodes[edge.fromNodeId]
          const toNode = mindmapData.nodes[edge.toNodeId]
          if (!fromNode || !toNode) continue
          const [fromPoint, toPoint] = getBoundaryPoints(fromNode, toNode)
          if (hitTestConnectionEdge(point, fromPoint, toPoint, tolerance, useCurvedEdges)) {
            return { edgeId: customEdgeId(edge.id) }
          }
        }

        for (const node of Object.values(mindmapData.nodes)) {
          if (!node.parentId) continue
          if (!visibleNodes.has(node.id) || !visibleNodes.has(node.parentId)) continue
          const parent = mindmapData.nodes[node.parentId]
          if (!parent) continue
          const [fromPoint, toPoint] = getBoundaryPoints(parent, node)
          if (hitTestConnectionEdge(point, fromPoint, toPoint, tolerance, useCurvedEdges)) {
            return { edgeId: parentEdgeId(node.id) }
          }
        }

        return null
      },
      [mindmapData, scale, useCurvedEdges]
    )

    const resolveSelectedEdge = useCallback(() => {
      if (!selectedEdgeId) return null

      if (isCustomEdgeSelection(selectedEdgeId)) {
        const edgeId = selectedEdgeId.slice(7)
        const edge = (mindmapData.customEdges ?? []).find((item) => item.id === edgeId)
        if (!edge) return null
        const fromNode = mindmapData.nodes[edge.fromNodeId]
        const toNode = mindmapData.nodes[edge.toNodeId]
        if (!fromNode || !toNode) return null
        return {
          type: 'custom' as const,
          edgeId,
          selectionId: selectedEdgeId,
          fromNode,
          toNode,
          title: edge.title ?? '',
          style: mergeEdgeStyle(edge.style),
        }
      }

      if (isParentEdgeSelection(selectedEdgeId)) {
        const childId = selectedEdgeId.slice(7)
        const child = mindmapData.nodes[childId]
        if (!child?.parentId) return null
        const parent = mindmapData.nodes[child.parentId]
        if (!parent) return null
        const meta = mindmapData.parentEdgeMeta?.[childId] ?? {}
        return {
          type: 'parent' as const,
          edgeId: childId,
          selectionId: selectedEdgeId,
          fromNode: parent,
          toNode: child,
          title: meta.title ?? '',
          style: mergeEdgeStyle(meta.style),
        }
      }

      return null
    }, [mindmapData, selectedEdgeId])

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

        const canvasTheme = getCanvasTheme(isDark)

        ctx.save()
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.translate(offset.x, offset.y)
        ctx.scale(scale, scale)

        // Draw background
        ctx.fillStyle = canvasTheme.background
        ctx.fillRect(-offset.x / scale, -offset.y / scale, canvas.width / scale, canvas.height / scale)

        const layoutSnapshot = createEmptyLayoutSnapshot()
        const visibleNodes = collectVisibleNodeIds(mindmapData)
        const edgeTitlesToRender: Array<{ from: Point; to: Point; title: string; visibility: number }> = []

        // Render custom cross-node edges first so nodes stay on top.
        let hasDashAnimation = false
        ;(mindmapData.customEdges ?? []).forEach((edge) => {
          if (!visibleNodes.has(edge.fromNodeId) || !visibleNodes.has(edge.toNodeId)) return
          const fromNode = mindmapData.nodes[edge.fromNodeId]
          const toNode = mindmapData.nodes[edge.toNodeId]
          if (!fromNode || !toNode) return

          const fromCenter = { x: fromNode.x, y: fromNode.y }
          const toCenter = { x: toNode.x, y: toNode.y }

          // Compute metrics for both nodes to find connection points on their boundaries
          const fromMetrics = computeNodeMetrics(
            ctx,
            { ...fromNode, x: fromCenter.x, y: fromCenter.y },
            fromNode.id === mindmapData.rootId
          )
          const toMetrics = computeNodeMetrics(
            ctx,
            { ...toNode, x: toCenter.x, y: toCenter.y },
            toNode.id === mindmapData.rootId
          )

          // Compute connection points on node boundaries
          const fromPoint = getNodeConnectionPoint(fromCenter, fromMetrics, toCenter)
          const toPoint = getNodeConnectionPoint(toCenter, toMetrics, fromCenter)

          const selectionId = customEdgeId(edge.id)
          const lineType = edge.style?.lineType ?? EDGE_DEFAULTS.lineType
          if (lineType === 'dashed' || lineType === 'dotted') hasDashAnimation = true
          drawEdge(
            ctx,
            fromPoint,
            toPoint,
            1,
            canvasTheme.edgeColor,
            {
              title: edge.title,
              style: edge.style,
            },
            selectedEdgeId === selectionId,
            useCurvedEdges,
            fromNode.color,
            toNode.color,
            now,
          )
          if (edge.title?.trim()) {
            edgeTitlesToRender.push({
              from: fromPoint,
              to: toPoint,
              title: edge.title,
              visibility: 1,
            })
          }
          layoutSnapshot.edges.push({
            from: fromPoint,
            to: toPoint,
            visibility: 1,
          })
        })

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

          if (edgeFrom && parentNode) {
            const childMeta = mindmapData.parentEdgeMeta?.[nodeId]
            const lineType = childMeta?.style?.lineType ?? EDGE_DEFAULTS.lineType
            if (lineType === 'dashed' || lineType === 'dotted') hasDashAnimation = true

            // Compute metrics for both nodes using their current rendered positions
            const parentForMetrics: MindmapNode = { ...parentNode, x: edgeFrom.x, y: edgeFrom.y }
            const childForMetrics: MindmapNode = { ...node, x: renderPos.x, y: renderPos.y }
            const parentIsRoot = parentNode.id === mindmapData.rootId
            const childIsRoot = node.id === mindmapData.rootId
            const parentMetrics = computeNodeMetrics(ctx, parentForMetrics, parentIsRoot)
            const childMetrics = computeNodeMetrics(ctx, childForMetrics, childIsRoot)

            // Compute connection points on node boundaries
            const fromPoint = getNodeConnectionPoint(edgeFrom, parentMetrics, renderPos)
            const toPoint = getNodeConnectionPoint(renderPos, childMetrics, edgeFrom)

            drawEdge(
              ctx,
              fromPoint,
              toPoint,
              clampedVisibility,
              canvasTheme.edgeColor,
              childMeta,
              selectedEdgeId === parentEdgeId(nodeId),
              useCurvedEdges,
              parentNode.color,
              node.color,
              now,
            )
            if (childMeta?.title?.trim()) {
              edgeTitlesToRender.push({
                from: fromPoint,
                to: toPoint,
                title: childMeta.title,
                visibility: clampedVisibility,
              })
            }
            layoutSnapshot.edges.push({
              from: fromPoint,
              to: toPoint,
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
          drawNodeBody(ctx, node, metrics, isRoot, isSelected, clampedVisibility, renderPos.x, renderPos.y, canvasTheme.nodeSelectedBorder, canvasTheme.collapseIndicatorBg, canvasTheme.collapseIndicatorBgHover)

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

        // Render connection titles after nodes so labels stay readable and centered.
        edgeTitlesToRender.forEach((label) => {
          drawEdgeTitle(ctx, label.from, label.to, label.title, isDark, label.visibility, useCurvedEdges)
        })

        ctx.restore()
        renderMiniMap(layoutSnapshot)
        lastRenderTimeRef.current = now

        // Schedule next frame:
        // - Collapse/expand animations → full-speed RAF (60fps) for smooth 260ms transitions
        // - Dash-only animation → throttled interval (25fps) to avoid wasteful re-renders
        if (hasActiveAnimation) {
          // Clear any dash interval — collapse animation takes over with RAF
          if (dashIntervalRef.current !== null) {
            clearInterval(dashIntervalRef.current)
            dashIntervalRef.current = null
          }
          animationFrameRef.current = requestAnimationFrame(renderMindmap)
        } else if (hasDashAnimation) {
          // Dash-only: use throttled interval at ~25fps
          animationFrameRef.current = null
          if (dashIntervalRef.current === null) {
            dashIntervalRef.current = setInterval(() => {
              renderMindmapRef.current?.()
            }, 40)
          }
        } else {
          // No animation needed
          animationFrameRef.current = null
          if (dashIntervalRef.current !== null) {
            clearInterval(dashIntervalRef.current)
            dashIntervalRef.current = null
          }
        }
      },
      [mindmapData, offset, scale, selectedNodeId, selectedEdgeId, resolveChildrenVisibility, renderMiniMap, isDark, useCurvedEdges]
    )

    // Keep renderMindmapRef in sync so the dash interval never captures stale closures
    renderMindmapRef.current = renderMindmap

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
        if (dashIntervalRef.current !== null) {
          clearInterval(dashIntervalRef.current)
          dashIntervalRef.current = null
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


    // ── Click / double-click (work for both mouse and touch via pointer events) ──

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        collapseTargetRef.current = null
        collapsePointerStartRef.current = null
        return
      }

      const coordinates = mapClientToWorld(e.clientX, e.clientY)
      if (!coordinates) return

      const hit = hitTestNodes(coordinates.worldX, coordinates.worldY)
      const edgeHit = hit ? null : hitTestEdges(coordinates.worldX, coordinates.worldY)

      if (!hit && edgeHit) {
        dispatch({ type: 'SET_SELECTED_EDGE_ID', payload: edgeHit.edgeId })
        dispatch({ type: 'SET_CONNECTION_START_NODE_ID', payload: null })
        collapseTargetRef.current = null
        collapsePointerStartRef.current = null
        return
      }

      if (!hit) {
        dispatch({ type: 'SET_SELECTED_EDGE_ID', payload: null })
        if (connectionMode) {
          dispatch({ type: 'SET_CONNECTION_START_NODE_ID', payload: null })
        }
        collapseTargetRef.current = null
        collapsePointerStartRef.current = null
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
        dispatch({ type: 'SET_SELECTED_EDGE_ID', payload: null })
        if (connectionMode && !readOnly) {
          if (!connectionStartNodeId) {
            dispatch({ type: 'SET_CONNECTION_START_NODE_ID', payload: hit.nodeId })
            dispatch({ type: 'SET_SELECTED_NODE_ID', payload: hit.nodeId })
            return
          }

          if (connectionStartNodeId === hit.nodeId) {
            dispatch({ type: 'SET_CONNECTION_START_NODE_ID', payload: null })
            dispatch({ type: 'SET_SELECTED_NODE_ID', payload: hit.nodeId })
            return
          }

          const duplicate = (mindmapData.customEdges ?? []).some(
            (edge) => edge.fromNodeId === connectionStartNodeId && edge.toNodeId === hit.nodeId
          )

          if (!duplicate) {
            const newEdgeId = `edge-${Date.now()}`
            dispatch({
              type: 'UPSERT_CUSTOM_EDGE',
              payload: {
                id: newEdgeId,
                fromNodeId: connectionStartNodeId,
                toNodeId: hit.nodeId,
                title: '',
                style: {},
              },
            })
            dispatch({ type: 'SET_SELECTED_EDGE_ID', payload: customEdgeId(newEdgeId) })
          }

          dispatch({ type: 'SET_CONNECTION_START_NODE_ID', payload: hit.nodeId })
          dispatch({ type: 'SET_SELECTED_NODE_ID', payload: hit.nodeId })
          return
        }

        if (readOnly) {
          openNodeDetail(hit.nodeId)
        } else {
          dispatch({ type: 'SET_SELECTED_NODE_ID', payload: hit.nodeId })
        }
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
        startInlineEdit(hit.nodeId)
      }
    }

    // ── Right-click context menu ──

    const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      // Suppress context menu if the right button was used to pan
      if (rightButtonPanningRef.current) {
        rightButtonPanningRef.current = false
        return
      }
      if (readOnly) return

      const coordinates = mapClientToWorld(e.clientX, e.clientY)
      if (!coordinates) return

      const hit = hitTestNodes(coordinates.worldX, coordinates.worldY)
      const edgeHit = hit ? null : hitTestEdges(coordinates.worldX, coordinates.worldY)
      if (hit?.area === 'body') {
        dispatch({ type: 'SET_SELECTED_NODE_ID', payload: hit.nodeId })
        const rect = containerRef.current?.getBoundingClientRect()
        const menuX = rect ? e.clientX - rect.left : e.clientX
        const menuY = rect ? e.clientY - rect.top : e.clientY
        setContextMenu({ nodeId: hit.nodeId, x: menuX, y: menuY })
      } else if (edgeHit) {
        dispatch({ type: 'SET_SELECTED_EDGE_ID', payload: edgeHit.edgeId })
        setContextMenu(null)
      } else {
        setContextMenu(null)
      }
    }

    // ── Inline rename ──

    const startInlineEdit = useCallback((nodeId: string) => {
      const node = mindmapData.nodes[nodeId]
      if (!node || readOnly) return
      setContextMenu(null)
      setInlineEditNodeId(nodeId)
      setInlineEditText(node.text)
      // Focus will happen via useEffect when the input mounts
    }, [mindmapData.nodes, readOnly])

    const commitInlineEdit = useCallback(() => {
      if (!inlineEditNodeId) return
      const trimmed = inlineEditText.trim() || 'Untitled Node'
      dispatch({
        type: 'UPDATE_NODE',
        payload: { nodeId: inlineEditNodeId, updates: { text: trimmed } },
      })
      setInlineEditNodeId(null)
      setInlineEditText('')
    }, [inlineEditNodeId, inlineEditText])

    const cancelInlineEdit = useCallback(() => {
      setInlineEditNodeId(null)
      setInlineEditText('')
    }, [])

    // Focus the inline edit input when it appears
    useEffect(() => {
      if (inlineEditNodeId && inlineEditRef.current) {
        inlineEditRef.current.focus()
        inlineEditRef.current.select()
      }
    }, [inlineEditNodeId])

    // Close context menu on any click outside
    useEffect(() => {
      if (!contextMenu) return
      const handleClickOutside = () => setContextMenu(null)
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setContextMenu(null)
      }
      window.addEventListener('click', handleClickOutside)
      window.addEventListener('keydown', handleKeyDown)
      return () => {
        window.removeEventListener('click', handleClickOutside)
        window.removeEventListener('keydown', handleKeyDown)
      }
    }, [contextMenu])

    // ── Long-press helpers (open detail on touch) ──

    const clearLongPress = useCallback(() => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      longPressNodeIdRef.current = null
    }, [])

    // ── Unified Pointer Events (mouse + touch + stylus) ──

    const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.setPointerCapture(e.pointerId)

      const rect = canvas.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      activePointersRef.current.set(e.pointerId, { x: screenX, y: screenY })

      // Right mouse button → always pan (regardless of what was hit)
      if (e.button === 2) {
        rightButtonPanningRef.current = false // reset; will be set true on first move
        dispatch({ type: 'START_PANNING', payload: { x: screenX - offset.x, y: screenY - offset.y } })
        return
      }

      // Two fingers active → cancel single-touch interactions, start pinch
      if (activePointersRef.current.size >= 2) {
        clearLongPress()
        dispatch({ type: 'STOP_DRAGGING' })
        dispatch({ type: 'STOP_PANNING' })
        prevPinchDistRef.current = null
        suppressClickRef.current = true
        return
      }

      suppressClickRef.current = false

      const coordinates = mapClientToWorld(e.clientX, e.clientY)
      if (!coordinates) return
      const { worldX, worldY } = coordinates

      const hit = hitTestNodes(worldX, worldY)
      const edgeHit = hit ? null : hitTestEdges(worldX, worldY)

      if (hit?.area === 'collapse') {
        collapseTargetRef.current = hit.nodeId
        collapsePointerStartRef.current = { x: screenX, y: screenY }
        dispatch({ type: 'SET_SELECTED_NODE_ID', payload: hit.nodeId })
        return
      }

      collapseTargetRef.current = null
      collapsePointerStartRef.current = null

      if (hit?.nodeId) {
        dispatch({ type: 'SET_SELECTED_EDGE_ID', payload: null })
        dispatch({ type: 'SET_SELECTED_NODE_ID', payload: hit.nodeId })

        // In connect mode, clicking/tapping a node should pick source/target via click
        // rather than initiating drag behavior.
        if (connectionMode && hit.area === 'body') {
          return
        }

        if (!readOnly) {
          dispatch({ type: 'START_DRAGGING', payload: { nodeId: hit.nodeId, start: { x: screenX, y: screenY } } })

          // Long press to open detail (skip for mouse primary button)
          if (e.pointerType !== 'mouse') {
            clearLongPress()
            longPressNodeIdRef.current = hit.nodeId
            longPressTimerRef.current = setTimeout(() => {
              if (longPressNodeIdRef.current && !suppressClickRef.current) {
                openNodeDetail(longPressNodeIdRef.current)
                dispatch({ type: 'STOP_DRAGGING' })
                suppressClickRef.current = true
              }
              longPressNodeIdRef.current = null
            }, 450)
          }
        }
      } else if (edgeHit) {
        dispatch({ type: 'SET_SELECTED_EDGE_ID', payload: edgeHit.edgeId })
        dispatch({ type: 'SET_SELECTED_NODE_ID', payload: null })
      } else {
        // Empty canvas → start panning
        dispatch({ type: 'START_PANNING', payload: { x: screenX - offset.x, y: screenY - offset.y } })
      }
    }

    const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top

      // Update tracked pointer position
      activePointersRef.current.set(e.pointerId, { x: screenX, y: screenY })

      // ── Pinch-to-zoom / two-finger pan ──
      if (activePointersRef.current.size === 2) {
        const [p1, p2] = Array.from(activePointersRef.current.values())
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        const midX = (p1.x + p2.x) / 2
        const midY = (p1.y + p2.y) / 2

        if (prevPinchDistRef.current !== null) {
          const ratio = dist / prevPinchDistRef.current
          const newScale = Math.max(0.1, Math.min(3, scale * ratio))
          const worldX = (midX - offset.x) / scale
          const worldY = (midY - offset.y) / scale
          dispatch({ type: 'SET_SCALE', payload: newScale })
          dispatch({
            type: 'SET_OFFSET',
            payload: { x: midX - worldX * newScale, y: midY - worldY * newScale },
          })
        }

        prevPinchDistRef.current = dist
        suppressClickRef.current = true
        clearLongPress()
        return
      }

      prevPinchDistRef.current = null

      const coordinates = mapClientToWorld(e.clientX, e.clientY)
      if (!coordinates) return
      const { worldX, worldY } = coordinates

      if (draggingNodeId && dragStart && !readOnly) {
        const dx = (screenX - dragStart.x) / scale
        const dy = (screenY - dragStart.y) / scale

        if (!suppressClickRef.current) {
          const distance = Math.hypot(screenX - dragStart.x, screenY - dragStart.y)
          if (distance > 4) {
            suppressClickRef.current = true
            clearLongPress()
            collapseTargetRef.current = null
            collapsePointerStartRef.current = null
          }
        }

        const node = mindmapData.nodes[draggingNodeId]
        if (node) {
          dispatch({
            type: 'UPDATE_NODE',
            payload: { nodeId: draggingNodeId, updates: { x: node.x + dx, y: node.y + dy } },
          })
        }
        dispatch({ type: 'START_DRAGGING', payload: { nodeId: draggingNodeId, start: { x: screenX, y: screenY } } })
      } else if (isPanning && panStart) {
        suppressClickRef.current = true
        clearLongPress()
        collapseTargetRef.current = null
        collapsePointerStartRef.current = null
        if (e.buttons === 2) rightButtonPanningRef.current = true
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
        const hit = hitTestNodes(worldX, worldY)
        const edgeHit = hit ? null : hitTestEdges(worldX, worldY)
        dispatch({ type: 'SET_HOVERING_EMPTY_SPACE', payload: !hit && !edgeHit })
      }
    }

    const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      activePointersRef.current.delete(e.pointerId)
      prevPinchDistRef.current = null
      clearLongPress()
      if (draggingNodeId || isPanning) suppressClickRef.current = true
      if (draggingNodeId) {
        manuallyPositionedRef.current.add(draggingNodeId)
      }
      dispatch({ type: 'STOP_DRAGGING' })
      dispatch({ type: 'STOP_PANNING' })
      if (e.button === 2) rightButtonPanningRef.current = false
    }

    const handleCanvasPointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
      activePointersRef.current.delete(e.pointerId)
      prevPinchDistRef.current = null
      clearLongPress()
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

    const availableTextNotes = useMemo(
      () => [...textNotes].sort((a, b) => (a.title || '').localeCompare(b.title || '')),
      [textNotes]
    )

    const linkedTextNote = useMemo(
      () => availableTextNotes.find((note) => note.id === linkedTextNoteId) ?? null,
      [availableTextNotes, linkedTextNoteId]
    )

    const applyLinkedTextNoteToDescription = useCallback(
      (noteId: string) => {
        if (!detailDraft) return
        const linkedNote = availableTextNotes.find((note) => note.id === noteId)
        if (!linkedNote) return

        dispatch({
          type: 'UPDATE_DETAIL_DRAFT',
          payload: {
            description: htmlToPlainText(linkedNote.content || ''),
            attachments: withLinkedTextNoteAttachment(detailDraft.attachments, linkedNote),
          },
        })
        setLinkedTextNoteId(linkedNote.id)
        setTextNoteActionError(null)
      },
      [availableTextNotes, detailDraft]
    )

    const createAndLinkTextNoteFromDraft = useCallback(async () => {
      if (!detailDraft || !onCreateTextNote) return

      setIsCreatingTextNote(true)
      setTextNoteActionError(null)

      try {
        const createdNote = await onCreateTextNote({
          title: detailDraft.text.trim() || 'Untitled Node',
          description: detailDraft.description,
        })

        dispatch({
          type: 'UPDATE_DETAIL_DRAFT',
          payload: {
            description: htmlToPlainText(createdNote.content || ''),
            attachments: withLinkedTextNoteAttachment(detailDraft.attachments, createdNote),
          },
        })
        setLinkedTextNoteId(createdNote.id)
      } catch (error) {
        setTextNoteActionError(error instanceof Error ? error.message : 'Failed to create text note.')
      } finally {
        setIsCreatingTextNote(false)
      }
    }, [detailDraft, onCreateTextNote])

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

    useEffect(() => {
      if (!detailNodeId || !detailDraft) {
        setLinkedTextNoteId('')
        setTextNoteActionError(null)
        return
      }

      const linkedNoteId = getLinkedTextNoteIdFromAttachments(detailDraft.attachments)
      setLinkedTextNoteId(linkedNoteId ?? '')
      setTextNoteActionError(null)
    }, [detailNodeId, detailDraft])

    const addChildNode = useCallback(() => {
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
    }, [selectedNodeId, readOnly, mindmapData, renderMindmap])

    const deleteNode = useCallback(() => {
      if (!selectedNodeId || selectedNodeId === mindmapData.rootId || readOnly) return

      const nodeToDelete = mindmapData.nodes[selectedNodeId]
      if (!nodeToDelete?.parentId) return

      dispatch({ type: 'DELETE_NODE', payload: { nodeId: selectedNodeId, parentId: nodeToDelete.parentId } })
    }, [selectedNodeId, mindmapData, readOnly])

    const toggleCollapse = useCallback(
      (nodeId?: string) => {
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
      [selectedNodeId, mindmapData.nodes, renderMindmap]
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

        // Ignore if inline editing is active
        if (inlineEditNodeId) return

        const currentNode = selectedNodeId ? mindmapData.nodes[selectedNodeId] : null

        switch (event.key) {
          case 'ArrowLeft': {
            event.preventDefault()
            if (!currentNode) {
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: mindmapData.rootId })
              return
            }
            // Navigate to parent
            if (currentNode.parentId && mindmapData.nodes[currentNode.parentId]) {
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: currentNode.parentId })
            }
            break
          }
          case 'ArrowRight': {
            event.preventDefault()
            if (!currentNode) {
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: mindmapData.rootId })
              return
            }
            // Navigate to first visible child (auto-expand if collapsed)
            if (currentNode.children.length > 0) {
              if (currentNode.collapsed) {
                toggleCollapse(currentNode.id)
              }
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: currentNode.children[0] })
            }
            break
          }
          case 'ArrowUp': {
            event.preventDefault()
            if (!currentNode) {
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: mindmapData.rootId })
              return
            }
            // Navigate to previous sibling
            const parentUp = currentNode.parentId ? mindmapData.nodes[currentNode.parentId] : null
            if (parentUp) {
              const siblings = parentUp.children
              const idx = siblings.indexOf(currentNode.id)
              if (idx > 0) {
                dispatch({ type: 'SET_SELECTED_NODE_ID', payload: siblings[idx - 1] })
              } else {
                // Already first sibling — go to parent
                dispatch({ type: 'SET_SELECTED_NODE_ID', payload: parentUp.id })
              }
            }
            break
          }
          case 'ArrowDown': {
            event.preventDefault()
            if (!currentNode) {
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: mindmapData.rootId })
              return
            }
            // Navigate to next sibling
            const parentDown = currentNode.parentId ? mindmapData.nodes[currentNode.parentId] : null
            if (parentDown) {
              const siblings = parentDown.children
              const idx = siblings.indexOf(currentNode.id)
              if (idx < siblings.length - 1) {
                dispatch({ type: 'SET_SELECTED_NODE_ID', payload: siblings[idx + 1] })
              } else if (currentNode.children.length > 0 && !currentNode.collapsed) {
                // Last sibling — go to first child
                dispatch({ type: 'SET_SELECTED_NODE_ID', payload: currentNode.children[0] })
              }
            } else if (currentNode.children.length > 0 && !currentNode.collapsed) {
              // Root node — go to first child
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
            // Navigate to next/previous sibling (wrap)
            const parentTab = currentNode.parentId ? mindmapData.nodes[currentNode.parentId] : null
            if (parentTab) {
              const siblings = parentTab.children
              const currentIndex = siblings.indexOf(currentNode.id)
              const direction = event.shiftKey ? -1 : 1
              const nextIndex = (currentIndex + direction + siblings.length) % siblings.length
              dispatch({ type: 'SET_SELECTED_NODE_ID', payload: siblings[nextIndex] })
            } else if (currentNode.children.length > 0 && !currentNode.collapsed) {
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
          case 'F2': {
            event.preventDefault()
            if (currentNode) {
              startInlineEdit(currentNode.id)
            }
            break
          }
          case '+': 
          case '=': {
            // + key to add child node (= is the unshifted key on most keyboards)
            if (!event.ctrlKey && !event.metaKey) {
              event.preventDefault()
              addChildNode()
            }
            break
          }
          case 'Delete':
          case 'Backspace': {
            event.preventDefault()
            if (selectedEdgeId && isCustomEdgeSelection(selectedEdgeId)) {
              dispatch({ type: 'DELETE_CUSTOM_EDGE', payload: { edgeId: selectedEdgeId.slice(7) } })
            } else {
              deleteNode()
            }
            break
          }
          case ' ': {
            event.preventDefault()
            if (currentNode && currentNode.children.length > 0) {
              toggleCollapse(currentNode.id)
            }
            break
          }
          case 'Escape': {
            event.preventDefault()
            setContextMenu(null)
            dispatch({ type: 'SET_SELECTED_EDGE_ID', payload: null })
            dispatch({ type: 'SET_CONNECTION_START_NODE_ID', payload: null })
            dispatch({ type: 'SET_CONNECTION_MODE', payload: false })
            dispatch({ type: 'SET_SELECTED_NODE_ID', payload: null })
            break
          }
          case 'Home': {
            event.preventDefault()
            dispatch({ type: 'SET_SELECTED_NODE_ID', payload: mindmapData.rootId })
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
    }, [detailNodeId, readOnly, selectedNodeId, selectedEdgeId, mindmapData, scale, toggleCollapse, openNodeDetail, startInlineEdit, addChildNode, deleteNode, inlineEditNodeId])

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

    fitToViewImperativeRef.current = fitToView
    resetViewImperativeRef.current = resetView
    openSearchImperativeRef.current = () => {
      if (!canSearch) return
      setIsSearchOpen(true)
    }
    toggleMinimapImperativeRef.current = () => {
      if (!canToggleMinimap) return
      setShowMinimap((current) => !current)
    }

    const detailNode = detailNodeId ? mindmapData.nodes[detailNodeId] ?? null : null
    const selectedEdge = useMemo(() => resolveSelectedEdge(), [resolveSelectedEdge])
    const useSharedDetailLayout = readOnly && canShowViewerControls
    const useSharedDetailBottomSheet = useSharedDetailLayout && isMobile

    const updateSelectedEdgeMeta = useCallback(
      (updates: Partial<MindmapEdgeMeta>) => {
        if (!selectedEdge) return
        if (selectedEdge.type === 'custom') {
          dispatch({ type: 'UPDATE_CUSTOM_EDGE', payload: { edgeId: selectedEdge.edgeId, updates } })
          return
        }
        dispatch({ type: 'UPDATE_PARENT_EDGE_META', payload: { childId: selectedEdge.edgeId, updates } })
      },
      [selectedEdge]
    )

    const deleteSelectedCustomEdge = useCallback(() => {
      if (!selectedEdge || selectedEdge.type !== 'custom') return
      dispatch({ type: 'DELETE_CUSTOM_EDGE', payload: { edgeId: selectedEdge.edgeId } })
      dispatch({ type: 'SET_SELECTED_EDGE_ID', payload: null })
    }, [selectedEdge])

    const toggleConnectionMode = useCallback(() => {
      const nextMode = !connectionMode
      dispatch({ type: 'SET_CONNECTION_MODE', payload: nextMode })
      if (!nextMode) {
        dispatch({ type: 'SET_CONNECTION_START_NODE_ID', payload: null })
      }
    }, [connectionMode])

    const startConnectionFromNode = useCallback((nodeId: string) => {
      dispatch({ type: 'SET_CONNECTION_MODE', payload: true })
      dispatch({ type: 'SET_CONNECTION_START_NODE_ID', payload: nodeId })
      dispatch({ type: 'SET_SELECTED_NODE_ID', payload: nodeId })
      setContextMenu(null)
    }, [])

    const setNodeColor = useCallback((nodeId: string, color: string) => {
      dispatch({ type: 'UPDATE_NODE', payload: { nodeId, updates: { color } } })
      setContextMenu(null)
    }, [])

    const updateDraft = useCallback((updates: Partial<NodeDetailDraft>) => {
      dispatch({ type: 'UPDATE_DETAIL_DRAFT', payload: updates })
    }, [])

    const setAttachmentInput = useCallback((input: AttachmentInput) => {
      dispatch({ type: 'SET_NEW_ATTACHMENT_INPUT', payload: input })
    }, [])

    const openLinkedNote = useCallback(
      (noteId: string) => {
        if (!onOpenTextNote) return
        onOpenTextNote(noteId)
        closeNodeDetail()
      },
      [onOpenTextNote, closeNodeDetail]
    )

    const startSheetDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
      if (!useSharedDetailBottomSheet) return
      sheetPointerIdRef.current = event.pointerId
      sheetStartYRef.current = event.clientY
      sheetStartOffsetRef.current = sheetDragOffset
      setIsSheetDragging(true)
    }, [useSharedDetailBottomSheet, sheetDragOffset])

    const moveSheetDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
      if (!useSharedDetailBottomSheet) return
      if (!isSheetDragging || sheetPointerIdRef.current !== event.pointerId) return

      const deltaY = event.clientY - sheetStartYRef.current
      const nextOffset = Math.max(0, sheetStartOffsetRef.current + deltaY)
      setSheetDragOffset(nextOffset)
    }, [useSharedDetailBottomSheet, isSheetDragging])

    const endSheetDrag = useCallback((event?: React.PointerEvent<HTMLElement>) => {
      if (!useSharedDetailBottomSheet) return
      if (event && sheetPointerIdRef.current !== event.pointerId) return

      const dismissThreshold = 120
      const velocityThreshold = 180
      const moved = sheetDragOffset
      const quickSwipe = event ? event.movementY > velocityThreshold : false

      setIsSheetDragging(false)
      sheetPointerIdRef.current = null
      sheetStartYRef.current = 0
      sheetStartOffsetRef.current = 0

      if (moved > dismissThreshold || quickSwipe) {
        setSheetDragOffset(0)
        closeNodeDetail()
        return
      }

      setSheetDragOffset(0)
    }, [useSharedDetailBottomSheet, sheetDragOffset, closeNodeDetail])

    useEffect(() => {
      if (!useSharedDetailBottomSheet || !detailNodeId) {
        setSheetDragOffset(0)
        setIsSheetDragging(false)
        sheetPointerIdRef.current = null
      }
    }, [useSharedDetailBottomSheet, detailNodeId])

    // ── Search ──

    const searchResults = useMemo(() => {
      const q = searchQuery.trim().toLowerCase()
      if (!q) return []
      return Object.values(mindmapData.nodes).filter((node) =>
        node.text.toLowerCase().includes(q)
      )
    }, [searchQuery, mindmapData.nodes])

    const handleSearchSelect = useCallback(
      (nodeId: string) => {
        const node = mindmapData.nodes[nodeId]
        if (!node) return
        dispatch({ type: 'SET_SELECTED_NODE_ID', payload: nodeId })
        if (canvasRef.current) {
          dispatch({
            type: 'SET_OFFSET',
            payload: {
              x: canvasRef.current.width / 2 - node.x * scale,
              y: canvasRef.current.height / 2 - node.y * scale,
            },
          })
        }
        setIsSearchOpen(false)
        setSearchQuery('')
      },
      [mindmapData.nodes, scale]
    )

    // ── Export ──

    const getContentBounds = useCallback(() => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      const nodes = mindmapData.nodes
      let hasNodes = false
      for (const nodeId of Object.keys(nodes)) {
        const node = nodes[nodeId]
        if (!node) continue
        hasNodes = true
        minX = Math.min(minX, node.x)
        minY = Math.min(minY, node.y)
        maxX = Math.max(maxX, node.x)
        maxY = Math.max(maxY, node.y)
      }
      if (!hasNodes) return { minX: 0, minY: 0, maxX: 800, maxY: 600 }
      return { minX, minY, maxX, maxY }
    }, [mindmapData.nodes])

    const getExportDimensions = useCallback((scale: number) => {
      const canvas = canvasRef.current
      const viewW = canvas?.width ?? 800
      const viewH = canvas?.height ?? 600
      const maxDim = 8192 // Browser canvas size limit safety margin
      const rawW = Math.round(viewW * scale)
      const rawH = Math.round(viewH * scale)
      if (rawW <= maxDim && rawH <= maxDim) return { width: rawW, height: rawH }
      const ratio = Math.min(maxDim / rawW, maxDim / rawH)
      return { width: Math.round(rawW * ratio), height: Math.round(rawH * ratio) }
    }, [])

    const renderToOffscreenCanvas = useCallback((scale: number) => {
      const mainCanvas = canvasRef.current
      if (!mainCanvas) return null

      const { width, height } = getExportDimensions(scale)
      const offscreen = document.createElement('canvas')
      offscreen.width = width
      offscreen.height = height

      const ctx = offscreen.getContext('2d')
      if (!ctx) return null

      const canvasTheme = getCanvasTheme(isDark)
      const exportScaleFactor = width / mainCanvas.width

      // Apply the same view transform scaled to export resolution
      ctx.save()
      ctx.scale(exportScaleFactor, exportScaleFactor)
      ctx.translate(offset.x, offset.y)
      ctx.scale(scale, scale)

      // Background
      const effBg = exportBackground === 'transparent' ? null
        : exportBackground === 'white' ? '#ffffff'
        : exportBackground === 'custom' ? exportCustomBg
        : canvasTheme.background

      if (effBg) {
        ctx.fillStyle = effBg
        ctx.fillRect(-offset.x / scale, -offset.y / scale, mainCanvas.width / scale, mainCanvas.height / scale)
      }

      const visibleNodes = collectVisibleNodeIds(mindmapData)

      // Draw custom edges
      ;(mindmapData.customEdges ?? []).forEach((edge) => {
        if (!visibleNodes.has(edge.fromNodeId) || !visibleNodes.has(edge.toNodeId)) return
        const fromNode = mindmapData.nodes[edge.fromNodeId]
        const toNode = mindmapData.nodes[edge.toNodeId]
        if (!fromNode || !toNode) return

        const fromCenter = { x: fromNode.x, y: fromNode.y }
        const toCenter = { x: toNode.x, y: toNode.y }
        const fromMetrics = computeNodeMetrics(ctx, { ...fromNode, x: fromCenter.x, y: fromCenter.y }, fromNode.id === mindmapData.rootId)
        const toMetrics = computeNodeMetrics(ctx, { ...toNode, x: toCenter.x, y: toCenter.y }, toNode.id === mindmapData.rootId)
        const fromPoint = getNodeConnectionPoint(fromCenter, fromMetrics, toCenter)
        const toPoint = getNodeConnectionPoint(toCenter, toMetrics, fromCenter)

        drawEdge(ctx, fromPoint, toPoint, 1, canvasTheme.edgeColor, { title: edge.title, style: edge.style }, false, useCurvedEdges, fromNode.color, toNode.color)
      })

      // Recursive node drawing
      const drawNodeOffscreen = (nodeId: string, visibility: number, parentPosition?: Point): void => {
        const node = mindmapData.nodes[nodeId]
        if (!node || visibility <= 0) return

        const parentNode = node.parentId ? mindmapData.nodes[node.parentId] : null
        const origin = parentPosition ?? (parentNode ? { x: parentNode.x, y: parentNode.y } : undefined)
        const renderPos = calculateRenderPosition(node, visibility, origin)

        if (parentNode && origin) {
          const parentForMetrics: MindmapNode = { ...parentNode, x: origin.x, y: origin.y }
          const childForMetrics: MindmapNode = { ...node, x: renderPos.x, y: renderPos.y }
          const parentIsRoot = parentNode.id === mindmapData.rootId
          const childIsRoot = node.id === mindmapData.rootId
          const parentMetrics = computeNodeMetrics(ctx, parentForMetrics, parentIsRoot)
          const childMetrics = computeNodeMetrics(ctx, childForMetrics, childIsRoot)
          const fromPoint = getNodeConnectionPoint(origin, parentMetrics, renderPos)
          const toPoint = getNodeConnectionPoint(renderPos, childMetrics, origin)
          drawEdge(ctx, fromPoint, toPoint, visibility, canvasTheme.edgeColor, mindmapData.parentEdgeMeta?.[nodeId], false, useCurvedEdges, parentNode.color, node.color)
        }

        const isRoot = nodeId === mindmapData.rootId
        const metrics = computeNodeMetrics(ctx, { ...node, x: renderPos.x, y: renderPos.y }, isRoot)
        drawNodeBody(ctx, node, metrics, isRoot, false, visibility, renderPos.x, renderPos.y, canvasTheme.nodeSelectedBorder, canvasTheme.collapseIndicatorBg, canvasTheme.collapseIndicatorBgHover)

        node.children.forEach((childId) => {
          drawNodeOffscreen(childId, visibility, renderPos)
        })
      }

      drawNodeOffscreen(mindmapData.rootId, 1)

      ctx.restore()
      return offscreen
    }, [mindmapData, offset, scale, isDark, useCurvedEdges, exportBackground, exportCustomBg, getExportDimensions])

    const executeExport = useCallback(() => {
      setIsExporting(true)

      // Defer to next frame so the spinner renders
      requestAnimationFrame(() => {
        try {
          const mainCanvas = canvasRef.current
          if (!mainCanvas) {
            setIsExporting(false)
            return
          }

          const { width, height } = getExportDimensions(exportScale)
          const offscreen = renderToOffscreenCanvas(exportScale)
          if (!offscreen) {
            setIsExporting(false)
            return
          }

          const mimeType = exportFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
          const quality = exportFormat === 'jpeg' ? exportQuality : undefined
          const ext = exportFormat === 'jpeg' ? 'jpg' : 'png'

          if (offscreen.toBlob) {
            offscreen.toBlob((blob) => {
              if (!blob) { setIsExporting(false); return }
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${exportFilename || 'mindmap'}.${ext}`
              a.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
              setIsExporting(false)
            }, mimeType, quality)
          } else {
            // Fallback for older browsers
            const url = offscreen.toDataURL(mimeType, quality)
            const a = document.createElement('a')
            a.href = url
            a.download = `${exportFilename || 'mindmap'}.${ext}`
            a.click()
            setIsExporting(false)
          }
        } catch {
          setIsExporting(false)
        }
      })
    }, [exportScale, exportFormat, exportQuality, exportFilename, getExportDimensions, renderToOffscreenCanvas])

    const openExportDialog = useCallback(() => {
      fitToView()
      // Default to 2x for crisp exports
      setExportScale(2)
      setExportFormat('png')
      setExportQuality(0.92)
      setExportBackground('canvas')
      setExportCustomBg('#ffffff')
      setExportFilename('mindmap')
      setIsExporting(false)
      setIsExportDialogOpen(true)
    }, [fitToView])
    exportImageImperativeRef.current = openExportDialog

    const getEstimatedFileSize = useCallback(() => {
      const { width, height } = getExportDimensions(exportScale)
      const rawBytes = width * height * 4
      if (exportFormat === 'jpeg') {
        const factor = 0.03 + exportQuality * 0.17
        return rawBytes * factor
      }
      return rawBytes * 0.4
    }, [exportScale, exportFormat, exportQuality, getExportDimensions])

    // ── Auto-layout ──

    const autoLayout = useCallback(() => {
      if (readOnly) return
      const updates = layoutMindmap(mindmapData, {
        direction: layoutDirection,
        preserveRoot: true,
        preserve: preserveManualPositions ? Array.from(manuallyPositionedRef.current) : undefined,
      })
      dispatch({ type: 'UPDATE_NODES', payload: updates })
    }, [readOnly, mindmapData, layoutDirection, preserveManualPositions])

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
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerCancel}
          onContextMenu={handleCanvasContextMenu}
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
          <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 max-w-[55%] overflow-hidden">
            <nav className="flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 shadow-sm  overflow-x-auto">
              {breadcrumbPath.map((node, index) => {
                const isActive = index === breadcrumbPath.length - 1
                return (
                  <React.Fragment key={node.id}>
                    <button
                      type="button"
                      onClick={() => handleBreadcrumbClick(node.id)}
                      disabled={isActive}
                      className={`max-w-[120px] truncate transition-colors shrink-0 ${
                        isActive ? 'cursor-default text-alpine-600' : 'hover:text-alpine-600'
                      }`}
                      title={node.text}
                    >
                      {node.text}
                    </button>
                    {index < breadcrumbPath.length - 1 && <span className="text-slate-300 dark:text-slate-600 shrink-0">/</span>}
                  </React.Fragment>
                )
              })}
            </nav>
          </div>
        )}

        {connectionMode && !readOnly && (
          <div className="absolute top-3 right-3 z-10 rounded-full border border-alpine-200 bg-alpine-50 px-3 py-1.5 text-xs font-semibold text-alpine-700 dark:border-alpine-900/40 dark:bg-alpine-900/30 dark:text-alpine-300">
            Connect mode {connectionStartNodeId ? `• from ${mindmapData.nodes[connectionStartNodeId]?.text ?? 'node'}` : '• select source'}
          </div>
        )}

        {/* Toolbar */}
        {showToolbar && (
          <MindmapToolbar
            readOnly={readOnly}
            selectedNodeId={selectedNodeId}
            mindmapData={mindmapData}
            connectionMode={connectionMode}
            useCurvedEdges={useCurvedEdges}
            isSearchOpen={isSearchOpen}
            isLayoutMenuOpen={isLayoutMenuOpen}
            canSearch={canSearch}
            canToggleMinimap={canToggleMinimap}
            showMinimap={showMinimap}
            layoutDirection={layoutDirection}
            onAddChild={addChildNode}
            onDelete={deleteNode}
            onToggleCollapse={() => toggleCollapse()}
            onToggleConnectionMode={toggleConnectionMode}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onResetView={resetView}
            onFitToView={fitToView}
            onToggleCurvedEdges={() => setUseCurvedEdges((current) => !current)}
            onToggleSearch={() => setIsSearchOpen((v) => !v)}
            onAutoLayout={autoLayout}
            onToggleLayoutMenu={() => setIsLayoutMenuOpen((v) => !v)}
            onExport={openExportDialog}
            onToggleMinimap={() => setShowMinimap((v) => !v)}
          />
        )}

        {/* Search dropdown */}
        {isSearchOpen && canSearch && (
          <MindmapSearchDropdown
            query={searchQuery}
            results={searchResults}
            onQueryChange={setSearchQuery}
            onClear={() => setSearchQuery('')}
            onSelect={handleSearchSelect}
          />
        )}

        {/* Layout options dropdown */}
        {isLayoutMenuOpen && !readOnly && (
          <div className="absolute top-3 left-16 z-20 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-3 space-y-3">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Layout direction</span>
            <div className="grid grid-cols-2 gap-1.5">
              {(['lr', 'radial'] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  onClick={() => setLayoutDirection(direction)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    layoutDirection === direction
                      ? 'bg-alpine-500 text-white'
                      : 'border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {direction === 'lr' ? 'Left-to-right' : 'Radial'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={preserveManualPositions}
                onChange={(event) => setPreserveManualPositions(event.target.checked)}
                className="h-3.5 w-3.5 accent-alpine-500"
              />
              Preserve manually placed nodes
            </label>
            <button
              type="button"
              onClick={() => {
                autoLayout()
                setIsLayoutMenuOpen(false)
              }}
              className="w-full rounded-lg bg-alpine-600 px-3 py-2 text-xs font-semibold text-white hover:bg-alpine-700 transition-colors"
            >
              Apply layout
            </button>
          </div>
        )}

        {/* Node detail view */}
        {selectedEdge && !detailNodeId && (
          <MindmapEdgePanel
            edge={selectedEdge}
            readOnly={readOnly}
            onClose={() => dispatch({ type: 'SET_SELECTED_EDGE_ID', payload: null })}
            onUpdateMeta={updateSelectedEdgeMeta}
            onResetStyle={() => updateSelectedEdgeMeta({ title: '', style: {} })}
            onDelete={deleteSelectedCustomEdge}
          />
        )}

        {detailNodeId && detailDraft && detailNode && (
          <MindmapNodeDetailPanel
            node={detailNode}
            draft={detailDraft}
            readOnly={readOnly}
            useSharedDetailLayout={useSharedDetailLayout}
            useSharedDetailBottomSheet={useSharedDetailBottomSheet}
            isSheetDragging={isSheetDragging}
            sheetDragOffset={sheetDragOffset}
            linkedTextNoteId={linkedTextNoteId}
            availableTextNotes={availableTextNotes}
            isCreatingTextNote={isCreatingTextNote}
            textNoteActionError={textNoteActionError}
            newAttachmentInput={newAttachmentInput}
            onClose={closeNodeDetail}
            onUpdateDraft={updateDraft}
            onSetAttachmentInput={setAttachmentInput}
            onLinkedTextNoteChange={setLinkedTextNoteId}
            onAddAttachment={addAttachmentToDraft}
            onRemoveAttachment={removeAttachmentFromDraft}
            onSave={saveNodeDetail}
            onApplyLinkedNote={applyLinkedTextNoteToDescription}
            onOpenLinkedNote={openLinkedNote}
            onCreateLinkedNote={() => void createAndLinkTextNoteFromDraft()}
            onStartSheetDrag={startSheetDrag}
            onMoveSheetDrag={moveSheetDrag}
            onEndSheetDrag={endSheetDrag}
          />
        )}

        {showMinimap && (
          <MindmapMinimap
            canvasRef={miniMapCanvasRef}
            selectedText={selectedNodeId ? mindmapData.nodes[selectedNodeId]?.text ?? null : null}
            onClick={handleMiniMapClick}
            onClose={() => setShowMinimap(false)}
          />
        )}

        {/* Inline rename overlay */}
        {inlineEditNodeId && mindmapData.nodes[inlineEditNodeId] && (() => {
          const editNode = mindmapData.nodes[inlineEditNodeId]
          const screenX = editNode.x * scale + offset.x
          const screenY = editNode.y * scale + offset.y
          const isRoot = inlineEditNodeId === mindmapData.rootId
          const fontSize = isRoot ? 16 * scale : 14 * scale
          const inputWidth = Math.max(MIN_NODE_WIDTH * scale, 160)
          return (
            <>
              {/* Click-away backdrop */}
              <div
                className="absolute inset-0 z-30"
                onClick={(e) => {
                  e.stopPropagation()
                  commitInlineEdit()
                }}
              />
              <input
                ref={inlineEditRef}
                type="text"
                value={inlineEditText}
                onChange={(e) => setInlineEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitInlineEdit()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelInlineEdit()
                  }
                  e.stopPropagation()
                }}
                onBlur={commitInlineEdit}
                className="absolute z-40 rounded-lg border-2 border-alpine-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1 shadow-xl outline-none ring-2 ring-alpine-300 dark:ring-alpine-600"
                style={{
                  left: screenX - inputWidth / 2,
                  top: screenY - (NODE_HEIGHT * scale) / 2,
                  width: inputWidth,
                  height: NODE_HEIGHT * scale,
                  fontSize: Math.max(fontSize, 12),
                  textAlign: 'center',
                  fontWeight: isRoot ? 'bold' : 'normal',
                }}
              />
            </>
          )
        })()}

        {/* Right-click context menu */}
        {contextMenu && mindmapData.nodes[contextMenu.nodeId] && (() => {
          const ctxNode = mindmapData.nodes[contextMenu.nodeId]
          const isRoot = contextMenu.nodeId === mindmapData.rootId
          const hasChildren = ctxNode.children.length > 0
          return (
            <MindmapContextMenu
              node={ctxNode}
              isRoot={isRoot}
              hasChildren={hasChildren}
              x={contextMenu.x}
              y={contextMenu.y}
              onAddChild={() => { addChildNode(); setContextMenu(null) }}
              onRename={() => { startInlineEdit(contextMenu.nodeId); setContextMenu(null) }}
              onEditDetails={() => { openNodeDetail(contextMenu.nodeId); setContextMenu(null) }}
              onStartConnection={() => startConnectionFromNode(contextMenu.nodeId)}
              onToggleCollapse={() => { toggleCollapse(contextMenu.nodeId); setContextMenu(null) }}
              onSetColor={(color) => setNodeColor(contextMenu.nodeId, color)}
              onDelete={() => { deleteNode(); setContextMenu(null) }}
            />
          )
        })()}

        {/* Info overlay */}
        {showInfo && (
          <MindmapInfoOverlay
            scale={scale}
            selectedText={selectedNodeId ? mindmapData.nodes[selectedNodeId]?.text ?? null : null}
            isMobile={isMobile}
            onClose={() => setShowInfo(false)}
          />
        )}

        {/* ── Export Dialog ── */}
        <MindmapExportDialog
          open={isExportDialogOpen}
          filename={exportFilename}
          format={exportFormat}
          scale={exportScale}
          quality={exportQuality}
          background={exportBackground}
          customBg={exportCustomBg}
          isExporting={isExporting}
          getDimensions={getExportDimensions}
          getEstimatedSize={getEstimatedFileSize}
          onClose={() => setIsExportDialogOpen(false)}
          onFilenameChange={setExportFilename}
          onFormatChange={setExportFormat}
          onScaleChange={setExportScale}
          onQualityChange={setExportQuality}
          onBackgroundChange={setExportBackground}
          onCustomBgChange={setExportCustomBg}
          onExport={executeExport}
        />
      </div>
    )
  }
)

MindmapEditor.displayName = 'MindmapEditor'

export default MindmapEditor
