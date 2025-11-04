'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
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
  ChevronLeft,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { Note } from './NoteEditor'
import { FolderNode } from '@/lib/folders'
import { getNotesByFolder } from '@/lib/notes'
import { CalendarEvent, getCalendarEvents, subscribeToCalendarEvents } from '@/lib/calendar'
import { useAuth } from '@/lib/auth-context'

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
}: UnifiedPanelProps) {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'browse' | 'toc'>('browse')
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const ALL_FOLDER_KEY = '__ALL__'
  const folderKey = (folderId: string | null) => folderId ?? ALL_FOLDER_KEY
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

  // Load calendar events
  useEffect(() => {
    if (!user) return
    
    const loadEvents = async () => {
      try {
        const events = await getCalendarEvents()
        setCalendarEvents(events)
      } catch (error) {
        console.error('Error loading calendar events:', error)
      }
    }

    loadEvents()

    // Subscribe to real-time updates
    const unsubscribe = subscribeToCalendarEvents(user.id, () => {
      loadEvents()
    })

    return unsubscribe
  }, [user])

  // Calendar helper functions
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []

    // Add empty slots for days before the first of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }

    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i))
    }

    return days
  }

  const getEventsForDate = (date: Date | null): CalendarEvent[] => {
    if (!date) return []
    
    const dateStr = date.toISOString().split('T')[0]
    return calendarEvents.filter(event => {
      const eventStart = event.start_date.split('T')[0]
      const eventEnd = event.end_date.split('T')[0]
      return dateStr >= eventStart && dateStr <= eventEnd
    })
  }

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  const goToToday = () => {
    setCurrentMonth(new Date())
  }

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
  }, [notes, selectedFolderId, isLoadingNotes])

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
    [folderNotesData, notes, selectedFolderId]
  )

  const handleFolderToggle = (targetFolderId: string | null) => {
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
  }

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
    [folders]
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

  const renderFolder = (folder: FolderNode, level: number = 0) => {
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
          >
            <ChevronRight
              size={14}
              className={`flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} ${hasChildren ? 'text-gray-600' : 'text-gray-300'}`}
            />
            <FolderTreeIcon size={14} className={`flex-shrink-0 ${isExpanded ? 'text-blue-500' : 'text-gray-500'}`} />
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
                <div className="text-xs text-red-500 py-1.5 px-2">
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
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {n.note_type === 'drawing' ? (
                          <PenTool size={12} className="text-purple-500 flex-shrink-0" />
                        ) : n.note_type === 'mindmap' ? (
                          <Network size={12} className="text-green-500 flex-shrink-0" />
                        ) : (
                          <FileText size={12} className="text-blue-500 flex-shrink-0" />
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
  }

  const allNotesEntry = folderNotesData[ALL_FOLDER_KEY]
  const isAllExpanded = expandedFolders.has(ALL_FOLDER_KEY)
  const shouldShowAllNotes = isAllExpanded
  const isAllLoading = allNotesEntry?.isLoading ?? (shouldShowAllNotes && !allNotesEntry)
  const allNotes = allNotesEntry?.notes ?? []
  const displayedAllNotes = allNotes
  const allError = allNotesEntry?.error

  // Context menu handlers with smart positioning
  const handleFolderContextMenu = (e: React.MouseEvent, folderId: string, folderName: string) => {
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
  }

  const handleNoteContextMenu = (e: React.MouseEvent, note: Note) => {
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
  }

  // Drag and drop handlers for moving notes
  const handleNoteDragStart = (e: React.DragEvent, noteId: string) => {
    e.dataTransfer.setData('text/plain', noteId)
    e.dataTransfer.effectAllowed = 'move'
    // Add visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }
  
  const handleNoteDragEnd = (e: React.DragEvent) => {
    // Reset visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
    setHoverFolderId(null)
  }

  const handleFolderDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleFolderDragEnter = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault()
    // Only set hover if we're entering the target element itself
    if (e.currentTarget === e.target) {
      setHoverFolderId(targetFolderId === null ? ALL_FOLDER_KEY : folderKey(targetFolderId))
    }
  }

  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    // Only clear hover if we're actually leaving the element
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setHoverFolderId(null)
    }
  }

  const handleFolderDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
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
  }

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
        className="fixed top-14 right-6 z-50 p-3 bg-white border-2 border-gray-200 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
        aria-label={isOpen ? 'Close menu' : 'Open menu (⌘\\)'}
        title={isOpen ? 'Close menu' : 'Open menu (⌘\\)'}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Unified Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed top-24 right-6 z-40 w-80 max-h-[calc(100vh-6rem)] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
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
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save size={14} />
                {isSaving ? 'Saving...' : 'Save'}
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
              <CalendarIcon size={15} />
              Calendar
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
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {activeTab === 'browse' && (
              <div className="space-y-3">
                {/* Mini Calendar */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-200">
                  {/* Calendar Header */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={goToPreviousMonth}
                      className="p-1 hover:bg-white/60 rounded transition-colors"
                      title="Previous month"
                    >
                      <ChevronLeft size={16} className="text-gray-600" />
                    </button>
                    <div className="flex flex-col items-center">
                      <div className="text-sm font-semibold text-gray-800">
                        {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </div>
                      <button
                        onClick={goToToday}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-0.5"
                      >
                        Today
                      </button>
                    </div>
                    <button
                      onClick={goToNextMonth}
                      className="p-1 hover:bg-white/60 rounded transition-colors"
                      title="Next month"
                    >
                      <ChevronRight size={16} className="text-gray-600" />
                    </button>
                  </div>

                  {/* Day Labels */}
                  <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                      <div key={day} className="text-center text-[10px] font-semibold text-gray-500 py-1">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-0.5">
                    {getDaysInMonth(currentMonth).map((day, index) => {
                      if (!day) {
                        return <div key={`empty-${index}`} className="aspect-square" />
                      }

                      const isToday = 
                        day.getDate() === new Date().getDate() &&
                        day.getMonth() === new Date().getMonth() &&
                        day.getFullYear() === new Date().getFullYear()

                      const dayEvents = getEventsForDate(day)
                      const hasEvents = dayEvents.length > 0

                      return (
                        <div
                          key={day.toISOString()}
                          className={`aspect-square flex flex-col items-center justify-center rounded text-xs transition-all cursor-pointer ${
                            isToday
                              ? 'bg-blue-600 text-white font-bold shadow-md hover:bg-blue-700'
                              : hasEvents
                              ? 'bg-white text-gray-800 font-medium hover:bg-blue-100 shadow-sm'
                              : 'bg-white/40 text-gray-600 hover:bg-white/70'
                          }`}
                          title={hasEvents ? `${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}` : ''}
                        >
                          <span className="text-[11px]">{day.getDate()}</span>
                          {hasEvents && (
                            <div className="flex gap-0.5 mt-0.5">
                              {dayEvents.slice(0, 3).map((event, i) => (
                                <div
                                  key={i}
                                  className="w-1 h-1 rounded-full"
                                  style={{ backgroundColor: isToday ? '#fff' : event.color }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Event Count */}
                  <div className="mt-3 pt-2 border-t border-blue-200 flex items-center justify-between">
                    <div className="text-xs text-gray-600">
                      {calendarEvents.length} event{calendarEvents.length !== 1 ? 's' : ''}
                    </div>
                    <CalendarIcon size={14} className="text-blue-400" />
                  </div>
                </div>

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
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
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
                    </div>
                  </div>
                )}
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
                  <div className="space-y-0.5">
                    {headings.map((heading, index) => (
                      <button
                        key={heading.id || `${heading.level}-${index}`}
                        onClick={() => {
                          onScrollToHeading(heading.id)
                          setIsOpen(false)
                        }}
                        className="w-full text-left block px-2.5 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors"
                        style={{ paddingLeft: `${(heading.level - 1) * 12 + 10}px` }}
                      >
                        <span className="truncate block">{heading.text}</span>
                      </button>
                    ))}
                  </div>
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
                </button>
                <div className="flex justify-between items-center text-xs text-gray-500 px-1">
                  <div className="flex items-center gap-2.5">
                    <span>{stats.words} words</span>
                    <span className="text-gray-300">•</span>
                    <span>{stats.characters} chars</span>
                  </div>
                  <span className="text-gray-400">{new Date(note.updated_at).toLocaleDateString()}</span>
                </div>
              </>
            )}
            {!note && (
              <div className="text-center text-xs text-gray-400 py-0.5">
                Press <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-gray-600">⌘\</kbd> to toggle menu
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
                    // create a new text note inside this folder
                    onNewNote?.('rich-text', contextMenu.id)
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
