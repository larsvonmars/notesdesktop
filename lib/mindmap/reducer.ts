// ============================================================================
// Mindmap — editor state reducer
// ============================================================================

import type {
  AttachmentInput,
  MindmapData,
  MindmapEdge,
  MindmapEdgeMeta,
  MindmapNode,
  NodeDetailDraft,
  Point,
} from './types'
import { normalizeMindmapData } from './normalization'

export interface EditorState {
  mindmapData: MindmapData
  scale: number
  offset: Point
  selectedNodeId: string | null
  selectedEdgeId: string | null
  connectionMode: boolean
  connectionStartNodeId: string | null
  detailNodeId: string | null
  detailDraft: NodeDetailDraft | null
  newAttachmentInput: AttachmentInput
  draggingNodeId: string | null
  dragStart: Point | null
  isPanning: boolean
  panStart: Point | null
  isHoveringEmptySpace: boolean
}

export type EditorAction =
  | { type: 'SET_MINDMAP_DATA'; payload: MindmapData }
  | { type: 'UPDATE_NODE'; payload: { nodeId: string; updates: Partial<MindmapNode> } }
  | { type: 'UPDATE_NODES'; payload: { [nodeId: string]: Partial<MindmapNode> } }
  | { type: 'ADD_NODE'; payload: { parentId: string; node: MindmapNode } }
  | { type: 'DELETE_NODE'; payload: { nodeId: string; parentId: string } }
  | { type: 'SET_SCALE'; payload: number }
  | { type: 'SET_OFFSET'; payload: Point }
  | { type: 'SET_SELECTED_NODE_ID'; payload: string | null }
  | { type: 'SET_SELECTED_EDGE_ID'; payload: string | null }
  | { type: 'SET_CONNECTION_MODE'; payload: boolean }
  | { type: 'SET_CONNECTION_START_NODE_ID'; payload: string | null }
  | { type: 'UPSERT_CUSTOM_EDGE'; payload: MindmapEdge }
  | { type: 'UPDATE_CUSTOM_EDGE'; payload: { edgeId: string; updates: Partial<MindmapEdgeMeta> } }
  | { type: 'DELETE_CUSTOM_EDGE'; payload: { edgeId: string } }
  | { type: 'UPDATE_PARENT_EDGE_META'; payload: { childId: string; updates: Partial<MindmapEdgeMeta> } }
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

export const DEFAULT_ATTACHMENT_INPUT: AttachmentInput = { label: '', url: '', type: 'image' }

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
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

      const nextCustomEdges = (state.mindmapData.customEdges ?? []).filter(
        (edge) => !nodesToRemove.has(edge.fromNodeId) && !nodesToRemove.has(edge.toNodeId)
      )

      const nextParentEdgeMeta: Record<string, MindmapEdgeMeta> = {}
      Object.entries(state.mindmapData.parentEdgeMeta ?? {}).forEach(([childId, meta]) => {
        if (!nodesToRemove.has(childId)) {
          nextParentEdgeMeta[childId] = meta
        }
      })

      const nextSelectedEdgeId =
        state.selectedEdgeId &&
        (state.selectedEdgeId.startsWith('custom:')
          ? nextCustomEdges.some((edge) => `custom:${edge.id}` === state.selectedEdgeId)
          : state.selectedEdgeId.startsWith('parent:')
            ? Boolean(nextParentEdgeMeta[state.selectedEdgeId.slice(7)] || newNodes[state.selectedEdgeId.slice(7)])
            : false)
          ? state.selectedEdgeId
          : null

      return {
        ...state,
        mindmapData: {
          ...state.mindmapData,
          nodes: newNodes,
          customEdges: nextCustomEdges,
          parentEdgeMeta: nextParentEdgeMeta,
        },
        selectedNodeId: null,
        selectedEdgeId: nextSelectedEdgeId,
      }
    }

    case 'SET_SCALE':
      return { ...state, scale: action.payload }

    case 'SET_OFFSET':
      return { ...state, offset: action.payload }

    case 'SET_SELECTED_NODE_ID':
      return {
        ...state,
        selectedNodeId: action.payload,
        selectedEdgeId: action.payload ? null : state.selectedEdgeId,
      }

    case 'SET_SELECTED_EDGE_ID':
      return {
        ...state,
        selectedEdgeId: action.payload,
        selectedNodeId: action.payload ? null : state.selectedNodeId,
      }

    case 'SET_CONNECTION_MODE':
      return {
        ...state,
        connectionMode: action.payload,
        connectionStartNodeId: action.payload ? state.connectionStartNodeId : null,
      }

    case 'SET_CONNECTION_START_NODE_ID':
      return { ...state, connectionStartNodeId: action.payload }

    case 'UPSERT_CUSTOM_EDGE': {
      const nextEdges = [...(state.mindmapData.customEdges ?? [])]
      const existingIndex = nextEdges.findIndex((edge) => edge.id === action.payload.id)
      if (existingIndex >= 0) {
        nextEdges[existingIndex] = { ...nextEdges[existingIndex], ...action.payload }
      } else {
        nextEdges.push(action.payload)
      }
      return {
        ...state,
        mindmapData: {
          ...state.mindmapData,
          customEdges: nextEdges,
        },
      }
    }

    case 'UPDATE_CUSTOM_EDGE': {
      const nextEdges = (state.mindmapData.customEdges ?? []).map((edge) => {
        if (edge.id !== action.payload.edgeId) return edge
        return {
          ...edge,
          ...action.payload.updates,
          style: {
            ...edge.style,
            ...(action.payload.updates.style ?? {}),
          },
        }
      })
      return {
        ...state,
        mindmapData: {
          ...state.mindmapData,
          customEdges: nextEdges,
        },
      }
    }

    case 'DELETE_CUSTOM_EDGE': {
      const nextEdges = (state.mindmapData.customEdges ?? []).filter((edge) => edge.id !== action.payload.edgeId)
      return {
        ...state,
        mindmapData: {
          ...state.mindmapData,
          customEdges: nextEdges,
        },
        selectedEdgeId: state.selectedEdgeId === `custom:${action.payload.edgeId}` ? null : state.selectedEdgeId,
      }
    }

    case 'UPDATE_PARENT_EDGE_META': {
      const currentMeta = state.mindmapData.parentEdgeMeta?.[action.payload.childId] ?? {}
      const nextMeta: MindmapEdgeMeta = {
        ...currentMeta,
        ...action.payload.updates,
        style: {
          ...currentMeta.style,
          ...(action.payload.updates.style ?? {}),
        },
      }

      return {
        ...state,
        mindmapData: {
          ...state.mindmapData,
          parentEdgeMeta: {
            ...(state.mindmapData.parentEdgeMeta ?? {}),
            [action.payload.childId]: nextMeta,
          },
        },
      }
    }

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
      // Fires on every pointer-move while hovering; returning a fresh state
      // object here would re-render the whole canvas component for no visual
      // change. Bail out when the value is unchanged.
      if (state.isHoveringEmptySpace === action.payload) return state
      return { ...state, isHoveringEmptySpace: action.payload }

    case 'RESET_VIEW':
      return { ...state, scale: 1, offset: { x: 0, y: 0 } }

    case 'RESET_ALL':
      return {
        ...state,
        mindmapData: action.payload,
        selectedNodeId: action.payload.rootId,
        selectedEdgeId: null,
        connectionMode: false,
        connectionStartNodeId: null,
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

export function createInitialState(initialData?: MindmapData): EditorState {
  const mindmapData = normalizeMindmapData(initialData)
  return {
    mindmapData,
    scale: 1,
    offset: { x: 0, y: 0 },
    selectedNodeId: null,
    selectedEdgeId: null,
    connectionMode: false,
    connectionStartNodeId: null,
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
