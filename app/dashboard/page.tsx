'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import NoteEditor, { Note } from '@/components/NoteEditor'
import { Loader2, FileEdit, Sparkles } from 'lucide-react'
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
      <div className="flex items-center justify-center min-h-screen bg-white">
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
    <div className="min-h-screen bg-white flex flex-col">
      {/* Main content area - completely clean */}
      <main className="flex-1 w-full h-screen overflow-hidden">
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
            onSignOut={handleSignOut}
            userEmail={user.email}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-8 max-w-md">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-blue-100 rounded-full blur-3xl opacity-40"></div>
                <FileEdit className="relative w-24 h-24 text-blue-500 mx-auto" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-3">
                Welcome to Notes Desktop
              </h1>
              <p className="text-lg text-gray-600 mb-8">
                A distraction-free writing space designed for your thoughts
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => handleNewNote('rich-text')}
                  className="w-full inline-flex items-center justify-center gap-3 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all duration-150 shadow-sm hover:shadow active:scale-95"
                >
                  <Sparkles size={20} />
                  Start Writing
                </button>
                <p className="text-sm text-gray-500">
                  Click the menu button (top-left) to browse your notes
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
