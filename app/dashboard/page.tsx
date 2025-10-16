'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import NoteEditor, { Note } from '@/components/NoteEditor'
import NotesList from '@/components/NotesList'
import FolderTree from '@/components/FolderTree'
import { LogOut, Loader2, FileEdit, Sparkles, FolderTree as FolderTreeIcon, FileText } from 'lucide-react'
import {
  getNotesByFolder,
  createNote,
  updateNote,
  deleteNote,
  subscribeToNotes,
} from '@/lib/notes'
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  buildFolderTree,
  subscribeToFolders,
  FolderNode,
  Folder,
} from '@/lib/folders'

export default function Dashboard() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [folderTree, setFolderTree] = useState<FolderNode[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [isLoadingNotes, setIsLoadingNotes] = useState(true)
  const [isLoadingFolders, setIsLoadingFolders] = useState(true)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newNoteType, setNewNoteType] = useState<'rich-text' | 'drawing' | 'mindmap'>('rich-text')
  const [showFoldersPanel, setShowFoldersPanel] = useState(true)
  const [showNotesPanel, setShowNotesPanel] = useState(true)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // Load folders
  useEffect(() => {
    if (user) {
      loadFolders()
    }
  }, [user])

  // Load notes when folder selection changes
  useEffect(() => {
    if (user) {
      loadNotesInFolder(selectedFolderId)
    }
  }, [selectedFolderId, user])

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return

    const unsubscribeNotes = subscribeToNotes(user.id, (payload) => {
      console.log('Real-time note update:', payload)
      loadNotesInFolder(selectedFolderId)
    })

    const unsubscribeFolders = subscribeToFolders(user.id, (payload) => {
      console.log('Real-time folder update:', payload)
      loadFolders()
    })

    return () => {
      unsubscribeNotes()
      unsubscribeFolders()
    }
  }, [user, selectedFolderId])

  const loadFolders = async () => {
    try {
      const fetchedFolders = await getFolders()
      setFolders(fetchedFolders)
      setFolderTree(buildFolderTree(fetchedFolders))
    } catch (error) {
      console.error('Error loading folders:', error)
    } finally {
      setIsLoadingFolders(false)
    }
  }

  const loadNotesInFolder = async (folderId: string | null) => {
    try {
      setIsLoadingNotes(true)
      const fetchedNotes = await getNotesByFolder(folderId)
      setNotes(fetchedNotes)
    } catch (error) {
      console.error('Error loading notes:', error)
    } finally {
      setIsLoadingNotes(false)
    }
  }

  const handleSaveNote = async (noteData: { title: string; content: string; note_type?: 'rich-text' | 'drawing' | 'mindmap' }) => {
    try {
      if (selectedNote && !isCreatingNew) {
        // Update existing note
        const updated = await updateNote(selectedNote.id, noteData)
        setNotes(notes.map((n) => (n.id === updated.id ? updated : n)))
        setSelectedNote(updated)
      } else {
        // Create new note in current folder
        const created = await createNote({
          ...noteData,
          folder_id: selectedFolderId,
          note_type: noteData.note_type || newNoteType,
        })
        setNotes([created, ...notes])
        setSelectedNote(created)
        setIsCreatingNew(false)
      }
    } catch (error) {
      console.error('Error saving note:', error)
      throw error
    }
  }

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteNote(id)
      setNotes(notes.filter((n) => n.id !== id))
      setSelectedNote(null)
      setIsCreatingNew(false)
    } catch (error) {
      console.error('Error deleting note:', error)
      throw error
    }
  }

  const handleNewNote = (noteType: 'rich-text' | 'drawing' | 'mindmap' = 'rich-text') => {
    setSelectedNote(null)
    setIsCreatingNew(true)
    setNewNoteType(noteType)
  }

  const handleSelectNote = (note: Note) => {
    setSelectedNote(note)
    setIsCreatingNew(false)
  }

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId)
    setSelectedNote(null)
    setIsCreatingNew(false)
  }

  const handleCreateFolder = async (parentId: string | null) => {
    const name = prompt('Enter folder name:')
    if (!name || !name.trim()) return

    try {
      await createFolder({ name: name.trim(), parent_id: parentId })
      loadFolders()
    } catch (error) {
      console.error('Error creating folder:', error)
      alert('Failed to create folder')
    }
  }

  const handleRenameFolder = async (folderId: string, newName: string) => {
    try {
      await updateFolder(folderId, { name: newName })
      loadFolders()
    } catch (error) {
      console.error('Error renaming folder:', error)
      alert('Failed to rename folder')
    }
  }

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await deleteFolder(folderId)
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null)
      }
      loadFolders()
      loadNotesInFolder(selectedFolderId)
    } catch (error) {
      console.error('Error deleting folder:', error)
      alert('Failed to delete folder')
    }
  }

  const handleCancel = () => {
    setIsCreatingNew(false)
    setSelectedNote(null)
  }

  const getCurrentFolderName = (): string | undefined => {
    if (selectedFolderId === null) return undefined
    const folder = folders.find((f) => f.id === selectedFolderId)
    return folder?.name
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <div className="text-lg text-gray-700 font-medium">Loading your workspace...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-blue-600" />
                <h1 className="text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                  Notes Desktop
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFoldersPanel((prev) => !prev)}
                  aria-pressed={showFoldersPanel}
                  aria-label={showFoldersPanel ? 'Hide folders panel' : 'Show folders panel'}
                  title={showFoldersPanel ? 'Hide folders panel' : 'Show folders panel'}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150 shadow-sm ${
                    showFoldersPanel
                      ? 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  <FolderTreeIcon size={16} />
                  
                </button>
                <button
                  type="button"
                  onClick={() => setShowNotesPanel((prev) => !prev)}
                  aria-pressed={showNotesPanel}
                  aria-label={showNotesPanel ? 'Hide notes panel' : 'Show notes panel'}
                  title={showNotesPanel ? 'Hide notes panel' : 'Show notes panel'}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150 shadow-sm ${
                    showNotesPanel
                      ? 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  <FileText size={16} />
                  
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 font-medium">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-all duration-150 shadow-sm hover:shadow active:scale-95"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
  <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-12rem)]">
          {/* Folder Tree - Left sidebar */}
          {showFoldersPanel && (
            <div className="w-full lg:w-72 flex-shrink-0 h-full overflow-hidden">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 h-full overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-5 bg-blue-600 rounded-full"></span>
                    <h2 className="text-base font-semibold text-gray-800">Folders</h2>
                  </div>
                </div>
                <FolderTree
                  folders={folderTree}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={handleSelectFolder}
                  onCreateFolder={handleCreateFolder}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolder}
                />
              </div>
            </div>
          )}

          {/* Notes List - Middle sidebar */}
          {showNotesPanel && (
            <div className="w-full lg:w-80 flex-shrink-0 h-full">
              <NotesList
                notes={notes}
                selectedNoteId={selectedNote?.id}
                onSelectNote={handleSelectNote}
                onNewNote={handleNewNote}
                isLoading={isLoadingNotes}
                currentFolderName={getCurrentFolderName()}
              />
            </div>
          )}

          {/* Note Editor - Main area (Full screen when note is selected) */}
          <div className={`${(selectedNote || isCreatingNew) ? 'fixed inset-0 z-30' : 'flex-1 h-full min-w-0'}`}>
            {selectedNote || isCreatingNew ? (
              <NoteEditor
                note={isCreatingNew ? null : selectedNote}
                initialNoteType={newNoteType}
                onSave={handleSaveNote}
                onCancel={handleCancel}
                onDelete={selectedNote ? handleDeleteNote : undefined}
                folders={folderTree}
                selectedFolderId={selectedFolderId}
                onSelectFolder={handleSelectFolder}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                notes={notes}
                onSelectNote={handleSelectNote}
                onNewNote={handleNewNote}
                isLoadingNotes={isLoadingNotes}
                currentFolderName={getCurrentFolderName()}
              />
            ) : (
              <div className="flex items-center justify-center h-full bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="text-center p-8">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-blue-100 rounded-full blur-2xl opacity-30"></div>
                    <FileEdit className="relative w-20 h-20 text-gray-300 mx-auto" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">
                    Select a note to edit
                  </h3>
                  <p className="text-gray-500 mb-6 max-w-sm">
                    Choose a note from the list or create a new one to get started
                  </p>
                  <button
                    onClick={() => handleNewNote('rich-text')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all duration-150 shadow-sm hover:shadow active:scale-95"
                  >
                    <Sparkles size={18} />
                    Create New Note
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
