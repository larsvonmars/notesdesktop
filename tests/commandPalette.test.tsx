import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import CommandPalette, { type CommandPaletteProps } from '@/components/CommandPalette'
import type { NoteSummary } from '@/lib/notes'
import type { FolderNode } from '@/lib/folders'
import type { Project } from '@/lib/projects'

const notes: NoteSummary[] = [
  {
    id: 'note-1',
    title: 'Weekly Review',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    user_id: 'user-1',
    folder_id: 'folder-1',
    project_id: null,
    position: 0,
    note_type: 'rich-text',
  },
]

const folders: FolderNode[] = [
  {
    id: 'folder-1',
    user_id: 'user-1',
    name: 'Work',
    parent_id: null,
    project_id: null,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    expanded: true,
    children: [],
  },
]

const projects: Project[] = [
  {
    id: 'project-1',
    user_id: 'user-1',
    name: 'Launch Plan',
    description: null,
    color: '#22c55e',
    position: 0,
    quick_links: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
]

const baseProps: CommandPaletteProps = {
  isOpen: true,
  onClose: () => {},
  notes,
  folders,
  projects,
  onSelectNote: () => {},
  onSearchNotes: async () => [],
  onSelectFolder: () => {},
  onOpenProject: () => {},
  onCreateNote: () => {},
  onOpenHome: () => {},
  onOpenFiles: () => {},
  onOpenSettings: () => {},
  onOpenShortcuts: () => {},
}

describe('CommandPalette', () => {
  it('renders nothing while closed', () => {
    const html = renderToStaticMarkup(React.createElement(CommandPalette, { ...baseProps, isOpen: false }))
    expect(html).toBe('')
  })

  it('renders notes, folders, projects and create actions', () => {
    const html = renderToStaticMarkup(React.createElement(CommandPalette, baseProps))

    expect(html).toContain('Search notes, folders, projects')
    expect(html).toContain('Weekly Review')
    expect(html).toContain('Work')
    expect(html).toContain('Launch Plan')
    expect(html).toContain('New Mind Map')
    expect(html).toContain('Open Settings')
  })
})
