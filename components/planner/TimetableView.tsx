'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock3,
  Edit3,
  Grid3X3,
  List,
  MapPin,
  Plus,
  Repeat,
  Search,
  Trash2,
} from 'lucide-react'
import type { Project } from '@/lib/projects'
import type { CalendarEvent, RecurrencePattern } from '@/lib/events'
import { Button } from '@/components/ui/Button'
import {
  describeRecurrence,
  formatTime,
  hourLabel,
  minutesSinceMidnight,
} from '@/lib/planner/date-utils'
import type { TimetableViewMode } from '@/lib/planner/types'
import { CATEGORY_COLORS, SegmentedTabs } from './PlannerUi'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SCHEDULE_HOURS = Array.from({ length: 17 }, (_, index) => index + 6)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

type GroupBy = 'day' | 'frequency' | 'category' | 'none'

export interface TimetableEntry {
  event: CalendarEvent
  pattern?: RecurrencePattern
}

export interface TimetableViewProps {
  events: CalendarEvent[]
  recurrencePatterns: RecurrencePattern[]
  projects: Project[]
  onCreate: (day?: number, startHour?: number) => void
  onEdit: (event: CalendarEvent) => void
  onDelete: (event: CalendarEvent) => void
}

function entryColor(entry: TimetableEntry, project?: Project): string {
  if (entry.event.color && entry.event.color !== '#3B82F6') return entry.event.color
  if (project) return project.color
  if (entry.event.category && CATEGORY_COLORS[entry.event.category]) {
    return CATEGORY_COLORS[entry.event.category]
  }
  return 'var(--accent)'
}

function entryDays(entry: TimetableEntry): number[] {
  if (entry.pattern?.days_of_week?.length) return entry.pattern.days_of_week
  return [new Date(entry.event.start_time).getDay()]
}

function minutesOfDay(iso: string): number {
  return minutesSinceMidnight(new Date(iso))
}

export default function TimetableView({
  events,
  recurrencePatterns,
  projects,
  onCreate,
  onEdit,
  onDelete,
}: TimetableViewProps) {
  const [mode, setMode] = useState<TimetableViewMode>('schedule')
  const [groupBy, setGroupBy] = useState<GroupBy>('day')
  const [search, setSearch] = useState('')
  const [showCancelled, setShowCancelled] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )
  const patternById = useMemo(
    () => new Map(recurrencePatterns.map((pattern) => [pattern.id, pattern])),
    [recurrencePatterns],
  )

  const entries = useMemo<TimetableEntry[]>(() => {
    return events
      .filter((event) => event.category === 'timetable')
      .filter((event) => showCancelled || !event.is_cancelled)
      .map((event) => ({
        event,
        pattern: event.recurrence_pattern_id
          ? patternById.get(event.recurrence_pattern_id)
          : undefined,
      }))
      .filter((entry) => {
        const query = search.trim().toLowerCase()
        if (!query) return true
        const project = entry.event.project_id ? projectById.get(entry.event.project_id) : undefined
        return [entry.event.title, entry.event.location ?? '', project?.name ?? '']
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
      .sort((a, b) => minutesOfDay(a.event.start_time) - minutesOfDay(b.event.start_time))
  }, [events, patternById, projectById, search, showCancelled])

  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: 'All entries', entries }]

    const map = new Map<string, { key: string; label: string; order: number; entries: TimetableEntry[] }>()
    const add = (key: string, label: string, order: number, entry: TimetableEntry) => {
      const group = map.get(key) ?? { key, label, order, entries: [] }
      group.entries.push(entry)
      map.set(key, group)
    }

    for (const entry of entries) {
      if (groupBy === 'day') {
        for (const day of entryDays(entry)) {
          add(String(day), FULL_DAY_NAMES[day], DAY_ORDER.indexOf(day), entry)
        }
      } else if (groupBy === 'frequency') {
        const frequency = entry.pattern?.frequency ?? 'custom'
        add(frequency, frequency.charAt(0).toUpperCase() + frequency.slice(1), 0, entry)
      } else {
        const category = entry.event.project_id
          ? projectById.get(entry.event.project_id)?.name ?? 'No project'
          : 'No project'
        add(category, category, 0, entry)
      }
    }

    return Array.from(map.values()).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  }, [entries, groupBy, projectById])

  const totalMinutes = entries.reduce((sum, entry) => {
    const start = minutesOfDay(entry.event.start_time)
    const end = minutesOfDay(entry.event.end_time)
    return sum + Math.max(0, end - start)
  }, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedTabs
          ariaLabel="Timetable view"
          value={mode}
          onChange={setMode}
          options={[
            { key: 'schedule', label: 'Schedule', icon: CalendarDays },
            { key: 'grid', label: 'Grid', icon: Grid3X3 },
            { key: 'cards', label: 'Cards', icon: List },
            { key: 'timeline', label: 'Timeline', icon: Clock3 },
          ]}
        />

        <div className="relative min-w-[160px] flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the timetable…"
            className="glass-input h-8 w-full pl-8 pr-2 text-[12px]"
          />
        </div>

        {(mode === 'cards' || mode === 'grid') && (
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GroupBy)}
            aria-label="Group timetable entries"
            className="glass-input h-8 px-2 text-[12px]"
          >
            <option value="day">Group: weekday</option>
            <option value="frequency">Group: frequency</option>
            <option value="category">Group: project</option>
            <option value="none">No grouping</option>
          </select>
        )}

        <button
          type="button"
          onClick={() => setShowCancelled((current) => !current)}
          aria-pressed={showCancelled}
          className={`focus-ring flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
            showCancelled
              ? 'border-accent bg-[var(--accent-light)] text-accent'
              : 'border-[var(--border)] text-muted hover:text-foreground'
          }`}
        >
          Cancelled
        </button>

        <Button type="button" variant="primary" size="sm" icon={Plus} onClick={() => onCreate()}>
          New entry
        </Button>
      </div>

      <p className="text-[11px] text-muted">
        {entries.length} recurring {entries.length === 1 ? 'entry' : 'entries'} ·{' '}
        {Math.round(totalMinutes / 60)}h scheduled each week
      </p>

      {entries.length === 0 ? (
        <div className="glass-card flex flex-col items-center px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-light)] text-accent">
            <Repeat size={22} />
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">Your timetable is empty</p>
          <p className="mt-1 max-w-md text-xs leading-5 text-muted">
            Add recurring blocks for classes, gym sessions or weekly habits. They repeat every week
            and also appear in the calendar.
          </p>
          <Button type="button" variant="primary" size="sm" icon={Plus} onClick={() => onCreate()} className="mt-4">
            Add timetable entry
          </Button>
        </div>
      ) : mode === 'schedule' ? (
        <ScheduleView
          entries={entries}
          projectById={projectById}
          onEdit={onEdit}
          onDelete={(event) => {
            if (confirmDeleteId !== event.id) {
              setConfirmDeleteId(event.id)
              return
            }
            onDelete(event)
            setConfirmDeleteId(null)
          }}
          onCreate={onCreate}
        />
      ) : mode === 'timeline' ? (
        <TimelineView
          entries={entries}
          projectById={projectById}
          onEdit={onEdit}
          onDelete={(event) => {
            if (confirmDeleteId !== event.id) {
              setConfirmDeleteId(event.id)
              return
            }
            onDelete(event)
            setConfirmDeleteId(null)
          }}
        />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <section key={group.key} className="glass-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
                  {group.label}
                </h3>
                <span className="text-[10px] text-muted">{group.entries.length}</span>
              </div>
              <div className={mode === 'grid' ? 'grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-1 p-2'}>
                {group.entries.map((entry) => {
                  const project = entry.event.project_id
                    ? projectById.get(entry.event.project_id)
                    : undefined
                  const color = entryColor(entry, project)
                  const start = formatTime(new Date(entry.event.start_time))
                  const end = formatTime(new Date(entry.event.end_time))
                  const confirming = confirmDeleteId === entry.event.id

                  return (
                    <article
                      key={`${entry.event.id}-${group.key}`}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-2.5"
                      style={{ borderLeft: `3px solid ${color}` }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate text-[12px] font-semibold text-foreground">
                            {entry.event.title}
                          </h4>
                          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted">
                            <span className="inline-flex items-center gap-1">
                              <Clock3 size={9} />
                              {start} – {end}
                            </span>
                            {entry.event.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin size={9} />
                                {entry.event.location}
                              </span>
                            )}
                            {project && (
                              <span className="inline-flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                                {project.name}
                              </span>
                            )}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted">
                            <Repeat size={9} />
                            {entry.pattern ? describeRecurrence(entry.pattern) : 'Weekly'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => onEdit(entry.event)}
                            aria-label={`Edit ${entry.event.title}`}
                            className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
                          >
                            <Edit3 size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirming) {
                                setConfirmDeleteId(entry.event.id)
                                return
                              }
                              onDelete(entry.event)
                              setConfirmDeleteId(null)
                            }}
                            aria-label={confirming ? 'Confirm delete' : `Delete ${entry.event.title}`}
                            className={`focus-ring flex h-6 w-6 items-center justify-center rounded-md ${
                              confirming ? 'bg-[var(--danger-light)] text-danger' : 'text-muted hover:text-danger'
                            }`}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      {confirming && (
                        <p className="mt-1 text-[10px] font-semibold text-danger">
                          Tap delete again to confirm
                        </p>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleView({
  entries,
  projectById,
  onEdit,
  onDelete,
  onCreate,
}: {
  entries: TimetableEntry[]
  projectById: Map<string, Project>
  onEdit: (event: CalendarEvent) => void
  onDelete: (event: CalendarEvent) => void
  onCreate: (day?: number, startHour?: number) => void
}) {
  const startHour = SCHEDULE_HOURS[0]
  const endHour = SCHEDULE_HOURS[SCHEDULE_HOURS.length - 1] + 1
  const hourHeight = 48

  return (
    <div className="glass-card overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-[var(--border)] bg-[var(--surface-sunken)]">
          <div />
          {DAY_ORDER.map((day) => (
            <div key={day} className="border-l border-[var(--border)] py-2 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                {DAY_NAMES[day]}
              </span>
            </div>
          ))}
        </div>

        <div className="relative" style={{ height: (endHour - startHour) * hourHeight }}>
          {SCHEDULE_HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex items-start border-t border-[var(--border)]"
              style={{ top: (hour - startHour) * hourHeight }}
            >
              <span className="w-16 shrink-0 px-2 py-0.5 text-right text-[9px] font-semibold tabular-nums text-muted">
                {hourLabel(hour)}
              </span>
            </div>
          ))}

          {DAY_ORDER.map((day, columnIndex) => {
            const columnEntries = entries.filter((entry) => entryDays(entry).includes(day))
            return (
              <div
                key={day}
                className="absolute bottom-0 top-0 border-l border-[var(--border)]"
                style={{
                  left: `calc(64px + (100% - 64px) * ${columnIndex} / 7)`,
                  width: 'calc((100% - 64px) / 7)',
                }}
              >
                <button
                  type="button"
                  aria-label={`Add entry on ${FULL_DAY_NAMES[day]}`}
                  onClick={() => onCreate(day, 9)}
                  className="absolute inset-0 cursor-copy"
                />
                {columnEntries.map((entry) => {
                  const startMinutes = minutesOfDay(entry.event.start_time)
                  const endMinutes = minutesOfDay(entry.event.end_time)
                  const top = ((startMinutes - startHour * 60) / 60) * hourHeight
                  const height = Math.max(24, ((endMinutes - startMinutes) / 60) * hourHeight)
                  const project = entry.event.project_id
                    ? projectById.get(entry.event.project_id)
                    : undefined
                  const color = entryColor(entry, project)

                  return (
                    <button
                      key={`${entry.event.id}-${day}`}
                      type="button"
                      onClick={() => onEdit(entry.event)}
                      className="absolute inset-x-1 z-10 overflow-hidden rounded-lg border border-white/25 px-1.5 py-1 text-left text-white shadow-sm transition-[filter] hover:brightness-105"
                      style={{ top, height, backgroundColor: color }}
                      title={entry.event.title}
                    >
                      <span className="block truncate text-[10px] font-semibold leading-tight">
                        {entry.event.title}
                      </span>
                      <span className="block truncate text-[9px] leading-tight opacity-85">
                        {formatTime(new Date(entry.event.start_time))} –{' '}
                        {formatTime(new Date(entry.event.end_time))}
                      </span>
                      {height >= 56 && entry.event.location && (
                        <span className="mt-0.5 flex items-center gap-0.5 truncate text-[9px] opacity-80">
                          <MapPin size={8} />
                          {entry.event.location}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TimelineView({
  entries,
  projectById,
  onEdit,
  onDelete,
}: {
  entries: TimetableEntry[]
  projectById: Map<string, Project>
  onEdit: (event: CalendarEvent) => void
  onDelete: (event: CalendarEvent) => void
}) {
  const days = useMemo(() => {
    return DAY_ORDER.map((day) => ({
      day,
      entries: entries
        .filter((entry) => entryDays(entry).includes(day))
        .sort((a, b) => minutesOfDay(a.event.start_time) - minutesOfDay(b.event.start_time)),
    })).filter((group) => group.entries.length > 0)
  }, [entries])

  return (
    <div className="space-y-4">
      {days.map(({ day, entries: dayEntries }) => (
        <section key={day} className="glass-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
              {FULL_DAY_NAMES[day]}
            </h3>
            <span className="text-[10px] text-muted">{dayEntries.length} blocks</span>
          </div>
          <ol className="relative space-y-1 p-3">
            {dayEntries.map((entry) => {
              const project = entry.event.project_id
                ? projectById.get(entry.event.project_id)
                : undefined
              const color = entryColor(entry, project)
              const start = new Date(entry.event.start_time)
              const end = new Date(entry.event.end_time)
              const duration = Math.max(0, (end.getTime() - start.getTime()) / 60_000)
              return (
                <li key={entry.event.id} className="flex items-stretch gap-2">
                  <span className="w-12 shrink-0 pt-0.5 text-right text-[10px] font-semibold tabular-nums text-muted">
                    {formatTime(start)}
                  </span>
                  <span
                    className="w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <button
                    type="button"
                    onClick={() => onEdit(entry.event)}
                    className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <span className="block truncate text-[12px] font-medium text-foreground">
                      {entry.event.title}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
                      <span>{formatTime(end)}</span>
                      <span>{Math.round(duration)} min</span>
                      {entry.event.location && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin size={9} />
                          {entry.event.location}
                        </span>
                      )}
                      {entry.pattern && (
                        <span className="inline-flex items-center gap-0.5">
                          <Repeat size={9} />
                          {describeRecurrence(entry.pattern)}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(entry.event)}
                    aria-label={`Delete ${entry.event.title}`}
                    className="focus-ring flex w-6 shrink-0 items-center justify-center rounded-md text-muted hover:text-danger"
                  >
                    <Trash2 size={11} />
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
