'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpDown,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  Plus,
  Rows2,
  Rows3,
  X,
} from 'lucide-react'
import type { NoteSummary } from '@/lib/notes'
import { formatModShortcut } from '@/lib/platform'
import type {
  NoteListDensity,
  NoteListFolderRef,
  NoteListProjectRef,
  NoteListSort,
} from './types'
import { getNoteTypeVisual } from './note-type-icons'
import {
  cn,
  formatRelativeTime,
  getNoteLocationLabel,
  groupNotesByRecency,
} from './utils'

export interface NoteListPaneProps {
  /** Notes for the current scope (folder/project/library). Grouped internally. */
  notes: NoteSummary[]
  /** Scope title, e.g. "All notes", a folder or a project name. */
  title: string
  subtitle?: string
  isLoading?: boolean
  selectedNoteId?: string | null
  /** Folder metadata used to resolve each note's "project / folder" label. */
  folders?: NoteListFolderRef[]
  projects?: NoteListProjectRef[]
  /** Controlled sort. Omit to let the pane manage it internally. */
  sort?: NoteListSort
  onSortChange?: (sort: NoteListSort) => void
  /** Controlled density. Omit to let the pane manage it internally. */
  density?: NoteListDensity
  onDensityChange?: (density: NoteListDensity) => void
  onSelectNote: (note: NoteSummary) => void
  onNewNote?: () => void
  /** Mobile only: closes the list and returns to the editor. */
  onClose?: () => void
  className?: string
}

const SORT_OPTIONS: ReadonlyArray<{
  value: NoteListSort
  label: string
  icon: typeof Clock3
}> = [
  { value: 'updated', label: 'Last updated', icon: Clock3 },
  { value: 'created', label: 'Date created', icon: CalendarDays },
  { value: 'title', label: 'Title A–Z', icon: ArrowUpDown },
]

/**
 * 328px note list for the current scope.
 *
 * Grouped Today / Yesterday / Previous 7 days / Older (flat for title sort),
 * with a sort menu, density toggle, roving arrow-key focus and skeleton +
 * empty states. Purely presentational: the caller owns notes and selection.
 */
export default function NoteListPane({
  notes,
  title,
  subtitle,
  isLoading = false,
  selectedNoteId,
  folders,
  projects,
  sort,
  onSortChange,
  density,
  onDensityChange,
  onSelectNote,
  onNewNote,
  onClose,
  className = '',
}: NoteListPaneProps) {
  const [internalSort, setInternalSort] = useState<NoteListSort>('updated')
  const [internalDensity, setInternalDensity] = useState<NoteListDensity>('comfortable')
  const [sortOpen, setSortOpen] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const sortTriggerRef = useRef<HTMLButtonElement | null>(null)

  const activeSort = sort ?? internalSort
  const activeDensity = density ?? internalDensity
  const compact = activeDensity === 'compact'

  const groups = useMemo(
    () => groupNotesByRecency(notes, activeSort),
    [notes, activeSort]
  )
  const flatNotes = useMemo(() => groups.flatMap((group) => group.notes), [groups])
  const selectedInList = Boolean(
    selectedNoteId && flatNotes.some((note) => note.id === selectedNoteId)
  )
  const tabStopId = selectedInList ? selectedNoteId : flatNotes[0]?.id

  const activeSortOption =
    SORT_OPTIONS.find((option) => option.value === activeSort) ?? SORT_OPTIONS[0]

  useEffect(() => {
    if (!sortOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-note-list-popover], [data-note-list-trigger]')) return
      setSortOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSortOpen(false)
      sortTriggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [sortOpen])

  const changeSort = (next: NoteListSort) => {
    if (sort === undefined) setInternalSort(next)
    onSortChange?.(next)
    setSortOpen(false)
  }

  const toggleDensity = () => {
    const next: NoteListDensity = compact ? 'comfortable' : 'compact'
    if (density === undefined) setInternalDensity(next)
    onDensityChange?.(next)
  }

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[data-note-row]') ?? []
    )
    if (rows.length === 0) return

    const currentIndex = rows.indexOf(document.activeElement as HTMLButtonElement)
    let nextIndex = currentIndex

    if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : Math.min(rows.length - 1, currentIndex + 1)
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex < 0 ? 0 : Math.max(0, currentIndex - 1)
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = rows.length - 1
    }

    event.preventDefault()
    rows[nextIndex]?.focus()
  }

  return (
    <aside
      aria-label={`Notes in ${title}`}
      aria-busy={isLoading || undefined}
      className={cn(
        'flex h-full w-full shrink-0 flex-col overflow-hidden md:w-[var(--list-width,328px)] md:border-r md:border-border',
        className
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-1.5 px-3 pb-2 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <h2 className="truncate font-display text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {title}
            </h2>
            {!isLoading ? (
              <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
                {notes.length}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-0.5 truncate text-[11px] text-muted">{subtitle}</p> : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {onNewNote ? (
            <button
              type="button"
              onClick={onNewNote}
              className="glass-btn-ghost focus-ring h-8 w-8"
              aria-label={`New note (${formatModShortcut('N')})`}
              title={`New note (${formatModShortcut('N')})`}
            >
              <Plus className="h-[17px] w-[17px]" aria-hidden="true" />
            </button>
          ) : null}

          <div className="relative">
            <button
              ref={sortTriggerRef}
              type="button"
              data-note-list-trigger="sort"
              onClick={() => setSortOpen((open) => !open)}
              className="glass-btn-ghost focus-ring h-8 w-8"
              aria-label={`Sort notes: ${activeSortOption.label}`}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              title={`Sort: ${activeSortOption.label}`}
            >
              <ArrowUpDown className="h-[15px] w-[15px]" aria-hidden="true" />
            </button>

            {sortOpen ? (
              <div
                data-note-list-popover="sort"
                role="menu"
                aria-label="Sort notes"
                className="glass-popover animate-rise-in absolute right-0 top-[calc(100%+6px)] z-40 w-48 p-1.5"
              >
                {SORT_OPTIONS.map((option) => {
                  const OptionIcon = option.icon
                  const selected = option.value === activeSort
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      className={cn(
                        'glass-row focus-ring items-center gap-2.5 px-2 py-1.5 text-[12px] font-medium',
                        selected ? 'text-accent' : 'text-foreground'
                      )}
                      onClick={() => changeSort(option.value)}
                    >
                      <OptionIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="flex-1 text-left">{option.label}</span>
                      {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={toggleDensity}
            className="glass-btn-ghost focus-ring h-8 w-8"
            aria-label={
              compact
                ? 'Switch to comfortable list density'
                : 'Switch to compact list density'
            }
            aria-pressed={compact}
            title={compact ? 'Comfortable density' : 'Compact density'}
          >
            {compact ? (
              <Rows2 className="h-[15px] w-[15px]" aria-hidden="true" />
            ) : (
              <Rows3 className="h-[15px] w-[15px]" aria-hidden="true" />
            )}
          </button>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="glass-btn-ghost focus-ring h-8 w-8 md:hidden"
              aria-label="Close note list"
              title="Close note list"
            >
              <X className="h-[17px] w-[17px]" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-3 h-px shrink-0 bg-border" aria-hidden="true" />

      {isLoading ? (
        <div className="min-h-0 flex-1 overflow-hidden px-1 pt-2" aria-hidden="true">
          <ul className="space-y-1">
            {Array.from({ length: 9 }).map((_, index) => (
              <li key={index} className="flex items-center gap-3 px-2 py-2">
                <div className="skeleton-shimmer h-8 w-8 shrink-0 rounded-[10px]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div
                    className="skeleton-shimmer h-2.5 rounded-full"
                    style={{ width: `${52 + ((index * 13) % 36)}%` }}
                  />
                  <div className="skeleton-shimmer h-2 w-1/3 rounded-full opacity-70" />
                </div>
              </li>
            ))}
          </ul>
          <span className="sr-only">Loading notes…</span>
        </div>
      ) : flatNotes.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <span
              className="absolute inset-0 rounded-2xl bg-accent-light blur-md"
              aria-hidden="true"
            />
            <span className="glass flex h-14 w-14 items-center justify-center rounded-2xl">
              <FileText className="h-6 w-6 text-accent" strokeWidth={1.6} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-4 font-display text-[15px] font-semibold text-foreground">
            No notes yet
          </p>
          <p className="mt-1 max-w-[230px] text-xs leading-5 text-muted">
            Notes you create in this view will appear here, newest first.
          </p>
          {onNewNote ? (
            <button
              type="button"
              onClick={onNewNote}
              className="glass-btn-primary focus-ring mt-4 h-8 px-3"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              New note
            </button>
          ) : null}
        </div>
      ) : (
        <div
          ref={listRef}
          onKeyDown={handleListKeyDown}
          className="min-h-0 flex-1 overflow-y-auto scroll-thin px-2 pb-24 pt-1 md:pb-6"
        >
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`note-group-${group.id}`}>
              <h3
                id={`note-group-${group.id}`}
                className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--border)] px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted backdrop-blur-md"
                style={{ backgroundColor: 'color-mix(in srgb, var(--background) 86%, transparent)' }}
              >
                <span>{group.label}</span>
                <span className="font-medium tabular-nums tracking-normal text-muted opacity-70">
                  {group.notes.length}
                </span>
              </h3>
              <ul className="space-y-0.5 pb-1">
                {group.notes.map((note) => {
                  const visual = getNoteTypeVisual(note.note_type)
                  const TypeIcon = visual.icon
                  const selected = note.id === selectedNoteId
                  const location = getNoteLocationLabel(note, folders, projects)
                  return (
                    <li key={note.id}>
                      <button
                        type="button"
                        data-note-row=""
                        data-note-id={note.id}
                        onClick={() => onSelectNote(note)}
                        aria-current={selected ? 'page' : undefined}
                        tabIndex={note.id === tabStopId ? 0 : -1}
                        title={note.title || 'Untitled note'}
                        className={cn(
                          'glass-row group items-center',
                          compact ? 'gap-2.5 px-2 py-1.5' : 'gap-2.5 px-2 py-2.5',
                          selected && 'bg-accent-light'
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex shrink-0 items-center justify-center rounded-[9px] ring-1 ring-inset',
                            compact ? 'h-7 w-7' : 'h-8 w-8',
                            visual.tileClassName
                          )}
                        >
                          <TypeIcon
                            className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4', visual.iconClassName)}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium leading-5 text-foreground">
                            {note.title || 'Untitled'}
                          </span>
                          <span className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-muted">
                            <span className="shrink-0 tabular-nums">
                              {formatRelativeTime(note.updated_at)}
                            </span>
                            <span aria-hidden="true" className="opacity-50">
                              ·
                            </span>
                            <span className="truncate">{location}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  )
}
