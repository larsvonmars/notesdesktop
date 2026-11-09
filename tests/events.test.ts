import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

import { getEvents, type CalendarEvent } from '@/lib/events'
import { supabase } from '@/lib/supabase'

const mockApi = supabase as unknown as {
  __mockState: { other: Record<string, any[]> }
  __resetMockState: () => void
}

const NOW = new Date('2026-03-10T09:00:00.000Z')
const DAY_MS = 86_400_000

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-1',
    user_id: 'user-1',
    task_id: null,
    note_id: null,
    project_id: null,
    title: 'Event',
    description: null,
    location: null,
    start_time: NOW.toISOString(),
    end_time: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
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
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  mockApi.__resetMockState()
})

describe('getEvents', () => {
  const startDate = new Date(NOW.getTime() - 1 * DAY_MS)
  const endDate = new Date(NOW.getTime() + 1 * DAY_MS)

  const inRange = makeEvent({ id: 'in-range', title: 'In range' })
  const oldRecurring = makeEvent({
    id: 'old-recurring',
    title: 'Weekly lecture',
    is_recurring: true,
    recurrence_pattern_id: 'pattern-1',
    start_time: new Date(NOW.getTime() - 400 * DAY_MS).toISOString(),
    end_time: new Date(NOW.getTime() - 400 * DAY_MS + 60 * 60 * 1000).toISOString(),
  })
  const oldOneOff = makeEvent({
    id: 'old-one-off',
    title: 'Old meeting',
    start_time: new Date(NOW.getTime() - 400 * DAY_MS).toISOString(),
    end_time: new Date(NOW.getTime() - 400 * DAY_MS + 60 * 60 * 1000).toISOString(),
  })

  function seed() {
    mockApi.__mockState.other.calendar_events = [inRange, oldRecurring, oldOneOff]
  }

  it('limits results to the requested date range by default', async () => {
    seed()
    const events = await getEvents({ startDate, endDate })
    expect(events.map((event) => event.id)).toEqual(['in-range'])
  })

  it('includes recurring events outside the range when includeRecurring is set', async () => {
    seed()
    const events = await getEvents({ startDate, endDate, includeRecurring: true })
    expect(events.map((event) => event.id)).toEqual(['old-recurring', 'in-range'])
  })
})
