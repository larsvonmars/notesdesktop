/**
 * Calendar export — builds an RFC 5545 iCalendar document from events.
 * Recurring events are exported as RRULEs of the parent event.
 */

import type { CalendarEvent, RecurrencePattern } from '../events'

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function toUtcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

function toDateStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Fold long lines at 75 octets as required by RFC 5545. */
function fold(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  let remaining = line
  chunks.push(remaining.slice(0, 75))
  remaining = remaining.slice(75)
  while (remaining.length > 0) {
    chunks.push(` ${remaining.slice(0, 74)}`)
    remaining = remaining.slice(74)
  }
  return chunks.join('\r\n')
}

function buildRRule(pattern: RecurrencePattern): string {
  const frequency = pattern.frequency.toUpperCase()
  const parts = [`FREQ=${frequency}`, `INTERVAL=${pattern.interval || 1}`]

  if (pattern.frequency === 'weekly' && pattern.days_of_week?.length) {
    parts.push(`BYDAY=${pattern.days_of_week.map((day) => WEEKDAY_CODES[day]).join(',')}`)
  }
  if (pattern.frequency === 'monthly' && pattern.day_of_month) {
    parts.push(`BYMONTHDAY=${pattern.day_of_month}`)
  }
  if (pattern.frequency === 'yearly') {
    if (pattern.month_of_year) parts.push(`BYMONTH=${pattern.month_of_year}`)
    if (pattern.day_of_month) parts.push(`BYMONTHDAY=${pattern.day_of_month}`)
  }
  if (pattern.occurrence_count) {
    parts.push(`COUNT=${pattern.occurrence_count}`)
  } else if (pattern.end_date) {
    parts.push(`UNTIL=${toUtcStamp(new Date(pattern.end_date))}`)
  }

  return parts.join(';')
}

export function buildIcs(
  events: CalendarEvent[],
  patterns: RecurrencePattern[] = [],
  calendarName = 'MindViz Planner',
): string {
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]))
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MindViz//Notes Planner//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]

  for (const event of events) {
    if (event.is_cancelled) continue
    const start = new Date(event.start_time)
    const end = new Date(event.end_time)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.id}@mindviz`)
    lines.push(`DTSTAMP:${toUtcStamp(new Date())}`)

    if (event.is_all_day) {
      lines.push(`DTSTART;VALUE=DATE:${toDateStamp(start)}`)
      lines.push(`DTEND;VALUE=DATE:${toDateStamp(end)}`)
    } else {
      lines.push(`DTSTART:${toUtcStamp(start)}`)
      lines.push(`DTEND:${toUtcStamp(end)}`)
    }

    lines.push(`SUMMARY:${escapeText(event.title)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
    if (event.category) lines.push(`CATEGORIES:${escapeText(event.category)}`)
    if (event.meeting_url) lines.push(`URL:${escapeText(event.meeting_url)}`)
    if (event.is_recurring && event.recurrence_pattern_id) {
      const pattern = patternById.get(event.recurrence_pattern_id)
      if (pattern && pattern.frequency !== 'custom') {
        lines.push(`RRULE:${buildRRule(pattern)}`)
      }
    }
    if (event.color) {
      lines.push(`COLOR:${event.color}`)
    }

    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n')
}

export function downloadIcs(filename: string, content: string): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
