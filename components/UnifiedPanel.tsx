'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Menu,
  X,
  Save,
  Trash2,
  Search,
  ListTree,
  FolderTree as FolderTreeIcon,
  FileText,
  ChevronRight,
  PenTool,
  Network,
  LogOut,
  User,
  Loader2,
  Edit2,
  FolderPlus,
  Copy,
  MoreVertical,
  CheckSquare,
  Calendar,
  Circle,
  CheckCircle2,
  Clock,
  Star,
  Plus,
} from 'lucide-react'
import { Note } from './NoteEditor'
import { FolderNode } from '@/lib/folders'
import { getNotesByFolder } from '@/lib/notes'
import { getTasks, createTask, completeTask, uncompleteTask, toggleTaskStar, getTaskStats, type Task, type TaskStats } from '@/lib/tasks'

interface UnifiedPanelProps {
  // Note controls
  note?: Note | null
  title: string
  onTitleChange: (title: string) => void
  onSave: () => void
  onDelete?: (id: string) => Promise<void>
  onCancel: () => void
  isSaving: boolean
  isDeleting: boolean
  hasChanges: boolean

  // TOC
  headings: Array<{ id: string; level: number; text: string }>
  showTOC: boolean
  onToggleTOC: () => void
  onScrollToHeading: (headingId: string) => void

  // Search
  onSearch: () => void

  // Knowledge Graph
  onOpenKnowledgeGraph?: () => void

  // Folders
  folders: FolderNode[]
  selectedFolderId: string | null
  onSelectFolder: (folderId: string | null) => void
  onCreateFolder: (parentId: string | null) => void
  onRenameFolder: (folderId: string, newName: string) => void
  onDeleteFolder: (folderId: string) => void

  // Notes
  notes: Note[]
  selectedNoteId?: string
  onSelectNote: (note: Note) => void
  onNewNote: (noteType?: 'rich-text' | 'drawing' | 'mindmap', folderId?: string | null) => void
  onDuplicateNote?: (note: Note) => void
  onMoveNote?: (noteId: string, newFolderId: string | null) => Promise<void>
  isLoadingNotes: boolean
  currentFolderName?: string
  
  // Folder operations
  onMoveFolder?: (folderId: string, newParentId: string | null) => void

  // Stats
  stats: { characters: number; words: number }
  
  // User info
  userEmail?: string
  onSignOut?: () => void

  // Control signals
  autoOpenKey?: string | number
  
  // Tasks & Calendar
  onOpenTaskCalendar?: () => void
}

export default function UnifiedPanel({
  note,
  title,
  onTitleChange,
  onSave,
  onDelete,
  onCancel,
  isSaving,
  isDeleting,
  hasChanges,
  headings,
  showTOC,
  onToggleTOC,
  onScrollToHeading,
  onSearch,
  onOpenKnowledgeGraph,
  folders,
  selectedFolderId,
  onSelectFolder: _onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  notes,
  selectedNoteId,
  onSelectNote,
  onNewNote,
  onDuplicateNote,
  onMoveNote,
  isLoadingNotes,
  currentFolderName,
  onMoveFolder,
  stats,
  userEmail,
  onSignOut,
  autoOpenKey,
  onOpenTaskCalendar,
}: UnifiedPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'browse' | 'toc' | 'tasks'>('browse')
  
  // Task state
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null)
  const [isLoadingTasks, setIsLoadingTasks] = useState(false)
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [taskFilter, setTaskFilter] = useState<'all' | 'starred' | 'today' | 'overdue'>('all')
  const ALL_FOLDER_KEY = '__ALL__'
  const folderKey = useCallback((folderId: string | null) => folderId ?? ALL_FOLDER_KEY, [])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set([ALL_FOLDER_KEY])
  )
  const [folderNotesData, setFolderNotesData] = useState<
    Record<string, { notes: Note[]; isLoading: boolean; error?: string }>
  >({})
  const panelRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<{ 
    x: number; 
    y: number; 
    type: 'folder' | 'note'; 
    id: string;
    name: string;
  } | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState<{
    type: 'folder' | 'note';
    id: string;
    name: string;
  } | null>(null)
  const [showRenameModal, setShowRenameModal] = useState<{
    folderId: string;
    currentName: string;
  } | null>(null)
  const [renameFolderInput, setRenameFolderInput] = useState('')
  const renameFolderInputRef = useRef<HTMLInputElement | null>(null)
  const [hoverFolderId, setHoverFolderId] = useState<string | null>(null)
  const lastAutoOpenKey = useRef<string | number | undefined>(undefined)

  const loadTasks = useCallback(async () => {
    setIsLoadingTasks(true)
    try {
      const [tasksData, statsData] = await Promise.all([
        getTasks({ 
          noteId: note?.id,
          projectId: note?.project_id || undefined,
          includeCompleted: false,
        }),
        getTaskStats(),
      ])
      setTasks(tasksData)
      setTaskStats(statsData)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setIsLoadingTasks(false)
    }
  }, [note?.id, note?.project_id])

  // Load tasks when panel opens or tab changes
  useEffect(() => {
    if (isOpen && activeTab === 'tasks') {
      loadTasks()
    }
  }, [isOpen, activeTab, loadTasks])

  const handleQuickAddTask = useCallback(async () => {
    if (!quickTaskTitle.trim()) return

    try {
      await createTask(quickTaskTitle, {
        noteId: note?.id,
        projectId: note?.project_id || undefined,
      })
      setQuickTaskTitle('')
      await loadTasks()
    } catch (error) {
      console.error('Failed to create task:', error)
    }
  }, [quickTaskTitle, note?.id, note?.project_id, loadTasks])

  const handleToggleTaskComplete = useCallback(async (taskId: string, isCompleted: boolean) => {
    try {
      if (isCompleted) {
        await uncompleteTask(taskId)
      } else {
        await completeTask(taskId)
      }
      await loadTasks()
    } catch (error) {
      console.error('Failed to toggle task:', error)
    }
  }, [loadTasks])

  const handleToggleTaskStar = useCallback(async (taskId: string, isStarred: boolean) => {
    try {
      await toggleTaskStar(taskId, !isStarred)
      await loadTasks()
    } catch (error) {
      console.error('Failed to toggle star:', error)
    }
  }, [loadTasks])

  // Filter tasks based on selected filter
  const filteredTasks = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    return tasks.filter(task => {
      switch (taskFilter) {
        case 'starred':
          return task.is_starred
        case 'today':
          if (!task.due_date) return false
          const dueDate = new Date(task.due_date)
          const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
          return dueDateOnly.getTime() === today.getTime()
        case 'overdue':
          if (!task.due_date || task.status === 'completed') return false
          return new Date(task.due_date) < now
        case 'all':
        default:
          return true
      }
    })
  }, [tasks, taskFilter])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle panel (Cmd/Ctrl + \)
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = () => {
      setContextMenu(null)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenu])

  useEffect(() => {
    setFolderNotesData((prev) => ({
      ...prev,
      [folderKey(selectedFolderId ?? null)]: {
        notes,
        isLoading: isLoadingNotes,
        error: undefined,
      },
    }))
  }, [notes, selectedFolderId, isLoadingNotes, folderKey])

  const loadFolderNotes = useCallback(
    async (targetFolderId: string | null) => {
      const key = folderKey(targetFolderId)
      const existing = folderNotesData[key]
      if (existing?.isLoading) return

      setFolderNotesData((prev) => ({
        ...prev,
        [key]: {
          notes: existing?.notes ?? [],
          isLoading: true,
          error: undefined,
        },
      }))

      try {
        const fetched =
          targetFolderId === selectedFolderId ? notes : await getNotesByFolder(targetFolderId)

        setFolderNotesData((prev) => ({
          ...prev,
          [key]: {
            notes: fetched,
            isLoading: false,
            error: undefined,
          },
        }))
      } catch (error) {
        console.error('Failed to load folder notes', error)
        setFolderNotesData((prev) => ({
          ...prev,
          [key]: {
            notes: existing?.notes ?? [],
            isLoading: false,
            error: error instanceof Error ? error.message : 'Unable to load notes',
          },
        }))
      }
    },
    [folderNotesData, notes, selectedFolderId, folderKey]
  )

  const handleFolderToggle = useCallback((targetFolderId: string | null) => {
    const key = folderKey(targetFolderId)
    const isExpanded = expandedFolders.has(key)
    setExpandedFolders((prev) => {
      const updated = new Set(prev)
      if (isExpanded) {
        updated.delete(key)
      } else {
        updated.add(key)
      }
      return updated
    })

    if (!isExpanded) {
      loadFolderNotes(targetFolderId)
    }
  }, [folderKey, expandedFolders, loadFolderNotes])

  const getFolderPathKeys = useCallback(
    (targetId: string): string[] | null => {
      const traverse = (nodes: FolderNode[]): string[] | null => {
        for (const node of nodes) {
          if (node.id === targetId) {
            return [folderKey(node.id)]
          }
          const childPath = traverse(node.children)
          if (childPath) {
            return [folderKey(node.id), ...childPath]
          }
        }
        return null
      }

      return traverse(folders)
    },
    [folders, folderKey]
  )

  const getFolderPathNames = useCallback(
    (targetId: string | null): string[] => {
      if (targetId === null) return ['All Notes']

      const traverse = (nodes: FolderNode[], ancestors: string[]): string[] | null => {
        for (const node of nodes) {
          const nextAncestors = [...ancestors, node.name]
          if (node.id === targetId) {
            return nextAncestors
          }
          const childPath = traverse(node.children, nextAncestors)
          if (childPath) {
            return childPath
          }
        }
        return null
      }

      return traverse(folders, []) ?? []
    },
    [folders]
  )

  const expandToFolder = useCallback(
    (targetFolderId: string | null) => {
      if (targetFolderId === null) {
        setExpandedFolders((prev) => {
          const updated = new Set(prev)
          updated.add(ALL_FOLDER_KEY)
          return updated
        })
        loadFolderNotes(null)
        return
      }

      const path = getFolderPathKeys(targetFolderId)
      if (path) {
        setExpandedFolders((prev) => {
          const updated = new Set(prev)
          path.forEach((id) => updated.add(id))
          return updated
        })
      }

      loadFolderNotes(targetFolderId)
    },
    [getFolderPathKeys, loadFolderNotes]
  )

  useEffect(() => {
    if ((expandedFolders.has(ALL_FOLDER_KEY)) && !folderNotesData[ALL_FOLDER_KEY]) {
      loadFolderNotes(null)
    }
  }, [expandedFolders, folderNotesData, loadFolderNotes])

  useEffect(() => {
    if (!selectedFolderId) return
    const path = getFolderPathKeys(selectedFolderId)
    if (path) {
      setExpandedFolders((prev) => {
        const updated = new Set(prev)
        path.forEach((id) => updated.add(id))
        return updated
      })
    }
  }, [getFolderPathKeys, selectedFolderId])

  // Context menu handlers with smart positioning
  const handleFolderContextMenu = useCallback((e: React.MouseEvent, folderId: string, folderName: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Calculate position to keep menu in viewport
    const menuWidth = 200
    const menuHeight = 250 // Approximate max height
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10)
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10)
    
    setContextMenu({
      x,
      y,
      type: 'folder',
      id: folderId,
      name: folderName,
    })
  }, [])

  const handleNoteContextMenu = useCallback((e: React.MouseEvent, note: Note) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Calculate position to keep menu in viewport
    const menuWidth = 200
    const menuHeight = 180 // Approximate max height
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10)
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10)
    
    setContextMenu({
      x,
      y,
      type: 'note',
      id: note.id,
      name: note.title || 'Untitled',
    })
  }, [])

  // Drag and drop handlers for moving notes
  const handleNoteDragStart = useCallback((e: React.DragEvent, noteId: string) => {
    e.dataTransfer.setData('text/plain', noteId)
    e.dataTransfer.effectAllowed = 'move'
    // Add visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])
  
  const handleNoteDragEnd = useCallback((e: React.DragEvent) => {
    // Reset visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
    setHoverFolderId(null)
  }, [])

  const handleFolderDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleFolderDragEnter = useCallback((e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault()
    // Only set hover if we're entering the target element itself
    if (e.currentTarget === e.target) {
      setHoverFolderId(targetFolderId === null ? ALL_FOLDER_KEY : folderKey(targetFolderId))
    }
  }, [folderKey, ALL_FOLDER_KEY])

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    // Only clear hover if we're actually leaving the element
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setHoverFolderId(null)
    }
  }, [])

  const handleFolderDrop = useCallback(async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault()
    setHoverFolderId(null)
    
    const noteId = e.dataTransfer.getData('text/plain')
    if (!noteId) return
    
    // Avoid moving into same folder if we can determine it
    const note = notes.find(n => n.id === noteId)
    const currentFolder = note?.folder_id ?? null
    
    if (currentFolder === targetFolderId) {
      // Note is already in this folder
      return
    }
    
    if (onMoveNote) {
      try {
        await onMoveNote(noteId, targetFolderId)
      } catch (error) {
        console.error('Failed to move note:', error)
        // Error handling is done in the parent component
      }
    }
    setContextMenu(null)
  }, [notes, onMoveNote])

  const renderFolder = useCallback((folder: FolderNode, level: number = 0) => {
    const key = folderKey(folder.id)
    const isExpanded = expandedFolders.has(key)
    const isSelected = selectedFolderId === folder.id
    const hasChildren = folder.children.length > 0
    const folderEntry = folderNotesData[key]
    const folderNotes = folderEntry?.notes ?? []
    const visibleNotes = folderNotes
    const noteCount = visibleNotes.length
    const isLoadingFolder = folderEntry?.isLoading ?? (isExpanded && !folderEntry)
    const folderError = folderEntry?.error

    return (
      <div key={folder.id}>
        <div className="space-y-0.5">
          {/* Folder Header */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleFolderToggle(folder.id)}
            onContextMenu={(e) => handleFolderContextMenu(e, folder.id, folder.name)}
            onDragOver={handleFolderDragOver}
            onDragEnter={(e) => handleFolderDragEnter(e, folder.id)}
            onDragLeave={handleFolderDragLeave}
            onDrop={(e) => { handleFolderDrop(e, folder.id); setHoverFolderId(null) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleFolderToggle(folder.id)
              }
            }}
            className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${
              isSelected ? 'bg-blue-50 text-blue-700 font-medium shadow-sm' : 'hover:bg-gray-50 text-gray-700'
            } ${hoverFolderId === folderKey(folder.id) ? 'ring-2 ring-blue-400 bg-blue-50 shadow-sm' : ''}`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            aria-expanded={isExpanded}
            aria-label={`Folder: ${folder.name}, ${noteCount} notes`}
          >
            <ChevronRight
              size={14}
              className={`flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} ${hasChildren ? 'text-gray-600' : 'text-gray-300'}`}
              aria-hidden="true"
            />
            <FolderTreeIcon size={14} className={`flex-shrink-0 ${isExpanded ? 'text-blue-500' : 'text-gray-500'}`} aria-hidden="true" />
            <span className="text-sm truncate flex-1">{folder.name}</span>
            {isLoadingFolder && <span className="text-xs text-gray-400">Loading...</span>}
            {noteCount > 0 && !isLoadingFolder && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                {noteCount}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleFolderContextMenu(e, folder.id, folder.name)
              }}
              className="hidden group-hover:flex p-1 hover:bg-gray-200 rounded transition-colors"
              title="Folder options"
              aria-label={`Options for ${folder.name}`}
            >
              <MoreVertical size={14} />
            </button>
          </div>

          {/* Notes in this folder (shown when folder is selected and expanded) */}
          {isExpanded && (
            <div className="ml-4 space-y-0.5 border-l-2 border-gray-200 pl-3 mt-1">
              {isLoadingFolder ? (
                <div className="text-xs text-gray-500 py-1.5 px-2 flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" />
                  Loading notes...
                </div>
              ) : folderError ? (
                <div className="text-xs text-red-500 py-1.5 px-2" role="alert">
                  {folderError}
                </div>
              ) : visibleNotes.length === 0 ? (
                <div className="text-xs text-gray-400 italic py-1.5 px-2 bg-gray-50 rounded border border-dashed border-gray-300">
                  Empty folder
                </div>
              ) : (
                visibleNotes.map((n) => (
                  <button
                    key={n.id}
                    draggable
                    onDragStart={(e) => handleNoteDragStart(e, n.id)}
                    onDragEnd={handleNoteDragEnd}
                    onClick={() => {
                      onSelectNote(n)
                      setIsOpen(false)
                    }}
                    onContextMenu={(e) => handleNoteContextMenu(e, n)}
                    className={`group w-full text-left px-2 py-1.5 rounded-md transition-all duration-150 flex items-start justify-between ${
                      selectedNoteId === n.id
                        ? 'bg-blue-100 text-blue-700 font-medium shadow-sm'
                        : 'hover:bg-gray-50 text-gray-700 hover:shadow-sm'
                    }`}
                    aria-label={`Note: ${n.title || 'Untitled'}`}
                    aria-current={selectedNoteId === n.id ? 'page' : undefined}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {n.note_type === 'drawing' ? (
                          <PenTool size={12} className="text-purple-500 flex-shrink-0" aria-hidden="true" />
                        ) : n.note_type === 'mindmap' ? (
                          <Network size={12} className="text-green-500 flex-shrink-0" aria-hidden="true" />
                        ) : (
                          <FileText size={12} className="text-blue-500 flex-shrink-0" aria-hidden="true" />
                        )}
                        <div className="text-sm truncate">{n.title || 'Untitled'}</div>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 ml-5">
                        {new Date(n.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleNoteContextMenu(e, n)
                      }}
                      className="hidden group-hover:flex p-0.5 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                      title="Note options"
                      aria-label={`Options for ${n.title || 'Untitled'}`}
                    >
                      <MoreVertical size={12} />
                    </button>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Child folders (shown when expanded) */}
          {isExpanded && hasChildren && (
            <div className="space-y-0.5">
              {folder.children.map((child) => renderFolder(child, level + 1))}
            </div>
          )}
        </div>
      </div>
    )
  }, [expandedFolders, selectedFolderId, folderNotesData, hoverFolderId, selectedNoteId, handleFolderToggle, handleFolderContextMenu, handleFolderDragOver, handleFolderDragEnter, handleFolderDragLeave, handleFolderDrop, handleNoteDragStart, handleNoteDragEnd, onSelectNote, handleNoteContextMenu, folderKey])

  const allNotesEntry = folderNotesData[ALL_FOLDER_KEY]
  const isAllExpanded = expandedFolders.has(ALL_FOLDER_KEY)
  const shouldShowAllNotes = isAllExpanded
  const isAllLoading = allNotesEntry?.isLoading ?? (shouldShowAllNotes && !allNotesEntry)
  const allNotes = allNotesEntry?.notes ?? []
  const displayedAllNotes = allNotes
  const allError = allNotesEntry?.error

  const handleRenameFromContext = () => {
    if (!contextMenu) return
    if (contextMenu.type === 'folder') {
      setShowRenameModal({
        folderId: contextMenu.id,
        currentName: contextMenu.name,
      })
      setRenameFolderInput(contextMenu.name)
      // Focus the input on next tick when modal is rendered
      setTimeout(() => renameFolderInputRef.current?.focus(), 50)
    }
    setContextMenu(null)
  }

  const handleConfirmRename = () => {
    if (!showRenameModal) return
    const newName = renameFolderInput.trim()
    if (newName) {
      onRenameFolder(showRenameModal.folderId, newName)
    }
    setShowRenameModal(null)
    setRenameFolderInput('')
  }

  const handleCancelRename = () => {
    setShowRenameModal(null)
    setRenameFolderInput('')
  }

  const handleDeleteFromContext = () => {
    if (!contextMenu) return
    setShowDeleteModal({
      type: contextMenu.type,
      id: contextMenu.id,
      name: contextMenu.name,
    })
    setContextMenu(null)
  }

  const handleConfirmDelete = async () => {
    if (!showDeleteModal) return
    if (showDeleteModal.type === 'folder') {
      onDeleteFolder(showDeleteModal.id)
    } else {
      // Delete note - onDelete handler should work for any note ID
      if (onDelete) {
        await onDelete(showDeleteModal.id)
      }
    }
    setShowDeleteModal(null)
    setIsOpen(false)
  }

  const handleDuplicateNote = (note: Note) => {
    if (onDuplicateNote) {
      onDuplicateNote(note)
    }
    setContextMenu(null)
    setIsOpen(false)
  }

  const handleMoveNoteToFolder = async (noteId: string, targetFolderId: string | null) => {
    if (onMoveNote) {
      try {
        await onMoveNote(noteId, targetFolderId)
        setContextMenu(null)
        setIsOpen(false)
      } catch (error) {
        console.error('Failed to move note:', error)
        // Keep context menu open on error so user can retry
      }
    }
  }

  const handleMoveFolderToParent = (folderId: string, newParentId: string | null) => {
    if (onMoveFolder) {
      onMoveFolder(folderId, newParentId)
    }
    setContextMenu(null)
  }

  useEffect(() => {
    if (autoOpenKey === undefined) return
    if (lastAutoOpenKey.current === autoOpenKey) return
    lastAutoOpenKey.current = autoOpenKey
    setIsOpen(true)
  }, [autoOpenKey])

  return (
    <>
      {/* Floating Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-28 right-6 z-50 p-3 bg-white border-2 border-gray-200 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
        aria-label={isOpen ? 'Close menu' : 'Open menu (⌘\\)'}
        title={isOpen ? 'Close menu' : 'Open menu (⌘\\)'}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Unified Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed top-40 right-6 z-40 w-80 max-h-[calc(100vh-14rem)] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        >
          {/* User Info & Sign Out */}
          {userEmail && onSignOut && (
            <div className="p-2.5 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-gray-700 truncate flex-1 min-w-0">
                  <User size={13} className="text-gray-500 flex-shrink-0" />
                  <span className="truncate">{userEmail}</span>
                </div>
                <button
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                  title="Sign Out"
                >
                  <LogOut size={13} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}

          {/* Title & Actions */}
          <div className="p-3 border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white">
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Note title..."
              className="w-full px-2.5 py-1.5 text-base font-semibold border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
              disabled={isSaving || isDeleting}
            />
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={onSave}
                disabled={isSaving || isDeleting || !hasChanges}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                title="Save note (⌘S)"
              >
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {isSaving ? 'Saving...' : 'Save'}
                {!isSaving && hasChanges && (
                  <kbd className="hidden group-hover:inline-block ml-1 px-1 py-0.5 bg-blue-700 rounded text-xs">⌘S</kbd>
                )}
              </button>
              
              {note && onDelete && (
                <button
                  onClick={() => onDelete(note.id)}
                  disabled={isDeleting}
                  className="px-2.5 py-1.5 border border-red-200 text-red-600 text-sm font-medium rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors"
                  title="Delete note"
                >
                  <Trash2 size={14} />
                </button>
              )}
              
              <button
                onClick={onCancel}
                disabled={isSaving || isDeleting}
                className="px-2.5 py-1.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>

            {hasChanges && (
              <div className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                Unsaved changes
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 bg-gray-50">
            <button
              onClick={() => setActiveTab('browse')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'browse'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <FileText size={15} />
              Browse
            </button>
            <button
              onClick={() => setActiveTab('toc')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'toc'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
              disabled={headings.length === 0}
            >
              <ListTree size={15} />
              Contents
              {headings.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-full font-semibold">
                  {headings.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'tasks'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <CheckSquare size={15} />
              Tasks
              {taskStats && taskStats.todo > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-600 rounded-full font-semibold">
                  {taskStats.todo}
                </span>
              )}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {activeTab === 'browse' && (
              <div className="space-y-3">
                {/* Knowledge Graph */}
                {onOpenKnowledgeGraph && (
                  <div>
                    <button
                      onClick={() => {
                        onOpenKnowledgeGraph()
                        setIsOpen(false)
                      }}
                      className="w-full px-3 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium rounded-md hover:from-indigo-600 hover:to-purple-700 transition-all shadow-sm hover:shadow flex items-center justify-center gap-2"
                      title="Open Knowledge Graph - Visualize note connections"
                    >
                      <Network size={16} />
                      <span>Knowledge Graph</span>
                    </button>
                  </div>
                )}

                {/* Quick info about current note */}
                {note && (
                  <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-lg p-3 border border-gray-200">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Current Note
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        {note.note_type === 'drawing' ? (
                          <PenTool size={14} className="text-purple-500" />
                        ) : note.note_type === 'mindmap' ? (
                          <Network size={14} className="text-green-500" />
                        ) : (
                          <FileText size={14} className="text-blue-500" />
                        )}
                        <span className="font-medium">
                          {note.note_type === 'drawing' ? 'Drawing' : note.note_type === 'mindmap' ? 'Mind Map' : 'Text Note'}
                        </span>
                      </div>
                      {currentFolderName && (
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <FolderTreeIcon size={12} className="text-amber-500" />
                          <span>{currentFolderName}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-gray-200">
                        <div className="text-xs text-gray-500 space-y-1">
                          <div className="flex justify-between">
                            <span>Last edited:</span>
                            <span className="font-medium">{new Date(note.updated_at).toLocaleDateString()}</span>
                          </div>
                          {stats.words > 0 && (
                            <div className="flex justify-between">
                              <span>Word count:</span>
                              <span className="font-medium">{stats.words.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="space-y-3">
                {/* Tasks & Calendar Button */}
                {onOpenTaskCalendar && (
                  <button
                    onClick={() => {
                      onOpenTaskCalendar()
                      setIsOpen(false)
                    }}
                    className="w-full px-3 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-medium rounded-md hover:from-blue-600 hover:to-purple-700 transition-all shadow-sm hover:shadow flex items-center justify-center gap-2"
                    title="Open Tasks & Calendar"
                  >
                    <Calendar size={16} />
                    <span>Open Tasks & Calendar</span>
                  </button>
                )}

                {/* Quick Add Task */}
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Quick Add
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={quickTaskTitle}
                      onChange={(e) => setQuickTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleQuickAddTask()
                        }
                      }}
                      placeholder="New task..."
                      className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleQuickAddTask}
                      disabled={!quickTaskTitle.trim()}
                      className="px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Add task"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* Task Stats */}
                {taskStats && (
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-3 border border-blue-200">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-lg font-bold text-blue-600">{taskStats.todo}</div>
                        <div className="text-xs text-gray-600">To Do</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-purple-600">{taskStats.in_progress}</div>
                        <div className="text-xs text-gray-600">In Progress</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-green-600">{taskStats.completed}</div>
                        <div className="text-xs text-gray-600">Done</div>
                      </div>
                    </div>
                    {taskStats.overdue > 0 && (
                      <div className="mt-2 pt-2 border-t border-blue-200">
                        <div className="text-center">
                          <div className="text-lg font-bold text-red-600">{taskStats.overdue}</div>
                          <div className="text-xs text-gray-600">Overdue Tasks</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Task List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {note ? 'Tasks for this note' : 'Recent Tasks'}
                    </div>
                  </div>

                  {/* Task Filter Buttons */}
                  <div className="flex gap-1 mb-3 flex-wrap">
                    <button
                      onClick={() => setTaskFilter('all')}
                      className={`px-2 py-1 text-xs rounded-md transition-colors ${
                        taskFilter === 'all'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setTaskFilter('starred')}
                      className={`px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1 ${
                        taskFilter === 'starred'
                          ? 'bg-yellow-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Star size={10} fill={taskFilter === 'starred' ? 'currentColor' : 'none'} />
                      Starred
                    </button>
                    <button
                      onClick={() => setTaskFilter('today')}
                      className={`px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1 ${
                        taskFilter === 'today'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Clock size={10} />
                      Today
                    </button>
                    <button
                      onClick={() => setTaskFilter('overdue')}
                      className={`px-2 py-1 text-xs rounded-md transition-colors ${
                        taskFilter === 'overdue'
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Overdue
                    </button>
                  </div>

                  {isLoadingTasks ? (
                    <div className="text-center py-6">
                      <Loader2 size={24} className="animate-spin mx-auto text-blue-600 mb-2" />
                      <p className="text-sm text-gray-500">Loading tasks...</p>
                    </div>
                  ) : filteredTasks.length === 0 ? (
                    <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      <CheckSquare size={32} className="mx-auto text-gray-300 mb-2" />
                      <p className="text-sm text-gray-500">
                        {taskFilter === 'all' ? 'No tasks yet' : 
                         taskFilter === 'starred' ? 'No starred tasks' :
                         taskFilter === 'today' ? 'No tasks due today' :
                         'No overdue tasks'}
                      </p>
                      {taskFilter === 'all' && (
                        <p className="text-xs text-gray-400 mt-1">Add one above to get started</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredTasks.slice(0, 10).map((task) => {
                        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'
                        
                        return (
                          <div
                            key={task.id}
                            className="bg-white border border-gray-200 rounded-lg p-2.5 hover:shadow-sm transition-shadow"
                          >
                            <div className="flex items-start gap-2">
                              <button
                                onClick={() => handleToggleTaskComplete(task.id, task.status === 'completed')}
                                className="mt-0.5 flex-shrink-0"
                              >
                                {task.status === 'completed' ? (
                                  <CheckCircle2 size={16} className="text-green-600" />
                                ) : (
                                  <Circle size={16} className="text-gray-400 hover:text-blue-600" />
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                    {task.title}
                                  </p>
                                  <button
                                    onClick={() => handleToggleTaskStar(task.id, task.is_starred)}
                                    className={`flex-shrink-0 ${task.is_starred ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
                                  >
                                    <Star size={14} fill={task.is_starred ? 'currentColor' : 'none'} />
                                  </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                  {task.priority !== 'medium' && (
                                    <span className={`px-1.5 py-0.5 rounded ${
                                      task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                                      task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {task.priority}
                                    </span>
                                  )}
                                  
                                  {task.due_date && (
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                                      isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      <Clock size={10} />
                                      {new Date(task.due_date).toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {filteredTasks.length > 10 && (
                        <button
                          onClick={() => {
                            if (onOpenTaskCalendar) {
                              onOpenTaskCalendar()
                              setIsOpen(false)
                            }
                          }}
                          className="w-full px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium"
                        >
                          View all {filteredTasks.length} {taskFilter !== 'all' ? taskFilter : ''} tasks →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'toc' && (
              <div>
                {headings.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <ListTree size={40} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">No headings in this note yet</p>
                    <p className="text-xs text-gray-400 mt-1.5">Use H1, H2, or H3 to create headings</p>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-gray-500 mb-2 px-1">
                      {headings.length} heading{headings.length !== 1 ? 's' : ''} found
                    </div>
                    <div className="space-y-0.5">
                      {headings.map((heading, index) => {
                        const levelLabel = heading.level === 1 ? 'H1' : heading.level === 2 ? 'H2' : 'H3'
                        return (
                          <button
                            key={heading.id || `${heading.level}-${index}`}
                            onClick={() => {
                              onScrollToHeading(heading.id)
                              setIsOpen(false)
                            }}
                            className="w-full text-left block px-2.5 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors group"
                            style={{ paddingLeft: `${(heading.level - 1) * 12 + 10}px` }}
                            title={`Jump to ${levelLabel}: ${heading.text}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 group-hover:text-blue-500 font-mono">{levelLabel}</span>
                              <span className="truncate block flex-1">{heading.text}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer with search & stats */}
          <div className="border-t border-gray-200 p-2.5 bg-gray-50">
            {note && (
              <>
                <button
                  onClick={() => {
                    onSearch()
                    setIsOpen(false)
                  }}
                  className="w-full mb-2 px-2.5 py-1.5 text-sm text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium"
                >
                  <Search size={14} />
                  Find & Replace
                  <kbd className="ml-auto px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs text-gray-600">⌘F</kbd>
                </button>
                <div className="flex justify-between items-center text-xs text-gray-500 px-1">
                  <div className="flex items-center gap-2.5">
                    <span title="Word count">{stats.words} words</span>
                    <span className="text-gray-300">•</span>
                    <span title="Character count">{stats.characters} chars</span>
                  </div>
                  <span className="text-gray-400" title="Last modified">
                    {new Date(note.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </>
            )}
            {!note && (
              <div className="text-center text-xs text-gray-400 py-0.5">
                Press <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-gray-600 font-mono">⌘\</kbd> to toggle menu
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-[60] bg-white rounded-lg shadow-2xl border border-gray-200 py-1 min-w-[200px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.type === 'folder' ? (
              <>
                <button
                  onClick={handleRenameFromContext}
                  className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
                >
                  <Edit2 size={16} />
                  <span className="font-medium">Rename Folder</span>
                </button>
                <button
                  onClick={() => {
                    onCreateFolder(contextMenu.id)
                    setContextMenu(null)
                  }}
                  className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
                >
                  <FolderPlus size={16} />
                  <span className="font-medium">New Subfolder</span>
                </button>
                <button
                  onClick={() => {
                    // create a new note inside this folder
                    onNewNote?.(undefined, contextMenu.id)
                    setContextMenu(null)
                    setIsOpen(false)
                  }}
                  className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
                >
                  <FileText size={16} />
                  <span className="font-medium">New Note in Folder</span>
                </button>
                {onMoveFolder && folders.length > 0 && (
                  <div className="border-t border-gray-200 my-1">
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">
                      Move to
                    </div>
                    <button
                      onClick={() => handleMoveFolderToParent(contextMenu.id, null)}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
                    >
                      <FolderTreeIcon size={16} />
                      <span>Root Level</span>
                    </button>
                    {folders.filter(f => f.id !== contextMenu.id).map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => handleMoveFolderToParent(contextMenu.id, folder.id)}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
                      >
                        <FolderTreeIcon size={16} />
                        <span className="truncate">{folder.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="border-t border-gray-200 my-1" />
                <button
                  onClick={handleDeleteFromContext}
                  className="w-full px-3 py-2 text-sm text-left hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors"
                >
                  <Trash2 size={16} />
                  <span className="font-medium">Delete Folder</span>
                </button>
              </>
            ) : (
              <>
                {onDuplicateNote && (
                  <button
                    onClick={() => {
                      const note = notes.find(n => n.id === contextMenu.id)
                      if (note) handleDuplicateNote(note)
                    }}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
                  >
                    <Copy size={16} />
                    <span className="font-medium">Duplicate Note</span>
                  </button>
                )}
                {onMoveNote && folders.length > 0 && (
                  <div className="border-t border-gray-200 my-1">
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">
                      Move to folder
                    </div>
                    <button
                      onClick={() => handleMoveNoteToFolder(contextMenu.id, null)}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
                    >
                      <FileText size={16} />
                      <span>All Notes (Root)</span>
                    </button>
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => handleMoveNoteToFolder(contextMenu.id, folder.id)}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
                      >
                        <FolderTreeIcon size={16} />
                        <span className="truncate">{folder.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="border-t border-gray-200 my-1" />
                <button
                  onClick={handleDeleteFromContext}
                  className="w-full px-3 py-2 text-sm text-left hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors"
                >
                  <Trash2 size={16} />
                  <span className="font-medium">Delete Note</span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={24} className="text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  Delete {showDeleteModal.type === 'folder' ? 'Folder' : 'Note'}?
                </h3>
                <p className="text-sm text-gray-600">
                  Are you sure you want to delete &quot;{showDeleteModal.name}&quot;?
                  {showDeleteModal.type === 'folder' && (
                    <span className="block mt-1 text-gray-500">
                      Notes inside will be moved to the root level.
                    </span>
                  )}
                  {' '}This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete {showDeleteModal.type === 'folder' ? 'Folder' : 'Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Folder Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Edit2 size={24} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  Rename Folder
                </h3>
                <p className="text-sm text-gray-600">
                  Enter a new name for &quot;{showRenameModal.currentName}&quot;
                </p>
              </div>
            </div>
            <input
              ref={renameFolderInputRef}
              type="text"
              value={renameFolderInput}
              onChange={(e) => setRenameFolderInput(e.target.value)}
              placeholder="Folder name"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename()
                if (e.key === 'Escape') handleCancelRename()
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleCancelRename}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRename}
                disabled={!renameFolderInput.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
