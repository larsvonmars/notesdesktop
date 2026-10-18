import type { NoteSummary, NoteType } from './notes'
import type { Task } from './tasks'

export const DAY_MS = 24 * 60 * 60 * 1000

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function relativeTime(dateStr: string, now = Date.now()): string {
  const time = new Date(dateStr).getTime()
  if (Number.isNaN(time)) return ''

  const diff = Math.max(0, now - time)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`

  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDueLabel(dateStr: string | null, now = new Date()): string {
  if (!dateStr) return 'No due date'

  const due = startOfDay(new Date(dateStr))
  const today = startOfDay(now)
  if (Number.isNaN(due.getTime())) return 'No due date'

  const diffDays = Math.round((due.getTime() - today.getTime()) / DAY_MS)
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 7) return due.toLocaleDateString(undefined, { weekday: 'short' })
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatEventTime(dateStr: string, isAllDay = false): string {
  if (isAllDay) return 'All day'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatEventDay(dateStr: string, now = new Date()): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''

  const diffDays = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS,
  )
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' })
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export interface NoteDayGroup {
  key: 'today' | 'yesterday' | 'week' | 'earlier'
  label: string
  notes: NoteSummary[]
}

const NOTE_GROUP_LABELS: Record<NoteDayGroup['key'], string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Earlier this week',
  earlier: 'Earlier',
}

export function groupNotesByDay(notes: NoteSummary[], now = new Date()): NoteDayGroup[] {
  const today = startOfDay(now).getTime()
  const groups: NoteDayGroup[] = []
  const index = new Map<NoteDayGroup['key'], NoteDayGroup>()

  const sorted = [...notes].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )

  for (const note of sorted) {
    const updated = new Date(note.updated_at)
    if (Number.isNaN(updated.getTime())) continue

    const diffDays = Math.round((today - startOfDay(updated).getTime()) / DAY_MS)
    let key: NoteDayGroup['key']
    if (diffDays <= 0) key = 'today'
    else if (diffDays === 1) key = 'yesterday'
    else if (diffDays < 7) key = 'week'
    else key = 'earlier'

    let group = index.get(key)
    if (!group) {
      group = { key, label: NOTE_GROUP_LABELS[key], notes: [] }
      index.set(key, group)
      groups.push(group)
    }
    group.notes.push(note)
  }

  return groups
}

export interface TaskBuckets {
  overdue: Task[]
  today: Task[]
  upcoming: Task[]
}

const PRIORITY_RANK: Record<Task['priority'], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function compareTasks(a: Task, b: Task): number {
  const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
  const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
  if (aDue !== bDue) return aDue - bDue
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}

export function bucketTasks(tasks: Task[], now = new Date()): TaskBuckets {
  const today = startOfDay(now)
  const upcomingEnd = new Date(today.getTime() + 7 * DAY_MS)

  const buckets: TaskBuckets = { overdue: [], today: [], upcoming: [] }

  for (const task of tasks) {
    if (task.is_archived) continue
    if (task.status === 'completed' || task.status === 'cancelled') continue
    if (!task.due_date) continue

    const due = startOfDay(new Date(task.due_date))
    if (Number.isNaN(due.getTime())) continue

    if (due.getTime() < today.getTime()) buckets.overdue.push(task)
    else if (due.getTime() === today.getTime()) buckets.today.push(task)
    else if (due.getTime() <= upcomingEnd.getTime()) buckets.upcoming.push(task)
  }

  buckets.overdue.sort(compareTasks)
  buckets.today.sort(compareTasks)
  buckets.upcoming.sort(compareTasks)
  return buckets
}

export interface WeekActivityDay {
  iso: string
  label: string
  fullLabel: string
  count: number
  isToday: boolean
}

export function buildWeekActivity(notes: NoteSummary[], now = new Date()): WeekActivityDay[] {
  const today = startOfDay(now)

  return Array.from({ length: 7 }, (_, position) => {
    const day = new Date(today.getTime() - (6 - position) * DAY_MS)
    const start = day.getTime()
    const end = start + DAY_MS
    const count = notes.filter((note) => {
      const updated = new Date(note.updated_at).getTime()
      return updated >= start && updated < end
    }).length

    return {
      iso: day.toISOString(),
      label: day.toLocaleDateString(undefined, { weekday: 'short' }),
      fullLabel: day.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
      count,
      isToday: position === 6,
    }
  })
}

export function countTouchedInLastWeek(notes: NoteSummary[], now = new Date()): number {
  const since = startOfDay(now).getTime() - 6 * DAY_MS
  return notes.filter((note) => {
    const updated = new Date(note.updated_at).getTime()
    return updated >= since
  }).length
}

export function countCreatedInLastWeek(notes: NoteSummary[], now = new Date()): number {
  const since = startOfDay(now).getTime() - 6 * DAY_MS
  return notes.filter((note) => {
    const created = new Date(note.created_at).getTime()
    return created >= since
  }).length
}

export function findStaleNotes(
  notes: NoteSummary[],
  minAgeDays = 21,
  now = new Date(),
  limit = 3,
): NoteSummary[] {
  const cutoff = startOfDay(now).getTime() - minAgeDays * DAY_MS

  return notes
    .filter((note) => {
      const updated = new Date(note.updated_at).getTime()
      return !Number.isNaN(updated) && updated < cutoff
    })
    .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
    .slice(0, limit)
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function quickCaptureTitle(text: string, maxLength = 80): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstLine) return 'Quick capture'
  if (firstLine.length <= maxLength) return firstLine
  return `${firstLine.slice(0, maxLength - 1).trimEnd()}…`
}

export function quickCaptureContent(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
    .join('')
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function truncateText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

export function extractNotePreview(
  noteType: NoteType,
  content: string,
  maxLength = 220,
): string {
  if (!content) return ''

  if (noteType === 'rich-text') {
    return truncateText(htmlToText(content), maxLength)
  }

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>

    if (noteType === 'mindmap') {
      const nodes = parsed.nodes as Record<string, { text?: string; description?: string }> | undefined
      const root = nodes && typeof parsed.rootId === 'string' ? nodes[parsed.rootId] : undefined
      const text = [root?.text, root?.description].filter(Boolean).join(' — ')
      return truncateText(text, maxLength)
    }

    if (noteType === 'bullet-journal') {
      const entries = Array.isArray(parsed.entries) ? parsed.entries : []
      const text = entries
        .slice(0, 4)
        .map((entry) => (entry && typeof entry === 'object' ? (entry as { content?: string }).content : ''))
        .filter(Boolean)
        .join(' · ')
      return truncateText(text, maxLength)
    }

    if (noteType === 'data-sheet') {
      const columns = Array.isArray(parsed.columns) ? parsed.columns : []
      const rows = Array.isArray(parsed.rows) ? parsed.rows : []
      const headers = columns
        .slice(0, 4)
        .map((column) => (column && typeof column === 'object' ? (column as { name?: string }).name : ''))
        .filter(Boolean)
        .join(' · ')
      const summary = [headers, `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`]
        .filter(Boolean)
        .join(' · ')
      return truncateText(summary, maxLength)
    }
  } catch {
    return ''
  }

  return ''
}

export function getGreeting(date = new Date()): { text: string; emoji: string } {
  const hour = date.getHours()
  if (hour < 12) return { text: 'Good morning', emoji: '☀️' }
  if (hour < 17) return { text: 'Good afternoon', emoji: '🌤️' }
  return { text: 'Good evening', emoji: '🌙' }
}

export function formatHomeDate(date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}
