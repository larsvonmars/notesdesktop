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
  FolderInput,
  MoreVertical,
} from 'lucide-react'
import { Note } from './NoteEditor'
import { FolderNode } from '@/lib/folders'
import { getNotesByFolder, searchNotes } from '@/lib/notes'

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
}: UnifiedPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'browse' | 'toc'>('browse')
  const ALL_FOLDER_KEY = '__ALL__'
  const folderKey = (folderId: string | null) => folderId ?? ALL_FOLDER_KEY
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set([ALL_FOLDER_KEY])
  )
  const [folderNotesData, setFolderNotesData] = useState<
    Record<string, { notes: Note[]; isLoading: boolean; error?: string }>
  >({})
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Note[]>([])
  const [searchError, setSearchError] = useState<string | undefined>(undefined)
  const panelRef = useRef<HTMLDivElement>(null)
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const hasSearch = normalizedQuery.length > 0
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
  const [notesSortBy, setNotesSortBy] = useState<'updated' | 'created' | 'title'>('updated')
  const [hoverFolderId, setHoverFolderId] = useState<string | null>(null)

  const matchesNote = useCallback(
    (note: Note) => {
      if (!hasSearch) return true
      const title = (note.title ?? '').toLowerCase()
      return title.includes(normalizedQuery)
    },
    [hasSearch, normalizedQuery]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle panel (Cmd/Ctrl + \)
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
      
      // Only handle these shortcuts when panel is open
      if (isOpen && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        // Check if we're not in an input field
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return
        }

            switch (e.key.toLowerCase()) {
              case 'n':
                e.preventDefault()
                onNewNote('rich-text', selectedFolderId)
                setIsOpen(false)
                break
              case 'd':
                e.preventDefault()
                onNewNote('drawing', selectedFolderId)
                setIsOpen(false)
                break
              case 'm':
                e.preventDefault()
                onNewNote('mindmap', selectedFolderId)
                setIsOpen(false)
                break
          case 'f':
            e.preventDefault()
            onCreateFolder(null)
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCreateFolder, onNewNote])

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

  useEffect(() => {
    let isActive = true

    if (!hasSearch) {
      setSearchResults([])
      setSearchError(undefined)
      setIsSearching(false)
      return
    }

    const query = searchQuery.trim()
    if (!query) {
      setSearchResults([])
      setSearchError(undefined)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    setSearchError(undefined)

    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await searchNotes(query)
        if (!isActive) return
        setSearchResults(results)
        setSearchError(undefined)
      } catch (error) {
        console.error('Failed to search notes', error)
        if (!isActive) return
        setSearchError(error instanceof Error ? error.message : 'Unable to search notes')
      } finally {
        if (isActive) {
          setIsSearching(false)
        }
      }
    }, 300)

    return () => {
      isActive = false
      window.clearTimeout(timeoutId)
    }
  }, [hasSearch, searchQuery])

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

  const displayedFolders = useMemo(() => {
    if (!hasSearch) return folders

    const traverse = (nodes: FolderNode[]): FolderNode[] => {
      return nodes.reduce<FolderNode[]>((acc, node) => {
        const filteredChildren = traverse(node.children)
        const key = folderKey(node.id)
        const folderEntry = folderNotesData[key]
        const folderNotes = folderEntry?.notes ?? []
        const visibleNotes = folderNotes.filter(matchesNote)
        const folderMatches = node.name.toLowerCase().includes(normalizedQuery)

        if (folderMatches || filteredChildren.length > 0 || visibleNotes.length > 0) {
          acc.push({
            ...node,
            children: filteredChildren,
          })
        }

        return acc
      }, [])
    }

    return traverse(folders)
  }, [folders, folderNotesData, hasSearch, matchesNote, normalizedQuery])

  const folderSearchResults = useMemo(() => {
    if (!hasSearch) return []

    const results: Array<{ id: string; name: string; path: string[] }> = []

    const traverse = (nodes: FolderNode[], ancestors: string[]) => {
      nodes.forEach((node) => {
        const nextPath = [...ancestors, node.name]
        if (node.name.toLowerCase().includes(normalizedQuery)) {
          results.push({ id: node.id, name: node.name, path: nextPath })
        }
        traverse(node.children, nextPath)
      })
    }

    traverse(folders, [])
    return results
  }, [folders, hasSearch, normalizedQuery])

  useEffect(() => {
    if ((expandedFolders.has(ALL_FOLDER_KEY) || hasSearch) && !folderNotesData[ALL_FOLDER_KEY]) {
      loadFolderNotes(null)
    }
  }, [expandedFolders, folderNotesData, hasSearch, loadFolderNotes])

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

  // Sort notes based on selected option
  const sortNotes = useCallback((notesToSort: Note[]) => {
    return [...notesToSort].sort((a, b) => {
      switch (notesSortBy) {
        case 'title':
          return (a.title || 'Untitled').localeCompare(b.title || 'Untitled')
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'updated':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      }
    })
  }, [notesSortBy])

  const renderFolder = (folder: FolderNode, level: number = 0) => {
    const key = folderKey(folder.id)
    const isExpanded = hasSearch ? true : expandedFolders.has(key)
    const isSelected = selectedFolderId === folder.id
    const hasChildren = folder.children.length > 0
    const folderEntry = folderNotesData[key]
    const folderNotes = folderEntry?.notes ?? []
    const filteredNotes = hasSearch ? folderNotes.filter(matchesNote) : folderNotes
    const visibleNotes = sortNotes(filteredNotes)
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
                  {hasSearch ? 'No matching notes in this folder' : 'Empty folder'}
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
  const shouldShowAllNotes = hasSearch || isAllExpanded
  const isAllLoading = allNotesEntry?.isLoading ?? (shouldShowAllNotes && !allNotesEntry)
  const allNotes = allNotesEntry?.notes ?? []
  const filteredAllNotes = hasSearch ? allNotes.filter(matchesNote) : allNotes
  const displayedAllNotes = sortNotes(filteredAllNotes)
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
    const note = notes.find(n => n.id === noteId) || searchResults.find(n => n.id === noteId)
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
      const newName = prompt('Rename folder:', contextMenu.name)
      if (newName && newName.trim()) {
        onRenameFolder(contextMenu.id, newName.trim())
      }
    }
    setContextMenu(null)
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
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {activeTab === 'browse' && (
              <div className="space-y-3">
                {/* New Note Buttons - More compact */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-1">
                    Create New
                  </div>
                  <button
                    onClick={() => {
                      onNewNote('rich-text', selectedFolderId)
                      setIsOpen(false)
                    }}
                    className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors flex items-center justify-between gap-2.5 shadow-sm hover:shadow"
                    title="Create a new text note"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText size={16} />
                      <span>Text Note</span>
                    </div>
                    <kbd className="text-[10px] px-1.5 py-0.5 bg-blue-700/50 rounded">N</kbd>
                  </button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => {
                          onNewNote('drawing', selectedFolderId)
                          setIsOpen(false)
                        }}
                      className="px-2.5 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors flex flex-col items-center justify-center gap-1"
                      title="Create a new drawing note"
                    >
                      <div className="flex items-center gap-1.5">
                        <PenTool size={14} />
                        <span>Drawing</span>
                      </div>
                      <kbd className="text-[9px] px-1 py-0.5 bg-purple-700/50 rounded">D</kbd>
                    </button>
                    <button
                      onClick={() => {
                        onNewNote('mindmap', selectedFolderId)
                        setIsOpen(false)
                      }}
                      className="px-2.5 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors flex flex-col items-center justify-center gap-1"
                      title="Create a new mindmap"
                    >
                      <div className="flex items-center gap-1.5">
                        <Network size={14} />
                        <span>Mindmap</span>
                      </div>
                      <kbd className="text-[9px] px-1 py-0.5 bg-green-700/50 rounded">M</kbd>
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="border-t border-gray-200 pt-2.5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-1.5">
                    Search
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search notes and folders..."
                      className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {hasSearch && (
                    <div className="mt-2 space-y-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-1">Notes</div>
                        {isSearching ? (
                          <div className="text-xs text-gray-500 flex items-center gap-1.5 px-2 py-1.5">
                            <Loader2 size={14} className="animate-spin" />
                            Searching notes...
                          </div>
                        ) : searchError ? (
                          <div className="text-xs text-red-500 px-2 py-1.5">{searchError}</div>
                        ) : searchResults.length === 0 ? (
                          <div className="text-xs text-gray-400 italic px-2 py-1.5">No matching notes</div>
                        ) : (
                          <div className="space-y-1">
                            {searchResults.slice(0, 15).map((result) => {
                              const pathNames = getFolderPathNames(result.folder_id)
                              const pathLabel = pathNames.length > 0 ? pathNames.join(' / ') : 'Unknown folder'
                              const noteIcon =
                                result.note_type === 'drawing' ? (
                                  <PenTool size={14} className="text-purple-500" />
                                ) : result.note_type === 'mindmap' ? (
                                  <Network size={14} className="text-green-500" />
                                ) : (
                                  <FileText size={14} className="text-blue-600" />
                                )

                              return (
                                <button
                                  key={result.id}
                                  onClick={() => {
                                    expandToFolder(result.folder_id)
                                    onSelectNote(result)
                                    setIsOpen(false)
                                  }}
                                  className="w-full text-left px-2.5 py-2 rounded-md hover:bg-blue-50 hover:shadow-sm transition-all duration-150 border border-transparent hover:border-blue-200"
                                >
                                  <div className="flex items-start gap-2.5">
                                    <div className="mt-0.5">{noteIcon}</div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-gray-800 truncate">
                                        {result.title || 'Untitled note'}
                                      </div>
                                      <div className="text-[11px] text-gray-500 truncate mt-0.5 flex items-center gap-1">
                                        <FolderTreeIcon size={10} className="flex-shrink-0" />
                                        <span>{pathLabel || 'All Notes'}</span>
                                      </div>
                                    </div>
                                    <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">
                                      {new Date(result.updated_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-1">Folders</div>
                        {folderSearchResults.length === 0 ? (
                          <div className="text-xs text-gray-400 italic px-2 py-1.5">No matching folders</div>
                        ) : (
                          <div className="space-y-1">
                            {folderSearchResults.slice(0, 15).map((folderResult) => (
                              <button
                                key={folderResult.id}
                                onClick={() => expandToFolder(folderResult.id)}
                                className="w-full text-left px-2.5 py-2 rounded-md hover:bg-gray-50 hover:shadow-sm transition-all duration-150 border border-transparent hover:border-gray-200 flex items-start gap-2.5"
                              >
                                <FolderTreeIcon size={14} className="text-amber-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-gray-800 truncate">{folderResult.name}</div>
                                  <div className="text-[11px] text-gray-500 truncate">
                                    {folderResult.path.join(' / ')}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* All Notes Folder */}
                <div className="border-t border-gray-200 pt-2.5">
                  <div className="flex items-center justify-between px-2 mb-1.5">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Your Notes
                    </div>
                    <select
                      value={notesSortBy}
                      onChange={(e) => setNotesSortBy(e.target.value as 'updated' | 'created' | 'title')}
                      className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded text-gray-600 bg-white hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      title="Sort notes by"
                    >
                      <option value="updated">Last Updated</option>
                      <option value="created">Date Created</option>
                      <option value="title">Title (A-Z)</option>
                    </select>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleFolderToggle(null)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleFolderToggle(null)
                      }
                    }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                    onDragEnter={(e) => handleFolderDragEnter(e as React.DragEvent, null)}
                    onDragLeave={(e) => handleFolderDragLeave(e as React.DragEvent)}
                    onDrop={(e) => { handleFolderDrop(e as React.DragEvent, null); setHoverFolderId(null) }}
                    className={`w-full text-left px-2 py-1.5 rounded-md mb-1.5 text-sm font-medium transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${
                      selectedFolderId === null ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
                    } ${hoverFolderId === ALL_FOLDER_KEY ? 'ring-2 ring-blue-300 bg-blue-50' : ''}`}
                  >
                    <ChevronRight
                      size={15}
                      className={`flex-shrink-0 transition-transform ${
                        shouldShowAllNotes ? 'rotate-90' : ''
                      }`}
                    />
                    <FolderTreeIcon size={16} />
                    <span className="flex-1">All Notes</span>
                    {isAllLoading && (
                      <span className="text-xs text-gray-400">Loading...</span>
                    )}
                    {displayedAllNotes.length > 0 && !isAllLoading && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                        {displayedAllNotes.length}
                      </span>
                    )}
                  </div>

                  {shouldShowAllNotes && (
                    <div className="ml-4 space-y-0.5 border-l border-blue-200 pl-2 mb-2">
                      {!allNotesEntry ? (
                        <div className="text-xs text-gray-500 py-1.5 px-2">Loading notes...</div>
                      ) : isAllLoading ? (
                        <div className="text-xs text-gray-500 py-1.5 px-2">Loading notes...</div>
                      ) : allError ? (
                        <div className="text-xs text-red-500 py-1.5 px-2">
                          {allError}
                        </div>
                      ) : displayedAllNotes.length === 0 ? (
                        <div className="text-center py-4 px-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                          <FileText size={32} className="mx-auto text-gray-300 mb-2" />
                          <div className="text-xs text-gray-500 mb-1">
                            {hasSearch ? 'No matching notes found' : 'No notes yet'}
                          </div>
                          {!hasSearch && (
                            <div className="text-xs text-gray-400">Create your first note to get started</div>
                          )}
                        </div>
                      ) : (
                        displayedAllNotes.map((n) => (
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
                </div>

                {/* Folder Tree with Notes */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-1.5">
                    Folders
                  </div>
                  {folders.length === 0 ? (
                    <div className="text-center py-4 px-3 bg-gray-50 rounded-lg border border-dashed border-gray-300 mb-2">
                      <FolderTreeIcon size={32} className="mx-auto text-gray-300 mb-2" />
                      <div className="text-xs text-gray-500 mb-1">No folders yet</div>
                      <div className="text-xs text-gray-400">Organize your notes by creating folders</div>
                    </div>
                  ) : (
                    hasSearch && displayedFolders.length === 0 ? (
                      <div className="text-xs text-gray-400 italic py-1.5 px-2">No matching folders</div>
                    ) : (
                      <div className="space-y-0.5">
                        {displayedFolders.map((folder) => renderFolder(folder))}
                      </div>
                    )
                  )}
                  <button
                    onClick={() => onCreateFolder(null)}
                    className="w-full mt-2 px-3 py-1.5 text-sm text-gray-600 border border-dashed border-gray-300 rounded-md hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors font-medium flex items-center justify-center gap-2"
                    title="Create a new folder (F)"
                  >
                    <FolderPlus size={14} />
                    <span>New Folder</span>
                  </button>
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
                      const note = notes.find(n => n.id === contextMenu.id) || 
                                   searchResults.find(n => n.id === contextMenu.id)
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
    </>
  )
}
