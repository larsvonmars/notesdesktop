import { describe, expect, it } from 'vitest'
import type { NoteSummary } from '@/lib/notes'
import type { Task } from '@/lib/tasks'
import {
  DAY_MS,
  bucketTasks,
  buildWeekActivity,
  countCreatedInLastWeek,
  countTouchedInLastWeek,
  extractNotePreview,
  findStaleNotes,
  formatEventDay,
  groupNotesByDay,
  htmlToText,
  quickCaptureContent,
  quickCaptureTitle,
  startOfDay,
} from '@/lib/home'

const NOW = new Date(2026, 9, 18, 12, 0, 0)

function daysFromNow(days: number, hour = 10): Date {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days, hour)
}

function makeNote(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: 'note-1',
    title: 'A note',
    created_at: daysFromNow(-3).toISOString(),
    updated_at: daysFromNow(-3).toISOString(),
    user_id: 'user-1',
    folder_id: null,
    project_id: null,
    position: 0,
    note_type: 'rich-text',
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

describe('quick capture helpers', () => {
  it('uses the first non-empty line as the title', () => {
    expect(quickCaptureTitle('\n  Call the dentist  \nmore details')).toBe('Call the dentist')
  })

  it('truncates long titles without leaving trailing whitespace', () => {
    const title = quickCaptureTitle('A'.repeat(50) + ' ' + 'B'.repeat(50), 30)
    expect(title).toHaveLength(30)
    expect(title.endsWith('…')).toBe(true)
  })

  it('falls back when there is no text', () => {
    expect(quickCaptureTitle('   \n  ')).toBe('Quick capture')
  })

  it('escapes HTML and keeps line breaks', () => {
    const content = quickCaptureContent('Use <script> & "quotes"\nnext line')
    expect(content).toBe(
      '<p>Use &lt;script&gt; &amp; &quot;quotes&quot;</p><p>next line</p>',
    )
  })
})

describe('note previews', () => {
  it('converts rich text to a plain-text preview', () => {
    expect(htmlToText('<h1>Title</h1><p>Hello <strong>world</strong></p>')).toBe('Title\nHello world')
    expect(extractNotePreview('rich-text', '<p>Hello <strong>world</strong></p>')).toBe(
      'Hello world',
    )
  })

  it('extracts a mindmap root without touching unrelated JSON', () => {
    const content = JSON.stringify({
      rootId: 'root',
      nodes: {
        root: { text: 'Product launch', description: 'Q4 planning' },
        child: { text: 'Pricing' },
      },
    })

    expect(extractNotePreview('mindmap', content)).toBe('Product launch — Q4 planning')
  })

  it('summarizes bullet journals and data sheets', () => {
    expect(
      extractNotePreview(
        'bullet-journal',
        JSON.stringify({ entries: [{ content: 'First' }, { content: 'Second' }] }),
      ),
    ).toBe('First · Second')

    expect(
      extractNotePreview(
        'data-sheet',
        JSON.stringify({ columns: [{ name: 'Name' }, { name: 'Status' }], rows: [['A', 'B']] }),
      ),
    ).toBe('Name · Status · 1 row')
  })

  it('returns an empty preview for malformed content', () => {
    expect(extractNotePreview('mindmap', '{not json')).toBe('')
    expect(extractNotePreview('pdf-annotation', '{}')).toBe('')
  })
})

describe('groupNotesByDay', () => {
  it('orders notes into today, yesterday, this week and earlier', () => {
    const groups = groupNotesByDay(
      [
        makeNote({ id: 'earlier', updated_at: daysFromNow(-20).toISOString() }),
        makeNote({ id: 'today', updated_at: daysFromNow(0).toISOString() }),
        makeNote({ id: 'yesterday', updated_at: daysFromNow(-1).toISOString() }),
        makeNote({ id: 'week', updated_at: daysFromNow(-4).toISOString() }),
      ],
      NOW,
    )

    expect(groups.map((group) => group.key)).toEqual(['today', 'yesterday', 'week', 'earlier'])
    expect(groups.map((group) => group.notes[0].id)).toEqual([
      'today',
      'yesterday',
      'week',
      'earlier',
    ])
  })
})

describe('bucketTasks', () => {
  it('splits active tasks into overdue, today and the next seven days', () => {
    const buckets = bucketTasks(
      [
        makeTask({ id: 'overdue', due_date: daysFromNow(-2).toISOString() }),
        makeTask({ id: 'today', due_date: daysFromNow(0).toISOString() }),
        makeTask({ id: 'soon', due_date: daysFromNow(5).toISOString() }),
        makeTask({ id: 'later', due_date: daysFromNow(20).toISOString() }),
        makeTask({ id: 'done', due_date: daysFromNow(-1).toISOString(), status: 'completed' }),
        makeTask({ id: 'no-date', due_date: null }),
      ],
      NOW,
    )

    expect(buckets.overdue.map((task) => task.id)).toEqual(['overdue'])
    expect(buckets.today.map((task) => task.id)).toEqual(['today'])
    expect(buckets.upcoming.map((task) => task.id)).toEqual(['soon'])
  })

  it('sorts tasks by due date and then priority', () => {
    const buckets = bucketTasks(
      [
        makeTask({ id: 'low', due_date: daysFromNow(0).toISOString(), priority: 'low' }),
        makeTask({ id: 'urgent', due_date: daysFromNow(0).toISOString(), priority: 'urgent' }),
        makeTask({ id: 'high', due_date: daysFromNow(0).toISOString(), priority: 'high' }),
      ],
      NOW,
    )

    expect(buckets.today.map((task) => task.id)).toEqual(['urgent', 'high', 'low'])
  })
})

describe('event date labels', () => {
  it('labels today, tomorrow and later events', () => {
    expect(formatEventDay(daysFromNow(0).toISOString(), NOW)).toBe('Today')
    expect(formatEventDay(daysFromNow(1).toISOString(), NOW)).toBe('Tomorrow')
    expect(formatEventDay(daysFromNow(3).toISOString(), NOW)).toBe(
      daysFromNow(3).toLocaleDateString(undefined, { weekday: 'long' }),
    )
    expect(formatEventDay(daysFromNow(10).toISOString(), NOW)).toBe(
      daysFromNow(10).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    )
  })
})

describe('activity helpers', () => {
  it('builds a seven day activity window ending today', () => {
    const activity = buildWeekActivity(
      [
        makeNote({ id: 'today', updated_at: daysFromNow(0).toISOString() }),
        makeNote({ id: 'today-2', updated_at: daysFromNow(0, 8).toISOString() }),
        makeNote({ id: 'two-days-ago', updated_at: daysFromNow(-2).toISOString() }),
        makeNote({ id: 'too-old', updated_at: daysFromNow(-10).toISOString() }),
      ],
      NOW,
    )

    expect(activity).toHaveLength(7)
    expect(activity[6].count).toBe(2)
    expect(activity[6].isToday).toBe(true)
    expect(activity.reduce((total, day) => total + day.count, 0)).toBe(3)
  })

  it('counts notes touched and created in the last week', () => {
    const notes = [
      makeNote({ id: 'recent', updated_at: daysFromNow(-1).toISOString(), created_at: daysFromNow(-1).toISOString() }),
      makeNote({ id: 'old', updated_at: daysFromNow(-8).toISOString(), created_at: daysFromNow(-8).toISOString() }),
    ]

    expect(countTouchedInLastWeek(notes, NOW)).toBe(1)
    expect(countCreatedInLastWeek(notes, NOW)).toBe(1)
  })

  it('finds the oldest untouched notes', () => {
    const stale = findStaleNotes(
      [
        makeNote({ id: 'oldest', updated_at: daysFromNow(-60).toISOString() }),
        makeNote({ id: 'old', updated_at: daysFromNow(-30).toISOString() }),
        makeNote({ id: 'fresh', updated_at: daysFromNow(-1).toISOString() }),
      ],
      21,
      NOW,
    )

    expect(stale.map((note) => note.id)).toEqual(['oldest', 'old'])
  })

  it('uses local day boundaries', () => {
    expect(startOfDay(NOW).getTime()).toBe(
      new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime(),
    )
    expect(DAY_MS).toBe(86_400_000)
  })
})
