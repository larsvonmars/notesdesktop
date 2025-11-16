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
import { initializeDefaultBoard, addTaskToBoard, moveTask, type BoardWithColumns, type KanbanColumn } from '@/lib/kanban'

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
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')

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
        status: taskStatus,
        dueDate: taskDueDate ? new Date(taskDueDate) : undefined,
        startDate: taskStartDate ? new Date(taskStartDate) : undefined,
        estimatedMinutes: taskEstimatedMinutes ? parseInt(taskEstimatedMinutes) : undefined,
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={taskStatus}
                      onChange={e => setTaskStatus(e.target.value as TaskStatus)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="waiting">Waiting</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={taskPriority}
                      onChange={e => setTaskPriority(e.target.value as TaskPriority)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <select
                  value={selectedTaskList}
                  onChange={e => setSelectedTaskList(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">No List</option>
                  {taskLists.map(list => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowTaskModal(false)
                      resetTaskForm()
                    }}
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

        {/* Task Detail Panel */}
        {showTaskDetail && editingTask && (
          <div className="fixed inset-y-0 right-0 z-[110] w-full max-w-2xl bg-white shadow-2xl overflow-y-auto border-l border-gray-200">
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Task Details</h3>
                <button
                  onClick={handleCloseTaskDetail}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Task Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Task Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={taskDescription}
                  onChange={e => setTaskDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Add a description..."
                />
              </div>

              {/* Status & Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={taskStatus}
                    onChange={e => setTaskStatus(e.target.value as TaskStatus)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting">Waiting</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={e => setTaskPriority(e.target.value as TaskPriority)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <input
                    type="datetime-local"
                    value={taskStartDate}
                    onChange={e => setTaskStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                  <input
                    type="datetime-local"
                    value={taskDueDate}
                    onChange={e => setTaskDueDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Estimated Time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Time (minutes)</label>
                <input
                  type="number"
                  value={taskEstimatedMinutes}
                  onChange={e => setTaskEstimatedMinutes(e.target.value)}
                  min="0"
                  placeholder="e.g., 60"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Task List */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Task List</label>
                <select
                  value={selectedTaskList}
                  onChange={e => setSelectedTaskList(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">No List</option>
                  {taskLists.map(list => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
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
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Subtasks</label>
                {editingTask.subtasks && editingTask.subtasks.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {editingTask.subtasks.map(subtask => (
                      <div
                        key={subtask.id}
                        className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
                      >
                        <button
                          onClick={() => handleToggleSubtask(subtask.id, subtask.is_completed)}
                          className="flex-shrink-0"
                        >
                          {subtask.is_completed ? (
                            <CheckCircle2 size={18} className="text-green-600" />
                          ) : (
                            <Circle size={18} className="text-gray-400 hover:text-blue-600" />
                          )}
                        </button>
                        <span
                          className={`flex-1 text-sm ${
                            subtask.is_completed ? 'line-through text-gray-500' : 'text-gray-900'
                          }`}
                        >
                          {subtask.title}
                        </span>
                        <button
                          onClick={() => handleDeleteSubtask(subtask.id)}
                          className="p-1 rounded text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {editingTask.completion_percentage !== undefined && editingTask.subtasks && editingTask.subtasks.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                      <span>Progress</span>
                      <span className="font-medium">{editingTask.completion_percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
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
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleAddSubtask}
                    disabled={!newSubtaskTitle.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              {/* Time Tracking */}
              {editingTask.actual_minutes !== null && editingTask.actual_minutes > 0 && (
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-purple-900">Time Tracked</span>
                    <Timer size={16} className="text-purple-600" />
                  </div>
                  <div className="text-2xl font-bold text-purple-700">
                    {formatDuration(editingTask.actual_minutes)}
                  </div>
                  {editingTask.estimated_minutes && (
                    <div className="text-sm text-purple-600 mt-1">
                      Estimated: {formatDuration(editingTask.estimated_minutes)}
                    </div>
                  )}
                </div>
              )}

              {/* Metadata */}
              <div className="pt-4 border-t border-gray-200 space-y-2 text-sm text-gray-600">
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
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={handleCloseTaskDetail}
                  className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
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
