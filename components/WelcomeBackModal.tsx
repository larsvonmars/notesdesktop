'use client'

import { useState, useEffect } from 'react'
import {
  X,
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
} from 'lucide-react'
import { getTasks, type Task } from '@/lib/tasks'
import { getNotes, type Note } from '@/lib/notes'

interface WelcomeBackModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectNote?: (note: Note) => void
  onSelectTask?: (task: Task) => void
}

const noteTypeIcon = (type: string) => {
  switch (type) {
    case 'mindmap':
      return <Network size={16} className="text-green-500" />
    case 'drawing':
      return <PenTool size={16} className="text-purple-500" />
    default:
      return <FileText size={16} className="text-blue-500" />
  }
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent':
      return 'text-red-600 bg-red-50 border-red-200'
    case 'high':
      return 'text-orange-600 bg-orange-50 border-orange-200'
    case 'medium':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case 'low':
      return 'text-green-600 bg-green-50 border-green-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
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
}: WelcomeBackModalProps) {
  const [openTasks, setOpenTasks] = useState<Task[]>([])
  const [recentNotes, setRecentNotes] = useState<Note[]>([])
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
    } catch (error) {
      console.error('Error loading welcome back data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 sm:p-6">
      <div className="flex w-full max-w-4xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:max-h-[calc(100vh-4rem)]">
        {/* Header */}
        <header className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold text-gray-900">Welcome Back! 👋</h2>
            <p className="text-sm text-gray-600">Here&apos;s what you&apos;ve been working on</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
          >
            <X size={16} />
            Close
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
                <p className="mt-3 text-sm text-gray-600">Loading your workspace...</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Open Tasks Section */}
              <section className="flex flex-col rounded-2xl border border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckSquare size={18} className="text-blue-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Open Tasks</h3>
                  </div>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {openTasks.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {openTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                      <CheckCircle2 size={32} className="text-green-500 mb-2" />
                      <p className="text-sm font-medium text-gray-700">All caught up!</p>
                      <p className="text-xs text-gray-500 mt-1">You have no open tasks</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200">
                      {openTasks.map((task) => {
                        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'
                        return (
                          <li
                            key={task.id}
                            className="px-4 py-3 hover:bg-white/50 cursor-pointer transition-colors"
                            onClick={() => onSelectTask?.(task)}
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5">
                                {task.status === 'completed' ? (
                                  <CheckCircle2 size={18} className="text-green-600" />
                                ) : task.status === 'in_progress' ? (
                                  <Circle size={18} className="text-blue-600 fill-blue-600" />
                                ) : (
                                  <Circle size={18} className="text-gray-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {task.title}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                    {task.priority}
                                  </span>
                                  {task.due_date && (
                                    <span className={`inline-flex items-center gap-1 text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
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
              <section className="flex flex-col rounded-2xl border border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-purple-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Recent Notes</h3>
                  </div>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                    {recentNotes.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {recentNotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                      <FileText size={32} className="text-gray-400 mb-2" />
                      <p className="text-sm font-medium text-gray-700">No notes yet</p>
                      <p className="text-xs text-gray-500 mt-1">Create your first note to get started</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200">
                      {recentNotes.map((note) => (
                        <li
                          key={note.id}
                          className="px-4 py-3 hover:bg-white/50 cursor-pointer transition-colors"
                          onClick={() => onSelectNote?.(note)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {noteTypeIcon(note.note_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {note.title || 'Untitled'}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
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
        <footer className="border-t border-gray-200 px-4 py-3 sm:px-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Get Started
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
