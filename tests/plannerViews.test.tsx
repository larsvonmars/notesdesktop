import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

import ToastProvider from '@/components/ToastProvider'
import CalendarView from '@/components/planner/CalendarView'
import TaskKanbanView from '@/components/planner/TaskKanbanView'
import TaskListView from '@/components/planner/TaskListView'
import TimetableView from '@/components/planner/TimetableView'
import OverviewView from '@/components/planner/OverviewView'
import ProjectsView from '@/components/planner/ProjectsView'
import type { CalendarEvent, RecurrencePattern } from '@/lib/events'
import type { Task } from '@/lib/tasks'
import type { Project } from '@/lib/projects'
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/planner/preferences'

const now = new Date()
const iso = (date: Date) => date.toISOString()

const project: Project = {
  id: 'project-1',
  user_id: 'user-1',
  name: 'Thesis',
  description: null,
  color: '#4d7c0f',
  position: 0,
  quick_links: [],
  created_at: iso(now),
  updated_at: iso(now),
}

const task: Task = {
  id: 'task-1',
  user_id: 'user-1',
  task_list_id: null,
  note_id: null,
  project_id: 'project-1',
  title: 'Write introduction',
  description: 'Draft the opening chapter',
  priority: 'high',
  status: 'in_progress',
  due_date: iso(now),
  start_date: null,
  completed_at: null,
  recurrence_pattern_id: null,
  is_recurring: false,
  parent_task_id: null,
  sort_order: 0,
  estimated_minutes: 60,
  actual_minutes: null,
  is_starred: true,
  is_archived: false,
  created_at: iso(now),
  updated_at: iso(now),
  labels: ['deep-work'],
  progress: 40,
}

const event: CalendarEvent = {
  id: 'event-1',
  user_id: 'user-1',
  task_id: null,
  note_id: null,
  project_id: 'project-1',
  title: 'Lecture',
  description: null,
  location: 'Room 4',
  start_time: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0)),
  end_time: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 30)),
  is_all_day: false,
  timezone: 'Europe/Berlin',
  recurrence_pattern_id: 'pattern-1',
  is_recurring: true,
  parent_event_id: null,
  category: 'timetable',
  color: '#6366f1',
  attendees: null,
  meeting_url: null,
  meeting_platform: null,
  is_cancelled: false,
  created_at: iso(now),
  updated_at: iso(now),
}

const pattern: RecurrencePattern = {
  id: 'pattern-1',
  user_id: 'user-1',
  frequency: 'weekly',
  interval: 1,
  days_of_week: [now.getDay()],
  day_of_month: null,
  month_of_year: null,
  end_date: null,
  occurrence_count: null,
  timezone: 'Europe/Berlin',
  created_at: iso(now),
}

const noop = () => {}

describe('Planner views render', () => {
  it('renders the calendar with events and tasks', () => {
    const html = renderToStaticMarkup(
      <CalendarView
        events={[event]}
        recurrencePatterns={[pattern]}
        tasks={[task]}
        projects={[project]}
        display={DEFAULT_DISPLAY_PREFERENCES}
        onNewEvent={noop}
        onEditEvent={noop}
        onDeleteEvent={noop}
        onNewTask={noop}
        onOpenTask={noop}
        onExport={noop}
      />,
    )
    expect(html).toContain('Agenda')
    expect(html).toContain('Keyboard shortcuts')
    expect(html).toContain('Month')
    expect(html).toContain('pl-toolbar')
  })

  it('renders the task list with priority and project context', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <TaskListView
          tasks={[{ ...task, status: 'todo' }]}
          projects={[project]}
          notes={[]}
          recurrencePatterns={[]}
          onOpenTask={noop}
          onEditTask={noop}
          onToggleComplete={noop}
          onToggleStar={noop}
          onDeleteTask={noop}
          onQuickAdd={noop}
          onNewTask={noop}
        />
      </ToastProvider>,
    )
    expect(html).toContain('Write introduction')
    expect(html).toContain('Thesis')
    expect(html).toContain('High')
  })

  it('defaults the task list to the to-do status filter', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <TaskListView
          tasks={[task]}
          projects={[project]}
          notes={[]}
          recurrencePatterns={[]}
          onOpenTask={noop}
          onEditTask={noop}
          onToggleComplete={noop}
          onToggleStar={noop}
          onDeleteTask={noop}
          onQuickAdd={noop}
          onNewTask={noop}
        />
      </ToastProvider>,
    )
    expect(html).not.toContain('Write introduction')
    expect(html).toContain('Clear filters')
  })

  it('renders the kanban board with all status columns', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <TaskKanbanView
          tasks={[task]}
          projects={[project]}
          onOpenTask={noop}
          onToggleStar={noop}
          onQuickAdd={noop}
          onMoveTask={noop}
          onClearCompleted={noop}
        />
      </ToastProvider>,
    )
    expect(html).toContain('To do')
    expect(html).toContain('In progress')
    expect(html).toContain('Waiting')
    expect(html).toContain('Completed')
    expect(html).toContain('Write introduction')
  })

  it('renders the weekly timetable', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <TimetableView
          events={[event]}
          recurrencePatterns={[pattern]}
          projects={[project]}
          onCreate={noop}
          onEdit={noop}
          onDelete={noop}
        />
      </ToastProvider>,
    )
    expect(html).toContain('New entry')
    expect(html).toContain('Lecture')
    expect(html).toContain('pl-toolbar')
  })

  it('lists every recurring calendar event as a timetable entry', () => {
    const recurring = { ...event, category: 'work' }
    const oneOff = {
      ...event,
      id: 'event-2',
      title: 'One-off meeting',
      category: 'timetable',
      is_recurring: false,
      recurrence_pattern_id: null,
    }

    const html = renderToStaticMarkup(
      <ToastProvider>
        <TimetableView
          events={[recurring, oneOff]}
          recurrencePatterns={[pattern]}
          projects={[project]}
          onCreate={noop}
          onEdit={noop}
          onDelete={noop}
        />
      </ToastProvider>,
    )
    expect(html).toContain('Lecture')
    expect(html).not.toContain('One-off meeting')
  })

  it('renders the overview dashboard', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <OverviewView
          tasks={[task]}
          events={[event]}
          recurrencePatterns={[pattern]}
          projects={[project]}
          availableMinutes={300}
          onNavigate={noop}
          onOpenTask={noop}
          onCompleteTask={noop}
          onNewTask={noop}
          onNewEvent={noop}
        />
      </ToastProvider>,
    )
    expect(html).toContain('Open tasks')
    expect(html).toContain('Needs attention')
    expect(html).toContain('Write introduction')
    expect(html).toContain('5h')
  })

  it('lists only projects that have tasks and shows those tasks underneath', () => {
    const emptyProject: Project = {
      ...project,
      id: 'project-2',
      name: 'Empty archive',
    }

    const html = renderToStaticMarkup(
      <ToastProvider>
        <ProjectsView
          projects={[project, emptyProject]}
          tasks={[task]}
          taskLists={[]}
          onOpenProject={noop}
          onShowTasks={noop}
          onOpenTask={noop}
          onEditTask={noop}
          onToggleComplete={noop}
          onToggleStar={noop}
          onDeleteTask={noop}
          onQuickAddTask={async () => {}}
          onProjectsChanged={noop}
          onTaskListsChanged={noop}
        />
      </ToastProvider>,
    )

    expect(html).toContain('Thesis')
    expect(html).toContain('Write introduction')
    expect(html).not.toContain('Empty archive')
  })
})
