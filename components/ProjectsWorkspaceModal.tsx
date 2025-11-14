'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Target,
  X,
  Plus,
  Loader2,
  MoreVertical,
  FolderPlus,
  FolderOpen,
  FilePlus2,
  ChevronRight,
  ChevronDown,
  FolderTree,
  FileText,
  Trash2,
  Edit2,
  RefreshCw,
  Network,
  PenTool,
  UploadCloud,
  Search,
  Check,
  Filter,
  XCircle,
  ArrowUp,
  Clock,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react'
import { useToast } from './ToastProvider'
import {
  Project,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  moveFolderToProject,
  moveNoteToProject,
} from '@/lib/projects'
import {
  Folder,
  FolderNode,
  buildFolderTree,
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} from '@/lib/folders'
import {
  Note,
  NoteType,
  getNotes,
  deleteNote,
} from '@/lib/notes'
import FolderContentsModal from './FolderContentsModal'

type ActiveProjectKey = 'all' | 'unassigned' | string

interface ProjectsWorkspaceModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectNote?: (note: Note) => void
  onSelectFolder?: (folderId: string | null) => void
  onNewNote?: (noteType?: NoteType, folderId?: string | null, projectId?: string | null) => void
  onDuplicateNote?: (note: Note) => void
}

const UNASSIGNED_KEY = '__unassigned__'
const colorPresets = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#6366F1',
]

const updatedAtFormatter = new Intl.DateTimeFormat('default', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export default function ProjectsWorkspaceModal({
  isOpen,
  onClose,
  onSelectNote,
  onSelectFolder,
  onNewNote,
  onDuplicateNote,
}: ProjectsWorkspaceModalProps) {
  const toast = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [activeProjectId, setActiveProjectId] = useState<ActiveProjectKey>('all')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteType | 'all'>('all')
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [recentFolderIds, setRecentFolderIds] = useState<string[]>([])
  const [pinnedFolderIds, setPinnedFolderIds] = useState<string[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const [projectMenuId, setProjectMenuId] = useState<ActiveProjectKey | null>(null)
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null)
  const [noteMenuId, setNoteMenuId] = useState<string | null>(null)

  const [showProjectModal, setShowProjectModal] = useState<{ mode: 'create' | 'edit'; project?: Project } | null>(null)
  const [projectForm, setProjectForm] = useState({ name: '', description: '', color: colorPresets[0] })
  const [projectPendingDelete, setProjectPendingDelete] = useState<Project | null>(null)

  const [folderDialog, setFolderDialog] = useState<{
    mode: 'create' | 'rename'
    folderId?: string
    parentId?: string | null
    projectId: string | null
  } | null>(null)
  const [folderNameInput, setFolderNameInput] = useState('')
  const [folderPendingDelete, setFolderPendingDelete] = useState<Folder | null>(null)

  const [notePendingDelete, setNotePendingDelete] = useState<Note | null>(null)
  const [relocateTarget, setRelocateTarget] = useState<{ type: 'folder' | 'note'; id: string } | null>(null)
  const [folderContentsId, setFolderContentsId] = useState<string | null>(null)

  const goToWorkspace = useCallback(
    (folderId: string | null) => {
      if (typeof window === 'undefined') return

      const basePath = pathname === '/dashboard' || pathname === '/' ? pathname : '/dashboard'
      const normalizedBase = basePath || '/dashboard'

      const targetUrl = new URL(window.location.href)
      targetUrl.pathname = normalizedBase
      if (folderId) {
        targetUrl.searchParams.set('folder', folderId)
      } else {
        targetUrl.searchParams.delete('folder')
      }

      const nextPath = `${targetUrl.pathname}${targetUrl.search}`
      const currentPath = `${window.location.pathname}${window.location.search}`
      if (currentPath !== nextPath) {
        router.push(nextPath)
      }
    },
    [pathname, router]
  )

  const folderMap = useMemo(() => {
    const map = new Map<string, Folder>()
    folders.forEach((item) => map.set(item.id, item))
    return map
  }, [folders])

  const noteMap = useMemo(() => {
    const map = new Map<string, Note>()
    notes.forEach((item) => map.set(item.id, item))
    return map
  }, [notes])

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>()
    projects.forEach((project) => map.set(project.id, project))
    return map
  }, [projects])

  const loadAll = useCallback(async (initial = false) => {
    if (initial) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    try {
      const [projectData, folderData, noteData] = await Promise.all([
        getProjects(),
        getFolders(),
        getNotes(),
      ])

      setProjects(projectData)
      setFolders(folderData)
      setNotes(noteData)
    } catch (error) {
      console.error('Failed to load workspace data', error)
      toast.push({
        title: 'Unable to load projects',
        description: 'Please try again in a moment.',
      })
    } finally {
      if (initial) {
        setIsLoading(false)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [toast])

  useEffect(() => {
    if (!isOpen) return

    setActiveProjectId('all')
    setSelectedFolderId(null)
    setExpandedFolders(new Set())
    setSearchTerm('')
    setNoteTypeFilter('all')
    setShowFilterMenu(false)
    setFolderContentsId(null)
    void loadAll(true)
    
    // Load pinned folders from localStorage
    const stored = localStorage.getItem('pinnedFolders')
    if (stored) {
      try {
        setPinnedFolderIds(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to parse pinned folders', e)
      }
    }
  }, [isOpen, loadAll])

  useEffect(() => {
    if (!isOpen) return

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-projects-interactive="true"]')) {
        setProjectMenuId(null)
        setFolderMenuId(null)
        setNoteMenuId(null)
        setShowFilterMenu(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Global keyboard shortcuts
      if (event.key === 'Escape') {
        // Close menus first, then modal
        if (showFilterMenu || projectMenuId || folderMenuId || noteMenuId) {
          setShowFilterMenu(false)
          setProjectMenuId(null)
          setFolderMenuId(null)
          setNoteMenuId(null)
        } else if (folderContentsId) {
          setFolderContentsId(null)
        } else {
          onClose()
        }
        event.preventDefault()
      } else if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
        // Focus search box unless already in an input
        const target = event.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          searchInputRef.current?.focus()
          event.preventDefault()
        }
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        // Cmd/Ctrl+K to focus search
        searchInputRef.current?.focus()
        event.preventDefault()
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        // Cmd/Ctrl+F to toggle filters
        setShowFilterMenu(prev => !prev)
        event.preventDefault()
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, showFilterMenu, projectMenuId, folderMenuId, noteMenuId, folderContentsId, onClose])

  useEffect(() => {
    if (!folderContentsId) return
    if (!folderMap.has(folderContentsId)) {
      setFolderContentsId(null)
    }
  }, [folderContentsId, folderMap])

  const resolveProjectId = useCallback((projectKey: ActiveProjectKey): string | null | undefined => {
    if (projectKey === 'all') return undefined
    if (projectKey === 'unassigned') return null
    return projectKey
  }, [])

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    folders.forEach((folder) => {
      const key = folder.project_id ?? UNASSIGNED_KEY
      counts[key] = (counts[key] ?? 0) + 1
    })
    return counts
  }, [folders])

  const noteCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    notes.forEach((note) => {
      const key = note.project_id ?? UNASSIGNED_KEY
      counts[key] = (counts[key] ?? 0) + 1
    })
    return counts
  }, [notes])

  const projectEntries = useMemo(() => {
    const base: Array<{
      id: ActiveProjectKey
      name: string
      description: string
      folderCount: number
      noteCount: number
      color?: string
    }> = [
      {
        id: 'all',
        name: 'Workspace Overview',
        description: 'All projects and unassigned items',
        folderCount: folders.length,
        noteCount: notes.length,
      },
      {
        id: 'unassigned',
        name: 'No Project',
        description: 'Items not attached to a project',
        folderCount: folderCounts[UNASSIGNED_KEY] ?? 0,
        noteCount: noteCounts[UNASSIGNED_KEY] ?? 0,
      },
    ]

    const projectRows = projects.map((project) => ({
      id: project.id as ActiveProjectKey,
      name: project.name,
      description: project.description || 'No description',
      color: project.color,
      folderCount: folderCounts[project.id] ?? 0,
      noteCount: noteCounts[project.id] ?? 0,
    }))

    return [...base, ...projectRows]
  }, [projects, folders.length, notes.length, folderCounts, noteCounts])

  const notesForActiveProject = useMemo(() => {
    const resolved = resolveProjectId(activeProjectId)
    if (resolved === undefined) return notes
    if (resolved === null) return notes.filter((note) => !note.project_id)
    return notes.filter((note) => note.project_id === resolved)
  }, [notes, activeProjectId, resolveProjectId])

  const noteCountsByFolder = useMemo(() => {
    const counts = new Map<string, number>()
    notesForActiveProject.forEach((note) => {
      if (!note.folder_id) return
      counts.set(note.folder_id, (counts.get(note.folder_id) ?? 0) + 1)
    })
    return counts
  }, [notesForActiveProject])

  const foldersForActiveProject = useMemo(() => {
    const resolved = resolveProjectId(activeProjectId)
    if (resolved === undefined) return folders
    if (resolved === null) return folders.filter((folder) => !folder.project_id)
    return folders.filter((folder) => folder.project_id === resolved)
  }, [folders, activeProjectId, resolveProjectId])

  const folderTree = useMemo(() => buildFolderTree(foldersForActiveProject), [foldersForActiveProject])

  const normalizedSearch = searchTerm.trim().toLowerCase()

  // Build folder path for breadcrumbs
  const getFolderPath = useCallback((folderId: string): Folder[] => {
    const path: Folder[] = []
    let current = folderMap.get(folderId)
    while (current) {
      path.unshift(current)
      current = current.parent_id ? folderMap.get(current.parent_id) : undefined
    }
    return path
  }, [folderMap])

  // Enhanced folder search - searches folder names in tree
  const searchMatchesFolder = useCallback((folder: Folder, query: string): boolean => {
    if (!query) return true
    return folder.name.toLowerCase().includes(query)
  }, [])

  // Enhanced note search - searches both title and content
  const searchMatchesNote = useCallback((note: Note, query: string): boolean => {
    if (!query) return true
    const titleMatch = (note.title || '').toLowerCase().includes(query)
    const contentMatch = note.content.toLowerCase().includes(query)
    return titleMatch || contentMatch
  }, [])

  // Toggle folder pin
  const togglePinFolder = useCallback((folderId: string) => {
    setPinnedFolderIds(prev => {
      const next = prev.includes(folderId) 
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
      localStorage.setItem('pinnedFolders', JSON.stringify(next))
      return next
    })
  }, [])

  // Track recent folders
  const addToRecentFolders = useCallback((folderId: string) => {
    setRecentFolderIds(prev => {
      const next = [folderId, ...prev.filter(id => id !== folderId)].slice(0, 5)
      return next
    })
  }, [])

  // Expand all folders in tree
  const expandAllFolders = useCallback(() => {
    const allIds = new Set(foldersForActiveProject.map(f => f.id))
    setExpandedFolders(allIds)
  }, [foldersForActiveProject])

  // Collapse all folders
  const collapseAllFolders = useCallback(() => {
    setExpandedFolders(new Set())
  }, [])

  const filteredNotes = useMemo(() => {
    let current = notesForActiveProject
    
    // Filter by selected folder
    if (selectedFolderId) {
      current = current.filter((note) => note.folder_id === selectedFolderId)
    }
    
    // Filter by note type
    if (noteTypeFilter !== 'all') {
      current = current.filter((note) => note.note_type === noteTypeFilter)
    }
    
    // Filter by search term (title and content)
    if (normalizedSearch) {
      current = current.filter((note) => searchMatchesNote(note, normalizedSearch))
    }
    
    return [...current].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
  }, [notesForActiveProject, selectedFolderId, normalizedSearch, noteTypeFilter, searchMatchesNote])

  const canBrowseStructure = activeProjectId !== 'all'

  const setFolderExpanded = useCallback((folderId: string, expanded: boolean) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (expanded) {
        next.add(folderId)
      } else {
        next.delete(folderId)
      }
      return next
    })
  }, [])

  const renderFolder = (node: FolderNode, depth = 0): JSX.Element => {
    const isExpanded = expandedFolders.has(node.id)
    const isSelected = selectedFolderId === node.id
    const isPinned = pinnedFolderIds.includes(node.id)
    const childCount = node.children.length
    const noteCount = noteCountsByFolder.get(node.id) ?? 0
    const folderPath = getFolderPath(node.id)
    const matchesSearch = searchMatchesFolder(node, normalizedSearch)

    // Hide if doesn't match search
    if (normalizedSearch && !matchesSearch && !node.children.some(child => searchMatchesFolder(child, normalizedSearch))) {
      return <div key={node.id} className="hidden" />
    }

    return (
      <div key={node.id} className="space-y-0.5">
        <div
          className={`group relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
            isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'
          } ${isPinned ? 'border-l-2 border-amber-400' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            setSelectedFolderId(node.id)
            setFolderMenuId(null)
            setFolderContentsId(node.id)
            addToRecentFolders(node.id)
          }}
        >
          <button
            type="button"
            className="flex-shrink-0"
            onClick={(event) => {
              event.stopPropagation()
              setFolderExpanded(node.id, !isExpanded)
            }}
          >
            {childCount > 0 ? (
              isExpanded ? (
                <ChevronDown size={14} className="text-gray-500" />
              ) : (
                <ChevronRight size={14} className="text-gray-500" />
              )
            ) : (
              <span className="w-3" />
            )}
          </button>
          <FolderTree size={14} className={isPinned ? "text-amber-500" : "text-amber-500"} />
          <span className="flex-1 truncate" title={folderPath.map(f => f.name).join(' / ')}>
            {node.name}
          </span>
          {noteCount > 0 && <span className="text-xs text-gray-400">{noteCount}</span>}
          <button
            type="button"
            data-projects-interactive="true"
            className="hidden rounded p-1 hover:bg-gray-200 group-hover:flex"
            onClick={(event) => {
              event.stopPropagation()
              setFolderMenuId((prev) => (prev === node.id ? null : node.id))
            }}
          >
            <MoreVertical size={14} className="text-gray-500" />
          </button>

          {folderMenuId === node.id && (
            <div
              data-projects-interactive="true"
              className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
            >
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                onClick={() => {
                  onSelectFolder?.(node.id)
                  goToWorkspace(node.id)
                  setFolderMenuId(null)
                  onClose()
                }}
              >
                <FileText size={14} />
                Open in editor
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                onClick={() => {
                  setFolderContentsId(node.id)
                  setFolderMenuId(null)
                }}
              >
                <FolderOpen size={14} />
                View contents
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                onClick={() => {
                  togglePinFolder(node.id)
                  setFolderMenuId(null)
                }}
              >
                {isPinned ? <XCircle size={14} /> : <Check size={14} />}
                {isPinned ? 'Unpin folder' : 'Pin folder'}
              </button>
              {node.parent_id && (
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                  onClick={() => {
                    setSelectedFolderId(node.parent_id)
                    setFolderContentsId(node.parent_id)
                    addToRecentFolders(node.parent_id!)
                    setFolderMenuId(null)
                  }}
                >
                  <ArrowUp size={14} />
                  Go to parent folder
                </button>
              )}
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                onClick={() => {
                  setFolderDialog({ mode: 'create', parentId: node.id, projectId: node.project_id })
                  setFolderNameInput('')
                  setFolderMenuId(null)
                }}
              >
                <FolderPlus size={14} />
                New sub-folder
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                onClick={() => {
                  setRelocateTarget({ type: 'folder', id: node.id })
                  setFolderMenuId(null)
                }}
              >
                <Target size={14} />
                Move to project
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                onClick={() => {
                  setFolderDialog({ mode: 'rename', folderId: node.id, projectId: node.project_id })
                  setFolderNameInput(node.name)
                  setFolderMenuId(null)
                }}
              >
                <Edit2 size={14} />
                Rename
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  setFolderPendingDelete(folderMap.get(node.id) ?? null)
                  setFolderMenuId(null)
                }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>

        {isExpanded && node.children.length > 0 && (
          <div className="space-y-0.5">
            {node.children.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const noteTypeIcon = (type: NoteType) => {
    switch (type) {
      case 'drawing':
        return <PenTool size={16} className="text-purple-500" />
      case 'mindmap':
        return <Network size={16} className="text-green-500" />
      default:
        return <FileText size={16} className="text-blue-500" />
    }
  }

  const formatUpdatedAt = (value: string) => updatedAtFormatter.format(new Date(value))

  const handleProjectSelect = (projectId: ActiveProjectKey) => {
    setActiveProjectId(projectId)
    setSelectedFolderId(null)
    setProjectMenuId(null)
    setFolderMenuId(null)
    setNoteMenuId(null)
    setRelocateTarget(null)
  }

  const openProjectCreate = () => {
    setProjectForm({ name: '', description: '', color: colorPresets[0] })
    setShowProjectModal({ mode: 'create' })
    setProjectMenuId(null)
  }

  const openProjectEdit = (project: Project) => {
    setProjectForm({
      name: project.name,
      description: project.description || '',
      color: project.color,
    })
    setShowProjectModal({ mode: 'edit', project })
    setProjectMenuId(null)
  }

  const handleProjectFormSubmit = async () => {
    const name = projectForm.name.trim()
    if (!name) {
      toast.push({
        title: 'Project name required',
        description: 'Enter a project name before saving.',
      })
      return
    }

    setActionLoading(true)
    try {
      if (showProjectModal?.mode === 'create') {
        await createProject({
          name,
          description: projectForm.description.trim() || null,
          color: projectForm.color,
        })
        toast.push({
          title: 'Project created',
          description: `"${name}" is ready.`,
        })
      } else if (showProjectModal?.mode === 'edit' && showProjectModal.project) {
        await updateProject(showProjectModal.project.id, {
          name,
          description: projectForm.description.trim() || null,
          color: projectForm.color,
        })
        toast.push({
          title: 'Project updated',
          description: `"${name}" was updated.`,
        })
      }
      await loadAll()
    } catch (error) {
      console.error('Failed to save project', error)
      toast.push({
        title: 'Save failed',
        description: 'Unable to save project changes.',
      })
    } finally {
      setActionLoading(false)
      setShowProjectModal(null)
    }
  }

  const handleProjectDeleteConfirm = async () => {
    if (!projectPendingDelete) return

    setActionLoading(true)
    try {
      await deleteProject(projectPendingDelete.id)
      toast.push({
        title: 'Project deleted',
        description: `"${projectPendingDelete.name}" was removed.`,
      })
      if (activeProjectId === projectPendingDelete.id) {
        setActiveProjectId('all')
        setSelectedFolderId(null)
      }
      await loadAll()
    } catch (error) {
      console.error('Failed to delete project', error)
      toast.push({
        title: 'Delete failed',
        description: 'Unable to delete project.',
      })
    } finally {
      setActionLoading(false)
      setProjectPendingDelete(null)
    }
  }

  const handleRefresh = () => {
    void loadAll()
  }

  const handleFolderDialogSubmit = async () => {
    if (!folderDialog) return
    const name = folderNameInput.trim()
    if (!name) {
      toast.push({
        title: 'Folder name required',
        description: 'Enter a folder name before saving.',
      })
      return
    }

    setActionLoading(true)
    try {
      if (folderDialog.mode === 'create') {
        await createFolder({
          name,
          parent_id: folderDialog.parentId ?? null,
          project_id: folderDialog.projectId,
        })
        toast.push({
          title: 'Folder created',
          description: `"${name}" was created.`,
        })
      } else if (folderDialog.mode === 'rename' && folderDialog.folderId) {
        await updateFolder(folderDialog.folderId, { name })
        toast.push({
          title: 'Folder renamed',
          description: 'Folder name updated.',
        })
      }
      await loadAll()
    } catch (error) {
      console.error('Failed to save folder', error)
      toast.push({
        title: 'Save failed',
        description: 'Unable to save folder changes.',
      })
    } finally {
      setActionLoading(false)
      setFolderDialog(null)
    }
  }

  const handleFolderDeleteConfirm = async () => {
    if (!folderPendingDelete) return

    setActionLoading(true)
    try {
      await deleteFolder(folderPendingDelete.id)
      toast.push({
        title: 'Folder deleted',
        description: `"${folderPendingDelete.name}" was removed.`,
      })
      if (selectedFolderId === folderPendingDelete.id) {
        setSelectedFolderId(null)
      }
      await loadAll()
    } catch (error) {
      console.error('Failed to delete folder', error)
      toast.push({
        title: 'Delete failed',
        description: 'Unable to delete folder.',
      })
    } finally {
      setActionLoading(false)
      setFolderPendingDelete(null)
    }
  }

  const relocationOriginProjectId = useMemo(() => {
    if (!relocateTarget) return undefined
    if (relocateTarget.type === 'folder') {
      return folderMap.get(relocateTarget.id)?.project_id ?? null
    }
    return noteMap.get(relocateTarget.id)?.project_id ?? null
  }, [relocateTarget, folderMap, noteMap])

  const handleRelocateToProject = async (targetProject: ActiveProjectKey) => {
    if (!relocateTarget) return
    if (targetProject === 'all') return

    const resolved = resolveProjectId(targetProject) ?? null
    const targetProjectName = targetProject === 'unassigned' 
      ? 'No Project' 
      : projectMap.get(targetProject)?.name ?? 'project'
    
    const itemType = relocateTarget.type === 'folder' ? 'Folder' : 'Note'
    const itemName = relocateTarget.type === 'folder'
      ? folderMap.get(relocateTarget.id)?.name
      : noteMap.get(relocateTarget.id)?.title

    setActionLoading(true)
    try {
      if (relocateTarget.type === 'folder') {
        await moveFolderToProject(relocateTarget.id, resolved)
      } else {
        await moveNoteToProject(relocateTarget.id, resolved)
      }
      
      toast.push({
        title: `${itemType} moved successfully`,
        description: `"${itemName || 'Untitled'}" has been moved to ${targetProjectName}.`,
      })
      
      // Reset selection if we moved the currently selected folder
      if (
        relocateTarget.type === 'folder' &&
        activeProjectId !== 'all' &&
        activeProjectId !== targetProject &&
        selectedFolderId === relocateTarget.id
      ) {
        setSelectedFolderId(null)
      }
      
      // Reload data to reflect changes
      await loadAll()
      
      // If user is viewing a specific project and moved item to a different project,
      // switch to the target project so user can see where the item went
      if (activeProjectId !== 'all' && activeProjectId !== targetProject) {
        setActiveProjectId(targetProject)
        toast.push({
          title: 'View switched',
          description: `Now viewing ${targetProjectName} where the ${itemType.toLowerCase()} was moved.`,
        })
      }
    } catch (error) {
      console.error('Failed to relocate item', error)
      toast.push({
        title: 'Move failed',
        description: error instanceof Error ? error.message : 'Unable to move to the selected project.',
      })
    } finally {
      setActionLoading(false)
      setRelocateTarget(null)
    }
  }

  const handleNoteDeleteConfirm = async () => {
    if (!notePendingDelete) return

    setActionLoading(true)
    try {
      await deleteNote(notePendingDelete.id)
      toast.push({
        title: 'Note deleted',
        description: `"${notePendingDelete.title || 'Untitled'}" was removed.`,
      })
      await loadAll()
    } catch (error) {
      console.error('Failed to delete note', error)
      toast.push({
        title: 'Delete failed',
        description: 'Unable to delete note.',
      })
    } finally {
      setActionLoading(false)
      setNotePendingDelete(null)
    }
  }

  const handleCreateNote = (noteType?: NoteType) => {
    const resolved = resolveProjectId(activeProjectId)
    if (resolved === undefined) {
      toast.push({
        title: 'Pick a project',
        description: 'Select a project to create a note inside it.',
      })
      return
    }
    onNewNote?.(noteType, selectedFolderId, resolved ?? null)
    onClose()
  }

  const handleNoteSelect = (note: Note) => {
    onSelectFolder?.(note.folder_id ?? null)
    goToWorkspace(note.folder_id ?? null)
    onSelectNote?.(note)
    onClose()
  }

  const handleNoteDuplicate = (note: Note) => {
    if (onDuplicateNote) {
      onDuplicateNote(note)
      onClose()
    } else {
      toast.push({
        title: 'Open in editor',
        description: 'Open the note in the editor to duplicate it.',
      })
    }
    setNoteMenuId(null)
  }

  const handleOpenFolderInWorkspace = (folderId: string) => {
    onSelectFolder?.(folderId)
    goToWorkspace(folderId)
    setFolderContentsId(null)
    onClose()
  }

  const handleCreateNoteFromFolder = (
    noteType?: NoteType,
    folderId?: string | null,
    projectId?: string | null
  ) => {
    onNewNote?.(noteType, folderId, projectId)
    setFolderContentsId(null)
    onClose()
  }

  const handleDuplicateNoteFromFolder = (note: Note) => {
    handleNoteDuplicate(note)
    setFolderContentsId(null)
  }

  const handleSelectNoteFromFolder = (note: Note) => {
    handleNoteSelect(note)
    setFolderContentsId(null)
  }

  const handleCreateSubfolderFromContents = (parentId: string) => {
    const parent = folderMap.get(parentId)
    if (!parent) return
    setFolderContentsId(null)
    setFolderDialog({
      mode: 'create',
      parentId,
      projectId: parent.project_id,
    })
    setFolderNameInput('')
  }

  if (!isOpen) return null

  const activeProjectResolved = resolveProjectId(activeProjectId)
  const activeProjectName =
    activeProjectId === 'all'
      ? 'Workspace'
      : activeProjectId === 'unassigned'
      ? 'No Project'
      : projectMap.get(activeProjectId)?.name ?? 'Project'

  const folderForContents = folderContentsId ? folderMap.get(folderContentsId) ?? null : null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 sm:p-6">
      <div className="relative flex w-full max-w-6xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]">
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        )}

        <div className="flex flex-col gap-4 border-b border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-500 shadow-inner">
              <Target size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Projects Workspace</h2>
              <p className="text-sm text-gray-600">Organize notes and folders across projects</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 sm:px-6">
          <div className="flex items-center gap-2">
            <FolderTree size={14} />
            <span>{folders.length} folders</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText size={14} />
            <span>{notes.length} notes</span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-gray-600 transition hover:border-blue-400 hover:text-blue-600"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? <Loader2 size={14} className="animate-spin text-blue-500" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <div className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-500 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 sm:ml-auto sm:w-auto sm:min-w-[280px] sm:bg-transparent sm:px-0 sm:py-0 sm:focus-within:ring-0 sm:focus-within:border-transparent">
            <Search size={14} className="text-gray-400" />
            <input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search notes & folders... (/ or ⌘K)"
              className="w-full bg-transparent text-sm text-gray-600 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-gray-400 hover:text-gray-600"
                title="Clear search (Esc)"
              >
                <XCircle size={14} />
              </button>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              data-projects-interactive="true"
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-gray-600 transition ${
                noteTypeFilter !== 'all' || showFilterMenu
                  ? 'border-blue-400 bg-blue-50 text-blue-600'
                  : 'border-gray-200 hover:border-blue-400 hover:text-blue-600'
              }`}
              onClick={() => setShowFilterMenu(!showFilterMenu)}
            >
              <Filter size={14} />
              Filters
              {noteTypeFilter !== 'all' && <span className="flex h-2 w-2 rounded-full bg-blue-500" />}
            </button>
            {showFilterMenu && (
              <div
                data-projects-interactive="true"
                className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
              >
                <div className="px-3 py-2 text-xs font-semibold uppercase text-gray-500 border-b">
                  Note Type
                </div>
                <button
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                    noteTypeFilter === 'all' ? 'bg-blue-50 text-blue-600' : ''
                  }`}
                  onClick={() => {
                    setNoteTypeFilter('all')
                    setShowFilterMenu(false)
                  }}
                >
                  <span>All types</span>
                  {noteTypeFilter === 'all' && <Check size={14} />}
                </button>
                <button
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                    noteTypeFilter === 'rich-text' ? 'bg-blue-50 text-blue-600' : ''
                  }`}
                  onClick={() => {
                    setNoteTypeFilter('rich-text')
                    setShowFilterMenu(false)
                  }}
                >
                  <span className="flex items-center gap-2">
                    <FileText size={14} className="text-blue-500" />
                    Rich Text
                  </span>
                  {noteTypeFilter === 'rich-text' && <Check size={14} />}
                </button>
                <button
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                    noteTypeFilter === 'drawing' ? 'bg-blue-50 text-blue-600' : ''
                  }`}
                  onClick={() => {
                    setNoteTypeFilter('drawing')
                    setShowFilterMenu(false)
                  }}
                >
                  <span className="flex items-center gap-2">
                    <PenTool size={14} className="text-purple-500" />
                    Drawing
                  </span>
                  {noteTypeFilter === 'drawing' && <Check size={14} />}
                </button>
                <button
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                    noteTypeFilter === 'mindmap' ? 'bg-blue-50 text-blue-600' : ''
                  }`}
                  onClick={() => {
                    setNoteTypeFilter('mindmap')
                    setShowFilterMenu(false)
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Network size={14} className="text-green-500" />
                    Mind Map
                  </span>
                  {noteTypeFilter === 'mindmap' && <Check size={14} />}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="flex flex-col border-b border-gray-200 lg:w-72 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Projects</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-2 py-1 text-xs font-medium text-white hover:bg-blue-600"
                onClick={openProjectCreate}
              >
                <Plus size={12} />
                New
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {projectEntries.map((entry) => {
                const isActive = activeProjectId === entry.id
                const project = typeof entry.id === 'string' ? projectMap.get(entry.id) : undefined

                return (
                  <div
                    key={entry.id}
                    className={`relative rounded-xl border px-3 py-2 text-left shadow-sm transition ${
                      isActive
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                    }`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex items-start gap-3 outline-none"
                      onClick={() => handleProjectSelect(entry.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleProjectSelect(entry.id)
                        }
                      }}
                    >
                      <div className="mt-1 flex h-3 w-3 flex-shrink-0 items-center justify-center">
                        {entry.id === 'all' ? (
                          <Target size={14} className="text-blue-500" />
                        ) : entry.id === 'unassigned' ? (
                          <FolderTree size={14} className="text-gray-400" />
                        ) : (
                          <span
                            className="h-3 w-3 rounded-full border border-white shadow"
                            style={{ backgroundColor: entry.color || '#3B82F6' }}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <p className="truncate text-sm font-semibold text-gray-900">{entry.name}</p>
                            <p className="truncate text-xs text-gray-500">{entry.description}</p>
                          </div>
                          {entry.id !== 'all' && entry.id !== 'unassigned' && project && (
                            <button
                              type="button"
                              data-projects-interactive="true"
                              className="rounded-full p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                              onClick={(event) => {
                                event.stopPropagation()
                                setProjectMenuId((prev) => (prev === entry.id ? null : entry.id))
                              }}
                            >
                              <MoreVertical size={14} />
                            </button>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <FolderTree size={12} />
                            {entry.folderCount}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <FileText size={12} />
                            {entry.noteCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {projectMenuId === entry.id && project && (
                      <div
                        data-projects-interactive="true"
                        className="absolute right-2 top-12 z-40 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
                      >
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                          onClick={() => openProjectEdit(project)}
                        >
                          <Edit2 size={14} />
                          Edit project
                        </button>
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                          onClick={() => {
                            setFolderDialog({
                              mode: 'create',
                              parentId: null,
                              projectId: project.id,
                            })
                            setFolderNameInput('')
                            setProjectMenuId(null)
                          }}
                        >
                          <FolderPlus size={14} />
                          New folder
                        </button>
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                          onClick={() => {
                            setProjectPendingDelete(project)
                            setProjectMenuId(null)
                          }}
                        >
                          <Trash2 size={14} />
                          Delete project
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col border-b border-gray-200 lg:w-80 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {canBrowseStructure ? `${activeProjectName} folders` : 'Folders'}
              </span>
              <div className="flex items-center gap-1">
                {canBrowseStructure && folderTree.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
                      onClick={expandAllFolders}
                      title="Expand all folders"
                    >
                      <ChevronsDownUp size={12} />
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
                      onClick={collapseAllFolders}
                      title="Collapse all folders"
                    >
                      <ChevronsUpDown size={12} />
                    </button>
                  </>
                )}
                {canBrowseStructure && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
                    onClick={() => {
                      const resolved = resolveProjectId(activeProjectId)
                      setFolderDialog({
                        mode: 'create',
                        parentId: null,
                        projectId: resolved ?? null,
                      })
                      setFolderNameInput('')
                    }}
                  >
                    <FolderPlus size={12} />
                    New
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {!canBrowseStructure ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
                  Select a project to browse its folders.
                </div>
              ) : (
                <>
                  {/* Pinned folders section */}
                  {pinnedFolderIds.length > 0 && (
                    <div className="mb-4">
                      <div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                        <Check size={12} />
                        Pinned
                      </div>
                      <div className="space-y-0.5">
                        {pinnedFolderIds
                          .map(id => folderMap.get(id))
                          .filter(Boolean)
                          .map(folder => {
                            const isPinned = true
                            const folderPath = getFolderPath(folder!.id)
                            return (
                              <div
                                key={folder!.id}
                                className="group relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-gray-100 text-gray-700 border-l-2 border-amber-400 cursor-pointer"
                                onClick={() => {
                                  setSelectedFolderId(folder!.id)
                                  setFolderContentsId(folder!.id)
                                  addToRecentFolders(folder!.id)
                                }}
                              >
                                <FolderTree size={14} className="text-amber-500" />
                                <span className="flex-1 truncate" title={folderPath.map(f => f.name).join(' / ')}>
                                  {folder!.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    togglePinFolder(folder!.id)
                                  }}
                                  className="hidden rounded p-1 hover:bg-gray-200 group-hover:flex"
                                  title="Unpin"
                                >
                                  <XCircle size={12} className="text-gray-500" />
                                </button>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}
                  
                  {/* Recent folders section */}
                  {recentFolderIds.length > 0 && (
                    <div className="mb-4">
                      <div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <Clock size={12} />
                        Recent
                      </div>
                      <div className="space-y-0.5">
                        {recentFolderIds
                          .map(id => folderMap.get(id))
                          .filter(Boolean)
                          .filter(folder => foldersForActiveProject.some(f => f.id === folder!.id))
                          .slice(0, 3)
                          .map(folder => {
                            const folderPath = getFolderPath(folder!.id)
                            return (
                              <div
                                key={folder!.id}
                                className="group relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-gray-100 text-gray-700 cursor-pointer"
                                onClick={() => {
                                  setSelectedFolderId(folder!.id)
                                  setFolderContentsId(folder!.id)
                                }}
                              >
                                <FolderTree size={14} className="text-amber-500" />
                                <span className="flex-1 truncate text-xs" title={folderPath.map(f => f.name).join(' / ')}>
                                  {folderPath.map(f => f.name).join(' / ')}
                                </span>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}
                  
                  {/* All folders tree */}
                  {folderTree.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
                      No folders yet. Create one to get started.
                    </div>
                  ) : (
                    <>
                      {(pinnedFolderIds.length > 0 || recentFolderIds.length > 0) && (
                        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                          All Folders
                        </div>
                      )}
                      <div className="space-y-0.5">{folderTree.map((node) => renderFolder(node))}</div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex flex-1 flex-col">
            <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
                <p className="text-xs text-gray-500">
                  {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'} in {activeProjectName}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => handleCreateNote()}
                  disabled={activeProjectResolved === undefined}
                >
                  <FilePlus2 size={16} />
                  New note
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-500 opacity-70"
                  disabled
                >
                  <UploadCloud size={16} />
                  Upload (soon)
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {filteredNotes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                  No notes found. Create a note or adjust your filters.
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const isMenuOpen = noteMenuId === note.id
                  const folderName = note.folder_id ? folderMap.get(note.folder_id)?.name : null
                  const folderPath = note.folder_id ? getFolderPath(note.folder_id) : []
                  const fullPath = folderPath.length > 0 ? folderPath.map(f => f.name).join(' / ') : null

                  return (
                    <div
                      key={note.id}
                      className="group relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          className="flex flex-1 items-start gap-3 text-left"
                          onClick={() => handleNoteSelect(note)}
                        >
                          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                            {noteTypeIcon(note.note_type)}
                          </span>
                          <div className="flex-1 space-y-1">
                            <p className="text-sm font-semibold text-gray-900">{note.title || 'Untitled note'}</p>
                            <p className="text-xs text-gray-500">Updated {formatUpdatedAt(note.updated_at)}</p>
                            {fullPath && (
                              <p className="flex items-center gap-1 text-xs text-gray-500" title={fullPath}>
                                <FolderTree size={12} />
                                <span className="truncate">{fullPath}</span>
                              </p>
                            )}
                          </div>
                        </button>
                        <button
                          type="button"
                          data-projects-interactive="true"
                          className="rounded-full p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                          onClick={() => setNoteMenuId((prev) => (prev === note.id ? null : note.id))}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </div>

                      {isMenuOpen && (
                        <div
                          data-projects-interactive="true"
                          className="absolute right-4 top-12 z-40 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
                        >
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                            onClick={() => handleNoteSelect(note)}
                          >
                            <FileText size={14} />
                            Open in editor
                          </button>
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                            onClick={() => handleNoteDuplicate(note)}
                          >
                            <Plus size={14} />
                            Duplicate
                          </button>
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                            onClick={() => {
                              setRelocateTarget({ type: 'note', id: note.id })
                              setNoteMenuId(null)
                            }}
                          >
                            <Target size={14} />
                            Move to project
                          </button>
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setNotePendingDelete(note)
                              setNoteMenuId(null)
                            }}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
        
        {/* Keyboard shortcuts footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-xs border border-gray-300">Esc</kbd>
                Close
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-xs border border-gray-300">/</kbd>
                or
                <kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-xs border border-gray-300">⌘K</kbd>
                Search
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-xs border border-gray-300">⌘F</kbd>
                Filters
              </span>
            </div>
            <span>{filteredNotes.length} of {notesForActiveProject.length} notes shown</span>
          </div>
        </div>
      </div>

      {folderContentsId && folderForContents && (
        <FolderContentsModal
          isOpen
          folder={folderForContents}
          folders={folders}
          notes={notes}
          onClose={() => setFolderContentsId(null)}
          onOpenFolder={(targetId) => setFolderContentsId(targetId)}
          onOpenFolderInWorkspace={handleOpenFolderInWorkspace}
          onSelectNote={handleSelectNoteFromFolder}
          onCreateNote={handleCreateNoteFromFolder}
          onDuplicateNote={onDuplicateNote ? handleDuplicateNoteFromFolder : undefined}
          onCreateSubfolder={handleCreateSubfolderFromContents}
        />
      )}

      {showProjectModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">
              {showProjectModal.mode === 'create' ? 'Create project' : 'Edit project'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {showProjectModal.mode === 'create'
                ? 'Projects group folders, notes, and soon uploads.'
                : 'Update the project details.'}
            </p>

            <div className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="text-gray-700">Name</span>
                <input
                  value={projectForm.name}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Project name"
                />
              </label>

              <label className="block text-sm">
                <span className="text-gray-700">Description</span>
                <textarea
                  value={projectForm.description}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  rows={3}
                  className="mt-1 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Optional description"
                />
              </label>

              <div>
                <span className="text-sm font-medium text-gray-700">Color</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {colorPresets.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                        projectForm.color === color ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setProjectForm((prev) => ({ ...prev, color }))}
                    >
                      {projectForm.color === color && <Check size={14} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                onClick={() => setShowProjectModal(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={handleProjectFormSubmit}
                disabled={actionLoading}
              >
                {actionLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {projectPendingDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-red-100 p-2 text-red-600">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete project?</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Folders and notes inside “{projectPendingDelete.name}” will move to “No Project”.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                onClick={() => setProjectPendingDelete(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                onClick={handleProjectDeleteConfirm}
                disabled={actionLoading}
              >
                {actionLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {folderDialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">
              {folderDialog.mode === 'create' ? 'Create folder' : 'Rename folder'}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {folderDialog.mode === 'create'
                ? 'Folders keep your project organized.'
                : 'Give the folder a new name.'}
            </p>
            <input
              value={folderNameInput}
              onChange={(event) => setFolderNameInput(event.target.value)}
              className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Folder name"
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleFolderDialogSubmit()
              }}
            />
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                onClick={() => setFolderDialog(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={handleFolderDialogSubmit}
                disabled={actionLoading}
              >
                {actionLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {folderPendingDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-red-100 p-2 text-red-600">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete folder?</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Notes inside “{folderPendingDelete.name}” will move to the project root.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                onClick={() => setFolderPendingDelete(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                onClick={handleFolderDeleteConfirm}
                disabled={actionLoading}
              >
                {actionLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notePendingDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-red-100 p-2 text-red-600">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete note?</h3>
                <p className="mt-1 text-sm text-gray-600">
                  “{notePendingDelete.title || 'Untitled note'}” will be moved to the recycle bin.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                onClick={() => setNotePendingDelete(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                onClick={handleNoteDeleteConfirm}
                disabled={actionLoading}
              >
                {actionLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {relocateTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Move {relocateTarget.type === 'folder' ? 'folder' : 'note'} to project
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {relocationOriginProjectId === null 
                ? 'Currently in: No Project' 
                : relocationOriginProjectId 
                ? `Currently in: ${projectMap.get(relocationOriginProjectId)?.name ?? 'Unknown'}` 
                : 'Select destination project'}
            </p>
            
            {relocateTarget.type === 'note' && (() => {
              const note = noteMap.get(relocateTarget.id)
              const folder = note?.folder_id ? folderMap.get(note.folder_id) : null
              const folderBelongsToDifferentProject = folder && folder.project_id !== relocationOriginProjectId
              
              if (folder) {
                return (
                  <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
                    <p className="text-xs text-blue-700">
                      <strong>Note:</strong> This note is in folder &ldquo;{folder.name}&rdquo;.
                      {folderBelongsToDifferentProject && (
                        <span className="block mt-1">
                          The folder belongs to &ldquo;{projectMap.get(folder.project_id!)?.name ?? 'another project'}&rdquo;, 
                          but the note will be moved independently.
                        </span>
                      )}
                    </p>
                  </div>
                )
              }
              return null
            })()}
            
            <div className="mt-4 max-h-60 space-y-2 overflow-y-auto">
              <button
                type="button"
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                  relocationOriginProjectId === null 
                    ? 'border-gray-300 bg-gray-50 text-gray-400 cursor-not-allowed' 
                    : 'border-gray-200 hover:border-blue-400'
                }`}
                onClick={() => handleRelocateToProject('unassigned')}
                disabled={actionLoading || relocationOriginProjectId === null}
              >
                <span>No project</span>
                {relocationOriginProjectId === null && (
                  <span className="text-xs text-gray-500">(current)</span>
                )}
              </button>
              {projects.map((project) => {
                const isCurrent = relocationOriginProjectId === project.id
                return (
                  <button
                    key={project.id}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                      isCurrent
                        ? 'border-gray-300 bg-gray-50 text-gray-400 cursor-not-allowed'
                        : 'border-gray-200 hover:border-blue-400'
                    }`}
                    onClick={() => handleRelocateToProject(project.id)}
                    disabled={actionLoading || isCurrent}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full border border-white shadow"
                        style={{ backgroundColor: project.color }}
                      />
                      {project.name}
                    </span>
                    {isCurrent && (
                      <span className="text-xs text-gray-500">(current)</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                onClick={() => setRelocateTarget(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}