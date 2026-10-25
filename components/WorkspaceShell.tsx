'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import dynamic from 'next/dynamic'
import NoteEditor, { Note } from '@/components/NoteEditor'
import HomeDashboard from '@/components/HomeDashboard'
import TasksView from '@/components/TasksView'
import FileExplorerModal from '@/components/FileExplorerModal'
import ProjectDashboard from '@/components/ProjectDashboard'
import ArchivedProjectsModal from '@/components/ArchivedProjectsModal'
import NewProjectModal from '@/components/NewProjectModal'
import {
  FileEdit,
  Sparkles,
  FileText,
  PenTool,
  Network,
  BookOpen,
  Table2,
  FilePenLine,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Home,
  FileQuestion,
  Target,
  Lightbulb,
  Scale,
  LayoutGrid,
  Search,
  ListTodo,
  Layers,
  Archive,
  Keyboard,
  LogOut,
  Settings,
  Plus,
  FilePlus2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useIsMobile, useIsCompact } from '@/lib/useIsMobile'
import type { NoteSummary, NoteType } from '@/lib/notes'
import { getOrderedNoteTypePresentations, type NoteTypeIconKey } from '@/lib/note-types'
import { MINDMAP_TEMPLATES, type MindmapTemplate } from '@/lib/mindmap-templates'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import BaseModal, { ModalHeader, ModalBody, ModalFooter, ModalTitle } from '@/components/BaseModal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { useWorkspaceData } from '@/lib/workspace/useWorkspaceData'
import { useNoteActions } from '@/lib/workspace/useNoteActions'
import { useFolderActions } from '@/lib/workspace/useFolderActions'
import { useProjectActions } from '@/lib/workspace/useProjectActions'
import WorkspaceSidebar from '@/components/workspace/WorkspaceSidebar'
import WorkspaceSkeleton from '@/components/workspace/WorkspaceSkeleton'
import CommandPalette from '@/components/CommandPalette'
import OfflineStatusIndicator from '@/components/OfflineStatusIndicator'
import TopBar from '@/components/shell/TopBar'
import NoteListPane from '@/components/shell/NoteListPane'
import MobileTabBar from '@/components/shell/MobileTabBar'
import ShellBackground from '@/components/shell/ShellBackground'
import EmptyEditorPane from '@/components/shell/EmptyEditorPane'
import type {
  Breadcrumb,
  NoteListDensity,
  NoteListSort,
  TopBarMenuItem,
} from '@/components/shell/types'
import { useNavHistory, type NavLocation } from '@/lib/navigation/nav-history'
import { requestOpenAIAssistant } from '@/lib/ai/assistant-events'
import type { WorkspaceView } from '@/lib/workspace/types'
import { subscribeToConflicts } from '@/lib/offline/events'
import { installOfflineSync } from '@/lib/offline/sync'

type NoteCreationContext = {
  folderArg?: string | null
  projectArg?: string | null
}
import { useToast } from '@/components/ToastProvider'
import { getNote, searchNotes } from '@/lib/notes'
import { recordNoteOpened } from '@/lib/note-activity'
import { readWelcomeOnStartupPreference } from '@/lib/workspace/preferences'
import { formatModShortcut } from '@/lib/platform'

const SettingsModal = dynamic(() => import('@/components/SettingsModal'), {
  ssr: false,
})

const KeyboardShortcutsHelp = dynamic(() => import('@/components/KeyboardShortcutsHelp'), {
  ssr: false,
})

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
  // Tablet-sized viewports keep the rail but start with the library collapsed so
  // the note list and editor still have room to breathe.
  const isCompact = useIsCompact()
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const selectedNoteRef = useRef<Note | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const isCreatingNewSaveRef = useRef(false)
  const [newNoteType, setNewNoteType] = useState<NoteType>('rich-text')
  const [pendingNoteContext, setPendingNoteContext] = useState<NoteCreationContext | null>(null)
  // Mindmap template picker state
  const [pendingMindmapTemplateContext, setPendingMindmapTemplateContext] = useState<NoteCreationContext | null>(null)
  const [selectedMindmapTemplateId, setSelectedMindmapTemplateId] = useState<string | undefined>(undefined)
  const suppressRealtimeRef = useRef(false)
  const isApplyingUrlRef = useRef(false)

  // Retry queued writes when connectivity returns and surface conflicts that
  // need a human decision.
  useEffect(() => installOfflineSync(), [])

  useEffect(() => {
    return subscribeToConflicts((conflict) => {
      const title = (
        conflict.local?.title ??
        conflict.local?.name ??
        conflict.remote?.title ??
        conflict.remote?.name
      ) as string | undefined
      const displayTitle = title ? `"${title}"` : 'An item'
      toast.push({
        title: 'Sync conflict',
        description:
          displayTitle +
          ' was changed on another device. Your local version is kept â€” review it in the sync status.',
        duration: 10000,
      })
    })
  }, [toast])

  // Server-derived workspace state (notes, folders, projects) plus realtime sync
  const {
    notes,
    setNotes,
    allNotes,
    setAllNotes,
    folders,
    setFolders,
    folderTree,
    setFolderTree,
    projects,
    setProjects,
    archivedProjects,
    setArchivedProjects,
    archivedProjectIds,
    isLoadingNotes,
    isLoadingFolders,
    isLoadingProjects,
    isLoadingAllNotes,
    filterOutArchivedContent,
    loadProjects,
    loadArchivedProjects,
    loadFolders,
    loadNotesInFolder,
    loadAllNotes,
  } = useWorkspaceData({
    userId: user?.id,
    selectedFolderId,
    suppressRealtimeRef,
  })

  // Projects state
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  // Sidebar state (rail is always visible on desktop; this collapses the library pane)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1280
  )
  // Note list pane (desktop) + its presentation preferences
  const [noteListOpen, setNoteListOpen] = useState(true)
  const [noteSort, setNoteSort] = useState<NoteListSort>('updated')
  const [noteDensity, setNoteDensity] = useState<NoteListDensity>('comfortable')

  // Collapse the library automatically when the viewport cannot comfortably
  // hold rail + library + note list + editor side by side.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-width: 1279px)')
    setSidebarCollapsed(mql.matches)
    const handler = () => setSidebarCollapsed(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // Workspace view state
  const [activeView, setActiveView] = useState<WorkspaceView>('notes')
  const [showFilesPanel, setShowFilesPanel] = useState(false)
  const [showFileExplorerModal, setShowFileExplorerModal] = useState(false)
  const [workspaceNavCollapsed, setWorkspaceNavCollapsed] = useState(false)
  const [workspaceNavOpen, setWorkspaceNavOpen] = useState(false)
  const mobileSwipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const mobileSwipeModeRef = useRef<'open' | 'close' | null>(null)
  
  // Home view state
  const hasShownHomeOnStartupRef = useRef(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // âŒ˜/Ctrl+K opens the palette â€” except inside the rich text editor, where the
  // same shortcut inserts a link.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isToggle =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'k'
      if (!isToggle) return

      const target = event.target as HTMLElement | null
      if (!commandPaletteOpen && target?.closest('[contenteditable="true"], [contenteditable=""]')) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setCommandPaletteOpen((open) => !open)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [commandPaletteOpen])



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
    if (user?.id) recordNoteOpened(user.id, note.id)
    applyFolderSelection(note.folder_id ?? null, {
      projectId: note.project_id ?? null,
      preserveDraftState: true,
    })
  }, [applyFolderSelection, user?.id])

  // ---- Navigation history (back / forward) -------------------------------
  // In-memory, browser-like trail over the four serialisable location fields.
  // The URL-sync effects above stay untouched; history only records explicit
  // user navigation so deep links and realtime updates never pollute it.
  const navHistory = useNavHistory(
    {
      view: activeView,
      folderId: selectedFolderId,
      projectId: selectedProjectId,
      noteId: null,
    },
    { maxEntries: 60 }
  )
  const navHistoryRef = useRef(navHistory)
  navHistoryRef.current = navHistory
  const isApplyingHistoryRef = useRef(false)

  const recordNav = useCallback((location: NavLocation) => {
    if (isApplyingHistoryRef.current) return
    navHistoryRef.current.push(location)
  }, [])

  const {
    handleSaveNote,
    handleDeleteNote,
    handleDuplicateNote,
    handleMoveNote,
    handleMoveNoteToProject,
    handleSidebarDeleteNote,
  } = useNoteActions({
    notes,
    selectedNote,
    selectedNoteRef,
    isCreatingNewSaveRef,
    suppressRealtimeRef,
    selectedFolderId,
    selectedProjectId,
    folders,
    projects,
    newNoteType,
    setNotes,
    setAllNotes,
    setSelectedNote,
    setIsCreatingNew,
    setSelectedProjectId,
    activateExistingNote,
    loadNotesInFolder,
    loadFolders,
    toast,
  })

  const {
    showCreateFolderModal,
    createFolderParentId,
    newFolderName,
    setNewFolderName,
    createFolderInputRef,
    handleCreateFolder,
    confirmCreateFolder,
    cancelCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveFolder,
    handleMoveFolderToProject,
  } = useFolderActions({
    folders,
    allNotes,
    selectedFolderId,
    loadFolders,
    loadNotesInFolder,
    loadAllNotes,
    applyFolderSelection,
    toast,
  })

  const {
    showNewProjectModal,
    setShowNewProjectModal,
    handleCreateProject,
    handleConfirmCreateProject,
    handleRenameProject,
    handleDeleteProject,
    handleUpdateProjectColor,
    handleArchiveProject,
    handleRestoreProject,
    handleDeleteArchivedProject,
  } = useProjectActions({
    projects,
    selectedProjectId,
    selectedNote,
    selectedFolderId,
    folders,
    notes: allNotes,
    activeView,
    setProjects,
    setArchivedProjects,
    setSelectedProjectId,
    applyFolderSelection,
    setActiveView,
    loadFolders,
    loadAllNotes,
    toast,
  })

  // ---- Refs for URLâ†’state sync (break circular dependency) ----
  // These refs let the URL sync effect read the latest state/callbacks
  // without including them in its dependency array, preventing the
  // stale-noteParam flip-flop that occurs when useSearchParams doesn't
  // reflect the replaceState update on the same render cycle.
  const allNotesRef = useRef<NoteSummary[]>(allNotes)
  const notesRef = useRef<NoteSummary[]>(notes)
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

  /** Restore a location from the back/forward trail. */
  const applyNavLocation = useCallback(
    async (target: NavLocation) => {
      isApplyingHistoryRef.current = true
      try {
        setActiveView(target.view)
        setWorkspaceNavOpen(false)
        setSelectedProjectId(target.projectId)

        if (target.view === 'notes' && target.noteId) {
          const cached = allNotesRef.current.find((n) => n.id === target.noteId)
          const fullNote =
            cached && 'content' in cached && typeof (cached as Note).content === 'string'
              ? (cached as Note)
              : await getNote(target.noteId).catch(() => null)

          if (fullNote) {
            activateExistingNote(fullNote)
            return
          }
        }

        selectedNoteRef.current = null
        isCreatingNewSaveRef.current = false
        setSelectedNote(null)
        setIsCreatingNew(false)
        applyFolderSelection(target.folderId, {
          projectId: target.projectId,
          preserveDraftState: false,
        })
      } finally {
        isApplyingHistoryRef.current = false
      }
    },
    [activateExistingNote, applyFolderSelection]
  )

  const goBack = useCallback(() => {
    const { state } = navHistoryRef.current
    const target = state.entries[state.index - 1]
    if (!target) return
    navHistoryRef.current.back()
    void applyNavLocation(target)
  }, [applyNavLocation])

  const goForward = useCallback(() => {
    const { state } = navHistoryRef.current
    const target = state.entries[state.index + 1]
    if (!target) return
    navHistoryRef.current.forward()
    void applyNavLocation(target)
  }, [applyNavLocation])

  /** Open a project dashboard (records a navigation entry). */
  const openProjectDashboard = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId)
      setActiveView('projects')
      setWorkspaceNavOpen(false)
      recordNav({ view: 'projects', folderId: null, projectId, noteId: null })
    },
    [recordNav]
  )

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  const folderParam = searchParams.get('folder')
  const noteParam = searchParams.get('note')

  // URL â†’ state sync: only re-runs when URL params actually change
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
          const cachedRow =
            allNotesRef.current.find((n) => n.id === noteParam) ??
            notesRef.current.find((n) => n.id === noteParam) ??
            null

          let targetNote: Note | null =
            cachedRow && 'content' in cachedRow && typeof (cachedRow as Note).content === 'string'
              ? (cachedRow as Note)
              : null

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

    const row = allNotes.find((n) => n.id === noteParam)
    if (!row || selectedNoteIdRef.current === row.id) return

    urlSyncSucceededRef.current = true
    isApplyingUrlRef.current = true
    void getNote(row.id)
      .then((targetNote) => {
        if (targetNote) activateExistingNoteRef.current(targetNote)
      })
      .catch(() => {
        urlSyncSucceededRef.current = false
      })
      .finally(() => {
        isApplyingUrlRef.current = false
      })
  }, [allNotes, noteParam])

  useEffect(() => {
    if (isApplyingUrlRef.current) return
    const noteId = isCreatingNew ? null : selectedNote?.id ?? null
    updateNavigationParams(selectedFolderId, noteId)
  }, [selectedFolderId, selectedNote?.id, isCreatingNew, updateNavigationParams])

  // Open Home once when data is loaded (opt-out via settings)
  useEffect(() => {
    if (
      user &&
      !isLoadingFolders &&
      !isLoadingNotes &&
      !isLoadingProjects &&
      !isLoadingAllNotes &&
      !hasShownHomeOnStartupRef.current
    ) {
      hasShownHomeOnStartupRef.current = true
      if (readWelcomeOnStartupPreference()) {
        setActiveView('welcome')
      }
    }
  }, [user, isLoadingFolders, isLoadingNotes, isLoadingProjects, isLoadingAllNotes])

  const closeWelcomeView = useCallback(() => {
    setActiveView('notes')
  }, [])

  const openWelcomeView = useCallback(() => {
    setActiveView('welcome')
  }, [])

  const openTasksView = useCallback(() => {
    setActiveView('tasks')
  }, [])

  /** Full-text note search for the command palette (stable identity). */
  const searchNoteContent = useCallback(
    (query: string) => searchNotes(query, { limit: 20 }),
    []
  )

  const switchWorkspaceView = useCallback(
    (view: WorkspaceView) => {
      setActiveView(view)
      setWorkspaceNavOpen(false)
      recordNav({
        view,
        folderId: view === 'notes' ? selectedFolderIdRef.current : null,
        projectId: view === 'notes' ? selectedProjectIdRef.current : null,
        noteId: view === 'notes' ? selectedNoteIdRef.current ?? null : null,
      })
    },
    [recordNav]
  )

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
    recordNav({
      view: 'notes',
      folderId: targetFolderId ?? null,
      projectId: projectArg !== undefined ? projectArg ?? null : selectedProjectId,
      noteId: null,
    })
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

  const recordNoteNavigation = useCallback((note: Note) => {
    recordNav({
      view: 'notes',
      folderId: note.folder_id ?? null,
      projectId: note.project_id ?? null,
      noteId: note.id,
    })
  }, [recordNav])

  const handleSelectNote = async (note: NoteSummary) => {
    if ('content' in note && typeof (note as Note).content === 'string') {
      activateExistingNote(note as Note)
      recordNoteNavigation(note as Note)
      return
    }

    try {
      const fullNote = await getNote(note.id)
      if (fullNote) {
        activateExistingNote(fullNote)
        recordNoteNavigation(fullNote)
      } else {
        toast.push({ title: 'Note not found', description: 'This note could not be loaded.' })
      }
    } catch (error) {
      console.error('Failed to open note:', error)
      toast.push({ title: 'Open failed', description: 'Could not load the note. Check your connection.' })
    }
  }

  const handleSelectFolder = (folderId: string | null) => {
    if (activeView !== 'notes') setActiveView('notes')
    setWorkspaceNavOpen(false)
    applyFolderSelection(folderId)
    const folderRecord = folders.find((f) => f.id === folderId)
    recordNav({
      view: 'notes',
      folderId,
      projectId: folderId ? folderRecord?.project_id ?? null : null,
      noteId: null,
    })
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

  // Desktop content offset: rail + library (library collapses to 0).
  const contentOffset = sidebarCollapsed
    ? 'var(--rail-width)'
    : 'calc(var(--rail-width) + var(--library-width))'

  // Set CSS variable for fixed-position elements (e.g. bottom bar in NoteEditor)
  useEffect(() => {
    if (typeof document === 'undefined' || isMobile) return
    document.documentElement.style.setProperty('--workspace-sidebar-offset', contentOffset)
    return () => { document.documentElement.style.removeProperty('--workspace-sidebar-offset') }
  }, [contentOffset, isMobile])

  // Global keyboard shortcuts. Kept in a ref so the listener binds once while
  // always calling the latest handlers.
  const shortcutActionsRef = useRef({
    newNote: () => {},
    toggleSidebar: () => {},
    goBack: () => {},
    goForward: () => {},
    switchView: (_view: WorkspaceView) => {},
    openAssistant: () => {},
  })
  shortcutActionsRef.current = {
    newNote: () => handleNewNote(),
    toggleSidebar: () => setSidebarCollapsed((prev) => !prev),
    goBack,
    goForward,
    switchView: switchWorkspaceView,
    openAssistant: () => {
      // The assistant only mounts with an editor, so ignore the shortcut
      // everywhere else instead of silently doing nothing after a view switch.
      if (activeView !== 'notes' || (!isCreatingNew && !selectedNote)) return
      requestOpenAIAssistant()
    },
  }

  useEffect(() => {
    const VIEW_SHORTCUTS: Record<string, WorkspaceView> = {
      '1': 'welcome',
      '2': 'notes',
      '3': 'tasks',
      '4': 'files',
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      if (event.shiftKey) return

      const key = event.key.toLowerCase()
      const view = VIEW_SHORTCUTS[key]
      if (view) {
        event.preventDefault()
        shortcutActionsRef.current.switchView(view)
        return
      }

      if (key === 'n') {
        event.preventDefault()
        shortcutActionsRef.current.newNote()
      } else if (key === 'j') {
        event.preventDefault()
        shortcutActionsRef.current.openAssistant()
      } else if (key === '\\') {
        event.preventDefault()
        shortcutActionsRef.current.toggleSidebar()
      } else if (key === '[') {
        event.preventDefault()
        shortcutActionsRef.current.goBack()
      } else if (key === ']') {
        event.preventDefault()
        shortcutActionsRef.current.goForward()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (loading) {
    return (
      <WorkspaceSkeleton />
    )
  }

  if (!user) {
    return null
  }

  const profileName = typeof user.user_metadata?.display_name === 'string'
    ? user.user_metadata.display_name.trim()
    : ''
  const homeUserName = profileName || user.email?.split('@')[0]

  if (isLoadingFolders) {
    return (
      <WorkspaceSkeleton />
    )
  }

  // The editor only takes over when there is an actual document to edit; with
  // nothing open the shell shows a welcoming empty pane instead of a blank
  // draft. Creating a note sets isCreatingNew, so that path is unchanged.
  const showEditor = isCreatingNew || selectedNote !== null

  const currentFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null
  const currentProject = projects.find((project) => project.id === selectedProjectId) ?? null

  const listNotes = selectedFolderId
    ? filterOutArchivedContent(notes)
    : currentProject
      ? filterOutArchivedContent(allNotes.filter((note) => note.project_id === currentProject.id))
      : filterOutArchivedContent(allNotes)

  const listTitle = currentFolder?.name ?? currentProject?.name ?? 'All notes'
  const listSubtitle = currentFolder
    ? currentProject
      ? `${currentProject.name} Â· ${listNotes.length} note${listNotes.length === 1 ? '' : 's'}`
      : `${listNotes.length} note${listNotes.length === 1 ? '' : 's'}`
    : `${folders.length} folder${folders.length === 1 ? '' : 's'} Â· ${listNotes.length} note${listNotes.length === 1 ? '' : 's'}`

  const recentNotes = [...allNotes]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5)

  const breadcrumbs: Breadcrumb[] = (() => {
    const home: Breadcrumb = {
      id: 'home',
      label: 'Home',
      icon: Home,
      onClick: () => switchWorkspaceView('welcome'),
    }

    if (activeView === 'welcome') return [{ id: 'home', label: 'Home', icon: Home }]
    if (activeView === 'tasks') {
      return [home, { id: 'tasks', label: 'Tasks & agenda', icon: ListTodo }]
    }
    if (activeView === 'files') {
      return [home, { id: 'files', label: 'Files', icon: FolderOpen }]
    }
    if (activeView === 'projects') {
      return [
        home,
        {
          id: 'project',
          label: currentProject?.name ?? 'Project',
          icon: Layers,
          color: currentProject?.color ?? null,
        },
      ]
    }

    const crumbs: Breadcrumb[] = [home]
    if (currentProject) {
      crumbs.push({
        id: `project-${currentProject.id}`,
        label: currentProject.name,
        color: currentProject.color,
        onClick: () => openProjectDashboard(currentProject.id),
      })
    }
    if (currentFolder) {
      crumbs.push({
        id: `folder-${currentFolder.id}`,
        label: currentFolder.name,
        icon: FolderOpen,
      })
    }
    if (selectedNote) {
      crumbs.push({
        id: `note-${selectedNote.id}`,
        label: selectedNote.title || 'Untitled',
        icon: FileText,
      })
    } else if (isCreatingNew) {
      crumbs.push({ id: 'new-note', label: 'New note', icon: FilePlus2 })
    } else {
      crumbs.push({ id: 'library', label: listTitle, icon: FileText })
    }
    return crumbs
  })()

  const assistantAvailable = activeView === 'notes' && (isCreatingNew || selectedNote !== null)

  const overflowItems: TopBarMenuItem[] = [
    ...(assistantAvailable
      ? [
          {
            id: 'ai-assistant',
            label: 'Ask AI assistant',
            icon: Sparkles,
            shortcut: formatModShortcut('J'),
            onSelect: () => requestOpenAIAssistant(),
          } satisfies TopBarMenuItem,
        ]
      : []),
    ...(isCompact && activeView === 'notes' && showEditor
      ? [
          {
            id: 'back-to-notes',
            label: 'Back to note list',
            icon: FileText,
            onSelect: () => handleCancel(),
          } satisfies TopBarMenuItem,
        ]
      : []),
    {
      id: 'note-list',
      label: noteListOpen ? 'Hide note list' : 'Show note list',
      icon: LayoutGrid,
      onSelect: () => setNoteListOpen((prev) => !prev),
    },
    {
      id: 'files',
      label: 'Files',
      icon: FolderOpen,
      shortcut: formatModShortcut('4'),
      onSelect: () => switchWorkspaceView('files'),
    },
    {
      id: 'archive',
      label: 'Archived projects',
      icon: Archive,
      onSelect: () => setShowArchiveModal(true),
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: Keyboard,
      onSelect: () => setShowShortcuts(true),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      onSelect: () => setShowSettings(true),
    },
    {
      id: 'sign-out',
      label: 'Sign out',
      icon: LogOut,
      danger: true,
      onSelect: () => { void handleSignOut() },
    },
  ]

  // Phones and tablets use a list-or-editor flow (one pane at a time); desktops
  // show the note list beside the editor and can toggle it.
  const showListPane = isCompact ? !showEditor : noteListOpen

  const noteTypeOptions = getOrderedNoteTypePresentations().map((noteTypePresentation) => ({
    type: noteTypePresentation.id,
    label: noteTypePresentation.pickerLabel,
    description: noteTypePresentation.description,
    icon: NOTE_TYPE_ICON_MAP[noteTypePresentation.iconKey],
    iconBg: noteTypePresentation.iconBgClassName,
  }))

  const renderNotesView = () => {
    if (showEditor) {
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
      <EmptyEditorPane
        onCreateNote={(type) => handleNewNote(type)}
        recentNotes={recentNotes}
        onSelectNote={handleSelectNote}
        onOpenSearch={() => setCommandPaletteOpen(true)}
      />
    )
  }

  return (
    <div
      className="relative flex h-[100dvh] min-h-screen w-full overflow-hidden text-foreground"
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
      <ShellBackground />

      <WorkspaceSidebar
        isMobile={isMobile}
        activeView={activeView}
        sidebarCollapsed={sidebarCollapsed}
        mobileOpen={workspaceNavOpen}
        userName={homeUserName}
        userEmail={user.email}
        treeProps={{
          projects,
          folderTree,
          allNotes,
          selectedNoteId: selectedNote?.id,
          selectedFolderId,
          selectedProjectId,
          onSelectNote: handleSelectNote,
          onSelectFolder: handleSelectFolder,
          onNewNote: (noteType, folderId, projectId) => handleNewNote(noteType as any, folderId, projectId),
          onCreateFolder: handleCreateFolder,
          onRenameFolder: handleRenameFolder,
          onDeleteFolder: handleDeleteFolder,
          onMoveFolder: handleMoveFolder,
          onMoveFolderToProject: handleMoveFolderToProject,
          onDuplicateNote: handleDuplicateNote,
          onDeleteNote: handleSidebarDeleteNote,
          onMoveNote: handleMoveNote,
          onRenameProject: handleRenameProject,
          onDeleteProject: handleDeleteProject,
          onUpdateProjectColor: handleUpdateProjectColor,
          onCreateProject: handleCreateProject,
          onMoveNoteToProject: handleMoveNoteToProject,
          archivedCount: archivedProjects.length,
        }}
        onSwitchView={switchWorkspaceView}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        onCloseMobileNav={() => setWorkspaceNavOpen(false)}
        onEnsureNotesView={() => {
          if (activeView !== 'notes') setActiveView('notes')
          setWorkspaceNavOpen(false)
        }}
        onOpenProjectDashboard={openProjectDashboard}
        onOpenFileExplorer={() => {
          setShowFileExplorerModal(true)
          setWorkspaceNavOpen(false)
        }}
        onOpenArchive={() => {
          setShowArchiveModal(true)
          setWorkspaceNavOpen(false)
        }}
        onOpenSettings={() => setShowSettings(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenWelcome={openWelcomeView}
        onOpenTasks={openTasksView}
        onSignOut={handleSignOut}
        onMobileTouchStart={beginCloseSwipe}
        onMobileTouchEnd={endCloseSwipe}
      />

      {/* Content column */}
      <div
        className="relative z-10 flex h-full min-w-0 flex-1 flex-col pb-[calc(var(--mobile-bar-height)+var(--sab))] md:pb-0"
        style={isMobile ? undefined : { paddingLeft: contentOffset }}
      >
        <TopBar
          breadcrumbs={breadcrumbs}
          canGoBack={navHistory.canGoBack}
          canGoForward={navHistory.canGoForward}
          onBack={goBack}
          onForward={goForward}
          onOpenSearch={() => setCommandPaletteOpen(true)}
          onCreateNote={(type) => handleNewNote(type)}
          noteListOpen={noteListOpen}
          onToggleNoteList={
            activeView === 'notes' ? () => setNoteListOpen((prev) => !prev) : undefined
          }
          overflowItems={overflowItems}
          onOpenLibrary={() => setWorkspaceNavOpen(true)}
        />

        <main className="relative min-h-0 flex-1 overflow-hidden">
          {activeView === 'welcome' && (
            <div className="h-full overflow-hidden">
              <HomeDashboard
                userId={user.id}
                userName={homeUserName}
                notes={allNotes}
                folders={folders}
                projects={projects}
                isLoading={isLoadingNotes || isLoadingProjects || isLoadingAllNotes}
                onSelectNote={(note) => {
                  void handleSelectNote(note)
                  closeWelcomeView()
                }}
                onCreateNote={(type) => {
                  setActiveView('notes')
                  handleNewNote(type)
                }}
                onNewNote={() => {
                  setActiveView('notes')
                  handleNewNote()
                }}
                onOpenProject={openProjectDashboard}
                onCreateProject={handleCreateProject}
                onOpenSearch={() => setCommandPaletteOpen(true)}
                onOpenTasks={() => setActiveView('tasks')}
                onOpenUnfiled={() => {
                  handleSelectFolder(null)
                  setActiveView('notes')
                }}
              />
            </div>
          )}

          {activeView === 'tasks' && (
            <div className="h-full overflow-hidden">
              <TasksView
                notes={allNotes}
                projects={projects}
                onSelectNote={(note) => {
                  void handleSelectNote(note)
                  setActiveView('notes')
                }}
                onOpenProject={openProjectDashboard}
              />
            </div>
          )}

          {activeView === 'files' && (
            <div className="h-full overflow-hidden p-2 sm:p-3">
              <div className="glass-card flex h-full flex-col overflow-hidden">
                <FileExplorerModal isOpen asView onClose={() => setActiveView('notes')} />
              </div>
            </div>
          )}

          {activeView === 'notes' && (
            <div className="relative flex h-full min-h-0 gap-2 p-2 sm:gap-3 sm:p-3">
              {showListPane && (
                <div
                  className={
                    isCompact
                      ? 'min-h-0 w-full'
                      : 'min-h-0 shrink-0 md:w-[var(--list-width)]'
                  }
                >
                  <NoteListPane
                    notes={listNotes}
                    title={listTitle}
                    subtitle={listSubtitle}
                    isLoading={isLoadingNotes || isLoadingAllNotes}
                    selectedNoteId={selectedNote?.id ?? null}
                    folders={folders}
                    projects={projects}
                    sort={noteSort}
                    onSortChange={setNoteSort}
                    density={noteDensity}
                    onDensityChange={setNoteDensity}
                    onSelectNote={handleSelectNote}
                    onNewNote={() => handleNewNote()}
                    className="h-full"
                  />
                </div>
              )}

              <div
                className={`min-h-0 min-w-0 flex-1 ${isCompact && showListPane ? 'hidden' : ''}`}
              >
                {renderNotesView()}
              </div>

              {/* Right files panel (desktop only) */}
              {!isMobile && showFilesPanel && (
                <div className="glass-card flex min-h-0 w-[360px] shrink-0 flex-col overflow-hidden">
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
                  onClick={() => setShowFilesPanel((prev) => !prev)}
                  className="absolute right-1 top-1/2 z-20 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:border-accent/40 hover:text-accent focus-ring"
                  title={showFilesPanel ? 'Close files panel' : 'Open files panel'}
                  aria-label={showFilesPanel ? 'Close files panel' : 'Open files panel'}
                >
                  <FolderOpen size={12} />
                </button>
              )}
            </div>
          )}

          {activeView === 'projects' && selectedProjectId && (() => {
            const dashboardProject = projects.find((p) => p.id === selectedProjectId)
            if (!dashboardProject) return null
            return (
              <div className="h-full overflow-hidden">
                <ProjectDashboard
                  project={dashboardProject}
                  allNotes={allNotes}
                  folders={folders}
                  onSelectNote={(note) => {
                    void handleSelectNote(note)
                    setActiveView('notes')
                  }}
                  onUpdateProject={(id, updates) => {
                    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)))
                  }}
                  onClose={() => setActiveView('notes')}
                />
              </div>
            )
          })()}
        </main>
      </div>

      <MobileTabBar
        activeView={activeView}
        onNavigate={(view) => {
          // On a phone, tapping "Notes" while a note is open returns to the list
          // instead of leaving the user stranded inside the editor.
          if (view === 'notes' && activeView === 'notes' && showEditor) {
            handleCancel()
            return
          }
          switchWorkspaceView(view)
        }}
        onOpenSearch={() => setCommandPaletteOpen(true)}
        onOpenMore={() => setWorkspaceNavOpen(true)}
      />

      <OfflineStatusIndicator />

      <FileExplorerModal
        isOpen={showFileExplorerModal}
        onClose={() => setShowFileExplorerModal(false)}
      />

      {showSettings && <SettingsModal isOpen onClose={() => setShowSettings(false)} />}

      {showShortcuts && (
        <KeyboardShortcutsHelp isOpen onClose={() => setShowShortcuts(false)} />
      )}

      {commandPaletteOpen && (
        <CommandPalette
          isOpen
          onClose={() => setCommandPaletteOpen(false)}
          notes={allNotes}
          folders={folderTree}
          projects={projects}
          onSelectNote={(note) => {
            setActiveView('notes')
            void handleSelectNote(note)
          }}
          onSearchNotes={searchNoteContent}
          onSelectFolder={(folderId) => {
            setActiveView('notes')
            handleSelectFolder(folderId)
          }}
          onOpenProject={openProjectDashboard}
          onCreateNote={(type) => handleNewNote(type)}
          onOpenHome={openWelcomeView}
          onOpenTasks={openTasksView}
          onOpenFiles={() => setActiveView('files')}
          onOpenSettings={() => setShowSettings(true)}
          onOpenShortcuts={() => setShowShortcuts(true)}
        />
      )}

      {pendingNoteContext !== null && (
        <BaseModal
          isOpen
          onClose={handleCancelNoteTypePrompt}
          size="3xl"
          zIndex={60}
          animation="zoom"
        >
          <ModalHeader onClose={handleCancelNoteTypePrompt} closeAriaLabel="Close note type picker">
            <div className="min-w-0">
              <ModalTitle>Choose a note type</ModalTitle>
              <p className="mt-1 text-sm text-muted">Pick how you want to start so we can set up the right editor.</p>
            </div>
          </ModalHeader>
          <ModalBody>
            <div className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3'}`}>
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
          </ModalBody>
          <ModalFooter>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={handleCancelNoteTypePrompt}>
                Cancel
              </Button>
            </div>
          </ModalFooter>
        </BaseModal>
      )}

      {/* Mindmap Template Picker Modal */}
      {pendingMindmapTemplateContext !== null && (
        <BaseModal
          isOpen
          onClose={handleCancelMindmapTemplatePicker}
          size="2xl"
          zIndex={60}
          animation="zoom"
        >
          <ModalHeader onClose={handleCancelMindmapTemplatePicker} closeAriaLabel="Close template picker">
            <div className="min-w-0">
              <ModalTitle>Choose a template</ModalTitle>
              <p className="mt-1 text-sm text-muted">Pick a starting structure for your mind map.</p>
            </div>
          </ModalHeader>
          <ModalBody>
            <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
          </ModalBody>
          <ModalFooter>
            <div className="flex justify-start">
              <Button variant="secondary" icon={ChevronLeft} onClick={handleCancelMindmapTemplatePicker}>
                Back
              </Button>
            </div>
          </ModalFooter>
        </BaseModal>
      )}

      {/* Create Folder Modal (in-app) */}
      <BaseModal
        isOpen={showCreateFolderModal}
        onClose={cancelCreateFolder}
        size="md"
        zIndex={60}
        animation="zoom"
      >
        <ModalHeader onClose={cancelCreateFolder}>
          <ModalTitle>New Folder</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p className="mb-3 text-sm text-muted">Enter a name for the new folder.</p>
          <Input
            ref={createFolderInputRef}
            label="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmCreateFolder()
            }}
          />
        </ModalBody>
        <ModalFooter>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={cancelCreateFolder}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmCreateFolder}>
              Create
            </Button>
          </div>
        </ModalFooter>
      </BaseModal>

      {/* New Project Modal (name + color) */}
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onCreate={handleConfirmCreateProject}
      />

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
        <WorkspaceSkeleton />
      }>
        <WorkspaceContent />
      </Suspense>
    </ErrorBoundary>
  )
}