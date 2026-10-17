'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import dynamic from 'next/dynamic'
import NoteEditor, { Note } from '@/components/NoteEditor'
import WelcomeBackModal from '@/components/WelcomeBackModal'
import FileExplorerModal from '@/components/FileExplorerModal'
import ProjectDashboard from '@/components/ProjectDashboard'
import ArchivedProjectsModal from '@/components/ArchivedProjectsModal'
import NewProjectModal from '@/components/NewProjectModal'
import { FileEdit, Sparkles, FileText, PenTool, Network, BookOpen, Table2, FilePenLine, Menu, ChevronLeft, ChevronRight, FolderOpen, Home, FileQuestion, Target, Lightbulb, Scale, LayoutGrid, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
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
import type { WorkspaceView } from '@/lib/workspace/types'
import { subscribeToConflicts } from '@/lib/offline/events'
import { installOfflineSync } from '@/lib/offline/sync'

type NoteCreationContext = {
  folderArg?: string | null
  projectArg?: string | null
}
import { useToast } from '@/components/ToastProvider'
import { getNote, searchNotes } from '@/lib/notes'
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
          ' was changed on another device. Your local version is kept — review it in the sync status.',
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
  const [showSettings, setShowSettings] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // ⌘/Ctrl+K opens the palette — except inside the rich text editor, where the
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
    applyFolderSelection(note.folder_id ?? null, {
      projectId: note.project_id ?? null,
      preserveDraftState: true,
    })
  }, [applyFolderSelection])

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

  // ---- Refs for URL→state sync (break circular dependency) ----
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

  // Show Welcome Back modal once when data is loaded (opt-out via settings)
  useEffect(() => {
    if (user && !isLoadingFolders && !isLoadingNotes && !isLoadingProjects && !hasShownWelcomeBackRef.current) {
      hasShownWelcomeBackRef.current = true
      if (readWelcomeOnStartupPreference()) {
        setShowWelcomeBack(true)
        setActiveView('welcome')
      }
    }
  }, [user, isLoadingFolders, isLoadingNotes, isLoadingProjects])

  const closeWelcomeView = useCallback(() => {
    setShowWelcomeBack(false)
    setActiveView('notes')
  }, [])

  const openWelcomeView = useCallback(() => {
    setShowWelcomeBack(true)
    setActiveView('welcome')
  }, [])

  /** Full-text note search for the command palette (stable identity). */
  const searchNoteContent = useCallback(
    (query: string) => searchNotes(query, { limit: 20 }),
    []
  )

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

  const handleSelectNote = async (note: NoteSummary) => {
    if ('content' in note && typeof (note as Note).content === 'string') {
      activateExistingNote(note as Note)
      return
    }

    try {
      const fullNote = await getNote(note.id)
      if (fullNote) {
        activateExistingNote(fullNote)
      } else {
        toast.push({ title: 'Note not found', description: 'This note could not be loaded.' })
      }
    } catch (error) {
      console.error('Failed to open note:', error)
      toast.push({ title: 'Open failed', description: 'Could not load the note. Check your connection.' })
    }
  }

  const handleSelectFolder = (folderId: string | null) => {
    applyFolderSelection(folderId)
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

  const sidebarOffset = sidebarCollapsed ? '64px' : '300px'

  // Set CSS variable for fixed-position elements (e.g. bottom bar in NoteEditor)
  useEffect(() => {
    if (typeof document === 'undefined' || isMobile) return
    document.documentElement.style.setProperty('--workspace-sidebar-offset', sidebarOffset)
    return () => { document.documentElement.style.removeProperty('--workspace-sidebar-offset') }
  }, [sidebarOffset, isMobile])

  if (loading) {
    return (
      <WorkspaceSkeleton />
    )
  }

  if (!user) {
    return null
  }

  if (isLoadingFolders) {
    return (
      <WorkspaceSkeleton />
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
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={FileEdit}
          title="Welcome to MindViz Notes"
          description="Capture ideas, build mind maps, and organize your thoughts"
          action={
            <div className="w-full space-y-3">
              <Button
                type="button"
                size="lg"
                variant="primary"
                icon={Sparkles}
                onClick={() => handleNewNote()}
                className="w-full"
              >
                Start Writing
              </Button>
              <p className="text-sm text-muted/70">
                Press {formatModShortcut('K')} to search notes, or open the menu to browse your workspace.
              </p>
            </div>
          }
        />
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
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted/80 transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="Search notes and commands"
            title={`Search (${formatModShortcut('K')})`}
          >
            <Search size={17} />
          </button>
        </header>
      )}

      <WorkspaceSidebar
        isMobile={isMobile}
        activeView={activeView}
        sidebarCollapsed={sidebarCollapsed}
        mobileOpen={workspaceNavOpen}
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
        onToggleCollapsed={() => setSidebarCollapsed(prev => !prev)}
        onCloseMobileNav={() => setWorkspaceNavOpen(false)}
        onEnsureNotesView={() => {
          if (activeView !== 'notes') setActiveView('notes')
          setWorkspaceNavOpen(false)
        }}
        onOpenProjectDashboard={(projectId) => {
          setSelectedProjectId(projectId)
          setActiveView('projects')
          setWorkspaceNavOpen(false)
        }}
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
        onSignOut={handleSignOut}
        onMobileTouchStart={beginCloseSwipe}
        onMobileTouchEnd={endCloseSwipe}
      />

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
              void handleSelectNote(note)
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
                void handleSelectNote(note)
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

      <OfflineStatusIndicator />

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
          onOpenProject={(projectId) => {
            setSelectedProjectId(projectId)
            setActiveView('projects')
          }}
          onCreateNote={(type) => handleNewNote(type)}
          onOpenHome={openWelcomeView}
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
