import { describe, expect, it } from 'vitest'
import {
  layoutMindmap,
  normalizeMindmapData,
  NODE_HEIGHT,
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

/** root → (a → (a1, a2), b → (b1, b2)) */
function makeTree(): MindmapData {
  return normalizeMindmapData({
    rootId: 'root',
    nodes: {
      root: makeNode({ id: 'root', text: 'Root', x: 500, y: 400, children: ['a', 'b'] }),
      a: makeNode({ id: 'a', text: 'A', parentId: 'root', children: ['a1', 'a2'] }),
      b: makeNode({ id: 'b', text: 'B', parentId: 'root', children: ['b1', 'b2'] }),
      a1: makeNode({ id: 'a1', text: 'A1', parentId: 'a' }),
      a2: makeNode({ id: 'a2', text: 'A2', parentId: 'a' }),
      b1: makeNode({ id: 'b1', text: 'B1', parentId: 'b' }),
      b2: makeNode({ id: 'b2', text: 'B2', parentId: 'b' }),
    },
  })
}

const LEAVES = ['a1', 'a2', 'b1', 'b2']

describe('mindmap layoutMindmap — tidy left-to-right', () => {
  it('keeps the root in place by default', () => {
    const data = makeTree()
    const positions = layoutMindmap(data, { direction: 'lr' })
    expect(positions.root).toEqual({ x: 500, y: 400 })
  })

  it('moves the root to the requested center when preserveRoot is false', () => {
    const data = makeTree()
    const positions = layoutMindmap(data, { direction: 'lr', preserveRoot: false, center: { x: 0, y: 0 } })
    expect(positions.root).toEqual({ x: 0, y: 0 })
  })

  it('increases x strictly with tree depth (left-to-right)', () => {
    const data = makeTree()
    const positions = layoutMindmap(data, { direction: 'lr' })

    expect(positions.a.x).toBeGreaterThan(positions.root.x)
    expect(positions.b.x).toBeGreaterThan(positions.root.x)
    expect(positions.a1.x).toBeGreaterThan(positions.a.x)
    expect(positions.b2.x).toBeGreaterThan(positions.b.x)
  })

  it('orders leaves top-to-bottom without overlap', () => {
    const data = makeTree()
    const positions = layoutMindmap(data, { direction: 'lr' })

    const leafYs = LEAVES.map((id) => positions[id].y)
    const sorted = [...leafYs].sort((a, b) => a - b)
    expect(leafYs).toEqual(sorted)

    for (let i = 1; i < leafYs.length; i += 1) {
      expect(leafYs[i] - leafYs[i - 1]).toBeGreaterThanOrEqual(NODE_HEIGHT - 0.001)
    }
  })

  it('centres each parent over its children', () => {
    const data = makeTree()
    const positions = layoutMindmap(data, { direction: 'lr' })

    expect(positions.a.y).toBeCloseTo((positions.a1.y + positions.a2.y) / 2, 5)
    expect(positions.b.y).toBeCloseTo((positions.b1.y + positions.b2.y) / 2, 5)
    expect(positions.root.y).toBeCloseTo((positions.a.y + positions.b.y) / 2, 5)
  })

  it('keeps every node at the same depth vertically separated', () => {
    const data = makeTree()
    const positions = layoutMindmap(data, { direction: 'lr', siblingGap: 10 })

    const byDepth = new Map<number, { id: string; y: number }[]>()
    for (const [id, pos] of Object.entries(positions)) {
      const depth = data.nodes[id] ? computeDepth(data, id) : 0
      const bucket = byDepth.get(depth) ?? []
      bucket.push({ id, y: pos.y })
      byDepth.set(depth, bucket)
    }

    byDepth.forEach((nodes) => {
      const ys = nodes.map((n) => n.y).sort((a, b) => a - b)
      for (let i = 1; i < ys.length; i += 1) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(NODE_HEIGHT - 0.001)
      }
    })
  })
})

describe('mindmap layoutMindmap — preservation & radial', () => {
  it('keeps preserved nodes fixed and translates their subtrees as a unit', () => {
    const data = makeTree()
    data.nodes.a.x = 9000
    data.nodes.a.y = -7000

    const positions = layoutMindmap(data, { direction: 'lr', preserve: ['a'] })

    expect(positions.a).toEqual({ x: 9000, y: -7000 })

    // a1/a2 must keep their relative offsets to 'a'.
    const withoutPreserve = layoutMindmap(data, { direction: 'lr' })
    const deltaA = {
      x: positions.a.x - withoutPreserve.a.x,
      y: positions.a.y - withoutPreserve.a.y,
    }
    expect(positions.a1.x).toBeCloseTo(withoutPreserve.a1.x + deltaA.x, 5)
    expect(positions.a1.y).toBeCloseTo(withoutPreserve.a1.y + deltaA.y, 5)
  })

  it('produces finite positions for a radial layout at the right ring radius', () => {
    const data = makeTree()
    const levelGap = 220
    const positions = layoutMindmap(data, { direction: 'radial', levelGap })

    for (const id of Object.keys(data.nodes)) {
      expect(Number.isFinite(positions[id].x)).toBe(true)
      expect(Number.isFinite(positions[id].y)).toBe(true)
    }

    for (const childId of ['a', 'b']) {
      const dx = positions[childId].x - positions.root.x
      const dy = positions[childId].y - positions.root.y
      expect(Math.hypot(dx, dy)).toBeCloseTo(levelGap, 5)
    }
  })

  it('keeps the root fixed for radial layout too', () => {
    const data = makeTree()
    const positions = layoutMindmap(data, { direction: 'radial' })
    expect(positions.root).toEqual({ x: 500, y: 400 })
  })
})

function computeDepth(data: MindmapData, nodeId: string): number {
  let depth = 0
  let current = data.nodes[nodeId]
  while (current?.parentId) {
    depth += 1
    current = data.nodes[current.parentId]
  }
  return depth
}
