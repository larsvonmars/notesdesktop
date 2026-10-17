'use client'

import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  createNote,
  deleteNote,
  getNote,
  moveNote,
  updateNote,
  type Note,
  type NoteSummary,
  type NoteType,
} from '@/lib/notes'
import type { Folder } from '@/lib/folders'
import { moveNoteToProject, type Project } from '@/lib/projects'
import type { ToastLike } from '@/lib/workspace/types'

export interface NoteActionsOptions {
  notes: NoteSummary[]
  selectedNote: Note | null
  selectedNoteRef: MutableRefObject<Note | null>
  isCreatingNewSaveRef: MutableRefObject<boolean>
  suppressRealtimeRef: MutableRefObject<boolean>
  selectedFolderId: string | null
  selectedProjectId: string | null
  folders: Folder[]
  projects: Project[]
  newNoteType: NoteType
  setNotes: Dispatch<SetStateAction<NoteSummary[]>>
  setAllNotes: Dispatch<SetStateAction<NoteSummary[]>>
  setSelectedNote: Dispatch<SetStateAction<Note | null>>
  setIsCreatingNew: Dispatch<SetStateAction<boolean>>
  setSelectedProjectId: Dispatch<SetStateAction<string | null>>
  activateExistingNote: (note: Note) => void
  loadNotesInFolder: (folderId: string | null) => Promise<void>
  loadFolders: () => Promise<void>
  toast: ToastLike
}

/**
 * Note mutations for the workspace: autosave/create, delete, duplicate, move
 * between folders/projects.
 */
export function useNoteActions({
  notes,
  selectedNote,
  selectedNoteRef,
  isCreatingNewSaveRef,
  suppressRealtimeRef,
  selectedFolderId,
  selectedProjectId,
  folders,
  projects,
  newNoteType,
  setNotes,
  setAllNotes,
  setSelectedNote,
  setIsCreatingNew,
  setSelectedProjectId,
  activateExistingNote,
  loadNotesInFolder,
  loadFolders,
  toast,
}: NoteActionsOptions) {
  // Latest values for the memoized save callback (its identity must stay
  // stable so NoteEditor's autosave timer is not reset on every render).
  const selectedFolderIdRef = useRef(selectedFolderId)
  selectedFolderIdRef.current = selectedFolderId
  const selectedProjectIdRef = useRef(selectedProjectId)
  selectedProjectIdRef.current = selectedProjectId
  const newNoteTypeRef = useRef(newNoteType)
  newNoteTypeRef.current = newNoteType
  const foldersRef = useRef(folders)
  foldersRef.current = folders

  const handleSaveNote = useCallback(async (
    noteData: { title: string; content: string; note_type?: NoteType },
    isAuto = false
  ) => {
    // Read the CURRENT note from the ref, not a stale closure value.
    // This prevents saving note A's content to note B after a switch.
    const currentNote = selectedNoteRef.current
    const creatingNew = isCreatingNewSaveRef.current

    try {
      suppressRealtimeRef.current = isAuto

      if (currentNote && !creatingNew) {
        const updated = await updateNote(currentNote.id, {
          title: noteData.title,
          content: noteData.content,
          note_type: noteData.note_type,
        })

        // After the async save, verify the note is still selected.
        // If the user switched away, don't overwrite selectedNote.
        if (selectedNoteRef.current?.id !== currentNote.id) return

        setNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
        setAllNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
        // Update the selected note reference without re-activating
        // (folder/project don't change during save). Using
        // activateExistingNote here would re-trigger applyFolderSelection
        // and feed into the URL sync cycle unnecessarily.
        selectedNoteRef.current = updated
        setSelectedNote(updated)

        if (!isAuto) {
          toast.push({
            title: 'Note saved',
            description: 'Your changes have been saved successfully.',
          })
        }
      } else {
        // Validate selectedFolderId exists in current folders list to avoid FK constraint errors
        const fId = selectedFolderIdRef.current
        const fList = foldersRef.current
        const validFolderId = fId && fList.some(f => f.id === fId) ? fId : null
        const created = await createNote({
          title: noteData.title,
          content: noteData.content,
          folder_id: validFolderId,
          project_id: selectedProjectIdRef.current ?? null,
          note_type: noteData.note_type || newNoteTypeRef.current,
        })

        setNotes((prev) => [created, ...prev])
        setAllNotes((prev) => [created, ...prev])
        activateExistingNote(created)

        if (!isAuto) {
          toast.push({
            title: 'Note created',
            description: 'Your new note is ready.',
          })
        }
      }
    } catch (error) {
      console.error('Error saving note:', error)
      const errorName = (error as { name?: string } | null)?.name
      const errorMessage =
        error instanceof Error ? error.message : 'We could not save your note.'

      if (errorName === 'NoteConflictError') {
        toast.push({
          title: 'Sync conflict',
          description:
            'This note changed on another device. Your local version is kept — resolve it from the sync status.',
          duration: 10000,
        })
      } else {
        toast.push({
          title: 'Save failed',
          description: errorMessage,
        })
      }
      throw error
    } finally {
      suppressRealtimeRef.current = false
    }
  }, [toast, activateExistingNote, setNotes, setAllNotes, setSelectedNote, selectedNoteRef, isCreatingNewSaveRef, suppressRealtimeRef])

  /** Recreate a deleted note from a snapshot (used by the Undo toast action). */
  const restoreNoteSnapshot = useCallback(async (snapshot: Note) => {
    try {
      const restored = await createNote({
        title: snapshot.title,
        content: snapshot.content,
        folder_id: snapshot.folder_id,
        project_id: snapshot.project_id ?? null,
        note_type: snapshot.note_type,
      })
      setAllNotes((prev) => [restored, ...prev])
      await loadNotesInFolder(selectedFolderIdRef.current)
      toast.push({
        title: 'Note restored',
        description: 'The note is back in your workspace.',
        variant: 'success',
      })
    } catch (error) {
      console.error('Error restoring note:', error)
      toast.push({
        title: 'Restore failed',
        description: 'Could not restore the note.',
        variant: 'error',
      })
    }
  }, [setAllNotes, loadNotesInFolder, toast])

  const handleDeleteNote = async (id: string) => {
    if (!selectedNote) return
    const snapshot = selectedNote

    try {
      await deleteNote(id)
      setNotes((prev) => prev.filter((note) => note.id !== id))
      setAllNotes((prev) => prev.filter((note) => note.id !== id))
      selectedNoteRef.current = null
      isCreatingNewSaveRef.current = false
      setSelectedNote(null)
      setIsCreatingNew(false)

      toast.push({
        title: 'Note deleted',
        description: `"${snapshot.title || 'Untitled'}" was deleted.`,
        variant: 'warning',
        action: {
          label: 'Undo',
          onClick: () => {
            void restoreNoteSnapshot(snapshot)
          },
        },
      })
    } catch (error) {
      console.error('Error deleting note:', error)
      toast.push({
        title: 'Delete failed',
        description: 'Could not delete this note.',
        variant: 'error',
      })
    }
  }

  const handleDuplicateNote = async (note: NoteSummary) => {
    try {
      // Sidebar rows carry metadata only, so load the body on demand.
      const source =
        'content' in note && typeof (note as Note).content === 'string'
          ? (note as Note)
          : await getNote(note.id)
      if (!source) throw new Error('Note not found')

      const duplicatedNote = await createNote({
        title: `${source.title} (Copy)`,
        content: source.content,
        folder_id: source.folder_id,
        project_id: source.project_id ?? null,
        note_type: source.note_type,
      })
      setNotes([duplicatedNote, ...notes])
      setAllNotes((prev) => [duplicatedNote, ...prev])
      activateExistingNote(duplicatedNote)
    } catch (error) {
      console.error('Error duplicating note:', error)
      toast.push({
        title: 'Duplicate failed',
        description: 'Could not duplicate this note.',
        variant: 'error',
      })
    }
  }

  const handleMoveNote = async (noteId: string, newFolderId: string | null) => {
    try {
      const movedNote = await moveNote(noteId, newFolderId)
      await loadNotesInFolder(selectedFolderId)
      loadFolders()

      // Update project state based on the moved note's new project
      setSelectedProjectId(movedNote.project_id ?? null)

      // If the moved note was selected, update it
      if (selectedNote?.id === noteId) {
        activateExistingNote(movedNote)
      }

      // Show success toast with folder and project info
      const folderName =
        newFolderId === null
          ? 'All Notes (Root)'
          : folders.find((f) => f.id === newFolderId)?.name || 'Unknown folder'
      toast.push({
        title: 'Note moved',
        description: `"${movedNote.title || 'Untitled'}" moved to ${folderName}`,
        duration: 3000,
      })
    } catch (error) {
      console.error('Error moving note:', error)
      toast.push({
        title: 'Move failed',
        description: error instanceof Error ? error.message : 'Failed to move note',
        variant: 'error',
        duration: 5000,
      })
    }
  }

  const handleMoveNoteToProject = async (noteId: string, projectId: string | null) => {
    try {
      await moveNoteToProject(noteId, projectId)
      // Update allNotes
      setAllNotes(prev => prev.map(n => n.id === noteId ? { ...n, project_id: projectId } : n))
      // Update folder-scoped notes
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, project_id: projectId } : n))
      // If the moved note was selected, update it
      if (selectedNote?.id === noteId) {
        activateExistingNote({ ...selectedNote, project_id: projectId })
      }
      const projectName = projectId
        ? projects.find(p => p.id === projectId)?.name ?? 'Unknown'
        : 'Unfiled'
      toast.push({
        title: 'Note moved',
        description: `Moved to project "${projectName}"`,
        duration: 3000,
      })
    } catch (error) {
      console.error('Error moving note to project:', error)
      toast.push({ title: 'Move failed', description: 'Failed to move note to project', variant: 'error', duration: 5000 })
    }
  }

  // ---- Sidebar note deletion handler (from context menu) ----
  const handleSidebarDeleteNote = async (noteId: string) => {
    try {
      // Snapshot the note first so the deletion can be undone.
      const snapshot = await getNote(noteId).catch(() => null)
      await deleteNote(noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
      setAllNotes(prev => prev.filter(n => n.id !== noteId))
      // If the deleted note was selected, clear selection
      if (selectedNote?.id === noteId) {
        selectedNoteRef.current = null
        isCreatingNewSaveRef.current = false
        setSelectedNote(null)
        setIsCreatingNew(false)
      }

      if (snapshot) {
        toast.push({
          title: 'Note deleted',
          description: `"${snapshot.title || 'Untitled'}" was deleted.`,
          variant: 'warning',
          action: {
            label: 'Undo',
            onClick: () => {
              void restoreNoteSnapshot(snapshot)
            },
          },
        })
      }
    } catch (error) {
      console.error('Error deleting note:', error)
      toast.push({
        title: 'Delete failed',
        description: 'Failed to delete note',
        variant: 'error',
        duration: 5000,
      })
    }
  }

  return {
    handleSaveNote,
    handleDeleteNote,
    handleDuplicateNote,
    handleMoveNote,
    handleMoveNoteToProject,
    handleSidebarDeleteNote,
  }
}
