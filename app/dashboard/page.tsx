'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import NoteEditor, { Note } from '@/components/NoteEditor'
import { Loader2, FileEdit, Sparkles } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import {
  getNotesByFolder,
  createNote,
  updateNote,
  deleteNote,
  subscribeToNotes,
  moveNote,
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
  moveFolder,
} from '@/lib/folders'

export default function Dashboard() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [folderTree, setFolderTree] = useState<FolderNode[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [isLoadingNotes, setIsLoadingNotes] = useState(true)
  const [isLoadingFolders, setIsLoadingFolders] = useState(true)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newNoteType, setNewNoteType] = useState<'rich-text' | 'drawing' | 'mindmap'>('rich-text')
  // Create-folder modal state (replace window.prompt for Tauri compatibility)
  const suppressRealtimeRef = useRef(false)
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const createFolderInputRef = useRef<HTMLInputElement | null>(null)

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
      try {
        // payload example: { eventType: 'UPDATE'|'INSERT'|'DELETE', new: {...}, old: {...} }
        const { eventType, new: newRow, old: oldRow } = payload
        // If we're suppressing realtime reloads (e.g. an autosave just happened), ignore
        if (suppressRealtimeRef.current) return

        // Helper: determine if a note belongs in the currently selected folder view
        const belongsInCurrentFolder = (note: any) => {
          if (selectedFolderId === null) return note.folder_id === null
          return note.folder_id === selectedFolderId
        }

        if (eventType === 'INSERT') {
          if (newRow && belongsInCurrentFolder(newRow)) {
            setNotes((prev) => {
              // avoid duplicates
              if (prev.some((n) => n.id === newRow.id)) return prev
              return [newRow, ...prev]
            })
          }
        } else if (eventType === 'UPDATE') {
          if (newRow) {
            setNotes((prev) => {
              const exists = prev.some((n) => n.id === newRow.id)
              // If note already present, replace it
              if (exists) {
                return prev.map((n) => (n.id === newRow.id ? newRow : n))
              }
              // If it now belongs in the current folder, add it
              if (belongsInCurrentFolder(newRow)) {
                return [newRow, ...prev]
              }
              return prev
            })
          }
        } else if (eventType === 'DELETE') {
          if (oldRow) {
            setNotes((prev) => prev.filter((n) => n.id !== oldRow.id))
          }
        } else {
          // unknown event — fall back to reloading current folder
          loadNotesInFolder(selectedFolderId)
        }
      } catch (err) {
        console.error('Error handling realtime note payload', err)
        // on unexpected error, fallback to reloading
        loadNotesInFolder(selectedFolderId)
      }
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

  const handleSaveNote = async (
    noteData: { title: string; content: string; note_type?: 'rich-text' | 'drawing' | 'mindmap' },
    isAuto?: boolean
  ) => {
    try {
      if (selectedNote && !isCreatingNew) {
        // Update existing note
        const updated = await updateNote(selectedNote.id, noteData)
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
        setSelectedNote(updated)
        if (isAuto) {
          // briefly suppress realtime reloads triggered by DB hooks
          suppressRealtimeRef.current = true
          setTimeout(() => (suppressRealtimeRef.current = false), 1200)
        }
      } else {
        // Create new note in current folder
        const created = await createNote({
          ...noteData,
          folder_id: selectedFolderId,
          note_type: noteData.note_type || newNoteType,
        })
        setNotes((prev) => [created, ...prev])
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

  const handleNewNote = (noteType: 'rich-text' | 'drawing' | 'mindmap' = 'rich-text', folderId?: string | null) => {
    // If a folderId is explicitly passed, use it; otherwise keep current selection
    if (folderId !== undefined) {
      setSelectedFolderId(folderId)
    }
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

  // Open an in-app modal to create a folder. This replaces window.prompt which
  // doesn't appear in some WebViews (notably Tauri on macOS).
  const handleCreateFolder = async (parentId: string | null) => {
    setCreateFolderParentId(parentId)
    setNewFolderName('')
    setShowCreateFolderModal(true)
    // focus the input on next tick when modal is rendered
    setTimeout(() => createFolderInputRef.current?.focus(), 50)
  }

  const confirmCreateFolder = async () => {
    const name = newFolderName?.trim()
    if (!name) return
    
    // Add validation for folder name length and special characters
    if (name.length > 100) {
      alert('Folder name is too long (max 100 characters)')
      return
    }
    
    // Check for duplicate folder names at the same level
    const siblings = createFolderParentId 
      ? folders.filter(f => f.parent_id === createFolderParentId)
      : folders.filter(f => f.parent_id === null)
    
    if (siblings.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      alert('A folder with this name already exists at this level')
      return
    }

    try {
      await createFolder({ name, parent_id: createFolderParentId })
      setShowCreateFolderModal(false)
      setNewFolderName('')
      setCreateFolderParentId(null)
      loadFolders()
    } catch (error) {
      console.error('Error creating folder:', error)
      // keep modal open so user can retry; show simple alert for now
      alert('Failed to create folder. Please try again.')
    }
  }

  const cancelCreateFolder = () => {
    setShowCreateFolderModal(false)
    setNewFolderName('')
    setCreateFolderParentId(null)
  }

  const handleRenameFolder = async (folderId: string, newName: string) => {
    const trimmedName = newName.trim()
    if (!trimmedName) {
      alert('Folder name cannot be empty')
      return
    }
    
    if (trimmedName.length > 100) {
      alert('Folder name is too long (max 100 characters)')
      return
    }
    
    // Find the folder being renamed to check siblings
    const folderToRename = folders.find(f => f.id === folderId)
    if (folderToRename) {
      const siblings = folders.filter(f => 
        f.parent_id === folderToRename.parent_id && f.id !== folderId
      )
      
      if (siblings.some(f => f.name.toLowerCase() === trimmedName.toLowerCase())) {
        alert('A folder with this name already exists at this level')
        return
      }
    }
    
    try {
      await updateFolder(folderId, { name: trimmedName })
      loadFolders()
    } catch (error) {
      console.error('Error renaming folder:', error)
      alert('Failed to rename folder. Please try again.')
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

  const handleDuplicateNote = async (note: Note) => {
    try {
      const duplicatedNote = await createNote({
        title: `${note.title} (Copy)`,
        content: note.content,
        folder_id: note.folder_id,
        note_type: note.note_type,
      })
      setNotes([duplicatedNote, ...notes])
      setSelectedNote(duplicatedNote)
      setIsCreatingNew(false)
    } catch (error) {
      console.error('Error duplicating note:', error)
      alert('Failed to duplicate note')
    }
  }

  const handleMoveNote = async (noteId: string, newFolderId: string | null) => {
    try {
      await moveNote(noteId, newFolderId)
      await loadNotesInFolder(selectedFolderId)
      loadFolders()
      
      // Show success toast
      const note = notes.find(n => n.id === noteId)
      const folderName = newFolderId === null ? 'All Notes' : folders.find(f => f.id === newFolderId)?.name || 'Unknown folder'
      toast.push({ 
        title: 'Note moved', 
        description: `"${note?.title || 'Untitled'}" moved to ${folderName}`, 
        duration: 3000 
      })
    } catch (error) {
      console.error('Error moving note:', error)
      alert('Failed to move note')
    }
  }

  const handleMoveFolder = async (folderId: string, newParentId: string | null) => {
    try {
      await moveFolder(folderId, newParentId)
      loadFolders()
    } catch (error) {
      console.error('Error moving folder:', error)
      alert('Failed to move folder')
    }
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
            onMoveFolder={handleMoveFolder}
            notes={notes}
            onSelectNote={handleSelectNote}
            onNewNote={handleNewNote}
            onDuplicateNote={handleDuplicateNote}
            onMoveNote={handleMoveNote}
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

      {/* Create Folder Modal (in-app) */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">New Folder</h3>
            <p className="text-sm text-gray-600 mb-4">Enter a name for the new folder.</p>
            <input
              ref={createFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-3 py-2 border border-gray-200 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCreateFolder()
                if (e.key === 'Escape') cancelCreateFolder()
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelCreateFolder}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmCreateFolder}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
