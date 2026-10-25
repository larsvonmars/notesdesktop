'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FilePenLine,
  FileText,
  FolderOpen,
  Inbox,
  Layers,
  ListTodo,
  Network,
  PenTool,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ToastProvider'
import { createNote, getNote, type NoteSummary, type NoteType } from '@/lib/notes'
import { getLastOpenedNote } from '@/lib/note-activity'
import type { Folder } from '@/lib/folders'
import type { Project } from '@/lib/projects'
import { completeTask, getTasks, uncompleteTask, type Task } from '@/lib/tasks'
import { getEvents, type CalendarEvent } from '@/lib/events'
import {
  getNoteTypePresentation,
  getOrderedNoteTypePresentations,
  type NoteTypeIconKey,
  type NoteTypePresentation,
} from '@/lib/note-types'
import { formatModShortcut } from '@/lib/platform'
import {
  DAY_MS,
  buildWeekActivity,
  bucketTasks,
  countCreatedInLastWeek,
  countTouchedInLastWeek,
  extractNotePreview,
  findStaleNotes,
  formatDueLabel,
  formatEventDay,
  formatEventTime,
  formatHomeDate,
  getGreeting,
  groupNotesByDay,
  quickCaptureContent,
  quickCaptureTitle,
  relativeTime,
  startOfDay,
} from '@/lib/home'

const NOTE_TYPE_ICON_MAP: Record<NoteTypeIconKey, LucideIcon> = {
  'file-text': FileText,
  'pen-tool': PenTool,
  network: Network,
  'book-open': BookOpen,
  'table-2': Table2,
  'file-pen-line': FilePenLine,
}

const PREVIEW_TYPES: ReadonlySet<NoteType> = new Set([
  'rich-text',
  'mindmap',
  'bullet-journal',
  'data-sheet',
])

const PRIORITY_DOT: Record<Task['priority'], string> = {
  urgent: 'bg-danger',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-muted opacity-40',
}

/** Theme-aware tint for note-type accents (adaptive, never hardcoded). */
function typeTint(presentation: NoteTypePresentation): string {
  return `color-mix(in srgb, ${presentation.graphStroke} 16%, transparent)`
}

function typeInk(presentation: NoteTypePresentation): string {
  return `color-mix(in srgb, ${presentation.graphStroke} 72%, var(--foreground))`
}

type TypeFilter = 'all' | NoteType

export interface HomeDashboardProps {
  userId?: string
  userName?: string | null
  notes: NoteSummary[]
  folders: Folder[]
  projects: Project[]
  isLoading?: boolean
  onSelectNote: (note: NoteSummary) => void
  onCreateNote: (type: NoteType) => void
  onNewNote: () => void
  onOpenProject: (projectId: string) => void
  onCreateProject: () => void
  onOpenSearch: () => void
  onOpenTasks: () => void
  onOpenUnfiled: () => void
}

interface SectionHeaderProps {
  icon: LucideIcon
  title: string
  iconClassName: string
  children?: ReactNode
  className?: string
}

function SectionHeader({
  icon: Icon,
  title,
  iconClassName,
  children,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-4 ${className}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}
        >
          <Icon size={14} />
        </span>
        <h2 className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-hover px-3 py-2">
      <div className="text-base font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">{label}</div>
    </div>
  )
}

interface AgendaTaskRowProps {
  task: Task
  now: Date
  onComplete: (task: Task) => void
  onOpen: (target: { note_id: string | null; project_id: string | null }) => void
}

function AgendaTaskRow({ task, now, onComplete, onOpen }: AgendaTaskRowProps) {
  const hasTarget = Boolean(task.note_id || task.project_id)

  return (
    <li className="group flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-surface-hover">
      <button
        type="button"
        onClick={() => onComplete(task)}
        aria-label={`Complete ${task.title}`}
        className="focus-ring flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-border-strong text-transparent transition-colors hover:border-accent hover:bg-accent-light hover:text-accent"
      >
        <Check size={11} />
      </button>

      {hasTarget ? (
        <button
          type="button"
          onClick={() => onOpen(task)}
          className="focus-ring min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[13px] font-medium leading-tight text-foreground">
            {task.title}
          </span>
          <span className="mt-0.5 block text-[10px] text-muted">
            {formatDueLabel(task.due_date, now)}
          </span>
        </button>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-tight text-foreground">
            {task.title}
          </span>
          <span className="mt-0.5 block text-[10px] text-muted">
            {formatDueLabel(task.due_date, now)}
          </span>
        </span>
      )}

      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`}
        title={`${task.priority} priority`}
      />
    </li>
  )
}

interface AgendaEventRowProps {
  event: CalendarEvent
  now: Date
  onOpen: (target: { note_id: string | null; project_id: string | null }) => void
}

function AgendaEventRow({ event, now, onOpen }: AgendaEventRowProps) {
  const hasTarget = Boolean(event.note_id || event.project_id)

  return (
    <li className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-surface-hover">
      <span className="w-12 shrink-0 text-[10px] font-medium tabular-nums text-muted">
        {formatEventTime(event.start_time, event.is_all_day)}
      </span>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: event.color || 'var(--accent)' }}
      />
      {hasTarget ? (
        <button
          type="button"
          onClick={() => onOpen(event)}
          className="focus-ring min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[13px] font-medium text-foreground">{event.title}</span>
          <span className="block text-[10px] text-muted">{formatEventDay(event.start_time, now)}</span>
        </button>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">{event.title}</span>
          <span className="block text-[10px] text-muted">{formatEventDay(event.start_time, now)}</span>
        </span>
      )}
    </li>
  )
}

function RecentSkeleton() {
  return (
    <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="glass-card p-3.5">
          <div className="flex items-start gap-2.5">
            <div className="skeleton-shimmer h-9 w-9 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2 pt-0.5">
              <div className="skeleton-shimmer h-3 w-3/5 rounded-full" />
              <div className="skeleton-shimmer h-2.5 w-2/5 rounded-full" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="skeleton-shimmer h-2.5 w-16 rounded-full" />
            <div className="skeleton-shimmer h-2.5 w-10 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function HomeDashboard({
  userId,
  userName,
  notes,
  folders,
  projects,
  isLoading = false,
  onSelectNote,
  onCreateNote,
  onNewNote,
  onOpenProject,
  onCreateProject,
  onOpenSearch,
  onOpenTasks,
  onOpenUnfiled,
}: HomeDashboardProps) {
  const toast = useToast()
  const [now, setNow] = useState(() => new Date())
  const [captureText, setCaptureText] = useState('')
  const [isCapturing, setIsCapturing] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoadingAgenda, setIsLoadingAgenda] = useState(true)
  const [agendaUnavailable, setAgendaUnavailable] = useState(false)
  const [preview, setPreview] = useState('')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)

  const sortedNotes = useMemo(
    () =>
      [...notes].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [notes],
  )
  const lastOpened = useMemo(
    () => (userId ? getLastOpenedNote(userId) : null),
    [userId],
  )
  const lastOpenedNote = lastOpened
    ? notes.find((note) => note.id === lastOpened.noteId)
    : undefined
  const continueNote = lastOpenedNote ?? sortedNotes[0]
  const continueOpenedAt =
    lastOpenedNote && lastOpened && lastOpenedNote.id === lastOpened.noteId
      ? lastOpened.openedAt
      : null
  const recentSource = useMemo(
    () => sortedNotes.filter((note) => note.id !== continueNote?.id).slice(0, 12),
    [sortedNotes, continueNote?.id],
  )

  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders])
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )

  const getNoteContext = (note: NoteSummary): string => {
    const project = note.project_id ? projectById.get(note.project_id) : undefined
    const folder = note.folder_id ? folderById.get(note.folder_id) : undefined
    return [project?.name, folder?.name].filter(Boolean).join(' / ') || 'Unfiled'
  }

  const typeCounts = useMemo(() => {
    const counts = new Map<NoteType, number>()
    for (const note of recentSource) {
      counts.set(note.note_type, (counts.get(note.note_type) ?? 0) + 1)
    }
    return counts
  }, [recentSource])

  const availableTypeFilters = useMemo(
    () =>
      getOrderedNoteTypePresentations().filter(
        (presentation) => (typeCounts.get(presentation.id) ?? 0) > 0,
      ),
    [typeCounts],
  )

  const visibleRecentNotes = useMemo(
    () =>
      typeFilter === 'all'
        ? recentSource
        : recentSource.filter((note) => note.note_type === typeFilter),
    [recentSource, typeFilter],
  )
  const recentGroups = useMemo(
    () => groupNotesByDay(visibleRecentNotes, now),
    [visibleRecentNotes, now],
  )

  const taskBuckets = useMemo(() => bucketTasks(tasks, now), [tasks, now])
  const todayTasks = taskBuckets.today
  const overdueTasks = taskBuckets.overdue
  const upcomingTasks = taskBuckets.upcoming
  const upcomingEvents = useMemo(
    () => events.filter((event) => !event.is_cancelled).slice(0, 4),
    [events],
  )

  const projectStats = useMemo(() => {
    const noteCounts = new Map<string, number>()
    const lastActivity = new Map<string, number>()

    for (const note of notes) {
      if (!note.project_id) continue
      noteCounts.set(note.project_id, (noteCounts.get(note.project_id) ?? 0) + 1)
      const updated = new Date(note.updated_at).getTime()
      if (!Number.isNaN(updated) && updated > (lastActivity.get(note.project_id) ?? 0)) {
        lastActivity.set(note.project_id, updated)
      }
    }

    const openTaskCounts = new Map<string, number>()
    for (const task of tasks) {
      if (!task.project_id) continue
      if (task.status === 'completed' || task.status === 'cancelled') continue
      openTaskCounts.set(task.project_id, (openTaskCounts.get(task.project_id) ?? 0) + 1)
    }

    return projects
      .map((project) => ({
        project,
        noteCount: noteCounts.get(project.id) ?? 0,
        openTaskCount: openTaskCounts.get(project.id) ?? 0,
        lastActivity: lastActivity.get(project.id) ?? new Date(project.updated_at).getTime(),
      }))
      .sort((a, b) => b.lastActivity - a.lastActivity)
  }, [notes, projects, tasks])

  const weekActivity = useMemo(() => buildWeekActivity(notes, now), [notes, now])
  const weekMax = Math.max(1, ...weekActivity.map((day) => day.count))
  const touchedThisWeek = useMemo(() => countTouchedInLastWeek(notes, now), [notes, now])
  const createdThisWeek = useMemo(() => countCreatedInLastWeek(notes, now), [notes, now])
  const staleNotes = useMemo(() => findStaleNotes(notes, 21, now, 3), [notes, now])
  const unfiledCount = useMemo(
    () => notes.filter((note) => !note.folder_id && !note.project_id).length,
    [notes],
  )

  const continueNoteId = continueNote?.id
  const continueNoteType = continueNote?.note_type

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!continueNoteId || !continueNoteType || !PREVIEW_TYPES.has(continueNoteType)) {
      setPreview('')
      setIsPreviewLoading(false)
      return
    }

    let cancelled = false
    setIsPreviewLoading(true)

    void getNote(continueNoteId)
      .then((note) => {
        if (cancelled || !note) return
        if (note.content.length <= 400_000) {
          setPreview(extractNotePreview(note.note_type, note.content))
        }
      })
      .catch(() => {
        /* Preview is optional — the note can still be opened. */
      })
      .finally(() => {
        if (!cancelled) setIsPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [continueNoteId, continueNoteType])

  useEffect(() => {
    let cancelled = false
    const start = startOfDay(new Date())
    const end = new Date(start.getTime() + 8 * DAY_MS)

    void Promise.allSettled([
      getTasks({ includeArchived: false, includeCompleted: false }),
      getEvents({ startDate: start, endDate: end }),
    ]).then(([taskResult, eventResult]) => {
      if (cancelled) return

      let unavailable = false

      if (taskResult.status === 'fulfilled') {
        setTasks(taskResult.value)
      } else {
        console.warn('Home: tasks could not be loaded', taskResult.reason)
        unavailable = true
      }

      if (eventResult.status === 'fulfilled') {
        setEvents(eventResult.value)
      } else {
        console.warn('Home: calendar events could not be loaded', eventResult.reason)
        unavailable = true
      }

      setAgendaUnavailable(unavailable)
      setIsLoadingAgenda(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const handleCapture = async () => {
    const text = captureText.trim()
    if (!text || isCapturing) return

    setIsCapturing(true)
    try {
      const created = await createNote({
        title: quickCaptureTitle(text),
        content: quickCaptureContent(text),
        folder_id: null,
        project_id: null,
        note_type: 'rich-text',
      })
      setCaptureText('')
      toast.push({
        title: 'Captured to Unfiled',
        description: created.title,
        variant: 'success',
        action: {
          label: 'Open',
          onClick: () => onSelectNote(created),
        },
      })
    } catch (error) {
      console.error('Quick capture failed:', error)
      toast.push({
        title: 'Capture failed',
        description: 'Could not save your note. Please try again.',
        variant: 'error',
      })
    } finally {
      setIsCapturing(false)
    }
  }

  const handleCaptureSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleCapture()
  }

  const handleCaptureKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void handleCapture()
    }
  }

  const handleCompleteTask = async (task: Task) => {
    setTasks((previous) => previous.filter((candidate) => candidate.id !== task.id))

    try {
      await completeTask(task.id)
      toast.push({
        title: 'Task completed',
        description: task.title,
        variant: 'success',
        action: {
          label: 'Undo',
          onClick: () => {
            void uncompleteTask(task.id)
              .then(() => {
                setTasks((previous) =>
                  previous.some((candidate) => candidate.id === task.id)
                    ? previous
                    : [...previous, task],
                )
              })
              .catch(() => {
                toast.push({
                  title: 'Could not reopen task',
                  description: 'Please try again.',
                  variant: 'error',
                })
              })
          },
        },
      })
    } catch (error) {
      console.error('Failed to complete task:', error)
      setTasks((previous) =>
        previous.some((candidate) => candidate.id === task.id) ? previous : [...previous, task],
      )
      toast.push({
        title: 'Could not complete task',
        description: 'Please try again.',
        variant: 'error',
      })
    }
  }

  const openTarget = (target: { note_id: string | null; project_id: string | null }) => {
    if (target.note_id) {
      const linkedNote = notes.find((note) => note.id === target.note_id)
      if (linkedNote) {
        onSelectNote(linkedNote)
        return
      }
    }

    if (target.project_id) {
      onOpenProject(target.project_id)
    }
  }

  const greeting = getGreeting(now)
  const hasAgendaItems =
    overdueTasks.length + todayTasks.length + upcomingTasks.length + upcomingEvents.length > 0
  const dueTodayCount = overdueTasks.length + todayTasks.length

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-12">
        <header className="animate-rise-in">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            {formatHomeDate(now)}
          </p>
          <h1 className="mt-1.5 flex flex-wrap items-baseline gap-x-1 font-display text-[28px] font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            <span className="text-gradient">
              {greeting.text}
              {userName ? `, ${userName}` : ''}
            </span>
            <span aria-hidden className="text-2xl">
              {greeting.emoji}
            </span>
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">
            Here&apos;s what deserves your attention today.
          </p>
        </header>

        <div className="animate-rise-in mt-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onNewNote} className="glass-btn-primary h-11 sm:h-9">
            <Plus size={15} />
            New note
          </button>
          <button type="button" onClick={onCreateProject} className="glass-btn h-11 sm:h-9">
            <Layers size={14} />
            New project
          </button>
          <button type="button" onClick={onOpenSearch} className="glass-btn h-11 sm:h-9">
            <Search size={14} />
            Search
            <kbd className="kbd">{formatModShortcut('K')}</kbd>
          </button>
          <button type="button" onClick={onOpenTasks} className="glass-btn h-11 sm:h-9">
            <ListTodo size={14} />
            Tasks
            {dueTodayCount > 0 && (
              <span className="rounded-full bg-accent-light px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
                {dueTodayCount}
              </span>
            )}
          </button>
        </div>

        <section className="glass-card animate-rise-in mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent">
                <Zap size={14} />
              </span>
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                Quick capture
              </h2>
              <span className="hidden text-[11px] text-muted sm:inline">Saved to Unfiled</span>
            </div>

            {unfiledCount > 0 && (
              <button
                type="button"
                onClick={onOpenUnfiled}
                className="glass-btn-ghost w-auto gap-1 px-2.5 text-[11px]"
              >
                <Inbox size={12} />
                {unfiledCount} unfiled
                <ChevronRight size={11} />
              </button>
            )}
          </div>

          <div className="px-5 pb-4 pt-3">
            <form onSubmit={handleCaptureSubmit}>
              <label htmlFor="home-quick-capture" className="sr-only">
                Capture a thought
              </label>
              <textarea
                id="home-quick-capture"
                value={captureText}
                onChange={(event) => setCaptureText(event.target.value)}
                onKeyDown={handleCaptureKeyDown}
                placeholder="What's on your mind? Capture it before it disappears…"
                rows={2}
                className="glass-input h-auto min-h-[76px] w-full resize-none px-3.5 py-3 text-sm leading-6"
              />
              <div className="mt-2.5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] text-muted">
                  The first line becomes the title. Press {formatModShortcut('Enter')} to save.
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={ArrowRight}
                  loading={isCapturing}
                  disabled={!captureText.trim()}
                  className="self-end sm:self-auto"
                >
                  Capture
                </Button>
              </div>
            </form>
          </div>

          <div className="glass-divider" />

          <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Start new
            </span>
            {getOrderedNoteTypePresentations().map((presentation) => {
              const Icon = NOTE_TYPE_ICON_MAP[presentation.iconKey]
              return (
                <button
                  key={presentation.id}
                  type="button"
                  onClick={() => onCreateNote(presentation.id)}
                  className="glass-btn h-9 gap-1.5 px-2.5 text-[11px] font-medium"
                >
                  <Icon size={12} style={{ color: typeInk(presentation) }} />
                  {presentation.pickerLabel}
                </button>
              )
            })}
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          <div className="min-w-0 space-y-5 lg:col-span-7">
            <section className="glass-card overflow-hidden">
              <SectionHeader
                icon={Clock3}
                title="Continue where you left off"
                iconClassName="bg-accent-light text-accent"
              >
                {continueNote && (
                  <span className="text-[11px] text-muted">
                    {continueOpenedAt
                      ? `Opened ${relativeTime(continueOpenedAt, now.getTime())}`
                      : `Edited ${relativeTime(continueNote.updated_at, now.getTime())}`}
                  </span>
                )}
              </SectionHeader>

              {continueNote ? (
                <div className="px-5 pb-5">
                  <div className="flex items-start gap-3">
                    {(() => {
                      const presentation = getNoteTypePresentation(continueNote.note_type)
                      const Icon = NOTE_TYPE_ICON_MAP[presentation.iconKey]
                      return (
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                          style={{
                            backgroundColor: typeTint(presentation),
                            color: typeInk(presentation),
                          }}
                        >
                          <Icon size={19} />
                        </span>
                      )
                    })()}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-display text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground">
                        {continueNote.title || 'Untitled'}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {getNoteContext(continueNote)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">
                    {isPreviewLoading
                      ? 'Loading a preview…'
                      : preview ||
                        getNoteTypePresentation(continueNote.note_type).description}
                  </p>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
                      {getNoteTypePresentation(continueNote.note_type).label}
                    </span>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={ArrowRight}
                      onClick={() => onSelectNote(continueNote)}
                    >
                      Resume
                    </Button>
                  </div>
                </div>
              ) : isLoading ? (
                <div className="space-y-3 px-5 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="skeleton-shimmer h-11 w-11 shrink-0 rounded-2xl" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton-shimmer h-4 w-1/2 rounded-full" />
                      <div className="skeleton-shimmer h-3 w-1/3 rounded-full" />
                    </div>
                  </div>
                  <div className="skeleton-shimmer h-3 w-full rounded-full" />
                  <div className="skeleton-shimmer h-3 w-4/5 rounded-full" />
                </div>
              ) : (
                <div className="flex flex-col items-center px-6 pb-9 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-light text-accent">
                    <Sparkles size={22} />
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-foreground">
                    Your workspace is ready
                  </h3>
                  <p className="mt-1 max-w-sm text-sm leading-6 text-muted">
                    Capture a thought above or start with one of the note types. Everything you
                    create will show up here.
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={onNewNote}
                    className="mt-4"
                  >
                    Create your first note
                  </Button>
                </div>
              )}
            </section>

            <section className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-muted">
                    <FileText size={14} />
                  </span>
                  <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                    Recent notes
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onOpenSearch}
                  className="glass-btn-ghost w-auto gap-1 px-2.5 text-[11px]"
                >
                  Find a note
                  <ArrowUpRight size={12} />
                </button>
              </div>

              {recentSource.length > 0 && (
                <div className="segmented mt-3 w-full overflow-x-auto scrollbar-hide">
                  <button
                    type="button"
                    onClick={() => setTypeFilter('all')}
                    aria-pressed={typeFilter === 'all'}
                    className="segmented-item h-9 shrink-0"
                  >
                    All
                    <span className="tabular-nums opacity-60">{recentSource.length}</span>
                  </button>

                  {availableTypeFilters.map((presentation) => {
                    const Icon = NOTE_TYPE_ICON_MAP[presentation.iconKey]
                    const active = typeFilter === presentation.id
                    return (
                      <button
                        key={presentation.id}
                        type="button"
                        onClick={() => setTypeFilter(presentation.id)}
                        aria-pressed={active}
                        className="segmented-item h-9 shrink-0"
                      >
                        <Icon size={12} />
                        {presentation.label}
                        <span className="tabular-nums opacity-60">
                          {typeCounts.get(presentation.id) ?? 0}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {isLoading && recentSource.length === 0 ? (
                <RecentSkeleton />
              ) : visibleRecentNotes.length === 0 ? (
                <div className="glass-card mt-4 px-6 py-9 text-center">
                  <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-hover text-muted">
                    <FileText size={19} />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    {recentSource.length === 0 ? 'No other recent notes' : 'No notes of this type'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {recentSource.length === 0
                      ? 'New notes and edits will appear here so you can jump back in.'
                      : 'Try another filter or open a new note.'}
                  </p>
                  {typeFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setTypeFilter('all')}
                      className="focus-ring mt-3 rounded-lg text-xs font-medium text-accent hover:underline"
                    >
                      Show all recent notes
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {recentGroups.map((group) => (
                    <div key={group.key}>
                      <div className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                        {group.label}
                      </div>
                      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {group.notes.map((note) => {
                          const presentation = getNoteTypePresentation(note.note_type)
                          const Icon = NOTE_TYPE_ICON_MAP[presentation.iconKey]
                          return (
                            <li key={note.id} className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onSelectNote(note)}
                                className="glass-card hover-lift focus-ring group flex h-full w-full flex-col gap-3 p-3.5 text-left"
                              >
                                <div className="flex w-full items-start gap-2.5">
                                  <span
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                                    style={{
                                      backgroundColor: typeTint(presentation),
                                      color: typeInk(presentation),
                                    }}
                                  >
                                    <Icon size={16} />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-medium leading-snug text-foreground">
                                      {note.title || 'Untitled'}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                                      {getNoteContext(note)}
                                    </span>
                                  </span>
                                  <ArrowUpRight
                                    size={13}
                                    className="mt-0.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                                  />
                                </div>
                                <div className="mt-auto flex w-full items-center justify-between gap-2">
                                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-muted">
                                    <span
                                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                                      style={{ backgroundColor: presentation.graphStroke }}
                                    />
                                    <span className="truncate">{presentation.label}</span>
                                  </span>
                                  <span className="shrink-0 text-[10px] tabular-nums text-muted">
                                    {relativeTime(note.updated_at, now.getTime())}
                                  </span>
                                </div>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="min-w-0 space-y-5 lg:col-span-5">
            <section className="glass-card overflow-hidden">
              <SectionHeader
                icon={CalendarDays}
                title="Today"
                iconClassName="bg-warning-light text-warning"
              >
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-muted">
                    {dueTodayCount > 0 ? `${dueTodayCount} due` : 'Nothing due'}
                  </span>
                  <button
                    type="button"
                    onClick={onOpenTasks}
                    className="glass-btn-ghost w-auto gap-1 px-2 text-[11px]"
                  >
                    View all
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              </SectionHeader>

              <div className="px-3 pb-4">
                {isLoadingAgenda ? (
                  <div className="space-y-2.5 px-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="flex items-center gap-2.5">
                        <div className="skeleton-shimmer h-[18px] w-[18px] shrink-0 rounded-full" />
                        <div className="skeleton-shimmer h-3 flex-1 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {agendaUnavailable && (
                      <button
                        type="button"
                        onClick={onOpenTasks}
                        className="focus-ring mb-3 flex w-full items-center gap-2 rounded-xl border border-warning bg-warning-light px-3 py-2 text-left text-[11px] font-medium text-warning transition-opacity hover:opacity-80"
                      >
                        <AlertTriangle size={12} className="shrink-0" />
                        Some agenda data couldn&apos;t be loaded. Open Tasks to retry.
                      </button>
                    )}

                    {(overdueTasks.length > 0 || todayTasks.length > 0) && (
                      <>
                        {overdueTasks.length > 0 && (
                          <div className="mb-3">
                            <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-danger">
                              <AlertTriangle size={11} />
                              Overdue
                            </div>
                            <ul>
                              {overdueTasks.slice(0, 3).map((task) => (
                                <AgendaTaskRow
                                  key={task.id}
                                  task={task}
                                  now={now}
                                  onComplete={handleCompleteTask}
                                  onOpen={openTarget}
                                />
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                          Due today
                        </div>
                        {todayTasks.length === 0 ? (
                          <p className="px-2 py-1 text-xs text-muted">Nothing due today.</p>
                        ) : (
                          <ul>
                            {todayTasks.slice(0, 4).map((task) => (
                              <AgendaTaskRow
                                key={task.id}
                                task={task}
                                now={now}
                                onComplete={handleCompleteTask}
                                onOpen={openTarget}
                              />
                            ))}
                          </ul>
                        )}
                      </>
                    )}

                    {upcomingTasks.length > 0 && (
                      <div className="mt-3 border-t border-border pt-3">
                        <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                          Next 7 days
                        </div>
                        <ul>
                          {upcomingTasks.slice(0, 3).map((task) => (
                            <AgendaTaskRow
                              key={task.id}
                              task={task}
                              now={now}
                              onComplete={handleCompleteTask}
                              onOpen={openTarget}
                            />
                          ))}
                        </ul>
                      </div>
                    )}

                    {upcomingEvents.length > 0 && (
                      <div className="mt-3 border-t border-border pt-3">
                        <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                          Agenda
                        </div>
                        <ul>
                          {upcomingEvents.map((event) => (
                            <AgendaEventRow
                              key={event.id}
                              event={event}
                              now={now}
                              onOpen={openTarget}
                            />
                          ))}
                        </ul>
                      </div>
                    )}

                    {!hasAgendaItems && !agendaUnavailable && (
                      <div className="mt-2 rounded-2xl border border-dashed border-border px-4 py-6 text-center">
                        <p className="text-sm font-medium text-foreground">A clear day.</p>
                        <p className="mt-0.5 text-xs text-muted">
                          Plan it in a journal or keep capturing ideas above.
                        </p>
                        <button
                          type="button"
                          onClick={() => onCreateNote('bullet-journal')}
                          className="focus-ring mt-3 rounded-lg text-xs font-medium text-accent hover:underline"
                        >
                          Open a journal
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            <section className="glass-card overflow-hidden">
              <SectionHeader
                icon={Layers}
                title="Projects"
                iconClassName="bg-accent-light text-accent"
              >
                <span className="text-[11px] tabular-nums text-muted">{projectStats.length}</span>
              </SectionHeader>

              <div className="px-4 pb-4">
                {projectStats.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center">
                    <p className="text-sm font-medium text-foreground">Big efforts deserve a home.</p>
                    <p className="mt-0.5 text-xs text-muted">
                      Group notes, folders, and tasks into a project.
                    </p>
                    <button
                      type="button"
                      onClick={onCreateProject}
                      className="focus-ring mt-3 rounded-lg text-xs font-medium text-accent hover:underline"
                    >
                      Create a project
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {projectStats.slice(0, 6).map(
                      ({ project, noteCount, openTaskCount, lastActivity }) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => onOpenProject(project.id)}
                          title={`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}${
                            openTaskCount > 0
                              ? ` · ${openTaskCount} open ${openTaskCount === 1 ? 'task' : 'tasks'}`
                              : ''
                          } · active ${relativeTime(new Date(lastActivity).toISOString(), now.getTime())}`}
                          className="glass-btn h-9 max-w-full gap-2 px-3"
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="min-w-0 truncate text-xs font-medium text-foreground">
                            {project.name}
                          </span>
                          <span className="shrink-0 rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
                            {noteCount}
                          </span>
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      onClick={onCreateProject}
                      className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                    >
                      <Plus size={12} />
                      New
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="glass-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-accent-light text-accent">
                    <TrendingUp size={14} />
                  </span>
                  <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                    Last 7 days
                  </h2>
                </div>
                <span className="text-[11px] text-muted">{touchedThisWeek} touched</span>
              </div>

              <div className="mt-4 flex h-[76px] items-end gap-1.5">
                {weekActivity.map((day) => (
                  <div
                    key={day.iso}
                    className="flex flex-1 flex-col items-center gap-1.5"
                    title={`${day.fullLabel}: ${day.count} ${day.count === 1 ? 'note' : 'notes'}`}
                  >
                    <div className="flex h-14 w-full items-end overflow-hidden rounded-lg bg-surface-hover">
                      <div
                        className={`w-full rounded-lg transition-[height] duration-300 ${
                          day.isToday ? '' : 'opacity-40'
                        }`}
                        style={{
                          height: `${day.count === 0 ? 4 : Math.max(14, (day.count / weekMax) * 100)}%`,
                          background: day.isToday ? 'var(--accent-gradient)' : 'var(--accent)',
                        }}
                      />
                    </div>
                    <span
                      className={`text-[9px] font-medium uppercase ${
                        day.isToday ? 'text-accent' : 'text-muted'
                      }`}
                    >
                      {day.label.slice(0, 2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <Metric label="Edited" value={touchedThisWeek} />
                <Metric label="Created" value={createdThisWeek} />
                <Metric label="Total" value={notes.length} />
              </div>
            </section>

            {staleNotes.length > 0 && (
              <section className="glass-card overflow-hidden">
                <SectionHeader
                  icon={RotateCcw}
                  title="Worth another look"
                  iconClassName="bg-surface-hover text-muted"
                />

                <ul className="px-2 pb-2">
                  {staleNotes.map((note) => {
                    const presentation = getNoteTypePresentation(note.note_type)
                    const Icon = NOTE_TYPE_ICON_MAP[presentation.iconKey]
                    return (
                      <li key={note.id}>
                        <button
                          type="button"
                          onClick={() => onSelectNote(note)}
                          className="glass-row group gap-2.5 px-2.5 py-2"
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                            style={{
                              backgroundColor: typeTint(presentation),
                              color: typeInk(presentation),
                            }}
                          >
                            <Icon size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-foreground">
                              {note.title || 'Untitled'}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-muted">
                              {getNoteContext(note)} · last touched{' '}
                              {relativeTime(note.updated_at, now.getTime())}
                            </span>
                          </span>
                          <ArrowUpRight
                            size={13}
                            className="shrink-0 text-muted opacity-60 transition-opacity group-hover:opacity-100"
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            <p className="px-1 text-center text-[10px] leading-relaxed text-muted">
              Tip: use <kbd className="kbd">{formatModShortcut('K')}</kbd> to search everything, or
              open <FolderOpen size={10} className="inline align-[-1px]" /> Files for your documents.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
