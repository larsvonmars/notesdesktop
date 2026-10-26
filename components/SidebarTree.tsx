'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronRight,
  ChevronDown,
  FolderTree as FolderTreeIcon,
  Folder,
  FolderOpen,
  FileText,
  PenTool,
  Network,
  BookOpen,
  Table2,
  FilePenLine,
  Plus,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  FolderPlus,
  Trash2,
  Home,
  X,
  LayoutDashboard,
  Hash,
  Clock,
  Inbox,
  Archive,
  Layers,
  Settings,
  ListTodo,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
  type LucideIcon,
} from 'lucide-react'
import SidebarContextMenu from './sidebar/SidebarContextMenu'
import type { FolderNode } from '@/lib/folders'
import type { Project } from '@/lib/projects'
import type { NoteSummary, NoteType } from '@/lib/notes'
import { getNoteTypePresentation, getOrderedNoteTypePresentations, type NoteTypeIconKey } from '@/lib/note-types'
import { formatModShortcut } from '@/lib/platform'

const NOTE_TYPE_ICON_MAP: Record<NoteTypeIconKey, LucideIcon> = {
  'file-text': FileText,
  'pen-tool': PenTool,
  network: Network,
  'book-open': BookOpen,
  'table-2': Table2,
  'file-pen-line': FilePenLine,
}

// Soft, theme-aware tint behind each note type icon. Tints are built from the
// standard palette (not from semantic tokens) so the alpha modifiers are safe.
const NOTE_TYPE_TILE_CLASS: Record<NoteTypeIconKey, string> = {
  'file-text': 'bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300',
  'pen-tool': 'bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300',
  network: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300',
  'book-open': 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300',
  'table-2': 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300',
  'file-pen-line': 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300',
}

function noteTypeTileClass(size: 'xs' | 'sm' | 'md'): string {
  if (size === 'xs') return 'h-4 w-4 rounded-[5px]'
  if (size === 'md') return 'h-[22px] w-[22px] rounded-[7px]'
  return 'h-5 w-5 rounded-md'
}

/** Pick an ink colour with enough contrast for text/checks over a project colour. */
function readableOnColor(hex: string): string {
  const value = hex.replace('#', '')
  if (value.length !== 6) return '#ffffff'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#0b0a15' : '#ffffff'
}

/** First two grapheme-ish characters, safe for emoji/unicode workspace names. */
function projectInitials(name: string): string {
  return Array.from(name.trim()).slice(0, 2).join('').toUpperCase()
}

function NoteTypeGlyph({
  noteType,
  size = 'sm',
  className = '',
}: {
  noteType?: NoteType
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  const presentation = getNoteTypePresentation(noteType)
  const Icon = NOTE_TYPE_ICON_MAP[presentation.iconKey]
  const glyph = size === 'xs' ? 10 : size === 'md' ? 13 : 11
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center ${noteTypeTileClass(size)} ${NOTE_TYPE_TILE_CLASS[presentation.iconKey]} ${className}`}
    >
      <Icon size={glyph} strokeWidth={2} />
    </span>
  )
}

function ProjectGlyph({
  color,
  name,
  size = 'sm',
}: {
  color: string
  name: string
  size?: 'sm' | 'md'
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center font-extrabold leading-none tracking-[0.02em] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.28)] ${
        size === 'md' ? 'h-6 w-6 rounded-lg text-[9px]' : 'h-5 w-5 rounded-[6px] text-[8.5px]'
      }`}
      style={{ backgroundColor: color, color: readableOnColor(color) }}
    >
      {projectInitials(name)}
    </span>
  )
}

function UnfiledGlyph({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-surface-active text-muted ${
        size === 'md' ? 'h-6 w-6 rounded-lg' : 'h-5 w-5 rounded-[6px]'
      }`}
    >
      <Inbox size={size === 'md' ? 13 : 11} />
    </span>
  )
}

/**
 * A quiet solid layer inside floating glass surfaces. Dense sidebar rows behind
 * a popover are otherwise visible through the translucent material and compete
 * with the popover's own labels (especially in dark mode).
 */
function GlassSurfaceScrim() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-surface-solid opacity-50"
    />
  )
}

/**
 * The sidebar panes use `backdrop-filter` (`.glass-*`) plus `overflow-hidden`,
 * which makes them the containing block for `position: fixed` children and
 * clips anything drawn past their edges. Menus and modals therefore have to be
 * portaled to `<body>` to stay visible and viewport-anchored.
 */
function SidebarPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

// Drag data types
const DRAG_TYPE_NOTE = 'application/x-note-id'
const DRAG_TYPE_FOLDER = 'application/x-folder-id'

// A combined tree node representing projects as top-level groupings
export interface ProjectTreeNode {
  project: Project | null // null = "Unfiled"
  folders: FolderNode[]
  notes: NoteSummary[] // notes at the project root (folder_id == null)
}

export interface SidebarTreeProps {
  projects: Project[]
  folderTree: FolderNode[]
  allNotes: NoteSummary[]
  selectedNoteId?: string
  selectedFolderId: string | null
  selectedProjectId: string | null
  onSelectNote: (note: NoteSummary) => void
  onSelectFolder: (folderId: string | null) => void
  onNewNote: (noteType?: string, folderId?: string | null, projectId?: string | null) => void
  onCreateFolder: (parentId: string | null, projectId?: string | null) => void
  onRenameFolder: (folderId: string, newName: string) => void
  onDeleteFolder: (folderId: string) => void
  onMoveFolder?: (folderId: string, newParentId: string | null) => void
  onMoveFolderToProject?: (folderId: string, projectId: string | null) => void
  onDuplicateNote?: (note: NoteSummary) => void
  onDeleteNote?: (noteId: string) => void
  onMoveNote?: (noteId: string, newFolderId: string | null) => Promise<void>
  onRenameProject?: (projectId: string, newName: string) => void
  onDeleteProject?: (projectId: string) => void
  onUpdateProjectColor?: (projectId: string, color: string) => void
  onCreateProject?: () => void
  onMoveNoteToProject?: (noteId: string, projectId: string | null) => Promise<void>
  onOpenProjectDashboard?: (projectId: string) => void
  onOpenFileExplorer?: () => void
  /** Archive a project (hides it from the active workspace). */
  onArchiveProject?: (projectId: string) => void
  /** Open the archived-projects manager (from the footer Archive entry). */
  onOpenArchive?: () => void
  /** Open app settings (reachable even when no note is open). */
  onOpenSettings?: () => void
  /** Open the welcome / home view. */
  onOpenWelcome?: () => void
  /** Open the tasks and agenda view. */
  onOpenTasks?: () => void
  /** Open the command palette. */
  onOpenCommandPalette?: () => void
  /** Number of archived projects (shown on the Archive entry). */
  archivedCount?: number
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Compact desktop rows (smaller tap targets). Pass `!isMobile`. */
  dense?: boolean
  /** Hide the built-in workspace header (used when the tree is embedded in a drawer that supplies its own header). */
  showHeader?: boolean
}

type DragPayload = { type: 'note'; id: string } | { type: 'folder'; id: string }

type DropTarget =
  | { kind: 'folder'; id: string }
  | { kind: 'project-root'; projectId: string | null }
  | null

const NEUTRAL_DOT = '#8b8b8b'

export default function SidebarTree({
  projects,
  folderTree,
  allNotes,
  selectedNoteId,
  selectedFolderId,
  selectedProjectId,
  onSelectNote,
  onSelectFolder,
  onNewNote,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onMoveFolderToProject,
  onDuplicateNote,
  onDeleteNote,
  onMoveNote,
  onRenameProject,
  onDeleteProject,
  onUpdateProjectColor,
  onCreateProject,
  onMoveNoteToProject,
  onOpenProjectDashboard,
  onOpenFileExplorer,
  onArchiveProject,
  onOpenArchive,
  onOpenSettings,
  onOpenWelcome,
  onOpenTasks,
  onOpenCommandPalette,
  archivedCount = 0,
  collapsed,
  onToggleCollapsed,
  dense = false,
  showHeader = true,
}: SidebarTreeProps) {
  // Expanded state for projects and folders
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set(['__UNFILED__']))
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [filterNoteTypes, setFilterNoteTypes] = useState<Set<NoteType>>(() => new Set())
  const [filterProjectIds, setFilterProjectIds] = useState<Set<string>>(() => new Set())
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchAreaRef = useRef<HTMLDivElement>(null)
  const filterPanelRef = useRef<HTMLDivElement>(null)

  // Drag-and-drop state
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null)
  const dragCounterRef = useRef<Map<string, number>>(new Map())

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; type: 'folder' | 'note' | 'project'; id: string; name: string; projectId?: string | null
  } | null>(null)

  // Keyboard users can dismiss the context menu with Escape.
  useEffect(() => {
    if (!contextMenu) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [contextMenu])

  // Inline rename state
  const [inlineRename, setInlineRename] = useState<{
    type: 'folder' | 'project'; id: string; value: string
  } | null>(null)
  const inlineRenameRef = useRef<HTMLInputElement>(null)

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState<{
    type: 'folder' | 'note' | 'project'; id: string; name: string
  } | null>(null)

  // Color picker for projects
  const [showColorPicker, setShowColorPicker] = useState<{
    projectId: string; currentColor: string
  } | null>(null)

  // Move-to picker modal state (searchable, full list)
  const [showMovePicker, setShowMovePicker] = useState<{
    type: 'note-to-folder' | 'note-to-project' | 'folder-to-project'
    id: string
    name: string
  } | null>(null)
  const [movePickerSearch, setMovePickerSearch] = useState('')
  const movePickerSearchRef = useRef<HTMLInputElement>(null)

  // New-note dropdown state
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const newMenuRef = useRef<HTMLDivElement>(null)

  // Auto-expand to the selected folder's path
  useEffect(() => {
    if (!selectedFolderId) return
    const findPath = (nodes: FolderNode[], target: string): string[] | null => {
      for (const n of nodes) {
        if (n.id === target) return [n.id]
        const childPath = findPath(n.children, target)
        if (childPath) return [n.id, ...childPath]
      }
      return null
    }
    const path = findPath(folderTree, selectedFolderId)
    if (path) {
      setExpandedFolders(prev => {
        const next = new Set(prev)
        path.forEach(id => next.add(id))
        return next
      })
    }
  }, [selectedFolderId, folderTree])

  // Auto-expand the project that contains the selected folder/note
  useEffect(() => {
    if (selectedProjectId) {
      setExpandedProjects(prev => {
        const next = new Set(prev)
        next.add(selectedProjectId)
        return next
      })
    }
  }, [selectedProjectId])

  // Auto-expand to show the currently selected note
  useEffect(() => {
    if (!selectedNoteId) return
    const note = allNotes.find(n => n.id === selectedNoteId)
    if (!note) return

    const projectKey = note.project_id ?? '__UNFILED__'
    setExpandedProjects(prev => {
      if (prev.has(projectKey)) return prev
      const next = new Set(prev)
      next.add(projectKey)
      return next
    })

    if (note.folder_id) {
      const findPath = (nodes: FolderNode[], target: string): string[] | null => {
        for (const n of nodes) {
          if (n.id === target) return [n.id]
          const childPath = findPath(n.children, target)
          if (childPath) return [n.id, ...childPath]
        }
        return null
      }
      const path = findPath(folderTree, note.folder_id)
      if (path) {
        setExpandedFolders(prev => {
          const next = new Set(prev)
          let changed = false
          path.forEach(id => { if (!next.has(id)) { next.add(id); changed = true } })
          return changed ? next : prev
        })
      }
    }
  }, [selectedNoteId, allNotes, folderTree])

  // Focus inline rename input when it appears
  useEffect(() => {
    if (inlineRename) {
      setTimeout(() => {
        inlineRenameRef.current?.focus()
        inlineRenameRef.current?.select()
      }, 30)
    }
  }, [inlineRename])

  // Focus move picker search when it appears
  useEffect(() => {
    if (showMovePicker) {
      setMovePickerSearch('')
      setTimeout(() => movePickerSearchRef.current?.focus(), 50)
    }
  }, [showMovePicker])

  // Close new-note dropdown on outside click
  useEffect(() => {
    if (!newMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (!newMenuRef.current?.contains(e.target as Node)) {
        setNewMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [newMenuOpen])

  // Close filter panel on outside click. The whole search cluster (field + toggle)
  // and the panel itself count as "inside" so interacting with them doesn't dismiss it.
  useEffect(() => {
    if (!showFilterPanel) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (searchAreaRef.current?.contains(target)) return
      if (filterPanelRef.current?.contains(target)) return
      setShowFilterPanel(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilterPanel])

  // ---- DERIVED STATE ----

  const activeNote = useMemo(
    () => (selectedNoteId ? allNotes.find(n => n.id === selectedNoteId) : undefined),
    [selectedNoteId, allNotes]
  )

  const getAncestorFolderIds = useCallback((targetId: string, nodes: FolderNode[]): Set<string> => {
    const findPath = (ns: FolderNode[], t: string): string[] | null => {
      for (const n of ns) {
        if (n.id === t) return [n.id]
        const child = findPath(n.children, t)
        if (child) return [n.id, ...child]
      }
      return null
    }
    const path = findPath(nodes, targetId)
    return path ? new Set(path) : new Set()
  }, [])

  const activeFolderAncestors = useMemo((): Set<string> => {
    if (!activeNote?.folder_id) return new Set()
    return getAncestorFolderIds(activeNote.folder_id, folderTree)
  }, [activeNote, folderTree, getAncestorFolderIds])

  const countNotesRecursive = useCallback((folder: FolderNode): number => {
    const direct = allNotes.filter(n => n.folder_id === folder.id).length
    const childCount = folder.children.reduce((acc, c) => acc + countNotesRecursive(c), 0)
    return direct + childCount
  }, [allNotes])

  const projectTree = useMemo((): ProjectTreeNode[] => {
    const result: ProjectTreeNode[] = []

    for (const project of projects) {
      const projectFolders = folderTree.filter(f => f.project_id === project.id)
      const projectRootNotes = allNotes.filter(
        n => n.project_id === project.id && n.folder_id === null
      )
      result.push({ project, folders: projectFolders, notes: projectRootNotes })
    }

    const unfiledFolders = folderTree.filter(f => f.project_id === null)
    const unfiledNotes = allNotes.filter(n => n.project_id === null && n.folder_id === null)
    result.push({ project: null, folders: unfiledFolders, notes: unfiledNotes })

    return result
  }, [projects, folderTree, allNotes])

  const getNotesForFolder = useCallback((folderId: string): NoteSummary[] => {
    return allNotes.filter(n => n.folder_id === folderId)
  }, [allNotes])

  // Flatten all folders for move picker
  const flatAllFolders = useMemo(() => {
    const result: { folder: FolderNode; depth: number; projectName: string; projectColor: string }[] = []
    const walk = (nodes: FolderNode[], depth: number, projectName: string, projectColor: string) => {
      for (const n of nodes) {
        result.push({ folder: n, depth, projectName, projectColor })
        walk(n.children, depth + 1, projectName, projectColor)
      }
    }
    for (const pt of projectTree) {
      const pName = pt.project?.name ?? 'Unfiled'
      const pColor = pt.project?.color ?? NEUTRAL_DOT
      walk(pt.folders, 0, pName, pColor)
    }
    return result
  }, [projectTree])

  // Recent notes: 5 most recently updated, shown when not filtering
  const recentNotes = useMemo(() => {
    return [...allNotes]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5)
  }, [allNotes])

  // Client-side check: is folderId a descendant of potentialAncestorId?
  const isFolderDescendant = useCallback((folderId: string, potentialAncestorId: string): boolean => {
    const check = (nodes: FolderNode[]): boolean => {
      for (const n of nodes) {
        if (n.id === potentialAncestorId) {
          const findInSubtree = (subtree: FolderNode[]): boolean => {
            for (const c of subtree) {
              if (c.id === folderId) return true
              if (findInSubtree(c.children)) return true
            }
            return false
          }
          return findInSubtree(n.children)
        }
        if (check(n.children)) return true
      }
      return false
    }
    return check(folderTree)
  }, [folderTree])

  // ---- TOGGLE HELPERS ----

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }, [])

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  // ---- CONTEXT MENU HELPERS ----

  const handleFolderContextMenu = useCallback((e: React.MouseEvent, folderId: string, folderName: string, projectId?: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 240),
      y: Math.min(e.clientY, window.innerHeight - 320),
      type: 'folder',
      id: folderId,
      name: folderName,
      projectId,
    })
  }, [])

  const handleNoteContextMenu = useCallback((e: React.MouseEvent, note: NoteSummary) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 240),
      y: Math.min(e.clientY, window.innerHeight - 320),
      type: 'note',
      id: note.id,
      name: note.title || 'Untitled',
      projectId: note.project_id,
    })
  }, [])

  const handleProjectContextMenu = useCallback((e: React.MouseEvent, project: Project) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 240),
      y: Math.min(e.clientY, window.innerHeight - 320),
      type: 'project',
      id: project.id,
      name: project.name,
    })
  }, [])

  // ---- DRAG-AND-DROP ----

  const handleDragStart = useCallback((e: React.DragEvent, payload: DragPayload) => {
    if (payload.type === 'note') {
      e.dataTransfer.setData(DRAG_TYPE_NOTE, payload.id)
    } else {
      e.dataTransfer.setData(DRAG_TYPE_FOLDER, payload.id)
    }
    e.dataTransfer.effectAllowed = 'move'
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
    setDragPayload(payload)
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
    setDropTarget(null)
    setDragPayload(null)
    dragCounterRef.current.clear()
  }, [])

  const makeDragKey = (target: DropTarget): string => {
    if (!target) return '__none__'
    if (target.kind === 'folder') return `folder:${target.id}`
    return `project:${target.projectId ?? '__UNFILED__'}`
  }

  const handleDragEnter = useCallback((e: React.DragEvent, target: DropTarget) => {
    e.preventDefault()
    e.stopPropagation()
    const key = makeDragKey(target)
    const count = (dragCounterRef.current.get(key) ?? 0) + 1
    dragCounterRef.current.set(key, count)
    setDropTarget(target)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent, target: DropTarget) => {
    e.preventDefault()
    e.stopPropagation()
    const key = makeDragKey(target)
    const count = (dragCounterRef.current.get(key) ?? 0) - 1
    dragCounterRef.current.set(key, count)
    if (count <= 0) {
      dragCounterRef.current.delete(key)
      setDropTarget(prev => {
        if (prev && makeDragKey(prev) === key) return null
        return prev
      })
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, target: DropTarget) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    setDragPayload(null)
    dragCounterRef.current.clear()

    if (!target) return

    const noteId = e.dataTransfer.getData(DRAG_TYPE_NOTE)
    const folderId = e.dataTransfer.getData(DRAG_TYPE_FOLDER)

    if (noteId) {
      if (target.kind === 'folder') {
        if (onMoveNote) {
          try { await onMoveNote(noteId, target.id) } catch (err) { console.error('Failed to move note:', err) }
        }
      } else if (target.kind === 'project-root') {
        if (onMoveNoteToProject) {
          try { await onMoveNoteToProject(noteId, target.projectId) } catch (err) { console.error('Failed to move note to project:', err) }
        }
      }
    } else if (folderId) {
      if (target.kind === 'folder') {
        if (folderId === target.id) return
        if (isFolderDescendant(target.id, folderId)) return
        if (onMoveFolder) {
          try { await onMoveFolder(folderId, target.id) } catch (err) { console.error('Failed to move folder:', err) }
        }
      } else if (target.kind === 'project-root') {
        if (onMoveFolderToProject) {
          try { await onMoveFolderToProject(folderId, target.projectId) } catch (err) { console.error('Failed to move folder to project:', err) }
        } else if (onMoveFolder) {
          try { await onMoveFolder(folderId, null) } catch (err) { console.error('Failed to move folder:', err) }
        }
      }
    }
  }, [onMoveNote, onMoveNoteToProject, onMoveFolder, onMoveFolderToProject, isFolderDescendant])

  const isDropHighlighted = useCallback((target: DropTarget): boolean => {
    if (!dropTarget || !target) return false
    return makeDragKey(dropTarget) === makeDragKey(target)
  }, [dropTarget])

  // ---- SEARCH & FILTER ----

  const matchesSearch = useCallback((text: string) => {
    if (!searchQuery.trim()) return true
    return text.toLowerCase().includes(searchQuery.toLowerCase())
  }, [searchQuery])

  const noteMatchesFilters = useCallback((note: NoteSummary): boolean => {
    if (searchQuery.trim() && !((note.title ?? 'Untitled').toLowerCase().includes(searchQuery.toLowerCase()))) return false
    if (filterNoteTypes.size > 0 && !filterNoteTypes.has((note.note_type ?? 'rich-text') as NoteType)) return false
    if (filterProjectIds.size > 0) {
      const key = note.project_id ?? '__UNFILED__'
      if (!filterProjectIds.has(key)) return false
    }
    return true
  }, [searchQuery, filterNoteTypes, filterProjectIds])

  const isFilterActive = searchQuery.trim() !== '' || filterNoteTypes.size > 0 || filterProjectIds.size > 0
  const activeFilterCount = (searchQuery.trim() ? 1 : 0) + filterNoteTypes.size + filterProjectIds.size

  const filteredNotes = useMemo(
    () => isFilterActive ? allNotes.filter(noteMatchesFilters) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allNotes, isFilterActive, searchQuery, filterNoteTypes, filterProjectIds]
  )

  // Search folders: match on folder name, optionally filtered by project
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return flatAllFolders.filter(({ folder, projectName }) => {
      if (!folder.name.toLowerCase().includes(q)) return false
      if (filterProjectIds.size > 0) {
        const key = folder.project_id ?? '__UNFILED__'
        if (!filterProjectIds.has(key)) return false
      }
      return true
    })
  }, [searchQuery, flatAllFolders, filterProjectIds])

  // Search projects: match on project name or description
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return projects.filter(p => {
      if (p.name.toLowerCase().includes(q)) return true
      if (p.description && p.description.toLowerCase().includes(q)) return true
      return false
    })
  }, [searchQuery, projects])

  const totalResultCount = filteredNotes.length + filteredFolders.length + filteredProjects.length

  const getNoteLocationMeta = useCallback((note: NoteSummary): { projectName: string; projectColor: string; folderPath: string } => {
    const proj = projects.find(p => p.id === note.project_id)
    const projectName = proj?.name ?? 'Unfiled'
    const projectColor = proj?.color ?? NEUTRAL_DOT
    let folderPath = ''
    if (note.folder_id) {
      const findPath = (ns: FolderNode[], t: string): string[] | null => {
        for (const n of ns) {
          if (n.id === t) return [n.name]
          const child = findPath(n.children, t)
          if (child) return [n.name, ...child]
        }
        return null
      }
      const path = findPath(folderTree, note.folder_id)
      if (path) folderPath = path.join(' › ')
    }
    return { projectName, projectColor, folderPath }
  }, [projects, folderTree])

  const toggleNoteTypeFilter = useCallback((type: NoteType) => {
    setFilterNoteTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  const toggleProjectFilter = useCallback((id: string) => {
    setFilterProjectIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearAllFilters = useCallback(() => {
    setSearchQuery('')
    setFilterNoteTypes(new Set())
    setFilterProjectIds(new Set())
    setShowFilterPanel(false)
  }, [])

  const allNoteTypePresentations = useMemo(() => getOrderedNoteTypePresentations(), [])

  // ---- DELETE / INLINE RENAME HANDLERS ----

  const handleConfirmDelete = useCallback(() => {
    if (!showDeleteModal) return
    if (showDeleteModal.type === 'folder') onDeleteFolder(showDeleteModal.id)
    else if (showDeleteModal.type === 'note' && onDeleteNote) onDeleteNote(showDeleteModal.id)
    else if (showDeleteModal.type === 'project' && onDeleteProject) onDeleteProject(showDeleteModal.id)
    setShowDeleteModal(null)
  }, [showDeleteModal, onDeleteFolder, onDeleteNote, onDeleteProject])

  const commitInlineRename = useCallback(() => {
    if (!inlineRename || !inlineRename.value.trim()) {
      setInlineRename(null)
      return
    }
    if (inlineRename.type === 'folder') {
      onRenameFolder(inlineRename.id, inlineRename.value.trim())
    } else if (inlineRename.type === 'project' && onRenameProject) {
      onRenameProject(inlineRename.id, inlineRename.value.trim())
    }
    setInlineRename(null)
  }, [inlineRename, onRenameFolder, onRenameProject])

  // ---- SHARED VISUAL HELPERS ----

  // Rows are 30px on desktop and a comfortable 42px on touch; .glass-row owns the
  // radius/padding/hover/active treatment, these only tune density.
  const rowHeightCls = dense ? 'h-[30px] py-1' : 'h-[42px] py-2'
  // Actions appear on hover for dense (desktop) rows; always visible on touch.
  const revealActionsCls = dense
    ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity'
    : 'opacity-100'

  const actionBtnCls = `focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-active hover:text-foreground ${revealActionsCls}`
  // Two-line result rows (name + location subtitle) need auto height, not the
  // fixed single-line row height.
  const searchRowCls = dense ? 'min-h-[42px] py-1.5' : 'min-h-[50px] py-2'
  const sectionLabelCls = 'flex items-center gap-1.5 px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted'
  const countCls = 'shrink-0 text-[10.5px] font-medium tabular-nums text-muted'
  // Reserve a stable action zone so counts line up on every tree row, even
  // before the hover-revealed buttons appear.
  const actionGroupCls = 'flex w-[50px] shrink-0 items-center justify-end gap-0.5'

  // ==================================================================
  // NOTE ROW
  // ==================================================================
  const renderNoteItem = (n: NoteSummary, indent: number = 0) => {
    if (!matchesSearch(n.title || 'Untitled')) return null
    const isActive = selectedNoteId === n.id
    const noteProject = projects.find(p => p.id === n.project_id)
    const isDragging = dragPayload?.type === 'note' && dragPayload.id === n.id
    return (
      <div
        role="button"
        tabIndex={0}
        key={n.id}
        aria-current={isActive ? 'page' : undefined}
        draggable
        onDragStart={(e) => handleDragStart(e, { type: 'note', id: n.id })}
        onDragEnd={handleDragEnd}
        onClick={() => onSelectNote(n)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNote(n) }
        }}
        onContextMenu={(e) => handleNoteContextMenu(e, n)}
        title={n.title || 'Untitled'}
        className={`glass-row group relative cursor-pointer ${rowHeightCls} ${isDragging ? 'opacity-40' : ''} ${
          isActive ? 'is-active' : ''
        }`}
        style={indent ? { paddingLeft: indent } : undefined}
      >
        <NoteTypeGlyph noteType={n.note_type} />
        <span className="min-w-0 flex-1 truncate text-[13px] leading-none">
          {n.title || 'Untitled'}
        </span>
        {!isActive && noteProject && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full opacity-0 transition-opacity group-hover:opacity-60"
            style={{ backgroundColor: noteProject.color ?? NEUTRAL_DOT }}
          />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); handleNoteContextMenu(e, n) }}
          className={actionBtnCls}
          title="Note options"
          aria-label="Note options"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>
    )
  }

  // ==================================================================
  // FOLDER ROW
  // ==================================================================
  const renderFolder = (folder: FolderNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(folder.id)
    const isSelected = selectedFolderId === folder.id
    const hasChildren = folder.children.length > 0
    const folderNotes = getNotesForFolder(folder.id)
    const totalCount = countNotesRecursive(folder)
    const isOnActivePath = activeFolderAncestors.has(folder.id)
    const isRenaming = inlineRename?.type === 'folder' && inlineRename.id === folder.id
    const isDragging = dragPayload?.type === 'folder' && dragPayload.id === folder.id
    const isDropTarget = isDropHighlighted({ kind: 'folder', id: folder.id })
    const canExpand = hasChildren || folderNotes.length > 0
    const folderIconCls = isSelected
      ? 'text-accent'
      : isExpanded || isOnActivePath
        ? 'text-foreground'
        : 'text-muted group-hover:text-foreground'

    const folderRow = (
      <div
        role="button"
        tabIndex={0}
        draggable={!isRenaming}
        aria-expanded={canExpand ? isExpanded : undefined}
        aria-current={isSelected ? 'page' : undefined}
        onDragStart={(e) => handleDragStart(e, { type: 'folder', id: folder.id })}
        onDragEnd={handleDragEnd}
        onClick={() => { if (!isRenaming) toggleFolder(folder.id) }}
        onDoubleClick={() => {
          setInlineRename({ type: 'folder', id: folder.id, value: folder.name })
        }}
        onContextMenu={(e) => handleFolderContextMenu(e, folder.id, folder.name, folder.project_id)}
        onDragOver={handleDragOver}
        onDragEnter={(e) => handleDragEnter(e, { kind: 'folder', id: folder.id })}
        onDragLeave={(e) => handleDragLeave(e, { kind: 'folder', id: folder.id })}
        onDrop={(e) => handleDrop(e, { kind: 'folder', id: folder.id })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFolder(folder.id) }
        }}
        className={`glass-row group relative cursor-pointer gap-1.5 ${rowHeightCls} ${
          isSelected ? 'is-active font-medium' : ''
        } ${isDropTarget ? 'ring-2 ring-accent bg-accent-light' : ''} ${isDragging ? 'opacity-40' : ''}`}
      >
        <ChevronRight
          size={12}
          strokeWidth={2.25}
          className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
            isExpanded ? 'rotate-90' : ''
          } ${canExpand ? 'text-muted group-hover:text-foreground' : 'text-transparent'} ${
            isSelected ? 'text-accent' : ''
          }`}
        />
        {isExpanded ? (
          <FolderOpen size={14} className={`shrink-0 ${folderIconCls}`} />
        ) : (
          <Folder size={14} className={`shrink-0 ${folderIconCls}`} />
        )}

        {isRenaming ? (
          <input
            ref={inlineRenameRef}
            type="text"
            value={inlineRename.value}
            onChange={(e) => setInlineRename({ ...inlineRename, value: e.target.value })}
            onBlur={commitInlineRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitInlineRename()
              if (e.key === 'Escape') setInlineRename(null)
              e.stopPropagation()
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label="Rename folder"
            className="glass-input h-7 min-w-0 flex-1 px-2 text-[13px]"
          />
        ) : (
          <span className={`min-w-0 flex-1 truncate text-[13px] ${isOnActivePath && !isSelected ? 'font-medium' : ''}`}>
            {folder.name}
          </span>
        )}

        {!isRenaming && (
          <>
            {totalCount > 0 && <span className={countCls}>{totalCount}</span>}
            <div className={actionGroupCls}>
              <button
                onClick={(e) => { e.stopPropagation(); onNewNote(undefined, folder.id, folder.project_id) }}
                className={actionBtnCls}
                title="New note"
                aria-label="New note in folder"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleFolderContextMenu(e, folder.id, folder.name, folder.project_id) }}
                className={actionBtnCls}
                title="Folder options"
                aria-label="Folder options"
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    )

    return (
      <div key={folder.id}>
        {folderRow}

        {/* Expanded children with a hairline indent guide */}
        {isExpanded && (hasChildren || folderNotes.length > 0) && (
          <div className="relative ml-[15px] space-y-0.5 border-l border-border pl-1">
            {hasChildren && (
              <div className="space-y-0.5">
                {folder.children.map(child => renderFolder(child, level + 1))}
              </div>
            )}
            {folderNotes.length > 0 && (
              <div className="space-y-0.5">
                {folderNotes.map(n => renderNoteItem(n, 0))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ==================================================================
  // PROJECT GROUP
  // ==================================================================
  const renderProject = (node: ProjectTreeNode) => {
    const projectKey = node.project?.id ?? '__UNFILED__'
    const projectName = node.project?.name ?? 'Unfiled'
    const projectColor = node.project?.color ?? NEUTRAL_DOT
    const isExpanded = expandedProjects.has(projectKey)
    const totalItems = node.folders.length + node.notes.length
    const isActiveProject = node.project?.id === activeNote?.project_id
    const isSelectedProject = selectedProjectId === node.project?.id && !selectedFolderId && !selectedNoteId
    const totalNoteCount = node.notes.length + node.folders.reduce((acc, f) => acc + countNotesRecursive(f), 0)
    const isRenaming = inlineRename?.type === 'project' && node.project && inlineRename.id === node.project.id
    const dropTargetHere: DropTarget = { kind: 'project-root', projectId: node.project?.id ?? null }
    const isDropHere = isDropHighlighted(dropTargetHere)

    // Only render the unfiled group if it actually has content (or there is
    // nowhere else to put things yet).
    const isUnfiledEmpty = !node.project && totalItems === 0 && projects.length > 0

    if (isUnfiledEmpty) return null
    if (searchQuery && totalItems === 0) return null

    const hasChildren = totalItems > 0

    return (
      <div key={projectKey}>
        {/* Project header */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-current={isSelectedProject ? 'page' : undefined}
          onClick={() => { if (!isRenaming) toggleProject(projectKey) }}
          onDoubleClick={() => {
            if (node.project) {
              setInlineRename({ type: 'project', id: node.project.id, value: node.project.name })
            }
          }}
          onContextMenu={node.project ? (e) => handleProjectContextMenu(e, node.project!) : undefined}
          onDragOver={handleDragOver}
          onDragEnter={(e) => handleDragEnter(e, dropTargetHere)}
          onDragLeave={(e) => handleDragLeave(e, dropTargetHere)}
          onDrop={(e) => handleDrop(e, dropTargetHere)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProject(projectKey) }
          }}
          className={`glass-row group relative cursor-pointer gap-1.5 ${rowHeightCls} ${
            isSelectedProject ? 'is-active' : isActiveProject ? 'font-medium' : ''
          } ${isDropHere ? 'ring-2 ring-accent bg-accent-light' : ''}`}
        >
          <ChevronRight
            size={12}
            strokeWidth={2.25}
            className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
              isExpanded ? 'rotate-90' : ''
            } ${hasChildren ? 'text-muted group-hover:text-foreground' : 'text-transparent'} ${
              isSelectedProject ? 'text-accent' : ''
            }`}
          />
          {node.project ? (
            <ProjectGlyph color={projectColor} name={node.project.name} />
          ) : (
            <UnfiledGlyph />
          )}

          {isRenaming ? (
            <input
              ref={inlineRenameRef}
              type="text"
              value={inlineRename!.value}
              onChange={(e) => setInlineRename({ ...inlineRename!, value: e.target.value })}
              onBlur={commitInlineRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInlineRename()
                if (e.key === 'Escape') setInlineRename(null)
                e.stopPropagation()
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Rename project"
              className="glass-input h-7 min-w-0 flex-1 px-2 text-[13px] font-medium"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.005em]">
              {projectName}
            </span>
          )}

          {!isRenaming && (
            <>
              {totalNoteCount > 0 && <span className={countCls}>{totalNoteCount}</span>}
              <div className={actionGroupCls}>
                {node.project && onOpenProjectDashboard && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenProjectDashboard(node.project!.id) }}
                    className={actionBtnCls}
                    title={`Open ${projectName} dashboard`}
                    aria-label="Open project dashboard"
                  >
                    <LayoutDashboard size={14} />
                  </button>
                )}
                {node.project && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleProjectContextMenu(e, node.project!) }}
                    className={actionBtnCls}
                    title="Project options"
                    aria-label="Project options"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Project content (expanded) */}
        {isExpanded && hasChildren && (
          <div className="relative ml-[15px] space-y-0.5 border-l border-border pl-1">
            {node.folders.map(folder => renderFolder(folder, 0))}
            {node.notes.length > 0 && (
              <div className="space-y-0.5">
                {node.notes.map(n => renderNoteItem(n, 0))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ==================================================================
  // RECENT ROW (compact "quick access" list)
  // ==================================================================
  const renderRecentList = () => {
    if (recentNotes.length === 0) return null
    return (
      <section>
        <div className={sectionLabelCls}>
          <Clock size={11} className="text-muted opacity-70" />
          <span>Recent</span>
          <span className={`ml-auto ${countCls} normal-case tracking-normal`}>{recentNotes.length}</span>
        </div>
        <div className="space-y-0.5">
          {recentNotes.map(note => {
            const noteProject = projects.find(p => p.id === note.project_id)
            const isActive = selectedNoteId === note.id
            return (
              <div
                role="button"
                tabIndex={0}
                key={`recent-${note.id}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectNote(note)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNote(note) } }}
                onContextMenu={(e) => handleNoteContextMenu(e, note)}
                className={`glass-row group relative cursor-pointer ${rowHeightCls} ${isActive ? 'is-active' : ''}`}
                title={note.title || 'Untitled'}
              >
                <NoteTypeGlyph noteType={note.note_type} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{note.title || 'Untitled'}</span>
                {!isActive && noteProject && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full opacity-60"
                    style={{ backgroundColor: noteProject.color ?? NEUTRAL_DOT }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  // ==================================================================
  // SEARCH RESULTS
  // ==================================================================
  const renderSearchResults = () => {
    if (totalResultCount === 0) {
      return (
        <div className="px-2 py-12 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-active text-muted">
            <Search size={17} />
          </div>
          <div className="text-[13px] font-medium text-foreground">No results found</div>
          <div className="mt-1 text-[11.5px] leading-4 text-muted">Try a different search or clear your filters.</div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="glass-btn mt-3 h-8 px-3 text-xs"
            >
              Clear filters
            </button>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-3 pb-3">
        {/* PROJECT RESULTS */}
        {filteredProjects.length > 0 && (
          <div>
            <div className={sectionLabelCls}>
              <Hash size={11} className="text-muted opacity-70" />
              <span>Projects</span>
              <span className={`ml-auto ${countCls} normal-case tracking-normal`}>{filteredProjects.length}</span>
            </div>
            <div className="space-y-0.5">
              {filteredProjects.map(project => {
                const isActive = selectedProjectId === project.id
                const noteCount = allNotes.filter(n => n.project_id === project.id).length
                const folderCount = folderTree.filter(f => f.project_id === project.id).length
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={project.id}
                    onClick={() => {
                      setExpandedProjects(prev => {
                        const next = new Set(prev)
                        next.add(project.id)
                        return next
                      })
                      onSelectFolder(null)
                      if (onOpenProjectDashboard) onOpenProjectDashboard(project.id)
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onOpenProjectDashboard) onOpenProjectDashboard(project.id) } }}
                    onContextMenu={(e) => handleProjectContextMenu(e, project)}
                    className={`glass-row group cursor-pointer ${searchRowCls} ${isActive ? 'is-active' : ''}`}
                  >
                    <ProjectGlyph color={project.color ?? NEUTRAL_DOT} name={project.name} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{project.name}</div>
                      <div className="mt-0.5 truncate text-[11px] text-muted">
                        {project.description || `${folderCount} folder${folderCount !== 1 ? 's' : ''} · ${noteCount} note${noteCount !== 1 ? 's' : ''}`}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleProjectContextMenu(e, project) }}
                      className={actionBtnCls}
                      aria-label="Project options"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* FOLDER RESULTS */}
        {filteredFolders.length > 0 && (
          <div>
            <div className={sectionLabelCls}>
              <FolderTreeIcon size={11} className="text-muted opacity-70" />
              <span>Folders</span>
              <span className={`ml-auto ${countCls} normal-case tracking-normal`}>{filteredFolders.length}</span>
            </div>
            <div className="space-y-0.5">
              {filteredFolders.map(({ folder, depth, projectName, projectColor }) => {
                const isActive = selectedFolderId === folder.id
                const noteCount = countNotesRecursive(folder)
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={folder.id}
                    onClick={() => {
                      const projKey = folder.project_id ?? '__UNFILED__'
                      setExpandedProjects(prev => {
                        const next = new Set(prev)
                        next.add(projKey)
                        return next
                      })
                      const findPath = (ns: FolderNode[], t: string): string[] | null => {
                        for (const n of ns) {
                          if (n.id === t) return [n.id]
                          const child = findPath(n.children, t)
                          if (child) return [n.id, ...child]
                        }
                        return null
                      }
                      const path = findPath(folderTree, folder.id)
                      if (path) {
                        setExpandedFolders(prev => {
                          const next = new Set(prev)
                          path.forEach(id => next.add(id))
                          return next
                        })
                      }
                      onSelectFolder(folder.id)
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectFolder(folder.id) } }}
                    onContextMenu={(e) => handleFolderContextMenu(e, folder.id, folder.name, folder.project_id)}
                    className={`glass-row group cursor-pointer ${searchRowCls} ${isActive ? 'is-active' : ''}`}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-active text-muted" aria-hidden="true">
                      <FolderTreeIcon size={12} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{folder.name}</div>
                      <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: projectColor }} />
                        <span className="shrink-0 font-medium">{projectName}</span>
                        {depth > 0 && (
                          <>
                            <ChevronRight size={9} className="shrink-0 opacity-60" />
                            <span className="shrink-0">nested</span>
                          </>
                        )}
                        <span className="shrink-0">· {noteCount} note{noteCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleFolderContextMenu(e, folder.id, folder.name, folder.project_id) }}
                      className={actionBtnCls}
                      aria-label="Folder options"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* NOTE RESULTS */}
        {filteredNotes.length > 0 && (
          <div>
            <div className={sectionLabelCls}>
              <FileText size={11} className="text-muted opacity-70" />
              <span>Notes</span>
              <span className={`ml-auto ${countCls} normal-case tracking-normal`}>{filteredNotes.length}</span>
            </div>
            <div className="space-y-0.5">
              {filteredNotes.map(note => {
                const { projectName, projectColor, folderPath } = getNoteLocationMeta(note)
                const isActive = selectedNoteId === note.id
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={note.id}
                    aria-current={isActive ? 'page' : undefined}
                    draggable
                    onDragStart={(e) => handleDragStart(e, { type: 'note', id: note.id })}
                    onDragEnd={handleDragEnd}
                    onClick={() => onSelectNote(note)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNote(note) } }}
                    onContextMenu={(e) => handleNoteContextMenu(e, note)}
                    className={`glass-row group cursor-pointer ${searchRowCls} ${isActive ? 'is-active' : ''}`}
                  >
                    <NoteTypeGlyph noteType={note.note_type} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{note.title || 'Untitled'}</div>
                      <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: projectColor }} />
                        <span className="shrink-0 font-medium">{projectName}</span>
                        {folderPath && (
                          <>
                            <ChevronRight size={9} className="shrink-0 opacity-60" />
                            <span className="truncate">{folderPath}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleNoteContextMenu(e, note) }}
                      className={actionBtnCls}
                      aria-label="Note options"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ==================================================================
  // COLLAPSED RAIL
  // ==================================================================
  if (collapsed) {
    const railBtn = 'glass-btn-ghost focus-ring h-9 w-9 rounded-xl'
    const railActiveCls = 'bg-surface-active text-foreground'
    const activeNoteProject = activeNote ? projects.find(p => p.id === activeNote.project_id) : undefined

    return (
      <>
        <div className="flex h-full w-full flex-col items-center">
          {/* Brand + expand affordance */}
          <div className="flex flex-col items-center px-1.5 pb-2 pt-3">
            <img
              src="/icon-192.png"
              alt="MindViz Notes"
              className="h-8 w-8 rounded-[10px] object-contain shadow-glass-sm ring-1 ring-black/5 dark:ring-white/10"
            />
            <button
              onClick={onToggleCollapsed}
              className="glass-btn-ghost focus-ring mt-1.5 h-8 w-8 rounded-lg"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen size={16} />
            </button>
          </div>

          <div className="glass-divider w-8" />

          {/* Projects rail */}
          <nav
            aria-label="Projects"
            className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 py-2.5 scrollbar-hide"
          >
            {projects.map(p => {
              const color = p.color ?? NEUTRAL_DOT
              const isActive = p.id === activeNote?.project_id
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    onToggleCollapsed()
                    onSelectFolder(null)
                    if (onOpenProjectDashboard) onOpenProjectDashboard(p.id)
                  }}
                  title={p.name}
                  aria-label={p.name}
                  className={`focus-ring relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-surface-hover ${isActive ? railActiveCls : ''}`}
                >
                  <span
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] text-[9px] font-extrabold leading-none shadow-[inset_0_1px_0_rgb(255_255_255_/_0.28)]"
                    style={{ backgroundColor: color, color: readableOnColor(color) }}
                  >
                    {projectInitials(p.name)}
                  </span>
                </button>
              )
            })}

            {/* Unfiled (always shown as a fallback) */}
            <button
              onClick={() => { onToggleCollapsed(); onSelectFolder(null) }}
              title="Unfiled"
              aria-label="Unfiled"
              className={`focus-ring relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-surface-hover ${
                !activeNoteProject ? railActiveCls : 'text-muted'
              }`}
            >
              <Inbox size={17} />
            </button>
          </nav>

          {/* Bottom actions */}
          <div className="flex w-full flex-col items-center gap-1 border-t border-border px-1.5 py-2">
            {onOpenCommandPalette && (
              <button
                onClick={onOpenCommandPalette}
                className={railBtn}
                title="Search (⌘K)"
                aria-label="Search"
              >
                <Search size={16} />
              </button>
            )}
            <button
              onClick={() => { onToggleCollapsed(); onNewNote() }}
              className="focus-ring mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-[0_10px_22px_-12px_var(--accent-glow)] transition-[filter,transform] hover:brightness-105 active:scale-95"
              title="New note"
              aria-label="New note"
            >
              <Plus size={17} />
            </button>
            {onOpenTasks && (
              <button
                onClick={onOpenTasks}
                className={railBtn}
                title="Tasks & agenda"
                aria-label="Tasks and agenda"
              >
                <ListTodo size={16} />
              </button>
            )}
            {onOpenWelcome && (
              <button
                onClick={onOpenWelcome}
                className={railBtn}
                title="Home"
                aria-label="Home"
              >
                <Home size={16} />
              </button>
            )}
            {onOpenArchive && (
              <button
                onClick={onOpenArchive}
                className={railBtn}
                title="Archive"
                aria-label="Archive"
              >
                <Archive size={16} />
              </button>
            )}
            {onOpenFileExplorer && (
              <button
                onClick={onOpenFileExplorer}
                className={railBtn}
                title="File Explorer"
                aria-label="File Explorer"
              >
                <FolderOpen size={16} />
              </button>
            )}
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className={railBtn}
                title="Settings"
                aria-label="Settings"
              >
                <Settings size={16} />
              </button>
            )}
          </div>
        </div>

        {/* ========== CONTEXT MENU ========== */}
        {contextMenu && (
          <SidebarPortal>
            <div className="fixed inset-0 z-50" role="presentation" aria-hidden="true" onClick={() => setContextMenu(null)} />
            <div
              role="menu"
              tabIndex={-1}
              aria-label={`${contextMenu.type} actions`}
              className="glass-strong animate-rise-in fixed z-[60] isolate min-w-[232px] overflow-y-auto rounded-2xl p-1.5"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {renderContextMenu()}
              <GlassSurfaceScrim />
            </div>
          </SidebarPortal>
        )}
        {renderSidebarModals()}
      </>
    )
  }

  // ==================================================================
  // EXPANDED VIEW
  // ==================================================================
  const hasAnyContent = projectTree.some(pt => pt.folders.length > 0 || pt.notes.length > 0)
  const showFooterPrimary = Boolean(onOpenFileExplorer || (showHeader && (onOpenWelcome || onOpenTasks)))
  const showFooterSecondary = Boolean(onOpenArchive || onOpenSettings)
  const footerRowCls = 'glass-row h-8 w-full gap-2.5 px-2 text-[13px] text-muted hover:text-foreground'

  return (
    <>
      <div className="flex h-full w-full flex-col overflow-hidden">
        {/* ==== Workspace header ==== */}
        {showHeader && (
          <div className="flex h-[var(--topbar-height,56px)] shrink-0 items-center gap-2 px-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                MindViz Notes
              </div>
              <div className="mt-px truncate text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                Library
              </div>
            </div>
            <button
              onClick={onToggleCollapsed}
              className="glass-btn-ghost focus-ring h-8 w-8 shrink-0 rounded-lg"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        )}

        {/* ==== Search ==== */}
        <div className="relative shrink-0 px-3 pb-2">
          <div ref={searchAreaRef} className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search library"
                className="glass-input h-8 pl-8 pr-12 text-[13px]"
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="focus-ring absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              ) : onOpenCommandPalette ? (
                <button
                  type="button"
                  onClick={onOpenCommandPalette}
                  className="kbd absolute right-1.5 top-1/2 -translate-y-1/2 transition-colors hover:border-border-strong hover:text-foreground"
                  aria-label="Open command palette"
                  title={`Search everything (${formatModShortcut('K')})`}
                >
                  {formatModShortcut('K')}
                </button>
              ) : null}
            </div>
            <button
              onClick={() => setShowFilterPanel(v => !v)}
              title="Filter results"
              aria-label="Toggle filters"
              aria-pressed={showFilterPanel}
              className={`focus-ring relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                showFilterPanel || activeFilterCount > 0
                  ? 'bg-accent-light text-accent'
                  : 'text-muted hover:bg-surface-hover hover:text-foreground'
              }`}
            >
              <SlidersHorizontal size={14} />
              {activeFilterCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-bold leading-none text-accent-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter panel */}
          {showFilterPanel && (
            <div
              ref={filterPanelRef}
              className="glass-strong animate-rise-in absolute left-3 right-3 top-full z-30 mt-2 isolate space-y-3 rounded-2xl p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Filters</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="focus-ring rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div>
                <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Type</div>
                <div className="flex flex-wrap gap-1">
                  {allNoteTypePresentations.map(tp => {
                    const active = filterNoteTypes.has(tp.id)
                    return (
                      <button
                        key={tp.id}
                        onClick={() => toggleNoteTypeFilter(tp.id)}
                        title={tp.label}
                        aria-pressed={active}
                        className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                          active
                            ? 'bg-accent-light text-accent'
                            : 'text-muted hover:bg-surface-hover hover:text-foreground'
                        }`}
                      >
                        <NoteTypeGlyph noteType={tp.id} size="xs" />
                        {tp.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {projects.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Project</div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => toggleProjectFilter('__UNFILED__')}
                      aria-pressed={filterProjectIds.has('__UNFILED__')}
                      className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                        filterProjectIds.has('__UNFILED__')
                          ? 'bg-accent-light text-accent'
                          : 'text-muted hover:bg-surface-hover hover:text-foreground'
                      }`}
                    >
                      <Inbox size={11} />
                      Unfiled
                    </button>
                    {projects.map(p => {
                      const active = filterProjectIds.has(p.id)
                      return (
                        <button
                          key={p.id}
                          onClick={() => toggleProjectFilter(p.id)}
                          title={p.name}
                          aria-pressed={active}
                          className={`flex max-w-[132px] items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                            active
                              ? 'bg-accent-light text-accent'
                              : 'text-muted hover:bg-surface-hover hover:text-foreground'
                          }`}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? NEUTRAL_DOT }} />
                          <span className="truncate">{p.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <GlassSurfaceScrim />
            </div>
          )}
        </div>

        {/* ==== New note split button ==== */}
        <div className="shrink-0 px-3 pb-2.5" ref={newMenuRef}>
          <div className="relative">
            <div className="flex h-9 items-stretch gap-1.5">
              <button
                onClick={() => { setNewMenuOpen(false); onNewNote() }}
                className="glass-btn-primary h-full min-w-0 flex-1 rounded-xl px-3 text-[13px] hover:translate-y-0"
              >
                <Plus size={15} strokeWidth={2.5} />
                New note
              </button>
              <button
                onClick={() => setNewMenuOpen(v => !v)}
                className="glass-btn-primary h-full w-9 shrink-0 rounded-xl px-0 hover:translate-y-0"
                aria-label="More new options"
                aria-expanded={newMenuOpen}
                title="Choose a note type"
              >
                <ChevronDown size={14} className={`transition-transform duration-200 ${newMenuOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {newMenuOpen && (
              <div className="glass-strong animate-rise-in absolute left-0 right-0 top-full z-40 isolate mt-2 overflow-hidden rounded-2xl p-1.5">
                <div className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">New note</div>
                {allNoteTypePresentations.map(tp => (
                  <button
                    key={tp.id}
                    onClick={() => { setNewMenuOpen(false); onNewNote(tp.id) }}
                    className="focus-ring flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
                  >
                    <NoteTypeGlyph noteType={tp.id} />
                    <span className="flex-1 truncate text-[13px]">{tp.pickerLabel}</span>
                  </button>
                ))}
                <div className="glass-divider my-1.5" />
                <button
                  onClick={() => { setNewMenuOpen(false); onCreateFolder(null) }}
                  className="focus-ring flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-active text-muted" aria-hidden="true">
                    <FolderPlus size={11} />
                  </span>
                  <span className="flex-1 truncate text-[13px]">New folder</span>
                </button>
                {onCreateProject && (
                  <button
                    onClick={() => { setNewMenuOpen(false); onCreateProject() }}
                    className="focus-ring flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-active text-muted" aria-hidden="true">
                      <Plus size={11} />
                    </span>
                    <span className="flex-1 truncate text-[13px]">New project</span>
                  </button>
                )}
                <GlassSurfaceScrim />
              </div>
            )}
          </div>
        </div>

        {/* ==== Scrollable nav ==== */}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          {isFilterActive ? (
            renderSearchResults()
          ) : (
            <nav className="pb-1" aria-label="Library tree">
              {renderRecentList()}

              {hasAnyContent ? (
                <div className={recentNotes.length > 0 ? 'mt-2' : ''}>
                  {recentNotes.length > 0 && <div className="glass-divider mb-1" />}
                  <div className={sectionLabelCls}>
                    <Layers size={11} className="text-muted opacity-70" />
                    <span>Projects</span>
                    {projects.length > 0 && (
                      <span className={`ml-auto ${countCls} normal-case tracking-normal`}>{projects.length}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {projectTree.map(node => renderProject(node))}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-border-strong px-4 py-6 text-center">
                  <div className="mx-auto mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl bg-surface-active text-muted">
                    <Layers size={16} />
                  </div>
                  <div className="text-[13px] font-semibold text-foreground">Get started</div>
                  <p className="mt-1 text-[11.5px] leading-4 text-muted">Create your first note or organize ideas into folders and projects.</p>
                  <button
                    onClick={() => onNewNote()}
                    className="glass-btn-primary mt-3 h-8 px-3 text-xs hover:translate-y-0"
                  >
                    <Plus size={13} />
                    New note
                  </button>
                </div>
              )}
            </nav>
          )}
        </div>

        {/* ==== Footer ==== */}
        {(showFooterPrimary || showFooterSecondary) && (
        <div className="shrink-0 px-3 pb-2.5 pt-1.5">
          <div className="glass-divider mb-1.5" />
          <nav aria-label="Workspace" className="space-y-0.5">
            {showHeader && onOpenWelcome && (
              <button onClick={onOpenWelcome} className={footerRowCls}>
                <Home size={15} className="shrink-0" />
                <span className="flex-1 truncate text-left">Home</span>
              </button>
            )}
            {showHeader && onOpenTasks && (
              <button onClick={onOpenTasks} className={footerRowCls}>
                <ListTodo size={15} className="shrink-0" />
                <span className="flex-1 truncate text-left">Tasks</span>
              </button>
            )}
            {onOpenFileExplorer && (
              <button onClick={onOpenFileExplorer} className={footerRowCls} title="File Explorer">
                <FolderOpen size={15} className="shrink-0" />
                <span className="flex-1 truncate text-left">Files</span>
              </button>
            )}
            {showFooterPrimary && showFooterSecondary && <div className="glass-divider my-1.5" />}
            {onOpenArchive && (
              <button onClick={onOpenArchive} className={footerRowCls}>
                <Archive size={15} className="shrink-0" />
                <span className="flex-1 truncate text-left">Archive</span>
                {archivedCount > 0 && (
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-active px-1 text-[10.5px] font-semibold tabular-nums text-muted">
                    {archivedCount}
                  </span>
                )}
              </button>
            )}
            {onOpenSettings && (
              <button onClick={onOpenSettings} className={footerRowCls}>
                <Settings size={15} className="shrink-0" />
                <span className="flex-1 truncate text-left">Settings</span>
              </button>
            )}
          </nav>
        </div>
        )}
      </div>

      {/* ========== CONTEXT MENU ========== */}
      {contextMenu && (
        <SidebarPortal>
          <div className="fixed inset-0 z-50" role="presentation" aria-hidden="true" onClick={() => setContextMenu(null)} />
          <div
            role="menu"
            tabIndex={-1}
            aria-label={`${contextMenu.type} actions`}
            className="glass-strong animate-rise-in fixed z-[60] isolate min-w-[232px] overflow-y-auto rounded-2xl p-1.5"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {renderContextMenu()}
            <GlassSurfaceScrim />
          </div>
        </SidebarPortal>
      )}

      {renderSidebarModals()}
    </>
  )

  // ==================================================================
  // CONTEXT MENU CONTENT (shared by expanded + collapsed)
  // ==================================================================
  function renderContextMenu() {
    if (!contextMenu) return null
    return (
      <SidebarContextMenu
        contextMenu={contextMenu}
        projects={projects}
        allNotes={allNotes}
        onUpdateProjectColor={onUpdateProjectColor}
        onOpenProjectDashboard={onOpenProjectDashboard}
        onArchiveProject={onArchiveProject}
        onCreateFolder={onCreateFolder}
        onNewNote={onNewNote}
        onDeleteProject={onDeleteProject}
        onMoveFolderToProject={onMoveFolderToProject}
        onMoveFolder={onMoveFolder}
        onDuplicateNote={onDuplicateNote}
        onMoveNote={onMoveNote}
        onMoveNoteToProject={onMoveNoteToProject}
        onDeleteNote={onDeleteNote}
        onInlineRename={(request) => setInlineRename(request)}
        onOpenColorPicker={(projectId, currentColor) => setShowColorPicker({ projectId, currentColor })}
        onOpenDeleteModal={(request) => setShowDeleteModal(request)}
        onOpenMovePicker={(request) => setShowMovePicker(request)}
        onClose={() => setContextMenu(null)}
      />
    )
  }

  // ==================================================================
  // SIDEBAR MODALS (delete / color / move)
  // ==================================================================
  function renderSidebarModals() {
    const modalOverlay = 'fixed inset-0 z-[70] flex items-center justify-center bg-[rgb(8_7_15_/_0.45)] p-4 backdrop-blur-sm animate-fade-in'
    const modalCard = 'glass-strong animate-rise-in w-full max-w-md rounded-3xl p-5'
    const ghostBtn = 'glass-btn h-9 px-4 text-[13px]'
    const dangerBtn = 'focus-ring inline-flex h-9 items-center justify-center rounded-full bg-danger px-4 text-[13px] font-semibold text-background transition-opacity hover:opacity-90'
    const modalTitleCls = 'text-[15px] font-semibold tracking-[-0.01em] text-foreground'
    const modalSubCls = 'mt-0.5 text-[13px] leading-5 text-muted'
    const pickerRowCls = 'glass-row h-8 w-full gap-2.5 px-2 text-[13px]'
    const neutralTileCls = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-active text-muted'

    return (
      <SidebarPortal>
        {/* ========== MOVE PICKER MODAL ========== */}
        {showMovePicker && (
          <div className={modalOverlay} role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setShowMovePicker(null) }}>
            <div role="dialog" aria-modal="true" aria-label="Move item" className="glass-strong animate-rise-in flex max-h-[65vh] w-full max-w-md flex-col overflow-hidden rounded-3xl">
              <div className="px-5 pb-2.5 pt-5">
                <h3 className={modalTitleCls}>
                  {showMovePicker.type === 'note-to-folder' && 'Move note to folder'}
                  {showMovePicker.type === 'note-to-project' && 'Move note to project'}
                  {showMovePicker.type === 'folder-to-project' && 'Move folder to project'}
                </h3>
                <p className="mb-3 mt-0.5 truncate text-xs text-muted">
                  Moving &ldquo;{showMovePicker.name}&rdquo;
                </p>
                <div className="relative">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    ref={movePickerSearchRef}
                    type="text"
                    value={movePickerSearch}
                    onChange={(e) => setMovePickerSearch(e.target.value)}
                    placeholder="Search…"
                    aria-label="Search destinations"
                    className="glass-input h-9 pl-8 pr-3 text-[13px]"
                  />
                </div>
              </div>
              <div className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-2.5">
                {/* Note-to-Folder picker */}
                {showMovePicker.type === 'note-to-folder' && (
                  <>
                    <button
                      onClick={async () => {
                        if (onMoveNote) { try { await onMoveNote(showMovePicker.id, null) } catch {} }
                        setShowMovePicker(null)
                      }}
                      className={pickerRowCls}
                    >
                      <span className={neutralTileCls} aria-hidden="true">
                        <Home size={12} />
                      </span>
                      <span className="flex-1 truncate">Root (no folder)</span>
                    </button>
                    {flatAllFolders
                      .filter(f => movePickerSearch ? f.folder.name.toLowerCase().includes(movePickerSearch.toLowerCase()) : true)
                      .map(({ folder, depth, projectName }) => (
                        <button
                          key={folder.id}
                          onClick={async () => {
                            if (onMoveNote) { try { await onMoveNote(showMovePicker.id, folder.id) } catch {} }
                            setShowMovePicker(null)
                          }}
                          className={pickerRowCls}
                          style={{ paddingLeft: `${depth * 16 + 10}px` }}
                        >
                          <span className={neutralTileCls} aria-hidden="true">
                            <FolderTreeIcon size={12} />
                          </span>
                          <span className="flex-1 truncate">{folder.name}</span>
                          <span className="shrink-0 text-[11px] text-muted">{projectName}</span>
                        </button>
                      ))
                    }
                  </>
                )}

                {/* Note-to-Project picker */}
                {showMovePicker.type === 'note-to-project' && (
                  <>
                    <button
                      onClick={async () => {
                        if (onMoveNoteToProject) { try { await onMoveNoteToProject(showMovePicker.id, null) } catch {} }
                        setShowMovePicker(null)
                      }}
                      className={pickerRowCls}
                    >
                      <UnfiledGlyph />
                      <span className="flex-1 truncate">Unfiled</span>
                    </button>
                    {projects
                      .filter(p => movePickerSearch ? p.name.toLowerCase().includes(movePickerSearch.toLowerCase()) : true)
                      .map(p => (
                        <button
                          key={p.id}
                          onClick={async () => {
                            if (onMoveNoteToProject) { try { await onMoveNoteToProject(showMovePicker.id, p.id) } catch {} }
                            setShowMovePicker(null)
                          }}
                          className={pickerRowCls}
                        >
                          <ProjectGlyph color={p.color ?? NEUTRAL_DOT} name={p.name} />
                          <span className="flex-1 truncate">{p.name}</span>
                        </button>
                      ))
                    }
                  </>
                )}

                {/* Folder-to-Project picker */}
                {showMovePicker.type === 'folder-to-project' && (
                  <>
                    <button
                      onClick={async () => {
                        if (onMoveFolderToProject) { try { await onMoveFolderToProject(showMovePicker.id, null) } catch {} }
                        setShowMovePicker(null)
                      }}
                      className={pickerRowCls}
                    >
                      <UnfiledGlyph />
                      <span className="flex-1 truncate">Unfiled</span>
                    </button>
                    {projects
                      .filter(p => movePickerSearch ? p.name.toLowerCase().includes(movePickerSearch.toLowerCase()) : true)
                      .map(p => (
                        <button
                          key={p.id}
                          onClick={async () => {
                            if (onMoveFolderToProject) { try { await onMoveFolderToProject(showMovePicker.id, p.id) } catch {} }
                            setShowMovePicker(null)
                          }}
                          className={pickerRowCls}
                        >
                          <ProjectGlyph color={p.color ?? NEUTRAL_DOT} name={p.name} />
                          <span className="flex-1 truncate">{p.name}</span>
                        </button>
                      ))
                    }
                  </>
                )}
              </div>
              <div className="border-t border-border px-4 py-2">
                <button
                  onClick={() => setShowMovePicker(null)}
                  className="focus-ring w-full rounded-xl py-2 text-center text-[13px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========== DELETE CONFIRMATION MODAL ========== */}
        {showDeleteModal && (
          <div className={modalOverlay} role="presentation">
            <div role="dialog" aria-modal="true" aria-label="Confirm delete" className={modalCard}>
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-danger-light">
                  <Trash2 size={18} className="text-danger" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={modalTitleCls}>
                    Delete {showDeleteModal.type === 'folder' ? 'folder' : showDeleteModal.type === 'project' ? 'project' : 'note'}?
                  </h3>
                  <p className={modalSubCls}>
                    Are you sure you want to delete &quot;{showDeleteModal.name}&quot;?
                    {showDeleteModal.type === 'folder' && (
                      <span className="mt-1 block">Notes inside will be moved to the root level.</span>
                    )}
                    {showDeleteModal.type === 'project' && (
                      <span className="mt-1 block">Folders and notes inside will become unfiled.</span>
                    )}
                    {showDeleteModal.type === 'note' && (
                      <span className="mt-1 block">This action cannot be undone.</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setShowDeleteModal(null)} className={ghostBtn}>
                  Cancel
                </button>
                <button onClick={handleConfirmDelete} className={dangerBtn}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========== COLOR PICKER MODAL ========== */}
        {showColorPicker && onUpdateProjectColor && (
          <div className={modalOverlay} role="presentation">
            <div role="dialog" aria-modal="true" aria-label="Project color" className="glass-strong animate-rise-in w-full max-w-sm rounded-3xl p-5">
              <h3 className={modalTitleCls}>Project color</h3>
              <p className="mb-4 mt-0.5 text-[13px] text-muted">Choose a color for this project</p>
              <div className="mb-4 grid grid-cols-6 gap-2">
                {[
                  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E',
                  '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7',
                  '#D946EF', '#EC4899', '#F43F5E', '#6B7280', '#78716C', '#0EA5E9',
                ].map(color => (
                  <button
                    key={color}
                    onClick={() => {
                      onUpdateProjectColor(showColorPicker.projectId, color)
                      setShowColorPicker(null)
                    }}
                    className={`focus-ring relative flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110 ${
                      showColorPicker.currentColor === color
                        ? 'ring-2 ring-accent ring-offset-2 ring-offset-background'
                        : ''
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                    aria-label={`Use ${color} for this project`}
                    aria-pressed={showColorPicker.currentColor === color}
                  >
                    {showColorPicker.currentColor === color && (
                      <Check size={14} strokeWidth={3} style={{ color: readableOnColor(color) }} />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-end">
                <button onClick={() => setShowColorPicker(null)} className={ghostBtn}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </SidebarPortal>
    )
  }
}
