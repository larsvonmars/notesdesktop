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
  Sparkles,
  Settings,
  ChevronDown,
  Download,
  FileDown,
} from 'lucide-react'
import { Note } from './NoteEditor'
import { FolderNode } from '@/lib/folders'
import { getNotesByFolder } from '@/lib/notes'
import AIAssistant from './AIAssistant'
import type { MindmapData } from './MindmapEditor'
import { getEvents, type CalendarEvent } from '@/lib/events'
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
  
  // AI Assistant
  noteContent?: string
  mindmapData?: MindmapData | null
  selectedMindmapNodeId?: string | null
  selectedText?: string  // Selected text from editor for AI context
  onInsertText?: (text: string) => void
  onReplaceText?: (text: string) => void
  onReplaceSelection?: (text: string) => void  // Replace selected text specifically
  onInsertAtCursor?: (text: string) => void  // Insert at cursor position
  onCreateTaskFromAI?: (title: string, options?: { description?: string; priority?: string; dueDate?: Date }) => void
  onAddMindmapNode?: (text: string, description?: string) => void
  
  // All notes for AI tool calling
  allNotes?: Note[]
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
  noteContent,
  mindmapData,
  selectedMindmapNodeId,
  selectedText,
  onInsertText,
  onReplaceText,
  onReplaceSelection,
  onInsertAtCursor,
  onCreateTaskFromAI,
  onAddMindmapNode,
  allNotes: allNotesForAI,
}: UnifiedPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'browse' | 'toc' | 'tasks' | 'ai'>('browse')
  
  // Calendar events for AI
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  
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
  const [showExportMenu, setShowExportMenu] = useState(false)

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

  // Load calendar events for AI assistant
  const loadCalendarEvents = useCallback(async () => {
    try {
      const now = new Date()
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const events = await getEvents({ startDate: now, endDate: weekLater })
      setCalendarEvents(events)
    } catch (error) {
      console.error('Failed to load calendar events:', error)
    }
  }, [])

  // Load calendar events when AI tab is active
  useEffect(() => {
    if (isOpen && activeTab === 'ai') {
      loadTasks()
      loadCalendarEvents()
    }
  }, [isOpen, activeTab, loadTasks, loadCalendarEvents])

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
  const allFolderNotes = allNotesEntry?.notes ?? []
  const displayedAllNotes = allFolderNotes
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

  // Helper function to sanitize filename
  const sanitizeFilename = useCallback((filename: string): string => {
    return filename
      .replace(/[/\\?%*:|"<>]/g, '-') // Replace invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^[.-]/, '') // Remove leading dots or dashes
      .substring(0, 200) // Limit length
      .trim()
      || 'untitled' // Fallback if empty
  }, [])

  // Export functions
  const handleExportToPDF = useCallback(() => {
    if (!note) return
    
    // Create a temporary container for printing
    const printContainer = document.createElement('div')
    printContainer.style.position = 'absolute'
    printContainer.style.left = '-9999px'
    printContainer.style.top = '0'
    printContainer.style.width = '210mm' // A4 width
    printContainer.style.padding = '20mm'
    printContainer.style.fontFamily = 'system-ui, -apple-system, sans-serif'
    printContainer.style.fontSize = '12pt'
    printContainer.style.lineHeight = '1.6'
    printContainer.style.color = '#000'
    printContainer.style.backgroundColor = '#fff'
    
    // Add title
    const titleEl = document.createElement('h1')
    titleEl.textContent = note.title || 'Untitled'
    titleEl.style.marginBottom = '20px'
    titleEl.style.fontSize = '24pt'
    titleEl.style.fontWeight = 'bold'
    printContainer.appendChild(titleEl)
    
    // Add content
    if (note.note_type === 'rich-text' && noteContent) {
      const contentEl = document.createElement('div')
      contentEl.innerHTML = noteContent
      // Apply print-friendly styles
      contentEl.querySelectorAll('*').forEach((el) => {
        if (el instanceof HTMLElement) {
          el.style.color = '#000'
          el.style.backgroundColor = 'transparent'
        }
      })
      printContainer.appendChild(contentEl)
    } else if (note.note_type === 'drawing') {
      const infoEl = document.createElement('p')
      infoEl.textContent = '[Drawing content - not available in PDF export]'
      infoEl.style.fontStyle = 'italic'
      infoEl.style.color = '#666'
      printContainer.appendChild(infoEl)
    } else if (note.note_type === 'mindmap') {
      const infoEl = document.createElement('p')
      infoEl.textContent = '[Mindmap content - not available in PDF export]'
      infoEl.style.fontStyle = 'italic'
      infoEl.style.color = '#666'
      printContainer.appendChild(infoEl)
    }
    
    document.body.appendChild(printContainer)
    
    // Create a style element for print
    const printStyle = document.createElement('style')
    printStyle.textContent = `
      @media print {
        body * {
          visibility: hidden;
        }
        #print-content, #print-content * {
          visibility: visible;
        }
        #print-content {
          position: absolute;
          left: 0;
          top: 0;
        }
      }
    `
    printContainer.id = 'print-content'
    document.head.appendChild(printStyle)
    
    // Cleanup function
    const cleanup = () => {
      if (printContainer.parentNode) {
        document.body.removeChild(printContainer)
      }
      if (printStyle.parentNode) {
        document.head.removeChild(printStyle)
      }
    }
    
    // Listen for afterprint event for reliable cleanup
    const handleAfterPrint = () => {
      cleanup()
      window.removeEventListener('afterprint', handleAfterPrint)
    }
    
    window.addEventListener('afterprint', handleAfterPrint)
    
    // Trigger print dialog
    window.print()
    
    // Fallback cleanup in case afterprint doesn't fire (some browsers)
    setTimeout(() => {
      window.removeEventListener('afterprint', handleAfterPrint)
      cleanup()
    }, 1000)
    
    setShowExportMenu(false)
  }, [note, noteContent])

  const handleExportToMarkdown = useCallback(() => {
    if (!note) return
    
    let markdownContent = `# ${note.title || 'Untitled'}\n\n`
    
    if (note.note_type === 'rich-text' && noteContent) {
      // Convert HTML to Markdown (basic conversion)
      // Note: noteContent is already sanitized by DOMPurify in RichTextEditor
      // This conversion is for export only, not for DOM insertion
      let converted = noteContent
        // Remove HTML tags but preserve structure
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
        .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
        .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
        .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
        .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
        .replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1\n')
        .replace(/<ol[^>]*>(.*?)<\/ol>/gi, '$1\n')
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
        .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
        .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
        .replace(/<div[^>]*>(.*?)<\/div>/gi, '$1\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\n\n\n+/g, '\n\n')
        .trim()
      
      markdownContent += converted
    } else if (note.note_type === 'drawing') {
      markdownContent += '*[Drawing content - not available in Markdown export]*'
    } else if (note.note_type === 'mindmap') {
      markdownContent += '*[Mindmap content - not available in Markdown export]*'
    }
    
    // Create blob and download
    const blob = new Blob([markdownContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sanitizeFilename(note.title || 'untitled')}.md`
    a.click()
    URL.revokeObjectURL(url)
    
    setShowExportMenu(false)
  }, [note, noteContent, sanitizeFilename])

  const handleExportToHTML = useCallback(() => {
    if (!note) return
    
    let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${note.title || 'Untitled'}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      color: #333;
    }
    h1, h2, h3 { margin-top: 1.5em; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 20px; color: #666; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <h1>${note.title || 'Untitled'}</h1>
`
    
    if (note.note_type === 'rich-text' && noteContent) {
      htmlContent += noteContent
    } else if (note.note_type === 'drawing') {
      htmlContent += '<p><em>[Drawing content - not available in HTML export]</em></p>'
    } else if (note.note_type === 'mindmap') {
      htmlContent += '<p><em>[Mindmap content - not available in HTML export]</em></p>'
    }
    
    htmlContent += '\n</body>\n</html>'
    
    // Create blob and download
    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sanitizeFilename(note.title || 'untitled')}.html`
    a.click()
    URL.revokeObjectURL(url)
    
    setShowExportMenu(false)
  }, [note, noteContent, sanitizeFilename])

  const handleExportToPlainText = useCallback(() => {
    if (!note) return
    
    let textContent = `${note.title || 'Untitled'}\n${'='.repeat((note.title || 'Untitled').length)}\n\n`
    
    if (note.note_type === 'rich-text' && noteContent) {
      // Strip all HTML tags
      // Note: noteContent is already sanitized by DOMPurify in RichTextEditor
      // This conversion is for export only, not for DOM insertion
      const stripped = noteContent
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\n\n\n+/g, '\n\n')
        .trim()
      
      textContent += stripped
    } else if (note.note_type === 'drawing') {
      textContent += '[Drawing content - not available in plain text export]'
    } else if (note.note_type === 'mindmap') {
      textContent += '[Mindmap content - not available in plain text export]'
    }
    
    // Create blob and download
    const blob = new Blob([textContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sanitizeFilename(note.title || 'untitled')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    
    setShowExportMenu(false)
  }, [note, noteContent, sanitizeFilename])

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
        className="fixed top-28 right-6 z-50 p-3.5 bg-white border border-gray-200 rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 group"
        aria-label={isOpen ? 'Close menu' : 'Open menu (⌘\\)'}
        title={isOpen ? 'Close menu' : 'Open menu (⌘\\)'}
      >
        {isOpen ? <X size={22} className="text-gray-700" /> : <Menu size={22} className="text-gray-700 group-hover:text-blue-600 transition-colors" />}
      </button>

      {/* Unified Panel - Redesigned */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed top-20 right-6 z-40 w-[440px] max-h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        >
          {/* Header Section - User & Note Title */}
          <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50 border-b border-gray-100">
            {/* User Info Bar */}
            {userEmail && onSignOut && (
              <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                    {userEmail.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-700 font-medium truncate max-w-[200px]">{userEmail}</span>
                </div>
                <button
                  onClick={onSignOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  title="Sign Out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            )}

            {/* Note Title & Actions */}
            <div className="p-5">
              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                  Note Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="Untitled note..."
                  className="w-full px-4 py-3 text-lg font-semibold border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-all placeholder:text-gray-300"
                  disabled={isSaving || isDeleting}
                />
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onSave}
                  disabled={isSaving || isDeleting || !hasChanges}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
                  title="Save note (⌘S)"
                >
                  {isSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                
                {note && onDelete && (
                  <button
                    onClick={() => onDelete(note.id)}
                    disabled={isDeleting}
                    className="p-2.5 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-all"
                    title="Delete note"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                
                <button
                  onClick={onCancel}
                  disabled={isSaving || isDeleting}
                  className="p-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-all"
                  title="Cancel"
                >
                  <X size={16} />
                </button>
              </div>

              {hasChanges && (
                <div className="mt-3 flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium">Unsaved changes</span>
                </div>
              )}
            </div>
          </div>

          {/* Tabs - Modern Pill Style */}
          <div className="px-3 py-3 bg-gray-50/50 border-b border-gray-100">
            <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
              <button
                onClick={() => setActiveTab('browse')}
                className={`flex-1 px-2 py-2 text-xs font-medium transition-all rounded-lg flex items-center justify-center gap-1.5 min-w-0 ${
                  activeTab === 'browse'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <FileText size={14} className="flex-shrink-0" />
                <span className="truncate">Browse</span>
              </button>
              <button
                onClick={() => setActiveTab('toc')}
                className={`flex-1 px-2 py-2 text-xs font-medium transition-all rounded-lg flex items-center justify-center gap-1.5 min-w-0 ${
                  activeTab === 'toc'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
                disabled={headings.length === 0}
              >
                <ListTree size={14} className="flex-shrink-0" />
                <span className="truncate">Contents</span>
                {headings.length > 0 && (
                  <span className="px-1 py-0.5 text-[10px] bg-blue-100 text-blue-600 rounded-full font-semibold flex-shrink-0">
                    {headings.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('tasks')}
                className={`flex-1 px-2 py-2 text-xs font-medium transition-all rounded-lg flex items-center justify-center gap-1.5 min-w-0 ${
                  activeTab === 'tasks'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <CheckSquare size={14} className="flex-shrink-0" />
                <span className="truncate">Tasks</span>
                {taskStats && taskStats.todo > 0 && (
                  <span className="px-1 py-0.5 text-[10px] bg-orange-100 text-orange-600 rounded-full font-semibold flex-shrink-0">
                    {taskStats.todo}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex-1 px-2 py-2 text-xs font-medium transition-all rounded-lg flex items-center justify-center gap-1.5 min-w-0 ${
                  activeTab === 'ai'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <Sparkles size={14} className="flex-shrink-0" />
                <span className="truncate">AI</span>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'browse' && (
              <div className="p-5 space-y-5">
                {/* Quick Actions Row */}
                <div className="grid grid-cols-2 gap-3">
                  {onOpenKnowledgeGraph && (
                    <button
                      onClick={() => {
                        onOpenKnowledgeGraph()
                        setIsOpen(false)
                      }}
                      className="px-4 py-3.5 bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                      title="Open Knowledge Graph - Visualize note connections"
                    >
                      <Network size={18} />
                      <span>Knowledge Graph</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onSearch()
                      setIsOpen(false)
                    }}
                    className="px-4 py-3.5 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Search size={18} />
                    <span>Find & Replace</span>
                  </button>
                  {note && (
                    <div className="relative col-span-2">
                      <button
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="w-full px-4 py-3.5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                        title="Export note to different formats"
                      >
                        <Download size={18} />
                        <span>Export Note</span>
                        <ChevronDown size={16} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {/* Export Menu Dropdown */}
                      {showExportMenu && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-10">
                          <div className="py-1">
                            <button
                              onClick={handleExportToPDF}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 group"
                            >
                              <FileDown size={18} className="text-red-500 group-hover:scale-110 transition-transform" />
                              <div className="flex-1">
                                <div className="text-sm font-semibold text-gray-900">Export to PDF</div>
                                <div className="text-xs text-gray-500">Print-friendly PDF format</div>
                              </div>
                            </button>
                            <button
                              onClick={handleExportToMarkdown}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 group"
                            >
                              <FileDown size={18} className="text-blue-500 group-hover:scale-110 transition-transform" />
                              <div className="flex-1">
                                <div className="text-sm font-semibold text-gray-900">Export to Markdown</div>
                                <div className="text-xs text-gray-500">Plain text with formatting</div>
                              </div>
                            </button>
                            <button
                              onClick={handleExportToHTML}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 group"
                            >
                              <FileDown size={18} className="text-orange-500 group-hover:scale-110 transition-transform" />
                              <div className="flex-1">
                                <div className="text-sm font-semibold text-gray-900">Export to HTML</div>
                                <div className="text-xs text-gray-500">Standalone web page</div>
                              </div>
                            </button>
                            <button
                              onClick={handleExportToPlainText}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 group"
                            >
                              <FileDown size={18} className="text-gray-500 group-hover:scale-110 transition-transform" />
                              <div className="flex-1">
                                <div className="text-sm font-semibold text-gray-900">Export to Plain Text</div>
                                <div className="text-xs text-gray-500">Simple text format</div>
                              </div>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Current Note Card */}
                {note && (
                  <div className="bg-gradient-to-br from-blue-50/50 to-purple-50/50 rounded-2xl p-5 border border-blue-100/50">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          note.note_type === 'drawing' ? 'bg-purple-100' :
                          note.note_type === 'mindmap' ? 'bg-green-100' : 'bg-blue-100'
                        }`}>
                          {note.note_type === 'drawing' ? (
                            <PenTool size={20} className="text-purple-600" />
                          ) : note.note_type === 'mindmap' ? (
                            <Network size={20} className="text-green-600" />
                          ) : (
                            <FileText size={20} className="text-blue-600" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">Current Note</h3>
                          <p className="text-sm text-gray-500 capitalize">{note.note_type?.replace('-', ' ') || 'Text Note'}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      {currentFolderName && (
                        <div className="flex items-center gap-3 px-3 py-2.5 bg-white/80 rounded-xl">
                          <FolderTreeIcon size={16} className="text-amber-500" />
                          <span className="text-sm text-gray-700">{currentFolderName}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="px-3 py-2.5 bg-white/80 rounded-xl">
                          <p className="text-xs text-gray-500 mb-1">Last edited</p>
                          <p className="text-sm font-medium text-gray-900">{new Date(note.updated_at).toLocaleDateString()}</p>
                        </div>
                        {stats.words > 0 && (
                          <div className="px-3 py-2.5 bg-white/80 rounded-xl">
                            <p className="text-xs text-gray-500 mb-1">Word count</p>
                            <p className="text-sm font-medium text-gray-900">{stats.words.toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Keyboard Shortcuts */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Keys</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-gray-600">Toggle Panel</span>
                      <kbd className="px-2 py-1 bg-white border border-gray-200 rounded-md text-xs font-mono text-gray-600 shadow-sm">⌘\</kbd>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-gray-600">Save Note</span>
                      <kbd className="px-2 py-1 bg-white border border-gray-200 rounded-md text-xs font-mono text-gray-600 shadow-sm">⌘S</kbd>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-gray-600">Find</span>
                      <kbd className="px-2 py-1 bg-white border border-gray-200 rounded-md text-xs font-mono text-gray-600 shadow-sm">⌘F</kbd>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-gray-600">New Note</span>
                      <kbd className="px-2 py-1 bg-white border border-gray-200 rounded-md text-xs font-mono text-gray-600 shadow-sm">⌘N</kbd>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="p-5 space-y-5">
                {/* Tasks & Calendar Button */}
                {onOpenTaskCalendar && (
                  <button
                    onClick={() => {
                      onOpenTaskCalendar()
                      setIsOpen(false)
                    }}
                    className="w-full px-4 py-3.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                    title="Open Tasks & Calendar"
                  >
                    <Calendar size={18} />
                    <span>Open Tasks & Calendar</span>
                  </button>
                )}

                {/* Quick Add Task */}
                <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">
                    Quick Add Task
                  </label>
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
                      placeholder="What needs to be done?"
                      className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <button
                      onClick={handleQuickAddTask}
                      disabled={!quickTaskTitle.trim()}
                      className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                      title="Add task"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                {/* Task Stats */}
                {taskStats && (
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-100/50">
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div className="bg-white/80 rounded-xl p-3">
                        <div className="text-2xl font-bold text-blue-600">{taskStats.todo}</div>
                        <div className="text-xs text-gray-500 mt-1">To Do</div>
                      </div>
                      <div className="bg-white/80 rounded-xl p-3">
                        <div className="text-2xl font-bold text-purple-600">{taskStats.in_progress}</div>
                        <div className="text-xs text-gray-500 mt-1">In Progress</div>
                      </div>
                      <div className="bg-white/80 rounded-xl p-3">
                        <div className="text-2xl font-bold text-green-600">{taskStats.completed}</div>
                        <div className="text-xs text-gray-500 mt-1">Done</div>
                      </div>
                      <div className="bg-white/80 rounded-xl p-3">
                        <div className={`text-2xl font-bold ${taskStats.overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {taskStats.overdue}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Overdue</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Task List Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700">
                      {note ? 'Tasks for this note' : 'Recent Tasks'}
                    </h3>
                  </div>

                  {/* Task Filters - Pill Style */}
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {(['all', 'starred', 'today', 'overdue'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setTaskFilter(filter)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all flex items-center gap-1.5 ${
                          taskFilter === filter
                            ? filter === 'starred' ? 'bg-yellow-500 text-white' :
                              filter === 'overdue' ? 'bg-red-500 text-white' :
                              'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {filter === 'starred' && <Star size={12} fill={taskFilter === 'starred' ? 'currentColor' : 'none'} />}
                        {filter === 'today' && <Clock size={12} />}
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>

                  {isLoadingTasks ? (
                    <div className="text-center py-10">
                      <Loader2 size={28} className="animate-spin mx-auto text-blue-600 mb-3" />
                      <p className="text-sm text-gray-500">Loading tasks...</p>
                    </div>
                  ) : filteredTasks.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <CheckSquare size={40} className="mx-auto text-gray-300 mb-3" />
                      <p className="text-sm font-medium text-gray-500">
                        {taskFilter === 'all' ? 'No tasks yet' : 
                         taskFilter === 'starred' ? 'No starred tasks' :
                         taskFilter === 'today' ? 'No tasks due today' :
                         'No overdue tasks'}
                      </p>
                      {taskFilter === 'all' && (
                        <p className="text-xs text-gray-400 mt-2">Add your first task above</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredTasks.slice(0, 10).map((task) => {
                        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'
                        
                        return (
                          <div
                            key={task.id}
                            className="bg-white border border-gray-100 rounded-xl p-3.5 hover:shadow-md hover:border-gray-200 transition-all group"
                          >
                            <div className="flex items-start gap-3">
                              <button
                                onClick={() => handleToggleTaskComplete(task.id, task.status === 'completed')}
                                className="mt-0.5 flex-shrink-0 transition-transform hover:scale-110"
                              >
                                {task.status === 'completed' ? (
                                  <CheckCircle2 size={20} className="text-green-600" />
                                ) : (
                                  <Circle size={20} className="text-gray-300 group-hover:text-blue-400" />
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                    {task.title}
                                  </p>
                                  <button
                                    onClick={() => handleToggleTaskStar(task.id, task.is_starred)}
                                    className={`flex-shrink-0 transition-transform hover:scale-110 ${task.is_starred ? 'text-yellow-500' : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-yellow-500'}`}
                                  >
                                    <Star size={16} fill={task.is_starred ? 'currentColor' : 'none'} />
                                  </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                                  {task.priority !== 'medium' && (
                                    <span className={`px-2 py-1 rounded-md font-medium ${
                                      task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                                      task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {task.priority}
                                    </span>
                                  )}
                                  
                                  {task.due_date && (
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-medium ${
                                      isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      <Clock size={12} />
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
                          className="w-full px-4 py-3 text-sm text-blue-600 hover:bg-blue-50 rounded-xl transition-colors font-semibold"
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
              <div className="p-5">
                {headings.length === 0 ? (
                  <div className="text-center py-14 px-4">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                      <ListTree size={32} className="text-gray-400" />
                    </div>
                    <p className="text-base font-medium text-gray-600 mb-2">No headings yet</p>
                    <p className="text-sm text-gray-400">Use H1, H2, or H3 to create headings</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-700">Table of Contents</h3>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                        {headings.length} heading{headings.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {headings.map((heading, index) => {
                        const levelLabel = heading.level === 1 ? 'H1' : heading.level === 2 ? 'H2' : 'H3'
                        return (
                          <button
                            key={heading.id || `${heading.level}-${index}`}
                            onClick={() => {
                              onScrollToHeading(heading.id)
                              setIsOpen(false)
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-all group border border-transparent hover:border-blue-100"
                            style={{ paddingLeft: `${(heading.level - 1) * 16 + 16}px` }}
                            title={`Jump to ${levelLabel}: ${heading.text}`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-mono px-2 py-1 rounded-md ${
                                heading.level === 1 ? 'bg-blue-100 text-blue-600' :
                                heading.level === 2 ? 'bg-purple-100 text-purple-600' :
                                'bg-gray-100 text-gray-600'
                              }`}>{levelLabel}</span>
                              <span className="truncate block flex-1 text-sm font-medium">{heading.text}</span>
                              <ChevronRight size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="h-[calc(100%-1px)]">
                <AIAssistant
                  note={note}
                  noteContent={noteContent}
                  selectedText={selectedText}
                  allNotes={allNotesForAI}
                  mindmapData={mindmapData}
                  selectedMindmapNodeId={selectedMindmapNodeId}
                  tasks={tasks}
                  taskStats={taskStats}
                  events={calendarEvents}
                  onInsertText={onInsertText}
                  onReplaceText={onReplaceText}
                  onReplaceSelection={onReplaceSelection}
                  onInsertAtCursor={onInsertAtCursor}
                  onCreateTask={onCreateTaskFromAI}
                  onAddMindmapNode={onAddMindmapNode}
                />
              </div>
            )}
          </div>

          {/* Footer - Compact Stats */}
          {note && activeTab !== 'ai' && (
            <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50">
              <div className="flex justify-between items-center text-xs text-gray-500">
                <div className="flex items-center gap-4">
                  <span>{stats.words.toLocaleString()} words</span>
                  <span className="text-gray-300">•</span>
                  <span>{stats.characters.toLocaleString()} characters</span>
                </div>
                <span title="Last modified">
                  {new Date(note.updated_at).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>
          )}
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
