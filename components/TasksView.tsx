'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarPlus,
  Columns3,
  List,
  Menu,
  Plus,
  Star,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ToastProvider'
import type { NoteSummary } from '@/lib/notes'
import { getProjects, type Project } from '@/lib/projects'
import { isTaskOpen, toDateInputValue } from '@/lib/task-agenda'
import {
  archiveTask,
  completeRecurringTask,
  completeTask,
  createTask,
  deleteTask,
  getTaskLists,
  getTasks,
  reorderTasks,
  toggleTaskStar,
  uncompleteTask,
  updateTask,
  type Task,
  type TaskList,
  type TaskStatus,
} from '@/lib/tasks'
import {
  deleteEvent,
  getEvents,
  getRecurrencePatterns,
  type CalendarEvent,
  type RecurrencePattern,
} from '@/lib/events'
import { addDays, expandCalendarEvents, getStartOfDay, isSameDay } from '@/lib/planner/date-utils'
import { buildIcs, downloadIcs } from '@/lib/planner/ics'
import {
  DEFAULT_DISPLAY_PREFERENCES,
  DEFAULT_NOTIFICATION_SETTINGS,
  loadDisplayPreferences,
  loadNotificationSettings,
  saveDisplayPreferences,
  saveNotificationSettings,
} from '@/lib/planner/preferences'
import { deletePlan, fetchPlans, recordCompletion } from '@/lib/planner/storage'
import type {
  NotificationSettings,
  PlannerDisplayPreferences,
  PlannerPlan,
} from '@/lib/planner/types'
import CalendarView from './planner/CalendarView'
import EventFormModal from './planner/EventFormModal'
import OverviewView from './planner/OverviewView'
import PlannerSidebar, {
  PlannerSidebarDrawer,
  type PlannerSection,
} from './planner/PlannerSidebar'
import PlannerSettingsView from './planner/PlannerSettingsView'
import ProjectsView from './planner/ProjectsView'
import SmartPlannerView from './planner/SmartPlannerView'
import TaskDetailPanel from './planner/TaskDetailPanel'
import TaskFormModal from './planner/TaskFormModal'
import TaskKanbanView from './planner/TaskKanbanView'
import TaskListView from './planner/TaskListView'
import TimetableView from './planner/TimetableView'

type TaskMode = 'list' | 'board'

const SIDEBAR_STORAGE_KEY = 'planner:sidebar-collapsed'

/** Bound network calls so the planner never sits on a skeleton indefinitely. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Request timed out')), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

const SECTION_META: Record<PlannerSection, { title: string; description: string }> = {
  overview: {
    title: 'Overview',
    description: 'Your day, week and plans at a glance.',
  },
  tasks: {
    title: 'Tasks',
    description: 'Everything on your plate, as a list or a board.',
  },
  starred: {
    title: 'Starred',
    description: 'Tasks you flagged to keep close.',
  },
  projects: {
    title: 'Projects',
    description: 'Tasks grouped by the projects in this workspace.',
  },
  calendar: {
    title: 'Calendar',
    description: 'Month, week, day and agenda views of your time.',
  },
  timetable: {
    title: 'Timetable',
    description: 'Your repeating weekly schedule, generated on the fly.',
  },
  plan: {
    title: 'Smart plan',
    description: 'Let the planner block out time for what matters.',
  },
  settings: {
    title: 'Planner settings',
    description: 'Scheduling, calendar display and reminder preferences.',
  },
}

const SECTION_SHORTCUTS: Record<string, PlannerSection> = {
  '1': 'overview',
  '2': 'tasks',
  '3': 'starred',
  '4': 'projects',
  '5': 'calendar',
  '6': 'timetable',
  '7': 'plan',
  '8': 'settings',
}

export interface TasksViewProps {
  notes: NoteSummary[]
  projects: Project[]
  onSelectNote: (note: NoteSummary) => void
  onOpenProject: (projectId: string) => void
  /** Optional deep-link target (e.g. from the command palette). */
  initialSection?: PlannerSection
  /** Notifies the shell so breadcrumbs can mirror the active section. */
  onSectionChange?: (section: PlannerSection) => void
}

export default function TasksView({
  notes,
  projects,
  onSelectNote,
  onOpenProject,
  initialSection,
  onSectionChange,
}: TasksViewProps) {
  const toast = useToast()

  const [section, setSection] = useState<PlannerSection>(initialSection ?? 'overview')
  const [taskMode, setTaskMode] = useState<TaskMode>('list')

  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [recurrencePatterns, setRecurrencePatterns] = useState<RecurrencePattern[]>([])
  const [taskLists, setTaskLists] = useState<TaskList[]>([])
  const [localProjects, setLocalProjects] = useState<Project[]>(projects)
  const [plans, setPlans] = useState<PlannerPlan[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [eventsError, setEventsError] = useState(false)

  const [display, setDisplay] = useState<PlannerDisplayPreferences>(DEFAULT_DISPLAY_PREFERENCES)
  const [notifications, setNotifications] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  )

  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [listFilter, setListFilter] = useState<string>('all')

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskDefaultDue, setTaskDefaultDue] = useState<string | null>(null)

  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [eventDefaultStart, setEventDefaultStart] = useState<Date | null>(null)
  const [eventDefaultCategory, setEventDefaultCategory] = useState<string | undefined>(undefined)
  const [eventDefaultRecurring, setEventDefaultRecurring] = useState(false)

  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  const notifiedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setLocalProjects(projects)
  }, [projects])

  useEffect(() => {
    setDisplay(loadDisplayPreferences())
    setNotifications(loadNotificationSettings())
  }, [])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setEventsError(false)

    const today = getStartOfDay(new Date())
    const [taskResult, eventResult, patternResult, listResult] = await Promise.allSettled([
      withTimeout(getTasks({ includeArchived: false, includeCompleted: true }), 12000),
      withTimeout(
        getEvents({
          startDate: addDays(today, -120),
          endDate: addDays(today, 400),
          includeCancelled: true,
        }),
        12000,
      ),
      withTimeout(getRecurrencePatterns(), 12000),
      withTimeout(getTaskLists(), 12000),
    ])

    if (taskResult.status === 'fulfilled') {
      setTasks(taskResult.value)
    } else {
      console.error('Tasks could not be loaded:', taskResult.reason)
      setLoadError('Tasks could not be loaded. Check your connection and try again.')
    }

    if (eventResult.status === 'fulfilled') {
      setEvents(eventResult.value)
    } else {
      console.warn('Events could not be loaded:', eventResult.reason)
      setEventsError(true)
    }

    if (patternResult.status === 'fulfilled') {
      setRecurrencePatterns(patternResult.value)
    } else {
      console.warn('Recurrence patterns could not be loaded:', patternResult.reason)
    }

    if (listResult.status === 'fulfilled') {
      setTaskLists(listResult.value)
    }

    setIsLoading(false)
  }, [])

  // Plans load independently so a slow planner-table round-trip never blocks
  // the task and calendar data from rendering.
  const loadPlans = useCallback(async () => {
    try {
      setPlans(await fetchPlans())
    } catch {
      setPlans([])
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  useEffect(() => {
    onSectionChange?.(section)
  }, [section, onSectionChange])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = SECTION_SHORTCUTS[event.key]
      if (!target) return
      const element = event.target as HTMLElement | null
      if (
        element &&
        (element.tagName === 'INPUT' ||
          element.tagName === 'TEXTAREA' ||
          element.tagName === 'SELECT' ||
          element.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      setSection(target)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const refreshPatterns = useCallback(async () => {
    try {
      setRecurrencePatterns(await getRecurrencePatterns())
    } catch (error) {
      console.warn('Could not refresh recurrence patterns:', error)
    }
  }, [])

  const refreshProjects = useCallback(async () => {
    try {
      setLocalProjects(await getProjects())
    } catch (error) {
      console.warn('Could not refresh projects:', error)
    }
  }, [])

  const refreshTaskLists = useCallback(async () => {
    try {
      setTaskLists(await getTaskLists())
    } catch (error) {
      console.warn('Could not refresh task lists:', error)
    }
  }, [])

  // ── Reminder loop ──────────────────────────────────────────────────

  useEffect(() => {
    if (!notifications.enabled) return

    const check = () => {
      const now = new Date()
      const todayKey = now.toDateString()
      const urgent: Task[] = []
      const overdue: Task[] = []
      const upcoming: CalendarEvent[] = []

      for (const task of tasks) {
        if (!isTaskOpen(task) || !task.due_date) continue
        const due = new Date(task.due_date)
        const key = `${task.id}:${todayKey}`
        if (notifiedRef.current.has(key)) continue

        if (notifications.overdueTaskAlerts && due.getTime() < getStartOfDay(now).getTime()) {
          overdue.push(task)
          continue
        }
        if (
          notifications.urgentTaskAlerts &&
          isSameDay(due, now) &&
          (task.priority === 'urgent' || task.priority === 'high')
        ) {
          urgent.push(task)
        }
      }

      if (notifications.upcomingEventAlerts) {
        for (const event of events) {
          if (event.is_cancelled) continue
          const start = new Date(event.start_time)
          const minutesUntil = (start.getTime() - now.getTime()) / 60_000
          if (minutesUntil < 0 || minutesUntil > notifications.eventReminderMinutes) continue
          const key = `event:${event.id}:${start.toISOString()}`
          if (notifiedRef.current.has(key)) continue
          upcoming.push(event)
        }
      }

      for (const task of overdue.slice(0, 1)) {
        notifiedRef.current.add(`${task.id}:${todayKey}`)
        toast.push({ title: 'Task overdue', description: task.title, variant: 'warning', duration: 5000 })
      }
      for (const task of urgent.slice(0, 1)) {
        notifiedRef.current.add(`${task.id}:${todayKey}`)
        toast.push({ title: 'Due today', description: task.title, variant: 'info', duration: 5000 })
      }
      for (const event of upcoming.slice(0, 1)) {
        notifiedRef.current.add(`event:${event.id}:${new Date(event.start_time).toISOString()}`)
        toast.push({ title: 'Event starting soon', description: event.title, variant: 'info', duration: 5000 })
      }
    }

    const startTimer = window.setTimeout(check, 2500)
    const interval = window.setInterval(
      check,
      Math.max(1, notifications.checkIntervalMinutes) * 60_000,
    )
    return () => {
      window.clearTimeout(startTimer)
      window.clearInterval(interval)
    }
  }, [notifications, tasks, events, toast])

  // ── Derived data ───────────────────────────────────────────────────

  const openTasks = useMemo(() => tasks.filter(isTaskOpen), [tasks])

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (projectFilter !== 'all') {
          if (projectFilter === 'none') {
            if (task.project_id) return false
          } else if (task.project_id !== projectFilter) {
            return false
          }
        }
        if (listFilter !== 'all') {
          if (listFilter === 'none') {
            if (task.task_list_id) return false
          } else if (task.task_list_id !== listFilter) {
            return false
          }
        }
        return true
      }),
    [tasks, projectFilter, listFilter],
  )

  const detailTask = detailTaskId
    ? tasks.find((task) => task.id === detailTaskId) ?? null
    : null

  const detailPattern = useMemo(() => {
    if (!detailTask?.recurrence_pattern_id) return null
    return (
      recurrencePatterns.find((pattern) => pattern.id === detailTask.recurrence_pattern_id) ?? null
    )
  }, [detailTask, recurrencePatterns])

  const availableMinutes = useMemo(() => {
    const today = new Date()
    const start = new Date(today)
    start.setHours(9, 0, 0, 0)
    const end = new Date(today)
    end.setHours(17, 0, 0, 0)
    const dayStart = getStartOfDay(today)
    const dayEnd = new Date(dayStart.getTime() + 86_400_000)
    const expanded = expandCalendarEvents(events, recurrencePatterns, dayStart, dayEnd)
    const busy = expanded
      .filter((event) => !event.is_cancelled)
      .reduce((total, event) => {
        const eventStart = new Date(event.start_time)
        const eventEnd = new Date(event.end_time)
        const overlapStart = eventStart > start ? eventStart : start
        const overlapEnd = eventEnd < end ? eventEnd : end
        return total + Math.max(0, overlapEnd.getTime() - overlapStart.getTime()) / 60_000
      }, 0)
    return Math.max(0, 8 * 60 - busy)
  }, [events, recurrencePatterns])

  // ── Task mutations ─────────────────────────────────────────────────

  const mergeTask = useCallback((updated: Task) => {
    setTasks((current) =>
      current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
    )
  }, [])

  const handleToggleComplete = useCallback(
    async (task: Task) => {
      try {
        if (task.status === 'completed' || task.status === 'cancelled') {
          const updated = await uncompleteTask(task.id)
          mergeTask(updated)
          return
        }

        const updated = task.is_recurring
          ? await completeRecurringTask(task.id)
          : await completeTask(task.id)
        mergeTask(updated)

        if (updated.status === 'completed') {
          void recordCompletion(updated).catch(() => undefined)
        }
      } catch (error) {
        console.error('Toggling task failed:', error)
        toast.push({ title: 'Could not update task', variant: 'error' })
      }
    },
    [mergeTask, toast],
  )

  const handleToggleStar = useCallback(
    async (task: Task) => {
      try {
        const updated = await toggleTaskStar(task.id, !task.is_starred)
        mergeTask(updated)
      } catch (error) {
        console.error('Starring task failed:', error)
      }
    },
    [mergeTask],
  )

  const handleDeleteTask = useCallback(
    async (task: Task) => {
      try {
        await deleteTask(task.id)
        setTasks((current) => current.filter((candidate) => candidate.id !== task.id))
        setDetailTaskId((current) => (current === task.id ? null : current))
        toast.push({ title: 'Task deleted', description: task.title, variant: 'success' })
      } catch (error) {
        console.error('Deleting task failed:', error)
        toast.push({ title: 'Could not delete task', variant: 'error' })
      }
    },
    [toast],
  )

  const handleQuickAdd = useCallback(
    async (title: string, dueDate?: Date, status: TaskStatus = 'todo') => {
      try {
        const created = await createTask(title, {
          dueDate,
          status,
          projectId:
            projectFilter !== 'all' && projectFilter !== 'none' ? projectFilter : undefined,
          taskListId: listFilter !== 'all' && listFilter !== 'none' ? listFilter : undefined,
        })
        setTasks((current) => [created, ...current])
        toast.push({ title: 'Task added', description: created.title, variant: 'success' })
      } catch (error) {
        console.error('Quick add failed:', error)
        toast.push({ title: 'Could not add task', variant: 'error' })
      }
    },
    [listFilter, projectFilter, toast],
  )

  const handleMoveTask = useCallback(
    async (task: Task, status: TaskStatus, orderedIds: string[]) => {
      const completedAt =
        status === 'completed' ? task.completed_at ?? new Date().toISOString() : null
      try {
        const updated = await updateTask(task.id, { status, completed_at: completedAt })
        mergeTask(updated)
        await reorderTasks(orderedIds.map((id, index) => ({ id, sort_order: index })))
        setTasks((current) =>
          current.map((candidate) => {
            const position = orderedIds.indexOf(candidate.id)
            if (position === -1) return candidate
            return { ...candidate, sort_order: position }
          }),
        )
      } catch (error) {
        console.error('Moving task failed:', error)
        toast.push({ title: 'Could not move task', variant: 'error' })
      }
    },
    [mergeTask, toast],
  )

  const handleClearCompleted = useCallback(async () => {
    const completed = tasks.filter((task) => task.status === 'completed')
    if (completed.length === 0) {
      toast.push({ title: 'No completed tasks to archive', variant: 'info' })
      return
    }
    try {
      await Promise.all(completed.map((task) => archiveTask(task.id)))
      setTasks((current) => current.filter((task) => task.status !== 'completed'))
      toast.push({
        title: 'Completed tasks archived',
        description: `${completed.length} tasks`,
        variant: 'success',
      })
    } catch (error) {
      console.error('Archiving completed tasks failed:', error)
      toast.push({ title: 'Could not archive tasks', variant: 'error' })
    }
  }, [tasks, toast])

  const handleDeleteAllPlans = useCallback(async () => {
    try {
      const loaded = await fetchPlans()
      await Promise.all(loaded.map((plan) => deletePlan(plan.id)))
      setPlans([])
      toast.push({ title: 'Plans deleted', variant: 'success' })
    } catch (error) {
      console.error('Deleting plans failed:', error)
      toast.push({ title: 'Could not delete plans', variant: 'error' })
    }
  }, [toast])

  // ── Modal helpers ──────────────────────────────────────────────────

  const openNewTask = useCallback((dueDate?: Date) => {
    setEditingTask(null)
    setTaskDefaultDue(toDateInputValue(dueDate ?? new Date()))
    setTaskModalOpen(true)
  }, [])

  const openEditTask = useCallback((task: Task) => {
    setEditingTask(task)
    setTaskDefaultDue(null)
    setTaskModalOpen(true)
  }, [])

  const openNewEvent = useCallback((start?: Date) => {
    setEditingEvent(null)
    setEventDefaultStart(start ?? null)
    setEventDefaultCategory(undefined)
    setEventDefaultRecurring(false)
    setEventModalOpen(true)
  }, [])

  const openTimetableEntry = useCallback((day?: number, startHour?: number) => {
    const date = new Date()
    if (typeof day === 'number') {
      const diff = (day - date.getDay() + 7) % 7
      date.setDate(date.getDate() + diff)
    }
    date.setHours(startHour ?? 9, 0, 0, 0)
    setEditingEvent(null)
    setEventDefaultStart(date)
    setEventDefaultCategory('timetable')
    setEventDefaultRecurring(true)
    setEventModalOpen(true)
  }, [])

  const resolveSourceEvent = useCallback(
    (event: CalendarEvent) => {
      const sourceId = (event as CalendarEvent & { source_event_id?: string }).source_event_id
      if (!sourceId || sourceId === event.id) return event
      return events.find((candidate) => candidate.id === sourceId) ?? event
    },
    [events],
  )

  const openEditEvent = useCallback(
    (event: CalendarEvent) => {
      setEditingEvent(resolveSourceEvent(event))
      setEventDefaultStart(null)
      setEventDefaultCategory(undefined)
      setEventDefaultRecurring(false)
      setEventModalOpen(true)
    },
    [resolveSourceEvent],
  )

  const handleEventSaved = useCallback(
    (event: CalendarEvent, isNew: boolean) => {
      setEvents((current) =>
        isNew
          ? [...current, event]
          : current.map((candidate) => (candidate.id === event.id ? event : candidate)),
      )
      void refreshPatterns()
    },
    [refreshPatterns],
  )

  const handleEventDeleted = useCallback((eventId: string) => {
    setEvents((current) => current.filter((event) => event.id !== eventId))
  }, [])

  const handleDeleteEvent = useCallback(
    async (event: CalendarEvent) => {
      const source = resolveSourceEvent(event)
      try {
        await deleteEvent(source.id)
        handleEventDeleted(source.id)
        toast.push({ title: 'Event deleted', description: source.title, variant: 'success' })
      } catch (error) {
        console.error('Deleting event failed:', error)
        toast.push({ title: 'Could not delete event', variant: 'error' })
      }
    },
    [handleEventDeleted, resolveSourceEvent, toast],
  )

  const handleTaskSaved = useCallback(
    (task: Task, isNew: boolean) => {
      setTasks((current) =>
        isNew
          ? [task, ...current]
          : current.map((candidate) => (candidate.id === task.id ? task : candidate)),
      )
      void refreshPatterns()
    },
    [refreshPatterns],
  )

  const handleUpdateDisplay = useCallback((update: Partial<PlannerDisplayPreferences>) => {
    setDisplay((current) => {
      const next = { ...current, ...update }
      saveDisplayPreferences(next)
      return next
    })
  }, [])

  const handleUpdateNotifications = useCallback((update: Partial<NotificationSettings>) => {
    setNotifications((current) => {
      const next = { ...current, ...update }
      saveNotificationSettings(next)
      return next
    })
  }, [])

  const handleExportIcs = useCallback(() => {
    const content = buildIcs(events, recurrencePatterns, 'MindViz Planner')
    downloadIcs('mindviz-planner', content)
    toast.push({ title: 'Calendar exported', description: 'mindviz-planner.ics', variant: 'success' })
  }, [events, recurrencePatterns, toast])

  const handleShowProjectTasks = useCallback((projectId: string) => {
    setProjectFilter(projectId || 'none')
    setSection('tasks')
  }, [])

  // ── Render ─────────────────────────────────────────────────────────

  const sectionMeta = SECTION_META[section]

  const headerCounts = useMemo(
    () => ({
      open: openTasks.length,
      events: events.filter((event) => !event.is_cancelled).length,
      overdue: openTasks.filter(
        (task) =>
          task.due_date && new Date(task.due_date).getTime() < getStartOfDay(new Date()).getTime(),
      ).length,
    }),
    [openTasks, events],
  )

  const starredTasks = useMemo(() => tasks.filter((task) => task.is_starred), [tasks])

  const sidebarCounts = useMemo(() => {
    const now = new Date()
    const todayStart = getStartOfDay(now)
    const weekEnd = addDays(todayStart, 7)
    const activePlan = plans.find((plan) => plan.status === 'active') ?? null
    const planProgress =
      activePlan && activePlan.items.length > 0
        ? Math.round(
            (activePlan.items.filter(
              (item) => item.status === 'completed' || item.status === 'skipped',
            ).length /
              activePlan.items.length) *
              100,
          )
        : activePlan
          ? 0
          : null

    return {
      open: openTasks.length,
      starred: tasks.filter((task) => task.is_starred && isTaskOpen(task)).length,
      projects: localProjects.length,
      upcomingEvents: events.filter((event) => {
        if (event.is_cancelled) return false
        const start = new Date(event.start_time)
        return start >= todayStart && start <= weekEnd
      }).length,
      overdue: openTasks.filter(
        (task) => task.due_date && new Date(task.due_date).getTime() < todayStart.getTime(),
      ).length,
      dueToday: openTasks.filter(
        (task) => task.due_date && isSameDay(new Date(task.due_date), now),
      ).length,
      freeHours: Math.round(availableMinutes / 60),
      activePlanProgress: planProgress,
    }
  }, [openTasks, tasks, localProjects, events, plans, availableMinutes])

  return (
    <div className="planner-shell flex h-full min-h-0">
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-12">
        <header className="animate-rise-in">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Planner
          </p>
          <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
                {sectionMeta.title}
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
                {sectionMeta.description}
              </p>
              <p className="mt-1 text-[11px] tabular-nums text-muted">
                {headerCounts.open} open {headerCounts.open === 1 ? 'task' : 'tasks'}
                {headerCounts.overdue > 0 ? ` · ${headerCounts.overdue} overdue` : ''}
                {headerCounts.events > 0
                  ? ` · ${headerCounts.events} ${headerCounts.events === 1 ? 'event' : 'events'}`
                  : ''}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                icon={Menu}
                className="h-11 sm:h-9 xl:hidden"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open planner navigation"
                title="Sections"
              />
              <Button
                type="button"
                variant="secondary"
                size="md"
                icon={CalendarPlus}
                className="h-11 sm:h-9"
                onClick={() => openNewEvent()}
              >
                New event
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                icon={Plus}
                className="h-11 sm:h-9"
                onClick={() => openNewTask()}
              >
                New task
              </Button>
            </div>
          </div>
        </header>


        {(loadError || eventsError) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger bg-[var(--danger-light)] px-4 py-3 text-sm text-danger">
            <span className="flex items-center gap-2">
              <AlertTriangle size={15} />
              {loadError ?? 'Calendar data could not be loaded. Events may be missing.'}
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadData()}>
              Retry
            </Button>
          </div>
        )}

        {isLoading ? (
          <PlannerLoadingSkeleton />
        ) : (
          <div className="mt-4 space-y-4">
            {section === 'overview' && (
              <OverviewView
                tasks={tasks}
                events={events}
                recurrencePatterns={recurrencePatterns}
                projects={localProjects}
                availableMinutes={availableMinutes}
                activePlan={
                  plans.find((plan) => plan.status === 'active') ?? null
                }
                onNavigate={(next) => setSection(next)}
                onOpenTask={(task) => setDetailTaskId(task.id)}
                onCompleteTask={(task) => void handleToggleComplete(task)}
                onNewTask={() => openNewTask()}
                onNewEvent={() => openNewEvent()}
              />
            )}

            {section === 'tasks' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="segmented" role="tablist" aria-label="Task view mode">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={taskMode === 'list'}
                      data-active={taskMode === 'list'}
                      onClick={() => setTaskMode('list')}
                      className="segmented-item h-8 gap-1.5 px-3 text-[12px]"
                    >
                      <List size={13} />
                      List
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={taskMode === 'board'}
                      data-active={taskMode === 'board'}
                      onClick={() => setTaskMode('board')}
                      className="segmented-item h-8 gap-1.5 px-3 text-[12px]"
                    >
                      <Columns3 size={13} />
                      Board
                    </button>
                  </div>

                  <select
                    value={projectFilter}
                    onChange={(event) => setProjectFilter(event.target.value)}
                    aria-label="Filter tasks by project"
                    className="glass-input h-8 px-2 text-[12px]"
                  >
                    <option value="all">All projects</option>
                    <option value="none">No project</option>
                    {localProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={listFilter}
                    onChange={(event) => setListFilter(event.target.value)}
                    aria-label="Filter tasks by list"
                    className="glass-input h-8 px-2 text-[12px]"
                  >
                    <option value="all">All lists</option>
                    <option value="none">No list</option>
                    {taskLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>

                  <span className="ml-auto text-[11px] text-muted">
                    {filteredTasks.length} of {tasks.length} tasks
                  </span>
                </div>

                {taskMode === 'list' ? (
                  <TaskListView
                    tasks={filteredTasks}
                    projects={localProjects}
                    notes={notes}
                    recurrencePatterns={recurrencePatterns}
                    onOpenTask={(task) => setDetailTaskId(task.id)}
                    onEditTask={openEditTask}
                    onToggleComplete={(task) => void handleToggleComplete(task)}
                    onToggleStar={(task) => void handleToggleStar(task)}
                    onDeleteTask={(task) => void handleDeleteTask(task)}
                    onQuickAdd={(title, date) => void handleQuickAdd(title, date)}
                    onNewTask={() => openNewTask()}
                  />
                ) : (
                  <TaskKanbanView
                    tasks={filteredTasks}
                    projects={localProjects}
                    onOpenTask={(task) => setDetailTaskId(task.id)}
                    onToggleStar={(task) => void handleToggleStar(task)}
                    onQuickAdd={(title, status) => void handleQuickAdd(title, new Date(), status)}
                    onMoveTask={(task, status, orderedIds) =>
                      void handleMoveTask(task, status, orderedIds)
                    }
                    onClearCompleted={() => void handleClearCompleted()}
                  />
                )}
              </div>
            )}

            {section === 'starred' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
                      <Star size={15} className="fill-amber-500 text-amber-500" />
                      Starred tasks
                    </h2>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {starredTasks.filter(isTaskOpen).length} open · {starredTasks.length} total
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Plus}
                    onClick={() => openNewTask()}
                  >
                    New task
                  </Button>
                </div>
                <TaskListView
                  tasks={starredTasks}
                  projects={localProjects}
                  notes={notes}
                  recurrencePatterns={recurrencePatterns}
                  starredOnly
                  emptyTitle="No starred tasks"
                  emptyDescription="Star a task to keep it within easy reach."
                  onOpenTask={(task) => setDetailTaskId(task.id)}
                  onEditTask={openEditTask}
                  onToggleComplete={(task) => void handleToggleComplete(task)}
                  onToggleStar={(task) => void handleToggleStar(task)}
                  onDeleteTask={(task) => void handleDeleteTask(task)}
                  onQuickAdd={(title, date) => void handleQuickAdd(title, date)}
                  onNewTask={() => openNewTask()}
                />
              </div>
            )}

            {section === 'calendar' && (
              <CalendarView
                events={events}
                recurrencePatterns={recurrencePatterns}
                tasks={tasks}
                projects={localProjects}
                display={display}
                onViewChange={(view) => handleUpdateDisplay({ defaultCalendarView: view })}
                onNewEvent={openNewEvent}
                onEditEvent={openEditEvent}
                onDeleteEvent={(event) => void handleDeleteEvent(event)}
                onNewTask={(dueDate) => openNewTask(dueDate)}
                onOpenTask={(task) => setDetailTaskId(task.id)}
                onExport={handleExportIcs}
              />
            )}

            {section === 'timetable' && (
              <TimetableView
                events={events}
                recurrencePatterns={recurrencePatterns}
                projects={localProjects}
                onCreate={openTimetableEntry}
                onEdit={openEditEvent}
                onDelete={(event) => void handleDeleteEvent(event)}
              />
            )}

            {section === 'plan' && (
              <SmartPlannerView
                tasks={tasks}
                events={events}
                recurrencePatterns={recurrencePatterns}
                planningMode={display.planningMode}
                onPlanningModeChange={(mode) => handleUpdateDisplay({ planningMode: mode })}
                onOpenTask={(task) => setDetailTaskId(task.id)}
                onPlansChanged={() => void loadPlans()}
              />
            )}

            {section === 'projects' && (
              <ProjectsView
                projects={localProjects}
                tasks={tasks}
                taskLists={taskLists}
                onOpenProject={onOpenProject}
                onShowTasks={handleShowProjectTasks}
                onProjectsChanged={() => void refreshProjects()}
                onTaskListsChanged={() => void refreshTaskLists()}
              />
            )}

            {section === 'settings' && (
              <PlannerSettingsView
                display={display}
                notifications={notifications}
                taskCount={tasks.length}
                eventCount={events.length}
                planCount={plans.length}
                onDisplayChange={handleUpdateDisplay}
                onNotificationsChange={handleUpdateNotifications}
                onExportIcs={handleExportIcs}
                onClearCompleted={() => void handleClearCompleted()}
                onClearPlans={() => void handleDeleteAllPlans()}
              />
            )}
          </div>
        )}
        </div>
      </div>

      <PlannerSidebar
        className="hidden xl:flex"
        activeSection={section}
        counts={sidebarCounts}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        onSelect={setSection}
        onNewTask={() => openNewTask()}
        onNewEvent={() => openNewEvent()}
      />

      <PlannerSidebarDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        activeSection={section}
        counts={sidebarCounts}
        onSelect={setSection}
        onNewTask={() => openNewTask()}
        onNewEvent={() => openNewEvent()}
      />

      <TaskFormModal
        isOpen={taskModalOpen}
        task={editingTask}
        defaultDueDate={taskDefaultDue}
        projects={localProjects}
        notes={notes}
        taskLists={taskLists}
        recurrencePatterns={recurrencePatterns}
        onSaved={handleTaskSaved}
        onDeleted={(taskId) => {
          setTasks((current) => current.filter((task) => task.id !== taskId))
          setDetailTaskId((current) => (current === taskId ? null : current))
        }}
        onClose={() => {
          setTaskModalOpen(false)
          setEditingTask(null)
        }}
      />

      <EventFormModal
        isOpen={eventModalOpen}
        event={editingEvent}
        defaultStart={eventDefaultStart}
        defaultCategory={eventDefaultCategory}
        defaultRecurring={eventDefaultRecurring}
        events={events}
        recurrencePatterns={recurrencePatterns}
        projects={localProjects}
        notes={notes}
        onSaved={handleEventSaved}
        onDeleted={handleEventDeleted}
        onClose={() => {
          setEventModalOpen(false)
          setEditingEvent(null)
        }}
      />

      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          projects={localProjects}
          notes={notes}
          recurrencePattern={detailPattern}
          onClose={() => setDetailTaskId(null)}
          onEdit={(task) => {
            setDetailTaskId(null)
            openEditTask(task)
          }}
          onDelete={(task) => void handleDeleteTask(task)}
          onToggleComplete={(task) => void handleToggleComplete(task)}
          onToggleStar={(task) => void handleToggleStar(task)}
          onTaskUpdated={mergeTask}
          onOpenNote={(note) => {
            setDetailTaskId(null)
            onSelectNote(note)
          }}
        />
      )}
    </div>
  )
}

function PlannerLoadingSkeleton() {
  return (
    <div className="mt-5 animate-fade-in" aria-busy="true" aria-label="Loading planner">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="glass-card p-4">
            <div className="skeleton-shimmer h-2.5 w-20 rounded-full" />
            <div className="skeleton-shimmer mt-2.5 h-6 w-12 rounded-lg" />
            <div className="skeleton-shimmer mt-2 h-2 w-28 rounded-full" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="glass-card space-y-3 p-4">
          <div className="skeleton-shimmer h-3 w-32 rounded-full" />
          <div className="skeleton-shimmer h-24 w-full rounded-2xl" />
          <div className="skeleton-shimmer h-24 w-full rounded-2xl" />
        </div>
        <div className="glass-card space-y-2 p-4">
          <div className="skeleton-shimmer h-3 w-24 rounded-full" />
          <div className="skeleton-shimmer h-2.5 w-full rounded-full" />
          <div className="skeleton-shimmer h-2.5 w-4/5 rounded-full" />
          <div className="skeleton-shimmer h-2.5 w-2/3 rounded-full" />
        </div>
      </div>
    </div>
  )
}
