import { describe, expect, it } from 'vitest'
import type { CalendarEvent, RecurrencePattern } from '@/lib/events'
import type { Task } from '@/lib/tasks'
import {
  addDays,
  buildAvailabilitySlots,
  describeRecurrence,
  expandCalendarEvents,
  expandRecurrences,
  getNextOccurrenceDate,
  getStartOfDay,
  monthGrid,
  subtractOccupied,
} from '@/lib/planner/date-utils'
import { estimateTaskDuration } from '@/lib/planner/scoring'
import { generatePlan } from '@/lib/planner/scheduler'
import { buildIcs } from '@/lib/planner/ics'
import type { TaskCompletion } from '@/lib/planner/types'

const BASE = new Date(2026, 4, 4, 9, 0, 0) // Monday 4 May 2026

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-1',
    user_id: 'user-1',
    task_id: null,
    note_id: null,
    project_id: null,
    title: 'Standup',
    description: null,
    location: null,
    start_time: new Date(2026, 4, 4, 9, 0).toISOString(),
    end_time: new Date(2026, 4, 4, 10, 0).toISOString(),
    is_all_day: false,
    timezone: 'Europe/Berlin',
    recurrence_pattern_id: null,
    is_recurring: false,
    parent_event_id: null,
    category: null,
    color: '#3B82F6',
    attendees: null,
    meeting_url: null,
    meeting_platform: null,
    is_cancelled: false,
    created_at: BASE.toISOString(),
    updated_at: BASE.toISOString(),
    ...overrides,
  }
}

function makePattern(overrides: Partial<RecurrencePattern> = {}): RecurrencePattern {
  return {
    id: 'pattern-1',
    user_id: 'user-1',
    frequency: 'weekly',
    interval: 1,
    days_of_week: [1, 3, 5],
    day_of_month: null,
    month_of_year: null,
    end_date: null,
    occurrence_count: null,
    timezone: 'Europe/Berlin',
    created_at: BASE.toISOString(),
    ...overrides,
  }
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    user_id: 'user-1',
    task_list_id: null,
    note_id: null,
    project_id: null,
    title: 'Write report',
    description: null,
    priority: 'medium',
    status: 'todo',
    due_date: null,
    start_date: null,
    completed_at: null,
    recurrence_pattern_id: null,
    is_recurring: false,
    parent_task_id: null,
    sort_order: 0,
    estimated_minutes: 60,
    actual_minutes: null,
    is_starred: false,
    is_archived: false,
    created_at: BASE.toISOString(),
    updated_at: BASE.toISOString(),
    labels: [],
    progress: 0,
    ...overrides,
  }
}

function makeCompletion(overrides: Partial<TaskCompletion> = {}): TaskCompletion {
  return {
    id: 'completion-1',
    task_id: 'task-x',
    plan_item_id: null,
    completed_at: BASE.toISOString(),
    actual_minutes: 50,
    estimated_minutes: 30,
    day_of_week: 1,
    hour_of_day: 9,
    priority: 'medium',
    labels: [],
    project_id: null,
    ...overrides,
  }
}

describe('expandRecurrences', () => {
  it('expands weekly patterns on the configured weekdays within range', () => {
    const event = makeEvent({ is_recurring: true, recurrence_pattern_id: 'pattern-1' })
    const pattern = makePattern()
    const slots = expandRecurrences(event, pattern, new Date(2026, 4, 4), new Date(2026, 4, 11))

    expect(slots).toHaveLength(3)
    expect(slots.map((slot) => slot.start.getDay())).toEqual([1, 3, 5])
    expect(slots[0].start.getHours()).toBe(9)
  })

  it('falls back to the event weekday when weekly has no explicit days', () => {
    const event = makeEvent({ is_recurring: true, recurrence_pattern_id: 'pattern-1' })
    const pattern = makePattern({ days_of_week: null })
    const slots = expandRecurrences(event, pattern, new Date(2026, 4, 4), new Date(2026, 4, 18))

    expect(slots.length).toBeGreaterThanOrEqual(2)
    expect(slots.every((slot) => slot.start.getDay() === 1)).toBe(true)
  })

  it('skips occurrences after the pattern end date', () => {
    const event = makeEvent({ is_recurring: true, recurrence_pattern_id: 'pattern-1' })
    const pattern = makePattern({ end_date: new Date(2026, 4, 6, 23, 59).toISOString() })
    const slots = expandRecurrences(event, pattern, new Date(2026, 4, 4), new Date(2026, 4, 20))

    expect(slots).toHaveLength(2)
    expect(slots.every((slot) => slot.start <= new Date(2026, 4, 6, 23, 59))).toBe(true)
  })

  it('handles daily interval fast-forwarding', () => {
    const event = makeEvent({
      start_time: new Date(2020, 0, 1, 8, 0).toISOString(),
      end_time: new Date(2020, 0, 1, 9, 0).toISOString(),
      is_recurring: true,
      recurrence_pattern_id: 'pattern-1',
    })
    const pattern = makePattern({ frequency: 'daily', interval: 2, days_of_week: null })
    const slots = expandRecurrences(event, pattern, new Date(2026, 4, 4), new Date(2026, 4, 9))

    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every((slot) => slot.start >= new Date(2026, 4, 4))).toBe(true)
  })

  it('skips a recurring occurrence cancelled by an exception row', () => {
    const parent = makeEvent({
      is_recurring: true,
      recurrence_pattern_id: 'pattern-1',
      start_time: new Date(2026, 4, 4, 9, 0).toISOString(),
      end_time: new Date(2026, 4, 4, 10, 0).toISOString(),
    })
    const cancelledOccurrence = makeEvent({
      id: 'exception-1',
      is_cancelled: true,
      parent_event_id: parent.id,
      start_time: new Date(2026, 4, 6, 9, 0).toISOString(),
      end_time: new Date(2026, 4, 6, 10, 0).toISOString(),
    })
    const slots = expandCalendarEvents(
      [parent, cancelledOccurrence],
      [makePattern()],
      new Date(2026, 4, 4),
      new Date(2026, 4, 9),
    )

    expect(slots).toHaveLength(2)
    expect(slots.some((slot) => new Date(slot.start_time).getDate() === 6)).toBe(false)
    // Exception rows are never rendered as standalone events.
    expect(slots.every((slot) => slot.is_occurrence)).toBe(true)
  })
})

describe('recurrence helpers', () => {
  it('finds the next weekly occurrence', () => {
    const pattern = makePattern()
    const next = getNextOccurrenceDate(pattern, new Date(2026, 4, 4, 12, 0))
    expect(next?.getDay()).toBe(3)
  })

  it('keeps the task time of day when advancing a weekly recurrence', () => {
    // Monday 4 May 2026 09:15, pattern Mon/Wed/Fri -> Wednesday 09:15.
    const pattern = makePattern()
    const next = getNextOccurrenceDate(pattern, new Date(2026, 4, 4, 9, 15, 30))
    expect(next?.getDay()).toBe(3)
    expect(next?.getHours()).toBe(9)
    expect(next?.getMinutes()).toBe(15)
    expect(next?.getSeconds()).toBe(30)
  })

  it('returns null when the pattern has ended', () => {
    const pattern = makePattern({ end_date: new Date(2026, 4, 4, 23, 59).toISOString() })
    expect(getNextOccurrenceDate(pattern, new Date(2026, 4, 5))).toBeNull()
  })

  it('describes a pattern in human terms', () => {
    expect(describeRecurrence(makePattern({ interval: 2 }))).toBe('Every 2 weeks on Mon, Wed, Fri')
    expect(describeRecurrence(makePattern({ frequency: 'monthly', day_of_month: 15 }))).toBe(
      'Every month on day 15',
    )
  })
})

describe('free time helpers', () => {
  it('builds daily availability windows', () => {
    const slots = buildAvailabilitySlots(
      new Date(2026, 4, 4, 0, 0),
      new Date(2026, 4, 6, 23, 59),
      '09:00',
      '17:00',
    )
    expect(slots).toHaveLength(3)
    expect(slots[0].start.getHours()).toBe(9)
    expect(slots[0].end.getHours()).toBe(17)
  })

  it('subtracts occupied blocks from availability', () => {
    const free = subtractOccupied(
      [{ start: new Date(2026, 4, 4, 9, 0), end: new Date(2026, 4, 4, 17, 0) }],
      [{ start: new Date(2026, 4, 4, 10, 0), end: new Date(2026, 4, 4, 11, 0) }],
    )
    expect(free).toHaveLength(2)
    expect(free[0].end.getHours()).toBe(10)
    expect(free[1].start.getHours()).toBe(11)
  })

  it('builds a six week month grid starting on Monday', () => {
    const weeks = monthGrid(2026, 4, 1)
    expect(weeks).toHaveLength(6)
    expect(weeks[0][0].getDay()).toBe(1)
    expect(weeks[0][0].getDate()).toBe(27)
  })
})

describe('generatePlan', () => {
  it('schedules tasks into free time and respects events and breaks', () => {
    const tasks = [
      makeTask({ id: 'a', title: 'Deep work', estimated_minutes: 60, priority: 'high' }),
      makeTask({ id: 'b', title: 'Email', estimated_minutes: 30, priority: 'low' }),
    ]
    const events = [
      makeEvent({
        start_time: new Date(2026, 4, 4, 10, 0).toISOString(),
        end_time: new Date(2026, 4, 4, 11, 0).toISOString(),
      }),
    ]

    const result = generatePlan({
      config: {
        scope: 'custom',
        customStart: new Date(2026, 4, 4, 9, 0).toISOString(),
        customEnd: new Date(2026, 4, 4, 12, 0).toISOString(),
        availabilityStart: '09:00',
        availabilityEnd: '12:00',
        breakMinutes: 5,
      },
      tasks,
      events,
      recurrencePatterns: [],
    })

    expect(result.scheduledItems).toHaveLength(2)
    expect(result.scheduledItems[0].task_id).toBe('a')
    expect(result.totalScheduledMinutes).toBe(90)
    // First task claims 9:00-10:00, second resumes after the event.
    expect(new Date(result.scheduledItems[1].scheduled_start!).getHours()).toBe(11)
    expect(result.quality.overall).toBeGreaterThanOrEqual(0)
  })

  it('schedules remaining work proportional to progress', () => {
    const result = generatePlan({
      config: {
        scope: 'custom',
        customStart: new Date(2026, 4, 4, 9, 0).toISOString(),
        customEnd: new Date(2026, 4, 4, 17, 0).toISOString(),
        availabilityStart: '09:00',
        availabilityEnd: '17:00',
        breakMinutes: 0,
      },
      tasks: [makeTask({ estimated_minutes: 60, progress: 50 })],
      events: [],
      recurrencePatterns: [],
    })

    expect(result.scheduledItems[0].estimated_minutes).toBe(30)
  })

  it('reports work that does not fit instead of scheduling outside the scope', () => {
    const result = generatePlan({
      config: {
        scope: 'custom',
        customStart: new Date(2026, 4, 4, 9, 0).toISOString(),
        customEnd: new Date(2026, 4, 4, 11, 0).toISOString(),
        availabilityStart: '09:00',
        availabilityEnd: '17:00',
        breakMinutes: 0,
      },
      tasks: [
        makeTask({ id: 'a', estimated_minutes: 90, priority: 'urgent' }),
        makeTask({ id: 'b', estimated_minutes: 90, priority: 'low' }),
      ],
      events: [],
      recurrencePatterns: [],
    })

    expect(result.scheduledItems).toHaveLength(1)
    expect(result.unscheduledItems).toHaveLength(1)
    expect(result.unscheduledItems[0].task_id).toBe('b')
    expect(result.unscheduledItems[0].scheduled_start).toBeNull()
    const start = new Date(result.scheduledItems[0].scheduled_start!)
    const end = new Date(result.scheduledItems[0].scheduled_end!)
    expect(start.getTime()).toBeGreaterThanOrEqual(new Date(2026, 4, 4, 9, 0).getTime())
    expect(end.getTime()).toBeLessThanOrEqual(new Date(2026, 4, 4, 11, 0).getTime())
  })
})

describe('estimateTaskDuration', () => {
  it('corrects estimates using priority history', () => {
    const completions = [
      makeCompletion({ id: 'c1', priority: 'medium', estimated_minutes: 30, actual_minutes: 60 }),
      makeCompletion({ id: 'c2', priority: 'medium', estimated_minutes: 30, actual_minutes: 60 }),
    ]
    const estimation = estimateTaskDuration(
      makeTask({ estimated_minutes: 30, priority: 'medium' }),
      completions,
      null,
    )
    expect(estimation.source).toBe('priority_correction')
    expect(estimation.minutes).toBe(60)
  })

  it('falls back to a 30 minute default without any signal', () => {
    const estimation = estimateTaskDuration(
      makeTask({ estimated_minutes: null }),
      [],
      null,
    )
    expect(estimation.minutes).toBe(30)
    expect(estimation.source).toBe('default')
  })
})

describe('buildIcs', () => {
  it('exports events with recurrence rules', () => {
    const event = makeEvent({
      is_recurring: true,
      recurrence_pattern_id: 'pattern-1',
      description: 'Sync, notes; and more',
    })
    const ics = buildIcs([event], [makePattern()], 'Test Calendar')

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Standup')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR')
    expect(ics).toContain('DESCRIPTION:Sync\\, notes\\; and more')
    expect(ics).toContain('END:VCALENDAR')
  })

  it('writes all-day events as local date values with an exclusive end', () => {
    const ics = buildIcs([
      makeEvent({
        is_all_day: true,
        start_time: new Date(2026, 4, 4, 0, 0).toISOString(),
        end_time: new Date(2026, 4, 4, 23, 59).toISOString(),
      }),
    ])
    expect(ics).toContain('DTSTART;VALUE=DATE:20260504')
    // RFC 5545 DTEND is exclusive: the stored last day is May 4, so export May 5.
    expect(ics).toContain('DTEND;VALUE=DATE:20260505')
    expect(ics).not.toContain('RRULE')
  })
})

describe('date helpers sanity', () => {
  it('adds days without mutating the input', () => {
    const original = new Date(2026, 4, 4)
    const next = addDays(original, 3)
    expect(next.getDate()).toBe(7)
    expect(original.getDate()).toBe(4)
    expect(getStartOfDay(new Date(2026, 4, 4, 18, 30)).getHours()).toBe(0)
  })
})
