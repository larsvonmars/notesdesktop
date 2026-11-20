import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTimetableEntriesMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/events')>()
  return { ...actual, getTimetableEntries: getTimetableEntriesMock }
})

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

import { BASE_CHAT_TOOLS } from '@/lib/chat/tools'
import type { TimetableEntry } from '@/lib/events'

function makeEntry(overrides: Partial<TimetableEntry> = {}): TimetableEntry {
  return {
    id: 'event-1',
    user_id: 'user-1',
    task_id: null,
    note_id: null,
    project_id: null,
    title: 'Focus time',
    description: 'Protected planning time',
    location: 'Home office',
    start_time: '2026-11-23T09:00:00.000Z',
    end_time: '2026-11-23T10:00:00.000Z',
    is_all_day: false,
    timezone: 'Europe/Berlin',
    recurrence_pattern_id: 'pattern-1',
    is_recurring: true,
    parent_event_id: null,
    category: 'Work',
    color: '#3B82F6',
    attendees: null,
    meeting_url: null,
    meeting_platform: null,
    is_cancelled: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    recurrence_pattern: {
      id: 'pattern-1',
      user_id: 'user-1',
      frequency: 'weekly',
      interval: 1,
      days_of_week: [1, 3],
      day_of_month: null,
      month_of_year: null,
      end_date: null,
      occurrence_count: null,
      timezone: 'Europe/Berlin',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  }
}

describe('recurring timetable chat tool', () => {
  beforeEach(() => {
    getTimetableEntriesMock.mockReset()
  })

  it('lists recurring schedule details and filters by recurrence pattern', async () => {
    getTimetableEntriesMock.mockResolvedValue([
      makeEntry(),
      makeEntry({
        id: 'event-2',
        title: 'Lunch break',
        location: null,
        category: null,
        recurrence_pattern: {
          ...makeEntry().recurrence_pattern!,
          days_of_week: [2],
        },
      }),
      makeEntry({ id: 'event-3', title: 'Stretch break' }),
    ])

    const result = await BASE_CHAT_TOOLS.list_timetable_entries.execute(
      { query: 'wed', limit: 1 },
      { userId: 'user-1' },
    )

    expect(getTimetableEntriesMock).toHaveBeenCalledOnce()
    expect(result).toContain('2 recurring timetable entries (showing 1)')
    expect(result).toContain('Focus time')
    expect(result).toContain('Every week on Mon, Wed')
    expect(result).toContain('Home office')
    expect(result).not.toContain('Lunch break')
    expect(result).not.toContain('Stretch break')
  })

  it('reports an empty result clearly', async () => {
    getTimetableEntriesMock.mockResolvedValue([])

    const result = await BASE_CHAT_TOOLS.list_timetable_entries.execute({}, { userId: 'user-1' })

    expect(result).toBe('No recurring timetable entries matched.')
  })
})
