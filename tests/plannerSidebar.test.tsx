import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PlannerSidebar, {
  PlannerSidebarDrawer,
  type PlannerSidebarCounts,
} from '@/components/planner/PlannerSidebar'

const counts: PlannerSidebarCounts = {
  open: 7,
  starred: 2,
  projects: 3,
  upcomingEvents: 4,
  overdue: 1,
  dueToday: 2,
  freeHours: 6,
  activePlanProgress: 40,
}

const noop = () => {}

describe('PlannerSidebar', () => {
  it('renders grouped navigation, badges and the daily summary', () => {
    const html = renderToStaticMarkup(
      <PlannerSidebar
        activeSection="calendar"
        counts={counts}
        collapsed={false}
        onToggleCollapsed={noop}
        onSelect={noop}
        onNewTask={noop}
        onNewEvent={noop}
      />,
    )

    expect(html).toContain('aria-label="Planner navigation"')
    for (const label of ['Overview', 'Tasks', 'Projects', 'Starred', 'Calendar', 'Timetable', 'Smart plan']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('Your work')
    expect(html).toContain('Schedule')
    expect(html).toContain('Today')
    expect(html).toContain('Overdue')
    expect(html).toContain('Free focus')
    expect(html).toContain('6h')
    expect(html).toContain('40%')
    expect(html).toContain('Collapse planner sidebar')
  })

  it('collapses into an icon rail', () => {
    const html = renderToStaticMarkup(
      <PlannerSidebar
        activeSection="tasks"
        counts={counts}
        collapsed
        onToggleCollapsed={noop}
        onSelect={noop}
        onNewTask={noop}
        onNewEvent={noop}
      />,
    )

    expect(html).toContain('w-[64px]')
    expect(html).toContain('Expand planner sidebar')
    // Labels are replaced with icon-only buttons (still present in tooltips).
    expect(html).not.toContain('>Smart plan<')
    expect(html).not.toContain('Free focus')
    expect(html).toContain('title="Smart plan')
  })

  it('renders the mobile drawer with a dialog role', () => {
    const html = renderToStaticMarkup(
      <PlannerSidebarDrawer
        open
        usePortal={false}
        onClose={noop}
        activeSection="plan"
        counts={counts}
        onSelect={noop}
        onNewTask={noop}
        onNewEvent={noop}
      />,
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('Smart plan')
    expect(html).toContain('Close planner navigation')
  })

  it('renders nothing when the drawer is closed', () => {
    const html = renderToStaticMarkup(
      <PlannerSidebarDrawer
        open={false}
        onClose={noop}
        activeSection="plan"
        counts={counts}
        onSelect={noop}
        onNewTask={noop}
        onNewEvent={noop}
      />,
    )
    expect(html).toBe('')
  })
})
