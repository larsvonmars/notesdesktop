'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  X,
  Calendar,
  CheckSquare,
  Clock,
  Plus,
  Star,
  Filter,
  ChevronLeft,
  ChevronRight,
  List,
  Grid3x3,
  CalendarDays,
  AlertCircle,
  CheckCircle2,
  Circle,
  Timer,
  Flag,
  Tag as TagIcon,
  Trash2,
  Edit2,
  Play,
  Square,
  MoreVertical,
  MapPin,
  Link2,
  Users,
  LayoutDashboard,
  FileText,
  FolderKanban,
} from 'lucide-react'
import {
  getTasks,
  getTaskLists,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  uncompleteTask,
  toggleTaskStar,
  getTaskStats,
  createTaskList,
  getTags,
  createTag,
  addTagToTask,
  removeTagFromTask,
  createSubtask,
  toggleSubtask,
  deleteSubtask,
  type Task,
  type TaskList,
  type TaskPriority,
  type TaskStatus,
  type TaskStats,
  type Tag,
  type Subtask,
  type TaskWithDetails,
  getTaskWithDetails,
} from '@/lib/tasks'
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getActiveTimeEntry,
  startTimeTracking,
  stopTimeTracking,
  formatDuration,
  getTimetableEntries,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  generateTimetableInstances,
  getTimetableInstancesForWeek,
  extractTime,
  getWeekStart,
  WEEKDAY_LABELS,
  WEEKDAY_FULL_LABELS,
  mondayIndexToJsDay,
  jsDayToMondayIndex,
  type CalendarEvent,
  type TimeEntry,
  type TimetableEntry,
} from '@/lib/events'
import { getProjects, type Project } from '@/lib/projects'
import { createNote } from '@/lib/notes'
import KanbanBoard from './KanbanBoard'
import { initializeDefaultBoard, addTaskToBoard, moveTask, type BoardWithColumns, type KanbanColumn } from '@/lib/kanban'
import ModalCloseButton from './ModalCloseButton'

interface TaskCalendarModalProps {
  isOpen: boolean
  onClose: () => void
  initialView?: 'tasks' | 'calendar' | 'timeline' | 'kanban' | 'timetable'
  linkedNoteId?: string
  linkedProjectId?: string
  asView?: boolean
}

type ViewMode = 'tasks' | 'calendar' | 'timeline' | 'kanban' | 'timetable'
type CalendarView = 'month' | 'week' | 'day'
type TaskFilter = 'all' | 'today' | 'week' | 'overdue' | 'starred' | 'completed'

export default function TaskCalendarModal({
  isOpen,
  onClose,
  initialView = 'tasks',
  linkedNoteId,
  linkedProjectId,
  asView = false,
}: TaskCalendarModalProps) {
  // View state
  const [viewMode, setViewMode] = useState<ViewMode>(initialView)
  const [calendarView, setCalendarView] = useState<CalendarView>('month')
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all')
  const [selectedDate, setSelectedDate] = useState(new Date())

  // Data state
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskLists, setTaskLists] = useState<TaskList[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [kanbanBoard, setKanbanBoard] = useState<BoardWithColumns | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [activeTimeEntry, setActiveTimeEntry] = useState<TimeEntry | null>(null)

  // Loading states
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Modal states
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showTaskListModal, setShowTaskListModal] = useState(false)
  const [showTaskDetail, setShowTaskDetail] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskWithDetails | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  // Form states
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium')
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('todo')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskStartDate, setTaskStartDate] = useState('')
  const [taskEstimatedMinutes, setTaskEstimatedMinutes] = useState('')
  const [selectedTaskList, setSelectedTaskList] = useState<string>('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')

  const [eventTitle, setEventTitle] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventStartTime, setEventStartTime] = useState('')
  const [eventEndTime, setEventEndTime] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [eventMeetingUrl, setEventMeetingUrl] = useState('')

  // Timetable state
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([])
  const [timetableWeekStart, setTimetableWeekStart] = useState(() => getWeekStart(new Date()))
  const [showTimetableModal, setShowTimetableModal] = useState(false)
  const [editingTimetableEntry, setEditingTimetableEntry] = useState<TimetableEntry | null>(null)
  const [ttTitle, setTtTitle] = useState('')
  const [ttStartTime, setTtStartTime] = useState('09:00')
  const [ttEndTime, setTtEndTime] = useState('10:00')
  const [ttDays, setTtDays] = useState<number[]>([])
  const [ttDescription, setTtDescription] = useState('')
  const [ttLocation, setTtLocation] = useState('')
  const [ttProjectId, setTtProjectId] = useState('')
  const [ttColor, setTtColor] = useState('#8B5CF6')
  const [projects, setProjects] = useState<Project[]>([])

  // Load data
  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen])

  // Load task details when selected
  useEffect(() => {
    if (selectedTaskId) {
      loadTaskDetails(selectedTaskId)
    }
  }, [selectedTaskId])

  const loadTaskDetails = async (taskId: string) => {
    try {
      const taskDetails = await getTaskWithDetails(taskId)
      if (taskDetails) {
        setEditingTask(taskDetails)
        setTaskTitle(taskDetails.title)
        setTaskDescription(taskDetails.description || '')
        setTaskPriority(taskDetails.priority)
        setTaskStatus(taskDetails.status)
        setTaskDueDate(taskDetails.due_date ? taskDetails.due_date.substring(0, 16) : '')
        setTaskStartDate(taskDetails.start_date ? taskDetails.start_date.substring(0, 16) : '')
        setTaskEstimatedMinutes(taskDetails.estimated_minutes?.toString() || '')
        setSelectedTaskList(taskDetails.task_list_id || '')
        setSelectedProjectId(taskDetails.project_id || '')
        setSelectedTags(taskDetails.tags?.map(t => t.id) || [])
        setShowTaskDetail(true)
      }
    } catch (error) {
      console.error('Failed to load task details:', error)
    }
  }

  // Load Kanban board when switching to kanban view
  useEffect(() => {
    if (viewMode === 'kanban' && !kanbanBoard && isOpen) {
      initializeDefaultBoard().then(setKanbanBoard)
    }
  }, [viewMode, isOpen, kanbanBoard])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [tasksData, taskListsData, eventsData, tagsData, statsData, activeTime, timetableData, projectsData] = await Promise.all([
        getTasks({ includeCompleted: taskFilter === 'completed' }),
        getTaskLists(),
        getEvents(),
        getTags(),
        getTaskStats(),
        getActiveTimeEntry(),
        getTimetableEntries(),
        getProjects(),
      ])

      setTasks(tasksData)
      setTaskLists(taskListsData)
      setEvents(eventsData)
      setTags(tagsData)
      setStats(statsData)
      setActiveTimeEntry(activeTime)
      setTimetableEntries(timetableData)
      setProjects(projectsData)

      // Initialize Kanban board if in kanban mode
      if (viewMode === 'kanban' && !kanbanBoard) {
        const board = await initializeDefaultBoard()
        setKanbanBoard(board)
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday = new Date(today)
    endOfToday.setDate(endOfToday.getDate() + 1)
    const endOfWeek = new Date(today)
    endOfWeek.setDate(endOfWeek.getDate() + 7)

    return tasks.filter(task => {
      if (taskFilter === 'today') {
        return task.due_date && 
          new Date(task.due_date) >= today && 
          new Date(task.due_date) < endOfToday &&
          task.status !== 'completed'
      }
      if (taskFilter === 'week') {
        return task.due_date && 
          new Date(task.due_date) >= today && 
          new Date(task.due_date) < endOfWeek &&
          task.status !== 'completed'
      }
      if (taskFilter === 'overdue') {
        return task.due_date && 
          new Date(task.due_date) < now && 
          task.status !== 'completed' &&
          task.status !== 'cancelled'
      }
      if (taskFilter === 'starred') {
        return task.is_starred
      }
      if (taskFilter === 'completed') {
        return task.status === 'completed'
      }
      return task.status !== 'completed'
    })
  }, [tasks, taskFilter])

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null)
    }
    
    // Add days of month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i))
    }

    return days
  }

  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventDate = new Date(event.start_time)
      return eventDate.getFullYear() === date.getFullYear() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getDate() === date.getDate()
    })
  }

  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => {
      if (!task.due_date) return false
      const taskDate = new Date(task.due_date)
      return taskDate.getFullYear() === date.getFullYear() &&
        taskDate.getMonth() === date.getMonth() &&
        taskDate.getDate() === date.getDate()
    })
  }

  // Task handlers
  const handleCreateTask = async () => {
    if (!taskTitle.trim()) return

    setIsSaving(true)
    try {
      const newTask = await createTask(taskTitle, {
        description: taskDescription || undefined,
        priority: taskPriority,
        status: taskStatus,
        dueDate: taskDueDate ? new Date(taskDueDate) : undefined,
        startDate: taskStartDate ? new Date(taskStartDate) : undefined,
        estimatedMinutes: taskEstimatedMinutes ? parseInt(taskEstimatedMinutes) : undefined,
        taskListId: selectedTaskList || undefined,
        noteId: linkedNoteId,
        projectId: selectedProjectId || linkedProjectId,
      })

      // If we have a kanban board, add the task to the first column (To Do)
      if (kanbanBoard && kanbanBoard.columns.length > 0) {
        try {
          await addTaskToBoard(
            newTask.id,
            kanbanBoard.id,
            kanbanBoard.columns[0].id, // Add to first column
            0 // Position at top
          )
        } catch (error) {
          console.error('Failed to add task to kanban board:', error)
        }
      }

      resetTaskForm()
      setShowTaskModal(false)
      await loadData()
    } catch (error) {
      console.error('Failed to create task:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateTask = async () => {
    if (!editingTask || !taskTitle.trim()) return

    setIsSaving(true)
    try {
      // Check if status changed
      const statusChanged = taskStatus !== editingTask.status

      await updateTask(editingTask.id, {
        title: taskTitle,
        description: taskDescription || null,
        priority: taskPriority,
        status: taskStatus,
        due_date: taskDueDate ? new Date(taskDueDate).toISOString() : null,
        start_date: taskStartDate ? new Date(taskStartDate).toISOString() : null,
        estimated_minutes: taskEstimatedMinutes ? parseInt(taskEstimatedMinutes) : null,
        task_list_id: selectedTaskList || null,
        project_id: selectedProjectId || null,
      })

      // Update tags
      const currentTagIds = editingTask.tags?.map(t => t.id) || []
      const tagsToAdd = selectedTags.filter(id => !currentTagIds.includes(id))
      const tagsToRemove = currentTagIds.filter(id => !selectedTags.includes(id))

      await Promise.all([
        ...tagsToAdd.map(tagId => addTagToTask(editingTask.id, tagId)),
        ...tagsToRemove.map(tagId => removeTagFromTask(editingTask.id, tagId)),
      ])

      // Sync with Kanban board if status changed
      if (statusChanged && kanbanBoard && kanbanBoard.columns.length > 0) {
        try {
          // Find the column that matches the new status
          const targetColumn = kanbanBoard.columns.find(
            col => col.status_mapping === taskStatus || col.auto_assign_status === taskStatus
          )

          if (targetColumn) {
            // Move task to the appropriate column at position 0 (top)
            await moveTask(editingTask.id, kanbanBoard.id, targetColumn.id, 0)
          }
        } catch (error) {
          console.error('Failed to sync with Kanban board:', error)
        }
      }

      // Reload data to reflect changes
      await loadData()
      
      // If status changed, show a success message and optionally close the detail panel
      if (statusChanged && viewMode === 'kanban') {
        // Close the detail panel to show the updated Kanban board
        handleCloseTaskDetail()
      } else {
        // Otherwise, just reload the task details
        await loadTaskDetails(editingTask.id)
      }
    } catch (error) {
      console.error('Failed to update task:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCloseTaskDetail = () => {
    setShowTaskDetail(false)
    setSelectedTaskId(null)
    setEditingTask(null)
    resetTaskForm()
  }

  const resetTaskForm = () => {
    setTaskTitle('')
    setTaskDescription('')
    setTaskPriority('medium')
    setTaskStatus('todo')
    setTaskDueDate('')
    setTaskStartDate('')
    setTaskEstimatedMinutes('')
    setSelectedTaskList('')
    setSelectedProjectId('')
    setSelectedTags([])
  }

  const handleAddSubtask = async () => {
    if (!editingTask || !newSubtaskTitle.trim()) return

    try {
      await createSubtask(editingTask.id, newSubtaskTitle)
      setNewSubtaskTitle('')
      await loadTaskDetails(editingTask.id)
    } catch (error) {
      console.error('Failed to add subtask:', error)
    }
  }

  const handleToggleSubtask = async (subtaskId: string, isCompleted: boolean) => {
    if (!editingTask) return

    try {
      await toggleSubtask(subtaskId, !isCompleted)
      await loadTaskDetails(editingTask.id)
    } catch (error) {
      console.error('Failed to toggle subtask:', error)
    }
  }

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!editingTask || !confirm('Are you sure you want to delete this subtask?')) return

    try {
      await deleteSubtask(subtaskId)
      await loadTaskDetails(editingTask.id)
    } catch (error) {
      console.error('Failed to delete subtask:', error)
    }
  }

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId)
  }

  const handleToggleTask = async (taskId: string, currentStatus: TaskStatus) => {
    try {
      if (currentStatus === 'completed') {
        await uncompleteTask(taskId)
      } else {
        await completeTask(taskId)
      }
      await loadData()
    } catch (error) {
      console.error('Failed to toggle task:', error)
    }
  }

  const handleToggleStar = async (taskId: string, isStarred: boolean) => {
    try {
      await toggleTaskStar(taskId, !isStarred)
      await loadData()
    } catch (error) {
      console.error('Failed to toggle star:', error)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      await deleteTask(taskId)
      await loadData()
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const handleStartTimer = async (taskId: string) => {
    try {
      await startTimeTracking(taskId)
      await loadData()
    } catch (error) {
      console.error('Failed to start timer:', error)
      alert(error instanceof Error ? error.message : 'Failed to start timer')
    }
  }

  const handleStopTimer = async () => {
    if (!activeTimeEntry) return

    try {
      await stopTimeTracking(activeTimeEntry.id)
      await loadData()
    } catch (error) {
      console.error('Failed to stop timer:', error)
    }
  }

  // Timetable helpers
  const timetableInstances = useMemo(() => {
    return getTimetableInstancesForWeek(timetableEntries, timetableWeekStart)
  }, [timetableEntries, timetableWeekStart])

  // Generate timetable instances for the current calendar month view
  const timetableCalendarInstances = useMemo(() => {
    const year = selectedDate.getFullYear()
    const month = selectedDate.getMonth()
    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59)
    return generateTimetableInstances(timetableEntries, monthStart, monthEnd)
  }, [timetableEntries, selectedDate])

  const TIMETABLE_HOURS = Array.from({ length: 16 }, (_, i) => i + 7) // 7:00 to 22:00

  const getProjectById = (projectId: string | null): Project | undefined => {
    if (!projectId) return undefined
    return projects.find(p => p.id === projectId)
  }

  const resetTimetableForm = () => {
    setTtTitle('')
    setTtStartTime('09:00')
    setTtEndTime('10:00')
    setTtDays([])
    setTtDescription('')
    setTtLocation('')
    setTtProjectId('')
    setTtColor('#8B5CF6')
    setEditingTimetableEntry(null)
  }

  const openTimetableForm = (entry?: TimetableEntry, preselectedDay?: number) => {
    if (entry) {
      setEditingTimetableEntry(entry)
      setTtTitle(entry.title)
      setTtStartTime(extractTime(entry.start_time))
      setTtEndTime(extractTime(entry.end_time))
      setTtDays(entry.recurrence_pattern?.days_of_week || [])
      setTtDescription(entry.description || '')
      setTtLocation(entry.location || '')
      setTtProjectId(entry.project_id || '')
      setTtColor(entry.color || '#8B5CF6')
    } else {
      resetTimetableForm()
      if (preselectedDay !== undefined) {
        setTtDays([preselectedDay])
      }
    }
    setShowTimetableModal(true)
  }

  const handleCreateTimetableEntry = async () => {
    if (!ttTitle.trim() || ttDays.length === 0) return
    setIsSaving(true)
    try {
      await createTimetableEntry(ttTitle, ttStartTime, ttEndTime, ttDays, {
        description: ttDescription || undefined,
        location: ttLocation || undefined,
        projectId: ttProjectId || undefined,
        color: ttColor,
      })
      resetTimetableForm()
      setShowTimetableModal(false)
      await loadData()
    } catch (error) {
      console.error('Failed to create timetable entry:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateTimetableEntry = async () => {
    if (!editingTimetableEntry || !ttTitle.trim() || ttDays.length === 0) return
    setIsSaving(true)
    try {
      await updateTimetableEntry(editingTimetableEntry.id, {
        title: ttTitle,
        startTime: ttStartTime,
        endTime: ttEndTime,
        daysOfWeek: ttDays,
        description: ttDescription,
        location: ttLocation,
        projectId: ttProjectId || null,
        color: ttColor,
      })
      resetTimetableForm()
      setShowTimetableModal(false)
      await loadData()
    } catch (error) {
      console.error('Failed to update timetable entry:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteTimetableEntry = async (id: string) => {
    if (!confirm('Delete this timetable entry? It will be removed from all weeks.')) return
    try {
      await deleteTimetableEntry(id)
      setShowTimetableModal(false)
      resetTimetableForm()
      await loadData()
    } catch (error) {
      console.error('Failed to delete timetable entry:', error)
    }
  }

  const navigateTimetableWeek = (direction: number) => {
    const newStart = new Date(timetableWeekStart)
    newStart.setDate(newStart.getDate() + direction * 7)
    setTimetableWeekStart(newStart)
  }

  // Event handlers
  const handleCreateEvent = async () => {
    if (!eventTitle.trim() || !eventStartTime || !eventEndTime) return

    setIsSaving(true)
    try {
      await createEvent(
        eventTitle,
        new Date(eventStartTime),
        new Date(eventEndTime),
        {
          description: eventDescription || undefined,
          location: eventLocation || undefined,
          meetingUrl: eventMeetingUrl || undefined,
          noteId: linkedNoteId,
          projectId: linkedProjectId,
        }
      )

      setEventTitle('')
      setEventDescription('')
      setEventStartTime('')
      setEventEndTime('')
      setEventLocation('')
      setEventMeetingUrl('')
      setShowEventModal(false)
      await loadData()
    } catch (error) {
      console.error('Failed to create event:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const priorityColors = {
    low: 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-600',
    medium: 'bg-alpine-100 dark:bg-alpine-900/40 text-alpine-700 dark:text-alpine-200 border-alpine-300 dark:border-alpine-700',
    high: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-200 border-orange-300 dark:border-orange-700',
    urgent: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-200 border-red-300 dark:border-red-700',
  }

  const priorityIcons = {
    low: <Flag size={14} className="text-gray-500" />,
    medium: <Flag size={14} className="text-alpine-500" />,
    high: <Flag size={14} className="text-orange-500" />,
    urgent: <Flag size={14} className="text-red-500" />,
  }

  if (!isOpen && !asView) return null

  return (
    <div
      className={asView ? 'h-full w-full' : 'fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-4'}
    >
      <div
        className={
          asView
            ? 'flex h-full w-full flex-col overflow-hidden border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900'
            : 'flex w-full max-w-7xl max-h-[95vh] sm:max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl'
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 dark:border-slate-700 bg-alpine-50 dark:bg-slate-800 px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-1 min-w-0 items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <CheckSquare size={22} className="text-alpine-600" />
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-slate-100">Tasks & Calendar</h2>
            </div>

            {/* View mode toggles */}
            <div className="flex-1 min-w-0 overflow-x-auto">
              <div className="inline-flex items-center gap-1 rounded-lg bg-white dark:bg-slate-900 p-1 shadow-sm border border-gray-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('tasks')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                  viewMode === 'tasks' ? 'bg-alpine-600 text-white' : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <List size={16} />
                Tasks
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                  viewMode === 'kanban' ? 'bg-alpine-600 text-white' : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <LayoutDashboard size={16} />
                Kanban
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                  viewMode === 'calendar' ? 'bg-alpine-600 text-white' : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <Calendar size={16} />
                Calendar
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                  viewMode === 'timeline' ? 'bg-alpine-600 text-white' : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <Clock size={16} />
                Timeline
              </button>
              <button
                onClick={() => setViewMode('timetable')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                  viewMode === 'timetable' ? 'bg-alpine-600 text-white' : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <Grid3x3 size={16} />
                Timetable
              </button>
              </div>
            </div>
          </div>

          <ModalCloseButton
            onClick={onClose}
            ariaLabel={asView ? 'Return to notes view' : 'Close task and calendar modal'}
            className="flex-shrink-0"
            size={20}
          />
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-3 md:grid-cols-7 gap-2 sm:gap-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 sm:px-6 py-2.5 sm:py-3">
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-slate-100">{stats.total}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400">Total</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-alpine-600">{stats.todo}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400">To Do</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-purple-600">{stats.in_progress}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400">In Progress</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-red-600">{stats.overdue}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400">Overdue</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-orange-600">{stats.due_today}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400">Due Today</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-yellow-600">{stats.starred}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400">Starred</div>
            </div>
          </div>
        )}

        {/* Main Content */}
        {(!asView || !showTaskDetail) && (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Quick Actions */}
              <div className="space-y-2">
                <button
                  onClick={() => setShowTaskModal(true)}
                  className="w-full px-4 py-2.5 bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 transition-colors flex items-center justify-center gap-2 font-medium shadow-sm"
                >
                  <Plus size={18} />
                  New Task
                </button>
                <button
                  onClick={() => setShowEventModal(true)}
                  className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 font-medium shadow-sm"
                >
                  <Calendar size={18} />
                  New Event
                </button>
                {viewMode === 'timetable' && (
                  <button
                    onClick={() => openTimetableForm()}
                    className="w-full px-4 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors flex items-center justify-center gap-2 font-medium shadow-sm"
                  >
                    <Grid3x3 size={18} />
                    New Class
                  </button>
                )}
              </div>

              {/* Filters */}
              {viewMode === 'tasks' && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide px-2">Filters</h3>
                  {[
                    { value: 'all', label: 'All Tasks', icon: List },
                    { value: 'today', label: 'Due Today', icon: Calendar },
                    { value: 'week', label: 'This Week', icon: CalendarDays },
                    { value: 'overdue', label: 'Overdue', icon: AlertCircle },
                    { value: 'starred', label: 'Starred', icon: Star },
                    { value: 'completed', label: 'Completed', icon: CheckCircle2 },
                  ].map(filter => (
                    <button
                      key={filter.value}
                      onClick={() => setTaskFilter(filter.value as TaskFilter)}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                        taskFilter === filter.value
                          ? 'bg-alpine-100 dark:bg-alpine-900/40 text-alpine-700 dark:text-alpine-200'
                          : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <filter.icon size={16} />
                      {filter.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Task Lists */}
              {viewMode === 'tasks' && taskLists.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide px-2">Lists</h3>
                  {taskLists.map(list => (
                    <button
                      key={list.id}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: list.color }}
                      />
                      {list.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Active Timer */}
              {activeTimeEntry && (
                <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Timer size={16} className="text-green-600" />
                    <span className="text-sm font-semibold text-green-700 dark:text-green-300">Timer Running</span>
                  </div>
                  <button
                    onClick={handleStopTimer}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <Square size={14} />
                    Stop Timer
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-alpine-600 mx-auto mb-4" />
                  <p className="text-gray-500">Loading...</p>
                </div>
              </div>
            ) : viewMode === 'tasks' ? (
              /* Task List View */
              <div className="space-y-3">
                {filteredTasks.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle2 size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">No tasks found</p>
                    <button
                      onClick={() => setShowTaskModal(true)}
                      className="mt-4 px-4 py-2 bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 transition-colors"
                    >
                      Create your first task
                    </button>
                  </div>
                ) : (
                  filteredTasks.map(task => (
                    <div
                      key={task.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => handleTaskClick(task.id)}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleTask(task.id, task.status)
                          }}
                          className="mt-1 flex-shrink-0"
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle2 size={20} className="text-green-600" />
                          ) : (
                            <Circle size={20} className="text-gray-400 hover:text-alpine-600" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className={`font-medium text-gray-900 ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                              {task.title}
                            </h3>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleStar(task.id, task.is_starred)
                                }}
                                className={`p-1 rounded ${task.is_starred ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
                              >
                                <Star size={16} fill={task.is_starred ? 'currentColor' : 'none'} />
                              </button>
                              {!activeTimeEntry && task.status !== 'completed' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleStartTimer(task.id)
                                  }}
                                  className="p-1 rounded text-gray-400 hover:text-green-600"
                                  title="Start timer"
                                >
                                  <Play size={16} />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteTask(task.id)
                                }}
                                className="p-1 rounded text-gray-400 hover:text-red-600"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>

                          {task.description && (
                            <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${priorityColors[task.priority]}`}>
                              {priorityIcons[task.priority]}
                              {task.priority}
                            </span>

                            {task.due_date && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                                <Clock size={12} />
                                {new Date(task.due_date).toLocaleDateString()}
                              </span>
                            )}

                            {task.estimated_minutes && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-700">
                                <Timer size={12} />
                                {formatDuration(task.estimated_minutes)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : viewMode === 'calendar' ? (
              /* Calendar View */
              <div>
                {/* Calendar Header */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {selectedDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() - 1)))}
                      className="p-2 rounded-lg hover:bg-gray-100"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={() => setSelectedDate(new Date())}
                      className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-sm font-medium"
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() + 1)))}
                      className="p-2 rounded-lg hover:bg-gray-100"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-sm font-semibold text-gray-600 py-2">
                      {day}
                    </div>
                  ))}
                  {getDaysInMonth(selectedDate).map((day, index) => {
                    if (!day) {
                      return <div key={`empty-${index}`} className="aspect-square" />
                    }

                    const dayEvents = getEventsForDate(day)
                    const dayTasks = getTasksForDate(day)
                    const dayTimetable = timetableCalendarInstances.filter(inst => {
                      const instDate = new Date(inst.start_time)
                      return instDate.getFullYear() === day.getFullYear() &&
                        instDate.getMonth() === day.getMonth() &&
                        instDate.getDate() === day.getDate()
                    })
                    const isToday = day.toDateString() === new Date().toDateString()

                    return (
                      <div
                        key={day.toISOString()}
                        className={`aspect-square border rounded-lg p-2 hover:bg-gray-50 transition-colors ${
                          isToday ? 'border-alpine-500 bg-alpine-50' : 'border-gray-200'
                        }`}
                      >
                        <div className={`text-sm font-medium mb-1 ${isToday ? 'text-alpine-600' : 'text-gray-900'}`}>
                          {day.getDate()}
                        </div>
                        <div className="space-y-1">
                          {dayTimetable.slice(0, 1).map(inst => {
                            const proj = getProjectById(inst.project_id)
                            return (
                              <div
                                key={inst.id}
                                className="text-xs truncate px-1 py-0.5 rounded bg-violet-100 text-violet-700"
                                style={proj ? { borderLeft: `3px solid ${proj.color}` } : undefined}
                              >
                                {inst.title}
                              </div>
                            )
                          })}
                          {dayEvents.slice(0, 2).map(event => (
                            <div
                              key={event.id}
                              className="text-xs truncate px-1 py-0.5 rounded bg-purple-100 text-purple-700"
                              style={event.project_id ? { borderLeft: `3px solid ${getProjectById(event.project_id)?.color || '#8B5CF6'}` } : undefined}
                            >
                              {event.title}
                            </div>
                          ))}
                          {dayTasks.slice(0, 2).map(task => (
                            <div
                              key={task.id}
                              className="text-xs truncate px-1 py-0.5 rounded bg-alpine-100 text-alpine-700"
                            >
                              {task.title}
                            </div>
                          ))}
                          {dayEvents.length + dayTasks.length + dayTimetable.length > 2 && (
                            <div className="text-xs text-gray-500">
                              +{dayEvents.length + dayTasks.length + dayTimetable.length - 2} more
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : viewMode === 'kanban' ? (
              /* Kanban View */
              kanbanBoard ? (
                <KanbanBoard
                  boardId={kanbanBoard.id}
                  onTaskClick={async (task) => {
                    handleTaskClick(task.id)
                  }}
                  onCreateTask={(columnId) => {
                    // Open task creation modal
                    setShowTaskModal(true)
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-alpine-600 mx-auto mb-4" />
                    <p className="text-gray-500">Loading Kanban board...</p>
                  </div>
                </div>
              )
            ) : viewMode === 'timetable' ? (
              /* Timetable Weekly Grid View */
              <div>
                {/* Timetable Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">
                    Weekly Timetable
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigateTimetableWeek(-1)}
                      className="p-2 rounded-lg hover:bg-gray-100"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={() => setTimetableWeekStart(getWeekStart(new Date()))}
                      className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-sm font-medium"
                    >
                      This Week
                    </button>
                    <button
                      onClick={() => navigateTimetableWeek(1)}
                      className="p-2 rounded-lg hover:bg-gray-100"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>

                {/* Week date range label */}
                <div className="text-sm text-gray-500 mb-4">
                  {timetableWeekStart.toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                  {' – '}
                  {new Date(timetableWeekStart.getTime() + 6 * 86400000).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>

                {/* Weekly Grid */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Day headers */}
                  <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-gray-50 border-b border-gray-200">
                    <div className="p-2 text-xs font-medium text-gray-500 border-r border-gray-200"></div>
                    {WEEKDAY_LABELS.map((day, i) => {
                      const dayDate = new Date(timetableWeekStart)
                      dayDate.setDate(dayDate.getDate() + i)
                      const isToday = dayDate.toDateString() === new Date().toDateString()
                      return (
                        <div key={day} className={`p-2 text-center border-r border-gray-200 last:border-r-0 ${isToday ? 'bg-alpine-50' : ''}`}>
                          <div className={`text-xs font-semibold ${isToday ? 'text-alpine-600' : 'text-gray-600'}`}>{day}</div>
                          <div className={`text-sm ${isToday ? 'text-alpine-700 font-bold' : 'text-gray-900'}`}>{dayDate.getDate()}</div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Time rows */}
                  <div className="max-h-[calc(90vh-320px)] overflow-y-auto">
                    {TIMETABLE_HOURS.map(hour => (
                      <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-100 last:border-b-0 min-h-[48px]">
                        <div className="p-1 text-xs text-gray-400 text-right pr-2 border-r border-gray-200 pt-1">
                          {hour.toString().padStart(2, '0')}:00
                        </div>
                        {WEEKDAY_LABELS.map((_, dayIndex) => {
                          const jsDay = mondayIndexToJsDay(dayIndex)
                          // Find instances for this day & hour
                          const cellInstances = timetableInstances.filter(inst => {
                            const instDate = new Date(inst.start_time)
                            const endDate = new Date(inst.end_time)
                            return instDate.getDay() === jsDay &&
                              instDate.getHours() <= hour && endDate.getHours() > hour
                          })
                          // Only render the block on the starting hour
                          const startingHere = cellInstances.filter(inst => {
                            return new Date(inst.start_time).getHours() === hour
                          })
                          // Check if occupied by a block that started earlier
                          const continuedHere = cellInstances.filter(inst => {
                            return new Date(inst.start_time).getHours() < hour
                          })

                          return (
                            <div
                              key={dayIndex}
                              className="border-r border-gray-100 last:border-r-0 relative min-h-[48px] cursor-pointer hover:bg-gray-50 transition-colors"
                              onClick={() => {
                                if (startingHere.length === 0 && continuedHere.length === 0) {
                                  openTimetableForm(undefined, jsDay)
                                }
                              }}
                            >
                              {startingHere.map(inst => {
                                const instStart = new Date(inst.start_time)
                                const instEnd = new Date(inst.end_time)
                                const durationHours = (instEnd.getTime() - instStart.getTime()) / 3600000
                                const project = getProjectById(inst.project_id)
                                return (
                                  <div
                                    key={inst.id}
                                    className="absolute inset-x-0.5 rounded-md px-1.5 py-1 text-xs overflow-hidden shadow-sm cursor-pointer z-10 border border-transparent hover:border-gray-300"
                                    style={{
                                      top: '1px',
                                      height: `${Math.max(durationHours * 48 - 2, 22)}px`,
                                      backgroundColor: `${inst.color}18`,
                                      borderLeft: project ? `3px solid ${project.color}` : `3px solid ${inst.color}`,
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      // Find the parent entry for editing
                                      const parent = timetableEntries.find(te => te.id === inst.parentEntryId)
                                      if (parent) openTimetableForm(parent)
                                    }}
                                  >
                                    <div className="font-semibold truncate" style={{ color: inst.color }}>
                                      {inst.title}
                                    </div>
                                    <div className="text-gray-500 truncate">
                                      {extractTime(inst.start_time)} – {extractTime(inst.end_time)}
                                    </div>
                                    {project && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                                        <span className="truncate text-gray-600">{project.name}</span>
                                      </div>
                                    )}
                                    {inst.location && (
                                      <div className="flex items-center gap-1 mt-0.5 text-gray-500">
                                        <MapPin size={10} />
                                        <span className="truncate">{inst.location}</span>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timetable entry list summary */}
                {timetableEntries.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">All Timetable Entries</h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {timetableEntries.map(entry => {
                        const project = getProjectById(entry.project_id)
                        const days = entry.recurrence_pattern?.days_of_week || []
                        return (
                          <div
                            key={entry.id}
                            className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm cursor-pointer transition-shadow"
                            style={{ borderLeft: `3px solid ${entry.color}` }}
                            onClick={() => openTimetableForm(entry)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 truncate">{entry.title}</div>
                              <div className="text-xs text-gray-500">
                                {extractTime(entry.start_time)} – {extractTime(entry.end_time)}
                                {' · '}
                                {days.map(d => WEEKDAY_LABELS[jsDayToMondayIndex(d)]).join(', ')}
                              </div>
                              {project && (
                                <div className="flex items-center gap-1 mt-1">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: project.color }} />
                                  <span className="text-xs text-gray-600">{project.name}</span>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteTimetableEntry(entry.id)
                              }}
                              className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {timetableEntries.length === 0 && (
                  <div className="text-center py-12">
                    <Grid3x3 size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500 mb-2">No timetable entries yet</p>
                    <p className="text-sm text-gray-400 mb-4">Create a weekly schedule for classes, meetings, or recurring activities</p>
                    <button
                      onClick={() => openTimetableForm()}
                      className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
                    >
                      Add First Entry
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Timeline View */
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Upcoming Events & Tasks</h3>
                {events.length === 0 && tasks.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">No events or tasks scheduled</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {events.map(event => (
                      <div key={event.id} className="flex gap-4">
                        <div className="flex-shrink-0 w-24 text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {new Date(event.start_time).toLocaleTimeString('default', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(event.start_time).toLocaleDateString('default', { 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </div>
                        </div>
                        <div className="flex-1 bg-purple-50 border-l-4 border-purple-500 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-medium text-gray-900">{event.title}</h4>
                            <Calendar size={16} className="text-purple-600" />
                          </div>
                          {event.description && (
                            <p className="text-sm text-gray-600 mb-2">{event.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 text-xs">
                            {event.location && (
                              <span className="inline-flex items-center gap-1 text-gray-600">
                                <MapPin size={12} />
                                {event.location}
                              </span>
                            )}
                            {event.meeting_url && (
                              <a
                                href={event.meeting_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-alpine-600 hover:underline"
                              >
                                <Link2 size={12} />
                                Join Meeting
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Task Modal */}
        {showTaskModal && (
          <div
            className={
              asView
                ? 'absolute inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-surface p-6'
                : 'fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4'
            }
          >
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-4">Create New Task</h3>
              <div className="space-y-4">
                <input
                  type="text"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  placeholder="Task title"
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                  autoFocus
                />
                <textarea
                  value={taskDescription}
                  onChange={e => setTaskDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent resize-none"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Status</label>
                    <select
                      value={taskStatus}
                      onChange={e => setTaskStatus(e.target.value as TaskStatus)}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="waiting">Waiting</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Priority</label>
                    <select
                      value={taskPriority}
                      onChange={e => setTaskPriority(e.target.value as TaskPriority)}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <input
                  type="datetime-local"
                  value={taskDueDate}
                  onChange={e => setTaskDueDate(e.target.value)}
                  placeholder="Due date"
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                />
                <select
                  value={selectedTaskList}
                  onChange={e => setSelectedTaskList(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                >
                  <option value="">No List</option>
                  {taskLists.map(list => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Project</label>
                  <select
                    value={selectedProjectId}
                    onChange={e => setSelectedProjectId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                  >
                    <option value="">No Project</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowTaskModal(false)
                      resetTaskForm()
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateTask}
                    disabled={isSaving || !taskTitle.trim()}
                    className="flex-1 px-4 py-2 bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Creating...' : 'Create Task'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Event Modal */}
        {showEventModal && (
          <div
            className={
              asView
                ? 'absolute inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-surface p-6'
                : 'fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4'
            }
          >
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-4">Create New Event</h3>
              <div className="space-y-4">
                <input
                  type="text"
                  value={eventTitle}
                  onChange={e => setEventTitle(e.target.value)}
                  placeholder="Event title"
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  autoFocus
                />
                <textarea
                  value={eventDescription}
                  onChange={e => setEventDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Start</label>
                    <input
                      type="datetime-local"
                      value={eventStartTime}
                      onChange={e => setEventStartTime(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">End</label>
                    <input
                      type="datetime-local"
                      value={eventEndTime}
                      onChange={e => setEventEndTime(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={eventLocation}
                  onChange={e => setEventLocation(e.target.value)}
                  placeholder="Location (optional)"
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <input
                  type="url"
                  value={eventMeetingUrl}
                  onChange={e => setEventMeetingUrl(e.target.value)}
                  placeholder="Meeting URL (optional)"
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowEventModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateEvent}
                    disabled={isSaving || !eventTitle.trim() || !eventStartTime || !eventEndTime}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Creating...' : 'Create Event'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Timetable Entry Modal */}
        {showTimetableModal && (
          <div
            className={
              asView
                ? 'absolute inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-surface p-6'
                : 'fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4'
            }
          >
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl max-w-lg w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-4">
                {editingTimetableEntry ? 'Edit Timetable Entry' : 'New Timetable Entry'}
              </h3>
              <div className="space-y-4">
                {/* Title */}
                <input
                  type="text"
                  value={ttTitle}
                  onChange={e => setTtTitle(e.target.value)}
                  placeholder="Class or activity name"
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  autoFocus
                />

                {/* Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={ttStartTime}
                      onChange={e => setTtStartTime(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">End Time</label>
                    <input
                      type="time"
                      value={ttEndTime}
                      onChange={e => setTtEndTime(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Days of Week */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Repeat on</label>
                  <div className="flex gap-2">
                    {WEEKDAY_LABELS.map((day, i) => {
                      const jsDay = mondayIndexToJsDay(i)
                      const selected = ttDays.includes(jsDay)
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setTtDays(ttDays.filter(d => d !== jsDay))
                            } else {
                              setTtDays([...ttDays, jsDay])
                            }
                          }}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                            selected
                              ? 'bg-violet-600 text-white border-violet-600'
                                : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-500'
                          }`}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Description */}
                <textarea
                  value={ttDescription}
                  onChange={e => setTtDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                />

                {/* Location */}
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
                  <input
                    type="text"
                    value={ttLocation}
                    onChange={e => setTtLocation(e.target.value)}
                    placeholder="Location (optional)"
                    className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>

                {/* Project */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Link to Project</label>
                  <select
                    value={ttProjectId}
                    onChange={e => setTtProjectId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  >
                    <option value="">No Project</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {ttProjectId && (() => {
                    const proj = getProjectById(ttProjectId)
                    return proj ? (
                      <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-gray-50 dark:bg-slate-800 rounded-lg">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: proj.color }} />
                        <span className="text-sm text-gray-700 dark:text-slate-200">{proj.name}</span>
                      </div>
                    ) : null
                  })()}
                </div>

                {/* Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Color</label>
                  <div className="flex gap-2">
                    {['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#14B8A6'].map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setTtColor(color)}
                        className={`w-8 h-8 rounded-full transition-transform ${ttColor === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      setShowTimetableModal(false)
                      resetTimetableForm()
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  {editingTimetableEntry && (
                    <button
                      onClick={() => handleDeleteTimetableEntry(editingTimetableEntry.id)}
                      className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <button
                    onClick={editingTimetableEntry ? handleUpdateTimetableEntry : handleCreateTimetableEntry}
                    disabled={isSaving || !ttTitle.trim() || ttDays.length === 0}
                    className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : editingTimetableEntry ? 'Update Entry' : 'Create Entry'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Task Detail Panel */}
        {showTaskDetail && editingTask && (
          <div
            className={
              asView
                ? 'flex flex-1 w-full bg-white dark:bg-slate-900 overflow-y-auto border-l border-gray-200 dark:border-slate-700'
                : 'fixed inset-y-0 right-0 z-[110] w-full max-w-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto border-l border-gray-200 dark:border-slate-700'
            }
          >
            <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">Task Details</h3>
                <ModalCloseButton
                  onClick={handleCloseTaskDetail}
                  ariaLabel="Close task details"
                  className="dark:hover:bg-slate-800"
                  size={20}
                />
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Task Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                />
              </div>

              {/* Task Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Description</label>
                <textarea
                  value={taskDescription}
                  onChange={e => setTaskDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent resize-none"
                  placeholder="Add a description..."
                />
              </div>

              {/* Status & Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Status</label>
                  <select
                    value={taskStatus}
                    onChange={e => setTaskStatus(e.target.value as TaskStatus)}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting">Waiting</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={e => setTaskPriority(e.target.value as TaskPriority)}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Start Date</label>
                  <input
                    type="datetime-local"
                    value={taskStartDate}
                    onChange={e => setTaskStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Due Date</label>
                  <input
                    type="datetime-local"
                    value={taskDueDate}
                    onChange={e => setTaskDueDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Estimated Time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Estimated Time (minutes)</label>
                <input
                  type="number"
                  value={taskEstimatedMinutes}
                  onChange={e => setTaskEstimatedMinutes(e.target.value)}
                  min="0"
                  placeholder="e.g., 60"
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                />
              </div>

              {/* Task List */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Task List</label>
                <select
                  value={selectedTaskList}
                  onChange={e => setSelectedTaskList(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                >
                  <option value="">No List</option>
                  {taskLists.map(list => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Project */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={e => setSelectedProjectId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                >
                  <option value="">No Project</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Linked Note */}
              {selectedProjectId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Task Note</label>
                  {editingTask.note_id ? (
                    <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                      <FileText size={18} className="text-green-600" />
                      <span className="text-sm text-green-800 dark:text-green-300 font-medium">Note linked to this task</span>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        if (!editingTask) return
                        try {
                          setIsSaving(true)
                          const note = await createNote({
                            title: editingTask.title,
                            content: '',
                            project_id: selectedProjectId,
                          })
                          await updateTask(editingTask.id, { note_id: note.id })
                          await loadTaskDetails(editingTask.id)
                          await loadData()
                        } catch (error) {
                          console.error('Failed to create note for task:', error)
                        } finally {
                          setIsSaving(false)
                        }
                      }}
                      disabled={isSaving}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-alpine-300 dark:border-alpine-700 rounded-lg text-alpine-700 dark:text-alpine-200 hover:bg-alpine-50 dark:hover:bg-alpine-900/20 hover:border-alpine-400 dark:hover:border-alpine-600 transition-colors disabled:opacity-50"
                    >
                      <FileText size={18} />
                      <span className="font-medium">Create Note for This Task</span>
                    </button>
                  )}
                </div>
              )}

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Tags</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {editingTask.tags?.map(tag => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium"
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                      }}
                    >
                      <TagIcon size={12} />
                      {tag.name}
                      <button
                        onClick={() => setSelectedTags(selectedTags.filter(id => id !== tag.id))}
                        className="hover:opacity-70"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
                <select
                  value=""
                  onChange={e => {
                    if (e.target.value && !selectedTags.includes(e.target.value)) {
                      setSelectedTags([...selectedTags, e.target.value])
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                >
                  <option value="">Add a tag...</option>
                  {tags
                    .filter(tag => !selectedTags.includes(tag.id))
                    .map(tag => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Subtasks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Subtasks</label>
                {editingTask.subtasks && editingTask.subtasks.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {editingTask.subtasks.map(subtask => (
                      <div
                        key={subtask.id}
                        className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-slate-800 rounded-lg"
                      >
                        <button
                          onClick={() => handleToggleSubtask(subtask.id, subtask.is_completed)}
                          className="flex-shrink-0"
                        >
                          {subtask.is_completed ? (
                            <CheckCircle2 size={18} className="text-green-600" />
                          ) : (
                            <Circle size={18} className="text-gray-400 dark:text-slate-500 hover:text-alpine-600" />
                          )}
                        </button>
                        <span
                          className={`flex-1 text-sm ${
                            subtask.is_completed ? 'line-through text-gray-500 dark:text-slate-400' : 'text-gray-900 dark:text-slate-100'
                          }`}
                        >
                          {subtask.title}
                        </span>
                        <button
                          onClick={() => handleDeleteSubtask(subtask.id)}
                          className="p-1 rounded text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {editingTask.completion_percentage !== undefined && editingTask.subtasks && editingTask.subtasks.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-sm text-gray-600 dark:text-slate-300 mb-1">
                      <span>Progress</span>
                      <span className="font-medium">{editingTask.completion_percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-alpine-600 h-2 rounded-full transition-all"
                        style={{ width: `${editingTask.completion_percentage}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={e => setNewSubtaskTitle(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleAddSubtask()}
                    placeholder="Add a subtask..."
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleAddSubtask}
                    disabled={!newSubtaskTitle.trim()}
                    className="px-4 py-2 bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              {/* Time Tracking */}
              {editingTask.actual_minutes !== null && editingTask.actual_minutes > 0 && (
                <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-200">Time Tracked</span>
                    <Timer size={16} className="text-purple-600" />
                  </div>
                  <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                    {formatDuration(editingTask.actual_minutes)}
                  </div>
                  {editingTask.estimated_minutes && (
                    <div className="text-sm text-purple-600 dark:text-purple-300 mt-1">
                      Estimated: {formatDuration(editingTask.estimated_minutes)}
                    </div>
                  )}
                </div>
              )}

              {/* Metadata */}
              <div className="pt-4 border-t border-gray-200 dark:border-slate-700 space-y-2 text-sm text-gray-600 dark:text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Created</span>
                  <span>{new Date(editingTask.created_at).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last Updated</span>
                  <span>{new Date(editingTask.updated_at).toLocaleString()}</span>
                </div>
                {editingTask.completed_at && (
                  <div className="flex items-center justify-between">
                    <span>Completed</span>
                    <span>{new Date(editingTask.completed_at).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleUpdateTask}
                  disabled={isSaving || !taskTitle.trim()}
                  className="flex-1 px-4 py-3 bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 disabled:opacity-50 font-medium"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={handleCloseTaskDetail}
                  className="px-4 py-3 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
