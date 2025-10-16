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

  const renderFolderWithNotes = (folder: FolderNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id)
    const isSelected = selectedFolderId === folder.id
    const hasChildren = folder.children.length > 0
    
    // Get notes for this folder
    const folderNotes = selectedFolderId === folder.id ? notes : []
    const noteCount = folderNotes.length

    return (
      <div key={folder.id}>
        <div className="space-y-1">
          {/* Folder Header */}
          <div
            className={`flex items-center gap-2 px-2 py-2 cursor-pointer rounded-lg transition-colors ${
              isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'
            }`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
          >
            {/* Expand/Collapse button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleFolder(folder.id)
              }}
              className="p-0.5 hover:bg-white/50 rounded"
            >
              <ChevronRight
                size={14}
                className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>
            
            {/* Folder name - clicking selects the folder */}
            <div
              onClick={() => onSelectFolder(folder.id)}
              className="flex items-center gap-2 flex-1 min-w-0"
            >
              <FolderTreeIcon size={16} className="flex-shrink-0" />
              <span className="text-sm truncate flex-1">{folder.name}</span>
              {noteCount > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                  {noteCount}
                </span>
              )}
            </div>
          </div>

          {/* Notes in this folder (shown when folder is selected) */}
          {isSelected && folderNotes.length > 0 && (
            <div className="ml-8 space-y-1 border-l-2 border-blue-200 pl-3">
              {isLoadingNotes ? (
                <div className="text-xs text-gray-500 py-2">Loading...</div>
              ) : (
                folderNotes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      onSelectNote(n)
                      setIsOpen(false)
                    }}
                    className={`w-full text-left px-2 py-2 rounded transition-colors ${
                      selectedNoteId === n.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {new Date(n.updated_at).toLocaleDateString()}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Child folders (shown when expanded) */}
          {isExpanded && hasChildren && (
            <div>
              {folder.children.map((child) => renderFolderWithNotes(child, level + 1))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderFolder = (folder: FolderNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id)
    const isSelected = selectedFolderId === folder.id
    const hasChildren = folder.children.length > 0

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded transition-colors ${
            isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => onSelectFolder(folder.id)}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleFolder(folder.id)
              }}
              className="p-0.5"
            >
              <ChevronRight
                size={14}
                className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          )}
          {!hasChildren && <div className="w-5" />}
          <span className="text-sm truncate flex-1">{folder.name}</span>
        </div>
        {isExpanded && hasChildren && (
          <div>{folder.children.map((child) => renderFolder(child, level + 1))}</div>
        )}
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
            <div className="p-3 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-700 truncate flex-1">
                  <User size={14} className="text-gray-500 flex-shrink-0" />
                  <span className="truncate">{userEmail}</span>
                </div>
                <button
                  onClick={onSignOut}
                  className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  title="Sign Out"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {/* Title & Actions */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white">
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Note title..."
              className="w-full px-3 py-2 text-lg font-semibold border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
              disabled={isSaving || isDeleting}
            />
            
            <div className="flex items-center gap-2">
              <button
                onClick={onSave}
                disabled={isSaving || isDeleting || !hasChanges}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              
              {note && onDelete && (
                <button
                  onClick={onDelete}
                  disabled={isDeleting}
                  className="px-3 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              )}
              
              <button
                onClick={onCancel}
                disabled={isSaving || isDeleting}
                className="px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {hasChanges && (
              <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                Unsaved changes
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 bg-gray-50">
            <button
              onClick={() => setActiveTab('browse')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'browse'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <FileText size={16} />
              Browse Notes
            </button>
            <button
              onClick={() => setActiveTab('toc')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'toc'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
              disabled={headings.length === 0}
            >
              <ListTree size={16} />
              Contents
              {headings.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-full">
                  {headings.length}
                </span>
              )}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'browse' && (
              <div className="space-y-4">
                {/* New Note Buttons - More prominent */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-2">
                    Create New
                  </div>
                  <button
                    onClick={() => {
                      onNewNote('rich-text')
                      setIsOpen(false)
                    }}
                    className="w-full px-4 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-3 shadow-sm hover:shadow"
                  >
                    <FileText size={18} />
                    <span>Text Note</span>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        onNewNote('drawing')
                        setIsOpen(false)
                      }}
                      className="px-3 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <PenTool size={16} />
                      <span>Drawing</span>
                    </button>
                    <button
                      onClick={() => {
                        onNewNote('mindmap')
                        setIsOpen(false)
                      }}
                      className="px-3 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Network size={16} />
                      <span>Mindmap</span>
                    </button>
                  </div>
                </div>

                {/* All Notes Folder */}
                <div className="border-t border-gray-200 pt-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-2">
                    Your Notes
                  </div>
                  <button
                    onClick={() => {
                      onSelectFolder(null)
                      if (selectedFolderId === null && notes.length === 0) {
                        // Don't close panel if viewing empty "All Notes"
                      }
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg mb-2 text-sm font-medium transition-colors flex items-center gap-2.5 ${
                      selectedFolderId === null ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <FolderTreeIcon size={18} />
                    <span className="flex-1">All Notes</span>
                    {selectedFolderId === null && notes.length > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                        {notes.length}
                      </span>
                    )}
                  </button>

                  {/* Show notes when All Notes is selected */}
                  {selectedFolderId === null && (
                    <div className="ml-4 space-y-1 border-l-2 border-blue-200 pl-3 mb-3">
                      {isLoadingNotes ? (
                        <div className="text-xs text-gray-500 py-2">Loading...</div>
                      ) : notes.length === 0 ? (
                        <div className="text-xs text-gray-500 py-2 italic">No notes yet</div>
                      ) : (
                        notes.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => {
                              onSelectNote(n)
                              setIsOpen(false)
                            }}
                            className={`w-full text-left px-2 py-2 rounded transition-colors ${
                              selectedNoteId === n.id
                                ? 'bg-blue-100 text-blue-700'
                                : 'hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            <div className="text-sm font-medium truncate">{n.title}</div>
                            <div className="text-xs text-gray-500 truncate mt-0.5">
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
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-2">
                    Folders
                  </div>
                  {folders.length === 0 ? (
                    <div className="text-xs text-gray-500 py-2 px-2 italic">No folders yet</div>
                  ) : (
                    folders.map((folder) => renderFolderWithNotes(folder))
                  )}
                  <button
                    onClick={() => onCreateFolder(null)}
                    className="w-full mt-3 px-3 py-2 text-sm text-gray-600 border border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors font-medium"
                  >
                    + New Folder
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'toc' && (
              <div>
                {headings.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <ListTree size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">
                      No headings in this note yet
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      Use H1, H2, or H3 to create headings
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {headings.map((heading, index) => (
                      <button
                        key={heading.id || `${heading.level}-${index}`}
                        onClick={() => {
                          onScrollToHeading(heading.id)
                          setIsOpen(false)
                        }}
                        className="w-full text-left block px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors"
                        style={{ paddingLeft: `${(heading.level - 1) * 12 + 12}px` }}
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
          <div className="border-t border-gray-200 p-3 bg-gray-50">
            {note && (
              <>
                <button
                  onClick={() => {
                    onSearch()
                    setIsOpen(false)
                  }}
                  className="w-full mb-3 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium"
                >
                  <Search size={16} />
                  Find & Replace
                </button>
                <div className="flex justify-between items-center text-xs text-gray-500 px-1">
                  <div className="flex items-center gap-3">
                    <span>{stats.words} words</span>
                    <span className="text-gray-300">•</span>
                    <span>{stats.characters} chars</span>
                  </div>
                  <span className="text-gray-400">{new Date(note.updated_at).toLocaleDateString()}</span>
                </div>
              </>
            )}
            {!note && (
              <div className="text-center text-xs text-gray-400 py-1">
                Press <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-gray-600">⌘\</kbd> to toggle menu
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
