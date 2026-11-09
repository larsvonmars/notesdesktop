'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  Filter,
  MapPin,
  Repeat,
  Search,
  Trash2,
  X,
  Pencil,
  CalendarClock,
} from 'lucide-react'
import type { Project } from '@/lib/projects'
import type { CalendarEvent, RecurrencePattern } from '@/lib/events'
import type { Task } from '@/lib/tasks'
import { Button } from '@/components/ui/Button'
import {
  addDays,
  addMonths,
  dayIndex,
  eventDateKey,
  expandCalendarEvents,
  formatTime,
  getEndOfDay,
  getStartOfDay,
  hourLabel,
  isSameDay,
  minutesSinceMidnight,
  monthGrid,
  startOfWeek,
  type ExpandedEvent,
} from '@/lib/planner/date-utils'
import type { CalendarViewMode, PlannerDisplayPreferences } from '@/lib/planner/types'
import {
  CATEGORY_COLORS,
  PRIORITY_META,
  SegmentedTabs,
  dueLabel,
} from './PlannerUi'

const HOUR_HEIGHT = 56
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function weekdayLabels(weekStartsOn: 0 | 1): string[] {
  const short = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const ordered = [...short.slice(weekStartsOn), ...short.slice(0, weekStartsOn)]
  return ordered
}

function orderedWeekdays(weekStartsOn: 0 | 1): number[] {
  return [...Array(7).keys()].map((index) => (index + weekStartsOn) % 7)
}

function eventColor(event: CalendarEvent): string {
  if (event.color && event.color !== '#3B82F6') return event.color
  if (event.category && CATEGORY_COLORS[event.category]) return CATEGORY_COLORS[event.category]
  return 'var(--accent)'
}

function taskColor(task: Task): string {
  return task.color ?? PRIORITY_META[task.priority].color
}

function eventStartDay(event: CalendarEvent): Date {
  return getStartOfDay(new Date(event.start_time))
}

function eventEndDay(event: CalendarEvent): Date {
  return getStartOfDay(new Date(event.end_time))
}

function isMultiDay(event: CalendarEvent): boolean {
  return dayIndex(eventEndDay(event)) > dayIndex(eventStartDay(event))
}

interface SpanInfo {
  event: ExpandedEvent
  colStart: number
  colEnd: number
  startsHere: boolean
}

function computeSpans(events: ExpandedEvent[], rangeStart: Date, colCount: number): SpanInfo[] {
  const rangeIdx = dayIndex(rangeStart)
  const lastIdx = rangeIdx + colCount - 1
  const spans: SpanInfo[] = []

  for (const event of events) {
    if (!isMultiDay(event)) continue
    const startIdx = dayIndex(eventStartDay(event))
    const endIdx = dayIndex(eventEndDay(event))
    if (endIdx < rangeIdx || startIdx > lastIdx) continue
    spans.push({
      event,
      colStart: Math.max(0, startIdx - rangeIdx),
      colEnd: Math.min(colCount - 1, endIdx - rangeIdx),
      startsHere: startIdx >= rangeIdx,
    })
  }

  return spans.sort((a, b) => a.colStart - b.colStart || a.colEnd - b.colEnd)
}

function assignLanes(spans: SpanInfo[]): Map<string, number> {
  const laneEnds: number[] = []
  const lanes = new Map<string, number>()

  for (const span of spans) {
    let lane = laneEnds.findIndex((end) => end < span.colStart)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(-1)
    }
    laneEnds[lane] = span.colEnd
    lanes.set(span.event.occurrence_id, lane)
  }

  return lanes
}

function barsPerColumn(spans: SpanInfo[], colCount: number): number[] {
  const counts = new Array<number>(colCount).fill(0)
  for (const span of spans) {
    for (let column = span.colStart; column <= span.colEnd; column++) counts[column]++
  }
  return counts
}

interface TimedLayout {
  left: number
  width: number
}

function layoutTimedEvents(
  events: ExpandedEvent[],
  dayStart: Date,
  dayEnd: Date,
): Map<string, TimedLayout> {
  type Item = { event: ExpandedEvent; start: Date; end: Date }
  const items: Item[] = events
    .filter((event) => !event.is_all_day)
    .map((event) => {
      const start = new Date(event.start_time)
      const end = new Date(event.end_time)
      return {
        event,
        start: start < dayStart ? dayStart : start,
        end: end > dayEnd ? dayEnd : end,
      }
    })
    .filter((item) => item.start < dayEnd && item.end > dayStart)
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime())

  const layouts = new Map<string, TimedLayout>()
  if (items.length === 0) return layouts

  const clusters: Item[][] = []
  let current: Item[] = [items[0]]
  let clusterEnd = items[0].end.getTime()

  for (let index = 1; index < items.length; index++) {
    const item = items[index]
    if (item.start.getTime() < clusterEnd) {
      current.push(item)
      if (item.end.getTime() > clusterEnd) clusterEnd = item.end.getTime()
    } else {
      clusters.push(current)
      current = [item]
      clusterEnd = item.end.getTime()
    }
  }
  clusters.push(current)

  for (const cluster of clusters) {
    const columns: Item[][] = []
    for (const item of cluster) {
      let placed = false
      for (const column of columns) {
        const last = column[column.length - 1]
        if (item.start.getTime() >= last.end.getTime()) {
          column.push(item)
          placed = true
          break
        }
      }
      if (!placed) columns.push([item])
    }

    const total = columns.length
    columns.forEach((column, columnIndex) => {
      for (const item of column) {
        layouts.set(item.event.occurrence_id, {
          left: (columnIndex / total) * 100,
          width: (1 / total) * 100,
        })
      }
    })
  }

  return layouts
}

export interface CalendarViewProps {
  events: CalendarEvent[]
  recurrencePatterns: RecurrencePattern[]
  tasks: Task[]
  projects: Project[]
  display: PlannerDisplayPreferences
  initialView?: CalendarViewMode
  onViewChange?: (view: CalendarViewMode) => void
  onNewEvent: (start?: Date) => void
  onEditEvent: (event: CalendarEvent) => void
  onDeleteEvent: (event: CalendarEvent) => void
  onNewTask: (dueDate?: Date) => void
  onOpenTask: (task: Task) => void
  onExport: () => void
}

export default function CalendarView({
  events,
  recurrencePatterns,
  tasks,
  projects,
  display,
  initialView,
  onViewChange,
  onNewEvent,
  onEditEvent,
  onDeleteEvent,
  onNewTask,
  onOpenTask,
  onExport,
}: CalendarViewProps) {
  const [view, setView] = useState<CalendarViewMode>(initialView ?? display.defaultCalendarView)
  const [selectedDate, setSelectedDate] = useState(() => getStartOfDay(new Date()))
  const [showFilters, setShowFilters] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [showCancelled, setShowCancelled] = useState(false)
  const [showAllDay, setShowAllDay] = useState(true)
  const [showRecurring, setShowRecurring] = useState(true)
  const [showTasks, setShowTasks] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const [dayPopover, setDayPopover] = useState<{ date: Date; x: number; y: number } | null>(null)
  const [morePopover, setMorePopover] = useState<{
    date: Date
    events: ExpandedEvent[]
    tasks: Task[]
    x: number
    y: number
  } | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<ExpandedEvent | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const popoverRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)

  const startHour = display.dayStartHour
  const endHour = display.dayEndHour
  const hours = useMemo(
    () => Array.from({ length: Math.max(1, endHour - startHour + 1) }, (_, index) => index + startHour),
    [startHour, endHour],
  )

  const changeView = useCallback(
    (next: CalendarViewMode) => {
      setView(next)
      onViewChange?.(next)
    },
    [onViewChange],
  )

  const goToday = useCallback(() => setSelectedDate(getStartOfDay(new Date())), [])
  const goPrev = useCallback(() => {
    setSelectedDate((current) => {
      if (view === 'month') return addMonths(current, -1)
      if (view === 'week') return addDays(current, -7)
      return addDays(current, -1)
    })
  }, [view])
  const goNext = useCallback(() => {
    setSelectedDate((current) => {
      if (view === 'month') return addMonths(current, 1)
      if (view === 'week') return addDays(current, 7)
      return addDays(current, 1)
    })
  }, [view])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      } else if (event.key === 'ArrowDown' && view !== 'day') {
        event.preventDefault()
        changeView('day')
      } else if (event.key === 'ArrowUp' && view === 'day') {
        event.preventDefault()
        changeView('week')
      } else if (event.key.toLowerCase() === 't') {
        goToday()
      } else if (event.key.toLowerCase() === 'm') {
        changeView('month')
      } else if (event.key.toLowerCase() === 'w') {
        changeView('week')
      } else if (event.key.toLowerCase() === 'd') {
        changeView('day')
      } else if (event.key.toLowerCase() === 'a') {
        changeView('agenda')
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [changeView, goNext, goPrev, goToday, view])

  useEffect(() => {
    if (!dayPopover && !morePopover) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || moreRef.current?.contains(target)) return
      setDayPopover(null)
      setMorePopover(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDayPopover(null)
        setMorePopover(null)
      }
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
    }, 40)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [dayPopover, morePopover])

  const expansionRange = useMemo(() => {
    if (view === 'month') {
      const first = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
      const start = startOfWeek(first, display.weekStartsOn)
      return { start, end: addDays(start, 42) }
    }
    if (view === 'week') {
      const start = startOfWeek(selectedDate, display.weekStartsOn)
      return { start, end: addDays(start, 7) }
    }
    if (view === 'day') {
      const start = getStartOfDay(selectedDate)
      return { start, end: addDays(start, 1) }
    }
    const today = getStartOfDay(new Date())
    return { start: today, end: addDays(today, 90) }
  }, [view, selectedDate, display.weekStartsOn])

  const expandedEvents = useMemo(
    () =>
      expandCalendarEvents(
        events,
        recurrencePatterns,
        expansionRange.start,
        expansionRange.end,
      ),
    [events, recurrencePatterns, expansionRange],
  )

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const event of expandedEvents) if (event.category) set.add(event.category)
    return Array.from(set).sort()
  }, [expandedEvents])

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return expandedEvents.filter((event) => {
      if (!showCancelled && event.is_cancelled) return false
      if (!showAllDay && event.is_all_day) return false
      if (!showRecurring && event.is_recurring) return false
      if (
        selectedCategories.size > 0 &&
        (!event.category || !selectedCategories.has(event.category))
      ) {
        return false
      }
      if (query) {
        const haystack = [event.title, event.description, event.location, event.category]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [expandedEvents, showCancelled, showAllDay, showRecurring, selectedCategories, searchQuery])

  const tasksWithDueDate = useMemo(
    () => (showTasks ? tasks.filter((task) => task.due_date) : []),
    [tasks, showTasks],
  )

  const activeFilterCount =
    (selectedCategories.size > 0 ? 1 : 0) +
    (!showAllDay ? 1 : 0) +
    (!showRecurring ? 1 : 0) +
    (showCancelled ? 1 : 0) +
    (searchQuery ? 1 : 0) +
    (!showTasks ? 1 : 0)

  const resetFilters = () => {
    setSelectedCategories(new Set())
    setShowCancelled(false)
    setShowAllDay(true)
    setShowRecurring(true)
    setShowTasks(true)
    setSearchQuery('')
  }

  const title = useMemo(() => {
    if (view === 'agenda') return 'Upcoming agenda'
    if (view === 'month') {
      return selectedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    }
    if (view === 'week') {
      const start = startOfWeek(selectedDate, display.weekStartsOn)
      const end = addDays(start, 6)
      if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString(undefined, { month: 'long' })} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`
      }
      return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${end.getFullYear()}`
    }
    return selectedDate.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }, [view, selectedDate, display.weekStartsOn])

  const openDayPopover = (date: Date, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setMorePopover(null)
    setDayPopover({
      date,
      x: Math.min(rect.left + rect.width / 2, window.innerWidth - 120),
      y: rect.bottom + 4,
    })
  }

  const handleEmptySlotClick = (date: Date, event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const offsetY = event.clientY - rect.top
    const minutes = startHour * 60 + Math.round((offsetY / HOUR_HEIGHT) * 60)
    const start = new Date(date)
    start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    onNewEvent(start)
  }

  const viewDay = (date: Date) => {
    setDayPopover(null)
    setMorePopover(null)
    setSelectedDate(date)
    changeView('day')
  }

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-4">
        <div className="animate-rise-in flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="secondary" size="sm" icon={ChevronLeft} onClick={goPrev} aria-label="Previous" />
            <Button type="button" variant="secondary" size="sm" icon={ChevronRight} onClick={goNext} aria-label="Next" />
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={goToday}>
            Today
          </Button>
          <h2 className="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </h2>

          <SegmentedTabs
            ariaLabel="Calendar view"
            value={view}
            onChange={changeView}
            options={[
              { key: 'month', label: 'Month' },
              { key: 'week', label: 'Week' },
              { key: 'day', label: 'Day' },
              { key: 'agenda', label: 'Agenda' },
            ]}
          />

          <Button type="button" variant="primary" size="sm" icon={CalendarPlus} onClick={() => onNewEvent()}>
            New event
          </Button>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            aria-expanded={showFilters}
            aria-label="Toggle calendar filters"
            className={`focus-ring relative flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'border-accent bg-[var(--accent-light)] text-accent'
                : 'border-[var(--border)] text-muted hover:text-foreground'
            }`}
          >
            <Filter size={14} />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="animate-rise-in space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Filters</span>
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] font-semibold text-accent hover:underline"
              >
                Reset all
              </button>
            </div>

            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search events, places, categories…"
                className="glass-input h-9 w-full pl-9 pr-3 text-sm"
              />
            </div>

            {categories.length > 0 && (
              <div>
                <span className="mb-1.5 block text-[11px] font-semibold text-muted">Categories</span>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((category) => {
                    const active = selectedCategories.has(category)
                    const color = CATEGORY_COLORS[category] ?? 'var(--accent)'
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() =>
                          setSelectedCategories((current) => {
                            const next = new Set(current)
                            if (next.has(category)) next.delete(category)
                            else next.add(category)
                            return next
                          })
                        }
                        aria-pressed={active}
                        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors"
                        style={{
                          borderColor: active ? color : 'var(--border)',
                          backgroundColor: active ? `${color}18` : 'transparent',
                          color: active ? color : 'var(--muted)',
                        }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        {category}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <FilterChip label="Tasks" active={showTasks} onToggle={() => setShowTasks((value) => !value)} icon={Check} />
              <FilterChip label="All-day" active={showAllDay} onToggle={() => setShowAllDay((value) => !value)} icon={Eye} />
              <FilterChip label="Recurring" active={showRecurring} onToggle={() => setShowRecurring((value) => !value)} icon={Repeat} />
              <FilterChip label="Cancelled" active={showCancelled} onToggle={() => setShowCancelled((value) => !value)} icon={EyeOff} />
            </div>
          </div>
        )}

        <div className="animate-rise-in">
          {view === 'month' && (
            <MonthView
              events={filteredEvents}
              tasks={tasksWithDueDate}
              selectedDate={selectedDate}
              weekStartsOn={display.weekStartsOn}
              onSelectDay={openDayPopover}
              onEventClick={(event) => {
                setConfirmingDelete(false)
                setSelectedEvent(event)
              }}
              onTaskClick={onOpenTask}
              onViewDay={viewDay}
              onMoreClick={(date, dayEvents, dayTasks, event) => {
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
                setDayPopover(null)
                setMorePopover({
                  date,
                  events: dayEvents,
                  tasks: dayTasks,
                  x: Math.min(rect.left, window.innerWidth - 300),
                  y: rect.bottom + 4,
                })
              }}
            />
          )}
          {view === 'week' && (
            <WeekView
              events={filteredEvents}
              tasks={tasksWithDueDate}
              selectedDate={selectedDate}
              weekStartsOn={display.weekStartsOn}
              hours={hours}
              startHour={startHour}
              onSelectDay={openDayPopover}
              onEventClick={(event) => {
                setConfirmingDelete(false)
                setSelectedEvent(event)
              }}
              onTaskClick={onOpenTask}
              onSlotClick={handleEmptySlotClick}
            />
          )}
          {view === 'day' && (
            <DayView
              events={filteredEvents}
              tasks={tasksWithDueDate}
              selectedDate={selectedDate}
              hours={hours}
              startHour={startHour}
              onEventClick={(event) => {
                setConfirmingDelete(false)
                setSelectedEvent(event)
              }}
              onTaskClick={onOpenTask}
              onSlotClick={handleEmptySlotClick}
            />
          )}
          {view === 'agenda' && (
            <AgendaView
              events={filteredEvents}
              tasks={tasksWithDueDate}
              onEventClick={(event) => {
                setConfirmingDelete(false)
                setSelectedEvent(event)
              }}
              onTaskClick={onOpenTask}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
          <span>
            {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}
            {filteredEvents.length !== expandedEvents.length && ` of ${expandedEvents.length}`}
          </span>
          {showTasks && <span>· {tasksWithDueDate.length} tasks</span>}
          {categories.length > 0 && (
            <span className="flex items-center gap-1">
              {categories.slice(0, 6).map((category) => (
                <span
                  key={category}
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[category] ?? 'var(--accent)' }}
                  title={category}
                />
              ))}
            </span>
          )}
          <button
            type="button"
            onClick={onExport}
            className="ml-auto text-[11px] font-semibold text-accent hover:underline"
          >
            Export .ics
          </button>
        </div>
      </div>

      <aside className="hidden w-72 shrink-0 flex-col gap-4 lg:flex">
        <MiniCalendar
          selectedDate={selectedDate}
          weekStartsOn={display.weekStartsOn}
          onSelect={(date) => {
            setSelectedDate(date)
            changeView('day')
          }}
          onPrevMonth={() => setSelectedDate((current) => addMonths(current, -1))}
          onNextMonth={() => setSelectedDate((current) => addMonths(current, 1))}
          events={filteredEvents}
          tasks={tasksWithDueDate}
        />

        <div className="glass-card p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Keyboard shortcuts
          </h3>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted">
            <span className="flex items-center gap-1.5"><kbd className="kbd">←</kbd> Previous</span>
            <span className="flex items-center gap-1.5"><kbd className="kbd">→</kbd> Next</span>
            <span className="flex items-center gap-1.5"><kbd className="kbd">T</kbd> Today</span>
            <span className="flex items-center gap-1.5"><kbd className="kbd">M</kbd> Month</span>
            <span className="flex items-center gap-1.5"><kbd className="kbd">W</kbd> Week</span>
            <span className="flex items-center gap-1.5"><kbd className="kbd">D</kbd> Day</span>
          </div>
        </div>

        <div className="glass-card p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Today at a glance
          </h3>
          <ul className="space-y-1.5 text-[12px]">
            {filteredEvents
              .filter((event) => isSameDay(new Date(event.start_time), new Date()))
              .slice(0, 5)
              .map((event) => (
                <li key={event.occurrence_id} className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: eventColor(event) }} />
                  <button
                    type="button"
                    onClick={() => setSelectedEvent(event)}
                    className="min-w-0 flex-1 truncate text-left text-foreground hover:underline"
                  >
                    {event.title}
                  </button>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted">
                    {event.is_all_day ? 'All day' : formatTime(new Date(event.start_time))}
                  </span>
                </li>
              ))}
            {filteredEvents.filter((event) => isSameDay(new Date(event.start_time), new Date())).length === 0 && (
              <li className="text-muted">Nothing scheduled today.</li>
            )}
          </ul>
        </div>
      </aside>

      {dayPopover &&
        createPortal(
          <div
            ref={popoverRef}
            className="glass-popover fixed z-[60] w-56 rounded-2xl p-1.5"
            style={{
              left: Math.min(Math.max(dayPopover.x - 112, 8), window.innerWidth - 240),
              top: Math.min(dayPopover.y, window.innerHeight - 170),
            }}
          >
            <div className="mb-1 px-2 py-1 text-[11px] font-semibold text-muted">
              {dayPopover.date.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </div>
            {[
              { label: 'New event', icon: CalendarPlus, action: () => { onNewEvent(dayPopover.date); setDayPopover(null) } },
              { label: 'New task', icon: Check, action: () => { onNewTask(dayPopover.date); setDayPopover(null) } },
              { label: 'View day', icon: Eye, action: () => viewDay(dayPopover.date) },
            ].map(({ label, icon: Icon, action }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className="focus-ring flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-[var(--surface-hover)]"
              >
                <Icon size={15} className="text-muted" />
                {label}
              </button>
            ))}
          </div>,
          document.body,
        )}

      {morePopover &&
        createPortal(
          <div
            ref={moreRef}
            className="glass-popover fixed z-[60] max-h-80 w-72 overflow-y-auto rounded-2xl p-2 scroll-thin"
            style={{
              left: Math.min(Math.max(morePopover.x, 8), window.innerWidth - 296),
              top: Math.min(morePopover.y, window.innerHeight - 340),
            }}
          >
            <div className="sticky top-0 z-10 mb-1 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
              <span className="text-[11px] font-semibold">
                {morePopover.date.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
              <button
                type="button"
                onClick={() => viewDay(morePopover.date)}
                className="text-[11px] font-semibold text-accent hover:underline"
              >
                View day
              </button>
            </div>
            <div className="space-y-1">
              {morePopover.events.map((event) => (
                <button
                  key={event.occurrence_id}
                  type="button"
                  onClick={() => {
                    setSelectedEvent(event)
                    setMorePopover(null)
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[11px] transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: eventColor(event) }} />
                  <span className="flex-1 truncate font-semibold">{event.title}</span>
                  <span className="shrink-0 text-muted">
                    {event.is_all_day ? 'All day' : formatTime(new Date(event.start_time))}
                  </span>
                </button>
              ))}
              {morePopover.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => {
                    onOpenTask(task)
                    setMorePopover(null)
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[11px] transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: taskColor(task) }} />
                  <span className="flex-1 truncate font-semibold">{task.title}</span>
                  <span className="shrink-0 rounded bg-[var(--surface-sunken)] px-1 py-0.5 text-[10px] text-muted">
                    {PRIORITY_META[task.priority].label}
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}

      {selectedEvent &&
        createPortal(
          <EventDetailPanel
            event={selectedEvent}
            project={selectedEvent.project_id ? projectById.get(selectedEvent.project_id) : undefined}
            confirmingDelete={confirmingDelete}
            onEdit={() => {
              onEditEvent(selectedEvent)
              setSelectedEvent(null)
              setConfirmingDelete(false)
            }}
            onDelete={() => {
              if (!confirmingDelete) {
                setConfirmingDelete(true)
                return
              }
              onDeleteEvent(selectedEvent)
              setSelectedEvent(null)
              setConfirmingDelete(false)
            }}
            onCancelDelete={() => setConfirmingDelete(false)}
            onClose={() => {
              setSelectedEvent(null)
              setConfirmingDelete(false)
            }}
          />,
          document.body,
        )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onToggle,
  icon: Icon,
}: {
  label: string
  active: boolean
  onToggle: () => void
  icon?: typeof Eye
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? 'border-accent bg-[var(--accent-light)] text-accent'
          : 'border-[var(--border)] text-muted hover:text-foreground'
      }`}
    >
      {Icon ? <Icon size={11} /> : null}
      {label}
    </button>
  )
}

// ── Month view ───────────────────────────────────────────────────────

function MonthView({
  events,
  tasks,
  selectedDate,
  weekStartsOn,
  onSelectDay,
  onEventClick,
  onTaskClick,
  onViewDay,
  onMoreClick,
}: {
  events: ExpandedEvent[]
  tasks: Task[]
  selectedDate: Date
  weekStartsOn: 0 | 1
  onSelectDay: (date: Date, event: React.MouseEvent) => void
  onEventClick: (event: ExpandedEvent) => void
  onTaskClick: (task: Task) => void
  onViewDay: (date: Date) => void
  onMoreClick: (date: Date, events: ExpandedEvent[], tasks: Task[], event: React.MouseEvent) => void
}) {
  const today = useMemo(() => getStartOfDay(new Date()), [])
  const weeks = useMemo(
    () => monthGrid(selectedDate.getFullYear(), selectedDate.getMonth(), weekStartsOn),
    [selectedDate, weekStartsOn],
  )
  const labels = weekdayLabels(weekStartsOn)

  const singleDayEvents = useMemo(() => {
    const map = new Map<string, ExpandedEvent[]>()
    for (const event of events) {
      if (isMultiDay(event)) continue
      const key = eventDateKey(new Date(event.start_time))
      const list = map.get(key) ?? []
      list.push(event)
      map.set(key, list)
    }
    return map
  }, [events])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      if (!task.due_date) continue
      const key = eventDateKey(new Date(task.due_date))
      const list = map.get(key) ?? []
      list.push(task)
      map.set(key, list)
    }
    return map
  }, [tasks])

  return (
    <div className="glass-card overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-sunken)]">
          {labels.map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted"
            >
              {label}
            </div>
          ))}
        </div>

        {weeks.map((week, weekIndex) => {
          const weekStart = getStartOfDay(week[0])
          const spans = computeSpans(events, weekStart, 7)
          const lanes = assignLanes(spans)
          const bars = barsPerColumn(spans, 7)
          const maxBars = Math.max(0, ...bars)

          return (
            <div
              key={weekIndex}
              className="relative grid grid-cols-7 border-b border-[var(--border)] last:border-b-0"
              style={{ minHeight: 108 + maxBars * 20 }}
            >
              {spans.map((span) => {
                const lane = lanes.get(span.event.occurrence_id) ?? 0
                return (
                  <button
                    key={span.event.occurrence_id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onEventClick(span.event)
                    }}
                    className="absolute z-20 flex cursor-pointer items-center gap-1 overflow-hidden rounded-md border-l-2 border-white/60 px-1.5 text-left text-[10px] font-semibold leading-tight text-white shadow-sm"
                    style={{
                      top: 28 + lane * 20,
                      height: 17,
                      left: `calc(${span.colStart} * (100% / 7) + 1px)`,
                      width: `calc(${span.colEnd - span.colStart + 1} * (100% / 7) - 2px)`,
                      backgroundColor: eventColor(span.event),
                    }}
                    title={span.event.title}
                  >
                    {span.colStart > 0 && <span className="shrink-0 opacity-80">↳</span>}
                    <span className="truncate">
                      {span.startsHere || span.colStart === 0 ? span.event.title : ''}
                    </span>
                  </button>
                )
              })}

              {week.map((day, dayIndex) => {
                const key = eventDateKey(day)
                const dayEvents = singleDayEvents.get(key) ?? []
                const dayTasks = tasksByDate.get(key) ?? []
                const inMonth = day.getMonth() === selectedDate.getMonth()
                const isToday = isSameDay(day, today)
                const visibleSlots = 3
                const visibleEvents = dayEvents.slice(0, visibleSlots)
                const visibleTasks = dayTasks.slice(0, Math.max(0, visibleSlots - visibleEvents.length))
                const hidden =
                  dayEvents.length + dayTasks.length - visibleEvents.length - visibleTasks.length

                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => onSelectDay(day, event)}
                    onDoubleClick={() => onViewDay(day)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onViewDay(day)
                      }
                    }}
                    className={`group focus-ring relative flex cursor-pointer flex-col border-r border-[var(--border)] p-1.5 text-left transition-colors last:border-r-0 hover:bg-[var(--surface-hover)] ${
                      inMonth ? '' : 'opacity-55'
                    }`}
                    style={{ paddingTop: 8 + bars[dayIndex] * 20 }}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums ${
                          isToday
                            ? 'bg-accent text-accent-foreground'
                            : inMonth
                              ? 'text-foreground'
                              : 'text-muted'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </div>

                    <div className="flex-1 space-y-px">
                      {visibleEvents.map((event) => (
                        <button
                          key={event.occurrence_id}
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation()
                            onEventClick(event)
                          }}
                          className="flex w-full items-center gap-1 overflow-hidden rounded px-1.5 py-px text-left text-[10px] font-semibold leading-tight transition-[filter] hover:brightness-95"
                          style={{
                            backgroundColor: `${eventColor(event)}1A`,
                            color: eventColor(event),
                          }}
                          title={event.title}
                        >
                          {event.is_recurring ? (
                            <Repeat size={9} className="shrink-0" />
                          ) : (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: eventColor(event) }} />
                          )}
                          <span className="truncate">{event.title}</span>
                        </button>
                      ))}
                      {visibleTasks.map((task) => {
                        const color = taskColor(task)
                        const done = task.status === 'completed' || task.status === 'cancelled'
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation()
                              onTaskClick(task)
                            }}
                            className="flex w-full items-center gap-1 overflow-hidden rounded border-l-2 border-dashed px-1.5 py-px text-left text-[10px] font-semibold leading-tight transition-[filter] hover:brightness-95"
                            style={{
                              borderLeftColor: color,
                              backgroundColor: `${color}0F`,
                              color,
                            }}
                            title={task.title}
                          >
                            <Check size={9} className="shrink-0" />
                            <span className={`truncate ${done ? 'line-through opacity-70' : ''}`}>
                              {task.title}
                            </span>
                          </button>
                        )
                      })}
                      {hidden > 0 && (
                        <button
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation()
                            onMoreClick(day, dayEvents, dayTasks, clickEvent)
                          }}
                          className="w-full rounded px-1.5 py-0.5 text-left text-[10px] font-semibold text-muted hover:text-foreground"
                        >
                          +{hidden} more
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week view ────────────────────────────────────────────────────────

function WeekView({
  events,
  tasks,
  selectedDate,
  weekStartsOn,
  hours,
  startHour,
  onSelectDay,
  onEventClick,
  onTaskClick,
  onSlotClick,
}: {
  events: ExpandedEvent[]
  tasks: Task[]
  selectedDate: Date
  weekStartsOn: 0 | 1
  hours: number[]
  startHour: number
  onSelectDay: (date: Date, event: React.MouseEvent) => void
  onEventClick: (event: ExpandedEvent) => void
  onTaskClick: (task: Task) => void
  onSlotClick: (date: Date, event: React.MouseEvent<HTMLDivElement>) => void
}) {
  const today = useMemo(() => getStartOfDay(new Date()), [])
  const weekStart = useMemo(() => startOfWeek(selectedDate, weekStartsOn), [selectedDate, weekStartsOn])
  const weekDays = useMemo(
    () => orderedWeekdays(weekStartsOn).map((_, index) => addDays(weekStart, index)),
    [weekStart, weekStartsOn],
  )

  const byDay = useMemo(() => {
    const map = new Map<number, { allDay: ExpandedEvent[]; timed: ExpandedEvent[] }>()
    weekDays.forEach((_, index) => map.set(index, { allDay: [], timed: [] }))

    for (const event of events) {
      const start = new Date(event.start_time)
      const end = new Date(event.end_time)
      weekDays.forEach((day, index) => {
        const dayStart = getStartOfDay(day)
        const dayEnd = getEndOfDay(day)
        if (start > dayEnd || end < dayStart) return
        const bucket = map.get(index)!
        if (event.is_all_day) bucket.allDay.push(event)
        else bucket.timed.push(event)
      })
    }
    return map
  }, [events, weekDays])

  const tasksByDay = useMemo(() => {
    const map = new Map<number, Task[]>()
    for (const task of tasks) {
      if (!task.due_date) continue
      const date = getStartOfDay(new Date(task.due_date))
      weekDays.forEach((day, index) => {
        if (isSameDay(date, day)) {
          const list = map.get(index) ?? []
          list.push(task)
          map.set(index, list)
        }
      })
    }
    return map
  }, [tasks, weekDays])

  const allDaySpans = useMemo(
    () => computeSpans(events.filter((event) => event.is_all_day), getStartOfDay(weekDays[0]), 7),
    [events, weekDays],
  )
  const allDayLanes = useMemo(() => assignLanes(allDaySpans), [allDaySpans])
  const allDayBars = useMemo(() => barsPerColumn(allDaySpans, 7), [allDaySpans])

  const now = new Date()
  const todayIndex = weekDays.findIndex((day) => isSameDay(day, today))
  const nowOffset =
    todayIndex >= 0
      ? ((minutesSinceMidnight(now) - startHour * 60) / 60) * HOUR_HEIGHT
      : -1
  const gridHeight = hours.length * HOUR_HEIGHT
  const hasAllDay =
    weekDays.some((_, index) => (byDay.get(index)?.allDay.length ?? 0) > 0) ||
    tasksByDay.size > 0

  return (
    <div className="space-y-2">
      {hasAllDay && (
        <div className="glass-card overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-[var(--border)] bg-[var(--surface-sunken)]">
              <div className="p-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                All day
              </div>
              {weekDays.map((day, index) => (
                <div key={index} className="border-l border-[var(--border)] py-2 text-center text-[10px] font-semibold text-muted">
                  {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
              ))}
            </div>
            <div
              className="relative grid grid-cols-[56px_repeat(7,1fr)]"
              style={{
                minHeight: allDaySpans.length > 0 ? Math.max(...allDayBars) * 20 + 10 : 44,
              }}
            >
              <div />
              {weekDays.map((day, index) => {
                const singles = (byDay.get(index)?.allDay ?? []).filter((event) => !isMultiDay(event))
                const dayTasks = tasksByDay.get(index) ?? []
                return (
                  <div
                    key={index}
                    className="space-y-1 border-l border-[var(--border)] p-1.5"
                    style={{ paddingTop: allDayBars[index] * 20 + 4 }}
                  >
                    {singles.map((event) => (
                      <button
                        key={event.occurrence_id}
                        type="button"
                        onClick={() => onEventClick(event)}
                        className="w-full truncate rounded-lg px-2 py-0.5 text-left text-[10px] font-semibold text-white"
                        style={{ backgroundColor: eventColor(event) }}
                        title={event.title}
                      >
                        {event.title}
                      </button>
                    ))}
                    {dayTasks.map((task) => {
                      const color = taskColor(task)
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => onTaskClick(task)}
                          className="flex w-full items-center gap-1 rounded border-l-2 border-dashed px-1.5 py-px text-left text-[10px] font-semibold"
                          style={{ borderLeftColor: color, backgroundColor: `${color}0F`, color }}
                          title={task.title}
                        >
                          <Check size={9} className="shrink-0" />
                          <span className="truncate">{task.title}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
              {allDaySpans.map((span) => {
                const lane = allDayLanes.get(span.event.occurrence_id) ?? 0
                return (
                  <button
                    key={span.event.occurrence_id}
                    type="button"
                    onClick={() => onEventClick(span.event)}
                    className="absolute z-10 flex items-center gap-1 overflow-hidden rounded-lg border-l-2 border-white/60 px-2 text-left text-[10px] font-semibold text-white"
                    style={{
                      top: lane * 20 + 4,
                      height: 17,
                      left: `calc(56px + ${span.colStart} * ((100% - 56px) / 7) + 1px)`,
                      width: `calc(${span.colEnd - span.colStart + 1} * ((100% - 56px) / 7) - 2px)`,
                      backgroundColor: eventColor(span.event),
                    }}
                    title={span.event.title}
                  >
                    {span.colStart > 0 && <span className="shrink-0 opacity-80">↳</span>}
                    <span className="truncate">
                      {span.startsHere || span.colStart === 0 ? span.event.title : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="glass-card overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-[var(--border)] bg-[var(--surface-sunken)]">
            <div />
            {weekDays.map((day, index) => {
              const isToday = isSameDay(day, today)
              return (
                <button
                  key={index}
                  type="button"
                  onClick={(event) => onSelectDay(day, event)}
                  className={`focus-ring border-l border-[var(--border)] px-1 py-1.5 text-center transition-colors hover:bg-[var(--surface-hover)] ${
                    isToday ? 'bg-[var(--accent-light)]' : ''
                  }`}
                >
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
                    {WEEKDAY_NAMES[day.getDay()].slice(0, 3)}
                  </span>
                  <span
                    className={`mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-semibold tabular-nums ${
                      isToday ? 'bg-accent text-accent-foreground' : 'text-foreground'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="relative" style={{ height: gridHeight }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex items-start border-t border-[var(--border)]"
                style={{ top: (hour - startHour) * HOUR_HEIGHT }}
              >
                <span className="w-14 shrink-0 px-2 py-0.5 text-right text-[9px] font-semibold tabular-nums text-muted">
                  {hourLabel(hour)}
                </span>
              </div>
            ))}
            {hours.map((hour) => (
              <div
                key={`half-${hour}`}
                className="absolute left-14 right-0 border-t border-[var(--border)] opacity-40"
                style={{ top: (hour - startHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
              />
            ))}

            {weekDays.map((day, index) => {
              const dayStart = getStartOfDay(day)
              const dayEnd = getEndOfDay(day)
              const timed = byDay.get(index)?.timed ?? []
              const layout = layoutTimedEvents(timed, dayStart, dayEnd)
              const columnLeft = `calc(56px + (100% - 56px) * ${index} / 7)`
              const columnWidth = '(100% - 56px) / 7'

              return (
                <div key={index}>
                  <div
                    className="absolute bottom-0 top-0 cursor-copy"
                    style={{ left: columnLeft, width: `calc(${columnWidth})` }}
                    onDoubleClick={(event) => onSlotClick(day, event)}
                    aria-hidden
                  />
                  {timed.map((event) => {
                    const start = new Date(event.start_time)
                    const end = new Date(event.end_time)
                    const visibleStart = start > dayStart ? start : dayStart
                    const visibleEnd = end < dayEnd ? end : dayEnd
                    const top = Math.max(
                      0,
                      ((minutesSinceMidnight(visibleStart) - startHour * 60) / 60) * HOUR_HEIGHT,
                    )
                    const height = Math.max(
                      18,
                      Math.min(
                        ((minutesSinceMidnight(visibleEnd) - minutesSinceMidnight(visibleStart)) / 60) *
                          HOUR_HEIGHT,
                        gridHeight - top,
                      ),
                    )
                    const position = layout.get(event.occurrence_id) ?? { left: 0, width: 100 }
                    return (
                      <button
                        key={event.occurrence_id}
                        type="button"
                        onClick={() => onEventClick(event)}
                        className="absolute z-10 overflow-hidden rounded-lg border border-white/25 px-1.5 py-0.5 text-left text-white shadow-sm transition-[filter] hover:z-20 hover:brightness-105"
                        style={{
                          top,
                          height,
                          left: `calc(${columnLeft} + 2px + (${columnWidth} - 4px) * ${position.left / 100})`,
                          width: `calc((${columnWidth} - 4px) * ${position.width / 100})`,
                          backgroundColor: eventColor(event),
                        }}
                        title={event.title}
                      >
                        <span className="flex items-center gap-0.5 truncate text-[10px] font-semibold leading-tight">
                          {event.is_recurring && <Repeat size={9} className="shrink-0 opacity-80" />}
                          {start < dayStart && <span className="opacity-80">↳</span>}
                          {event.title}
                        </span>
                        {height >= 30 && (
                          <span className="block truncate text-[9px] leading-tight opacity-85">
                            {formatTime(visibleStart)} – {formatTime(visibleEnd)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}

            {todayIndex >= 0 && nowOffset > 0 && nowOffset < gridHeight && (
              <div
                className="pointer-events-none absolute z-20 flex items-center"
                style={{
                  top: nowOffset,
                  left: `calc(56px + (100% - 56px) * ${todayIndex} / 7)`,
                  width: 'calc((100% - 56px) / 7)',
                }}
              >
                <span className="h-2 w-2 -translate-x-1/2 rounded-full bg-danger" />
                <span className="h-0.5 flex-1 bg-danger" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Day view ─────────────────────────────────────────────────────────

function DayView({
  events,
  tasks,
  selectedDate,
  hours,
  startHour,
  onEventClick,
  onTaskClick,
  onSlotClick,
}: {
  events: ExpandedEvent[]
  tasks: Task[]
  selectedDate: Date
  hours: number[]
  startHour: number
  onEventClick: (event: ExpandedEvent) => void
  onTaskClick: (task: Task) => void
  onSlotClick: (date: Date, event: React.MouseEvent<HTMLDivElement>) => void
}) {
  const dayStart = getStartOfDay(selectedDate)
  const dayEnd = getEndOfDay(selectedDate)

  const dayEvents = useMemo(
    () =>
      events.filter((event) => {
        const start = new Date(event.start_time)
        const end = new Date(event.end_time)
        if (event.is_all_day) return isSameDay(start, selectedDate)
        return start <= dayEnd && end >= dayStart
      }),
    [events, selectedDate, dayStart, dayEnd],
  )

  const allDayEvents = dayEvents.filter((event) => event.is_all_day)
  const timedEvents = dayEvents.filter((event) => !event.is_all_day)
  const dayTasks = useMemo(
    () => tasks.filter((task) => task.due_date && isSameDay(new Date(task.due_date), selectedDate)),
    [tasks, selectedDate],
  )
  const layout = useMemo(
    () => layoutTimedEvents(timedEvents, dayStart, dayEnd),
    [timedEvents, dayStart, dayEnd],
  )

  const isToday = isSameDay(selectedDate, new Date())
  const nowOffset = isToday
    ? ((minutesSinceMidnight(new Date()) - startHour * 60) / 60) * HOUR_HEIGHT
    : -1
  const gridHeight = hours.length * HOUR_HEIGHT

  return (
    <div className="space-y-3">
      {(allDayEvents.length > 0 || dayTasks.length > 0) && (
        <div className="glass-card space-y-2 p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            All day
          </span>
          <div className="flex flex-wrap gap-2">
            {allDayEvents.map((event) => (
              <button
                key={event.occurrence_id}
                type="button"
                onClick={() => onEventClick(event)}
                className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm"
                style={{ backgroundColor: eventColor(event) }}
              >
                {event.title}
                {event.location && (
                  <span className="flex items-center gap-0.5 opacity-80">
                    <MapPin size={10} />
                    {event.location}
                  </span>
                )}
              </button>
            ))}
            {dayTasks.map((task) => {
              const color = taskColor(task)
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onTaskClick(task)}
                  className="flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-1.5 text-[11px] font-semibold"
                  style={{ borderColor: `${color}66`, color }}
                >
                  <Check size={10} />
                  {task.title}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="glass-card relative overflow-y-auto scroll-thin" style={{ maxHeight: 'calc(100dvh - 280px)' }}>
        <div className="relative" style={{ height: gridHeight }}>
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex items-start border-t border-[var(--border)]"
              style={{ top: (hour - startHour) * HOUR_HEIGHT }}
            >
              <span className="w-16 shrink-0 px-3 py-1 text-right text-[9px] font-semibold tabular-nums text-muted">
                {hourLabel(hour)}
              </span>
            </div>
          ))}
          {hours.map((hour) => (
            <div
              key={`half-${hour}`}
              className="absolute left-16 right-0 border-t border-[var(--border)] opacity-40"
              style={{ top: (hour - startHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
            />
          ))}

          <div
            className="absolute bottom-0 left-16 right-0 top-0 cursor-copy"
            onDoubleClick={(event) => onSlotClick(selectedDate, event)}
            aria-hidden
          />

          {isToday && nowOffset > 0 && nowOffset < gridHeight && (
            <div className="absolute left-16 right-0 z-20 flex items-center" style={{ top: nowOffset }}>
              <span className="h-2 w-2 -translate-x-1/2 rounded-full bg-danger" />
              <span className="h-0.5 flex-1 bg-danger" />
            </div>
          )}

          {timedEvents.map((event) => {
            const start = new Date(event.start_time)
            const end = new Date(event.end_time)
            const visibleStart = start > dayStart ? start : dayStart
            const visibleEnd = end < dayEnd ? end : dayEnd
            const top = Math.max(
              0,
              ((minutesSinceMidnight(visibleStart) - startHour * 60) / 60) * HOUR_HEIGHT,
            )
            const height = Math.max(
              24,
              Math.min(
                ((minutesSinceMidnight(visibleEnd) - minutesSinceMidnight(visibleStart)) / 60) *
                  HOUR_HEIGHT,
                gridHeight - top,
              ),
            )
            const position = layout.get(event.occurrence_id) ?? { left: 0, width: 100 }
            return (
              <button
                key={event.occurrence_id}
                type="button"
                onClick={() => onEventClick(event)}
                className="absolute z-10 overflow-hidden rounded-xl border border-white/25 px-3 py-1.5 text-left text-white shadow-sm transition-[filter] hover:brightness-105"
                style={{
                  top,
                  height,
                  left: `calc(16px + (100% - 80px) * ${position.left / 100})`,
                  width: `calc((100% - 80px) * ${position.width / 100})`,
                  backgroundColor: eventColor(event),
                }}
                title={event.title}
              >
                <span className="flex items-center gap-1 truncate text-[11px] font-semibold leading-tight">
                  {event.is_recurring && <Repeat size={10} className="shrink-0 opacity-80" />}
                  {event.title}
                </span>
                <span className="flex items-center gap-1 truncate text-[10px] leading-tight opacity-90">
                  <Clock3 size={9} />
                  {formatTime(visibleStart)} – {formatTime(visibleEnd)}
                </span>
                {event.location && height >= 56 && (
                  <span className="flex items-center gap-1 truncate text-[10px] leading-tight opacity-80">
                    <MapPin size={9} />
                    {event.location}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted">
        {dayEvents.length === 0 && dayTasks.length === 0
          ? 'No events or tasks on this day. Double-click the grid to add one.'
          : `${timedEvents.length} timed · ${allDayEvents.length} all-day · ${dayTasks.length} tasks`}
      </p>
    </div>
  )
}

// ── Agenda view ──────────────────────────────────────────────────────

function AgendaView({
  events,
  tasks,
  onEventClick,
  onTaskClick,
}: {
  events: ExpandedEvent[]
  tasks: Task[]
  onEventClick: (event: ExpandedEvent) => void
  onTaskClick: (task: Task) => void
}) {
  const today = getStartOfDay(new Date())

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { date: Date; events: ExpandedEvent[]; tasks: Task[] }
    >()

    for (const event of events) {
      if (event.is_cancelled) continue
      const date = getStartOfDay(new Date(event.start_time))
      if (date < today) continue
      const key = date.toISOString()
      const group = map.get(key) ?? { date, events: [], tasks: [] }
      group.events.push(event)
      map.set(key, group)
    }

    for (const task of tasks) {
      if (!task.due_date) continue
      const date = getStartOfDay(new Date(task.due_date))
      if (date < today) continue
      if (task.status === 'cancelled') continue
      const key = date.toISOString()
      const group = map.get(key) ?? { date, events: [], tasks: [] }
      group.tasks.push(task)
      map.set(key, group)
    }

    return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [events, tasks, today])

  if (groups.length === 0) {
    return (
      <div className="glass-card flex flex-col items-center px-6 py-16 text-center">
        <CalendarDays size={26} className="text-accent" />
        <p className="mt-3 text-sm font-semibold text-foreground">Your agenda is clear</p>
        <p className="mt-1 text-xs text-muted">Add an event or a task to fill the coming days.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const diffDays = Math.round((group.date.getTime() - today.getTime()) / 86_400_000)
        const label =
          diffDays === 0
            ? 'Today'
            : diffDays === 1
              ? 'Tomorrow'
              : group.date.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })

        return (
          <section key={group.date.toISOString()} className="glass-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
                {label}
              </h3>
              <span className="text-[10px] text-muted">
                {group.events.length + group.tasks.length} items
              </span>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {group.events.map((event) => (
                <li key={event.occurrence_id}>
                  <button
                    type="button"
                    onClick={() => onEventClick(event)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <span className="w-16 shrink-0 text-right text-[10px] font-semibold tabular-nums text-foreground">
                      {event.is_all_day ? 'All day' : formatTime(new Date(event.start_time))}
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: eventColor(event) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-foreground">
                        {event.title}
                      </span>
                      <span className="flex items-center gap-2 text-[10px] text-muted">
                        {event.category && <span className="capitalize">{event.category}</span>}
                        {event.location && (
                          <span className="flex items-center gap-0.5">
                            <MapPin size={9} />
                            {event.location}
                          </span>
                        )}
                        {event.is_recurring && (
                          <span className="flex items-center gap-0.5">
                            <Repeat size={9} />
                            Recurring
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {group.tasks.map((task) => {
                const done = task.status === 'completed'
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => onTaskClick(task)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
                    >
                      <span className="w-16 shrink-0 text-right text-[10px] font-semibold text-muted">
                        {dueLabel(task)}
                      </span>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: taskColor(task) }} />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-[12px] font-medium ${
                            done ? 'text-muted line-through' : 'text-foreground'
                          }`}
                        >
                          {task.title}
                        </span>
                        <span className="flex items-center gap-2 text-[10px] text-muted">
                          <span className="capitalize">{task.priority}</span>
                          {task.estimated_minutes ? <span>{task.estimated_minutes}m</span> : null}
                          {(task.labels ?? []).slice(0, 2).map((label) => (
                            <span key={label} className="rounded bg-[var(--surface-sunken)] px-1">
                              {label}
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

// ── Mini calendar ────────────────────────────────────────────────────

function MiniCalendar({
  selectedDate,
  weekStartsOn,
  onSelect,
  onPrevMonth,
  onNextMonth,
  events,
  tasks,
}: {
  selectedDate: Date
  weekStartsOn: 0 | 1
  onSelect: (date: Date) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  events: ExpandedEvent[]
  tasks: Task[]
}) {
  const displayMonth = useMemo(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    [selectedDate],
  )
  const today = useMemo(() => getStartOfDay(new Date()), [])
  const weeks = useMemo(
    () => monthGrid(displayMonth.getFullYear(), displayMonth.getMonth(), weekStartsOn),
    [displayMonth, weekStartsOn],
  )
  const labels = weekdayLabels(weekStartsOn)

  const eventDays = useMemo(() => {
    const set = new Set<string>()
    for (const event of events) set.add(eventDateKey(new Date(event.start_time)))
    return set
  }, [events])

  const taskDays = useMemo(() => {
    const set = new Set<string>()
    for (const task of tasks) {
      if (task.due_date) set.add(eventDateKey(new Date(task.due_date)))
    }
    return set
  }, [tasks])

  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">
          {displayMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="Previous month"
            className="focus-ring flex h-6 w-6 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Next month"
            className="focus-ring flex h-6 w-6 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center">
        {labels.map((label) => (
          <div key={label} className="py-1 text-[9px] font-semibold uppercase text-muted">
            {label[0]}
          </div>
        ))}
      </div>

      <div className="space-y-0.5">
        {weeks.map((week, index) => (
          <div key={index} className="grid grid-cols-7 gap-0.5">
            {week.map((day) => {
              const key = eventDateKey(day)
              const inMonth = day.getMonth() === displayMonth.getMonth()
              const isToday = isSameDay(day, today)
              const isSelected = isSameDay(day, selectedDate)
              const hasEvents = eventDays.has(key)
              const hasTasks = taskDays.has(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(day)}
                  className={`focus-ring relative flex aspect-square flex-col items-center justify-center rounded-lg text-[11px] font-semibold transition-colors ${
                    isSelected
                      ? 'bg-accent text-accent-foreground'
                      : isToday
                        ? 'bg-[var(--accent-light)] text-accent'
                        : inMonth
                          ? 'text-foreground hover:bg-[var(--surface-hover)]'
                          : 'text-muted opacity-50 hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {day.getDate()}
                  <span className="mt-px flex h-1 gap-0.5">
                    {hasEvents && <span className="h-1 w-1 rounded-full bg-current opacity-70" />}
                    {hasTasks && <span className="h-1 w-1 rounded-full bg-current opacity-40" />}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Events
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent opacity-50" /> Tasks
        </span>
      </div>
    </div>
  )
}

// ── Event detail panel ───────────────────────────────────────────────

function EventDetailPanel({
  event,
  project,
  confirmingDelete,
  onEdit,
  onDelete,
  onCancelDelete,
  onClose,
}: {
  event: ExpandedEvent
  project?: Project
  confirmingDelete: boolean
  onEdit: () => void
  onDelete: () => void
  onCancelDelete: () => void
  onClose: () => void
}) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const color = eventColor(event)

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-end">
      <button
        type="button"
        aria-label="Close event"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        className="glass-strong animate-rise-in relative z-10 m-3 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl sm:m-4"
      >
        <div className="relative px-5 pb-4 pt-5" style={{ backgroundColor: `${color}14` }}>
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-50 blur-[46px]"
            style={{ backgroundColor: color }}
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {event.category && (
                  <span
                    className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    {event.category}
                  </span>
                )}
                {event.is_recurring && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-muted">
                    <Repeat size={10} />
                    Recurring
                  </span>
                )}
                {event.is_occurrence && (
                  <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-0.5 text-[9px] font-semibold text-muted">
                    Instance
                  </span>
                )}
                {event.is_cancelled && (
                  <span className="rounded-md bg-[var(--danger-light)] px-2 py-0.5 text-[9px] font-bold text-danger">
                    Cancelled
                  </span>
                )}
              </div>
              <h3 className="font-display text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground">
                {event.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close event"
              className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 scroll-thin">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)]">
              <CalendarClock size={15} className="text-muted" />
            </div>
            <div className="text-[13px]">
              <p className="font-medium text-foreground">
                {start.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              <p className="text-[11px] text-muted">
                {event.is_all_day
                  ? 'All day'
                  : `${formatTime(start)} – ${formatTime(end)}`}
              </p>
            </div>
          </div>

          {event.location && (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)]">
                <MapPin size={15} className="text-muted" />
              </div>
              <p className="pt-1.5 text-[13px] text-foreground">{event.location}</p>
            </div>
          )}

          {event.description && (
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-foreground/90">
              {event.description}
            </p>
          )}

          {event.meeting_url && (
            <a
              href={event.meeting_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-accent hover:bg-[var(--accent-light)]"
            >
              Join meeting{event.meeting_platform ? ` · ${event.meeting_platform}` : ''}
            </a>
          )}

          {project && (
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
              {project.name}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-3">
          <Button type="button" variant="ghost" size="sm" icon={Trash2} onClick={onDelete}>
            {confirmingDelete ? 'Confirm delete' : 'Delete'}
          </Button>
          <div className="flex items-center gap-2">
            {confirmingDelete && (
              <Button type="button" variant="ghost" size="sm" onClick={onCancelDelete}>
                Cancel
              </Button>
            )}
            <Button type="button" variant="primary" size="sm" icon={Pencil} onClick={onEdit}>
              Edit
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
