'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Search, FileText, Folder } from 'lucide-react'
import { getNotes } from '@/lib/notes'
import { getFolders } from '@/lib/folders'
import type { Note } from '@/lib/notes'
import type { Folder as FolderType } from '@/lib/folders'
import BaseModal, { ModalHeader, ModalBody, ModalFooter, ModalTitle } from './BaseModal'

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
    <BaseModal isOpen={isOpen} onClose={handleClose} size="2xl" maxHeight="80vh">
        <ModalHeader onClose={handleClose} closeAriaLabel="Close note link dialog" gradient={false}>
          <FileText size={20} className="text-alpine-600" />
          <ModalTitle>Link to Note</ModalTitle>
        </ModalHeader>

        {/* Search */}
        <div className="p-4 border-b border-gray-100 dark:border-slate-700">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-slate-500"
            />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-alpine-500"
              autoFocus
            />
          </div>
        </div>

        <ModalBody noPadding>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-500 dark:text-slate-400">
              Loading notes...
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-slate-400">
              <FileText size={48} className="mb-2 text-gray-300 dark:text-slate-600" />
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
                  className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-alpine-300 dark:hover:border-alpine-600 hover:bg-alpine-50 dark:hover:bg-alpine-900/30 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText
                          size={16}
                          className="text-gray-400 dark:text-slate-500 group-hover:text-alpine-600 dark:group-hover:text-alpine-400 flex-shrink-0"
                        />
                        <h3 className="font-medium text-gray-900 dark:text-slate-100 truncate">
                          {note.title || 'Untitled Note'}
                        </h3>
                      </div>
                      {note.folder_id && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 ml-6">
                          <Folder size={12} />
                          <span>{getFolderName(note.folder_id)}</span>
                        </div>
                      )}
                      {note.content && (
                        <p className="text-sm text-gray-600 dark:text-slate-300 line-clamp-2 ml-6 mt-1">
                          {note.content.replace(/<[^>]*>/g, '').substring(0, 150)}
                          {note.content.length > 150 ? '...' : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">
                      {new Date(note.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="bg-gray-50 dark:bg-slate-800/50">
          <p className="text-xs text-gray-500 dark:text-slate-400 text-center">
            Select a note to create a link
          </p>
        </ModalFooter>
    </BaseModal>
  )
}
