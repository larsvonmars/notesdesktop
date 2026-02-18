'use client'

import { useState, useEffect } from 'react'
import {
  CheckSquare,
  FileText,
  Clock,
  Star,
  Circle,
  CheckCircle2,
  AlertCircle,
  Calendar,
  PenTool,
  Network,
  MapPin,
  Grid3x3,
} from 'lucide-react'
import ModalCloseButton from './ModalCloseButton'
import { getTasks, type Task } from '@/lib/tasks'
import { getNotes, type Note } from '@/lib/notes'
import {
  getUpcomingTimetableEntries,
  extractTime,
  WEEKDAY_LABELS,
  jsDayToMondayIndex,
  type CalendarEvent,
} from '@/lib/events'
import { getProjects, type Project } from '@/lib/projects'

interface WelcomeBackModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectNote?: (note: Note) => void
  onSelectTask?: (task: Task) => void
  onOpenTimetable?: () => void
}

const noteTypeIcon = (type: string) => {
  switch (type) {
    case 'mindmap':
      return <Network size={16} className="text-green-500" />
    case 'drawing':
      return <PenTool size={16} className="text-purple-500" />
    default:
      return <FileText size={16} className="text-alpine-500" />
  }
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent':
      return 'text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
    case 'high':
      return 'text-orange-600 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800'
    case 'medium':
      return 'text-yellow-600 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-800'
    case 'low':
      return 'text-green-600 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800'
    default:
      return 'text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'
  }
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffInMs = now.getTime() - date.getTime()
  const diffInHours = diffInMs / (1000 * 60 * 60)
  const diffInDays = diffInHours / 24

  if (diffInHours < 1) {
    return 'Just now'
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)} hours ago`
  } else if (diffInDays < 7) {
    return `${Math.floor(diffInDays)} days ago`
  } else {
    return date.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })
  }
}

export default function WelcomeBackModal({
  isOpen,
  onClose,
  onSelectNote,
  onSelectTask,
  onOpenTimetable,
}: WelcomeBackModalProps) {
  const [openTasks, setOpenTasks] = useState<Task[]>([])
  const [recentNotes, setRecentNotes] = useState<Note[]>([])
  const [upcomingClasses, setUpcomingClasses] = useState<(CalendarEvent & { parentEntryId: string })[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Get open tasks (not completed, not cancelled, not archived)
      const tasks = await getTasks({
        includeArchived: false,
        includeCompleted: false,
      })
      
      // Sort by due date and priority
      const sortedTasks = tasks
        .sort((a, b) => {
          // First sort by due date (overdue first)
          if (a.due_date && b.due_date) {
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
          }
          if (a.due_date) return -1
          if (b.due_date) return 1
          
          // Then by priority
          const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
          return priorityOrder[a.priority] - priorityOrder[b.priority]
        })
        .slice(0, 5) // Show top 5 tasks

      setOpenTasks(sortedTasks)

      // Get recently updated notes
      const notes = await getNotes()
      const sortedNotes = notes
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 5) // Show top 5 recent notes

      setRecentNotes(sortedNotes)

      // Get upcoming timetable entries
      try {
        const [timetableData, projectsData] = await Promise.all([
          getUpcomingTimetableEntries(5),
          getProjects(),
        ])
        setUpcomingClasses(timetableData)
        setProjects(projectsData)
      } catch (err) {
        console.error('Error loading timetable data:', err)
      }
    } catch (error) {
      console.error('Error loading welcome back data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="flex w-full max-w-4xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-alpine-100 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-2xl sm:max-h-[calc(100vh-4rem)]">
        {/* Header */}
        <header className="flex flex-col gap-3 border-b border-alpine-100 dark:border-slate-700 bg-gradient-to-r from-alpine-50 to-peak-50 dark:from-slate-900 dark:to-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Welcome Back! 🏔️</h2>
            <p className="text-sm text-gray-600 dark:text-slate-300">Here&apos;s what you&apos;ve been working on</p>
          </div>
          <ModalCloseButton
            onClick={onClose}
            ariaLabel="Close welcome modal"
            className="self-end sm:self-auto bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
          />
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-alpine-600 border-r-transparent"></div>
                <p className="mt-3 text-sm text-gray-600 dark:text-slate-300">Loading your workspace...</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Upcoming Classes Section */}
              {upcomingClasses.length > 0 && (
                <section className="flex flex-col rounded-2xl border border-violet-100 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/20 lg:col-span-2">
                  <div className="flex items-center justify-between border-b border-violet-100 dark:border-violet-800/50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Grid3x3 size={18} className="text-violet-600" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Upcoming Classes</h3>
                    </div>
                    <button
                      onClick={onOpenTimetable}
                      className="rounded-full bg-violet-100 dark:bg-violet-900/50 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors"
                    >
                      View Timetable
                    </button>
                  </div>
                  <div className="flex-1 overflow-x-auto">
                    <div className="flex gap-3 p-4">
                      {upcomingClasses.map((entry) => {
                        const entryDate = new Date(entry.start_time)
                        const project = entry.project_id ? projects.find(p => p.id === entry.project_id) : undefined
                        const isToday = entryDate.toDateString() === new Date().toDateString()
                        const isTomorrow = entryDate.toDateString() === new Date(Date.now() + 86400000).toDateString()
                        const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : WEEKDAY_LABELS[jsDayToMondayIndex(entryDate.getDay())]
                        return (
                          <div
                            key={entry.id}
                            className="flex-shrink-0 w-48 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 hover:shadow-sm transition-shadow cursor-pointer"
                            style={{ borderLeft: `3px solid ${project?.color || entry.color || '#8B5CF6'}` }}
                            onClick={onOpenTimetable}
                          >
                            <div className="text-xs font-medium text-violet-600 mb-1">
                              {dayLabel} · {entryDate.toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                            </div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate mb-1">
                              {entry.title}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">
                              {extractTime(entry.start_time)} – {extractTime(entry.end_time)}
                            </div>
                            {project && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                                <span className="text-xs text-gray-600 dark:text-slate-300 truncate">{project.name}</span>
                              </div>
                            )}
                            {entry.location && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-slate-400">
                                <MapPin size={10} />
                                <span className="truncate">{entry.location}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </section>
              )}

              {/* Open Tasks Section */}
              <section className="flex flex-col rounded-2xl border border-alpine-100 dark:border-slate-700 bg-alpine-50/50 dark:bg-slate-800/40">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckSquare size={18} className="text-alpine-600" />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Open Tasks</h3>
                  </div>
                  <span className="rounded-full bg-alpine-100 dark:bg-alpine-900/50 px-2 py-0.5 text-xs font-medium text-alpine-700 dark:text-alpine-200">
                    {openTasks.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {openTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                      <CheckCircle2 size={32} className="text-green-500 mb-2" />
                      <p className="text-sm font-medium text-gray-700 dark:text-slate-200">All caught up!</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">You have no open tasks</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200 dark:divide-slate-700">
                      {openTasks.map((task) => {
                        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'
                        return (
                          <li
                            key={task.id}
                            className="px-4 py-3 hover:bg-white/50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                            onClick={() => onSelectTask?.(task)}
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5">
                                {task.status === 'completed' ? (
                                  <CheckCircle2 size={18} className="text-green-600" />
                                ) : task.status === 'in_progress' ? (
                                  <Circle size={18} className="text-alpine-600 fill-alpine-600" />
                                ) : (
                                  <Circle size={18} className="text-gray-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                                  {task.title}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                    {task.priority}
                                  </span>
                                  {task.due_date && (
                                    <span className={`inline-flex items-center gap-1 text-xs ${isOverdue ? 'text-red-600 dark:text-red-300 font-medium' : 'text-gray-600 dark:text-slate-300'}`}>
                                      <Calendar size={12} />
                                      {isOverdue && <AlertCircle size={12} />}
                                      {new Date(task.due_date).toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                  {task.is_starred && (
                                    <Star size={12} className="text-yellow-500 fill-yellow-500" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </section>

              {/* Recent Notes Section */}
              <section className="flex flex-col rounded-2xl border border-peak-100 dark:border-slate-700 bg-peak-50/50 dark:bg-slate-800/40">
                <div className="flex items-center justify-between border-b border-peak-100 dark:border-slate-700 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-peak-600" />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Recent Notes</h3>
                  </div>
                  <span className="rounded-full bg-peak-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium text-peak-700 dark:text-slate-200">
                    {recentNotes.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {recentNotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                      <FileText size={32} className="text-gray-400 mb-2" />
                      <p className="text-sm font-medium text-gray-700 dark:text-slate-200">No notes yet</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Create your first note to get started</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200 dark:divide-slate-700">
                      {recentNotes.map((note) => (
                        <li
                          key={note.id}
                          className="px-4 py-3 hover:bg-white/50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                          onClick={() => onSelectNote?.(note)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {noteTypeIcon(note.note_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                                {note.title || 'Untitled'}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-slate-400">
                                <Clock size={12} />
                                <span>{formatDate(note.updated_at)}</span>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-alpine-100 dark:border-slate-700 px-4 py-3 sm:px-6 bg-gray-50/30 dark:bg-slate-800/40">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg bg-alpine-600 px-4 py-2 text-sm font-medium text-white hover:bg-alpine-700 transition-colors shadow-sm"
            >
              Get Started 🏔️
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
