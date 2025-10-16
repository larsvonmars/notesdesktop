'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Menu,
  X,
  Save,
  Trash2,
  Search,
  ListTree,
  FolderTree as FolderTreeIcon,
  FileText,
  ChevronDown,
  ChevronRight,
  PenTool,
  Network,
  LogOut,
  User,
} from 'lucide-react'
import { Note } from './NoteEditor'
import { FolderNode } from '@/lib/folders'

interface UnifiedPanelProps {
  // Note controls
  note?: Note | null
  title: string
  onTitleChange: (title: string) => void
  onSave: () => void
  onDelete?: () => void
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
  onNewNote: (noteType?: 'rich-text' | 'drawing' | 'mindmap') => void
  isLoadingNotes: boolean
  currentFolderName?: string

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
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  notes,
  selectedNoteId,
  onSelectNote,
  onNewNote,
  isLoadingNotes,
  currentFolderName,
  stats,
  userEmail,
  onSignOut,
}: UnifiedPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'browse' | 'toc'>('browse')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcut to toggle panel (Cmd/Ctrl + \)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId)
    } else {
      newExpanded.add(folderId)
    }
    setExpandedFolders(newExpanded)
  }

  const renderFolder = (folder: FolderNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id)
    const isSelected = selectedFolderId === folder.id
    const hasChildren = folder.children.length > 0
    
    // Get notes for this folder (only when selected)
    const folderNotes = isSelected ? notes : []
    const noteCount = isSelected ? folderNotes.length : 0

    return (
      <div key={folder.id}>
        <div className="space-y-0.5">
          {/* Folder Header */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer rounded-md transition-colors ${
              isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'
            }`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => {
              // Clicking folder selects it and auto-expands to show notes
              onSelectFolder(folder.id)
              if (!isExpanded) {
                toggleFolder(folder.id)
              }
            }}
          >
            {/* Expand/Collapse chevron */}
            {(hasChildren || isSelected) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFolder(folder.id)
                }}
                className="p-0.5 hover:bg-white/50 rounded flex-shrink-0"
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                <ChevronRight
                  size={14}
                  className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                />
              </button>
            )}
            {!hasChildren && !isSelected && <div className="w-5 flex-shrink-0" />}
            
            {/* Folder icon and name */}
            <FolderTreeIcon size={14} className="flex-shrink-0" />
            <span className="text-sm truncate flex-1">{folder.name}</span>
            
            {/* Note count badge */}
            {noteCount > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                {noteCount}
              </span>
            )}
          </div>

          {/* Notes in this folder (shown when folder is selected and expanded) */}
          {isSelected && isExpanded && (
            <div className="ml-6 space-y-0.5 border-l border-blue-200 pl-2">
              {isLoadingNotes ? (
                <div className="text-xs text-gray-500 py-1.5 px-2">Loading notes...</div>
              ) : folderNotes.length === 0 ? (
                <div className="text-xs text-gray-400 italic py-1.5 px-2">No notes in this folder</div>
              ) : (
                folderNotes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      onSelectNote(n)
                      setIsOpen(false)
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-md transition-colors ${
                      selectedNoteId === n.id
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className="text-sm truncate">{n.title || 'Untitled'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {new Date(n.updated_at).toLocaleDateString()}
                    </div>
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

  return (
    <>
      {/* Floating Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 p-3 bg-white border-2 border-gray-200 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
        aria-label={isOpen ? 'Close menu' : 'Open menu (⌘\\)'}
        title={isOpen ? 'Close menu' : 'Open menu (⌘\\)'}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Unified Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed top-20 left-4 z-40 w-80 max-h-[calc(100vh-6rem)] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
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
                  onClick={onDelete}
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
                      onNewNote('rich-text')
                      setIsOpen(false)
                    }}
                    className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2.5 shadow-sm hover:shadow"
                  >
                    <FileText size={16} />
                    <span>Text Note</span>
                  </button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => {
                        onNewNote('drawing')
                        setIsOpen(false)
                      }}
                      className="px-2.5 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <PenTool size={14} />
                      <span>Drawing</span>
                    </button>
                    <button
                      onClick={() => {
                        onNewNote('mindmap')
                        setIsOpen(false)
                      }}
                      className="px-2.5 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Network size={14} />
                      <span>Mindmap</span>
                    </button>
                  </div>
                </div>

                {/* All Notes Folder */}
                <div className="border-t border-gray-200 pt-2.5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-1.5">
                    Your Notes
                  </div>
                  <button
                    onClick={() => {
                      onSelectFolder(null)
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-md mb-1.5 text-sm font-medium transition-colors flex items-center gap-2 ${
                      selectedFolderId === null ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <FolderTreeIcon size={16} />
                    <span className="flex-1">All Notes</span>
                    {selectedFolderId === null && notes.length > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                        {notes.length}
                      </span>
                    )}
                  </button>

                  {/* Show notes when All Notes is selected */}
                  {selectedFolderId === null && (
                    <div className="ml-4 space-y-0.5 border-l border-blue-200 pl-2 mb-2">
                      {isLoadingNotes ? (
                        <div className="text-xs text-gray-500 py-1.5 px-2">Loading notes...</div>
                      ) : notes.length === 0 ? (
                        <div className="text-xs text-gray-400 italic py-1.5 px-2">No notes yet</div>
                      ) : (
                        notes.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => {
                              onSelectNote(n)
                              setIsOpen(false)
                            }}
                            className={`w-full text-left px-2 py-1.5 rounded-md transition-colors ${
                              selectedNoteId === n.id
                                ? 'bg-blue-100 text-blue-700 font-medium'
                                : 'hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            <div className="text-sm truncate">{n.title || 'Untitled'}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {new Date(n.updated_at).toLocaleDateString()}
                            </div>
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
                    <div className="text-xs text-gray-400 italic py-1.5 px-2">No folders yet</div>
                  ) : (
                    <div className="space-y-0.5">
                      {folders.map((folder) => renderFolder(folder))}
                    </div>
                  )}
                  <button
                    onClick={() => onCreateFolder(null)}
                    className="w-full mt-2 px-3 py-1.5 text-sm text-gray-600 border border-dashed border-gray-300 rounded-md hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors font-medium"
                  >
                    + New Folder
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'toc' && (
              <div>
                {headings.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <ListTree size={40} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">
                      No headings in this note yet
                    </p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      Use H1, H2, or H3 to create headings
                    </p>
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
    </>
  )
}
