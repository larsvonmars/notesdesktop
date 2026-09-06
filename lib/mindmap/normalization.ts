// ============================================================================
// Mindmap — data normalization / migration
// ============================================================================

import type { MindmapAttachment, MindmapData, MindmapEdge, MindmapEdgeMeta, MindmapNode } from './types'
import { DEFAULT_COLORS } from './constants'

export const createDefaultMindmap = (): MindmapData => {
  const rootId = 'root'
  return {
    rootId,
    customEdges: [],
    parentEdgeMeta: {},
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

export const normalizeMindmapData = (input?: MindmapData | null): MindmapData => {
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

  const rawCustomEdges: Array<MindmapEdge | null> = Array.isArray(input.customEdges)
    ? input.customEdges
        .map((edge) => {
          if (!edge || typeof edge !== 'object') return null
          const id = typeof edge.id === 'string' && edge.id.trim() ? edge.id : `edge-${Date.now()}-${Math.random()}`
          const fromNodeId = typeof edge.fromNodeId === 'string' ? edge.fromNodeId : ''
          const toNodeId = typeof edge.toNodeId === 'string' ? edge.toNodeId : ''
          if (!normalizedNodes[fromNodeId] || !normalizedNodes[toNodeId] || fromNodeId === toNodeId) return null
          return {
            id,
            fromNodeId,
            toNodeId,
            title: typeof edge.title === 'string' ? edge.title : '',
            style: {
              color: typeof edge.style?.color === 'string' ? edge.style.color : undefined,
              width: Number.isFinite(edge.style?.width) ? Math.max(1, Math.min(8, Number(edge.style?.width))) : undefined,
              lineType:
                edge.style?.lineType === 'solid' || edge.style?.lineType === 'dashed' || edge.style?.lineType === 'dotted'
                  ? edge.style.lineType
                  : undefined,
              opacity: Number.isFinite(edge.style?.opacity)
                ? Math.max(0.1, Math.min(1, Number(edge.style?.opacity)))
                : undefined,
              arrowType:
                edge.style?.arrowType === 'none' || edge.style?.arrowType === 'standard' || edge.style?.arrowType === 'filled'
                  ? edge.style.arrowType
                  : undefined,
            },
          }
        })
    : []

  const normalizedCustomEdges: MindmapEdge[] = rawCustomEdges.filter(
    (edge): edge is MindmapEdge => edge !== null
  )

  const dedupedEdgeKeys = new Set<string>()
  const dedupedCustomEdges = normalizedCustomEdges.filter((edge) => {
    const key = `${edge.fromNodeId}->${edge.toNodeId}`
    if (dedupedEdgeKeys.has(key)) return false
    dedupedEdgeKeys.add(key)
    return true
  })

  const normalizedParentEdgeMeta: Record<string, MindmapEdgeMeta> = {}
  if (input.parentEdgeMeta && typeof input.parentEdgeMeta === 'object') {
    Object.entries(input.parentEdgeMeta).forEach(([childId, meta]) => {
      if (!normalizedNodes[childId] || !normalizedNodes[childId].parentId) return
      normalizedParentEdgeMeta[childId] = {
        title: typeof meta?.title === 'string' ? meta.title : '',
        style: {
          color: typeof meta?.style?.color === 'string' ? meta.style.color : undefined,
          width: Number.isFinite(meta?.style?.width) ? Math.max(1, Math.min(8, Number(meta?.style?.width))) : undefined,
          lineType:
            meta?.style?.lineType === 'solid' || meta?.style?.lineType === 'dashed' || meta?.style?.lineType === 'dotted'
              ? meta.style.lineType
              : undefined,
          opacity: Number.isFinite(meta?.style?.opacity) ? Math.max(0.1, Math.min(1, Number(meta?.style?.opacity))) : undefined,
          arrowType:
            meta?.style?.arrowType === 'none' || meta?.style?.arrowType === 'standard' || meta?.style?.arrowType === 'filled'
              ? meta.style.arrowType
              : undefined,
        },
      }
    })
  }

  return {
    rootId: rootNode.id,
    nodes: normalizedNodes,
    customEdges: dedupedCustomEdges,
    parentEdgeMeta: normalizedParentEdgeMeta,
  }
}
