'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  FilePenLine,
  FileText,
  FolderOpen,
  Home,
  Keyboard,
  LayoutDashboard,
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
      { key: 'nav-files', label: 'Open File Explorer', hint: 'Browse files', icon: FolderOpen, run: onOpenFiles },
      { key: 'nav-settings', label: 'Open Settings', hint: 'Account, appearance, startup', icon: Settings, run: onOpenSettings },
      { key: 'nav-shortcuts', label: 'Keyboard shortcuts', hint: 'Reference for formatting and navigation', icon: Keyboard, run: onOpenShortcuts },
    ].filter((item) => matchesPaletteQuery(item.label, item.hint, query))

    return [
      { title: 'Notes', items: limit(noteItems, MAX_IDLE_NOTES) },      { title: 'Folders', items: limit(folderItems, MAX_IDLE_FOLDERS) },
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

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-black/40 px-3 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5">
          <Search size={16} className="shrink-0 text-muted" aria-hidden />
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
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted/60 focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted sm:block">
            Esc
          </kbd>
        </div>

        <div
          id="command-palette-results"
          role="listbox"
          aria-label="Results"
          className="max-h-[min(60vh,28rem)] overflow-y-auto py-1"
        >
          {groups.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-foreground">No matches</p>
              <p className="mt-1 text-xs text-muted">Try a note title, folder, project, or “new”.</p>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.title} className="py-1">
              <div className="px-3.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted/60">
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
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                      isActive ? 'bg-surface-hover text-foreground' : 'text-foreground/80 hover:bg-surface-hover'
                    }`}
                  >
                    <Icon size={15} className={`shrink-0 ${item.iconClass ?? 'text-muted'}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{item.label}</span>
                      {item.hint && (
                        <span className="block truncate text-[11px] text-muted">{item.hint}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-surface-hover/40 px-3.5 py-1.5 text-[10px] text-muted">
          <span>{isSearchingContent ? 'Searching note text…' : '↑↓ navigate · ↵ open'}</span>
          <span className="hidden sm:inline">{formatModShortcut('K')}</span>
        </div>
      </div>
    </div>
  )
}
