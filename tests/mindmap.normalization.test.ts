import { describe, expect, it } from 'vitest'
import { normalizeMindmapData, type MindmapData } from '@/lib/mindmap'

describe('mindmap normalization', () => {
  it('returns a default map for empty / invalid input', () => {
    expect(normalizeMindmapData(null).rootId).toBe('root')
    expect(normalizeMindmapData(undefined).nodes.root.text).toBe('Central Idea')
    expect(normalizeMindmapData({} as MindmapData).rootId).toBe('root')
    expect(normalizeMindmapData({ rootId: 'missing', nodes: {} } as unknown as MindmapData).rootId).toBe('root')
  })

  it('fills in sensible defaults for malformed nodes', () => {
    const data = normalizeMindmapData({
      rootId: 'root',
      nodes: {
        root: {
          id: 'root',
          text: '   ', // blank → fallback
          x: NaN as unknown as number,
          y: 'bad' as unknown as number,
          parentId: null,
          children: ['ghost', 'root'], // missing + self references are dropped
          collapsed: false,
          color: '',
          description: 42 as unknown as string,
          attachments: [
            { id: 'ok', label: 'L', url: 'https://x', type: 'link' },
            { id: 'broken', url: '' },
          ],
        },
      },
    } as unknown as MindmapData)

    const root = data.nodes.root
    expect(root.text).toBe('New Node')
    expect(root.x).toBe(0)
    expect(root.y).toBe(0)
    expect(root.color).toBe('#3B82F6')
    expect(root.description).toBe('')
    expect(root.children).toEqual([])
    expect(root.attachments).toHaveLength(1)
    expect(root.attachments[0].label).toBe('L')
  })

  it('re-parents children based on the children arrays', () => {
    const data = normalizeMindmapData({
      rootId: 'root',
      nodes: {
        root: { id: 'root', text: 'Root', x: 0, y: 0, parentId: null, children: ['a'], collapsed: false, color: '#000', description: '', attachments: [] },
        a: { id: 'a', text: 'A', x: 0, y: 0, parentId: 'wrong', children: [], collapsed: false, color: '#000', description: '', attachments: [] },
      },
    })

    expect(data.nodes.a.parentId).toBe('root')
    expect(data.nodes.root.parentId).toBeNull()
  })

  it('clamps edge style values to safe ranges', () => {
    const data = normalizeMindmapData({
      rootId: 'root',
      nodes: {
        root: { id: 'root', text: 'R', x: 0, y: 0, parentId: null, children: ['a'], collapsed: false, color: '#000', description: '', attachments: [] },
        a: { id: 'a', text: 'A', x: 0, y: 0, parentId: 'root', children: [], collapsed: false, color: '#000', description: '', attachments: [] },
      },
      customEdges: [
        { id: 'e', fromNodeId: 'root', toNodeId: 'a', style: { width: 999, opacity: 99, lineType: 'weird' as never } },
      ],
    } as unknown as MindmapData)

    const edge = data.customEdges?.[0]
    expect(edge?.style?.width).toBe(8)
    expect(edge?.style?.opacity).toBe(1)
    expect(edge?.style?.lineType).toBeUndefined()
  })

  it('drops self-referencing and cross-missing-node edges', () => {
    const data = normalizeMindmapData({
      rootId: 'root',
      nodes: {
        root: { id: 'root', text: 'R', x: 0, y: 0, parentId: null, children: ['a'], collapsed: false, color: '#000', description: '', attachments: [] },
        a: { id: 'a', text: 'A', x: 0, y: 0, parentId: 'root', children: [], collapsed: false, color: '#000', description: '', attachments: [] },
      },
      customEdges: [
        { id: 'e1', fromNodeId: 'root', toNodeId: 'root' },
        { id: 'e2', fromNodeId: 'root', toNodeId: 'ghost' },
        { id: 'e3', fromNodeId: 'root', toNodeId: 'a' },
      ],
    } as unknown as MindmapData)

    expect(data.customEdges).toHaveLength(1)
    expect(data.customEdges?.[0].id).toBe('e3')
  })
})
