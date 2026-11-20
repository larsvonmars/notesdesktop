import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BASE_CHAT_TOOLS } from '@/lib/chat/tools'
import { supabase } from './__mocks__/supabase.mock'

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

describe('chat mindmap tools', () => {
  beforeEach(() => {
    supabase.__resetMockState()
    supabase.__mockState.notes.push({
      id: 'mindmap-1',
      title: 'Project map',
      note_type: 'mindmap',
      user_id: 'user-1',
      folder_id: null,
      project_id: null,
      position: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      content: JSON.stringify({
        rootId: 'root',
        nodes: {
          root: {
            id: 'root',
            text: 'Project',
            x: 400,
            y: 300,
            parentId: null,
            children: ['planning'],
            collapsed: false,
            color: '#3B82F6',
            description: '',
            attachments: [],
          },
          planning: {
            id: 'planning',
            text: 'Planning',
            x: 200,
            y: 300,
            parentId: 'root',
            children: [],
            collapsed: false,
            color: '#10B981',
            description: 'Initial plan',
            attachments: [],
          },
        },
        customEdges: [{ id: 'edge-1', fromNodeId: 'root', toNodeId: 'planning', title: 'related' }],
        parentEdgeMeta: {},
      }),
    })
  })

  it('reads stable node ids and edits mindmap nodes without discarding graph edges', async () => {
    const read = await BASE_CHAT_TOOLS.read_note.execute(
      { noteId: 'mindmap-1' },
      { userId: 'user-1' },
    )
    expect(read).toContain('[node id: planning]')

    const result = await BASE_CHAT_TOOLS.update_mindmap_note.execute(
      {
        noteId: 'mindmap-1',
        nodeUpdates: [{ nodeId: 'planning', description: 'Updated plan' }],
        addBranches: [{ parentId: 'planning', text: 'Milestones' }],
      },
      { userId: 'user-1' },
    )

    expect(result).toContain('1 node edited')
    expect(result).toContain('1 branch node added')
    const saved = JSON.parse(supabase.__mockState.notes[0].content)
    expect(saved.nodes.planning.description).toBe('Updated plan')
    expect(saved.nodes.planning.children).toHaveLength(1)
    expect(saved.customEdges).toEqual([
      { id: 'edge-1', fromNodeId: 'root', toNodeId: 'planning', title: 'related', style: {} },
    ])
  })
})
