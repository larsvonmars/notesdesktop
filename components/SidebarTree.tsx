'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  ChevronRight,
  ChevronsUpDown,
  ChevronDown,
  FolderTree as FolderTreeIcon,
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
  Edit3,
  Trash2,
  Copy,
  Home,
  X,
  Palette,
  ArrowRightLeft,
  LayoutDashboard,
  FolderInput,
  FolderOpen,
  Hash,
  Clock,
  Inbox,
  PanelLeftClose,
  Archive,
  type LucideIcon,
} from 'lucide-react'
import type { Note } from './NoteEditor'
import type { FolderNode } from '@/lib/folders'
import type { Project } from '@/lib/projects'
import type { NoteType } from '@/lib/notes'
import { getNoteTypePresentation, getOrderedNoteTypePresentations, type NoteTypeIconKey } from '@/lib/note-types'

const NOTE_TYPE_ICON_MAP: Record<NoteTypeIconKey, LucideIcon> = {
  'file-text': FileText,
  'pen-tool': PenTool,
  network: Network,
  'book-open': BookOpen,
  'table-2': Table2,
  'file-pen-line': FilePenLine,
}

// Drag data types
const DRAG_TYPE_NOTE = 'application/x-note-id'
const DRAG_TYPE_FOLDER = 'application/x-folder-id'

// A combined tree node representing projects as top-level groupings
export interface ProjectTreeNode {
  project: Project | null // null = "Unfiled"
  folders: FolderNode[]
  notes: Note[] // notes at the project root (folder_id == null)
}

export interface SidebarTreeProps {
  projects: Project[]
  folderTree: FolderNode[]
  allNotes: Note[]
  selectedNoteId?: string
  selectedFolderId: string | null
  selectedProjectId: string | null
  onSelectNote: (note: Note) => void
  onSelectFolder: (folderId: string | null) => void
  onNewNote: (noteType?: string, folderId?: string | null, projectId?: string | null) => void
  onCreateFolder: (parentId: string | null, projectId?: string | null) => void
  onRenameFolder: (folderId: string, newName: string) => void
  onDeleteFolder: (folderId: string) => void
  onMoveFolder?: (folderId: string, newParentId: string | null) => void
  onMoveFolderToProject?: (folderId: string, projectId: string | null) => void
  onDuplicateNote?: (note: Note) => void
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

  // Drag-and-drop state
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null)
  const dragCounterRef = useRef<Map<string, number>>(new Map())

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; type: 'folder' | 'note' | 'project'; id: string; name: string; projectId?: string | null
  } | null>(null)

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

  // Close filter panel on outside click
  useEffect(() => {
    if (!showFilterPanel) return
    const handler = (e: MouseEvent) => {
      if (searchInputRef.current && !searchInputRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false)
      }
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

  const getNotesForFolder = useCallback((folderId: string): Note[] => {
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

  const expandAll = useCallback(() => {
    const allFolderIds = new Set<string>()
    const allProjectIds = new Set<string>()
    const walk = (nodes: FolderNode[]) => {
      for (const n of nodes) {
        allFolderIds.add(n.id)
        walk(n.children)
      }
    }
    walk(folderTree)
    for (const p of projects) allProjectIds.add(p.id)
    allProjectIds.add('__UNFILED__')
    setExpandedFolders(allFolderIds)
    setExpandedProjects(allProjectIds)
  }, [folderTree, projects])

  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set())
    setExpandedProjects(new Set())
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

  const handleNoteContextMenu = useCallback((e: React.MouseEvent, note: Note) => {
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

  const noteMatchesFilters = useCallback((note: Note): boolean => {
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

  const getNoteLocationMeta = useCallback((note: Note): { projectName: string; projectColor: string; folderPath: string } => {
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

  // ---- NOTE TYPE ICON ----

  const NoteIcon = ({ noteType, size = 15, className = '' }: { noteType?: NoteType; size?: number; className?: string }) => {
    const presentation = getNoteTypePresentation(noteType)
    const Icon = NOTE_TYPE_ICON_MAP[presentation.iconKey]
    return <Icon size={size} className={`${presentation.iconClassName} ${className}`} />
  }

  // ---- SHARED VISUAL HELPERS ----
  const rowHeightCls = dense ? 'h-7' : 'min-h-[44px]'
  // Actions become visible on hover for dense (desktop) rows; always visible on touch.
  const revealActionsCls = dense
    ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity'
    : 'opacity-100'

  const actionBtnCls = `flex h-6 w-6 items-center justify-center rounded-md text-muted/70 transition-colors hover:bg-surface-active/70 hover:text-foreground ${revealActionsCls}`
  // Two-line result rows (name + location subtitle) need auto height, not the
  // fixed single-line row height.
  const searchRowCls = dense ? 'min-h-[34px] py-[5px]' : 'min-h-[52px] py-2'

  // ==================================================================
  // NOTE ROW
  // ==================================================================
  const renderNoteItem = (n: Note, indent: number = 0) => {
    if (!matchesSearch(n.title || 'Untitled')) return null
    const isActive = selectedNoteId === n.id
    const noteProject = projects.find(p => p.id === n.project_id)
    const isDragging = dragPayload?.type === 'note' && dragPayload.id === n.id
    const presentation = getNoteTypePresentation(n.note_type)
    return (
      <div
        role="button"
        tabIndex={0}
        key={n.id}
        draggable
        onDragStart={(e) => handleDragStart(e, { type: 'note', id: n.id })}
        onDragEnd={handleDragEnd}
        onClick={() => onSelectNote(n)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNote(n) }
        }}
        onContextMenu={(e) => handleNoteContextMenu(e, n)}
        title={n.title || 'Untitled'}
        className={`group relative flex w-full cursor-pointer items-center gap-2 rounded-md pr-1.5 transition-colors ${rowHeightCls} ${
          isDragging ? 'opacity-40' : ''
        } ${
          isActive
            ? 'bg-surface-active/70 font-medium text-foreground'
            : 'text-foreground/70 hover:bg-surface-hover hover:text-foreground'
        }`}
        style={{ paddingLeft: `${indent}px` }}
      >
        <NoteIcon noteType={n.note_type} size={15} className={isActive ? '' : 'opacity-80'} />
        <span className={`flex-1 truncate text-[13px] leading-none ${isActive ? '' : ''}`}>
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
    const folderProject = projects.find(p => p.id === folder.project_id)
    const isRenaming = inlineRename?.type === 'folder' && inlineRename.id === folder.id
    const isDragging = dragPayload?.type === 'folder' && dragPayload.id === folder.id
    const isDropTarget = isDropHighlighted({ kind: 'folder', id: folder.id })
    const canExpand = hasChildren || folderNotes.length > 0

    const folderRow = (
      <div
        role="button"
        tabIndex={0}
        draggable={!isRenaming}
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
        className={`group relative flex w-full cursor-pointer items-center gap-1.5 rounded-md pr-1.5 transition-colors ${rowHeightCls} ${
          isSelected
            ? 'bg-surface-active/70 font-medium text-foreground'
            : 'text-foreground/75 hover:bg-surface-hover hover:text-foreground'
        } ${isDropTarget ? 'ring-2 ring-accent/40 bg-accent/5' : ''} ${isDragging ? 'opacity-40' : ''}`}
      >
        <ChevronRight
          size={14}
          className={`shrink-0 transition-transform duration-200 ${
            isExpanded ? 'rotate-90 text-foreground/70' : canExpand ? 'text-muted/40 group-hover:text-muted/70' : 'text-transparent'
          }`}
        />
        <FolderTreeIcon
          size={15}
          className={`shrink-0 ${isSelected || isExpanded || isOnActivePath ? 'text-foreground/70' : 'text-muted/45'}`}
        />

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
            className="min-w-0 flex-1 rounded-md border border-accent/40 bg-surface px-1.5 py-0.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent"
          />
        ) : (
          <span className={`flex-1 truncate text-[13px] ${isOnActivePath ? 'font-medium text-foreground' : ''}`}>
            {folder.name}
          </span>
        )}

        {!isRenaming && (
          <>
            {totalCount > 0 && (
              <span className={`shrink-0 text-[10px] font-medium tabular-nums text-muted/50 ${revealActionsCls}`}>
                {totalCount}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-0.5">
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

        {/* Expanded children with indent guide */}
        {isExpanded && (hasChildren || folderNotes.length > 0) && (
          <div className="relative ml-[15px] space-y-0.5 border-l border-border/40 pl-[7px]">
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
    const glyph =
      node.project
        ? node.project.name.slice(0, 2).toUpperCase()
        : null

    return (
      <div key={projectKey}>
        {/* Project header */}
        <div
          role="button"
          tabIndex={0}
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
          className={`group relative flex w-full cursor-pointer items-center gap-2 rounded-md pr-1.5 transition-colors ${rowHeightCls} ${
            isActiveProject || isSelectedProject
              ? 'bg-surface-active/70 font-medium text-foreground'
              : 'text-foreground/75 hover:bg-surface-hover hover:text-foreground'
          } ${isDropHere ? 'ring-2 ring-accent/40 bg-accent/5' : ''}`}
        >
          <ChevronRight
            size={14}
            className={`shrink-0 transition-transform duration-200 ${
              isExpanded ? 'rotate-90 text-foreground/70' : hasChildren ? 'text-muted/40 group-hover:text-muted/70' : 'text-transparent'
            }`}
          />
          {node.project ? (
            <span
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[8px] font-bold text-white"
              style={{ backgroundColor: projectColor }}
            >
              {glyph}
            </span>
          ) : (
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-surface-active text-muted">
              <Inbox size={11} />
            </span>
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
              className="min-w-0 flex-1 rounded-md border border-accent/40 bg-surface px-1.5 py-0.5 text-[13px] font-medium focus:outline-none focus:ring-1 focus:ring-accent"
            />
          ) : (
            <span className="flex-1 truncate text-[13px]">
              {projectName}
            </span>
          )}

          {!isRenaming && (
            <div className="flex shrink-0 items-center gap-0.5">
              {totalNoteCount > 0 && (
                <span className={`text-[10px] font-medium tabular-nums text-muted/50 ${revealActionsCls}`}>
                  {totalNoteCount}
                </span>
              )}
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
          )}
        </div>

        {/* Project content (expanded) */}
        {isExpanded && hasChildren && (
          <div className="relative ml-[17px] space-y-0.5 border-l border-border/40 pl-[7px]">
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
      <section className="mb-0.5">
        <div className="flex items-center gap-1.5 px-2 pb-1 pt-2">
          <Clock size={11} className="text-muted/50" />
          <span className="text-[11px] font-medium text-muted/70">Recent</span>
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
                onClick={() => onSelectNote(note)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNote(note) } }}
                className={`group relative flex w-full cursor-pointer items-center gap-2 rounded-md pr-1.5 transition-colors ${rowHeightCls} ${
                  isActive
                    ? 'bg-surface-active/70 font-medium text-foreground'
                    : 'text-foreground/70 hover:bg-surface-hover hover:text-foreground'
                }`}
                title={note.title || 'Untitled'}
              >
                <NoteIcon noteType={note.note_type} size={15} className="opacity-80" />
                <span className="flex-1 truncate text-[13px]">{note.title || 'Untitled'}</span>
                {noteProject && (
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
  const sectionLabel = 'px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted/50'

  const renderSearchResults = () => {
    if (totalResultCount === 0) {
      return (
        <div className="px-3 py-10 text-center">
          <Search size={18} className="mx-auto mb-2 text-muted/40" />
          <div className="text-[13px] text-muted/80">No results found</div>
          <div className="mt-0.5 text-xs text-muted/50">Try a different search or clear your filters</div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
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
            <div className={`flex items-center gap-1.5 ${sectionLabel}`}>
              <Hash size={11} className="text-muted/40" />
              <span>Projects</span>
              <span className="text-[10px] text-muted/40">{filteredProjects.length}</span>
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
                    className={`group flex w-full cursor-pointer items-center gap-2 rounded-md pr-1.5 transition-colors ${searchRowCls} ${
                      isActive
                        ? 'bg-surface-active/70 font-medium text-foreground'
                        : 'text-foreground/75 hover:bg-surface-hover hover:text-foreground'
                    }`}
                  >
                    <span
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[8px] font-bold text-white"
                      style={{ backgroundColor: project.color ?? NEUTRAL_DOT }}
                    >
                      {project.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{project.name}</div>
                      <div className="truncate text-[10px] text-muted/50">
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
            <div className={`flex items-center gap-1.5 ${sectionLabel}`}>
              <FolderTreeIcon size={11} className="text-muted/40" />
              <span>Folders</span>
              <span className="text-[10px] text-muted/40">{filteredFolders.length}</span>
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
                    className={`group flex w-full cursor-pointer items-center gap-2 rounded-md pr-1.5 transition-colors ${searchRowCls} ${
                      isActive
                        ? 'bg-surface-active/70 font-medium text-foreground'
                        : 'text-foreground/75 hover:bg-surface-hover hover:text-foreground'
                    }`}
                  >
                    <FolderTreeIcon size={15} className="shrink-0 text-muted/45" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{folder.name}</div>
                      <div className="flex items-center gap-1 truncate text-[10px] text-muted/50">
                        <span className="shrink-0 font-medium" style={{ color: projectColor }}>{projectName}</span>
                        {depth > 0 && (
                          <>
                            <ChevronRight size={9} className="shrink-0 text-muted/40" />
                            <span>nested</span>
                          </>
                        )}
                        <span className="shrink-0">{noteCount} note{noteCount !== 1 ? 's' : ''}</span>
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
            <div className={`flex items-center gap-1.5 ${sectionLabel}`}>
              <FileText size={11} className="text-muted/40" />
              <span>Notes</span>
              <span className="text-[10px] text-muted/40">{filteredNotes.length}</span>
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
                    draggable
                    onDragStart={(e) => handleDragStart(e, { type: 'note', id: note.id })}
                    onDragEnd={handleDragEnd}
                    onClick={() => onSelectNote(note)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNote(note) } }}
                    onContextMenu={(e) => handleNoteContextMenu(e, note)}
                    className={`group flex w-full cursor-pointer items-center gap-2 rounded-md pr-1.5 transition-colors ${searchRowCls} ${
                      isActive
                        ? 'bg-surface-active/70 font-medium text-foreground'
                        : 'text-foreground/75 hover:bg-surface-hover hover:text-foreground'
                    }`}
                  >
                    <NoteIcon noteType={note.note_type} size={15} className="opacity-80" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{note.title || 'Untitled'}</div>
                      <div className="flex items-center gap-1 truncate text-[10px] text-muted/50">
                        <span className="shrink-0 font-medium" style={{ color: projectColor }}>{projectName}</span>
                        {folderPath && (
                          <>
                            <ChevronRight size={9} className="shrink-0 text-muted/40" />
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
    const railBtn = 'flex h-9 w-9 items-center justify-center rounded-lg text-muted/70 transition-colors hover:bg-surface-hover hover:text-foreground'
    const railDotBtn = 'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-hover'
    const activeNoteProject = activeNote ? projects.find(p => p.id === activeNote.project_id) : undefined

    return (
      <>
        <div className="flex h-full w-full flex-col items-center">
          {/* Logo — click to expand */}
          <div className="px-1.5 pt-3 pb-2">
            <button
              onClick={onToggleCollapsed}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-[13px] font-bold text-background transition-all hover:opacity-80"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              N
            </button>
          </div>

          <div className="w-8 border-t border-border/40" />

          {/* Projects rail */}
          <nav className="flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-1.5 py-2.5 scrollbar-hide">
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
                  className={railDotBtn}
                >
                  <span
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-[9px] font-bold text-white transition-transform group-hover:scale-105"
                    style={{ backgroundColor: color, boxShadow: isActive ? '0 0 0 2px color-mix(in srgb, ' + color + ' 35%, transparent)' : undefined }}
                  >
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                </button>
              )
            })}

            {/* Unfiled (always shown as a fallback) */}
            <button
              onClick={() => { onToggleCollapsed(); onSelectFolder(null) }}
              title="Unfiled"
              className={`${railDotBtn} ${!activeNoteProject ? 'bg-surface-active/70 text-foreground' : ''}`}
            >
              <Home size={17} />
            </button>
          </nav>

          {/* Bottom actions */}
          <div className="flex flex-col items-center gap-0.5 border-t border-border/40 px-1.5 py-2">
            <button
              onClick={() => { onToggleCollapsed(); onNewNote() }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted/80 transition-colors hover:bg-surface-hover hover:text-foreground"
              title="New note"
              aria-label="New note"
            >
              <Plus size={17} />
            </button>
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
          </div>
        </div>

        {/* ========== CONTEXT MENU ========== */}
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
            <div
              className="fixed z-[60] min-w-[220px] overflow-y-auto rounded-lg border border-border/70 bg-surface py-1 shadow-xl"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              {renderContextMenuContent()}
            </div>
          </>
        )}
        {renderSidebarModals()}
      </>
    )
  }

  // ==================================================================
  // EXPANDED VIEW
  // ==================================================================
  const hasAnyContent = projectTree.some(pt => pt.folders.length > 0 || pt.notes.length > 0)

  return (
    <>
      <div className="flex h-full w-full flex-col overflow-hidden">
        {/* ==== Workspace header ==== */}
        {showHeader && (
          <div className="group/header flex shrink-0 items-center gap-0.5 px-2 pb-1.5 pt-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1">
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-foreground text-[10px] font-bold text-background">
                N
              </span>
              <span className="truncate text-[13px] font-semibold text-foreground/90">MindViz Notes</span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/header:opacity-100 focus-within:opacity-100">
              <button
                onClick={expandAll}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted/60 transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="Expand all"
                title="Expand all"
              >
                <ChevronsUpDown size={14} />
              </button>
              <button
                onClick={collapseAll}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted/60 transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="Collapse all"
                title="Collapse all"
              >
                <ChevronsUpDown size={14} className="-scale-y-100" />
              </button>
              <button
                onClick={onToggleCollapsed}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted/60 transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="Collapse sidebar"
                title="Collapse sidebar (Ctrl/Cmd + \\)"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ==== Search ==== */}
        <div className="relative shrink-0 px-2 pb-1.5">
          <div className="flex items-center gap-1">
            <div className="relative min-w-0 flex-1">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/50" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="h-8 w-full rounded-lg border border-transparent bg-surface-hover/80 pl-8 pr-7 text-[13px] text-foreground placeholder:text-muted/50 transition-colors focus:border-accent/30 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/15"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted/60 hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilterPanel(v => !v)}
              title="Filter results"
              aria-label="Toggle filters"
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                showFilterPanel || activeFilterCount > 0
                  ? 'bg-surface-active/60 text-foreground'
                  : 'text-muted/50 hover:bg-surface-hover hover:text-foreground'
              }`}
            >
              <SlidersHorizontal size={14} />
              {activeFilterCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-accent-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter panel */}
          {showFilterPanel && (
            <div className="absolute left-2 right-2 top-full z-30 mt-1 space-y-2.5 rounded-lg border border-border/70 bg-surface p-2.5 shadow-lg">
              <div>
                <div className="mb-1.5 px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted/60">Type</div>
                <div className="flex flex-wrap gap-1">
                  {allNoteTypePresentations.map(tp => {
                    const Icon = NOTE_TYPE_ICON_MAP[tp.iconKey]
                    const active = filterNoteTypes.has(tp.id)
                    return (
                      <button
                        key={tp.id}
                        onClick={() => toggleNoteTypeFilter(tp.id)}
                        title={tp.label}
                        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                          active
                            ? 'bg-accent/10 text-accent'
                            : 'text-muted/80 hover:bg-surface-hover hover:text-foreground'
                        }`}
                      >
                        <Icon size={12} className={active ? '' : 'opacity-70'} />
                        {tp.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {projects.length > 0 && (
                <div>
                  <div className="mb-1.5 px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted/60">Project</div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => toggleProjectFilter('__UNFILED__')}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        filterProjectIds.has('__UNFILED__')
                          ? 'bg-accent/10 text-accent'
                          : 'text-muted/80 hover:bg-surface-hover hover:text-foreground'
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
                          className={`flex max-w-[110px] items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            active
                              ? 'bg-accent/10 text-accent'
                              : 'text-muted/80 hover:bg-surface-hover hover:text-foreground'
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

              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 px-0.5 text-[11px] font-medium text-muted transition-colors hover:text-danger"
                >
                  <X size={11} /> Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* ==== New dropdown ==== */}
        <div className="shrink-0 px-2 pb-2" ref={newMenuRef}>
          <div className="relative">
            <div className="flex items-stretch overflow-hidden rounded-lg border border-border/70">
              <button
                onClick={() => { setNewMenuOpen(false); onNewNote() }}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <Plus size={14} />
                New note
              </button>
              <div className="w-px bg-border/70" />
              <button
                onClick={() => setNewMenuOpen(v => !v)}
                className="flex h-8 w-8 items-center justify-center text-muted/70 transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="More new options"
                aria-expanded={newMenuOpen}
                title="Choose a note type"
              >
                <ChevronDown size={14} className={`transition-transform duration-200 ${newMenuOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {newMenuOpen && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-border/70 bg-surface py-1 shadow-xl">
                <div className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted/50">New note</div>
                {allNoteTypePresentations.map(tp => {
                  const Icon = NOTE_TYPE_ICON_MAP[tp.iconKey]
                  return (
                    <button
                      key={tp.id}
                      onClick={() => { setNewMenuOpen(false); onNewNote(tp.id) }}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-surface-hover"
                    >
                      <Icon size={15} className={`shrink-0 ${tp.iconClassName}`} />
                      <span className="text-[13px] text-foreground/85">{tp.pickerLabel}</span>
                    </button>
                  )
                })}
                <div className="mx-2 my-1 border-t border-border/60" />
                <button
                  onClick={() => { setNewMenuOpen(false); onCreateFolder(null) }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <FolderPlus size={15} className="shrink-0 text-muted/70" />
                  <span className="text-[13px] text-foreground/85">New folder</span>
                </button>
                {onCreateProject && (
                  <button
                    onClick={() => { setNewMenuOpen(false); onCreateProject() }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-surface-hover"
                  >
                    <Plus size={15} className="shrink-0 text-muted/70" />
                    <span className="text-[13px] text-foreground/85">New project</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ==== Scrollable nav ==== */}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {isFilterActive ? (
            renderSearchResults()
          ) : (
            <nav className="pb-1">
              {renderRecentList()}

              {hasAnyContent ? (
                <div className="space-y-0.5">
                  {projectTree.map(node => renderProject(node))}
                </div>
              ) : (
                <div className="mx-1 mt-2 rounded-lg border border-dashed border-border/80 px-3 py-5 text-center">
                  <div className="text-[13px] font-medium text-foreground/80">Get started</div>
                  <p className="mt-0.5 text-xs text-muted/70">Create your first note or organize ideas into folders and projects.</p>
                  <button
                    onClick={() => onNewNote()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
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
        <div className="shrink-0 border-t border-border/50 px-2 py-1.5">
          {onOpenArchive && (
            <button
              onClick={onOpenArchive}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted/80 transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <Archive size={15} className="shrink-0 text-muted/60" />
              <span className="flex-1 text-left">Archive</span>
              {archivedCount > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-active px-1 text-[10px] font-semibold tabular-nums text-foreground/70">
                  {archivedCount}
                </span>
              )}
            </button>
          )}
          {onOpenFileExplorer && (
            <button
              onClick={onOpenFileExplorer}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted/80 transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <FolderOpen size={15} className="shrink-0 text-muted/60" />
              <span className="flex-1 text-left">File Explorer</span>
            </button>
          )}
          {projects.length > 0 && !onOpenFileExplorer && (
            <div className="px-2 py-1 text-[10px] text-muted/40">{projects.length} project{projects.length !== 1 ? 's' : ''}</div>
          )}
        </div>
      </div>

      {/* ========== CONTEXT MENU ========== */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[60] min-w-[220px] overflow-y-auto rounded-lg border border-border/70 bg-surface py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {renderContextMenuContent()}
          </div>
        </>
      )}

      {renderSidebarModals()}
    </>
  )

  // ==================================================================
  // CONTEXT MENU CONTENT (shared by expanded + collapsed)
  // ==================================================================
  function renderContextMenuContent() {
    if (!contextMenu) return null
    const menuItem = 'flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[13px] transition-colors'
    const menuItemNormal = `${menuItem} text-foreground/80 hover:bg-surface-hover`
    const menuItemDanger = `${menuItem} text-danger hover:bg-danger-light`
    const menuDivider = 'mx-2 my-1 border-t border-border/60'

    return (
      <>
        {/* ---- PROJECT CONTEXT MENU ---- */}
        {contextMenu.type === 'project' && (
          <>
            <button
              onClick={() => {
                setInlineRename({ type: 'project', id: contextMenu.id, value: contextMenu.name })
                setContextMenu(null)
              }}
              className={menuItemNormal}
            >
              <Edit3 size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">Rename project</span>
            </button>
            {onUpdateProjectColor && (
              <button
                onClick={() => {
                  const project = projects.find(p => p.id === contextMenu.id)
                  setShowColorPicker({ projectId: contextMenu.id, currentColor: project?.color ?? NEUTRAL_DOT })
                  setContextMenu(null)
                }}
                className={menuItemNormal}
              >
                <Palette size={14} className="shrink-0 text-muted/70" />
                <span className="font-medium">Change color</span>
              </button>
            )}
            {onOpenProjectDashboard && (
              <button
                onClick={() => {
                  onOpenProjectDashboard(contextMenu.id)
                  setContextMenu(null)
                }}
                className={menuItemNormal}
              >
                <LayoutDashboard size={14} className="shrink-0 text-muted/70" />
                <span className="font-medium">Open dashboard</span>
              </button>
            )}
            {onArchiveProject && (
              <button
                onClick={() => {
                  onArchiveProject(contextMenu.id)
                  setContextMenu(null)
                }}
                className={menuItemNormal}
              >
                <Archive size={14} className="shrink-0 text-muted/70" />
                <span className="font-medium">Archive project</span>
              </button>
            )}
            <div className={menuDivider} />
            <button
              onClick={() => { onCreateFolder(null, contextMenu.id); setContextMenu(null) }}
              className={menuItemNormal}
            >
              <FolderPlus size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">New folder</span>
            </button>
            <button
              onClick={() => { onNewNote(undefined, null, contextMenu.id); setContextMenu(null) }}
              className={menuItemNormal}
            >
              <FileText size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">New note</span>
            </button>
            {onDeleteProject && (
              <>
                <div className={menuDivider} />
                <button
                  onClick={() => { setShowDeleteModal({ type: 'project', id: contextMenu.id, name: contextMenu.name }); setContextMenu(null) }}
                  className={menuItemDanger}
                >
                  <Trash2 size={14} className="shrink-0" />
                  <span className="font-medium">Delete project</span>
                </button>
              </>
            )}
          </>
        )}

        {/* ---- FOLDER CONTEXT MENU ---- */}
        {contextMenu.type === 'folder' && (
          <>
            <button
              onClick={() => {
                setInlineRename({ type: 'folder', id: contextMenu.id, value: contextMenu.name })
                setContextMenu(null)
              }}
              className={menuItemNormal}
            >
              <Edit3 size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">Rename</span>
            </button>
            <button
              onClick={() => { onCreateFolder(contextMenu.id, contextMenu.projectId); setContextMenu(null) }}
              className={menuItemNormal}
            >
              <FolderPlus size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">New subfolder</span>
            </button>
            <button
              onClick={() => { onNewNote(undefined, contextMenu.id, contextMenu.projectId); setContextMenu(null) }}
              className={menuItemNormal}
            >
              <FileText size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">New note here</span>
            </button>
            {(onMoveFolderToProject || onMoveFolder) && projects.length > 0 && (
              <>
                <div className={menuDivider} />
                <button
                  onClick={() => {
                    setShowMovePicker({ type: 'folder-to-project', id: contextMenu.id, name: contextMenu.name })
                    setContextMenu(null)
                  }}
                  className={menuItemNormal}
                >
                  <FolderInput size={14} className="shrink-0 text-muted/70" />
                  <span className="font-medium">Move to project…</span>
                </button>
              </>
            )}
            <div className={menuDivider} />
            <button
              onClick={() => { setShowDeleteModal({ type: 'folder', id: contextMenu.id, name: contextMenu.name }); setContextMenu(null) }}
              className={menuItemDanger}
            >
              <Trash2 size={14} className="shrink-0" />
              <span className="font-medium">Delete folder</span>
            </button>
          </>
        )}

        {/* ---- NOTE CONTEXT MENU ---- */}
        {contextMenu.type === 'note' && (
          <>
            {onDuplicateNote && (
              <button
                onClick={() => {
                  const note = allNotes.find(n => n.id === contextMenu.id)
                  if (note) onDuplicateNote(note)
                  setContextMenu(null)
                }}
                className={menuItemNormal}
              >
                <Copy size={14} className="shrink-0 text-muted/70" />
                <span className="font-medium">Duplicate note</span>
              </button>
            )}
            {onMoveNote && (
              <button
                onClick={() => {
                  setShowMovePicker({ type: 'note-to-folder', id: contextMenu.id, name: contextMenu.name })
                  setContextMenu(null)
                }}
                className={menuItemNormal}
              >
                <FolderInput size={14} className="shrink-0 text-muted/70" />
                <span className="font-medium">Move to folder…</span>
              </button>
            )}
            {onMoveNoteToProject && projects.length > 0 && (
              <button
                onClick={() => {
                  setShowMovePicker({ type: 'note-to-project', id: contextMenu.id, name: contextMenu.name })
                  setContextMenu(null)
                }}
                className={menuItemNormal}
              >
                <ArrowRightLeft size={14} className="shrink-0 text-muted/70" />
                <span className="font-medium">Move to project…</span>
              </button>
            )}
            {onDeleteNote && (
              <>
                <div className={menuDivider} />
                <button
                  onClick={() => { setShowDeleteModal({ type: 'note', id: contextMenu.id, name: contextMenu.name }); setContextMenu(null) }}
                  className={menuItemDanger}
                >
                  <Trash2 size={14} className="shrink-0" />
                  <span className="font-medium">Delete note</span>
                </button>
              </>
            )}
          </>
        )}
      </>
    )
  }

  // ==================================================================
  // SIDEBAR MODALS (delete / color / move)
  // ==================================================================
  function renderSidebarModals() {
    const modalOverlay = 'fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4'
    const modalCard = 'w-full max-w-md rounded-xl border border-border/70 bg-surface p-5 shadow-2xl'
    const ghostBtn = 'rounded-lg border border-border px-3.5 py-2 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-surface-hover'
    const dangerBtn = 'rounded-lg bg-danger px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-danger/90'

    return (
      <>
        {/* ========== MOVE PICKER MODAL ========== */}
        {showMovePicker && (
          <div className={modalOverlay} onClick={() => setShowMovePicker(null)}>
            <div className="flex max-h-[65vh] w-full max-w-md flex-col rounded-xl border border-border/70 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 pb-2 pt-4">
                <h3 className="text-[15px] font-semibold text-foreground">
                  {showMovePicker.type === 'note-to-folder' && 'Move note to folder'}
                  {showMovePicker.type === 'note-to-project' && 'Move note to project'}
                  {showMovePicker.type === 'folder-to-project' && 'Move folder to project'}
                </h3>
                <p className="mb-2.5 mt-0.5 truncate text-xs text-muted">
                  Moving &ldquo;{showMovePicker.name}&rdquo;
                </p>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/50" />
                  <input
                    ref={movePickerSearchRef}
                    type="text"
                    value={movePickerSearch}
                    onChange={(e) => setMovePickerSearch(e.target.value)}
                    placeholder="Search…"
                    className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-[13px] text-foreground outline-none transition-colors focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              </div>
              <div className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
                {/* Note-to-Folder picker */}
                {showMovePicker.type === 'note-to-folder' && (
                  <>
                    <button
                      onClick={async () => {
                        if (onMoveNote) { try { await onMoveNote(showMovePicker.id, null) } catch {} }
                        setShowMovePicker(null)
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] text-foreground/80 transition-colors hover:bg-surface-hover"
                    >
                      <Home size={13} className="shrink-0 text-muted/60" />
                      <span>Root (no folder)</span>
                    </button>
                    {flatAllFolders
                      .filter(f => movePickerSearch ? f.folder.name.toLowerCase().includes(movePickerSearch.toLowerCase()) : true)
                      .map(({ folder, depth, projectName, projectColor }) => (
                        <button
                          key={folder.id}
                          onClick={async () => {
                            if (onMoveNote) { try { await onMoveNote(showMovePicker.id, folder.id) } catch {} }
                            setShowMovePicker(null)
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] text-foreground/80 transition-colors hover:bg-surface-hover"
                          style={{ paddingLeft: `${depth * 14 + 12}px` }}
                        >
                          <FolderTreeIcon size={13} className="shrink-0 text-muted/50" />
                          <span className="flex-1 truncate">{folder.name}</span>
                          <span className="shrink-0 text-[10px] font-medium" style={{ color: projectColor }}>{projectName}</span>
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
                      className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] text-foreground/80 transition-colors hover:bg-surface-hover"
                    >
                      <Inbox size={13} className="shrink-0 text-muted/60" />
                      <span>Unfiled</span>
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
                          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] text-foreground/80 transition-colors hover:bg-surface-hover"
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? NEUTRAL_DOT }} />
                          <span className="truncate">{p.name}</span>
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
                      className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] text-foreground/80 transition-colors hover:bg-surface-hover"
                    >
                      <Inbox size={13} className="shrink-0 text-muted/60" />
                      <span>Unfiled</span>
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
                          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] text-foreground/80 transition-colors hover:bg-surface-hover"
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? NEUTRAL_DOT }} />
                          <span className="truncate">{p.name}</span>
                        </button>
                      ))
                    }
                  </>
                )}
              </div>
              <div className="border-t border-border/60 px-4 py-2">
                <button
                  onClick={() => setShowMovePicker(null)}
                  className="w-full rounded-md py-1 text-center text-[13px] font-medium text-muted transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========== DELETE CONFIRMATION MODAL ========== */}
        {showDeleteModal && (
          <div className={modalOverlay}>
            <div className={modalCard}>
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-light">
                  <Trash2 size={18} className="text-danger" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-semibold text-foreground">
                    Delete {showDeleteModal.type === 'folder' ? 'folder' : showDeleteModal.type === 'project' ? 'project' : 'note'}?
                  </h3>
                  <p className="mt-0.5 text-[13px] text-muted">
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
          <div className={modalOverlay}>
            <div className="w-full max-w-sm rounded-xl border border-border/70 bg-surface p-5 shadow-2xl">
              <h3 className="text-[15px] font-semibold text-foreground">Project color</h3>
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
                    className={`h-8 w-8 rounded-full transition-all hover:scale-110 ${
                      showColorPicker.currentColor === color
                        ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface'
                        : ''
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
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
      </>
    )
  }
}
