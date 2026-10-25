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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent">
            <FileText size={17} strokeWidth={1.9} aria-hidden />
          </span>
          <div className="min-w-0">
            <ModalTitle>Link to Note</ModalTitle>
            <p className="mt-0.5 truncate text-xs leading-5 text-muted">Pick the note you want to reference</p>
          </div>
        </ModalHeader>

        {/* Search */}
        <div className="border-b border-border bg-[var(--surface-sunken)] p-4">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input h-9 w-full pl-9 pr-3 text-sm"
              autoFocus
            />
          </div>
        </div>

        <ModalBody noPadding>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted">
              Loading notes…
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted">
              <FileText size={40} className="mb-2 opacity-40" />
              <p className="text-sm">
                {searchQuery.trim() ? 'No notes found' : 'No notes available'}
              </p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredNotes.map(note => (
                <button
                  key={note.id}
                  onClick={() => handleSelect(note)}
                  className="glass-row group items-start p-3"
                >
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <FileText
                          size={15}
                          className="shrink-0 text-muted transition-colors group-hover:text-accent"
                        />
                        <h3 className="truncate text-sm font-medium text-foreground">
                          {note.title || 'Untitled Note'}
                        </h3>
                      </div>
                      {note.folder_id && (
                        <div className="ml-6 flex items-center gap-1 text-xs text-muted">
                          <Folder size={12} />
                          <span className="truncate">{getFolderName(note.folder_id)}</span>
                        </div>
                      )}
                      {note.content && (
                        <p className="ml-6 mt-1 line-clamp-2 text-xs leading-5 text-muted">
                          {note.content.replace(/<[^>]*>/g, '').substring(0, 150)}
                          {note.content.length > 150 ? '...' : ''}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-[11px] text-muted">
                      {new Date(note.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <p className="text-center text-xs text-muted">
            Select a note to create a link
          </p>
        </ModalFooter>
    </BaseModal>
  )
}
