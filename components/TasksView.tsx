'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  Layers,
  ListTodo,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react'
import BaseModal, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/BaseModal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ToastProvider'
import type { NoteSummary } from '@/lib/notes'
import type { Project } from '@/lib/projects'
import {
  completeTask,
  createTask,
  deleteTask,
  getTasks,
  toggleTaskStar,
  uncompleteTask,
  updateTask,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/tasks'
import {
  createEvent,
  deleteEvent,
  getEvents,
  updateEvent,
  type CalendarEvent,
} from '@/lib/events'
import {
  DAY_MS,
  formatDueLabel,
  formatEventTime,
  relativeTime,
  startOfDay,
} from '@/lib/home'
import {
  dateAndTimeToLocalDate,
  dateInputToLocalDate,
  getCompletedTasks,
  groupEventsByDay,
  groupsForFilter,
  groupOpenTasks,
  isTaskDueToday,
  isTaskOpen,
  isTaskOverdue,
  toDateInputValue,
  toTimeInputValue,
  type TaskViewFilter,
} from '@/lib/task-agenda'

const FIELD_CLASS = 'glass-input h-10 px-3.5 text-sm'
const TEXTAREA_CLASS =
  'glass-input h-auto min-h-[88px] w-full resize-none px-3.5 py-2.5 text-sm leading-6'
const LABEL_CLASS =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted'

const PRIORITY_META: Record<TaskPriority, { label: string; className: string; dot: string }> = {
  urgent: { label: 'Urgent', className: 'text-danger', dot: 'bg-danger' },
  high: { label: 'High', className: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  medium: { label: 'Medium', className: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  low: { label: 'Low', className: 'text-muted', dot: 'bg-muted' },
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  waiting: 'Waiting',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_PILL: Record<TaskStatus, string> = {
  todo: 'bg-surface-hover text-muted',
  in_progress: 'bg-accent-light text-accent',
  waiting: 'bg-warning-light text-warning',
  completed: 'bg-success-light text-success',
  cancelled: 'bg-surface-hover text-muted',
}

const TASK_FILTERS: { key: TaskViewFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'open', label: 'All open' },
  { key: 'completed', label: 'Completed' },
]

interface TaskFormState {
  title: string
  description: string
  dueDate: string
  priority: TaskPriority
  status: TaskStatus
  projectId: string
  noteId: string
}

interface EventFormState {
  title: string
  description: string
  location: string
  date: string
  startTime: string
  endTime: string
  allDay: boolean
  projectId: string
  noteId: string
}

function emptyTaskForm(): TaskFormState {
  return {
    title: '',
    description: '',
    dueDate: toDateInputValue(new Date()),
    priority: 'medium',
    status: 'todo',
    projectId: '',
    noteId: '',
  }
}

function taskToForm(task: Task): TaskFormState {
  return {
    title: task.title,
    description: task.description ?? '',
    dueDate: toDateInputValue(task.due_date),
    priority: task.priority,
    status: task.status,
    projectId: task.project_id ?? '',
    noteId: task.note_id ?? '',
  }
}

function defaultEventForm(): EventFormState {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start.getTime() + 60 * 60 * 1000)

  return {
    title: '',
    description: '',
    location: '',
    date: toDateInputValue(start),
    startTime: toTimeInputValue(start),
    endTime: toTimeInputValue(end),
    allDay: false,
    projectId: '',
    noteId: '',
  }
}

function eventToForm(event: CalendarEvent): EventFormState {
  return {
    title: event.title,
    description: event.description ?? '',
    location: event.location ?? '',
    date: toDateInputValue(event.start_time),
    startTime: toTimeInputValue(event.start_time),
    endTime: toTimeInputValue(event.end_time),
    allDay: event.is_all_day,
    projectId: event.project_id ?? '',
    noteId: event.note_id ?? '',
  }
}

interface TaskRowProps {
  task: Task
  now: Date
  project?: Project
  note?: NoteSummary
  onToggleComplete: (task: Task) => void
  onToggleStar: (task: Task) => void
  onEdit: (task: Task) => void
  onOpenProject: (projectId: string) => void
  onOpenNote: (note: NoteSummary) => void
}

function TaskRow({
  task,
  now,
  project,
  note,
  onToggleComplete,
  onToggleStar,
  onEdit,
  onOpenProject,
  onOpenNote,
}: TaskRowProps) {
  const completed = task.status === 'completed' || task.status === 'cancelled'
  const overdue = !completed && isTaskOverdue(task, now)
  const dueToday = !completed && isTaskDueToday(task, now)
  const priority = PRIORITY_META[task.priority]

  return (
    <li className="group flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-hover">
      <button
        type="button"
        onClick={() => onToggleComplete(task)}
        aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className={`focus-ring mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
          completed
            ? 'bg-accent text-accent-foreground'
            : 'border border-border-strong text-transparent hover:border-accent hover:bg-accent-light hover:text-accent'
        }`}
      >
        {completed ? <Check size={11} /> : <Circle size={10} />}
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="focus-ring block w-full rounded-md text-left"
        >
          <span
            className={`block text-[13px] font-medium leading-snug ${
              completed ? 'text-muted line-through' : 'text-foreground'
            }`}
          >
            {task.title}
          </span>
        </button>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
          {completed ? (
            <span className="inline-flex items-center gap-1 font-medium text-muted">
              <Clock3 size={10} />
              {task.status === 'cancelled'
                ? 'Cancelled'
                : task.completed_at
                  ? `Completed ${relativeTime(task.completed_at, now.getTime())}`
                  : 'Completed'}
            </span>
          ) : (
            task.due_date && (
              <span
                className={`inline-flex items-center gap-1 font-medium ${
                  overdue ? 'text-danger' : dueToday ? 'text-accent' : 'text-muted'
                }`}
              >
                <Clock3 size={10} />
                {formatDueLabel(task.due_date, now)}
              </span>
            )
          )}

          <span className={`inline-flex items-center gap-1 font-medium ${priority.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
            {priority.label}
          </span>

          {task.status !== 'todo' &&
            task.status !== 'completed' &&
            task.status !== 'cancelled' && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ${STATUS_PILL[task.status]}`}
              >
                {STATUS_LABELS[task.status]}
              </span>
            )}

          {project && (
            <button
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="focus-ring inline-flex max-w-[160px] items-center gap-1 rounded-md px-1 py-0.5 text-muted transition-colors hover:bg-surface-active hover:text-foreground"
              title={`Open project ${project.name}`}
            >
              <Layers size={10} />
              <span className="truncate">{project.name}</span>
            </button>
          )}

          {note && (
            <button
              type="button"
              onClick={() => onOpenNote(note)}
              className="focus-ring inline-flex max-w-[180px] items-center gap-1 rounded-md px-1 py-0.5 text-muted transition-colors hover:bg-surface-active hover:text-foreground"
              title={`Open note ${note.title || 'Untitled'}`}
            >
              <FileText size={10} />
              <span className="truncate">{note.title || 'Untitled'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => onToggleStar(task)}
          aria-label={task.is_starred ? `Unstar ${task.title}` : `Star ${task.title}`}
          className={`focus-ring flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-surface-active ${
            task.is_starred
              ? 'text-amber-500'
              : 'text-muted sm:text-transparent sm:group-hover:text-muted focus-visible:text-muted'
          }`}
        >
          <Star size={13} fill={task.is_starred ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          onClick={() => onEdit(task)}
          aria-label={`Edit ${task.title}`}
          className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-active hover:text-foreground focus-visible:text-muted sm:text-transparent sm:group-hover:text-muted"
        >
          <Pencil size={13} />
        </button>
      </div>
    </li>
  )
}

interface EventRowProps {
  event: CalendarEvent
  project?: Project
  note?: NoteSummary
  onEdit: (event: CalendarEvent) => void
  onOpenProject: (projectId: string) => void
  onOpenNote: (note: NoteSummary) => void
}

function EventRow({ event, project, note, onEdit, onOpenProject, onOpenNote }: EventRowProps) {
  return (
    <li className="group flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-hover">
      <div className="w-16 shrink-0 pt-0.5 text-right">
        <div className="text-[11px] font-semibold tabular-nums text-foreground">
          {event.is_all_day ? 'All day' : formatEventTime(event.start_time)}
        </div>
        {!event.is_all_day && (
          <div className="text-[10px] tabular-nums text-muted">
            {formatEventTime(event.end_time)}
          </div>
        )}
      </div>

      <span
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: event.color || 'var(--accent)' }}
      />

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit(event)}
          className="focus-ring block w-full rounded-md text-left"
        >
          <span className="block truncate text-[13px] font-medium text-foreground">
            {event.title}
          </span>
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
          {event.location && <span className="truncate">{event.location}</span>}
          {event.category && <span>{event.category}</span>}
          {project && (
            <button
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="focus-ring inline-flex max-w-[140px] items-center gap-1 rounded-md px-1 py-0.5 text-muted transition-colors hover:bg-surface-active hover:text-foreground"
              title={`Open project ${project.name}`}
            >
              <Layers size={10} />
              <span className="truncate">{project.name}</span>
            </button>
          )}
          {note && (
            <button
              type="button"
              onClick={() => onOpenNote(note)}
              className="focus-ring inline-flex max-w-[160px] items-center gap-1 rounded-md px-1 py-0.5 text-muted transition-colors hover:bg-surface-active hover:text-foreground"
              title={`Open note ${note.title || 'Untitled'}`}
            >
              <FileText size={10} />
              <span className="truncate">{note.title || 'Untitled'}</span>
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onEdit(event)}
        aria-label={`Edit ${event.title}`}
        className="focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-active hover:text-foreground focus-visible:text-muted sm:text-transparent sm:group-hover:text-muted"
      >
        <Pencil size={13} />
      </button>
    </li>
  )
}

export interface TasksViewProps {
  notes: NoteSummary[]
  projects: Project[]
  onSelectNote: (note: NoteSummary) => void
  onOpenProject: (projectId: string) => void
}

export default function TasksView({
  notes,
  projects,
  onSelectNote,
  onOpenProject,
}: TasksViewProps) {
  const toast = useToast()
  const [now, setNow] = useState(() => new Date())
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [agendaError, setAgendaError] = useState(false)

  const [tab, setTab] = useState<'tasks' | 'agenda'>('tasks')
  const [filter, setFilter] = useState<TaskViewFilter>('today')
  const [quickTitle, setQuickTitle] = useState('')
  const [isAddingQuick, setIsAddingQuick] = useState(false)

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm)
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [isDeletingTask, setIsDeletingTask] = useState(false)

  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [eventForm, setEventForm] = useState<EventFormState>(defaultEventForm)
  const [isSavingEvent, setIsSavingEvent] = useState(false)
  const [isDeletingEvent, setIsDeletingEvent] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setAgendaError(false)

    const start = startOfDay(new Date())
    const end = new Date(start.getTime() + 45 * DAY_MS)
    const [taskResult, eventResult] = await Promise.allSettled([
      getTasks({ includeArchived: false, includeCompleted: true }),
      getEvents({ startDate: start, endDate: end }),
    ])

    if (taskResult.status === 'fulfilled') {
      setTasks(taskResult.value)
    }

    if (eventResult.status === 'fulfilled') {
      setEvents(eventResult.value)
    } else {
      console.warn('Events could not be loaded:', eventResult.reason)
      setAgendaError(true)
    }

    if (taskResult.status === 'rejected') {
      console.error('Tasks could not be loaded:', taskResult.reason)
      setLoadError('Tasks could not be loaded. Check your connection and try again.')
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes])

  const openTasks = useMemo(() => tasks.filter(isTaskOpen), [tasks])
  const taskGroups = useMemo(() => groupOpenTasks(tasks, now), [tasks, now])
  const visibleGroups = useMemo(
    () => groupsForFilter(taskGroups, filter),
    [taskGroups, filter],
  )
  const completedTasks = useMemo(() => getCompletedTasks(tasks), [tasks])
  const eventGroups = useMemo(() => groupEventsByDay(events, now), [events, now])
  const upcomingEventCount = useMemo(
    () => events.filter((event) => !event.is_cancelled && new Date(event.start_time) >= startOfDay(now)).length,
    [events, now],
  )

  const filterCounts: Record<TaskViewFilter, number> = useMemo(
    () => ({
      today: taskGroups
        .filter((group) => group.key === 'overdue' || group.key === 'today')
        .reduce((total, group) => total + group.tasks.length, 0),
      week: taskGroups
        .filter((group) => group.key === 'overdue' || group.key === 'today' || group.key === 'week')
        .reduce((total, group) => total + group.tasks.length, 0),
      open: openTasks.length,
      completed: completedTasks.length,
    }),
    [taskGroups, openTasks.length, completedTasks.length],
  )

  const noteOptions = useMemo(() => {
    const sorted = [...notes]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 200)

    const currentIds = [taskForm.noteId, eventForm.noteId].filter(Boolean)
    const current = currentIds
      .map((id) => notes.find((note) => note.id === id))
      .filter((note): note is NoteSummary => Boolean(note))
    const currentIdsSet = new Set(current.map((note) => note.id))

    return [...current, ...sorted.filter((note) => !currentIdsSet.has(note.id))]
  }, [notes, taskForm.noteId, eventForm.noteId])

  const handleQuickAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = quickTitle.trim()
    if (!title || isAddingQuick) return

    setIsAddingQuick(true)
    try {
      const dueDate =
        filter === 'today' || filter === 'week' ? startOfDay(now) : undefined
      const created = await createTask(title, { dueDate })
      setTasks((previous) => [created, ...previous])
      setQuickTitle('')
      if (filter === 'completed') setFilter('open')
      toast.push({ title: 'Task added', description: created.title, variant: 'success' })
    } catch (error) {
      console.error('Quick add failed:', error)
      toast.push({
        title: 'Could not add task',
        description: 'Please try again.',
        variant: 'error',
      })
    } finally {
      setIsAddingQuick(false)
    }
  }

  const openNewTask = () => {
    setEditingTask(null)
    setTaskForm(emptyTaskForm())
    setTaskModalOpen(true)
  }

  const openEditTask = (task: Task) => {
    setEditingTask(task)
    setTaskForm(taskToForm(task))
    setTaskModalOpen(true)
  }

  const closeTaskModal = () => {
    if (isSavingTask || isDeletingTask) return
    setTaskModalOpen(false)
    setEditingTask(null)
  }

  const handleSaveTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = taskForm.title.trim()
    if (!title || isSavingTask) return

    setIsSavingTask(true)
    const due = taskForm.dueDate ? dateInputToLocalDate(taskForm.dueDate) : null
    const status = taskForm.status

    try {
      if (editingTask) {
        const updated = await updateTask(editingTask.id, {
          title,
          description: taskForm.description.trim() || null,
          due_date: due?.toISOString() ?? null,
          priority: taskForm.priority,
          status,
          project_id: taskForm.projectId || null,
          note_id: taskForm.noteId || null,
          completed_at:
            status === 'completed'
              ? editingTask.completed_at ?? new Date().toISOString()
              : null,
        })
        setTasks((previous) =>
          previous.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
        )
        toast.push({ title: 'Task updated', description: updated.title, variant: 'success' })
      } else {
        const created = await createTask(title, {
          description: taskForm.description.trim() || undefined,
          dueDate: due ?? undefined,
          priority: taskForm.priority,
          status,
          projectId: taskForm.projectId || undefined,
          noteId: taskForm.noteId || undefined,
        })
        setTasks((previous) => [created, ...previous])
        toast.push({ title: 'Task created', description: created.title, variant: 'success' })
      }

      setTaskModalOpen(false)
      setEditingTask(null)
    } catch (error) {
      console.error('Saving task failed:', error)
      toast.push({
        title: 'Could not save task',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleDeleteTask = async () => {
    if (!editingTask || isDeletingTask) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this task?')) return

    setIsDeletingTask(true)
    try {
      await deleteTask(editingTask.id)
      setTasks((previous) => previous.filter((task) => task.id !== editingTask.id))
      setTaskModalOpen(false)
      setEditingTask(null)
      toast.push({ title: 'Task deleted', variant: 'warning' })
    } catch (error) {
      console.error('Deleting task failed:', error)
      toast.push({
        title: 'Could not delete task',
        description: 'Please try again.',
        variant: 'error',
      })
    } finally {
      setIsDeletingTask(false)
    }
  }

  const handleToggleComplete = async (task: Task) => {
    const wasCompleted = task.status === 'completed'

    try {
      const updated = wasCompleted ? await uncompleteTask(task.id) : await completeTask(task.id)
      setTasks((previous) =>
        previous.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      )
      toast.push({
        title: wasCompleted ? 'Task reopened' : 'Task completed',
        description: task.title,
        variant: 'success',
        action: {
          label: 'Undo',
          onClick: () => {
            void (wasCompleted ? completeTask(task.id) : uncompleteTask(task.id))
              .then((restored) => {
                setTasks((previous) =>
                  previous.map((candidate) =>
                    candidate.id === restored.id ? restored : candidate,
                  ),
                )
              })
              .catch(() => {
                toast.push({
                  title: 'Could not undo',
                  description: 'Please try again.',
                  variant: 'error',
                })
              })
          },
        },
      })
    } catch (error) {
      console.error('Toggling task failed:', error)
      toast.push({
        title: 'Could not update task',
        description: 'Please try again.',
        variant: 'error',
      })
    }
  }

  const handleToggleStar = async (task: Task) => {
    const next = !task.is_starred
    setTasks((previous) =>
      previous.map((candidate) =>
        candidate.id === task.id ? { ...candidate, is_starred: next } : candidate,
      ),
    )

    try {
      const updated = await toggleTaskStar(task.id, next)
      setTasks((previous) =>
        previous.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      )
    } catch (error) {
      console.error('Starring task failed:', error)
      setTasks((previous) =>
        previous.map((candidate) =>
          candidate.id === task.id ? { ...candidate, is_starred: !next } : candidate,
        ),
      )
      toast.push({
        title: 'Could not update task',
        description: 'Please try again.',
        variant: 'error',
      })
    }
  }

  const openNewEvent = () => {
    setEditingEvent(null)
    setEventForm(defaultEventForm())
    setEventModalOpen(true)
  }

  const openEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event)
    setEventForm(eventToForm(event))
    setEventModalOpen(true)
  }

  const closeEventModal = () => {
    if (isSavingEvent || isDeletingEvent) return
    setEventModalOpen(false)
    setEditingEvent(null)
  }

  const handleSaveEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = eventForm.title.trim()
    if (!title || isSavingEvent) return

    let start: Date | null
    let end: Date | null

    if (eventForm.allDay) {
      const day = dateInputToLocalDate(eventForm.date, 0, 0)
      start = day
      end = day
        ? new Date(
            new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime() - 60_000,
          )
        : null
    } else {
      start = dateAndTimeToLocalDate(eventForm.date, eventForm.startTime)
      end = dateAndTimeToLocalDate(eventForm.date, eventForm.endTime)
    }

    if (!start || !end) {
      toast.push({
        title: 'Check the date and times',
        description: 'Pick a valid day and time range.',
        variant: 'warning',
      })
      return
    }

    if (end.getTime() <= start.getTime()) {
      toast.push({
        title: 'End time must be after the start',
        variant: 'warning',
      })
      return
    }

    setIsSavingEvent(true)
    try {
      if (editingEvent) {
        const updated = await updateEvent(editingEvent.id, {
          title,
          description: eventForm.description.trim() || null,
          location: eventForm.location.trim() || null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          is_all_day: eventForm.allDay,
          project_id: eventForm.projectId || null,
          note_id: eventForm.noteId || null,
        })
        setEvents((previous) =>
          previous.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
        )
        toast.push({ title: 'Event updated', description: updated.title, variant: 'success' })
      } else {
        const created = await createEvent(title, start, end, {
          description: eventForm.description.trim() || undefined,
          location: eventForm.location.trim() || undefined,
          projectId: eventForm.projectId || undefined,
          noteId: eventForm.noteId || undefined,
          isAllDay: eventForm.allDay,
        })
        setEvents((previous) => [...previous, created])
        toast.push({ title: 'Event created', description: created.title, variant: 'success' })
      }

      setEventModalOpen(false)
      setEditingEvent(null)
    } catch (error) {
      console.error('Saving event failed:', error)
      toast.push({
        title: 'Could not save event',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setIsSavingEvent(false)
    }
  }

  const handleDeleteEvent = async () => {
    if (!editingEvent || isDeletingEvent) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this event?')) return

    setIsDeletingEvent(true)
    try {
      await deleteEvent(editingEvent.id)
      setEvents((previous) => previous.filter((event) => event.id !== editingEvent.id))
      setEventModalOpen(false)
      setEditingEvent(null)
      toast.push({ title: 'Event deleted', variant: 'warning' })
    } catch (error) {
      console.error('Deleting event failed:', error)
      toast.push({
        title: 'Could not delete event',
        description: 'Please try again.',
        variant: 'error',
      })
    } finally {
      setIsDeletingEvent(false)
    }
  }

  const renderTaskGroups = () => {
    if (filter === 'completed') {
      return (
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-success-light text-success">
                <CheckCircle2 size={14} />
              </span>
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                Completed
              </h2>
            </div>
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
              {completedTasks.length}
            </span>
          </div>

          {completedTasks.length === 0 ? (
            <div className="px-6 pb-12 pt-6 text-center">
              <p className="text-sm font-medium text-foreground">Nothing completed yet</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Finished tasks will collect here so you can see what you shipped.
              </p>
            </div>
          ) : (
            <ul className="px-2 pb-2">
              {completedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  now={now}
                  project={task.project_id ? projectById.get(task.project_id) : undefined}
                  note={task.note_id ? noteById.get(task.note_id) : undefined}
                  onToggleComplete={handleToggleComplete}
                  onToggleStar={handleToggleStar}
                  onEdit={openEditTask}
                  onOpenProject={onOpenProject}
                  onOpenNote={onSelectNote}
                />
              ))}
            </ul>
          )}
        </div>
      )
    }

    if (visibleGroups.length === 0) {
      return (
        <div className="glass-card px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-light text-accent">
            <ListTodo size={22} />
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {filter === 'today'
              ? 'Nothing due today'
              : filter === 'week'
                ? 'The next 7 days are clear'
                : 'No open tasks'}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {filter === 'today'
              ? 'A clear day. Add a task if something comes up.'
              : filter === 'week'
                ? 'Use the quick add above or plan something for later.'
                : 'Create a task to get started.'}
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={openNewTask}
            className="mt-4"
          >
            New task
          </Button>
        </div>
      )
    }

    return (
      <div className="glass-card overflow-hidden">
        {visibleGroups.map((group, index) => (
          <section key={group.key} className={index > 0 ? 'border-t border-border' : ''}>
            <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
              <div className="flex items-center gap-1.5">
                {group.key === 'overdue' && <AlertTriangle size={12} className="text-danger" />}
                <h2
                  className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${
                    group.key === 'overdue' ? 'text-danger' : 'text-muted'
                  }`}
                >
                  {group.label}
                </h2>
              </div>
              <span className="text-[10px] font-semibold tabular-nums text-muted">
                {group.tasks.length}
              </span>
            </div>
            <ul className="px-1.5 pb-1.5">
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  now={now}
                  project={task.project_id ? projectById.get(task.project_id) : undefined}
                  note={task.note_id ? noteById.get(task.note_id) : undefined}
                  onToggleComplete={handleToggleComplete}
                  onToggleStar={handleToggleStar}
                  onEdit={openEditTask}
                  onOpenProject={onOpenProject}
                  onOpenNote={onSelectNote}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    )
  }

  const renderAgenda = () => {
    if (eventGroups.length === 0) {
      return (
        <div className="glass-card px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warning-light text-warning">
            <CalendarDays size={22} />
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">No upcoming events</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Turn a task into a meeting, or plan a block of focused time.
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={CalendarPlus}
            onClick={openNewEvent}
            className="mt-4"
          >
            New event
          </Button>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {eventGroups.map((group) => (
          <section key={group.key} className="glass-card overflow-hidden">
            <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-accent-light text-accent">
                  <CalendarDays size={14} />
                </span>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
                  {group.label}
                </h2>
              </div>
              {(group.label === 'Today' || group.label === 'Tomorrow') && (
                <span className="text-[10px] text-muted">
                  {group.date.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>
            <ul className="px-2 pb-2">
              {group.events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  project={event.project_id ? projectById.get(event.project_id) : undefined}
                  note={event.note_id ? noteById.get(event.note_id) : undefined}
                  onEdit={openEditEvent}
                  onOpenProject={onOpenProject}
                  onOpenNote={onSelectNote}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-12">
        <header className="animate-rise-in flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Plan and review
            </p>
            <h1 className="mt-1.5 font-display text-[28px] font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
              Tasks &amp; agenda
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              {openTasks.length} open {openTasks.length === 1 ? 'task' : 'tasks'}
              {upcomingEventCount > 0
                ? ` · ${upcomingEventCount} upcoming ${upcomingEventCount === 1 ? 'event' : 'events'}`
                : ''}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <Button
              type="button"
              variant="secondary"
              size="md"
              icon={CalendarPlus}
              onClick={openNewEvent}
            >
              New event
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              icon={Plus}
              onClick={openNewTask}
            >
              New task
            </Button>
          </div>
        </header>

        <div
          className="segmented animate-rise-in mt-5 w-full sm:w-auto"
          role="tablist"
          aria-label="Tasks and agenda views"
        >
          {(
            [
              { key: 'tasks' as const, label: 'Tasks', icon: ListTodo, count: openTasks.length },
              {
                key: 'agenda' as const,
                label: 'Agenda',
                icon: CalendarDays,
                count: upcomingEventCount,
              },
            ]
          ).map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              data-active={tab === key}
              onClick={() => setTab(key)}
              className="segmented-item h-9 flex-1 gap-2 px-4 text-sm sm:flex-none"
            >
              <Icon size={15} />
              {label}
              <span className="tabular-nums opacity-60">{count}</span>
            </button>
          ))}
        </div>

        {loadError && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger bg-danger-light px-4 py-3 text-sm text-danger">
            <span className="flex items-center gap-2">
              <AlertTriangle size={15} />
              {loadError}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => void loadData()}
            >
              Retry
            </Button>
          </div>
        )}

        {tab === 'tasks' ? (
          <div className="mt-5">
            <form
              onSubmit={handleQuickAdd}
              className="glass flex flex-col gap-2 p-2 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
                <Plus size={15} className="shrink-0 text-muted" />
                <label htmlFor="quick-task-title" className="sr-only">
                  Quick add a task
                </label>
                <input
                  id="quick-task-title"
                  value={quickTitle}
                  onChange={(event) => setQuickTitle(event.target.value)}
                  placeholder="Quick add a task and press Enter…"
                  className="focus-ring min-w-0 flex-1 rounded-lg bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none"
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                loading={isAddingQuick}
                disabled={!quickTitle.trim()}
                className="shrink-0"
              >
                Add
              </Button>
            </form>

            <div className="segmented mt-4 w-full overflow-x-auto scrollbar-hide">
              {TASK_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className="segmented-item h-9 shrink-0"
                >
                  {label}
                  <span className="tabular-nums opacity-60">{filterCounts[key]}</span>
                </button>
              ))}
            </div>

            <div className="mt-4">
              {isLoading ? (
                <div className="glass-card space-y-3.5 p-5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="skeleton-shimmer h-5 w-5 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <div className="skeleton-shimmer h-3 w-2/5 rounded-full" />
                        <div className="skeleton-shimmer h-2.5 w-1/4 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                renderTaskGroups()
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5">
            {agendaError && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger bg-danger-light px-4 py-3 text-sm text-danger">
                <span className="flex items-center gap-2">
                  <AlertTriangle size={15} />
                  Agenda could not be loaded. Check your connection and try again.
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  onClick={() => void loadData()}
                >
                  Retry
                </Button>
              </div>
            )}

            {isLoading ? (
              <div className="glass-card space-y-3.5 p-5">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="skeleton-shimmer h-8 w-16 shrink-0 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton-shimmer h-3 w-2/5 rounded-full" />
                      <div className="skeleton-shimmer h-2.5 w-1/4 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              renderAgenda()
            )}
          </div>
        )}
      </div>

      <BaseModal
        isOpen={taskModalOpen}
        onClose={closeTaskModal}
        size="lg"
        animation="zoom"
      >
        <ModalHeader onClose={closeTaskModal} closeAriaLabel="Close task editor">
          <ModalTitle>{editingTask ? 'Edit task' : 'New task'}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <form id="task-editor-form" onSubmit={handleSaveTask} className="space-y-4">
            <Input
              label="Title"
              value={taskForm.title}
              onChange={(event) =>
                setTaskForm((previous) => ({ ...previous, title: event.target.value }))
              }
              placeholder="What needs to happen?"
              required
            />

            <div>
              <label htmlFor="task-description" className={LABEL_CLASS}>
                Description
              </label>
              <textarea
                id="task-description"
                value={taskForm.description}
                onChange={(event) =>
                  setTaskForm((previous) => ({ ...previous, description: event.target.value }))
                }
                rows={3}
                placeholder="Add context, links, or a definition of done…"
                className={TEXTAREA_CLASS}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="task-due-date" className={LABEL_CLASS}>
                  Due date
                </label>
                <input
                  id="task-due-date"
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(event) =>
                    setTaskForm((previous) => ({ ...previous, dueDate: event.target.value }))
                  }
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label htmlFor="task-priority" className={LABEL_CLASS}>
                  Priority
                </label>
                <select
                  id="task-priority"
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm((previous) => ({
                      ...previous,
                      priority: event.target.value as TaskPriority,
                    }))
                  }
                  className={FIELD_CLASS}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="task-status" className={LABEL_CLASS}>
                  Status
                </label>
                <select
                  id="task-status"
                  value={taskForm.status}
                  onChange={(event) =>
                    setTaskForm((previous) => ({
                      ...previous,
                      status: event.target.value as TaskStatus,
                    }))
                  }
                  className={FIELD_CLASS}
                >
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="waiting">Waiting</option>
                  {editingTask && <option value="completed">Completed</option>}
                  {editingTask && <option value="cancelled">Cancelled</option>}
                </select>
              </div>
              <div>
                <label htmlFor="task-project" className={LABEL_CLASS}>
                  Project
                </label>
                <select
                  id="task-project"
                  value={taskForm.projectId}
                  onChange={(event) =>
                    setTaskForm((previous) => ({ ...previous, projectId: event.target.value }))
                  }
                  className={FIELD_CLASS}
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="task-note" className={LABEL_CLASS}>
                Linked note
              </label>
              <select
                id="task-note"
                value={taskForm.noteId}
                onChange={(event) =>
                  setTaskForm((previous) => ({ ...previous, noteId: event.target.value }))
                }
                className={FIELD_CLASS}
              >
                <option value="">No linked note</option>
                {noteOptions.map((note) => (
                  <option key={note.id} value={note.id}>
                    {note.title || 'Untitled'}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-muted">
                Links the task to the note where the work happens.
              </p>
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <div className="flex items-center justify-between gap-2">
            {editingTask ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                icon={Trash2}
                loading={isDeletingTask}
                onClick={() => void handleDeleteTask()}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={closeTaskModal}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="task-editor-form"
                variant="primary"
                size="sm"
                loading={isSavingTask}
                disabled={!taskForm.title.trim()}
              >
                {editingTask ? 'Save changes' : 'Create task'}
              </Button>
            </div>
          </div>
        </ModalFooter>
      </BaseModal>

      <BaseModal
        isOpen={eventModalOpen}
        onClose={closeEventModal}
        size="lg"
        animation="zoom"
      >
        <ModalHeader onClose={closeEventModal} closeAriaLabel="Close event editor">
          <ModalTitle>{editingEvent ? 'Edit event' : 'New event'}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <form id="event-editor-form" onSubmit={handleSaveEvent} className="space-y-4">
            <Input
              label="Title"
              value={eventForm.title}
              onChange={(event) =>
                setEventForm((previous) => ({ ...previous, title: event.target.value }))
              }
              placeholder="What is happening?"
              required
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="event-date" className={LABEL_CLASS}>
                  Date
                </label>
                <input
                  id="event-date"
                  type="date"
                  value={eventForm.date}
                  onChange={(event) =>
                    setEventForm((previous) => ({ ...previous, date: event.target.value }))
                  }
                  className={FIELD_CLASS}
                />
              </div>
              <div className="flex items-end pb-2.5">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={eventForm.allDay}
                    onChange={(event) =>
                      setEventForm((previous) => ({
                        ...previous,
                        allDay: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  All day
                </label>
              </div>
            </div>

            {!eventForm.allDay && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="event-start" className={LABEL_CLASS}>
                    Starts
                  </label>
                  <input
                    id="event-start"
                    type="time"
                    value={eventForm.startTime}
                    onChange={(event) =>
                      setEventForm((previous) => ({
                        ...previous,
                        startTime: event.target.value,
                      }))
                    }
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="event-end" className={LABEL_CLASS}>
                    Ends
                  </label>
                  <input
                    id="event-end"
                    type="time"
                    value={eventForm.endTime}
                    onChange={(event) =>
                      setEventForm((previous) => ({
                        ...previous,
                        endTime: event.target.value,
                      }))
                    }
                    className={FIELD_CLASS}
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="event-location" className={LABEL_CLASS}>
                Location
              </label>
              <input
                id="event-location"
                value={eventForm.location}
                onChange={(event) =>
                  setEventForm((previous) => ({ ...previous, location: event.target.value }))
                }
                placeholder="Room, address, or meeting link"
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <label htmlFor="event-description" className={LABEL_CLASS}>
                Description
              </label>
              <textarea
                id="event-description"
                value={eventForm.description}
                onChange={(event) =>
                  setEventForm((previous) => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Agenda, preparation, or notes…"
                className={TEXTAREA_CLASS}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="event-project" className={LABEL_CLASS}>
                  Project
                </label>
                <select
                  id="event-project"
                  value={eventForm.projectId}
                  onChange={(event) =>
                    setEventForm((previous) => ({
                      ...previous,
                      projectId: event.target.value,
                    }))
                  }
                  className={FIELD_CLASS}
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
                <label htmlFor="event-note" className={LABEL_CLASS}>
                  Linked note
                </label>
                <select
                  id="event-note"
                  value={eventForm.noteId}
                  onChange={(event) =>
                    setEventForm((previous) => ({ ...previous, noteId: event.target.value }))
                  }
                  className={FIELD_CLASS}
                >
                  <option value="">No linked note</option>
                  {noteOptions.map((note) => (
                    <option key={note.id} value={note.id}>
                      {note.title || 'Untitled'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <div className="flex items-center justify-between gap-2">
            {editingEvent ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                icon={Trash2}
                loading={isDeletingEvent}
                onClick={() => void handleDeleteEvent()}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={closeEventModal}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="event-editor-form"
                variant="primary"
                size="sm"
                loading={isSavingEvent}
                disabled={!eventForm.title.trim()}
              >
                {editingEvent ? 'Save changes' : 'Create event'}
              </Button>
            </div>
          </div>
        </ModalFooter>
      </BaseModal>
    </div>
  )
}
