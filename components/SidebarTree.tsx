'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  FolderTree as FolderTreeIcon,
  FileText,
  PenTool,
  Network,
  BookOpen,
  Table2,
  FilePenLine,
  Plus,
  MoreVertical,
  Search,
  SlidersHorizontal,
  FolderPlus,
  Edit2,
  Trash2,
  Copy,
  Home,
  X,
  Palette,
  ArrowRightLeft,
  LayoutDashboard,
  ChevronsUpDown,
  FolderInput,
  FolderOpen,
  Hash,
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
  collapsed: boolean
  onToggleCollapsed: () => void
}

type DragPayload = { type: 'note'; id: string } | { type: 'folder'; id: string }

type DropTarget =
  | { kind: 'folder'; id: string }
  | { kind: 'project-root'; projectId: string | null }
  | null

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
  collapsed,
  onToggleCollapsed,
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

  // Move-to picker modal (searchable, full list)
  const [showMovePicker, setShowMovePicker] = useState<{
    type: 'note-to-folder' | 'note-to-project' | 'folder-to-project'
    id: string
    name: string
  } | null>(null)
  const [movePickerSearch, setMovePickerSearch] = useState('')
  const movePickerSearchRef = useRef<HTMLInputElement>(null)

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

  const activeProject = useMemo(
    () => projects.find(p => p.id === activeNote?.project_id),
    [projects, activeNote]
  )

  const breadcrumb = useMemo((): string[] => {
    if (!activeNote) return []
    const parts: string[] = []
    if (activeProject) parts.push(activeProject.name)
    if (activeNote.folder_id) {
      const findPath = (ns: FolderNode[], t: string): FolderNode[] | null => {
        for (const n of ns) {
          if (n.id === t) return [n]
          const child = findPath(n.children, t)
          if (child) return [n, ...child]
        }
        return null
      }
      const path = findPath(folderTree, activeNote.folder_id)
      if (path) path.forEach(f => parts.push(f.name))
    }
    return parts
  }, [activeNote, activeProject, folderTree])

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
      const pColor = pt.project?.color ?? '#6B7280'
      walk(pt.folders, 0, pName, pColor)
    }
    return result
  }, [projectTree])

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
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 300),
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
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 300),
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
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 300),
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
    const projectColor = proj?.color ?? '#6B7280'
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

  const NoteIcon = ({ noteType, size = 12 }: { noteType?: NoteType; size?: number }) => {
    const presentation = getNoteTypePresentation(noteType)
    const Icon = NOTE_TYPE_ICON_MAP[presentation.iconKey]
    return <Icon size={size} className={`${presentation.iconClassName} flex-shrink-0`} />
  }

  // ---- RENDER NOTE ITEM ----
  const renderNoteItem = (n: Note, indent: number = 0) => {
    if (!matchesSearch(n.title || 'Untitled')) return null
    const isActive = selectedNoteId === n.id
    const accentColor = activeProject?.color ?? '#6B7280'
    const isDragging = dragPayload?.type === 'note' && dragPayload.id === n.id
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
        className={`group w-full text-left px-2.5 py-2 rounded-xl transition-all duration-200 flex items-start justify-between ${
          isDragging ? 'opacity-50' : ''
        } ${
          isActive
            ? 'bg-alpine-50 dark:bg-alpine-900/30 text-alpine-800 dark:text-alpine-200 font-medium shadow-sm'
            : 'hover:bg-surface-hover/60 text-foreground/70 hover:text-foreground'
        }`}
        style={{
          paddingLeft: `${indent}px`,
          ...(isActive ? { borderLeft: `3px solid ${accentColor}`, paddingLeft: `${Math.max(indent - 3, 5)}px` } : {}),
        }}
        title={n.title || 'Untitled'}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <NoteIcon noteType={n.note_type} />
            <span className="text-xs truncate">{n.title || 'Untitled'}</span>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleNoteContextMenu(e, n) }}
          className="hidden group-hover:flex p-0.5 hover:bg-surface-hover rounded transition-colors flex-shrink-0"
          title="Note options"
        >
          <MoreVertical size={11} />
        </button>
      </div>
    )
  }

  // ---- RENDER FOLDER ----
  const renderFolder = (folder: FolderNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(folder.id)
    const isSelected = selectedFolderId === folder.id
    const hasChildren = folder.children.length > 0
    const folderNotes = getNotesForFolder(folder.id)
    const totalCount = countNotesRecursive(folder)
    const isOnActivePath = activeFolderAncestors.has(folder.id)
    const accentColor = activeProject?.color ?? '#6B7280'
    const isRenaming = inlineRename?.type === 'folder' && inlineRename.id === folder.id
    const isDragging = dragPayload?.type === 'folder' && dragPayload.id === folder.id
    const isDropTarget = isDropHighlighted({ kind: 'folder', id: folder.id })
    const indent = level * 16 + 8

    return (
      <div key={folder.id} className={isDragging ? 'opacity-40' : ''}>
        {/* Folder Header */}
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
          className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all duration-200 ${
            isSelected ? 'bg-accent/10 text-accent font-medium shadow-sm' : 'hover:bg-surface-hover/60 text-foreground/70 hover:text-foreground'
          } ${isDropTarget ? 'ring-2 ring-alpine-400/50 bg-alpine-50/60 dark:bg-alpine-900/30' : ''}`}
          style={{
            paddingLeft: `${indent}px`,
            ...(isOnActivePath ? { borderLeft: `2px solid ${accentColor}`, paddingLeft: `${indent - 2}px` } : {}),
          }}
        >
          <ChevronRight
            size={12}
            className={`flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} ${hasChildren || folderNotes.length > 0 ? 'text-muted' : 'text-transparent'}`}
          />
          <FolderTreeIcon size={12} className={`flex-shrink-0 ${isOnActivePath ? 'text-alpine-500' : isExpanded ? 'text-alpine-500' : 'text-muted'}`} />

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
              className="flex-1 text-xs bg-surface-hover/80 border border-alpine-400/50 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-alpine-500 min-w-0"
            />
          ) : (
            <span className={`text-xs truncate flex-1 ${isOnActivePath ? 'font-medium' : ''}`}>{folder.name}</span>
          )}

          {totalCount > 0 && !isRenaming && (
            <span className="text-[10px] bg-surface-hover text-muted px-1 py-0.5 rounded-full font-semibold flex-shrink-0">
              {totalCount}
            </span>
          )}
          {/* Hover actions */}
          {!isRenaming && (
            <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onNewNote(undefined, folder.id, folder.project_id) }}
                className="p-0.5 hover:bg-surface-hover rounded transition-colors"
                title="New note"
              >
                <Plus size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCreateFolder(folder.id, folder.project_id) }}
                className="p-0.5 hover:bg-surface-hover rounded transition-colors"
                title="New subfolder"
              >
                <FolderPlus size={11} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleFolderContextMenu(e, folder.id, folder.name, folder.project_id) }}
                className="p-0.5 hover:bg-surface-hover rounded transition-colors"
                title="More options"
              >
                <MoreVertical size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {/* Child folders first */}
            {hasChildren && (
              <div className="space-y-0.5">
                {folder.children.map(child => renderFolder(child, level + 1))}
              </div>
            )}

            {/* Notes in this folder */}
            {folderNotes.length > 0 ? (
              <div className="space-y-0.5">
                {folderNotes.map(n => renderNoteItem(n, (level + 1) * 16 + 4))}
              </div>
            ) : !hasChildren ? (
              <div className="text-[10px] text-muted italic py-0.5" style={{ paddingLeft: `${(level + 1) * 16 + 12}px` }}>
                Empty
              </div>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  // ---- RENDER PROJECT ----
  const renderProject = (node: ProjectTreeNode) => {
    const projectKey = node.project?.id ?? '__UNFILED__'
    const projectName = node.project?.name ?? 'Unfiled'
    const projectColor = node.project?.color ?? '#6B7280'
    const isExpanded = expandedProjects.has(projectKey)
    const totalItems = node.folders.length + node.notes.length
    const isActiveProject = node.project?.id === activeNote?.project_id
    const totalNoteCount = node.notes.length + node.folders.reduce((acc, f) => acc + countNotesRecursive(f), 0)
    const isRenaming = inlineRename?.type === 'project' && node.project && inlineRename.id === node.project.id
    const dropTargetHere: DropTarget = { kind: 'project-root', projectId: node.project?.id ?? null }
    const isDropHere = isDropHighlighted(dropTargetHere)

    if (searchQuery && totalItems === 0) return null

    return (
      <div
        key={projectKey}
        className="mb-0.5"
        style={isActiveProject && node.project ? { borderLeft: `3px solid ${projectColor}`, marginLeft: '2px', paddingLeft: '2px', borderRadius: '0 4px 4px 0' } : {}}
      >
        {/* Project Header */}
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
          className={`group flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 hover:bg-surface-hover/60 ${
            isActiveProject ? 'bg-accent/8 shadow-sm' : selectedProjectId === node.project?.id ? 'bg-accent/10' : ''
          } ${isDropHere ? 'ring-2 ring-alpine-400/50 bg-alpine-50/60 dark:bg-alpine-900/30' : ''}`}
        >
          <ChevronRight
            size={12}
            className={`flex-shrink-0 transition-transform duration-200 text-muted ${isExpanded ? 'rotate-90' : ''}`}
          />
          {node.project ? (
            <div
              className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${isActiveProject ? 'ring-2 ring-offset-1 ring-offset-surface' : ''}`}
              style={{ backgroundColor: projectColor, ...(isActiveProject ? { ringColor: projectColor } : {}) }}
            />
          ) : (
            <Home size={12} className="text-muted flex-shrink-0" />
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
              className="flex-1 text-xs font-semibold bg-surface-hover/80 border border-alpine-400/50 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-alpine-500 min-w-0"
            />
          ) : (
            <span className={`truncate flex-1 text-foreground ${isActiveProject ? 'text-sm font-bold' : 'text-xs font-semibold'}`}>{projectName}</span>
          )}

          {totalNoteCount > 0 && !isRenaming && (
            <span className="text-[10px] text-muted flex-shrink-0">{totalNoteCount}</span>
          )}
          {/* Hover actions */}
          {!isRenaming && (
            <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
              {node.project && (
                <>
                  {onOpenProjectDashboard && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenProjectDashboard(node.project!.id) }}
                      className="p-0.5 hover:bg-surface-hover rounded transition-colors"
                      title={`Open ${projectName} dashboard`}
                    >
                      <LayoutDashboard size={12} />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onCreateFolder(null, node.project?.id) }}
                    className="p-0.5 hover:bg-surface-hover rounded transition-colors"
                    title="New folder"
                  >
                    <FolderPlus size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onNewNote(undefined, null, node.project?.id) }}
                    className="p-0.5 hover:bg-surface-hover rounded transition-colors"
                    title={`New note in ${projectName}`}
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleProjectContextMenu(e, node.project!) }}
                    className="p-0.5 hover:bg-surface-hover rounded transition-colors"
                    title="Project options"
                  >
                    <MoreVertical size={11} />
                  </button>
                </>
              )}
              {!node.project && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onCreateFolder(null) }}
                    className="p-0.5 hover:bg-surface-hover rounded transition-colors"
                    title="New folder"
                  >
                    <FolderPlus size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onNewNote(undefined, null, null) }}
                    className="p-0.5 hover:bg-surface-hover rounded transition-colors"
                    title="New note"
                  >
                    <Plus size={12} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Project Content (expanded) */}
        {isExpanded && (
          <div className="space-y-0.5 mt-0.5 ml-1">
            {/* Folders */}
            {node.folders.map(folder => renderFolder(folder, 1))}

            {/* Root-level notes in this project */}
            {node.notes.length > 0 && (
              <div className="space-y-0.5 pl-2">
                {node.notes.map(n => renderNoteItem(n, 20))}
              </div>
            )}

            {node.folders.length === 0 && node.notes.length === 0 && (
              <div className="text-[10px] text-muted italic py-1 pl-6">
                No items
              </div>
            )}
          </div>
        )}
        <div className="mx-2 mt-1.5 mb-0.5" />
      </div>
    )
  }

  // ---- COLLAPSED VIEW ----
  if (collapsed) {
    return (
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-14 border-r border-border/40 bg-surface transition-all duration-300 lg:flex lg:flex-col">
        <div className="flex items-center justify-center px-3 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-alpine-500 to-alpine-600 text-sm font-bold text-white shadow-sm">
            N
          </div>
        </div>
        <nav className="flex-1 flex flex-col items-center gap-2.5 px-2 py-4 overflow-y-auto scrollbar-hide">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={onToggleCollapsed}
              title={p.name}
              className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all duration-200 hover:scale-105 flex-shrink-0 shadow-sm ${
                p.id === activeNote?.project_id
                  ? 'ring-2 ring-offset-2 ring-offset-surface shadow-md scale-105'
                  : 'opacity-60 hover:opacity-100 hover:shadow-md'
              }`}
              style={{
                backgroundColor: p.color ?? '#6B7280',
                ...(p.id === activeNote?.project_id ? { ringColor: p.color ?? '#6B7280' } : {}),
              }}
            >
              <span className="text-[9px] font-bold text-white uppercase">{p.name.slice(0, 2)}</span>
            </button>
          ))}
          <button
            onClick={onToggleCollapsed}
            title="Unfiled"
            className="w-9 h-9 rounded-2xl flex items-center justify-center transition-all duration-200 hover:scale-105 flex-shrink-0 bg-surface-hover/70 border border-border/50 opacity-60 hover:opacity-100 hover:shadow-sm"
          >
            <Home size={13} className="text-muted" />
          </button>
        </nav>
        <div className="px-2 py-3 flex flex-col items-center gap-1">
          <button
            onClick={onToggleCollapsed}
            className="rounded-xl p-2 text-muted/70 transition-all duration-200 hover:bg-surface-hover/70 hover:text-foreground hover:shadow-sm"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
    )
  }

  // ---- EXPANDED VIEW ----
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] border-r border-border/40 bg-surface transition-all duration-300 lg:flex lg:flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <img src="/icon-192.png" alt="MindViz Notes" className="h-7 w-7 rounded-xl flex-shrink-0 shadow-sm" />
            <span className="truncate text-[13px] font-bold text-foreground tracking-tight">MindViz Notes</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={expandAll}
              className="rounded-lg p-1 text-muted/50 transition-all duration-200 hover:bg-surface-hover/70 hover:text-foreground"
              aria-label="Expand all"
              title="Expand all"
            >
              <ChevronsUpDown size={13} />
            </button>
            <button
              onClick={onToggleCollapsed}
              className="rounded-xl p-1.5 text-muted/70 transition-all duration-200 hover:bg-surface-hover/70 hover:text-foreground"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeft size={15} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 pt-1 pb-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/60" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes, folders, projects..."
                className="w-full pl-8 pr-7 py-2 text-xs border-0 rounded-xl bg-surface-hover/50 focus:outline-none focus:ring-2 focus:ring-alpine-500/25 focus:bg-surface-hover/80 text-foreground placeholder:text-muted/60 transition-all duration-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilterPanel(v => !v)}
              title="Toggle filters"
              className={`relative flex-shrink-0 rounded-xl p-2 transition-all duration-200 ${
                showFilterPanel || activeFilterCount > 0
                  ? 'bg-alpine-100 dark:bg-alpine-900/40 text-alpine-600 dark:text-alpine-300 shadow-sm'
                  : 'text-muted/60 hover:bg-surface-hover/70 hover:text-foreground'
              }`}
            >
              <SlidersHorizontal size={14} />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-alpine-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter panel */}
          {showFilterPanel && (
            <div className="space-y-2">
              <div>
                <div className="text-[9px] font-semibold uppercase text-muted mb-1 tracking-wide">Type</div>
                <div className="flex flex-wrap gap-1">
                  {allNoteTypePresentations.map(tp => {
                    const Icon = NOTE_TYPE_ICON_MAP[tp.iconKey]
                    const active = filterNoteTypes.has(tp.id)
                    return (
                      <button
                        key={tp.id}
                        onClick={() => toggleNoteTypeFilter(tp.id)}
                        title={tp.label}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all duration-200 ${
                          active
                            ? 'border-alpine-500/50 bg-alpine-50 dark:bg-alpine-900/30 text-alpine-700 dark:text-alpine-300 shadow-sm'
                            : 'border-border/50 bg-surface-hover/40 text-muted/80 hover:border-alpine-400/50 hover:text-foreground'
                        }`}
                      >
                        <Icon size={10} className={active ? '' : 'opacity-70'} />
                        {tp.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {projects.length > 0 && (
                <div>
                  <div className="text-[9px] font-semibold uppercase text-muted mb-1 tracking-wide">Project</div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => toggleProjectFilter('__UNFILED__')}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all duration-200 ${
                        filterProjectIds.has('__UNFILED__')
                          ? 'border-alpine-500/50 bg-alpine-50 dark:bg-alpine-900/30 text-alpine-700 dark:text-alpine-300 shadow-sm'
                          : 'border-border/50 bg-surface-hover/40 text-muted/80 hover:border-alpine-400/50 hover:text-foreground'
                      }`}
                    >
                      <Home size={9} />
                      Unfiled
                    </button>
                    {projects.map(p => {
                      const active = filterProjectIds.has(p.id)
                      return (
                        <button
                          key={p.id}
                          onClick={() => toggleProjectFilter(p.id)}
                          title={p.name}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all duration-200 ${
                            active
                              ? 'border-alpine-500/50 bg-alpine-50 dark:bg-alpine-900/30 text-alpine-700 dark:text-alpine-300 shadow-sm'
                              : 'border-border/50 bg-surface-hover/40 text-muted/80 hover:border-alpine-400/50 hover:text-foreground'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? '#6B7280' }} />
                          <span className="truncate max-w-[80px]">{p.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-[10px] text-muted hover:text-danger flex items-center gap-1 transition-colors"
                >
                  <X size={10} /> Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Breadcrumb context strip */}
        {activeNote && breadcrumb.length > 0 && (
          <div
            className="mx-3 my-1.5 px-3 py-2 rounded-xl bg-surface-hover/30 flex items-center gap-1 min-w-0 overflow-hidden"
            style={{ borderLeftColor: activeProject?.color ?? '#6B7280', borderLeftWidth: '3px' }}
          >
            <div className="flex items-center gap-1 text-[10px] text-muted truncate flex-1 min-w-0">
              {breadcrumb.map((part, i) => (
                <span key={i} className="flex items-center gap-1 min-w-0">
                  {i > 0 && <ChevronRight size={9} className="flex-shrink-0 text-muted/50" />}
                  <span
                    className={`truncate ${i === 0 ? 'font-semibold' : ''}`}
                    style={i === 0 && activeProject?.color ? { color: activeProject.color } : {}}
                  >
                    {part}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tree Content OR Flat Search Results */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isFilterActive ? (
            <>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {totalResultCount} result{totalResultCount !== 1 ? 's' : ''}
                </span>
                <button onClick={clearAllFilters} className="text-[10px] text-muted hover:text-foreground flex items-center gap-0.5 transition-colors">
                  <X size={9} /> Clear
                </button>
              </div>
              {totalResultCount === 0 ? (
                <div className="text-xs text-muted italic text-center py-8">No results match your search.</div>
              ) : (
                <div className="space-y-1">
                  {/* ---- PROJECT RESULTS ---- */}
                  {filteredProjects.length > 0 && (
                    <div>
                      <div className="px-1 mb-1 flex items-center gap-1.5">
                        <Hash size={10} className="text-muted/60" />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted/70">Projects</span>
                        <span className="text-[9px] text-muted/50">{filteredProjects.length}</span>
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
                              className={`group w-full text-left px-2.5 py-2.5 rounded-xl transition-all duration-200 flex items-start gap-2.5 ${
                                isActive
                                  ? 'bg-alpine-50 dark:bg-alpine-900/30 shadow-sm'
                                  : 'hover:bg-surface-hover/60'
                              }`}
                              style={isActive ? { borderLeft: `3px solid ${project.color ?? '#6B7280'}`, paddingLeft: '7px' } : {}}
                            >
                              <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center shadow-sm" style={{ backgroundColor: project.color ?? '#6B7280' }}>
                                <span className="text-[9px] font-bold text-white uppercase">{project.name.slice(0, 2)}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-xs truncate font-semibold ${
                                  isActive ? 'text-alpine-800 dark:text-alpine-200' : 'text-foreground'
                                }`}>
                                  {project.name}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {project.description && (
                                    <span className="text-[10px] text-muted truncate">{project.description}</span>
                                  )}
                                  {!project.description && (
                                    <span className="text-[10px] text-muted/60">
                                      {folderCount} folder{folderCount !== 1 ? 's' : ''} · {noteCount} note{noteCount !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleProjectContextMenu(e, project) }}
                                className="hidden group-hover:flex p-0.5 hover:bg-surface-hover rounded transition-colors flex-shrink-0 mt-0.5"
                              >
                                <MoreVertical size={11} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ---- FOLDER RESULTS ---- */}
                  {filteredFolders.length > 0 && (
                    <div>
                      <div className="px-1 mb-1 flex items-center gap-1.5">
                        <FolderOpen size={10} className="text-muted/60" />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted/70">Folders</span>
                        <span className="text-[9px] text-muted/50">{filteredFolders.length}</span>
                      </div>
                      <div className="space-y-0.5">
                        {filteredFolders.map(({ folder, depth, projectName, projectColor }) => {
                          const isActive = selectedFolderId === folder.id
                          const noteCount = allNotes.filter(n => n.folder_id === folder.id).length
                          return (
                            <div
                              role="button"
                              tabIndex={0}
                              key={folder.id}
                              onClick={() => {
                                // Expand the parent project
                                const projKey = folder.project_id ?? '__UNFILED__'
                                setExpandedProjects(prev => {
                                  const next = new Set(prev)
                                  next.add(projKey)
                                  return next
                                })
                                // Expand all ancestor folders
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
                              className={`group w-full text-left px-2.5 py-2.5 rounded-xl transition-all duration-200 flex items-start gap-2.5 ${
                                isActive
                                  ? 'bg-alpine-50 dark:bg-alpine-900/30 shadow-sm'
                                  : 'hover:bg-surface-hover/60'
                              }`}
                              style={isActive ? { borderLeft: `3px solid ${projectColor}`, paddingLeft: '7px' } : {}}
                            >
                              <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center bg-surface-hover/80">
                                <FolderTreeIcon size={12} className="text-alpine-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-xs truncate font-medium ${
                                  isActive ? 'text-alpine-800 dark:text-alpine-200' : 'text-foreground'
                                }`}>
                                  {folder.name}
                                </div>
                                <div className="flex items-center gap-1 mt-0.5 min-w-0">
                                  <span className="text-[10px] font-semibold truncate flex-shrink-0" style={{ color: projectColor }}>
                                    {projectName}
                                  </span>
                                  {depth > 0 && (
                                    <>
                                      <ChevronRight size={8} className="text-muted/50 flex-shrink-0" />
                                      <span className="text-[10px] text-muted/50">nested</span>
                                    </>
                                  )}
                                  <span className="text-[10px] text-muted/50 ml-auto flex-shrink-0">{noteCount} note{noteCount !== 1 ? 's' : ''}</span>
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleFolderContextMenu(e, folder.id, folder.name, folder.project_id) }}
                                className="hidden group-hover:flex p-0.5 hover:bg-surface-hover rounded transition-colors flex-shrink-0 mt-0.5"
                              >
                                <MoreVertical size={11} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ---- NOTE RESULTS ---- */}
                  {filteredNotes.length > 0 && (
                    <div>
                      {(filteredFolders.length > 0 || filteredProjects.length > 0) && (
                        <div className="px-1 mb-1 flex items-center gap-1.5">
                          <FileText size={10} className="text-muted/60" />
                          <span className="text-[9px] font-bold uppercase tracking-widest text-muted/70">Notes</span>
                          <span className="text-[9px] text-muted/50">{filteredNotes.length}</span>
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {filteredNotes.map(note => {
                          const { projectName, projectColor, folderPath } = getNoteLocationMeta(note)
                          const isActive = selectedNoteId === note.id
                          const presentation = getNoteTypePresentation(note.note_type)
                          const Icon = NOTE_TYPE_ICON_MAP[presentation.iconKey]
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
                              className={`group w-full text-left px-2.5 py-2.5 rounded-xl transition-all duration-200 flex items-start gap-2.5 ${
                                isActive
                                  ? 'bg-alpine-50 dark:bg-alpine-900/30 shadow-sm'
                                  : 'hover:bg-surface-hover/60'
                              }`}
                              style={isActive ? { borderLeft: `3px solid ${projectColor}`, paddingLeft: '7px' } : {}}
                            >
                              <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center ${presentation.iconBgClassName}`}>
                                <Icon size={12} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-xs truncate font-medium ${
                                  isActive ? 'text-alpine-800 dark:text-alpine-200' : 'text-foreground'
                                }`}>
                                  {note.title || 'Untitled'}
                                </div>
                                <div className="flex items-center gap-1 mt-0.5 min-w-0">
                                  <span className="text-[10px] font-semibold truncate flex-shrink-0" style={{ color: projectColor }}>
                                    {projectName}
                                  </span>
                                  {folderPath && (
                                    <>
                                      <ChevronRight size={8} className="text-muted/50 flex-shrink-0" />
                                      <span className="text-[10px] text-muted truncate">{folderPath}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleNoteContextMenu(e, note) }}
                                className="hidden group-hover:flex p-0.5 hover:bg-surface-hover rounded transition-colors flex-shrink-0 mt-0.5"
                              >
                                <MoreVertical size={11} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-0.5">
              {projectTree.map(node => renderProject(node))}
            </div>
          )}
        </div>

        {/* Footer with New Folder / New Project buttons */}
        <div className="px-3 py-2.5 space-y-0.5">
          <button
            onClick={() => onCreateFolder(null)}
            className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-muted/70 transition-all duration-200 hover:bg-surface-hover/60 hover:text-foreground"
          >
            <FolderPlus className="h-3.5 w-3.5 shrink-0" />
            <span>New Folder</span>
          </button>
          {onCreateProject && (
            <button
              onClick={() => onCreateProject()}
              className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-muted/70 transition-all duration-200 hover:bg-surface-hover/60 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>New Project</span>
            </button>
          )}
          {onOpenFileExplorer && (
            <button
              onClick={onOpenFileExplorer}
              className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-muted/70 transition-all duration-200 hover:bg-surface-hover/60 hover:text-foreground"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              <span>File Explorer</span>
            </button>
          )}
        </div>
      </aside>

      {/* ========== CONTEXT MENU ========== */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[60] bg-surface rounded-2xl shadow-2xl border border-border/40 py-1.5 min-w-[200px] max-h-[400px] overflow-y-auto"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ---- PROJECT CONTEXT MENU ---- */}
            {contextMenu.type === 'project' && (
              <>
                <button
                  onClick={() => {
                    setInlineRename({ type: 'project', id: contextMenu.id, value: contextMenu.name })
                    setContextMenu(null)
                  }}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                >
                  <Edit2 size={14} />
                  <span className="font-medium">Rename Project</span>
                </button>
                {onUpdateProjectColor && (
                  <button
                    onClick={() => {
                      const project = projects.find(p => p.id === contextMenu.id)
                      setShowColorPicker({ projectId: contextMenu.id, currentColor: project?.color ?? '#6B7280' })
                      setContextMenu(null)
                    }}
                    className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                  >
                    <Palette size={14} />
                    <span className="font-medium">Change Color</span>
                  </button>
                )}
                {onOpenProjectDashboard && (
                  <button
                    onClick={() => {
                      onOpenProjectDashboard(contextMenu.id)
                      setContextMenu(null)
                    }}
                    className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                  >
                    <LayoutDashboard size={14} />
                    <span className="font-medium">Open Dashboard</span>
                  </button>
                )}
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => { onCreateFolder(null, contextMenu.id); setContextMenu(null) }}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                >
                  <FolderPlus size={14} />
                  <span className="font-medium">New Folder</span>
                </button>
                <button
                  onClick={() => { onNewNote(undefined, null, contextMenu.id); setContextMenu(null) }}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                >
                  <FileText size={14} />
                  <span className="font-medium">New Note</span>
                </button>
                {onDeleteProject && (
                  <>
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={() => { setShowDeleteModal({ type: 'project', id: contextMenu.id, name: contextMenu.name }); setContextMenu(null) }}
                      className="w-full px-3 py-2 text-xs text-left hover:bg-danger-light text-danger flex items-center gap-2 transition-colors"
                    >
                      <Trash2 size={14} />
                      <span className="font-medium">Delete Project</span>
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
                  className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                >
                  <Edit2 size={14} />
                  <span className="font-medium">Rename</span>
                </button>
                <button
                  onClick={() => { onCreateFolder(contextMenu.id, contextMenu.projectId); setContextMenu(null) }}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                >
                  <FolderPlus size={14} />
                  <span className="font-medium">New Subfolder</span>
                </button>
                <button
                  onClick={() => { onNewNote(undefined, contextMenu.id, contextMenu.projectId); setContextMenu(null) }}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                >
                  <FileText size={14} />
                  <span className="font-medium">New Note Here</span>
                </button>
                {/* Move folder to project */}
                {(onMoveFolderToProject || onMoveFolder) && projects.length > 0 && (
                  <>
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={() => {
                        setShowMovePicker({ type: 'folder-to-project', id: contextMenu.id, name: contextMenu.name })
                        setContextMenu(null)
                      }}
                      className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                    >
                      <FolderInput size={14} />
                      <span className="font-medium">Move to Project...</span>
                    </button>
                  </>
                )}
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => { setShowDeleteModal({ type: 'folder', id: contextMenu.id, name: contextMenu.name }); setContextMenu(null) }}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-danger-light text-danger flex items-center gap-2 transition-colors"
                >
                  <Trash2 size={14} />
                  <span className="font-medium">Delete Folder</span>
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
                    className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                  >
                    <Copy size={14} />
                    <span className="font-medium">Duplicate Note</span>
                  </button>
                )}
                {/* Move to folder — opens full searchable picker */}
                {onMoveNote && (
                  <button
                    onClick={() => {
                      setShowMovePicker({ type: 'note-to-folder', id: contextMenu.id, name: contextMenu.name })
                      setContextMenu(null)
                    }}
                    className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                  >
                    <FolderInput size={14} />
                    <span className="font-medium">Move to Folder...</span>
                  </button>
                )}
                {/* Move to project — opens full searchable picker */}
                {onMoveNoteToProject && projects.length > 0 && (
                  <button
                    onClick={() => {
                      setShowMovePicker({ type: 'note-to-project', id: contextMenu.id, name: contextMenu.name })
                      setContextMenu(null)
                    }}
                    className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover flex items-center gap-2 text-foreground/80 transition-colors"
                  >
                    <ArrowRightLeft size={14} />
                    <span className="font-medium">Move to Project...</span>
                  </button>
                )}
                {onDeleteNote && (
                  <>
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={() => { setShowDeleteModal({ type: 'note', id: contextMenu.id, name: contextMenu.name }); setContextMenu(null) }}
                      className="w-full px-3 py-2 text-xs text-left hover:bg-danger-light text-danger flex items-center gap-2 transition-colors"
                    >
                      <Trash2 size={14} />
                      <span className="font-medium">Delete Note</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ========== MOVE PICKER MODAL ========== */}
      {showMovePicker && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40" onClick={() => setShowMovePicker(null)}>
          <div className="bg-surface rounded-2xl shadow-2xl border border-border/40 max-w-md w-full max-h-[60vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-foreground mb-0.5">
                {showMovePicker.type === 'note-to-folder' && 'Move note to folder'}
                {showMovePicker.type === 'note-to-project' && 'Move note to project'}
                {showMovePicker.type === 'folder-to-project' && 'Move folder to project'}
              </h3>
              <p className="text-[11px] text-muted mb-2 truncate">
                Moving &ldquo;{showMovePicker.name}&rdquo;
              </p>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/60" />
                <input
                  ref={movePickerSearchRef}
                  type="text"
                  value={movePickerSearch}
                  onChange={(e) => setMovePickerSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-8 pr-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-alpine-500/30 bg-surface text-foreground"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
              {/* Note-to-Folder picker */}
              {showMovePicker.type === 'note-to-folder' && (
                <>
                  <button
                    onClick={async () => {
                      if (onMoveNote) { try { await onMoveNote(showMovePicker.id, null) } catch {} }
                      setShowMovePicker(null)
                    }}
                    className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover rounded-lg flex items-center gap-2 text-foreground/80 transition-colors"
                  >
                    <Home size={12} className="text-muted" />
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
                        className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover rounded-lg flex items-center gap-2 text-foreground/80 transition-colors"
                        style={{ paddingLeft: `${depth * 12 + 12}px` }}
                      >
                        <FolderTreeIcon size={12} className="text-muted flex-shrink-0" />
                        <span className="truncate flex-1">{folder.name}</span>
                        <span className="text-[10px] flex-shrink-0 font-medium" style={{ color: projectColor }}>{projectName}</span>
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
                    className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover rounded-lg flex items-center gap-2 text-foreground/80 transition-colors"
                  >
                    <Home size={12} className="text-muted" />
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
                        className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover rounded-lg flex items-center gap-2 text-foreground/80 transition-colors"
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? '#6B7280' }} />
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
                    className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover rounded-lg flex items-center gap-2 text-foreground/80 transition-colors"
                  >
                    <Home size={12} className="text-muted" />
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
                        className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover rounded-lg flex items-center gap-2 text-foreground/80 transition-colors"
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? '#6B7280' }} />
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))
                  }
                </>
              )}
            </div>
            <div className="px-4 py-2 border-t border-border">
              <button
                onClick={() => setShowMovePicker(null)}
                className="w-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== DELETE CONFIRMATION MODAL ========== */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-2xl border border-border/40 max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-danger-light flex items-center justify-center">
                <Trash2 size={24} className="text-danger" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  Delete {showDeleteModal.type === 'folder' ? 'Folder' : showDeleteModal.type === 'project' ? 'Project' : 'Note'}?
                </h3>
                <p className="text-sm text-muted">
                  Are you sure you want to delete &quot;{showDeleteModal.name}&quot;?
                  {showDeleteModal.type === 'folder' && (
                    <span className="block mt-1">Notes inside will be moved to the root level.</span>
                  )}
                  {showDeleteModal.type === 'project' && (
                    <span className="block mt-1">Folders and notes inside will become unfiled.</span>
                  )}
                  {showDeleteModal.type === 'note' && (
                    <span className="block mt-1">This action cannot be undone.</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="px-4 py-2 text-sm font-medium text-foreground/80 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-danger rounded-lg hover:bg-danger/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== COLOR PICKER MODAL ========== */}
      {showColorPicker && onUpdateProjectColor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-2xl border border-border/40 max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-foreground mb-1">Project Color</h3>
            <p className="text-sm text-muted mb-4">Choose a color for this project</p>
            <div className="grid grid-cols-6 gap-2 mb-4">
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
                  className={`w-8 h-8 rounded-full transition-all hover:scale-110 ${
                    showColorPicker.currentColor === color
                      ? 'ring-2 ring-offset-2 ring-alpine-500 ring-offset-surface'
                      : ''
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <div className="flex items-center justify-end">
              <button
                onClick={() => setShowColorPicker(null)}
                className="px-4 py-2 text-sm font-medium text-foreground/80 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
