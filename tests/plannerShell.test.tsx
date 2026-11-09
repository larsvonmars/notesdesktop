import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

import TasksView from '@/components/TasksView'
import ToastProvider from '@/components/ToastProvider'

describe('Planner shell', () => {
  it('renders the planner header and sections', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <TasksView notes={[]} projects={[]} onSelectNote={() => {}} onOpenProject={() => {}} />
      </ToastProvider>,
    )

    expect(html).toContain('Planner')
    expect(html).toContain('Overview')
    expect(html).toContain('Calendar')
    expect(html).toContain('Timetable')
    expect(html).toContain('Smart plan')
    expect(html).toContain('aria-label="Loading planner"')
  })

  it('renders the planner navigation inside a right-hand sidebar', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <TasksView notes={[]} projects={[]} onSelectNote={() => {}} onOpenProject={() => {}} />
      </ToastProvider>,
    )

    expect(html).toContain('aria-label="Planner navigation"')
    expect(html).toContain('Your work')
    expect(html).toContain('Schedule')
    expect(html).toContain('Starred')
    expect(html).toContain('Alt+2')
    expect(html).toContain('Collapse planner sidebar')
    expect(html).toContain('Sections')
  })
})
