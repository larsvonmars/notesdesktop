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
  type CalendarEvent,
  type TimeEntry,
} from '@/lib/events'
import KanbanBoard from './KanbanBoard'
import { initializeDefaultBoard, addTaskToBoard, type BoardWithColumns } from '@/lib/kanban'

interface TaskCalendarModalProps {
  isOpen: boolean
  onClose: () => void
  initialView?: 'tasks' | 'calendar' | 'timeline' | 'kanban'
  linkedNoteId?: string
  linkedProjectId?: string
}

type ViewMode = 'tasks' | 'calendar' | 'timeline' | 'kanban'
type CalendarView = 'month' | 'week' | 'day'
type TaskFilter = 'all' | 'today' | 'week' | 'overdue' | 'starred' | 'completed'

export default function TaskCalendarModal({
  isOpen,
  onClose,
  initialView = 'tasks',
  linkedNoteId,
  linkedProjectId,
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
  const [editingTask, setEditingTask] = useState<TaskWithDetails | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)

  // Form states
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [selectedTaskList, setSelectedTaskList] = useState<string>('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const [eventTitle, setEventTitle] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventStartTime, setEventStartTime] = useState('')
  const [eventEndTime, setEventEndTime] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [eventMeetingUrl, setEventMeetingUrl] = useState('')

  // Load data
  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen])

  // Load Kanban board when switching to kanban view
  useEffect(() => {
    if (viewMode === 'kanban' && !kanbanBoard && isOpen) {
      initializeDefaultBoard().then(setKanbanBoard)
    }
  }, [viewMode, isOpen])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [tasksData, taskListsData, eventsData, tagsData, statsData, activeTime] = await Promise.all([
        getTasks({ includeCompleted: taskFilter === 'completed' }),
        getTaskLists(),
        getEvents(),
        getTags(),
        getTaskStats(),
        getActiveTimeEntry(),
      ])

      setTasks(tasksData)
      setTaskLists(taskListsData)
      setEvents(eventsData)
      setTags(tagsData)
      setStats(statsData)
      setActiveTimeEntry(activeTime)

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
        dueDate: taskDueDate ? new Date(taskDueDate) : undefined,
        taskListId: selectedTaskList || undefined,
        noteId: linkedNoteId,
        projectId: linkedProjectId,
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

      setTaskTitle('')
      setTaskDescription('')
      setTaskPriority('medium')
      setTaskDueDate('')
      setSelectedTaskList('')
      setShowTaskModal(false)
      await loadData()
    } catch (error) {
      console.error('Failed to create task:', error)
    } finally {
      setIsSaving(false)
    }
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
    low: 'bg-gray-100 text-gray-700 border-gray-300',
    medium: 'bg-blue-100 text-blue-700 border-blue-300',
    high: 'bg-orange-100 text-orange-700 border-orange-300',
    urgent: 'bg-red-100 text-red-700 border-red-300',
  }

  const priorityIcons = {
    low: <Flag size={14} className="text-gray-500" />,
    medium: <Flag size={14} className="text-blue-500" />,
    high: <Flag size={14} className="text-orange-500" />,
    urgent: <Flag size={14} className="text-red-500" />,
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-7xl max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CheckSquare size={24} className="text-blue-600" />
              <h2 className="text-2xl font-bold text-gray-900">Tasks & Calendar</h2>
            </div>

            {/* View mode toggles */}
            <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm border border-gray-200">
              <button
                onClick={() => setViewMode('tasks')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  viewMode === 'tasks' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <List size={16} />
                Tasks
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <LayoutDashboard size={16} />
                Kanban
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  viewMode === 'calendar' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Calendar size={16} />
                Calendar
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Clock size={16} />
                Timeline
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-7 gap-4 border-b border-gray-200 bg-gray-50 px-6 py-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.todo}</div>
              <div className="text-xs text-gray-500">To Do</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.in_progress}</div>
              <div className="text-xs text-gray-500">In Progress</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-xs text-gray-500">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              <div className="text-xs text-gray-500">Overdue</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.due_today}</div>
              <div className="text-xs text-gray-500">Due Today</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.starred}</div>
              <div className="text-xs text-gray-500">Starred</div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-gray-200 bg-gray-50 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Quick Actions */}
              <div className="space-y-2">
                <button
                  onClick={() => setShowTaskModal(true)}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium shadow-sm"
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
              </div>

              {/* Filters */}
              {viewMode === 'tasks' && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2">Filters</h3>
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
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100'
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
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2">Lists</h3>
                  {taskLists.map(list => (
                    <button
                      key={list.id}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-2"
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
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Timer size={16} className="text-green-600" />
                    <span className="text-sm font-semibold text-green-700">Timer Running</span>
                  </div>
                  <button
                    onClick={handleStopTimer}
                    className="w-full px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
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
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
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
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Create your first task
                    </button>
                  </div>
                ) : (
                  filteredTasks.map(task => (
                    <div
                      key={task.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => handleToggleTask(task.id, task.status)}
                          className="mt-1 flex-shrink-0"
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle2 size={20} className="text-green-600" />
                          ) : (
                            <Circle size={20} className="text-gray-400 hover:text-blue-600" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className={`font-medium text-gray-900 ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                              {task.title}
                            </h3>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => handleToggleStar(task.id, task.is_starred)}
                                className={`p-1 rounded ${task.is_starred ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
                              >
                                <Star size={16} fill={task.is_starred ? 'currentColor' : 'none'} />
                              </button>
                              {!activeTimeEntry && task.status !== 'completed' && (
                                <button
                                  onClick={() => handleStartTimer(task.id)}
                                  className="p-1 rounded text-gray-400 hover:text-green-600"
                                  title="Start timer"
                                >
                                  <Play size={16} />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteTask(task.id)}
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
                    const isToday = day.toDateString() === new Date().toDateString()

                    return (
                      <div
                        key={day.toISOString()}
                        className={`aspect-square border rounded-lg p-2 hover:bg-gray-50 transition-colors ${
                          isToday ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                      >
                        <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                          {day.getDate()}
                        </div>
                        <div className="space-y-1">
                          {dayEvents.slice(0, 2).map(event => (
                            <div
                              key={event.id}
                              className="text-xs truncate px-1 py-0.5 rounded bg-purple-100 text-purple-700"
                            >
                              {event.title}
                            </div>
                          ))}
                          {dayTasks.slice(0, 2).map(task => (
                            <div
                              key={task.id}
                              className="text-xs truncate px-1 py-0.5 rounded bg-blue-100 text-blue-700"
                            >
                              {task.title}
                            </div>
                          ))}
                          {dayEvents.length + dayTasks.length > 2 && (
                            <div className="text-xs text-gray-500">
                              +{dayEvents.length + dayTasks.length - 2} more
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
                  onTaskClick={(task) => {
                    // TODO: Open task detail panel
                    console.log('Task clicked:', task)
                  }}
                  onCreateTask={(columnId) => {
                    // Open task creation modal
                    setShowTaskModal(true)
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                    <p className="text-gray-500">Loading Kanban board...</p>
                  </div>
                </div>
              )
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
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
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

        {/* Task Modal */}
        {showTaskModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Create New Task</h3>
              <div className="space-y-4">
                <input
                  type="text"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  placeholder="Task title"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                <textarea
                  value={taskDescription}
                  onChange={e => setTaskDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <select
                  value={taskPriority}
                  onChange={e => setTaskPriority(e.target.value as TaskPriority)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="urgent">Urgent</option>
                </select>
                <input
                  type="datetime-local"
                  value={taskDueDate}
                  onChange={e => setTaskDueDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowTaskModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateTask}
                    disabled={isSaving || !taskTitle.trim()}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Create New Event</h3>
              <div className="space-y-4">
                <input
                  type="text"
                  value={eventTitle}
                  onChange={e => setEventTitle(e.target.value)}
                  placeholder="Event title"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  autoFocus
                />
                <textarea
                  value={eventDescription}
                  onChange={e => setEventDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                    <input
                      type="datetime-local"
                      value={eventStartTime}
                      onChange={e => setEventStartTime(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                    <input
                      type="datetime-local"
                      value={eventEndTime}
                      onChange={e => setEventEndTime(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={eventLocation}
                  onChange={e => setEventLocation(e.target.value)}
                  placeholder="Location (optional)"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <input
                  type="url"
                  value={eventMeetingUrl}
                  onChange={e => setEventMeetingUrl(e.target.value)}
                  placeholder="Meeting URL (optional)"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowEventModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
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
      </div>
    </div>
  )
}
