import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '@/lib/events'
import type { Task } from '@/lib/tasks'
import {
  dateAndTimeToLocalDate,
  dateInputToLocalDate,
  getCompletedTasks,
  groupEventsByDay,
  groupsForFilter,
  groupOpenTasks,
  isTaskDueToday,
  isTaskOverdue,
  toDateInputValue,
  toTimeInputValue,
} from '@/lib/task-agenda'

const NOW = new Date(2026, 9, 18, 12, 0, 0)

function daysFromNow(days: number, hour = 10): Date {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days, hour)
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    user_id: 'user-1',
    task_list_id: null,
    note_id: null,
    project_id: null,
    title: 'A task',
    description: null,
    priority: 'medium',
    status: 'todo',
    due_date: daysFromNow(0).toISOString(),
    start_date: null,
    completed_at: null,
    recurrence_pattern_id: null,
    is_recurring: false,
    parent_task_id: null,
    sort_order: 0,
    estimated_minutes: null,
    actual_minutes: null,
    is_starred: false,
    is_archived: false,
    created_at: daysFromNow(-1).toISOString(),
    updated_at: daysFromNow(-1).toISOString(),
    ...overrides,
  }
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-1',
    user_id: 'user-1',
    task_id: null,
    note_id: null,
    project_id: null,
    title: 'An event',
    description: null,
    location: null,
    start_time: daysFromNow(0, 14).toISOString(),
    end_time: daysFromNow(0, 15).toISOString(),
    is_all_day: false,
    timezone: 'UTC',
    recurrence_pattern_id: null,
    is_recurring: false,
    parent_event_id: null,
    category: null,
    color: '#3B82F6',
    attendees: null,
    meeting_url: null,
    meeting_platform: null,
    is_cancelled: false,
    created_at: daysFromNow(-1).toISOString(),
    updated_at: daysFromNow(-1).toISOString(),
    ...overrides,
  }
}

describe('task grouping', () => {
  it('groups open tasks by due window and drops finished tasks', () => {
    const groups = groupOpenTasks(
      [
        makeTask({ id: 'overdue', due_date: daysFromNow(-2).toISOString() }),
        makeTask({ id: 'today', due_date: daysFromNow(0).toISOString() }),
        makeTask({ id: 'week', due_date: daysFromNow(4).toISOString() }),
        makeTask({ id: 'later', due_date: daysFromNow(20).toISOString() }),
        makeTask({ id: 'nodate', due_date: null }),
        makeTask({ id: 'done', status: 'completed' }),
        makeTask({ id: 'archived', is_archived: true }),
      ],
      NOW,
    )

    expect(groups.map((group) => group.key)).toEqual([
      'overdue',
      'today',
      'week',
      'later',
      'nodate',
    ])
    expect(groups.map((group) => group.tasks.map((task) => task.id))).toEqual([
      ['overdue'],
      ['today'],
      ['week'],
      ['later'],
      ['nodate'],
    ])
  })

  it('sorts by due date and then priority', () => {
    const groups = groupOpenTasks(
      [
        makeTask({ id: 'low', priority: 'low' }),
        makeTask({ id: 'urgent', priority: 'urgent' }),
        makeTask({ id: 'high', priority: 'high' }),
      ],
      NOW,
    )

    expect(groups[0].tasks.map((task) => task.id)).toEqual(['urgent', 'high', 'low'])
  })

  it('narrows groups for today and week filters', () => {
    const groups = groupOpenTasks(
      [
        makeTask({ id: 'overdue', due_date: daysFromNow(-2).toISOString() }),
        makeTask({ id: 'today', due_date: daysFromNow(0).toISOString() }),
        makeTask({ id: 'week', due_date: daysFromNow(4).toISOString() }),
        makeTask({ id: 'later', due_date: daysFromNow(20).toISOString() }),
      ],
      NOW,
    )

    expect(groupsForFilter(groups, 'today').map((group) => group.key)).toEqual([
      'overdue',
      'today',
    ])
    expect(groupsForFilter(groups, 'week').map((group) => group.key)).toEqual([
      'overdue',
      'today',
      'week',
    ])
    expect(groupsForFilter(groups, 'open')).toHaveLength(4)
  })

  it('lists the most recently completed tasks first', () => {
    const completed = getCompletedTasks([
      makeTask({
        id: 'older',
        status: 'completed',
        completed_at: daysFromNow(-2).toISOString(),
      }),
      makeTask({
        id: 'newer',
        status: 'completed',
        completed_at: daysFromNow(-1).toISOString(),
      }),
      makeTask({ id: 'open' }),
    ])

    expect(completed.map((task) => task.id)).toEqual(['newer', 'older'])
  })

  it('detects overdue and due-today tasks', () => {
    expect(isTaskOverdue(makeTask({ due_date: daysFromNow(-1).toISOString() }), NOW)).toBe(true)
    expect(isTaskOverdue(makeTask({ due_date: daysFromNow(0).toISOString() }), NOW)).toBe(false)
    expect(isTaskDueToday(makeTask({ due_date: daysFromNow(0).toISOString() }), NOW)).toBe(true)
    expect(isTaskDueToday(makeTask({ due_date: null }), NOW)).toBe(false)
  })
})

describe('event grouping', () => {
  it('groups and sorts upcoming events by day', () => {
    const groups = groupEventsByDay(
      [
        makeEvent({
          id: 'tomorrow-late',
          start_time: daysFromNow(1, 16).toISOString(),
        }),
        makeEvent({
          id: 'tomorrow-early',
          start_time: daysFromNow(1, 9).toISOString(),
        }),
        makeEvent({
          id: 'today',
          start_time: daysFromNow(0, 14).toISOString(),
        }),
        makeEvent({
          id: 'cancelled',
          start_time: daysFromNow(0, 15).toISOString(),
          is_cancelled: true,
        }),
        makeEvent({
          id: 'past',
          start_time: daysFromNow(-1).toISOString(),
        }),
      ],
      NOW,
    )

    expect(groups.map((group) => group.label)).toEqual(['Today', 'Tomorrow'])
    expect(groups[0].events.map((event) => event.id)).toEqual(['today'])
    expect(groups[1].events.map((event) => event.id)).toEqual([
      'tomorrow-early',
      'tomorrow-late',
    ])
  })
})

describe('date input helpers', () => {
  it('round-trips local date and time values', () => {
    const date = new Date(2026, 9, 18, 9, 30)
    expect(toDateInputValue(date)).toBe('2026-10-18')
    expect(toTimeInputValue(date)).toBe('09:30')

    const parsed = dateAndTimeToLocalDate('2026-10-18', '09:30')
    expect(parsed?.getFullYear()).toBe(2026)
    expect(parsed?.getMonth()).toBe(9)
    expect(parsed?.getDate()).toBe(18)
    expect(parsed?.getHours()).toBe(9)
    expect(parsed?.getMinutes()).toBe(30)
  })

  it('defaults date-only values to local noon and rejects malformed input', () => {
    const date = dateInputToLocalDate('2026-10-18')
    expect(date?.getHours()).toBe(12)
    expect(dateInputToLocalDate('nope')).toBeNull()
    expect(dateAndTimeToLocalDate('2026-10-18', 'nope')).toBeNull()
  })
})
