'use client'

import { Plus, Search, Sparkles } from 'lucide-react'
import type { NoteSummary, NoteType } from '@/lib/notes'
import { formatModShortcut } from '@/lib/platform'
import { getNoteTypeVisual, getOrderedNoteTypeVisuals } from './note-type-icons'
import { cn, formatRelativeTime } from './utils'

export interface EmptyEditorPaneProps {
  /** Called with no type to open the note-type picker, or a concrete type. */
  onCreateNote?: (type?: NoteType) => void
  /** Shown under the quick-create chips; caller supplies recently opened notes. */
  recentNotes?: NoteSummary[]
  onSelectNote?: (note: NoteSummary) => void
  onOpenSearch?: () => void
  searchShortcut?: string
  /** Optional custom headline (defaults to the gradient hero copy). */
  title?: string
  description?: string
  className?: string
}

/**
 * Hero empty state for the editor area when no note is open.
 *
 * Gradient glyph, gradient headline, quick-create chips, keyboard hints and a
 * compact recent-notes list. Nothing here fetches data.
 */
export default function EmptyEditorPane({
  onCreateNote,
  recentNotes,
  onSelectNote,
  onOpenSearch,
  searchShortcut,
  title,
  description,
  className = '',
}: EmptyEditorPaneProps) {
  const noteTypes = getOrderedNoteTypeVisuals()
  const modK = searchShortcut ?? formatModShortcut('K')
  const modN = formatModShortcut('N')
  const modSlash = formatModShortcut('\\')
  const recent = (recentNotes ?? []).slice(0, 5)
  const decorationOffset = noteTypes.slice(1, 3)

  const defaultTitle = (
    <>
      Your next idea <span className="text-gradient">starts here</span>
    </>
  )

  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center overflow-y-auto scroll-thin px-5 pb-28 pt-10 md:pb-10',
        className
      )}
    >
      <div className="animate-rise-in w-full max-w-md">
        {/* Gradient glyph with floating type tiles */}
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-[28px] bg-accent-light blur-2xl"
          />
          <span
            aria-hidden="true"
            className="absolute -inset-4 rounded-full border border-accent-light"
          />
          <span className="glass-card relative flex h-16 w-16 items-center justify-center rounded-[22px]">
            <Sparkles className="h-7 w-7 text-accent" strokeWidth={1.5} aria-hidden="true" />
          </span>

          {decorationOffset.map((visual, index) => {
            const DecorationIcon = visual.icon
            return (
              <span
                key={visual.type}
                aria-hidden="true"
                className={cn(
                  'glass absolute hidden h-9 w-9 items-center justify-center rounded-xl sm:flex',
                  index === 0 ? '-left-12 top-0 -rotate-12' : '-right-12 bottom-0 rotate-12',
                  'motion-safe:animate-float'
                )}
                style={{ animationDelay: index === 0 ? '0s' : '1.4s' }}
              >
                <DecorationIcon className={cn('h-4 w-4', visual.iconClassName)} />
              </span>
            )
          })}
        </div>

        <h1 className="mt-7 text-center font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-[34px]">
          {title ?? defaultTitle}
        </h1>
        <p className="mx-auto mt-2.5 max-w-sm text-center text-sm leading-6 text-muted">
          {description ??
            'Capture a thought, sketch a map, or pick up where you left off. Everything stays in your workspace.'}
        </p>

        {onCreateNote ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => onCreateNote()}
              className="glass-btn-primary focus-ring h-10 px-5 text-sm"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New note
              <span className="kbd ml-1 hidden border-transparent bg-transparent text-current opacity-80 sm:inline-flex">
                {modN}
              </span>
            </button>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {noteTypes.map((visual) => {
                const ChipIcon = visual.icon
                return (
                  <button
                    key={visual.type}
                    type="button"
                    onClick={() => onCreateNote(visual.type)}
                    className="glass-btn focus-ring h-8 gap-1.5 px-2.5 text-xs"
                    title={`New ${visual.label.toLowerCase()}`}
                  >
                    <ChipIcon
                      className={cn('h-3.5 w-3.5', visual.iconClassName)}
                      aria-hidden="true"
                    />
                    {visual.label}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* Keyboard hints */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-medium text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="kbd">{modK}</span>
            Search
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="kbd">{modN}</span>
            New note
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="kbd">{modSlash}</span>
            Toggle library
          </span>
        </div>

        {recent.length > 0 ? (
          <section className="mt-8" aria-labelledby="empty-editor-recent">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2
                id="empty-editor-recent"
                className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted"
              >
                Recently opened
              </h2>
              {onOpenSearch ? (
                <button
                  type="button"
                  onClick={onOpenSearch}
                  className="focus-ring flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-accent transition-opacity hover:opacity-80"
                >
                  <Search className="h-3 w-3" aria-hidden="true" />
                  Search all notes
                </button>
              ) : null}
            </div>

            <ul className="space-y-1">
              {recent.map((note) => {
                const visual = getNoteTypeVisual(note.note_type)
                const NoteIcon = visual.icon
                const content = (
                  <>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ring-1 ring-inset',
                        visual.tileClassName
                      )}
                    >
                      <NoteIcon className={cn('h-4 w-4', visual.iconClassName)} />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[13px] font-medium leading-5 text-foreground">
                        {note.title || 'Untitled'}
                      </span>
                      <span className="block truncate text-[11px] leading-4 text-muted">
                        {formatRelativeTime(note.updated_at)} · {visual.label}
                      </span>
                    </span>
                  </>
                )
                return (
                  <li key={note.id}>
                    {onSelectNote ? (
                      <button
                        type="button"
                        onClick={() => onSelectNote(note)}
                        className="glass-row focus-ring items-center gap-2.5 px-2 py-1.5"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="glass-row items-center gap-2.5 px-2 py-1.5">{content}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
