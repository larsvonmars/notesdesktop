import type { CalendarEvent } from './events'
import type { Task } from './tasks'
import { DAY_MS, startOfDay } from './home'

export type TaskViewFilter = 'today' | 'week' | 'open' | 'completed'

export interface TaskGroup {
  key: 'overdue' | 'today' | 'week' | 'later' | 'nodate'
  label: string
  tasks: Task[]
}

export interface EventDayGroup {
  key: string
  label: string
  date: Date
  events: CalendarEvent[]
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

export function isTaskOpen(task: Task): boolean {
  return !task.is_archived && task.status !== 'completed' && task.status !== 'cancelled'
}

export function groupOpenTasks(tasks: Task[], now = new Date()): TaskGroup[] {
  const today = startOfDay(now).getTime()
  const weekEnd = today + 7 * DAY_MS

  const groups: TaskGroup[] = [
    { key: 'overdue', label: 'Overdue', tasks: [] },
    { key: 'today', label: 'Today', tasks: [] },
    { key: 'week', label: 'Next 7 days', tasks: [] },
    { key: 'later', label: 'Later', tasks: [] },
    { key: 'nodate', label: 'No due date', tasks: [] },
  ]
  const byKey = new Map(groups.map((group) => [group.key, group]))

  for (const task of tasks) {
    if (!isTaskOpen(task)) continue

    if (!task.due_date) {
      byKey.get('nodate')!.tasks.push(task)
      continue
    }

    const due = startOfDay(new Date(task.due_date)).getTime()
    if (Number.isNaN(due)) {
      byKey.get('nodate')!.tasks.push(task)
    } else if (due < today) {
      byKey.get('overdue')!.tasks.push(task)
    } else if (due === today) {
      byKey.get('today')!.tasks.push(task)
    } else if (due <= weekEnd) {
      byKey.get('week')!.tasks.push(task)
    } else {
      byKey.get('later')!.tasks.push(task)
    }
  }

  for (const group of groups) {
    group.tasks.sort(compareTasks)
  }

  return groups.filter((group) => group.tasks.length > 0)
}

export function groupsForFilter(groups: TaskGroup[], filter: TaskViewFilter): TaskGroup[] {
  if (filter === 'open' || filter === 'completed') return groups

  if (filter === 'today') {
    return groups.filter((group) => group.key === 'overdue' || group.key === 'today')
  }

  return groups.filter(
    (group) => group.key === 'overdue' || group.key === 'today' || group.key === 'week',
  )
}

export function getCompletedTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => task.status === 'completed' || task.status === 'cancelled')
    .sort((a, b) => {
      const aCompleted = new Date(a.completed_at ?? a.updated_at).getTime()
      const bCompleted = new Date(b.completed_at ?? b.updated_at).getTime()
      return bCompleted - aCompleted
    })
}

export function groupEventsByDay(
  events: CalendarEvent[],
  now = new Date(),
  maxDays = 45,
): EventDayGroup[] {
  const today = startOfDay(now)
  const rangeEnd = today.getTime() + maxDays * DAY_MS
  const groups = new Map<string, EventDayGroup>()

  for (const event of events) {
    if (event.is_cancelled) continue

    const start = new Date(event.start_time)
    if (Number.isNaN(start.getTime())) continue
    if (start.getTime() < today.getTime() || start.getTime() > rangeEnd) continue

    const day = startOfDay(start)
    const key = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`

    let group = groups.get(key)
    if (!group) {
      group = { key, label: eventDayLabel(day, today), date: day, events: [] }
      groups.set(key, group)
    }
    group.events.push(event)
  }

  const result = Array.from(groups.values())
  for (const group of result) {
    group.events.sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    )
  }

  return result.sort((a, b) => a.date.getTime() - b.date.getTime())
}

function eventDayLabel(day: Date, today: Date): string {
  const diffDays = Math.round((day.getTime() - today.getTime()) / DAY_MS)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return day.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function toTimeInputValue(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function dateInputToLocalDate(value: string, hour = 12, minute = 0): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, minute, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

export function dateAndTimeToLocalDate(
  dateValue: string,
  timeValue: string,
): Date | null {
  const date = dateInputToLocalDate(dateValue)
  if (!date) return null

  const match = /^(\d{2}):(\d{2})$/.exec(timeValue)
  if (!match) return null

  date.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return date
}

export function isTaskOverdue(task: Task, now = new Date()): boolean {
  if (!task.due_date) return false
  const due = startOfDay(new Date(task.due_date)).getTime()
  return !Number.isNaN(due) && due < startOfDay(now).getTime()
}

export function isTaskDueToday(task: Task, now = new Date()): boolean {
  if (!task.due_date) return false
  const due = startOfDay(new Date(task.due_date)).getTime()
  return !Number.isNaN(due) && due === startOfDay(now).getTime()
}
