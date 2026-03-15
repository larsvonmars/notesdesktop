import { describe, expect, it } from 'vitest'
import { hitTestConnectionEdge, normalizeMindmapData, type MindmapData } from '../components/MindmapEditor'

describe('mindmap connection normalization', () => {
  it('normalizes legacy data with missing connection fields', () => {
    const legacy = {
      rootId: 'root',
      nodes: {
        root: {
          id: 'root',
          text: 'Root',
          x: 0,
          y: 0,
          parentId: null,
          children: ['a'],
          collapsed: false,
          color: '#3B82F6',
          description: '',
          attachments: [],
        },
        a: {
          id: 'a',
          text: 'A',
          x: 100,
          y: 20,
          parentId: 'root',
          children: [],
          collapsed: false,
          color: '#10B981',
          description: '',
          attachments: [],
        },
      },
    } satisfies MindmapData

    const normalized = normalizeMindmapData(legacy)

    expect(normalized.customEdges).toEqual([])
    expect(normalized.parentEdgeMeta).toEqual({})
    expect(normalized.rootId).toBe('root')
  })

  it('drops invalid and duplicate custom edges', () => {
    const raw = {
      rootId: 'root',
      nodes: {
        root: {
          id: 'root',
          text: 'Root',
          x: 0,
          y: 0,
          parentId: null,
          children: ['a', 'b'],
          collapsed: false,
          color: '#3B82F6',
          description: '',
          attachments: [],
        },
        a: {
          id: 'a',
          text: 'A',
          x: 100,
          y: 30,
          parentId: 'root',
          children: [],
          collapsed: false,
          color: '#10B981',
          description: '',
          attachments: [],
        },
        b: {
          id: 'b',
          text: 'B',
          x: 160,
          y: -30,
          parentId: 'root',
          children: [],
          collapsed: false,
          color: '#F59E0B',
          description: '',
          attachments: [],
        },
      },
      customEdges: [
        { id: 'good-1', fromNodeId: 'a', toNodeId: 'b', title: 'A to B' },
        { id: 'dup-2', fromNodeId: 'a', toNodeId: 'b', title: 'duplicate' },
        { id: 'self', fromNodeId: 'a', toNodeId: 'a', title: 'self' },
        { id: 'missing', fromNodeId: 'a', toNodeId: 'missing', title: 'broken' },
      ],
    } as unknown as MindmapData

    const normalized = normalizeMindmapData(raw)

    expect(normalized.customEdges).toHaveLength(1)
    expect(normalized.customEdges?.[0].id).toBe('good-1')
    expect(normalized.customEdges?.[0].fromNodeId).toBe('a')
    expect(normalized.customEdges?.[0].toNodeId).toBe('b')
  })
})

describe('mindmap connection hit testing', () => {
  it('detects straight edge hits', () => {
    const point = { x: 50, y: 2 }
    const hit = hitTestConnectionEdge(point, { x: 0, y: 0 }, { x: 100, y: 0 }, 4, false)
    expect(hit).toBe(true)
  })

  it('detects curved edge hits near arc but not on baseline', () => {
    const nearArcPoint = { x: 50, y: 15 }
    const farFromCurvePoint = { x: 50, y: -20 }

    const curvedHit = hitTestConnectionEdge(nearArcPoint, { x: 0, y: 0 }, { x: 100, y: 0 }, 8, true)
    const curvedMiss = hitTestConnectionEdge(farFromCurvePoint, { x: 0, y: 0 }, { x: 100, y: 0 }, 6, true)

    expect(curvedHit).toBe(true)
    expect(curvedMiss).toBe(false)
  })
})
