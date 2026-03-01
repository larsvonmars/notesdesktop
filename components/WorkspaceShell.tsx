'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import NoteEditor, { Note } from '@/components/NoteEditor'
import TaskCalendarModal from '@/components/TaskCalendarModal'
import WelcomeBackModal from '@/components/WelcomeBackModal'
import FileExplorerModal from '@/components/FileExplorerModal'
import SidebarTree from '@/components/SidebarTree'
import { Loader2, FileEdit, Sparkles, FileText, PenTool, Network, BookOpen, Table2, X, Menu, ChevronLeft, ChevronRight, CheckSquare, FolderOpen, Home, LogOut, Target } from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import type { NoteType } from '@/lib/notes'
import { ToastContainer } from '@/components/NotificationCenter'
import { initNotifications, destroyNotifications, type AppNotification } from '@/lib/notifications'
import { ErrorBoundary } from '@/components/ErrorBoundary'

type NoteCreationContext = {
  folderArg?: string | null
  projectArg?: string | null
}
type WorkspaceView = 'welcome' | 'notes' | 'tasks' | 'files' | 'projects'
import { useToast } from '@/components/ToastProvider'
import {
  getNotes,
  getNotesByFolder,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  subscribeToNotes,
  moveNote,
} from '@/lib/notes'
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  buildFolderTree,
  subscribeToFolders,
  FolderNode,
  Folder,
  moveFolder,
} from '@/lib/folders'
import {
  getProjects,
  subscribeToProjects,
  createProject,
  updateProject,
  deleteProject as deleteProjectApi,
  moveNoteToProject,
  type Project,
} from '@/lib/projects'

function WorkspaceContent() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const isMobile = useIsMobile()
  const [notes, setNotes] = useState<Note[]>([])
  const [allNotes, setAllNotes] = useState<Note[]>([])  // All notes for AI tool calling
  const [folders, setFolders] = useState<Folder[]>([])
  const [folderTree, setFolderTree] = useState<FolderNode[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [isLoadingNotes, setIsLoadingNotes] = useState(true)
  const [isLoadingFolders, setIsLoadingFolders] = useState(true)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newNoteType, setNewNoteType] = useState<NoteType>('rich-text')
  const [pendingNoteContext, setPendingNoteContext] = useState<NoteCreationContext | null>(null)
  // Create-folder modal state (replace window.prompt for Tauri compatibility)
  const suppressRealtimeRef = useRef(false)
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const createFolderInputRef = useRef<HTMLInputElement | null>(null)
  const isApplyingUrlRef = useRef(false)

  // Projects state
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  // Workspace view state
  const [activeView, setActiveView] = useState<WorkspaceView>('notes')
  const [workspaceNavCollapsed, setWorkspaceNavCollapsed] = useState(false)
  const [workspaceNavOpen, setWorkspaceNavOpen] = useState(false)
  
  // Task Calendar view state
  const [taskCalendarInitialView, setTaskCalendarInitialView] = useState<'tasks' | 'calendar' | 'timeline' | 'kanban' | 'timetable'>('tasks')
  
  // Welcome Back modal state
  const [showWelcomeBack, setShowWelcomeBack] = useState(false)
  const hasShownWelcomeBackRef = useRef(false)



  // Initialize notification system when user is authenticated
  useEffect(() => {
    if (user && !loading) {
      initNotifications()
      return () => destroyNotifications()
    }
  }, [user, loading])

  const handleNotificationAction = (notification: AppNotification) => {
    if (notification.action) {
      switch (notification.action.type) {
        case 'open_task':
          setTaskCalendarInitialView('tasks')
          setActiveView('tasks')
          break
        case 'open_event':
          setTaskCalendarInitialView('calendar')
          setActiveView('tasks')
          break
        case 'open_note':
          if (notification.action.payload) {
            const note = allNotes.find(n => n.id === notification.action!.payload)
            if (note) {
              activateExistingNote(note)
              setActiveView('notes')
            }
          }
          break
      }
    }
  }

  const updateNavigationParams = useCallback((folderId: string | null, noteId: string | null) => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (folderId) {
      url.searchParams.set('folder', folderId)
    } else {
      url.searchParams.delete('folder')
    }
    if (noteId) {
      url.searchParams.set('note', noteId)
    } else {
      url.searchParams.delete('note')
    }
    window.history.replaceState(null, '', url.toString())
  }, [])

  const applyFolderSelection = useCallback(
    (
      folderId: string | null,
      options?: { projectId?: string | null; preserveDraftState?: boolean }
    ) => {
      setSelectedFolderId(folderId)

      if (!options?.preserveDraftState) {
        setSelectedNote(null)
        setIsCreatingNew(false)
      }

      if (options && Object.prototype.hasOwnProperty.call(options, 'projectId')) {
        setSelectedProjectId(options.projectId ?? null)
      } else if (folderId) {
        const folderRecord = folders.find((f) => f.id === folderId)
        setSelectedProjectId(folderRecord?.project_id ?? null)
      } else {
        setSelectedProjectId(null)
      }
    },
    [folders]
  )

  const activateExistingNote = useCallback((note: Note) => {
    setSelectedNote(note)
    setIsCreatingNew(false)
    applyFolderSelection(note.folder_id ?? null, {
      projectId: note.project_id ?? null,
      preserveDraftState: true,
    })
  }, [applyFolderSelection])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  const folderParam = searchParams.get('folder')
  const noteParam = searchParams.get('note')

  useEffect(() => {
    if (!user) return

    let cancelled = false

    const syncStateFromUrl = async () => {
      isApplyingUrlRef.current = true

      try {
        if (isCreatingNew && selectedNote === null && noteParam) {
          return
        }

        if (noteParam) {
          let targetNote =
            allNotes.find((note) => note.id === noteParam) ??
            notes.find((note) => note.id === noteParam) ??
            null

          if (!targetNote) {
            try {
              targetNote = await getNote(noteParam)
            } catch {
              targetNote = null
            }
          }

          if (cancelled) return

          if (!targetNote) {
            updateNavigationParams(folderParam ?? null, null)
            return
          }

          if (
            selectedNote?.id !== targetNote.id ||
            selectedFolderId !== (targetNote.folder_id ?? null) ||
            selectedProjectId !== (targetNote.project_id ?? null) ||
            isCreatingNew
          ) {
            activateExistingNote(targetNote)
          }

          return
        }

        const targetFolderId = folderParam ?? null
        if (selectedFolderId !== targetFolderId) {
          applyFolderSelection(targetFolderId)
        }
      } finally {
        isApplyingUrlRef.current = false
      }
    }

    void syncStateFromUrl()

    return () => {
      cancelled = true
    }
  }, [
    user,
    folderParam,
    noteParam,
    allNotes,
    notes,
    selectedFolderId,
    selectedProjectId,
    selectedNote,
    isCreatingNew,
    activateExistingNote,
    applyFolderSelection,
    updateNavigationParams,
  ])

  useEffect(() => {
    if (isApplyingUrlRef.current) return
    const noteId = isCreatingNew ? null : selectedNote?.id ?? null
    updateNavigationParams(selectedFolderId, noteId)
  }, [selectedFolderId, selectedNote?.id, isCreatingNew, updateNavigationParams])

  // Load folders and projects
  useEffect(() => {
    if (user) {
      loadFolders()
      loadProjects()
    }
  }, [user])
  
  // Show Welcome Back modal once when data is loaded
  useEffect(() => {
    if (user && !isLoadingFolders && !isLoadingNotes && !isLoadingProjects && !hasShownWelcomeBackRef.current) {
      setShowWelcomeBack(true)
      setActiveView('welcome')
      hasShownWelcomeBackRef.current = true
    }
  }, [user, isLoadingFolders, isLoadingNotes, isLoadingProjects])

  const closeWelcomeView = useCallback(() => {
    setShowWelcomeBack(false)
    setActiveView('notes')
  }, [])

  const switchWorkspaceView = useCallback((view: WorkspaceView) => {
    setActiveView(view)
    setWorkspaceNavOpen(false)
  }, [])

  useEffect(() => {
    setWorkspaceNavOpen(false)
  }, [activeView])

  useEffect(() => {
    if (!selectedFolderId) return
    const folderRecord = folders.find((f) => f.id === selectedFolderId)
    const projectRef = folderRecord?.project_id ?? null
    if (projectRef !== selectedProjectId) {
      setSelectedProjectId(projectRef)
    }
  }, [folders, selectedFolderId, selectedProjectId])

  // Load notes when folder selection changes
  useEffect(() => {
    if (user) {
      loadNotesInFolder(selectedFolderId)
    }
  }, [selectedFolderId, user])

  useEffect(() => {
    if (!pendingNoteContext) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPendingNoteContext(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [pendingNoteContext])

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return

    const unsubscribeNotes = subscribeToNotes(user.id, (payload) => {
      try {
        // payload example: { eventType: 'UPDATE'|'INSERT'|'DELETE', new: {...}, old: {...} }
        const { eventType, new: newRow, old: oldRow } = payload
        // If we're suppressing realtime reloads (e.g. an autosave just happened), ignore
        if (suppressRealtimeRef.current) return

        // Helper: determine if a note belongs in the currently selected folder view
        const belongsInCurrentFolder = (note: any) => {
          if (selectedFolderId === null) return note.folder_id === null
          return note.folder_id === selectedFolderId
        }

        if (eventType === 'INSERT') {
          if (newRow) {
            setAllNotes((prev) => {
              if (prev.some((n) => n.id === newRow.id)) return prev
              return [newRow, ...prev]
            })
            if (belongsInCurrentFolder(newRow)) {
              setNotes((prev) => {
                if (prev.some((n) => n.id === newRow.id)) return prev
                return [newRow, ...prev]
              })
            }
          }
        } else if (eventType === 'UPDATE') {
          if (newRow) {
            setAllNotes((prev) => {
              const exists = prev.some((n) => n.id === newRow.id)
              if (exists) return prev.map((n) => (n.id === newRow.id ? newRow : n))
              return [newRow, ...prev]
            })
            setNotes((prev) => {
              const exists = prev.some((n) => n.id === newRow.id)
              if (exists) return prev.map((n) => (n.id === newRow.id ? newRow : n))
              if (belongsInCurrentFolder(newRow)) return [newRow, ...prev]
              return prev
            })
          }
        } else if (eventType === 'DELETE') {
          if (oldRow) {
            setAllNotes((prev) => prev.filter((n) => n.id !== oldRow.id))
            setNotes((prev) => prev.filter((n) => n.id !== oldRow.id))
          }
        } else {
          // unknown event — fall back to reloading current folder
          loadNotesInFolder(selectedFolderId)
        }
      } catch (err) {
        console.error('Error handling realtime note payload', err)
        // on unexpected error, fallback to reloading
        loadNotesInFolder(selectedFolderId)
      }
    })

    const unsubscribeFolders = subscribeToFolders(user.id, (payload) => {
      console.log('Real-time folder update:', payload)
      loadFolders()
    })

    return () => {
      unsubscribeNotes()
      unsubscribeFolders()
    }
  }, [user, selectedFolderId])

  // Subscribe to real-time project changes
  useEffect(() => {
    if (!user) return
    const unsubscribeProjects = subscribeToProjects(user.id, () => {
      loadProjects()
    })
    return () => {
      unsubscribeProjects()
    }
  }, [user])

  const loadProjects = async () => {
    try {
      const fetchedProjects = await getProjects()
      setProjects(fetchedProjects)
    } catch (error) {
      console.error('Error loading projects:', error)
    } finally {
      setIsLoadingProjects(false)
    }
  }

  const loadFolders = async () => {
    try {
      const fetchedFolders = await getFolders()
      setFolders(fetchedFolders)
      setFolderTree(buildFolderTree(fetchedFolders))
    } catch (error) {
      console.error('Error loading folders:', error)
    } finally {
      setIsLoadingFolders(false)
    }
  }

  const loadNotesInFolder = async (folderId: string | null) => {
    try {
      setIsLoadingNotes(true)
      const fetchedNotes = await getNotesByFolder(folderId)
      setNotes(fetchedNotes)
    } catch (error) {
      console.error('Error loading notes:', error)
    } finally {
      setIsLoadingNotes(false)
    }
  }

  // Load all notes for AI tool calling
  const loadAllNotes = async () => {
    try {
      const fetchedNotes = await getNotes()
      setAllNotes(fetchedNotes)
    } catch (error) {
      console.error('Error loading all notes:', error)
    }
  }

  // Load all notes when user is authenticated
  useEffect(() => {
    if (user) {
      loadAllNotes()
    }
  }, [user])

  const handleSaveNote = async (
    noteData: { title: string; content: string; note_type?: 'rich-text' | 'drawing' | 'mindmap' | 'bullet-journal' | 'data-sheet' },
    isAuto = false
  ) => {
    try {
      suppressRealtimeRef.current = isAuto

      if (selectedNote && !isCreatingNew) {
        const updated = await updateNote(selectedNote.id, {
          title: noteData.title,
          content: noteData.content,
          note_type: noteData.note_type,
        })

        setNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
        setAllNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
        activateExistingNote(updated)

        if (!isAuto) {
          toast.push({
            title: 'Note saved',
            description: 'Your changes have been saved successfully.',
          })
        }
      } else {
        // Validate selectedFolderId exists in current folders list to avoid FK constraint errors
        const validFolderId = selectedFolderId && folders.some(f => f.id === selectedFolderId)
          ? selectedFolderId
          : null
        const created = await createNote({
          title: noteData.title,
          content: noteData.content,
          folder_id: validFolderId,
          project_id: selectedProjectId ?? null,
          note_type: noteData.note_type || newNoteType,
        })

        setNotes((prev) => [created, ...prev])
        setAllNotes((prev) => [created, ...prev])
        activateExistingNote(created)

        if (!isAuto) {
          toast.push({
            title: 'Note created',
            description: 'Your new note is ready.',
          })
        }
      }
    } catch (error) {
      console.error('Error saving note:', error)
      toast.push({
        title: 'Save failed',
        description: 'We could not save your note. Please try again.',
      })
      throw error
    } finally {
      suppressRealtimeRef.current = false
    }
  }

  const handleDeleteNote = async (id: string) => {
    if (!selectedNote) return

    try {
      await deleteNote(id)
      setNotes((prev) => prev.filter((note) => note.id !== id))
      setAllNotes((prev) => prev.filter((note) => note.id !== id))
      setSelectedNote(null)
      setIsCreatingNew(false)
    } catch (error) {
      console.error('Error deleting note:', error)
      throw error
    }
  }

  const startNewNote = (type: NoteType, context: NoteCreationContext = {}) => {
    setPendingNoteContext(null)
    const { folderArg, projectArg } = context
    const targetFolderId = folderArg !== undefined ? folderArg : selectedFolderId

    if (folderArg !== undefined) {
      const options = projectArg !== undefined
        ? { projectId: projectArg, preserveDraftState: true }
        : { preserveDraftState: true }
      applyFolderSelection(folderArg, options)
    } else if (projectArg !== undefined) {
      setSelectedProjectId(projectArg)
    }

    setSelectedNote(null)
    setIsCreatingNew(true)
    setNewNoteType(type)
    updateNavigationParams(targetFolderId ?? null, null)
  }

  const handleNewNote = (
    noteType?: NoteType,
    folderId?: string | null,
    projectId?: string | null
  ) => {
    const context: NoteCreationContext = {}
    if (folderId !== undefined) {
      context.folderArg = folderId
    }
    if (projectId !== undefined) {
      context.projectArg = projectId
    }

    if (!noteType) {
      setPendingNoteContext(context)
      return
    }

    startNewNote(noteType, context)
  }

  const handleSelectNoteType = (type: NoteType) => {
    if (!pendingNoteContext) {
      startNewNote(type)
      return
    }

    const context = pendingNoteContext
    setPendingNoteContext(null)
    startNewNote(type, context)
  }

  const handleCancelNoteTypePrompt = () => {
    setPendingNoteContext(null)
  }

  const handleSelectNote = (note: Note) => {
    activateExistingNote(note)
  }

  const handleSelectFolder = (folderId: string | null) => {
    applyFolderSelection(folderId)
  }

  // Open an in-app modal to create a folder. This replaces window.prompt which
  // doesn't appear in some WebViews (notably Tauri on macOS).
  const handleCreateFolder = async (parentId: string | null) => {
    setCreateFolderParentId(parentId)
    setNewFolderName('')
    setShowCreateFolderModal(true)
    // focus the input on next tick when modal is rendered
    setTimeout(() => createFolderInputRef.current?.focus(), 50)
  }

  const confirmCreateFolder = async () => {
    const name = newFolderName?.trim()
    if (!name) return

    // Add validation for folder name length and special characters
    if (name.length > 100) {
      alert('Folder name is too long (max 100 characters)')
      return
    }

    // Check for duplicate folder names at the same level
    const siblings = createFolderParentId
      ? folders.filter((f) => f.parent_id === createFolderParentId)
      : folders.filter((f) => f.parent_id === null)

    if (siblings.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      alert('A folder with this name already exists at this level')
      return
    }

    try {
      await createFolder({ name, parent_id: createFolderParentId })
      setShowCreateFolderModal(false)
      setNewFolderName('')
      setCreateFolderParentId(null)
      loadFolders()
    } catch (error) {
      console.error('Error creating folder:', error)
      // keep modal open so user can retry; show simple alert for now
      alert('Failed to create folder. Please try again.')
    }
  }

  const cancelCreateFolder = () => {
    setShowCreateFolderModal(false)
    setNewFolderName('')
    setCreateFolderParentId(null)
  }

  const handleRenameFolder = async (folderId: string, newName: string) => {
    const trimmedName = newName.trim()
    if (!trimmedName) {
      alert('Folder name cannot be empty')
      return
    }

    if (trimmedName.length > 100) {
      alert('Folder name is too long (max 100 characters)')
      return
    }

    // Find the folder being renamed to check siblings
    const folderToRename = folders.find((f) => f.id === folderId)
    if (folderToRename) {
      const siblings = folders.filter(
        (f) => f.parent_id === folderToRename.parent_id && f.id !== folderId
      )

      if (siblings.some((f) => f.name.toLowerCase() === trimmedName.toLowerCase())) {
        alert('A folder with this name already exists at this level')
        return
      }
    }

    try {
      await updateFolder(folderId, { name: trimmedName })
      loadFolders()
    } catch (error) {
      console.error('Error renaming folder:', error)
      alert('Failed to rename folder. Please try again.')
    }
  }

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await deleteFolder(folderId)
      if (selectedFolderId === folderId) {
        applyFolderSelection(null)
      }
      loadFolders()
      loadNotesInFolder(selectedFolderId)
    } catch (error) {
      console.error('Error deleting folder:', error)
      alert('Failed to delete folder')
    }
  }

  const handleCancel = () => {
    setIsCreatingNew(false)
    setSelectedNote(null)
  }

  const getCurrentFolderName = (): string | undefined => {
    if (selectedFolderId === null) return undefined
    const folder = folders.find((f) => f.id === selectedFolderId)
    return folder?.name
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  const handleDuplicateNote = async (note: Note) => {
    try {
      const duplicatedNote = await createNote({
        title: `${note.title} (Copy)`,
        content: note.content,
        folder_id: note.folder_id,
        project_id: note.project_id ?? null,
        note_type: note.note_type,
      })
      setNotes([duplicatedNote, ...notes])
      setAllNotes((prev) => [duplicatedNote, ...prev])
      activateExistingNote(duplicatedNote)
    } catch (error) {
      console.error('Error duplicating note:', error)
      alert('Failed to duplicate note')
    }
  }

  const handleMoveNote = async (noteId: string, newFolderId: string | null) => {
    try {
      const movedNote = await moveNote(noteId, newFolderId)
      await loadNotesInFolder(selectedFolderId)
      loadFolders()
      
      // Update project state based on the moved note's new project
      setSelectedProjectId(movedNote.project_id ?? null)
      
      // If the moved note was selected, update it
      if (selectedNote?.id === noteId) {
        activateExistingNote(movedNote)
      }

      // Show success toast with folder and project info
      const folderName =
        newFolderId === null
          ? 'All Notes (Root)'
          : folders.find((f) => f.id === newFolderId)?.name || 'Unknown folder'
      toast.push({
        title: 'Note moved',
        description: `"${movedNote.title || 'Untitled'}" moved to ${folderName}`,
        duration: 3000,
      })
    } catch (error) {
      console.error('Error moving note:', error)
      toast.push({
        title: 'Move failed',
        description: error instanceof Error ? error.message : 'Failed to move note',
        duration: 5000,
      })
    }
  }

  const handleMoveFolder = async (folderId: string, newParentId: string | null) => {
    try {
      await moveFolder(folderId, newParentId)
      loadFolders()
      toast.push({
        title: 'Folder moved',
        description: 'Folder has been moved successfully.',
        duration: 3000,
      })
    } catch (error) {
      console.error('Error moving folder:', error)
      const message = error instanceof Error ? error.message : 'Failed to move folder'
      toast.push({
        title: 'Move failed',
        description: message,
        duration: 5000,
      })
    }
  }

  // ---- Project CRUD handlers ----
  const handleCreateProject = async () => {
    try {
      const newProject = await createProject({ name: 'New Project' })
      setProjects(prev => [...prev, newProject])
      toast.push({ title: 'Project created', description: `"${newProject.name}" created`, duration: 3000 })
    } catch (error) {
      console.error('Error creating project:', error)
      toast.push({ title: 'Error', description: 'Failed to create project', duration: 5000 })
    }
  }

  const handleRenameProject = async (projectId: string, newName: string) => {
    try {
      const updated = await updateProject(projectId, { name: newName })
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p))
      toast.push({ title: 'Project renamed', description: `Renamed to "${newName}"`, duration: 3000 })
    } catch (error) {
      console.error('Error renaming project:', error)
      toast.push({ title: 'Error', description: 'Failed to rename project', duration: 5000 })
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteProjectApi(projectId)
      setProjects(prev => prev.filter(p => p.id !== projectId))
      // If we were viewing the deleted project, reset selection
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null)
      }
      // Reload folders and notes since they may have been orphaned
      loadFolders()
      loadAllNotes()
      toast.push({ title: 'Project deleted', description: 'Project and its contents were removed', duration: 3000 })
    } catch (error) {
      console.error('Error deleting project:', error)
      toast.push({ title: 'Error', description: 'Failed to delete project', duration: 5000 })
    }
  }

  const handleUpdateProjectColor = async (projectId: string, color: string) => {
    try {
      const updated = await updateProject(projectId, { color })
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p))
    } catch (error) {
      console.error('Error updating project color:', error)
      toast.push({ title: 'Error', description: 'Failed to update project color', duration: 5000 })
    }
  }

  const handleMoveNoteToProject = async (noteId: string, projectId: string | null) => {
    try {
      await moveNoteToProject(noteId, projectId)
      // Update allNotes
      setAllNotes(prev => prev.map(n => n.id === noteId ? { ...n, project_id: projectId } : n))
      // Update folder-scoped notes
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, project_id: projectId } : n))
      // If the moved note was selected, update it
      if (selectedNote?.id === noteId) {
        activateExistingNote({ ...selectedNote, project_id: projectId })
      }
      const projectName = projectId
        ? projects.find(p => p.id === projectId)?.name ?? 'Unknown'
        : 'Unfiled'
      toast.push({
        title: 'Note moved',
        description: `Moved to project "${projectName}"`,
        duration: 3000,
      })
    } catch (error) {
      console.error('Error moving note to project:', error)
      toast.push({ title: 'Move failed', description: 'Failed to move note to project', duration: 5000 })
    }
  }

  // ---- Sidebar note deletion handler (from context menu) ----
  const handleSidebarDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
      setAllNotes(prev => prev.filter(n => n.id !== noteId))
      // If the deleted note was selected, clear selection
      if (selectedNote?.id === noteId) {
        setSelectedNote(null)
        setIsCreatingNew(false)
      }
    } catch (error) {
      console.error('Error deleting note:', error)
      toast.push({ title: 'Error', description: 'Failed to delete note', duration: 5000 })
    }
  }

  const sidebarOffset = sidebarCollapsed ? '64px' : '280px'

  // Set CSS variable for fixed-position elements (e.g. bottom bar in NoteEditor)
  useEffect(() => {
    if (typeof document === 'undefined' || isMobile) return
    document.documentElement.style.setProperty('--workspace-sidebar-offset', sidebarOffset)
    return () => { document.documentElement.style.removeProperty('--workspace-sidebar-offset') }
  }, [sidebarOffset, isMobile])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-alpine-600 animate-spin mx-auto mb-4" />
          <div className="text-lg text-gray-700 font-medium">Loading your workspace...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (isLoadingFolders) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-alpine-600 animate-spin mx-auto mb-4" />
          <div className="text-lg text-gray-700 font-medium">Loading your workspace...</div>
        </div>
      </div>
    )
  }

  const shouldShowEditor =
    isCreatingNew ||
    selectedNote !== null ||
    selectedFolderId !== null ||
    notes.length > 0 ||
    folders.length > 0

  const noteTypeOptions = [
    {
      type: 'rich-text' as NoteType,
      label: 'Text Note',
      description: 'Write with rich formatting, tables, and note links.',
      icon: FileText,
      iconBg: 'bg-alpine-100 text-alpine-600',
    },
    {
      type: 'drawing' as NoteType,
      label: 'Drawing Note',
      description: 'Sketch ideas with multi-page canvas tools.',
      icon: PenTool,
      iconBg: 'bg-purple-100 text-purple-600',
    },
    {
      type: 'mindmap' as NoteType,
      label: 'Mind Map',
      description: 'Visualize concepts and relationships quickly.',
      icon: Network,
      iconBg: 'bg-green-100 text-green-600',
    },
    {
      type: 'bullet-journal' as NoteType,
      label: 'Bullet Journal',
      description: 'Rapid-log tasks, events, and notes with signifiers.',
      icon: BookOpen,
      iconBg: 'bg-amber-100 text-amber-600',
    },
    {
      type: 'data-sheet' as NoteType,
      label: 'Data Sheet',
      description: 'Create and edit spreadsheet data with formulas and CSV import/export.',
      icon: Table2,
      iconBg: 'bg-cyan-100 text-cyan-600',
    },
  ]

  const renderNotesView = () => {
    if (shouldShowEditor) {
      return (
        <NoteEditor
          note={isCreatingNew ? null : selectedNote}
          initialNoteType={newNoteType}
          onSave={handleSaveNote}
          onCancel={handleCancel}
          onDelete={selectedNote ? handleDeleteNote : undefined}
          folders={folderTree}
          selectedFolderId={selectedFolderId}
          onSelectFolder={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveFolder={handleMoveFolder}
          notes={notes}
          allNotes={allNotes}
          onSelectNote={handleSelectNote}
          onNewNote={handleNewNote}
          onDuplicateNote={handleDuplicateNote}
          onMoveNote={handleMoveNote}
          isLoadingNotes={isLoadingNotes}
          currentFolderName={getCurrentFolderName()}
          onSignOut={handleSignOut}
          userEmail={user.email}
          onOpenTaskCalendar={() => {
            setTaskCalendarInitialView('tasks')
            setActiveView('tasks')
          }}
          onOpenFileExplorer={() => setActiveView('files')}
          onOpenProjectsView={() => setActiveView('projects')}
          onNotificationAction={handleNotificationAction}
        />
      )
    }

    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8 max-w-md">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-alpine-100 rounded-full blur-3xl opacity-40"></div>
            <FileEdit className={`relative text-alpine-500 mx-auto ${isMobile ? 'w-16 h-16' : 'w-24 h-24'}`} strokeWidth={1.5} />
          </div>
          <h1 className={`font-bold text-gray-900 mb-3 ${isMobile ? 'text-2xl' : 'text-3xl'}`}>Welcome to Saentis Notes</h1>
          <p className={`text-gray-600 mb-8 ${isMobile ? 'text-base' : 'text-lg'}`}>
            A distraction-free writing space, inspired by the Alps
          </p>
          <div className="space-y-3">
            <button
              onClick={() => handleNewNote()}
              className="w-full inline-flex items-center justify-center gap-3 px-6 py-3 bg-alpine-600 text-white font-medium rounded-lg hover:bg-alpine-700 transition-all duration-150 shadow-sm hover:shadow active:scale-95 touch-target"
            >
              <Sparkles size={20} />
              Start Writing
            </button>
            <p className="text-sm text-gray-500">Click the menu button (top-left) to browse your notes</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Notification Toasts */}
      <ToastContainer onAction={handleNotificationAction} />

      {/* Unified Sidebar — always visible on desktop, regardless of activeView */}
      {!isMobile && (
        <SidebarTree
          projects={projects}
          folderTree={folderTree}
          allNotes={allNotes}
          selectedNoteId={selectedNote?.id}
          selectedFolderId={selectedFolderId}
          selectedProjectId={selectedProjectId}
          onSelectNote={(note) => {
            handleSelectNote(note)
            if (activeView !== 'notes') setActiveView('notes')
          }}
          onSelectFolder={handleSelectFolder}
          onNewNote={(noteType, folderId, projectId) => {
            if (activeView !== 'notes') setActiveView('notes')
            handleNewNote(noteType as any, folderId, projectId)
          }}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveFolder={handleMoveFolder}
          onDuplicateNote={handleDuplicateNote}
          onDeleteNote={handleSidebarDeleteNote}
          onMoveNote={handleMoveNote}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onUpdateProjectColor={handleUpdateProjectColor}
          onCreateProject={handleCreateProject}
          onMoveNoteToProject={handleMoveNoteToProject}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(prev => !prev)}
        />
      )}

      {/* Mobile header */}
      {isMobile && (
        <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWorkspaceNavOpen(prev => !prev)}
                className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="Toggle navigation"
              >
                <Menu size={20} />
              </button>
              <h2 className="text-sm font-semibold text-foreground">Notes Desktop</h2>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-foreground">N</div>
          </div>
        </header>
      )}

      {/* Mobile slide-out sidebar */}
      {isMobile && workspaceNavOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setWorkspaceNavOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border bg-surface flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">N</div>
                <span className="text-sm font-semibold text-foreground">Notes Desktop</span>
              </div>
              <button
                onClick={() => setWorkspaceNavOpen(false)}
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="Close navigation"
              >
                <X size={16} />
              </button>
            </div>

            {/* Mobile nav shortcuts */}
            <div className="border-b border-border px-2 py-2 flex gap-1">
              {([
                { key: 'notes' as WorkspaceView, label: 'Notes', icon: FileText },
                { key: 'tasks' as WorkspaceView, label: 'Tasks', icon: CheckSquare },
                { key: 'files' as WorkspaceView, label: 'Files', icon: FolderOpen },
              ]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { switchWorkspaceView(key); setWorkspaceNavOpen(false) }}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all ${
                    activeView === key
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : 'text-muted hover:bg-surface-hover hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Mobile project/folder/note tree */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              <SidebarTree
                projects={projects}
                folderTree={folderTree}
                allNotes={allNotes}
                selectedNoteId={selectedNote?.id}
                selectedFolderId={selectedFolderId}
                selectedProjectId={selectedProjectId}
                onSelectNote={(note) => {
                  handleSelectNote(note)
                  if (activeView !== 'notes') setActiveView('notes')
                  setWorkspaceNavOpen(false)
                }}
                onSelectFolder={handleSelectFolder}
                onNewNote={(noteType, folderId, projectId) => {
                  if (activeView !== 'notes') setActiveView('notes')
                  handleNewNote(noteType as any, folderId, projectId)
                  setWorkspaceNavOpen(false)
                }}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                onMoveFolder={handleMoveFolder}
                onDuplicateNote={handleDuplicateNote}
                onDeleteNote={handleSidebarDeleteNote}
                onMoveNote={handleMoveNote}
                onRenameProject={handleRenameProject}
                onDeleteProject={handleDeleteProject}
                onUpdateProjectColor={handleUpdateProjectColor}
                onCreateProject={handleCreateProject}
                onMoveNoteToProject={handleMoveNoteToProject}
                collapsed={false}
                onToggleCollapsed={() => {}}
              />
            </div>

            <div className="border-t border-border px-2 py-2">
              <button
                onClick={handleSignOut}
                className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-all hover:bg-danger-light hover:text-danger"
              >
                <LogOut className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">Sign out</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Main content area */}
      <main className={`flex-1 w-full h-screen overflow-hidden ${isMobile ? 'pt-14' : ''}`} style={!isMobile ? { paddingLeft: sidebarOffset } : undefined}>
        {activeView === 'welcome' && (
          <WelcomeBackModal
            isOpen={showWelcomeBack}
            asView
            onClose={closeWelcomeView}
            onSelectNote={(note) => {
              activateExistingNote(note)
              closeWelcomeView()
            }}
            onSelectTask={() => {
              setTaskCalendarInitialView('tasks')
              setShowWelcomeBack(false)
              setActiveView('tasks')
            }}
            onOpenTimetable={() => {
              setTaskCalendarInitialView('timetable')
              setShowWelcomeBack(false)
              setActiveView('tasks')
            }}
          />
        )}

        {activeView === 'notes' && renderNotesView()}

        {activeView === 'tasks' && (
          <TaskCalendarModal
            isOpen
            asView
            onClose={() => setActiveView('notes')}
            initialView={taskCalendarInitialView}
            linkedNoteId={selectedNote?.id}
            linkedProjectId={selectedProjectId || undefined}
          />
        )}

        {activeView === 'files' && (
          <FileExplorerModal
            isOpen
            asView
            onClose={() => setActiveView('notes')}
          />
        )}
      </main>

      {pendingNoteContext !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleCancelNoteTypePrompt()
            }
          }}
        >
          <div
            className={`bg-white p-6 ${
              isMobile
                ? 'fixed inset-0 overflow-y-auto safe-top safe-bottom'
                : 'w-full max-w-3xl rounded-2xl border border-gray-200 shadow-2xl'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Choose a note type</h3>
                <p className="mt-1 text-sm text-gray-600">Pick how you want to start so we can set up the right editor.</p>
              </div>
              <button
                onClick={handleCancelNoteTypePrompt}
                className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                aria-label="Close note type picker"
              >
                <X size={18} />
              </button>
            </div>
            <div className={`mt-6 grid gap-3 ${isMobile ? 'grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-5'}`}>
              {noteTypeOptions.map(({ type, label, description, icon: Icon, iconBg }) => (
                <button
                  key={type}
                  onClick={() => handleSelectNoteType(type)}
                  className="flex h-full flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-alpine-300 hover:shadow active:scale-[0.98] touch-target"
                >
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{label}</div>
                    <p className="mt-1 text-xs text-gray-500">{description}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleCancelNoteTypePrompt}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal (in-app) */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">New Folder</h3>
            <p className="text-sm text-gray-600 mb-4">Enter a name for the new folder.</p>
            <input
              ref={createFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-3 py-2 border border-gray-200 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-alpine-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCreateFolder()
                if (e.key === 'Escape') cancelCreateFolder()
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelCreateFolder}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmCreateFolder}
                className="px-4 py-2 text-sm font-medium text-white bg-alpine-600 rounded hover:bg-alpine-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  )
}

export default function WorkspaceShell() {
  return (
    <ErrorBoundary label="Workspace">
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-alpine-600 animate-spin mx-auto mb-4" />
            <div className="text-lg text-gray-700 font-medium">Loading your workspace...</div>
          </div>
        </div>
      }>
        <WorkspaceContent />
      </Suspense>
    </ErrorBoundary>
  )
}
