'use client'

import { useState, useEffect } from 'react'
import {
  FileText, Clock, PenTool, Network, BookOpen, Table2, FilePenLine,
  Zap, ArrowRight, type LucideIcon,
} from 'lucide-react'
import ModalCloseButton from './ModalCloseButton'
import BaseModal from './BaseModal'
import { getNotes, type Note, type NoteType } from '@/lib/notes'
import { getNoteTypePresentation, type NoteTypeIconKey } from '@/lib/note-types'

interface WelcomeBackModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectNote?: (note: Note) => void
  onCreateNote?: (type: NoteType) => void
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

const ALL_NOTE_TYPES: NoteType[] = [
  'rich-text', 'drawing', 'mindmap', 'bullet-journal', 'data-sheet', 'pdf-annotation',
]

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
  const diffInDays = diffInHours / 24
  if (diffInHours < 1) return 'Just now'
  if (diffInHours < 24) return `${Math.floor(diffInHours)}h ago`
  if (diffInDays < 7) return `${Math.floor(diffInDays)}d ago`
  return date.toLocaleDateString('default', { month: 'short', day: 'numeric' })
}

const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good morning', emoji: '☀️' }
  if (h < 17) return { text: 'Good afternoon', emoji: '🌤️' }
  return { text: 'Good evening', emoji: '🌙' }
}

const getDateLabel = () =>
  new Date().toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="h-8 w-8 rounded-lg bg-surface-hover animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-3/5 rounded bg-surface-hover animate-pulse" />
        <div className="h-2.5 w-1/4 rounded bg-surface-hover animate-pulse" />
      </div>
    </div>
  )
}

export default function WelcomeBackModal({
  isOpen,
  onClose,
  onSelectNote,
  onCreateNote,
  asView = false,
}: WelcomeBackModalProps) {
  const [recentNotes, setRecentNotes] = useState<Note[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const greeting = getGreeting()

  useEffect(() => {
    if (isOpen || asView) loadData()
  }, [isOpen, asView])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const notes = await getNotes()
      setRecentNotes(
        notes
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, 10),
      )
    } catch (error) {
      console.error('Error loading welcome back data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen && !asView) return null

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      maxHeight="calc(100vh - 4rem)"
      zIndex={100}
      asView={asView}
      className={asView ? '' : 'border-border bg-surface '}
    >

        {/* ── Hero header ──────────────────────────────────────────────── */}
        <header className="relative overflow-hidden shrink-0 border-b border-border bg-gradient-to-br from-alpine-600 via-alpine-500 to-peak-500 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 px-6 py-6 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -top-8 -right-8 h-40 w-40 rounded-full bg-white blur-2xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-48 rounded-full bg-peak-400/20 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-white/60 mb-1">{getDateLabel()}</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                {greeting.text} {greeting.emoji}
              </h1>
              <p className="mt-1.5 text-sm text-white/70">Pick up where you left off</p>
            </div>
            {!asView && (
              <ModalCloseButton
                onClick={onClose}
                ariaLabel="Close welcome modal"
                className="shrink-0 bg-white hover:bg-white text-white border-white/20"
              />
            )}
          </div>
        </header>

        {/* ── Dashboard body ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] divide-y lg:divide-y-0 lg:divide-x divide-border overflow-hidden">

            {/* ── Quick Actions panel ──────────────────────────────────── */}
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border shrink-0">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-alpine-100 dark:bg-alpine-900/40">
                  <Zap size={13} className="text-alpine-600 dark:text-alpine-400" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Quick Start</span>
              </div>
              <div className="flex-1 p-4 overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {ALL_NOTE_TYPES.map((type) => {
                    const p = getNoteTypePresentation(type)
                    const Icon = NOTE_TYPE_ICON_MAP[p.iconKey]
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          onCreateNote?.(type)
                          onClose()
                        }}
                        className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-alpine-400/60 hover:bg-alpine-50 dark:hover:bg-alpine-900/20 active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alpine-500"
                      >
                        <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${p.iconBgClassName}`}>
                          <Icon size={15} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground leading-tight">{p.label}</p>
                          <p className="text-[10px] text-muted mt-0.5 leading-snug line-clamp-2">{p.description}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── Recent Notes panel ───────────────────────────────────── */}
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-peak-100 dark:bg-peak-900/40">
                    <Clock size={13} className="text-peak-600 dark:text-peak-400" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Recent Notes</span>
                </div>
                {!isLoading && (
                  <span className="rounded-full bg-surface-active px-2 py-0.5 text-[10px] font-semibold text-muted tabular-nums">
                    {recentNotes.length}
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="divide-y divide-border">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
                  </div>
                ) : recentNotes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
                    <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-surface-hover mb-4">
                      <FileText size={26} className="text-muted" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">No notes yet</p>
                    <p className="text-xs text-muted mt-1">Create your first note using Quick Start</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {recentNotes.map((note) => {
                      const p = getNoteTypePresentation(note.note_type)
                      const Icon = NOTE_TYPE_ICON_MAP[p.iconKey]
                      return (
                        <li
                          key={note.id}
                          className="group flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-surface-hover"
                          onClick={() => onSelectNote?.(note)}
                        >
                          <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${p.iconBgClassName}`}>
                            <Icon size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate leading-tight">
                              {note.title || 'Untitled'}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-muted">{p.label}</span>
                              <span className="text-[10px] text-muted/50">·</span>
                              <span className="text-[10px] text-muted">{formatDate(note.updated_at)}</span>
                            </div>
                          </div>
                          <ArrowRight
                            size={13}
                            className="text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {asView && (
                <div className="shrink-0 border-t border-border px-5 py-3 bg-surface-hover/50">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-alpine-600 hover:bg-alpine-700 active:bg-alpine-800 px-4 py-2 text-sm font-semibold text-white transition-colors shadow-sm"
                  >
                    Open Workspace
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

    </BaseModal>
  )
}
