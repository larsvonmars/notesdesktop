'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Target,
  X,
  Plus,
  Loader2,
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
  Search,
  Check,
  XCircle,
  BookOpen,
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

/* ─── Types ───────────────────────────────────────────────────── */

type ActiveProjectKey = 'all' | 'unassigned' | string

interface ProjectsWorkspaceModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectNote?: (note: Note) => void
  onSelectFolder?: (folderId: string | null) => void
  onNewNote?: (noteType?: NoteType, folderId?: string | null, projectId?: string | null) => void
  onDuplicateNote?: (note: Note) => void
}

/* ─── Constants ───────────────────────────────────────────────── */

const UNASSIGNED_KEY = '__unassigned__'
const colorPresets = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1',
]

const updatedAtFormatter = new Intl.DateTimeFormat('default', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/* ─── Helpers ─────────────────────────────────────────────────── */

const noteTypeIcon = (type: NoteType) => {
  switch (type) {
    case 'drawing': return <PenTool size={14} className="text-purple-500" />
    case 'mindmap': return <Network size={14} className="text-green-500" />
    case 'bullet-journal': return <BookOpen size={14} className="text-amber-500" />
    default: return <FileText size={14} className="text-alpine-500" />
  }
}

type Dialog =
  | { type: 'project'; mode: 'create' | 'edit'; project?: Project }
  | { type: 'folder'; mode: 'create' | 'rename'; folderId?: string; parentId?: string | null; projectId: string | null }
  | { type: 'delete-project'; project: Project }
  | { type: 'delete-folder'; folder: Folder }
  | { type: 'delete-note'; note: Note }
  | { type: 'move'; target: { kind: 'folder' | 'note'; id: string } }

/* ─── Component ───────────────────────────────────────────────── */

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

  // Data
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Navigation
  const [activeProjectId, setActiveProjectId] = useState<ActiveProjectKey>('all')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Single dialog slot — only one dialog open at a time
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formColor, setFormColor] = useState(colorPresets[0])
  const formInputRef = useRef<HTMLInputElement>(null)

  /* ─── Derived data ──────────────────────────────────────────── */

  const folderMap = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders])
  const noteMap = useMemo(() => new Map(notes.map(n => [n.id, n])), [notes])
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])

  const resolveProjectId = useCallback((key: ActiveProjectKey): string | null | undefined => {
    if (key === 'all') return undefined
    if (key === 'unassigned') return null
    return key
  }, [])

  const projectEntries = useMemo(() => {
    const folderCounts: Record<string, number> = {}
    const noteCounts: Record<string, number> = {}
    folders.forEach(f => { const k = f.project_id ?? UNASSIGNED_KEY; folderCounts[k] = (folderCounts[k] ?? 0) + 1 })
    notes.forEach(n => { const k = n.project_id ?? UNASSIGNED_KEY; noteCounts[k] = (noteCounts[k] ?? 0) + 1 })

    return [
      { id: 'all' as ActiveProjectKey, name: 'All', color: undefined, folderCount: folders.length, noteCount: notes.length },
      { id: 'unassigned' as ActiveProjectKey, name: 'No Project', color: undefined, folderCount: folderCounts[UNASSIGNED_KEY] ?? 0, noteCount: noteCounts[UNASSIGNED_KEY] ?? 0 },
      ...projects.map(p => ({
        id: p.id as ActiveProjectKey,
        name: p.name,
        color: p.color,
        folderCount: folderCounts[p.id] ?? 0,
        noteCount: noteCounts[p.id] ?? 0,
      })),
    ]
  }, [projects, folders, notes])

  const foldersForProject = useMemo(() => {
    const r = resolveProjectId(activeProjectId)
    if (r === undefined) return folders
    if (r === null) return folders.filter(f => !f.project_id)
    return folders.filter(f => f.project_id === r)
  }, [folders, activeProjectId, resolveProjectId])

  const folderTree = useMemo(() => buildFolderTree(foldersForProject), [foldersForProject])

  const notesForProject = useMemo(() => {
    const r = resolveProjectId(activeProjectId)
    if (r === undefined) return notes
    if (r === null) return notes.filter(n => !n.project_id)
    return notes.filter(n => n.project_id === r)
  }, [notes, activeProjectId, resolveProjectId])

  const normalizedSearch = searchTerm.trim().toLowerCase()

  const filteredNotes = useMemo(() => {
    let current = notesForProject
    if (selectedFolderId) current = current.filter(n => n.folder_id === selectedFolderId)
    if (normalizedSearch) {
      current = current.filter(n =>
        (n.title || '').toLowerCase().includes(normalizedSearch) ||
        n.content.toLowerCase().includes(normalizedSearch)
      )
    }
    return [...current].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [notesForProject, selectedFolderId, normalizedSearch])

  const noteCountsByFolder = useMemo(() => {
    const counts = new Map<string, number>()
    notesForProject.forEach(n => { if (n.folder_id) counts.set(n.folder_id, (counts.get(n.folder_id) ?? 0) + 1) })
    return counts
  }, [notesForProject])

  const activeProjectName = activeProjectId === 'all' ? 'All' : activeProjectId === 'unassigned' ? 'No Project' : projectMap.get(activeProjectId)?.name ?? 'Project'

  /* ─── Data loading ──────────────────────────────────────────── */

  const loadAll = useCallback(async () => {
    try {
      const [p, f, n] = await Promise.all([getProjects(), getFolders(), getNotes()])
      setProjects(p); setFolders(f); setNotes(n)
    } catch {
      toast.push({ title: 'Load failed', description: 'Could not load workspace data.' })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!isOpen) return
    setActiveProjectId('all')
    setSelectedFolderId(null)
    setExpandedFolders(new Set())
    setSearchTerm('')
    setDialog(null)
    setIsLoading(true)
    void loadAll()
  }, [isOpen, loadAll])

  /* ─── Keyboard shortcuts ────────────────────────────────────── */

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dialog) { setDialog(null); e.preventDefault(); return }
        onClose(); e.preventDefault()
      }
      if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key === 'k')) && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        searchInputRef.current?.focus(); e.preventDefault()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, dialog, onClose])

  /* ─── Navigation ────────────────────────────────────────────── */

  const goToWorkspace = useCallback((folderId: string | null) => {
    if (typeof window === 'undefined') return
    const base = pathname === '/dashboard' || pathname === '/' ? pathname : '/dashboard'
    const url = new URL(window.location.href)
    url.pathname = base || '/dashboard'
    folderId ? url.searchParams.set('folder', folderId) : url.searchParams.delete('folder')
    const next = `${url.pathname}${url.search}`
    if (next !== `${window.location.pathname}${window.location.search}`) router.push(next)
  }, [pathname, router])

  const handleNoteSelect = useCallback((note: Note) => {
    onSelectFolder?.(note.folder_id ?? null)
    goToWorkspace(note.folder_id ?? null)
    onSelectNote?.(note)
    onClose()
  }, [onSelectFolder, onSelectNote, goToWorkspace, onClose])

  const handleFolderOpen = useCallback((folderId: string) => {
    onSelectFolder?.(folderId)
    goToWorkspace(folderId)
    onClose()
  }, [onSelectFolder, goToWorkspace, onClose])

  const handleCreateNote = useCallback((noteType?: NoteType) => {
    const r = resolveProjectId(activeProjectId)
    if (r === undefined) {
      toast.push({ title: 'Select a project first', description: 'Pick a project or "No Project" to create a note.' })
      return
    }
    onNewNote?.(noteType, selectedFolderId, r ?? null)
    onClose()
  }, [activeProjectId, selectedFolderId, resolveProjectId, onNewNote, onClose, toast])

  /* ─── CRUD handlers ─────────────────────────────────────────── */

  const openProjectDialog = (mode: 'create' | 'edit', project?: Project) => {
    setFormName(project?.name ?? '')
    setFormDescription(project?.description ?? '')
    setFormColor(project?.color ?? colorPresets[0])
    setDialog({ type: 'project', mode, project })
    setTimeout(() => formInputRef.current?.focus(), 50)
  }

  const openFolderDialog = (mode: 'create' | 'rename', opts: { folderId?: string; parentId?: string | null; projectId: string | null; currentName?: string }) => {
    setFormName(opts.currentName ?? '')
    setDialog({ type: 'folder', mode, folderId: opts.folderId, parentId: opts.parentId, projectId: opts.projectId })
    setTimeout(() => formInputRef.current?.focus(), 50)
  }

  const submitProjectDialog = async () => {
    if (dialog?.type !== 'project') return
    const name = formName.trim()
    if (!name) return
    setActionLoading(true)
    try {
      if (dialog.mode === 'create') {
        await createProject({ name, description: formDescription.trim() || null, color: formColor })
        toast.push({ title: 'Project created', description: `"${name}" is ready.` })
      } else if (dialog.project) {
        await updateProject(dialog.project.id, { name, description: formDescription.trim() || null, color: formColor })
        toast.push({ title: 'Project updated' })
      }
      await loadAll()
    } catch {
      toast.push({ title: 'Save failed', description: 'Could not save project.' })
    } finally { setActionLoading(false); setDialog(null) }
  }

  const submitFolderDialog = async () => {
    if (dialog?.type !== 'folder') return
    const name = formName.trim()
    if (!name) return
    setActionLoading(true)
    try {
      if (dialog.mode === 'create') {
        await createFolder({ name, parent_id: dialog.parentId ?? null, project_id: dialog.projectId })
        toast.push({ title: 'Folder created' })
      } else if (dialog.folderId) {
        await updateFolder(dialog.folderId, { name })
        toast.push({ title: 'Folder renamed' })
      }
      await loadAll()
    } catch {
      toast.push({ title: 'Save failed', description: 'Could not save folder.' })
    } finally { setActionLoading(false); setDialog(null) }
  }

  const confirmDelete = async () => {
    setActionLoading(true)
    try {
      if (dialog?.type === 'delete-project') {
        await deleteProject(dialog.project.id)
        toast.push({ title: 'Project deleted' })
        if (activeProjectId === dialog.project.id) { setActiveProjectId('all'); setSelectedFolderId(null) }
      } else if (dialog?.type === 'delete-folder') {
        await deleteFolder(dialog.folder.id)
        toast.push({ title: 'Folder deleted' })
        if (selectedFolderId === dialog.folder.id) setSelectedFolderId(null)
      } else if (dialog?.type === 'delete-note') {
        await deleteNote(dialog.note.id)
        toast.push({ title: 'Note deleted' })
      }
      await loadAll()
    } catch {
      toast.push({ title: 'Delete failed' })
    } finally { setActionLoading(false); setDialog(null) }
  }

  const handleMove = async (targetProject: ActiveProjectKey) => {
    if (dialog?.type !== 'move' || targetProject === 'all') return
    const resolved = resolveProjectId(targetProject) ?? null
    const { kind, id } = dialog.target
    setActionLoading(true)
    try {
      if (kind === 'folder') await moveFolderToProject(id, resolved)
      else await moveNoteToProject(id, resolved)
      toast.push({ title: `${kind === 'folder' ? 'Folder' : 'Note'} moved` })
      await loadAll()
    } catch (err) {
      toast.push({ title: 'Move failed', description: err instanceof Error ? err.message : 'Try again.' })
    } finally { setActionLoading(false); setDialog(null) }
  }

  /* ─── Folder tree toggle ────────────────────────────────────── */

  const toggleFolder = useCallback((id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  /* ─── Render folder tree item ───────────────────────────────── */

  const renderFolder = (node: FolderNode, depth = 0): JSX.Element | null => {
    const isExpanded = expandedFolders.has(node.id)
    const isSelected = selectedFolderId === node.id
    const noteCount = noteCountsByFolder.get(node.id) ?? 0
    const hasChildren = node.children.length > 0

    if (normalizedSearch && !node.name.toLowerCase().includes(normalizedSearch) && !node.children.some(c => c.name.toLowerCase().includes(normalizedSearch))) {
      return null
    }

    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-1.5 rounded-md px-2 py-1 text-sm cursor-pointer transition-colors ${
            isSelected ? 'bg-alpine-100 text-alpine-800 font-medium' : 'text-gray-700 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setSelectedFolderId(isSelected ? null : node.id)}
        >
          <button
            type="button"
            className="flex-shrink-0 p-0.5"
            onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleFolder(node.id) }}
          >
            {hasChildren ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3" />}
          </button>
          <FolderTree size={13} className="text-amber-500 flex-shrink-0" />
          <span className="flex-1 truncate">{node.name}</span>
          {noteCount > 0 && <span className="text-xs text-gray-400">{noteCount}</span>}

          {/* Inline actions on hover */}
          <span className="hidden items-center gap-0.5 group-hover:flex">
            <button
              type="button"
              className="rounded p-0.5 hover:bg-gray-200"
              title="Open in workspace"
              onClick={(e) => { e.stopPropagation(); handleFolderOpen(node.id) }}
            ><FolderOpen size={12} className="text-gray-500" /></button>
            <button
              type="button"
              className="rounded p-0.5 hover:bg-gray-200"
              title="Rename"
              onClick={(e) => { e.stopPropagation(); openFolderDialog('rename', { folderId: node.id, projectId: node.project_id, currentName: node.name }) }}
            ><Edit2 size={12} className="text-gray-500" /></button>
            <button
              type="button"
              className="rounded p-0.5 hover:bg-gray-200"
              title="New subfolder"
              onClick={(e) => { e.stopPropagation(); openFolderDialog('create', { parentId: node.id, projectId: node.project_id }) }}
            ><FolderPlus size={12} className="text-gray-500" /></button>
            <button
              type="button"
              className="rounded p-0.5 hover:bg-red-100"
              title="Delete"
              onClick={(e) => { e.stopPropagation(); setDialog({ type: 'delete-folder', folder: folderMap.get(node.id)! }) }}
            ><Trash2 size={12} className="text-red-400" /></button>
          </span>
        </div>
        {isExpanded && hasChildren && (
          <div>{node.children.map(c => renderFolder(c, depth + 1))}</div>
        )}
      </div>
    )
  }

  /* ─── Early return ──────────────────────────────────────────── */

  if (!isOpen) return null

  /* ─── Main render ───────────────────────────────────────────── */

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="relative flex w-full max-w-5xl max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80">
            <Loader2 className="h-6 w-6 animate-spin text-alpine-500" />
          </div>
        )}

        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-alpine-500" />
            <h2 className="text-base font-semibold text-gray-900">Projects</h2>
            <span className="text-xs text-gray-400">{folders.length} folders · {notes.length} notes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-2.5 text-gray-400" />
              <input
                ref={searchInputRef}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search… (/ or ⌘K)"
                className="w-52 rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-7 text-sm text-gray-700 focus:border-alpine-400 focus:outline-none focus:ring-1 focus:ring-alpine-400"
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')} className="absolute right-2 text-gray-400 hover:text-gray-600">
                  <XCircle size={14} />
                </button>
              )}
            </div>
            <button type="button" onClick={() => { setIsLoading(true); loadAll() }} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Refresh">
              <RefreshCw size={14} />
            </button>
            <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Close (Esc)">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ─── Body — 2-panel layout ──────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left sidebar: Projects + Folders */}
          <div className="flex w-64 flex-shrink-0 flex-col border-r border-gray-200 overflow-y-auto">

            {/* Project list */}
            <div className="border-b border-gray-100 px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Projects</span>
                <button
                  type="button"
                  className="rounded p-0.5 text-alpine-500 hover:bg-alpine-50"
                  onClick={() => openProjectDialog('create')}
                  title="New project"
                ><Plus size={14} /></button>
              </div>
              <div className="space-y-0.5">
                {projectEntries.map(entry => {
                  const isActive = activeProjectId === entry.id
                  const project = typeof entry.id === 'string' ? projectMap.get(entry.id) : undefined
                  return (
                    <div
                      key={entry.id}
                      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                        isActive ? 'bg-alpine-100 text-alpine-800 font-medium' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => { setActiveProjectId(entry.id); setSelectedFolderId(null) }}
                    >
                      {entry.id === 'all' ? (
                        <Target size={12} className="text-alpine-500 flex-shrink-0" />
                      ) : entry.id === 'unassigned' ? (
                        <FolderTree size={12} className="text-gray-400 flex-shrink-0" />
                      ) : (
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                      )}
                      <span className="flex-1 truncate">{entry.name}</span>
                      <span className="text-[11px] text-gray-400">{entry.noteCount}</span>

                      {/* Edit/delete on hover for real projects */}
                      {project && (
                        <span className="hidden items-center gap-0.5 group-hover:flex">
                          <button type="button" className="rounded p-0.5 hover:bg-gray-200" onClick={(e) => { e.stopPropagation(); openProjectDialog('edit', project) }} title="Edit">
                            <Edit2 size={10} className="text-gray-500" />
                          </button>
                          <button type="button" className="rounded p-0.5 hover:bg-red-100" onClick={(e) => { e.stopPropagation(); setDialog({ type: 'delete-project', project }) }} title="Delete">
                            <Trash2 size={10} className="text-red-400" />
                          </button>
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Folder tree */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Folders</span>
                {activeProjectId !== 'all' && (
                  <button
                    type="button"
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    onClick={() => openFolderDialog('create', { parentId: null, projectId: resolveProjectId(activeProjectId) ?? null })}
                    title="New folder"
                  ><FolderPlus size={13} /></button>
                )}
              </div>
              {activeProjectId === 'all' ? (
                <p className="px-2 py-4 text-center text-xs text-gray-400">Select a project to browse folders</p>
              ) : folderTree.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-gray-400">No folders yet</p>
              ) : (
                <div className="space-y-px">{folderTree.map(n => renderFolder(n))}</div>
              )}

              {/* Show "All notes" button when a folder is selected */}
              {selectedFolderId && (
                <button
                  type="button"
                  className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-alpine-600 hover:bg-alpine-50"
                  onClick={() => setSelectedFolderId(null)}
                >
                  <XCircle size={12} />
                  Show all notes
                </button>
              )}
            </div>
          </div>

          {/* Right panel: Notes list */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <div className="text-sm">
                <span className="font-medium text-gray-800">{activeProjectName}</span>
                {selectedFolderId && (
                  <span className="text-gray-400"> / {folderMap.get(selectedFolderId)?.name}</span>
                )}
                <span className="ml-2 text-xs text-gray-400">{filteredNotes.length} notes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md bg-alpine-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-alpine-700 disabled:opacity-50"
                  onClick={() => handleCreateNote()}
                  disabled={resolveProjectId(activeProjectId) === undefined}
                  title="New text note"
                >
                  <FilePlus2 size={13} />
                  Note
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => handleCreateNote('mindmap')}
                  disabled={resolveProjectId(activeProjectId) === undefined}
                  title="New mind map"
                >
                  <Network size={13} />
                  Map
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => handleCreateNote('drawing')}
                  disabled={resolveProjectId(activeProjectId) === undefined}
                  title="New drawing"
                >
                  <PenTool size={13} />
                  Draw
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-sm text-gray-400">
                  <FileText size={32} className="mb-2 text-gray-300" />
                  {searchTerm ? 'No notes match your search' : 'No notes yet'}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredNotes.map(note => {
                    const folderName = note.folder_id ? folderMap.get(note.folder_id)?.name : null
                    return (
                      <div
                        key={note.id}
                        className="group flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => handleNoteSelect(note)}
                      >
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-gray-100">
                          {noteTypeIcon(note.note_type)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{note.title || 'Untitled'}</p>
                          <p className="flex items-center gap-2 text-xs text-gray-400">
                            <span>{updatedAtFormatter.format(new Date(note.updated_at))}</span>
                            {folderName && <span className="flex items-center gap-0.5"><FolderTree size={10} />{folderName}</span>}
                          </p>
                        </div>
                        {/* Inline actions */}
                        <span className="hidden items-center gap-0.5 group-hover:flex" onClick={e => e.stopPropagation()}>
                          {onDuplicateNote && (
                            <button type="button" className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600" title="Duplicate" onClick={() => { onDuplicateNote(note); onClose() }}>
                              <Plus size={12} />
                            </button>
                          )}
                          <button type="button" className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600" title="Move to project" onClick={() => setDialog({ type: 'move', target: { kind: 'note', id: note.id } })}>
                            <Target size={12} />
                          </button>
                          <button type="button" className="rounded p-1 text-red-300 hover:bg-red-50 hover:text-red-500" title="Delete" onClick={() => setDialog({ type: 'delete-note', note })}>
                            <Trash2 size={12} />
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Dialogs (single slot) ────────────────────────────── */}
      {dialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => !actionLoading && setDialog(null)}>
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>

            {/* ── Project create/edit ── */}
            {dialog.type === 'project' && (
              <>
                <h3 className="text-base font-semibold text-gray-900 mb-3">
                  {dialog.mode === 'create' ? 'New Project' : 'Edit Project'}
                </h3>
                <div className="space-y-3">
                  <input
                    ref={formInputRef}
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="Project name"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-alpine-500 focus:outline-none focus:ring-1 focus:ring-alpine-200"
                    onKeyDown={e => e.key === 'Enter' && submitProjectDialog()}
                  />
                  <textarea
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-alpine-500 focus:outline-none focus:ring-1 focus:ring-alpine-200"
                  />
                  <div className="flex gap-1.5">
                    {colorPresets.map(c => (
                      <button
                        key={c}
                        type="button"
                        className={`h-6 w-6 rounded-full transition ${formColor === c ? 'ring-2 ring-offset-1 ring-alpine-500' : ''}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setFormColor(c)}
                      >
                        {formColor === c && <Check size={12} className="mx-auto text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100" onClick={() => setDialog(null)} disabled={actionLoading}>Cancel</button>
                  <button type="button" className="rounded-md bg-alpine-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-alpine-700 disabled:opacity-50" onClick={submitProjectDialog} disabled={actionLoading || !formName.trim()}>
                    {actionLoading ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            )}

            {/* ── Folder create/rename ── */}
            {dialog.type === 'folder' && (
              <>
                <h3 className="text-base font-semibold text-gray-900 mb-3">
                  {dialog.mode === 'create' ? 'New Folder' : 'Rename Folder'}
                </h3>
                <input
                  ref={formInputRef}
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Folder name"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-alpine-500 focus:outline-none focus:ring-1 focus:ring-alpine-200"
                  onKeyDown={e => e.key === 'Enter' && submitFolderDialog()}
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100" onClick={() => setDialog(null)} disabled={actionLoading}>Cancel</button>
                  <button type="button" className="rounded-md bg-alpine-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-alpine-700 disabled:opacity-50" onClick={submitFolderDialog} disabled={actionLoading || !formName.trim()}>
                    {actionLoading ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            )}

            {/* ── Delete confirmations ── */}
            {(dialog.type === 'delete-project' || dialog.type === 'delete-folder' || dialog.type === 'delete-note') && (
              <>
                <div className="flex items-start gap-3 mb-3">
                  <div className="rounded-full bg-red-100 p-1.5"><Trash2 size={16} className="text-red-500" /></div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      Delete {dialog.type === 'delete-project' ? 'project' : dialog.type === 'delete-folder' ? 'folder' : 'note'}?
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {dialog.type === 'delete-project'
                        ? `Items in "${dialog.project.name}" will move to "No Project".`
                        : dialog.type === 'delete-folder'
                        ? `Notes in "${dialog.folder.name}" will move to the project root.`
                        : `"${dialog.note.title || 'Untitled'}" will be permanently deleted.`}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100" onClick={() => setDialog(null)} disabled={actionLoading}>Cancel</button>
                  <button type="button" className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50" onClick={confirmDelete} disabled={actionLoading}>
                    {actionLoading ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </>
            )}

            {/* ── Move to project ── */}
            {dialog.type === 'move' && (() => {
              const item = dialog.target.kind === 'folder' ? folderMap.get(dialog.target.id) : noteMap.get(dialog.target.id)
              const currentProjectId = dialog.target.kind === 'folder'
                ? (item as Folder | undefined)?.project_id ?? null
                : (item as Note | undefined)?.project_id ?? null
              return (
                <>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">
                    Move {dialog.target.kind} to project
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Currently in: {currentProjectId ? projectMap.get(currentProjectId)?.name ?? 'Unknown' : 'No Project'}
                  </p>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {[
                      { id: 'unassigned' as ActiveProjectKey, name: 'No Project', color: undefined, isCurrent: currentProjectId === null },
                      ...projects.map(p => ({ id: p.id as ActiveProjectKey, name: p.name, color: p.color, isCurrent: currentProjectId === p.id })),
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition ${
                          opt.isCurrent ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:bg-alpine-50 text-gray-700'
                        }`}
                        onClick={() => handleMove(opt.id)}
                        disabled={actionLoading || opt.isCurrent}
                      >
                        {opt.color ? (
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: opt.color }} />
                        ) : (
                          <FolderTree size={12} className="text-gray-400" />
                        )}
                        <span className="flex-1">{opt.name}</span>
                        {opt.isCurrent && <span className="text-[10px] text-gray-400">current</span>}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button type="button" className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100" onClick={() => setDialog(null)} disabled={actionLoading}>Cancel</button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
