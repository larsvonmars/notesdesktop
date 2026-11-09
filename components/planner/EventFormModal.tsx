'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CalendarPlus, Clock3, MapPin, Repeat } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import BaseModal, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/BaseModal'
import { Button } from '@/components/ui/Button'
import type { NoteSummary } from '@/lib/notes'
import type { Project } from '@/lib/projects'
import {
  createEvent,
  deleteEvent,
  setEventRecurrence,
  updateEvent,
  type CalendarEvent,
  type RecurrenceInput,
  type RecurrencePattern,
} from '@/lib/events'
import {
  dateAndTimeToLocalDate,
  dateInputToLocalDate,
  toDateInputValue,
  toTimeInputValue,
} from '@/lib/task-agenda'
import {
  CALENDAR_CATEGORIES,
  CATEGORY_COLORS,
  COLOR_SWATCHES,
  FIELD_CLASS,
  LABEL_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  ToggleSwitch,
} from './PlannerUi'

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
] as const

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface FormState {
  title: string
  description: string
  location: string
  date: string
  startTime: string
  endTime: string
  allDay: boolean
  category: string
  color: string
  projectId: string
  noteId: string
  meetingUrl: string
  meetingPlatform: string
  isRecurring: boolean
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: string
  daysOfWeek: number[]
  recEndDate: string
}

function defaultState(
  start: Date,
  end: Date,
  defaultCategory = '',
  defaultRecurring = false,
): FormState {
  return {
    title: '',
    description: '',
    location: '',
    date: toDateInputValue(start),
    startTime: toTimeInputValue(start),
    endTime: toTimeInputValue(end),
    allDay: false,
    category: defaultCategory,
    color: '',
    projectId: '',
    noteId: '',
    meetingUrl: '',
    meetingPlatform: '',
    isRecurring: defaultRecurring,
    frequency: 'weekly',
    interval: '1',
    daysOfWeek: defaultRecurring ? [start.getDay()] : [],
    recEndDate: '',
  }
}

export interface EventFormModalProps {
  isOpen: boolean
  event?: CalendarEvent | null
  /** Default start time when creating (e.g. clicked calendar slot). */
  defaultStart?: Date | null
  /** Preselect a category, e.g. `timetable` for recurring schedule entries. */
  defaultCategory?: string
  /** Start the form with weekly recurrence enabled. */
  defaultRecurring?: boolean
  events: CalendarEvent[]
  recurrencePatterns: RecurrencePattern[]
  projects: Project[]
  notes: NoteSummary[]
  onSaved: (event: CalendarEvent, isNew: boolean) => void
  onDeleted: (eventId: string) => void
  onClose: () => void
}

export default function EventFormModal({
  isOpen,
  event,
  defaultStart,
  defaultCategory,
  defaultRecurring,
  events,
  recurrencePatterns,
  projects,
  notes,
  onSaved,
  onDeleted,
  onClose,
}: EventFormModalProps) {
  const toast = useToast()
  const editing = Boolean(event)

  const existingPattern = useMemo(() => {
    if (!event?.recurrence_pattern_id) return null
    return (
      recurrencePatterns.find((pattern) => pattern.id === event.recurrence_pattern_id) ?? null
    )
  }, [event?.recurrence_pattern_id, recurrencePatterns])

  const initialStart = useMemo(() => {
    const base = defaultStart ? new Date(defaultStart) : new Date()
    base.setSeconds(0, 0)
    if (!defaultStart) {
      base.setMinutes(0, 0, 0)
      base.setHours(base.getHours() + 1)
    }
    return base
  }, [defaultStart])

  const [form, setForm] = useState<FormState>(() => {
    if (event) {
      return {
        title: event.title,
        description: event.description ?? '',
        location: event.location ?? '',
        date: toDateInputValue(event.start_time),
        startTime: toTimeInputValue(event.start_time),
        endTime: toTimeInputValue(event.end_time),
        allDay: event.is_all_day,
        category: event.category ?? '',
        color: event.color && event.color !== '#3B82F6' ? event.color : '',
        projectId: event.project_id ?? '',
        noteId: event.note_id ?? '',
        meetingUrl: event.meeting_url ?? '',
        meetingPlatform: event.meeting_platform ?? '',
        isRecurring: event.is_recurring,
        frequency:
          existingPattern && existingPattern.frequency !== 'custom'
            ? (existingPattern.frequency as FormState['frequency'])
            : 'weekly',
        interval: existingPattern?.interval?.toString() ?? '1',
        daysOfWeek: existingPattern?.days_of_week ?? [],
        recEndDate: existingPattern?.end_date?.slice(0, 10) ?? '',
      }
    }
    return defaultState(
      initialStart,
      new Date(initialStart.getTime() + 60 * 60 * 1000),
      defaultCategory,
      defaultRecurring,
    )
  })

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setSaving(false)
    setDeleting(false)
    setConfirmingDelete(false)
    setError(null)
    if (!event) {
      setForm(
        defaultState(
          initialStart,
          new Date(initialStart.getTime() + 60 * 60 * 1000),
          defaultCategory,
          defaultRecurring,
        ),
      )
    }
  }, [isOpen, event, initialStart, defaultCategory, defaultRecurring])

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const recurrenceKey = (state: {
    isRecurring: boolean
    frequency: string
    interval: string
    daysOfWeek: number[]
    recEndDate: string
  }) =>
    [
      state.isRecurring ? '1' : '0',
      state.frequency,
      state.interval,
      [...state.daysOfWeek].sort().join(','),
      state.recEndDate,
    ].join('|')

  const initialRecurrenceKey = useMemo(
    () =>
      recurrenceKey({
        isRecurring: event?.is_recurring ?? false,
        frequency:
          existingPattern && existingPattern.frequency !== 'custom'
            ? existingPattern.frequency
            : 'weekly',
        interval: existingPattern?.interval?.toString() ?? '1',
        daysOfWeek: existingPattern?.days_of_week ?? [],
        recEndDate: existingPattern?.end_date?.slice(0, 10) ?? '',
      }),
    [event?.is_recurring, existingPattern],
  )

  const startDate = useMemo(
    () =>
      form.allDay
        ? dateInputToLocalDate(form.date, 0, 0)
        : dateAndTimeToLocalDate(form.date, form.startTime),
    [form.allDay, form.date, form.startTime],
  )
  const endDate = useMemo(() => {
    if (!startDate) return null
    if (form.allDay) {
      const end = dateInputToLocalDate(form.date, 23, 59)
      return end
    }
    let candidate = dateAndTimeToLocalDate(form.date, form.endTime)
    if (!candidate) return null
    if (candidate <= startDate) candidate = new Date(candidate.getTime() + 86_400_000)
    return candidate
  }, [form.allDay, form.date, form.endTime, startDate])

  /** Warn when the new time overlaps another event on the same day. */
  const overlaps = useMemo(() => {
    if (!startDate || !endDate) return []
    return events
      .filter((candidate) => candidate.id !== event?.id && !candidate.is_cancelled)
      .filter((candidate) => {
        const otherStart = new Date(candidate.start_time)
        const otherEnd = new Date(candidate.end_time)
        return startDate < otherEnd && otherStart < endDate
      })
      .slice(0, 3)
  }, [events, event?.id, startDate, endDate])

  const noteOptions = useMemo(() => {
    const sorted = [...notes]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 200)
    const current = form.noteId ? notes.find((note) => note.id === form.noteId) : undefined
    if (!current) return sorted
    return [current, ...sorted.filter((note) => note.id !== current.id)]
  }, [notes, form.noteId])

  const buildRecurrence = (): RecurrenceInput | null => {
    if (!form.isRecurring) return null
    return {
      frequency: form.frequency,
      interval: Number.parseInt(form.interval, 10) || 1,
      daysOfWeek:
        form.frequency === 'weekly' && form.daysOfWeek.length > 0 ? form.daysOfWeek : null,
      dayOfMonth:
        form.frequency === 'monthly' && startDate ? startDate.getDate() : null,
      monthOfYear:
        form.frequency === 'yearly' && startDate ? startDate.getMonth() + 1 : null,
      endDate: form.recEndDate ? new Date(`${form.recEndDate}T23:59:59`) : null,
    }
  }

  const handleSubmit = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    const title = form.title.trim()
    if (!title || !startDate || !endDate || saving) return

    setSaving(true)
    setError(null)

    try {
      const options = {
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        projectId: form.projectId || undefined,
        noteId: form.noteId || undefined,
        isAllDay: form.allDay,
        category: form.category || undefined,
        color: form.color || undefined,
        meetingUrl: form.meetingUrl.trim() || undefined,
        meetingPlatform: form.meetingPlatform || undefined,
      }

      if (event) {
        const updated = await updateEvent(event.id, {
          title,
          description: options.description ?? null,
          location: options.location ?? null,
          project_id: form.projectId || null,
          note_id: form.noteId || null,
          is_all_day: form.allDay,
          category: form.category || null,
          color: form.color || '#3B82F6',
          meeting_url: options.meetingUrl ?? null,
          meeting_platform: options.meetingPlatform ?? null,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        })

        const recurrenceChanged = recurrenceKey(form) !== initialRecurrenceKey

        const finalEvent = recurrenceChanged
          ? await setEventRecurrence(
              event.id,
              buildRecurrence(),
              event.recurrence_pattern_id,
            )
          : updated

        onSaved(finalEvent, false)
        toast.push({ title: 'Event updated', description: finalEvent.title, variant: 'success' })
        onClose()
      } else {
        const created = await createEvent(title, startDate, endDate, options)
        const finalEvent = form.isRecurring
          ? await setEventRecurrence(created.id, buildRecurrence())
          : created
        onSaved(finalEvent, true)
        toast.push({ title: 'Event created', description: finalEvent.title, variant: 'success' })
        onClose()
      }
    } catch (err) {
      console.error('Saving event failed:', err)
      setError(err instanceof Error ? err.message : 'Could not save the event.')
      toast.push({ title: 'Could not save event', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!event) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    setDeleting(true)
    try {
      await deleteEvent(event.id)
      onDeleted(event.id)
      toast.push({ title: 'Event deleted', description: event.title, variant: 'success' })
      onClose()
    } catch (err) {
      console.error('Deleting event failed:', err)
      setError(err instanceof Error ? err.message : 'Could not delete the event.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      maxHeight="88vh"
      closeOnBackdropClick={!saving && !deleting}
      closeOnEscape={!saving && !deleting}
    >
      <ModalHeader onClose={onClose}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent">
          <CalendarPlus size={18} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <ModalTitle>{editing ? 'Edit event' : 'New event'}</ModalTitle>
          <p className="mt-0.5 text-[11px] text-muted">
            {editing ? 'Change time, place or repeat the event' : 'Block time for what matters'}
          </p>
        </div>
      </ModalHeader>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLASS} htmlFor="event-title">
                Title
              </label>
              <input
                id="event-title"
                required
                value={form.title}
                onChange={(changed) => patch('title', changed.target.value)}
                placeholder="e.g. Deep work — chapter 4"
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="event-description">
                Description
              </label>
              <textarea
                id="event-description"
                value={form.description}
                onChange={(changed) => patch('description', changed.target.value)}
                placeholder="Agenda, notes, links…"
                className={TEXTAREA_CLASS}
                rows={2}
              />
            </div>

            <div className="glass rounded-2xl p-4">
              <ToggleSwitch
                label="All-day event"
                checked={form.allDay}
                onChange={(checked) => patch('allDay', checked)}
              />

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={LABEL_CLASS} htmlFor="event-date">
                    {form.allDay ? 'Date' : 'Start date'}
                  </label>
                  <input
                    id="event-date"
                    type="date"
                    value={form.date}
                    onChange={(changed) => patch('date', changed.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
                {!form.allDay && (
                  <>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="event-start">
                        Start time
                      </label>
                      <input
                        id="event-start"
                        type="time"
                        value={form.startTime}
                        onChange={(changed) => patch('startTime', changed.target.value)}
                        className={FIELD_CLASS}
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="event-end">
                        End time
                      </label>
                      <input
                        id="event-end"
                        type="time"
                        value={form.endTime}
                        onChange={(changed) => patch('endTime', changed.target.value)}
                        className={FIELD_CLASS}
                      />
                    </div>
                  </>
                )}
              </div>

              {!form.allDay && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {[
                    { label: 'Now', minutes: 0 },
                    { label: 'In 1 hour', minutes: 60 },
                    { label: 'Tomorrow 9:00', minutes: -1 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const next =
                          preset.minutes === -1
                            ? (() => {
                                const tomorrow = new Date()
                                tomorrow.setDate(tomorrow.getDate() + 1)
                                tomorrow.setHours(9, 0, 0, 0)
                                return tomorrow
                              })()
                            : new Date(Date.now() + preset.minutes * 60_000)
                        next.setSeconds(0, 0)
                        patch('date', toDateInputValue(next))
                        patch('startTime', toTimeInputValue(next))
                        const finish = new Date(next.getTime() + 60 * 60 * 1000)
                        patch('endTime', toTimeInputValue(finish))
                      }}
                      className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                    >
                      {preset.label}
                    </button>
                  ))}
                  {startDate && (
                    <button
                      type="button"
                      onClick={() => {
                        const finish = new Date(startDate.getTime() + 60 * 60 * 1000)
                        patch('endTime', toTimeInputValue(finish))
                      }}
                      className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                    >
                      +1h from start
                    </button>
                  )}
                  {startDate && endDate && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted">
                      <Clock3 size={11} />
                      {startDate.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {!form.allDay &&
                        ` · ${startDate.toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })} – ${endDate.toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`}
                    </span>
                  )}
                </div>
              )}
            </div>

            {overlaps.length > 0 && (
              <div className="rounded-xl border border-warning bg-[var(--warning-light)] px-3 py-2 text-[11px] text-warning">
                <span className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={12} />
                  Overlaps {overlaps.length === 1 ? 'another event' : `${overlaps.length} events`}
                </span>
                <ul className="mt-1 space-y-0.5">
                  {overlaps.map((candidate) => (
                    <li key={candidate.id} className="truncate">
                      {candidate.title} ·{' '}
                      {new Date(candidate.start_time).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label className={LABEL_CLASS} htmlFor="event-location">
                Location
              </label>
              <div className="relative">
                <MapPin
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  id="event-location"
                  value={form.location}
                  onChange={(changed) => patch('location', changed.target.value)}
                  placeholder="Room, address or link"
                  className={`${FIELD_CLASS} pl-9`}
                />
              </div>
            </div>

            <div>
              <span className={LABEL_CLASS}>Category</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => patch('category', '')}
                  aria-pressed={form.category === ''}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    form.category === ''
                      ? 'border-accent bg-[var(--accent-light)] text-accent'
                      : 'border-[var(--border)] text-muted hover:text-foreground'
                  }`}
                >
                  None
                </button>
                {CALENDAR_CATEGORIES.map((category) => {
                  const active = form.category === category
                  const color = CATEGORY_COLORS[category] ?? 'var(--accent)'
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => patch('category', category)}
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

            <div>
              <span className={LABEL_CLASS}>Colour</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => patch('color', '')}
                  className={`h-6 w-6 rounded-full border text-[9px] font-semibold ${
                    form.color === ''
                      ? 'border-accent text-accent'
                      : 'border-[var(--border-strong)] text-muted'
                  }`}
                  title="Category colour"
                >
                  A
                </button>
                {COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => patch('color', color)}
                    aria-label={`Colour ${color}`}
                    className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                      form.color === color ? 'border-foreground' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS} htmlFor="event-project">
                  Project
                </label>
                <select
                  id="event-project"
                  value={form.projectId}
                  onChange={(changed) => patch('projectId', changed.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="event-note">
                  Linked note
                </label>
                <select
                  id="event-note"
                  value={form.noteId}
                  onChange={(changed) => patch('noteId', changed.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">No note</option>
                  {noteOptions.map((note) => (
                    <option key={note.id} value={note.id}>
                      {note.title || 'Untitled'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS} htmlFor="event-meeting">
                  Meeting link
                </label>
                <input
                  id="event-meeting"
                  value={form.meetingUrl}
                  onChange={(changed) => patch('meetingUrl', changed.target.value)}
                  placeholder="https://"
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="event-platform">
                  Platform
                </label>
                <select
                  id="event-platform"
                  value={form.meetingPlatform}
                  onChange={(changed) => patch('meetingPlatform', changed.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">None</option>
                  {['Zoom', 'Google Meet', 'Teams', 'Phone', 'In person'].map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3 glass rounded-2xl p-4">
              <ToggleSwitch
                label="Repeats"
                description="Create a recurring event from this one"
                checked={form.isRecurring}
                onChange={(checked) => patch('isRecurring', checked)}
              />

              {form.isRecurring && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL_CLASS} htmlFor="event-recurrence">
                        Repeats
                      </label>
                      <select
                        id="event-recurrence"
                        value={form.frequency}
                        onChange={(changed) =>
                          patch('frequency', changed.target.value as FormState['frequency'])
                        }
                        className={SELECT_CLASS}
                      >
                        {FREQUENCIES.map((frequency) => (
                          <option key={frequency.value} value={frequency.value}>
                            {frequency.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="event-interval">
                        Every
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="event-interval"
                          type="number"
                          min={1}
                          max={52}
                          value={form.interval}
                          onChange={(changed) => patch('interval', changed.target.value)}
                          className={`${FIELD_CLASS} w-20`}
                        />
                        <span className="text-xs text-muted">
                          {form.frequency === 'daily' && 'day(s)'}
                          {form.frequency === 'weekly' && 'week(s)'}
                          {form.frequency === 'monthly' && 'month(s)'}
                          {form.frequency === 'yearly' && 'year(s)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {form.frequency === 'weekly' && (
                    <div>
                      <span className={LABEL_CLASS}>On days</span>
                      <div className="flex flex-wrap gap-1.5">
                        {DAY_LABELS.map((label, index) => {
                          const active = form.daysOfWeek.includes(index)
                          return (
                            <button
                              key={label}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                patch(
                                  'daysOfWeek',
                                  active
                                    ? form.daysOfWeek.filter((day) => day !== index)
                                    : [...form.daysOfWeek, index].sort(),
                                )
                              }
                              className={`h-8 w-9 rounded-lg text-[11px] font-semibold transition-colors ${
                                active
                                  ? 'bg-accent text-accent-foreground'
                                  : 'bg-[var(--surface-hover)] text-muted hover:text-foreground'
                              }`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={LABEL_CLASS} htmlFor="event-recurrence-end">
                      Ends on (optional)
                    </label>
                    <input
                      id="event-recurrence-end"
                      type="date"
                      value={form.recEndDate}
                      onChange={(changed) => patch('recEndDate', changed.target.value)}
                      className={FIELD_CLASS}
                    />
                  </div>

                  <p className="flex items-center gap-1.5 text-[10px] text-muted">
                    <Repeat size={11} />
                    Occurrences are generated on the fly — nothing is duplicated in storage.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-xl border border-danger bg-[var(--danger-light)] px-3 py-2 text-xs text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <div className="flex items-center justify-between gap-3">
            {editing ? (
              <Button
                type="button"
                variant={confirmingDelete ? 'danger' : 'ghost'}
                size="sm"
                onClick={handleDelete}
                loading={deleting}
              >
                {confirmingDelete ? 'Confirm delete' : 'Delete'}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {confirmingDelete && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
              )}
              <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={saving}>
                Close
              </Button>
              <Button type="submit" variant="primary" size="md" loading={saving}>
                {editing ? 'Save event' : 'Create event'}
              </Button>
            </div>
          </div>
        </ModalFooter>
      </form>
    </BaseModal>
  )
}
