'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useRef, useCallback, useMemo, Suspense } from 'react'
import NoteEditor, { Note } from '@/components/NoteEditor'
import WelcomeBackModal from '@/components/WelcomeBackModal'
import FileExplorerModal from '@/components/FileExplorerModal'
import ProjectDashboard from '@/components/ProjectDashboard'
import SidebarTree from '@/components/SidebarTree'
import ArchivedProjectsModal from '@/components/ArchivedProjectsModal'
import { Loader2, FileEdit, Sparkles, FileText, PenTool, Network, BookOpen, Table2, FilePenLine, X, Menu, ChevronLeft, ChevronRight, FolderOpen, Home, LogOut, FileQuestion, Target, Lightbulb, Scale, LayoutGrid } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import type { NoteType } from '@/lib/notes'
import { getOrderedNoteTypePresentations, type NoteTypeIconKey } from '@/lib/note-types'
import { MINDMAP_TEMPLATES, type MindmapTemplate } from '@/lib/mindmap-templates'
import { ErrorBoundary } from '@/components/ErrorBoundary'

type NoteCreationContext = {
  folderArg?: string | null
  projectArg?: string | null
}
type WorkspaceView = 'welcome' | 'notes' | 'files' | 'projects'
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
  getArchivedProjects,
  subscribeToProjects,
  createProject,
  updateProject,
  archiveProject as archiveProjectApi,
  restoreProject as restoreProjectApi,
  deleteProject as deleteProjectApi,
  moveNoteToProject,
  moveFolderToProject,
  type Project,
} from '@/lib/projects'

const NOTE_TYPE_ICON_MAP: Record<NoteTypeIconKey, LucideIcon> = {
  'file-text': FileText,
  'pen-tool': PenTool,
  network: Network,
  'book-open': BookOpen,
  'table-2': Table2,
  'file-pen-line': FilePenLine,
}

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
  const selectedNoteRef = useRef<Note | null>(null)
  const [isLoadingNotes, setIsLoadingNotes] = useState(true)
  const [isLoadingFolders, setIsLoadingFolders] = useState(true)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const isCreatingNewSaveRef = useRef(false)
  const [newNoteType, setNewNoteType] = useState<NoteType>('rich-text')
  const [pendingNoteContext, setPendingNoteContext] = useState<NoteCreationContext | null>(null)
  // Mindmap template picker state
  const [pendingMindmapTemplateContext, setPendingMindmapTemplateContext] = useState<NoteCreationContext | null>(null)
  const [selectedMindmapTemplateId, setSelectedMindmapTemplateId] = useState<string | undefined>(undefined)
  // Create-folder modal state (replace window.prompt for Tauri compatibility)
  const suppressRealtimeRef = useRef(false)
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null)
  const [createFolderProjectId, setCreateFolderProjectId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const createFolderInputRef = useRef<HTMLInputElement | null>(null)
  const isApplyingUrlRef = useRef(false)

  // Projects state
  const [projects, setProjects] = useState<Project[]>([])
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [showArchiveModal, setShowArchiveModal] = useState(false)

  // Project ids that are archived — used to keep archived content out of the
  // active workspace (folders/notes belonging to an archived project).
  const archivedProjectIds = useMemo(
    () => new Set(archivedProjects.map((p) => p.id)),
    [archivedProjects]
  )
  const archivedProjectIdsRef = useRef<Set<string>>(new Set())
  
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  // Workspace view state
  const [activeView, setActiveView] = useState<WorkspaceView>('notes')
  const [showFilesPanel, setShowFilesPanel] = useState(false)
  const [showFileExplorerModal, setShowFileExplorerModal] = useState(false)
  const [workspaceNavCollapsed, setWorkspaceNavCollapsed] = useState(false)
  const [workspaceNavOpen, setWorkspaceNavOpen] = useState(false)
  const mobileSwipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const mobileSwipeModeRef = useRef<'open' | 'close' | null>(null)
  
  // Welcome Back modal state
  const [showWelcomeBack, setShowWelcomeBack] = useState(false)
  const hasShownWelcomeBackRef = useRef(false)



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
        selectedNoteRef.current = null
        isCreatingNewSaveRef.current = false
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
    selectedNoteRef.current = note
    isCreatingNewSaveRef.current = false
    setSelectedNote(note)
    setIsCreatingNew(false)
    applyFolderSelection(note.folder_id ?? null, {
      projectId: note.project_id ?? null,
      preserveDraftState: true,
    })
  }, [applyFolderSelection])

  // ---- Refs for URL→state sync (break circular dependency) ----
  // These refs let the URL sync effect read the latest state/callbacks
  // without including them in its dependency array, preventing the
  // stale-noteParam flip-flop that occurs when useSearchParams doesn't
  // reflect the replaceState update on the same render cycle.
  const allNotesRef = useRef<Note[]>(allNotes)
  const notesRef = useRef<Note[]>(notes)
  const selectedNoteIdRef = useRef<string | undefined>(selectedNote?.id)
  const selectedFolderIdRef = useRef<string | null>(selectedFolderId)
  const selectedProjectIdRef = useRef<string | null>(selectedProjectId)
  const isCreatingNewRef = useRef(isCreatingNew)
  const activateExistingNoteRef = useRef(activateExistingNote)
  const applyFolderSelectionRef = useRef(applyFolderSelection)
  const updateNavigationParamsRef = useRef(updateNavigationParams)
  const urlSyncSucceededRef = useRef(false)

  // Keep refs in sync (updated every render, before effects run)
  allNotesRef.current = allNotes
  notesRef.current = notes
  selectedNoteIdRef.current = selectedNote?.id
  selectedFolderIdRef.current = selectedFolderId
  selectedProjectIdRef.current = selectedProjectId
  isCreatingNewRef.current = isCreatingNew
  activateExistingNoteRef.current = activateExistingNote
  applyFolderSelectionRef.current = applyFolderSelection
  updateNavigationParamsRef.current = updateNavigationParams
  archivedProjectIdsRef.current = archivedProjectIds

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  const folderParam = searchParams.get('folder')
  const noteParam = searchParams.get('note')

  // URL → state sync: only re-runs when URL params actually change
  // (initial load, browser back/forward). Internal state changes no
  // longer trigger this effect, preventing the flip-flop loop.
  useEffect(() => {
    if (!user) return

    let cancelled = false
    urlSyncSucceededRef.current = false

    const syncStateFromUrl = async () => {
      isApplyingUrlRef.current = true

      try {
        if (isCreatingNewRef.current && !selectedNoteIdRef.current && noteParam) {
          return
        }

        if (noteParam) {
          let targetNote =
            allNotesRef.current.find((n) => n.id === noteParam) ??
            notesRef.current.find((n) => n.id === noteParam) ??
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
            updateNavigationParamsRef.current(folderParam ?? null, null)
            return
          }

          urlSyncSucceededRef.current = true

          if (
            selectedNoteIdRef.current !== targetNote.id ||
            selectedFolderIdRef.current !== (targetNote.folder_id ?? null) ||
            selectedProjectIdRef.current !== (targetNote.project_id ?? null) ||
            isCreatingNewRef.current
          ) {
            activateExistingNoteRef.current(targetNote)
          }

          return
        }

        urlSyncSucceededRef.current = true
        const targetFolderId = folderParam ?? null
        if (selectedFolderIdRef.current !== targetFolderId) {
          applyFolderSelectionRef.current(targetFolderId)
        }
      } finally {
        isApplyingUrlRef.current = false
      }
    }

    void syncStateFromUrl()

    return () => {
      cancelled = true
    }
  }, [user, folderParam, noteParam])

  // Fallback: if the initial URL sync failed to find the note (e.g.
  // allNotes hadn't loaded yet and getNote also failed), retry once
  // allNotes becomes available.
  useEffect(() => {
    if (!noteParam || urlSyncSucceededRef.current || allNotes.length === 0) return

    const targetNote = allNotes.find((n) => n.id === noteParam)
    if (targetNote && selectedNoteIdRef.current !== targetNote.id) {
      urlSyncSucceededRef.current = true
      isApplyingUrlRef.current = true
      activateExistingNoteRef.current(targetNote)
      isApplyingUrlRef.current = false
    }
  }, [allNotes, noteParam])

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
      loadArchivedProjects()
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

  const beginOpenSwipe = useCallback((clientX: number, clientY: number) => {
    if (!isMobile || workspaceNavOpen) return
    // Only treat swipes starting from the left edge as an intent to open nav.
    if (clientX > 28) return
    mobileSwipeModeRef.current = 'open'
    mobileSwipeStartRef.current = { x: clientX, y: clientY }
  }, [isMobile, workspaceNavOpen])

  const endOpenSwipe = useCallback((clientX: number, clientY: number) => {
    if (mobileSwipeModeRef.current !== 'open' || !mobileSwipeStartRef.current) {
      mobileSwipeModeRef.current = null
      mobileSwipeStartRef.current = null
      return
    }

    const dx = clientX - mobileSwipeStartRef.current.x
    const dy = Math.abs(clientY - mobileSwipeStartRef.current.y)
    if (dx > 72 && dy < 80) {
      setWorkspaceNavOpen(true)
    }

    mobileSwipeModeRef.current = null
    mobileSwipeStartRef.current = null
  }, [])

  const beginCloseSwipe = useCallback((clientX: number, clientY: number) => {
    if (!isMobile || !workspaceNavOpen) return
    mobileSwipeModeRef.current = 'close'
    mobileSwipeStartRef.current = { x: clientX, y: clientY }
  }, [isMobile, workspaceNavOpen])

  const endCloseSwipe = useCallback((clientX: number, clientY: number) => {
    if (mobileSwipeModeRef.current !== 'close' || !mobileSwipeStartRef.current) {
      mobileSwipeModeRef.current = null
      mobileSwipeStartRef.current = null
      return
    }

    const dx = clientX - mobileSwipeStartRef.current.x
    const dy = Math.abs(clientY - mobileSwipeStartRef.current.y)
    if (dx < -56 && dy < 80) {
      setWorkspaceNavOpen(false)
    }

    mobileSwipeModeRef.current = null
    mobileSwipeStartRef.current = null
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

        // Keep notes belonging to archived projects out of the active workspace.
        if (newRow && archivedProjectIdsRef.current.has(newRow.project_id)) {
          if (eventType === 'INSERT') return
          if (eventType === 'UPDATE') {
            setAllNotes((prev) => prev.filter((n) => n.id !== newRow.id))
            setNotes((prev) => prev.filter((n) => n.id !== newRow.id))
            return
          }
        }

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
      loadArchivedProjects()
      loadFolders()
      loadAllNotes()
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

  const loadArchivedProjects = async () => {
    try {
      const fetched = await getArchivedProjects()
      setArchivedProjects(fetched)
    } catch (error) {
      console.error('Error loading archived projects:', error)
    }
  }

  // Filter out folders/notes that belong to archived projects so they never
  // surface in the active workspace (recent, search, tree, folder lists).
  const filterOutArchivedContent = <T extends { project_id: string | null }>(items: T[]): T[] => {
    const ids = archivedProjectIdsRef.current
    if (ids.size === 0) return items
    return items.filter((item) => !item.project_id || !ids.has(item.project_id))
  }

  const loadFolders = async () => {
    try {
      const fetchedFolders = filterOutArchivedContent(await getFolders())
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
      const fetchedNotes = filterOutArchivedContent(await getNotesByFolder(folderId))
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
      const fetchedNotes = filterOutArchivedContent(await getNotes())
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

  // Keep save-related refs in sync for the memoized handleSaveNote
  const selectedFolderIdSaveRef = useRef(selectedFolderId)
  selectedFolderIdSaveRef.current = selectedFolderId
  const selectedProjectIdSaveRef = useRef(selectedProjectId)
  selectedProjectIdSaveRef.current = selectedProjectId
  const newNoteTypeSaveRef = useRef(newNoteType)
  newNoteTypeSaveRef.current = newNoteType
  const foldersSaveRef = useRef(folders)
  foldersSaveRef.current = folders

  // Memoized with useCallback — uses refs for frequently-changing values
  // so the function identity stays stable across renders. This prevents
  // NoteEditor's handleSave / autosave effect from being recreated every
  // render, which was resetting the autosave timer and causing stale-
  // closure races when switching notes.
  const handleSaveNote = useCallback(async (
    noteData: { title: string; content: string; note_type?: NoteType },
    isAuto = false
  ) => {
    // Read the CURRENT note from the ref, not a stale closure value.
    // This prevents saving note A's content to note B after a switch.
    const currentNote = selectedNoteRef.current
    const creatingNew = isCreatingNewSaveRef.current

    try {
      suppressRealtimeRef.current = isAuto

      if (currentNote && !creatingNew) {
        const updated = await updateNote(currentNote.id, {
          title: noteData.title,
          content: noteData.content,
          note_type: noteData.note_type,
        })

        // After the async save, verify the note is still selected.
        // If the user switched away, don't overwrite selectedNote.
        if (selectedNoteRef.current?.id !== currentNote.id) return

        setNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
        setAllNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
        // Update the selected note reference without re-activating
        // (folder/project don't change during save). Using
        // activateExistingNote here would re-trigger applyFolderSelection
        // and feed into the URL sync cycle unnecessarily.
        selectedNoteRef.current = updated
        setSelectedNote(updated)

        if (!isAuto) {
          toast.push({
            title: 'Note saved',
            description: 'Your changes have been saved successfully.',
          })
        }
      } else {
        // Validate selectedFolderId exists in current folders list to avoid FK constraint errors
        const fId = selectedFolderIdSaveRef.current
        const fList = foldersSaveRef.current
        const validFolderId = fId && fList.some(f => f.id === fId) ? fId : null
        const created = await createNote({
          title: noteData.title,
          content: noteData.content,
          folder_id: validFolderId,
          project_id: selectedProjectIdSaveRef.current ?? null,
          note_type: noteData.note_type || newNoteTypeSaveRef.current,
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
  }, [toast, activateExistingNote])

  const handleDeleteNote = async (id: string) => {
    if (!selectedNote) return

    try {
      await deleteNote(id)
      setNotes((prev) => prev.filter((note) => note.id !== id))
      setAllNotes((prev) => prev.filter((note) => note.id !== id))
      selectedNoteRef.current = null
      isCreatingNewSaveRef.current = false
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

    selectedNoteRef.current = null
    isCreatingNewSaveRef.current = true
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
    const context = pendingNoteContext ?? {}
    setPendingNoteContext(null)

    // For mindmaps, show the template picker instead of jumping straight to the editor
    if (type === 'mindmap') {
      setPendingMindmapTemplateContext(context)
      return
    }

    startNewNote(type, context)
  }

  const handleSelectMindmapTemplate = (templateId: string) => {
    const context = pendingMindmapTemplateContext ?? {}
    setPendingMindmapTemplateContext(null)
    setSelectedMindmapTemplateId(templateId)
    startNewNote('mindmap', context)
  }

  const handleCancelMindmapTemplatePicker = () => {
    // Go back to the note type picker
    const context = pendingMindmapTemplateContext
    setPendingMindmapTemplateContext(null)
    if (context) {
      setPendingNoteContext(context)
    }
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
  const handleCreateFolder = async (parentId: string | null, projectId?: string | null) => {
    setCreateFolderParentId(parentId)
    setCreateFolderProjectId(projectId ?? null)
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

    // Check for duplicate folder names at the same level within the same project
    const siblings = folders.filter((f) => {
      if (f.parent_id !== (createFolderParentId ?? null)) return false
      if ((f.project_id ?? null) !== (createFolderProjectId ?? null)) return false
      return true
    })

    if (siblings.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      alert('A folder with this name already exists at this level')
      return
    }

    try {
      await createFolder({ name, parent_id: createFolderParentId, project_id: createFolderProjectId })
      setShowCreateFolderModal(false)
      setNewFolderName('')
      setCreateFolderParentId(null)
      setCreateFolderProjectId(null)
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
    setCreateFolderProjectId(null)
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

    // Find the folder being renamed to check siblings within the same project
    const folderToRename = folders.find((f) => f.id === folderId)
    if (folderToRename) {
      const siblings = folders.filter(
        (f) => f.parent_id === folderToRename.parent_id && f.id !== folderId && (f.project_id ?? null) === (folderToRename.project_id ?? null)
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
    isCreatingNewSaveRef.current = false
    selectedNoteRef.current = null
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

  const handleMoveFolderToProject = async (folderId: string, projectId: string | null) => {
    try {
      await moveFolderToProject(folderId, projectId)
      loadFolders()
      loadAllNotes()
      toast.push({
        title: 'Folder moved',
        description: 'Folder has been moved to the project.',
        duration: 3000,
      })
    } catch (error) {
      console.error('Error moving folder to project:', error)
      toast.push({
        title: 'Move failed',
        description: error instanceof Error ? error.message : 'Failed to move folder',
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
  // ---- Archive handlers ----
  const handleArchiveProject = async (projectId: string) => {
    try {
      const archived = await archiveProjectApi(projectId)
      setProjects(prev => prev.filter(p => p.id !== projectId))
      setArchivedProjects(prev => [archived, ...prev])

      // If the archived project was open (dashboard, folder, or note), reset to root.
      const folderInProject = selectedFolderId
        ? folders.find(f => f.id === selectedFolderId)?.project_id === projectId
        : false
      if (
        selectedProjectId === projectId ||
        selectedNote?.project_id === projectId ||
        folderInProject
      ) {
        applyFolderSelection(null)
        if (activeView === 'projects') setActiveView('notes')
      }

      loadFolders()
      loadAllNotes()
      toast.push({
        title: 'Project archived',
        description: `"${archived.name}" was moved to Archive`,
        duration: 3000,
      })
    } catch (error) {
      console.error('Error archiving project:', error)
      toast.push({ title: 'Error', description: 'Failed to archive project', duration: 5000 })
    }
  }

  const handleRestoreProject = async (projectId: string) => {
    try {
      const restored = await restoreProjectApi(projectId)
      setArchivedProjects(prev => prev.filter(p => p.id !== projectId))
      setProjects(prev =>
        [...prev.filter(p => p.id !== projectId), restored].sort((a, b) => a.position - b.position)
      )
      loadFolders()
      loadAllNotes()
      toast.push({
        title: 'Project restored',
        description: `"${restored.name}" is back in your workspace`,
        duration: 3000,
      })
    } catch (error) {
      console.error('Error restoring project:', error)
      toast.push({ title: 'Error', description: 'Failed to restore project', duration: 5000 })
    }
  }

  const handleDeleteArchivedProject = async (projectId: string) => {
    try {
      await deleteProjectApi(projectId)
      setArchivedProjects(prev => prev.filter(p => p.id !== projectId))
      loadFolders()
      loadAllNotes()
      toast.push({
        title: 'Project deleted',
        description: 'Its folders and notes were moved to Unfiled',
        duration: 3000,
      })
    } catch (error) {
      console.error('Error deleting archived project:', error)
      toast.push({ title: 'Error', description: 'Failed to delete project', duration: 5000 })
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
        selectedNoteRef.current = null
        isCreatingNewSaveRef.current = false
        setSelectedNote(null)
        setIsCreatingNew(false)
      }
    } catch (error) {
      console.error('Error deleting note:', error)
      toast.push({ title: 'Error', description: 'Failed to delete note', duration: 5000 })
    }
  }

  const sidebarOffset = sidebarCollapsed ? '64px' : '300px'

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
          <div className="text-lg text-foreground/70 font-medium">Loading your workspace...</div>
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
          <div className="text-lg text-foreground/70 font-medium">Loading your workspace...</div>
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

  const noteTypeOptions = getOrderedNoteTypePresentations().map((noteTypePresentation) => ({
    type: noteTypePresentation.id,
    label: noteTypePresentation.pickerLabel,
    description: noteTypePresentation.description,
    icon: NOTE_TYPE_ICON_MAP[noteTypePresentation.iconKey],
    iconBg: noteTypePresentation.iconBgClassName,
  }))

  const renderNotesView = () => {
    if (shouldShowEditor) {
      return (
        <NoteEditor
          note={isCreatingNew ? null : selectedNote}
          initialNoteType={newNoteType}
          mindmapTemplateId={selectedMindmapTemplateId}
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
          onOpenFileExplorer={() => {
            if (isMobile) {
              setActiveView('files')
            } else {
              setShowFilesPanel(prev => !prev)
            }
          }}
          onOpenProjectsView={() => setActiveView('projects')}
        />
      )
    }

    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8 max-w-md">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-accent-light rounded-full blur-3xl opacity-40"></div>
            <FileEdit className={`relative text-accent mx-auto ${isMobile ? 'w-16 h-16' : 'w-24 h-24'}`} strokeWidth={1.5} />
          </div>
          <h1 className={`font-bold text-foreground mb-3 ${isMobile ? 'text-2xl' : 'text-3xl'}`}>Welcome to MindViz Notes</h1>
          <p className={`text-muted mb-8 ${isMobile ? 'text-base' : 'text-lg'}`}>
            Capture ideas, build mind maps, and organize your thoughts
          </p>
          <div className="space-y-3">
            <button
              onClick={() => handleNewNote()}
              className="w-full inline-flex items-center justify-center gap-3 px-6 py-3 bg-accent text-accent-foreground font-medium rounded-xl hover:opacity-90 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95 touch-target"
            >
              <Sparkles size={20} />
              Start Writing
            </button>
            <p className="text-sm text-muted/70">Click the menu button (top-left) to browse your notes</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      onTouchStartCapture={(event) => {
        if (!isMobile || workspaceNavOpen || event.touches.length !== 1) return
        const touch = event.touches[0]
        beginOpenSwipe(touch.clientX, touch.clientY)
      }}
      onTouchEndCapture={(event) => {
        if (!isMobile || workspaceNavOpen) return
        const touch = event.changedTouches[0]
        if (!touch) return
        endOpenSwipe(touch.clientX, touch.clientY)
      }}
    >
      {/* Unified Sidebar — always visible on desktop, regardless of activeView */}
      {!isMobile && (
        <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border/60 bg-surface transition-[width] duration-300 ease-out ${sidebarCollapsed ? 'w-16' : 'w-[300px]'}`}>
          <SidebarTree
            dense
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
            onMoveFolderToProject={handleMoveFolderToProject}
            onDuplicateNote={handleDuplicateNote}
            onDeleteNote={handleSidebarDeleteNote}
            onMoveNote={handleMoveNote}
            onRenameProject={handleRenameProject}
            onDeleteProject={handleDeleteProject}
            onUpdateProjectColor={handleUpdateProjectColor}
            onCreateProject={handleCreateProject}
            onMoveNoteToProject={handleMoveNoteToProject}
            onOpenProjectDashboard={(projectId) => {
              setSelectedProjectId(projectId)
              setActiveView('projects')
            }}
            onOpenFileExplorer={() => setShowFileExplorerModal(true)}
            onArchiveProject={handleArchiveProject}
            onOpenArchive={() => setShowArchiveModal(true)}
            archivedCount={archivedProjects.length}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed(prev => !prev)}
          />
        </aside>
      )}

      {/* Mobile header */}
      {isMobile && (
        <header className="safe-top fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-border/60 bg-surface px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setWorkspaceNavOpen(prev => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted/80 transition-colors hover:bg-surface-hover hover:text-foreground"
              aria-label="Toggle navigation"
            >
              <Menu size={18} />
            </button>
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-foreground text-[10px] font-bold text-background">
              N
            </span>
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">MindViz Notes</h2>
          </div>
          <span className="h-2 w-2 rounded-full bg-accent/80" aria-hidden />
        </header>
      )}

      {/* Mobile slide-out sidebar */}
      {isMobile && workspaceNavOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setWorkspaceNavOpen(false)}
            onTouchStart={(event) => {
              if (event.touches.length !== 1) return
              const touch = event.touches[0]
              beginCloseSwipe(touch.clientX, touch.clientY)
            }}
            onTouchEnd={(event) => {
              const touch = event.changedTouches[0]
              if (!touch) return
              endCloseSwipe(touch.clientX, touch.clientY)
            }}
          />
          <aside
            className="safe-top fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col border-r border-border/60 bg-surface shadow-2xl"
            onTouchStart={(event) => {
              if (event.touches.length !== 1) return
              const touch = event.touches[0]
              beginCloseSwipe(touch.clientX, touch.clientY)
            }}
            onTouchEnd={(event) => {
              const touch = event.changedTouches[0]
              if (!touch) return
              endCloseSwipe(touch.clientX, touch.clientY)
            }}
          >
            {/* Drawer header */}
            <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-foreground text-[10px] font-bold text-background">
                N
              </span>
              <span className="flex-1 truncate text-[13px] font-semibold text-foreground/90">MindViz Notes</span>
              <button
                onClick={() => setWorkspaceNavOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted/70 transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="Close navigation"
              >
                <X size={15} />
              </button>
            </div>

            {/* Mobile view toggle */}
            <div className="flex shrink-0 gap-1 px-3 pb-2">
              {([
                { key: 'notes' as WorkspaceView, label: 'Notes', icon: FileText },
                { key: 'files' as WorkspaceView, label: 'Files', icon: FolderOpen },
              ]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { switchWorkspaceView(key); setWorkspaceNavOpen(false) }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
                    activeView === key
                      ? 'bg-surface-active/70 text-foreground'
                      : 'text-muted/70 hover:bg-surface-hover hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Mobile project/folder/note tree */}
            <div className="min-h-0 flex-1 overflow-hidden">
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
                onMoveFolderToProject={handleMoveFolderToProject}
                onDuplicateNote={handleDuplicateNote}
                onDeleteNote={handleSidebarDeleteNote}
                onMoveNote={handleMoveNote}
                onRenameProject={handleRenameProject}
                onDeleteProject={handleDeleteProject}
                onUpdateProjectColor={handleUpdateProjectColor}
                onCreateProject={handleCreateProject}
                onMoveNoteToProject={handleMoveNoteToProject}
                onOpenProjectDashboard={(projectId) => {
                  setSelectedProjectId(projectId)
                  setActiveView('projects')
                  setWorkspaceNavOpen(false)
                }}
                onOpenFileExplorer={() => {
                  setShowFileExplorerModal(true)
                  setWorkspaceNavOpen(false)
                }}
                onArchiveProject={handleArchiveProject}
                onOpenArchive={() => {
                  setShowArchiveModal(true)
                  setWorkspaceNavOpen(false)
                }}
                archivedCount={archivedProjects.length}
                collapsed={false}
                onToggleCollapsed={() => setWorkspaceNavOpen(false)}
                showHeader={false}
              />
            </div>

            <div className="shrink-0 border-t border-border/60 px-2 py-2">
              <button
                onClick={handleSignOut}
                className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium text-muted/80 transition-colors hover:bg-danger-light hover:text-danger"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="truncate">Sign out</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Main content area */}
      <main
        className="flex-1 w-full h-screen overflow-hidden bg-background"
        style={
          isMobile
            ? { paddingTop: 'calc(52px + var(--sat))' }
            : { paddingLeft: sidebarOffset }
        }
      >
        {activeView === 'welcome' && (
          <WelcomeBackModal
            isOpen={showWelcomeBack}
            asView
            onClose={closeWelcomeView}
            onCreateNote={(type) => {
              handleNewNote(type)
              closeWelcomeView()
            }}
            onSelectNote={(note) => {
              activateExistingNote(note)
              closeWelcomeView()
            }}
          />
        )}

        {activeView === 'notes' && (
          <div className="relative flex h-full overflow-hidden">
            {/* Main editor area */}
            <div className="flex-1 min-w-0 overflow-hidden">
              {renderNotesView()}
            </div>

            {/* Right files panel (desktop only) */}
            {!isMobile && showFilesPanel && (
              <div
                className="flex-shrink-0 border-l border-border flex flex-col overflow-hidden bg-surface"
                style={{ width: '360px' }}
              >
                <FileExplorerModal
                  isOpen
                  asView
                  onClose={() => setShowFilesPanel(false)}
                  title="Files"
                />
              </div>
            )}

            {/* Files panel toggle tab (desktop only) */}
            {!isMobile && (
              <button
                onClick={() => setShowFilesPanel(prev => !prev)}
                className={`absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-5 h-14 rounded-l-lg border border-r-0 shadow-sm transition-all ${
                  showFilesPanel
                    ? 'bg-accent border-accent text-accent-foreground'
                    : 'bg-surface border-border text-muted/70 hover:bg-accent/10 hover:text-accent hover:border-accent/40'
                }`}
                style={{ right: showFilesPanel ? '360px' : '0' }}
                title={showFilesPanel ? 'Close files panel' : 'Open files panel'}
                aria-label={showFilesPanel ? 'Close files panel' : 'Open files panel'}
              >
                <FolderOpen size={12} />
              </button>
            )}
          </div>
        )}

        {activeView === 'files' && (
          <FileExplorerModal
            isOpen
            asView
            onClose={() => setActiveView('notes')}
          />
        )}

        <FileExplorerModal
          isOpen={showFileExplorerModal}
          onClose={() => setShowFileExplorerModal(false)}
        />

        {activeView === 'projects' && selectedProjectId && (() => {
          const dashboardProject = projects.find(p => p.id === selectedProjectId)
          if (!dashboardProject) return null
          return (
            <ProjectDashboard
              project={dashboardProject}
              allNotes={allNotes}
              folders={folders}
              onSelectNote={(note) => {
                handleSelectNote(note)
                setActiveView('notes')
              }}
              onUpdateProject={(id, updates) => {
                setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
              }}
              onClose={() => setActiveView('notes')}
            />
          )
        })()}
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
            className={`bg-surface p-6 ${
              isMobile
                ? 'fixed inset-0 overflow-y-auto safe-top safe-bottom'
                : 'w-full max-w-3xl rounded-2xl border border-border shadow-xl'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Choose a note type</h3>
                <p className="mt-1 text-sm text-muted">Pick how you want to start so we can set up the right editor.</p>
              </div>
              <button
                onClick={handleCancelNoteTypePrompt}
                className="rounded-full p-2 text-muted transition hover:bg-surface-hover hover:text-foreground"
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
                  className="flex h-full flex-col gap-4 rounded-xl border border-border bg-surface p-4 text-left transition hover:border-accent/50 hover:shadow-md active:scale-[0.98] touch-target"
                >
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{label}</div>
                    <p className="mt-1 text-xs text-muted">{description}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleCancelNoteTypePrompt}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-hover hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mindmap Template Picker Modal */}
      {pendingMindmapTemplateContext !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleCancelMindmapTemplatePicker()
            }
          }}
        >
          <div
            className={`bg-surface p-6 ${
              isMobile
                ? 'fixed inset-0 overflow-y-auto safe-top safe-bottom'
                : 'w-full max-w-2xl rounded-2xl border border-border shadow-xl'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Choose a template</h3>
                <p className="mt-1 text-sm text-muted">Pick a starting structure for your mind map.</p>
              </div>
              <button
                onClick={handleCancelMindmapTemplatePicker}
                className="rounded-full p-2 text-muted transition hover:bg-surface-hover hover:text-foreground"
                aria-label="Close template picker"
              >
                <X size={18} />
              </button>
            </div>
            <div className={`mt-6 grid gap-3 ${isMobile ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {MINDMAP_TEMPLATES.map((template) => {
                const iconMap: Record<MindmapTemplate['iconKey'], React.ReactNode> = {
                  blank: <FileQuestion size={20} />,
                  project: <Target size={20} />,
                  swot: <LayoutGrid size={20} />,
                  brainstorm: <Lightbulb size={20} />,
                  proscons: <Scale size={20} />,
                }
                return (
                  <button
                    key={template.id}
                    onClick={() => handleSelectMindmapTemplate(template.id)}
                    className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-left transition hover:border-accent/50 hover:shadow-md active:scale-[0.98] touch-target"
                  >
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-light text-accent">
                      {iconMap[template.iconKey]}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{template.label}</div>
                      <p className="mt-1 text-xs text-muted">{template.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="mt-6 flex justify-between">
              <button
                onClick={handleCancelMindmapTemplatePicker}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-hover hover:text-foreground inline-flex items-center gap-2"
              >
                <ChevronLeft size={16} />
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal (in-app) */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl shadow-xl border border-border max-w-md w-full p-5">
            <h3 className="text-lg font-semibold text-foreground mb-2">New Folder</h3>
            <p className="text-sm text-muted mb-4">Enter a name for the new folder.</p>
            <input
              ref={createFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-3.5 py-2.5 border border-border bg-surface text-foreground placeholder:text-muted rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCreateFolder()
                if (e.key === 'Escape') cancelCreateFolder()
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelCreateFolder}
                className="px-4 py-2 text-sm font-medium text-muted bg-surface border border-border rounded-xl hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={confirmCreateFolder}
                className="px-4 py-2 text-sm font-medium text-accent-foreground bg-accent rounded-xl hover:opacity-90"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive modal */}
      <ArchivedProjectsModal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        projects={archivedProjects}
        onRestore={handleRestoreProject}
        onDelete={handleDeleteArchivedProject}
      />
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
            <div className="text-lg text-foreground/70 font-medium">Loading your workspace...</div>
          </div>
        </div>
      }>
        <WorkspaceContent />
      </Suspense>
    </ErrorBoundary>
  )
}
