'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { X, Search, FileText, Folder } from 'lucide-react'
import { getNotes } from '@/lib/notes'
import { getFolders } from '@/lib/folders'
import type { Note } from '@/lib/notes'
import type { Folder as FolderType } from '@/lib/folders'

interface NoteLinkDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (noteId: string, noteTitle: string, folderId?: string | null) => void
  currentNoteId?: string // Exclude current note from selection
}

export default function NoteLinkDialog({
  isOpen,
  onClose,
  onSelect,
  currentNoteId
}: NoteLinkDialogProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<FolderType[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)

  // Load notes and folders
  useEffect(() => {
    if (!isOpen) return

    const loadData = async () => {
      setLoading(true)
      try {
        const [notesData, foldersData] = await Promise.all([
          getNotes(),
          getFolders()
        ])
        setNotes(notesData)
        setFolders(foldersData)
      } catch (error) {
        console.error('Failed to load notes:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [isOpen])

  // Filter and sort notes
  const filteredNotes = useMemo(() => {
    let filtered = notes.filter(note => note.id !== currentNoteId)

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(note =>
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query)
      )
    }

    return filtered.sort((a, b) => 
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  }, [notes, searchQuery, currentNoteId])

  // Get folder name helper
  const getFolderName = (folderId: string | null) => {
    if (!folderId) return 'No Folder'
    const folder = folders.find(f => f.id === folderId)
    return folder?.name || 'Unknown Folder'
  }

  const handleSelect = (note: Note) => {
    onSelect(note.id, note.title, note.folder_id)
    setSearchQuery('')
    onClose()
  }

  const handleClose = () => {
    setSearchQuery('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold">Link to Note</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              Loading notes...
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <FileText size={48} className="mb-2 text-gray-300" />
              <p className="text-sm">
                {searchQuery.trim() ? 'No notes found' : 'No notes available'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNotes.map(note => (
                <button
                  key={note.id}
                  onClick={() => handleSelect(note)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText
                          size={16}
                          className="text-gray-400 group-hover:text-blue-600 flex-shrink-0"
                        />
                        <h3 className="font-medium text-gray-900 truncate">
                          {note.title || 'Untitled Note'}
                        </h3>
                      </div>
                      {note.folder_id && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 ml-6">
                          <Folder size={12} />
                          <span>{getFolderName(note.folder_id)}</span>
                        </div>
                      )}
                      {note.content && (
                        <p className="text-sm text-gray-600 line-clamp-2 ml-6 mt-1">
                          {note.content.replace(/<[^>]*>/g, '').substring(0, 150)}
                          {note.content.length > 150 ? '...' : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(note.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            Select a note to create a link
          </p>
        </div>
      </div>
    </div>
  )
}
