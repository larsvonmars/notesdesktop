/**
 * Date helpers shared by the calendar, timetable and smart planner.
 * All logic is local-time based and dependency free.
 */

import type { CalendarEvent, RecurrencePattern } from '../events'

export interface TimeSlot {
  start: Date
  end: Date
}

export const DAY_MS = 24 * 60 * 60 * 1000

export function getStartOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function getEndOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const targetMonth = d.getMonth() + months
  d.setMonth(targetMonth)
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0)
  }
  return d
}

export function addYears(date: Date, years: number): Date {
  const d = new Date(date)
  const originalMonth = d.getMonth()
  d.setFullYear(d.getFullYear() + years)
  if (d.getMonth() !== originalMonth) d.setDate(0)
  return d
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

export function diffMinutes(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000)
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 0): Date {
  const d = getStartOfDay(date)
  const offset = (d.getDay() - weekStartsOn + 7) % 7
  return addDays(d, -offset)
}

export function dayIndex(date: Date): number {
  return Math.floor(getStartOfDay(date).getTime() / DAY_MS)
}

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

export function eventDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** Build a 6×7 month grid that always starts on the configured week start. */
export function monthGrid(year: number, month: number, weekStartsOn: 0 | 1 = 0): Date[][] {
  const first = new Date(year, month, 1)
  const start = startOfWeek(first, weekStartsOn)
  const weeks: Date[][] = []
  let cursor = new Date(start)
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor))
      cursor = addDays(cursor, 1)
    }
    weeks.push(week)
  }
  return weeks
}

// ── Scope ranges ─────────────────────────────────────────────────────

export function getTodayRange(now = new Date()): TimeSlot {
  return { start: now, end: getEndOfDay(now) }
}

export function getTomorrowRange(now = new Date()): TimeSlot {
  const tomorrow = addDays(now, 1)
  return { start: getStartOfDay(tomorrow), end: getEndOfDay(tomorrow) }
}

export function getThisWeekRange(now = new Date()): TimeSlot {
  const day = now.getDay()
  const start = day >= 1 && day <= 5 ? now : getStartOfDay(addDays(now, (8 - day) % 7))
  const daysUntilFriday = ((5 - start.getDay()) + 7) % 7
  const friday = addDays(getStartOfDay(start), daysUntilFriday)
  return { start, end: getEndOfDay(friday) }
}

export function getThisWeekendRange(now = new Date()): TimeSlot {
  const day = now.getDay()
  if (day === 0) return { start: now, end: getEndOfDay(now) }
  const saturday = day === 6 ? getStartOfDay(now) : getStartOfDay(addDays(now, 6 - day))
  return { start: saturday, end: getEndOfDay(addDays(saturday, 1)) }
}

// ── Availability ─────────────────────────────────────────────────────

export function buildAvailabilitySlots(
  scopeStart: Date,
  scopeEnd: Date,
  availStart: string,
  availEnd: string,
): TimeSlot[] {
  const [startH, startM] = availStart.split(':').map(Number)
  const [endH, endM] = availEnd.split(':').map(Number)
  const slots: TimeSlot[] = []

  let day = getStartOfDay(scopeStart)
  const lastDay = getStartOfDay(scopeEnd)

  while (day <= lastDay) {
    const slotStart = new Date(day)
    slotStart.setHours(startH, startM, 0, 0)
    const slotEnd = new Date(day)
    slotEnd.setHours(endH, endM, 0, 0)

    const effectiveStart = slotStart < scopeStart ? scopeStart : slotStart
    const effectiveEnd = slotEnd > scopeEnd ? scopeEnd : slotEnd

    if (effectiveStart < effectiveEnd) {
      slots.push({ start: new Date(effectiveStart), end: new Date(effectiveEnd) })
    }
    day = addDays(day, 1)
  }

  return slots
}

export function timeRangesOverlap(a: TimeSlot, b: TimeSlot): boolean {
  return a.start < b.end && b.start < a.end
}

export function subtractOccupied(availability: TimeSlot[], occupied: TimeSlot[]): TimeSlot[] {
  let free = [...availability]

  for (const occ of occupied) {
    const next: TimeSlot[] = []
    for (const slot of free) {
      if (!timeRangesOverlap(slot, occ)) {
        next.push(slot)
        continue
      }
      if (slot.start < occ.start) {
        next.push({
          start: slot.start,
          end: new Date(Math.min(occ.start.getTime(), slot.end.getTime())),
        })
      }
      if (slot.end > occ.end) {
        next.push({
          start: new Date(Math.max(occ.end.getTime(), slot.start.getTime())),
          end: slot.end,
        })
      }
    }
    free = next
  }

  return free
    .filter((slot) => diffMinutes(slot.start, slot.end) >= 5)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

// ── Recurrence ───────────────────────────────────────────────────────

/** Expand a recurring event's pattern into concrete occurrences within a range. */
export function expandRecurrences(
  event: CalendarEvent,
  pattern: RecurrencePattern,
  rangeStart: Date,
  rangeEnd: Date,
): TimeSlot[] {
  const slots: TimeSlot[] = []
  const eventStart = new Date(event.start_time)
  const eventEnd = new Date(event.end_time)
  const durationMs = Math.max(eventEnd.getTime() - eventStart.getTime(), 0)
  const patternEnd = pattern.end_date ? new Date(pattern.end_date) : null
  const maxOccurrences = pattern.occurrence_count ?? 1000
  const interval = pattern.interval || 1

  if (pattern.frequency === 'weekly') {
    const days = pattern.days_of_week?.length ? pattern.days_of_week : [eventStart.getDay()]
    let weekStart = startOfWeek(rangeStart, 0)
    weekStart = addDays(weekStart, -7 * interval)
    let count = 0

    while (weekStart <= rangeEnd && count < maxOccurrences) {
      for (const dow of days) {
        const occDate = addDays(weekStart, dow)
        const occStart = new Date(occDate)
        occStart.setHours(eventStart.getHours(), eventStart.getMinutes(), 0, 0)
        const occEnd = new Date(occStart.getTime() + durationMs)

        if (occStart >= rangeEnd) continue
        if (occEnd < rangeStart) continue
        if (patternEnd && occStart > patternEnd) continue

        slots.push({ start: occStart, end: occEnd })
        count++
      }
      weekStart = addDays(weekStart, 7 * interval)
    }
  } else if (pattern.frequency === 'daily') {
    let current = new Date(eventStart)
    // Fast-forward to the range so decade-old series stay cheap to expand.
    if (current < rangeStart) {
      const skippedDays = Math.floor(
        (getStartOfDay(rangeStart).getTime() - getStartOfDay(current).getTime()) / DAY_MS,
      )
      const steps = Math.floor(skippedDays / interval)
      if (steps > 0) current = addDays(current, steps * interval)
    }
    let count = 0
    while (current <= rangeEnd && count < maxOccurrences) {
      const occEnd = new Date(current.getTime() + durationMs)
      if (occEnd > rangeStart && (!patternEnd || current <= patternEnd)) {
        slots.push({ start: new Date(current), end: occEnd })
        count++
      }
      current = addDays(current, interval)
    }
  } else if (pattern.frequency === 'monthly') {
    let current = new Date(eventStart)
    if (pattern.day_of_month) current.setDate(pattern.day_of_month)
    let count = 0
    while (current <= rangeEnd && count < maxOccurrences) {
      const occEnd = new Date(current.getTime() + durationMs)
      if (occEnd > rangeStart && (!patternEnd || current <= patternEnd)) {
        slots.push({ start: new Date(current), end: occEnd })
        count++
      }
      current = addMonths(current, interval)
      if (pattern.day_of_month) {
        const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
        current.setDate(Math.min(pattern.day_of_month, lastDay))
      }
    }
  } else if (pattern.frequency === 'yearly') {
    let current = new Date(eventStart)
    if (pattern.month_of_year != null) current.setMonth(pattern.month_of_year - 1)
    if (pattern.day_of_month) current.setDate(pattern.day_of_month)
    let count = 0
    while (current <= rangeEnd && count < maxOccurrences) {
      const occEnd = new Date(current.getTime() + durationMs)
      if (occEnd > rangeStart && (!patternEnd || current <= patternEnd)) {
        slots.push({ start: new Date(current), end: occEnd })
        count++
      }
      current = addYears(current, interval)
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime())
}

export type ExpandedEvent = CalendarEvent & {
  source_event_id: string
  occurrence_id: string
  is_occurrence: boolean
}

/**
 * Expand every recurring event in `events` into concrete occurrences so the
 * calendar can render them without persisting instances.
 */
export function expandCalendarEvents(
  events: CalendarEvent[],
  patterns: RecurrencePattern[],
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedEvent[] {
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]))
  const result: ExpandedEvent[] = []

  const pushOriginal = (event: CalendarEvent) => {
    result.push({
      ...event,
      source_event_id: event.id,
      occurrence_id: event.id,
      is_occurrence: false,
    })
  }

  for (const event of events) {
    if (!event.is_recurring || !event.recurrence_pattern_id) {
      pushOriginal(event)
      continue
    }

    const pattern = patternById.get(event.recurrence_pattern_id)
    if (!pattern) {
      pushOriginal(event)
      continue
    }

    const occurrences = expandRecurrences(event, pattern, rangeStart, rangeEnd)
    if (occurrences.length === 0) {
      pushOriginal(event)
      continue
    }

    for (const slot of occurrences) {
      const key = `${event.id}__${slot.start.getFullYear()}-${slot.start.getMonth() + 1}-${slot.start.getDate()}`
      result.push({
        ...event,
        id: key,
        occurrence_id: key,
        source_event_id: event.id,
        is_occurrence: true,
        start_time: slot.start.toISOString(),
        end_time: slot.end.toISOString(),
      })
    }
  }

  return result.sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  )
}

/** Next occurrence of a recurring task, strictly after `after`. */
export function getNextOccurrenceDate(pattern: RecurrencePattern, after: Date): Date | null {
  const patternEnd = pattern.end_date ? new Date(pattern.end_date) : null
  const interval = pattern.interval || 1
  let next: Date

  switch (pattern.frequency) {
    case 'daily':
      next = addDays(after, interval)
      break

    case 'weekly': {
      if (pattern.days_of_week?.length) {
        const sorted = [...pattern.days_of_week].sort((a, b) => a - b)
        const afterDay = after.getDay()
        const afterDate = getStartOfDay(after)

        for (const dow of sorted) {
          if (dow > afterDay) {
            const candidate = addDays(afterDate, dow - afterDay)
            if (!patternEnd || candidate <= patternEnd) return candidate
          }
        }

        const nextWeekSunday = addDays(afterDate, 7 * interval - afterDay)
        for (const dow of sorted) {
          const candidate = addDays(nextWeekSunday, dow)
          if (!patternEnd || candidate <= patternEnd) return candidate
        }
        return null
      }
      next = addDays(after, 7 * interval)
      break
    }

    case 'monthly': {
      next = addMonths(after, interval)
      if (pattern.day_of_month) {
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
        next.setDate(Math.min(pattern.day_of_month, lastDay))
      }
      break
    }

    case 'yearly': {
      next = addYears(after, interval)
      if (pattern.month_of_year != null) next.setMonth(pattern.month_of_year - 1)
      if (pattern.day_of_month) {
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
        next.setDate(Math.min(pattern.day_of_month, lastDay))
      }
      break
    }

    default:
      next = addDays(after, interval)
      break
  }

  if (patternEnd && next > patternEnd) return null
  return next
}

/** Human readable recurrence summary, e.g. "Every 2 weeks on Mon, Wed". */
export function describeRecurrence(pattern: RecurrencePattern): string {
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const interval = pattern.interval || 1
  const word = {
    daily: interval === 1 ? 'day' : 'days',
    weekly: interval === 1 ? 'week' : 'weeks',
    monthly: interval === 1 ? 'month' : 'months',
    yearly: interval === 1 ? 'year' : 'years',
    custom: interval === 1 ? 'interval' : 'intervals',
  }[pattern.frequency]

  let description = interval === 1 ? `Every ${word}` : `Every ${interval} ${word}`

  if (pattern.frequency === 'weekly' && pattern.days_of_week?.length) {
    description += ` on ${pattern.days_of_week.map((d) => dayLabels[d]).join(', ')}`
  }
  if (pattern.frequency === 'monthly' && pattern.day_of_month) {
    description += ` on day ${pattern.day_of_month}`
  }
  if (pattern.frequency === 'yearly') {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    if (pattern.month_of_year != null) description += ` in ${monthNames[pattern.month_of_year - 1]}`
    if (pattern.day_of_month) description += ` on day ${pattern.day_of_month}`
  }
  if (pattern.end_date) {
    description += ` until ${new Date(pattern.end_date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`
  }

  return description
}
