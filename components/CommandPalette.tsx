'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  CornerDownLeft,
  FilePenLine,
  FileText,
  FolderOpen,
  Home,
  Keyboard,
  LayoutDashboard,
  ListTodo,
  Loader2,
  Network,
  PenTool,
  Search,
  Settings,
  Table2,
  type LucideIcon,
} from 'lucide-react'
import type { NoteSummary, NoteType } from '@/lib/notes'
import type { FolderNode } from '@/lib/folders'
import type { Project } from '@/lib/projects'
import {
  getNoteTypePresentation,
  getOrderedNoteTypePresentations,
  type NoteTypeIconKey,
} from '@/lib/note-types'
import { flattenFolderTree, matchesPaletteQuery } from '@/lib/workspace/palette-search'
import { formatModShortcut } from '@/lib/platform'

const NOTE_TYPE_ICON_MAP: Record<NoteTypeIconKey, LucideIcon> = {
  'file-text': FileText,
  'pen-tool': PenTool,
  network: Network,
  'book-open': BookOpen,
  'table-2': Table2,
  'file-pen-line': FilePenLine,
}

interface PaletteItem {
  key: string
  label: string
  hint?: string
  icon: LucideIcon
  iconClass?: string
  run: () => void
}

interface PaletteGroup {
  title: string
  items: PaletteItem[]
}

export interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  notes: NoteSummary[]
  folders: FolderNode[]
  projects: Project[]
  onSelectNote: (note: NoteSummary) => void
  /** Full-text search (title + body) handled by the data layer. */
  onSearchNotes: (query: string) => Promise<NoteSummary[]>
  onSelectFolder: (folderId: string | null) => void
  onOpenProject: (projectId: string) => void
  onCreateNote: (type: NoteType) => void
  onOpenHome: () => void
  onOpenTasks: () => void
  onOpenFiles: () => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
}

const MAX_IDLE_NOTES = 5
const MAX_IDLE_FOLDERS = 5
const MAX_IDLE_PROJECTS = 5
const MAX_MATCHES = 8

export default function CommandPalette({
  isOpen,
  onClose,
  notes,
  folders,
  projects,
  onSelectNote,
  onSearchNotes,
  onSelectFolder,
  onOpenProject,
  onCreateNote,
  onOpenHome,
  onOpenTasks,
  onOpenFiles,
  onOpenSettings,
  onOpenShortcuts,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [contentMatches, setContentMatches] = useState<NoteSummary[]>([])
  const [isSearchingContent, setIsSearchingContent] = useState(false)

  // Notes can match on body text too; that lives in the data layer, so ask it
  // (debounced) instead of filtering `notes` alone.
  useEffect(() => {
    const term = query.trim()
    let cancelled = false

    const timer = window.setTimeout(() => {
      if (cancelled) return

      if (term.length < 2) {
        setContentMatches([])
        setIsSearchingContent(false)
        return
      }

      setIsSearchingContent(true)
      onSearchNotes(term)
        .then((results) => {
          if (!cancelled) setContentMatches(results)
        })
        .catch(() => {
          if (!cancelled) setContentMatches([])
        })
        .finally(() => {
          if (!cancelled) setIsSearchingContent(false)
        })
    }, term.length < 2 ? 0 : 200)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, onSearchNotes])

  const groups = useMemo<PaletteGroup[]>(() => {
    const normalized = query.trim().toLowerCase()
    const limit = (items: PaletteItem[], idle: number) =>
      items.slice(0, normalized ? MAX_MATCHES : idle)

    const toNoteItem = (note: NoteSummary): PaletteItem => {
      const presentation = getNoteTypePresentation(note.note_type)
      return {
        key: `note-${note.id}`,
        label: note.title || 'Untitled',
        hint: presentation.label,
        icon: NOTE_TYPE_ICON_MAP[presentation.iconKey],
        iconClass: presentation.iconClassName,
        run: () => onSelectNote(note),
      }
    }

    const noteItems: PaletteItem[] = normalized
      ? (() => {
          const contentIds = new Set(contentMatches.map((note) => note.id))
          const localMatches = notes
            .filter((note) => !contentIds.has(note.id))
            .filter((note) =>
              matchesPaletteQuery(
                note.title || 'Untitled',
                getNoteTypePresentation(note.note_type).label,
                query
              )
            )
          return [...contentMatches, ...localMatches]
            .slice(0, MAX_MATCHES)
            .map(toNoteItem)
        })()
      : [...notes]
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, MAX_IDLE_NOTES)
          .map(toNoteItem)

    const folderItems: PaletteItem[] = flattenFolderTree(folders)
      .filter((folder) => matchesPaletteQuery(folder.name, folder.path, query))
      .map((folder) => ({
        key: `folder-${folder.id}`,
        label: folder.name,
        hint: folder.path.includes(' / ') ? folder.path : 'Folder',
        icon: FolderOpen,
        run: () => onSelectFolder(folder.id),
      }))

    const projectItems: PaletteItem[] = projects
      .filter((project) => matchesPaletteQuery(project.name, 'Project', query))
      .map((project) => ({
        key: `project-${project.id}`,
        label: project.name,
        hint: 'Project',
        icon: LayoutDashboard,
        run: () => onOpenProject(project.id),
      }))

    const createItems: PaletteItem[] = getOrderedNoteTypePresentations()
      .map((presentation) => ({
        key: `create-${presentation.id}`,
        label: `New ${presentation.pickerLabel || presentation.label}`,
        hint: presentation.description,
        icon: NOTE_TYPE_ICON_MAP[presentation.iconKey],
        iconClass: presentation.iconClassName,
        run: () => onCreateNote(presentation.id),
      }))
      .filter((item) => matchesPaletteQuery(item.label, item.hint, query))

    const navigateItems: PaletteItem[] = [
      { key: 'nav-home', label: 'Go to Home', hint: 'Recent notes and quick actions', icon: Home, run: onOpenHome },
      { key: 'nav-tasks', label: 'Open Tasks & Agenda', hint: 'Plan tasks and upcoming events', icon: ListTodo, run: onOpenTasks },
      { key: 'nav-files', label: 'Open File Explorer', hint: 'Browse files', icon: FolderOpen, run: onOpenFiles },
      { key: 'nav-settings', label: 'Open Settings', hint: 'Account, appearance, startup', icon: Settings, run: onOpenSettings },
      { key: 'nav-shortcuts', label: 'Keyboard shortcuts', hint: 'Reference for formatting and navigation', icon: Keyboard, run: onOpenShortcuts },
    ].filter((item) => matchesPaletteQuery(item.label, item.hint, query))

    return [
      { title: 'Notes', items: limit(noteItems, MAX_IDLE_NOTES) },
      { title: 'Folders', items: limit(folderItems, MAX_IDLE_FOLDERS) },
      { title: 'Projects', items: limit(projectItems, MAX_IDLE_PROJECTS) },
      { title: 'Create', items: createItems },
      { title: 'Navigate', items: navigateItems },
    ].filter((group) => group.items.length > 0)
  }, [
    query,
    notes,
    contentMatches,
    folders,
    projects,
    onSelectNote,
    onSelectFolder,
    onOpenProject,
    onCreateNote,
    onOpenHome,
    onOpenTasks,
    onOpenFiles,
    onOpenSettings,
    onOpenShortcuts,
  ])

  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const safeIndex = flatItems.length === 0 ? 0 : Math.min(activeIndex, flatItems.length - 1)
  const activeItem = flatItems[safeIndex]
  const activeKey = activeItem?.key

  // Keep the highlighted row visible while arrowing through long lists.
  useEffect(() => {
    if (!isOpen || !activeKey) return
    document.getElementById(`palette-item-${activeKey}`)?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, activeKey])

  // Escape closes even if focus has moved out of the input.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return
    onClose()
    item.run()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (flatItems.length ? (index + 1) % flatItems.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (flatItems.length ? (index - 1 + flatItems.length) % flatItems.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runItem(activeItem)
    }
  }

  let optionIndex = -1
  const resultCount = flatItems.length

  return (
    <div
      className="fixed inset-0 z-[110] flex animate-fade-in items-start justify-center bg-black/35 px-3 pt-[14vh] backdrop-blur-lg dark:bg-black/60 sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="glass-popover flex w-full max-w-2xl animate-rise-in flex-col overflow-hidden rounded-3xl"
      >
        {/* Search field */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 sm:px-5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-light)] text-accent"
            aria-hidden
          >
            <Search size={15} strokeWidth={1.9} />
          </span>
          <input
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={activeKey ? `palette-item-${activeKey}` : undefined}
            aria-autocomplete="list"
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search notes, folders, projects or run a command…"
            className="h-[54px] min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted focus:outline-none"
          />
          {isSearchingContent ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden />
          ) : (
            <kbd className="kbd hidden shrink-0 sm:inline-flex">Esc</kbd>
          )}
        </div>

        {/* Results */}
        <div
          id="command-palette-results"
          role="listbox"
          aria-label="Results"
          className="scroll-thin max-h-[min(58vh,30rem)] overflow-y-auto overscroll-contain px-2 py-2"
        >
          {groups.length === 0 && (
            <div className="px-4 py-14 text-center">
              <div
                className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-muted"
                aria-hidden
              >
                <Search size={17} strokeWidth={1.8} />
              </div>
              <p className="text-sm font-medium text-foreground">No matches</p>
              <p className="mt-1 text-xs text-muted">Try a note title, folder, project, or “new”.</p>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.title} role="group" aria-label={group.title} className="pb-1.5 last:pb-0">
              <div className="px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                {group.title}
              </div>
              {group.items.map((item) => {
                optionIndex += 1
                const index = optionIndex
                const isActive = index === safeIndex
                const Icon = item.icon
                return (
                  <button
                    key={item.key}
                    id={`palette-item-${item.key}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runItem(item)}
                    className={[
                      'glass-row flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left',
                      'transition-colors duration-100',
                      isActive ? 'is-active' : '',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-100',
                        isActive
                          ? 'bg-[var(--accent-light)] text-accent'
                          : 'bg-[var(--surface-sunken)] text-muted',
                      ].join(' ')}
                      aria-hidden
                    >
                      <Icon size={14} strokeWidth={1.9} className={item.iconClass} />
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
                    >
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="hidden max-w-[45%] shrink-0 truncate text-[11px] text-muted sm:block">
                        {item.hint}
                      </span>
                    )}
                    {isActive && (
                      <CornerDownLeft size={13} className="hidden shrink-0 text-accent sm:block" aria-hidden />
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer: status + keyboard hints */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-2 text-[11px] text-muted sm:px-5">
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {isSearchingContent ? (
              <>
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                Searching note text…
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{resultCount}</span>
                {resultCount === 1 ? 'result' : 'results'}
                <span className="hidden text-muted sm:inline">· ↑↓ navigate · ↵ open</span>
              </>
            )}
          </span>
          <span className="hidden shrink-0 items-center gap-1 sm:flex">
            <kbd className="kbd">{formatModShortcut('K')}</kbd>
            <span>palette</span>
          </span>
        </div>
      </div>
    </div>
  )
}