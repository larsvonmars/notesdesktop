import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  editorReducer,
  type EditorState,
  type MindmapData,
  type MindmapNode,
} from '@/lib/mindmap'

function makeNode(overrides: Partial<MindmapNode> & { id: string }): MindmapNode {
  return {
    text: overrides.id,
    x: 0,
    y: 0,
    parentId: null,
    children: [],
    collapsed: false,
    color: '#3B82F6',
    description: '',
    attachments: [],
    ...overrides,
  }
}

function makeData(): MindmapData {
  return {
    rootId: 'root',
    customEdges: [],
    parentEdgeMeta: {},
    nodes: {
      root: makeNode({ id: 'root', text: 'Root', children: ['a', 'b'] }),
      a: makeNode({ id: 'a', text: 'A', parentId: 'root', children: ['c'] }),
      b: makeNode({ id: 'b', text: 'B', parentId: 'root' }),
      c: makeNode({ id: 'c', text: 'C', parentId: 'a' }),
    },
  }
}

describe('mindmap editorReducer', () => {
  it('normalizes the initial data on createInitialState', () => {
    const state = createInitialState(makeData())
    expect(state.mindmapData.rootId).toBe('root')
    expect(state.mindmapData.customEdges).toEqual([])
    expect(state.mindmapData.parentEdgeMeta).toEqual({})
    expect(state.scale).toBe(1)
    expect(state.selectedNodeId).toBeNull()
  })

  it('adds a child node and auto-expands a collapsed parent', () => {
    const state: EditorState = {
      ...createInitialState(makeData()),
      mindmapData: {
        ...makeData(),
        nodes: { ...makeData().nodes, b: { ...makeData().nodes.b, collapsed: true } },
      },
    }

    const child = makeNode({ id: 'd', text: 'D', parentId: 'b' })
    const next = editorReducer(state, { type: 'ADD_NODE', payload: { parentId: 'b', node: child } })

    expect(next.mindmapData.nodes.d).toEqual(child)
    expect(next.mindmapData.nodes.b.children).toContain('d')
    expect(next.mindmapData.nodes.b.collapsed).toBe(false)
  })

  it('deletes a node together with its descendants and dangling edges', () => {
    const data = makeData()
    data.customEdges = [
      { id: 'e1', fromNodeId: 'a', toNodeId: 'b', title: '' },
      { id: 'e2', fromNodeId: 'c', toNodeId: 'b', title: '' },
    ]
    data.parentEdgeMeta = { a: { title: 'parent-a' }, c: { title: 'parent-c' } }

    const state = createInitialState(data)
    const next = editorReducer(state, { type: 'DELETE_NODE', payload: { nodeId: 'a', parentId: 'root' } })

    expect(next.mindmapData.nodes.a).toBeUndefined()
    expect(next.mindmapData.nodes.c).toBeUndefined() // descendant removed too
    expect(next.mindmapData.nodes.root.children).toEqual(['b'])
    // both edges reference a removed node (a or its descendant c), so both drop
    expect(next.mindmapData.customEdges).toEqual([])
    expect(next.mindmapData.parentEdgeMeta).toEqual({})
    expect(next.selectedNodeId).toBeNull()
  })

  it('updates a single node immutably', () => {
    const state = createInitialState(makeData())
    const before = state.mindmapData.nodes.a
    const next = editorReducer(state, { type: 'UPDATE_NODE', payload: { nodeId: 'a', updates: { text: 'Alpha', color: '#000000' } } })

    expect(next.mindmapData.nodes.a.text).toBe('Alpha')
    expect(next.mindmapData.nodes.a.color).toBe('#000000')
    expect(next.mindmapData.nodes.a).not.toBe(before)
    expect(state.mindmapData.nodes.a.text).toBe('A') // original untouched
  })

  it('bulk-updates several nodes at once', () => {
    const state = createInitialState(makeData())
    const next = editorReducer(state, {
      type: 'UPDATE_NODES',
      payload: { a: { x: 10, y: 20 }, b: { x: 30, y: 40 } },
    })

    expect(next.mindmapData.nodes.a).toMatchObject({ x: 10, y: 20 })
    expect(next.mindmapData.nodes.b).toMatchObject({ x: 30, y: 40 })
  })

  it('upserts, updates and deletes custom edges', () => {
    const state = createInitialState(makeData())

    const upserted = editorReducer(state, {
      type: 'UPSERT_CUSTOM_EDGE',
      payload: { id: 'x', fromNodeId: 'a', toNodeId: 'b', title: 'relates' },
    })
    expect(upserted.mindmapData.customEdges).toHaveLength(1)

    const updated = editorReducer(upserted, {
      type: 'UPDATE_CUSTOM_EDGE',
      payload: { edgeId: 'x', updates: { style: { lineType: 'dashed', width: 4 } } },
    })
    expect(updated.mindmapData.customEdges?.[0].style).toMatchObject({ lineType: 'dashed', width: 4 })

    const deleted = editorReducer(updated, { type: 'DELETE_CUSTOM_EDGE', payload: { edgeId: 'x' } })
    expect(deleted.mindmapData.customEdges).toHaveLength(0)
  })

  it('updates parent edge metadata', () => {
    const state = createInitialState(makeData())
    const next = editorReducer(state, {
      type: 'UPDATE_PARENT_EDGE_META',
      payload: { childId: 'a', updates: { title: 'root → a', style: { color: '#FF0000' } } },
    })

    expect(next.mindmapData.parentEdgeMeta?.a).toMatchObject({
      title: 'root → a',
      style: { color: '#FF0000' },
    })
  })

  it('bails out on unchanged hover state (same reference returned)', () => {
    const state = createInitialState(makeData())
    const next = editorReducer(state, { type: 'SET_HOVERING_EMPTY_SPACE', payload: false })
    expect(next).toBe(state)
  })

  it('selecting a node clears edge selection and vice versa', () => {
    const state = createInitialState(makeData())
    const withEdge = editorReducer(state, { type: 'SET_SELECTED_EDGE_ID', payload: 'custom:1' })
    expect(withEdge.selectedEdgeId).toBe('custom:1')
    expect(withEdge.selectedNodeId).toBeNull()

    const withNode = editorReducer(withEdge, { type: 'SET_SELECTED_NODE_ID', payload: 'a' })
    expect(withNode.selectedNodeId).toBe('a')
    expect(withNode.selectedEdgeId).toBeNull()
  })
})
