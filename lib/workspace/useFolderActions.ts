'use client'

import { useRef, useState } from 'react'
import {
  createFolder,
  deleteFolder,
  moveFolder,
  updateFolder,
  type Folder,
} from '@/lib/folders'
import { moveFolderToProject } from '@/lib/projects'
import type { NoteSummary } from '@/lib/notes'
import type { ToastLike } from '@/lib/workspace/types'
import { captureDeletedFolder, restoreDeletedFolder } from '@/lib/workspace/folderSnapshot'

export interface FolderActionsOptions {
  folders: Folder[]
  allNotes: NoteSummary[]
  selectedFolderId: string | null
  loadFolders: () => Promise<void>
  loadNotesInFolder: (folderId: string | null) => Promise<void>
  loadAllNotes: () => Promise<void>
  applyFolderSelection: (folderId: string | null) => void
  toast: ToastLike
}

/**
 * Folder mutations plus the create-folder modal state that drives them.
 */
export function useFolderActions({
  folders,
  allNotes,
  selectedFolderId,
  loadFolders,
  loadNotesInFolder,
  loadAllNotes,
  applyFolderSelection,
  toast,
}: FolderActionsOptions) {
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null)
  const [createFolderProjectId, setCreateFolderProjectId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const createFolderInputRef = useRef<HTMLInputElement | null>(null)

  // Open an in-app modal to create a folder. This replaces window.prompt which
  // doesn't appear in some WebViews (notably Tauri on macOS).
  const handleCreateFolder = async (parentId: string | null, projectId?: string | null) => {
    setCreateFolderParentId(parentId)
    setCreateFolderProjectId(projectId ?? null)
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
      toast.push({ title: 'Name too long', description: 'Folder names can be at most 100 characters.', variant: 'warning' })
      return
    }

    // Check for duplicate folder names at the same level within the same project
    const siblings = folders.filter((f) => {
      if (f.parent_id !== (createFolderParentId ?? null)) return false
      if ((f.project_id ?? null) !== (createFolderProjectId ?? null)) return false
      return true
    })

    if (siblings.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      toast.push({
        title: 'Folder already exists',
        description: 'A folder with this name already exists at this level.',
        variant: 'warning',
      })
      return
    }

    try {
      await createFolder({ name, parent_id: createFolderParentId, project_id: createFolderProjectId })
      setShowCreateFolderModal(false)
      setNewFolderName('')
      setCreateFolderParentId(null)
      setCreateFolderProjectId(null)
      loadFolders()
    } catch (error) {
      console.error('Error creating folder:', error)
      // keep modal open so user can retry
      toast.push({
        title: 'Could not create folder',
        description: 'Please try again.',
        variant: 'error',
      })
    }
  }

  const cancelCreateFolder = () => {
    setShowCreateFolderModal(false)
    setNewFolderName('')
    setCreateFolderParentId(null)
    setCreateFolderProjectId(null)
  }

  const handleRenameFolder = async (folderId: string, newName: string) => {
    const trimmedName = newName.trim()
    if (!trimmedName) {
      toast.push({ title: 'Name required', description: 'Folder name cannot be empty.', variant: 'warning' })
      return
    }

    if (trimmedName.length > 100) {
      toast.push({ title: 'Name too long', description: 'Folder names can be at most 100 characters.', variant: 'warning' })
      return
    }

    // Find the folder being renamed to check siblings within the same project
    const folderToRename = folders.find((f) => f.id === folderId)
    if (folderToRename) {
      const siblings = folders.filter(
        (f) => f.parent_id === folderToRename.parent_id && f.id !== folderId && (f.project_id ?? null) === (folderToRename.project_id ?? null)
      )

      if (siblings.some((f) => f.name.toLowerCase() === trimmedName.toLowerCase())) {
        toast.push({
          title: 'Folder already exists',
          description: 'A folder with this name already exists at this level.',
          variant: 'warning',
        })
        return
      }
    }

    try {
      await updateFolder(folderId, { name: trimmedName })
      loadFolders()
    } catch (error) {
      console.error('Error renaming folder:', error)
      toast.push({
        title: 'Rename failed',
        description: 'Could not rename this folder. Please try again.',
        variant: 'error',
      })
    }
  }

  const handleDeleteFolder = async (folderId: string) => {
    try {
      // Snapshot the subtree + note bodies first so the delete can be undone.
      const snapshot = await captureDeletedFolder(folderId, folders, allNotes).catch(() => null)

      await deleteFolder(folderId)
      if (selectedFolderId === folderId) {
        applyFolderSelection(null)
      }
      loadFolders()
      loadNotesInFolder(selectedFolderId)

      if (snapshot && snapshot.folders.length > 0) {
        const rootName = snapshot.folders[0].name
        const noteCount = snapshot.notes.length
        toast.push({
          title: 'Folder deleted',
          description:
            noteCount > 0
              ? `"${rootName}" and ${noteCount} note${noteCount === 1 ? '' : 's'} were deleted.`
              : `"${rootName}" was deleted.`,
          variant: 'warning',
          action: {
            label: 'Undo',
            onClick: () => {
              void (async () => {
                try {
                  const restoredId = await restoreDeletedFolder(snapshot)
                  await loadFolders()
                  await loadAllNotes()
                  if (restoredId) applyFolderSelection(restoredId)
                  toast.push({
                    title: 'Folder restored',
                    description: `"${rootName}" is back in your workspace.`,
                    variant: 'success',
                  })
                } catch (restoreError) {
                  console.error('Error restoring folder:', restoreError)
                  toast.push({
                    title: 'Restore failed',
                    description: 'Could not restore this folder.',
                    variant: 'error',
                  })
                }
              })()
            },
          },
        })
      }
    } catch (error) {
      console.error('Error deleting folder:', error)
      toast.push({ title: 'Delete failed', description: 'Could not delete this folder.', variant: 'error' })
    }
  }

  const handleMoveFolder = async (folderId: string, newParentId: string | null) => {
    try {
      await moveFolder(folderId, newParentId)
      loadFolders()
      toast.push({
        title: 'Folder moved',
        description: 'Folder has been moved successfully.',
        duration: 3000,
      })
    } catch (error) {
      console.error('Error moving folder:', error)
      const message = error instanceof Error ? error.message : 'Failed to move folder'
      toast.push({
        title: 'Move failed',
        description: message,
        duration: 5000,
      })
    }
  }

  const handleMoveFolderToProject = async (folderId: string, projectId: string | null) => {
    try {
      await moveFolderToProject(folderId, projectId)
      loadFolders()
      loadAllNotes()
      toast.push({
        title: 'Folder moved',
        description: 'Folder has been moved to the project.',
        duration: 3000,
      })
    } catch (error) {
      console.error('Error moving folder to project:', error)
      toast.push({
        title: 'Move failed',
        description: error instanceof Error ? error.message : 'Failed to move folder',
        duration: 5000,
      })
    }
  }

  return {
    showCreateFolderModal,
    createFolderParentId,
    newFolderName,
    setNewFolderName,
    createFolderInputRef,
    handleCreateFolder,
    confirmCreateFolder,
    cancelCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveFolder,
    handleMoveFolderToProject,
  }
}
