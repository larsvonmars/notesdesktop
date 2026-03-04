'use client'

import { useState, useEffect } from 'react'
import { FileText, Clock, PenTool, Network, BookOpen, Table2, FilePenLine, type LucideIcon } from 'lucide-react'
import ModalCloseButton from './ModalCloseButton'
import { getNotes, type Note, type NoteType } from '@/lib/notes'
import { getNoteTypePresentation, type NoteTypeIconKey } from '@/lib/note-types'

interface WelcomeBackModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectNote?: (note: Note) => void
  asView?: boolean
}

const NOTE_TYPE_ICON_MAP: Record<NoteTypeIconKey, LucideIcon> = {
  'file-text': FileText,
  'pen-tool': PenTool,
  network: Network,
  'book-open': BookOpen,
  'table-2': Table2,
  'file-pen-line': FilePenLine,
}

const noteTypeIcon = (type: NoteType) => {
  const presentation = getNoteTypePresentation(type)
  const Icon = NOTE_TYPE_ICON_MAP[presentation.iconKey]
  return <Icon size={16} className={presentation.iconClassName} />
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
  asView = false,
}: WelcomeBackModalProps) {
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
      const notes = await getNotes()
      const sortedNotes = notes
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 8)

      setRecentNotes(sortedNotes)
    } catch (error) {
      console.error('Error loading welcome back data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen && !asView) return null

  return (
    <div className={asView ? 'h-full w-full' : 'fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6'}>
      <div
        className={
          asView
            ? 'flex h-full w-full flex-col overflow-hidden border border-alpine-100 bg-white dark:border-slate-700 dark:bg-slate-900'
            : 'flex w-full max-w-4xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-alpine-100 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-2xl sm:max-h-[calc(100vh-4rem)]'
        }
      >
        <header className="flex flex-col gap-3 border-b border-alpine-100 dark:border-slate-700 bg-gradient-to-r from-alpine-50 to-peak-50 dark:from-slate-900 dark:to-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Welcome Back! 🏔️</h2>
            <p className="text-sm text-gray-600 dark:text-slate-300">Pick up where you left off</p>
          </div>
          <ModalCloseButton
            onClick={onClose}
            ariaLabel="Close welcome modal"
            className="self-end sm:self-auto bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
          />
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-alpine-600 border-r-transparent"></div>
                <p className="mt-3 text-sm text-gray-600 dark:text-slate-300">Loading your workspace...</p>
              </div>
            </div>
          ) : (
            <section className="flex flex-col rounded-2xl border border-peak-100 dark:border-slate-700 bg-peak-50/50 dark:bg-slate-800/40 h-full">
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
          )}
        </div>

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
