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
}: UnifiedPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'browse' | 'toc'>('browse')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)

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
            className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded transition-colors ${
              isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'
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
              <FolderTreeIcon size={14} className="flex-shrink-0" />
              <span className="text-sm truncate flex-1">{folder.name}</span>
              {noteCount > 0 && (
                <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
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
                    onClick={() => onSelectNote(n)}
                    className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                      selectedNoteId === n.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    <div className="text-xs text-gray-500 truncate">
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
        aria-label="Toggle menu"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Unified Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed top-20 left-4 z-40 w-80 max-h-[calc(100vh-6rem)] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
        >
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
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'browse'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <FileText size={16} className="inline mr-2" />
              Browse
            </button>
            <button
              onClick={() => setActiveTab('toc')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'toc'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <ListTree size={16} className="inline mr-2" />
              TOC
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'browse' && (
              <div className="space-y-4">
                {/* New Note Buttons */}
                <div className="space-y-2">
                  <button
                    onClick={() => onNewNote('rich-text')}
                    className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText size={16} />
                    New Text Note
                  </button>
                  <button
                    onClick={() => onNewNote('drawing')}
                    className="w-full px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <PenTool size={16} />
                    New Drawing
                  </button>
                  <button
                    onClick={() => onNewNote('mindmap')}
                    className="w-full px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Network size={16} />
                    New Mindmap
                  </button>
                </div>

                {/* All Notes Folder */}
                <div>
                  <button
                    onClick={() => onSelectFolder(null)}
                    className={`w-full text-left px-3 py-2 rounded-lg mb-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                      selectedFolderId === null ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    <FolderTreeIcon size={16} />
                    All Notes
                    <span className="ml-auto text-xs text-gray-500">
                      {selectedFolderId === null ? notes.length : ''}
                    </span>
                  </button>

                  {/* Show notes when All Notes is selected */}
                  {selectedFolderId === null && (
                    <div className="ml-4 space-y-1 border-l-2 border-gray-200 pl-3">
                      {isLoadingNotes ? (
                        <div className="text-xs text-gray-500 py-2">Loading...</div>
                      ) : notes.length === 0 ? (
                        <div className="text-xs text-gray-500 py-2">No notes</div>
                      ) : (
                        notes.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => onSelectNote(n)}
                            className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                              selectedNoteId === n.id
                                ? 'bg-blue-100 text-blue-700'
                                : 'hover:bg-gray-100'
                            }`}
                          >
                            <div className="text-sm font-medium truncate">{n.title}</div>
                            <div className="text-xs text-gray-500 truncate">
                              {new Date(n.updated_at).toLocaleDateString()}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Folder Tree with Notes */}
                <div className="border-t border-gray-200 pt-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-2">
                    Folders
                  </div>
                  {folders.map((folder) => renderFolderWithNotes(folder))}
                  <button
                    onClick={() => onCreateFolder(null)}
                    className="w-full mt-2 px-3 py-2 text-sm text-gray-600 border border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors"
                  >
                    + New Folder
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'toc' && (
              <div>
                {headings.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-4">
                    No headings in this note
                  </div>
                ) : (
                  <div className="space-y-1">
                    {headings.map((heading, index) => (
                      <button
                        key={heading.id || `${heading.level}-${index}`}
                        onClick={() => {
                          onScrollToHeading(heading.id)
                        }}
                        className="w-full text-left block px-3 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700 rounded transition-colors"
                        style={{ paddingLeft: `${(heading.level - 1) * 12 + 12}px` }}
                      >
                        {heading.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer with search & stats */}
          <div className="border-t border-gray-200 p-3 bg-gray-50">
            <button
              onClick={onSearch}
              className="w-full mb-2 px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-white transition-colors flex items-center gap-2"
            >
              <Search size={16} />
              Find & Replace
            </button>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{stats.characters} chars</span>
              <span>{stats.words} words</span>
              {note && <span>{new Date(note.updated_at).toLocaleDateString()}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
