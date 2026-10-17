'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import type { Folder } from '@/lib/folders'
import type { Note, NoteSummary } from '@/lib/notes'
import {
  archiveProject,
  createProject,
  deleteProject,
  moveFolderToProject,
  moveNoteToProject,
  restoreProject,
  updateProject,
  type Project,
} from '@/lib/projects'
import type { ToastLike, WorkspaceView } from '@/lib/workspace/types'

export interface ProjectActionsOptions {
  projects: Project[]
  selectedProjectId: string | null
  selectedNote: Note | null
  selectedFolderId: string | null
  folders: Folder[]
  notes: NoteSummary[]
  activeView: WorkspaceView
  setProjects: Dispatch<SetStateAction<Project[]>>
  setArchivedProjects: Dispatch<SetStateAction<Project[]>>
  setSelectedProjectId: Dispatch<SetStateAction<string | null>>
  applyFolderSelection: (folderId: string | null) => void
  setActiveView: Dispatch<SetStateAction<WorkspaceView>>
  loadFolders: () => Promise<void>
  loadAllNotes: () => Promise<void>
  toast: ToastLike
}

/**
 * Project CRUD, archive/restore and the create-project modal state.
 */
export function useProjectActions({
  projects,
  selectedProjectId,
  selectedNote,
  selectedFolderId,
  folders,
  notes,
  activeView,
  setProjects,
  setArchivedProjects,
  setSelectedProjectId,
  applyFolderSelection,
  setActiveView,
  loadFolders,
  loadAllNotes,
  toast,
}: ProjectActionsOptions) {
  // New-project modal state (name + color are chosen before the project is created)
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)

  // Opens the creation modal so the user can name the project and pick a color first.
  const handleCreateProject = () => {
    setShowNewProjectModal(true)
  }

  const handleConfirmCreateProject = async ({ name, color }: { name: string; color: string }) => {
    try {
      const newProject = await createProject({ name, color })
      setProjects(prev => [...prev, newProject])
      toast.push({ title: 'Project created', description: `"${newProject.name}" created`, duration: 3000 })
    } catch (error) {
      console.error('Error creating project:', error)
      toast.push({ title: 'Error', description: 'Failed to create project', duration: 5000 })
      // Re-throw so the modal stays open and the entered name/color are kept.
      throw error
    }
  }

  const handleRenameProject = async (projectId: string, newName: string) => {
    try {
      const updated = await updateProject(projectId, { name: newName })
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p))
      toast.push({ title: 'Project renamed', description: `Renamed to "${newName}"`, duration: 3000 })
    } catch (error) {
      console.error('Error renaming project:', error)
      toast.push({ title: 'Error', description: 'Failed to rename project', duration: 5000 })
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find((candidate) => candidate.id === projectId)
    // Deleting a project moves its folders/notes to Unfiled, so remember them
    // to re-associate everything if the user undoes the deletion.
    const folderIds = folders.filter((folder) => folder.project_id === projectId).map((folder) => folder.id)
    const noteIds = notes.filter((note) => note.project_id === projectId).map((note) => note.id)

    try {
      await deleteProject(projectId)
      setProjects(prev => prev.filter(p => p.id !== projectId))
      // If we were viewing the deleted project, reset selection
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null)
      }
      // Reload folders and notes since they may have been orphaned
      loadFolders()
      loadAllNotes()

      if (project) {
        toast.push({
          title: 'Project deleted',
          description: `"${project.name}" and its structure were removed.`,
          variant: 'warning',
          action: {
            label: 'Undo',
            onClick: () => {
              void (async () => {
                try {
                  const restored = await createProject({
                    name: project.name,
                    description: project.description,
                    color: project.color,
                  })
                  for (const folderId of folderIds) {
                    await moveFolderToProject(folderId, restored.id)
                  }
                  for (const noteId of noteIds) {
                    await moveNoteToProject(noteId, restored.id)
                  }
                  setProjects(prev => [...prev.filter(p => p.id !== restored.id), restored])
                  await loadFolders()
                  await loadAllNotes()
                  toast.push({
                    title: 'Project restored',
                    description: `"${restored.name}" is back with its folders and notes.`,
                    variant: 'success',
                  })
                } catch (restoreError) {
                  console.error('Error restoring project:', restoreError)
                  toast.push({
                    title: 'Restore failed',
                    description: 'Could not restore this project.',
                    variant: 'error',
                  })
                }
              })()
            },
          },
        })
      }
    } catch (error) {
      console.error('Error deleting project:', error)
      toast.push({ title: 'Error', description: 'Failed to delete project', variant: 'error', duration: 5000 })
    }
  }

  const handleUpdateProjectColor = async (projectId: string, color: string) => {
    try {
      const updated = await updateProject(projectId, { color })
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p))
    } catch (error) {
      console.error('Error updating project color:', error)
      toast.push({ title: 'Error', description: 'Failed to update project color', duration: 5000 })
    }
  }

  const handleArchiveProject = async (projectId: string) => {
    try {
      const archived = await archiveProject(projectId)
      setProjects(prev => prev.filter(p => p.id !== projectId))
      setArchivedProjects(prev => [archived, ...prev])

      // If the archived project was open (dashboard, folder, or note), reset to root.
      const folderInProject = selectedFolderId
        ? folders.find(f => f.id === selectedFolderId)?.project_id === projectId
        : false
      if (
        selectedProjectId === projectId ||
        selectedNote?.project_id === projectId ||
        folderInProject
      ) {
        applyFolderSelection(null)
        if (activeView === 'projects') setActiveView('notes')
      }

      loadFolders()
      loadAllNotes()
      toast.push({
        title: 'Project archived',
        description: `"${archived.name}" was moved to Archive`,
        duration: 3000,
      })
    } catch (error) {
      console.error('Error archiving project:', error)
      toast.push({ title: 'Error', description: 'Failed to archive project', duration: 5000 })
    }
  }

  const handleRestoreProject = async (projectId: string) => {
    try {
      const restored = await restoreProject(projectId)
      setArchivedProjects(prev => prev.filter(p => p.id !== projectId))
      setProjects(prev =>
        [...prev.filter(p => p.id !== projectId), restored].sort((a, b) => a.position - b.position)
      )
      loadFolders()
      loadAllNotes()
      toast.push({
        title: 'Project restored',
        description: `"${restored.name}" is back in your workspace`,
        duration: 3000,
      })
    } catch (error) {
      console.error('Error restoring project:', error)
      toast.push({ title: 'Error', description: 'Failed to restore project', duration: 5000 })
    }
  }

  const handleDeleteArchivedProject = async (projectId: string) => {
    try {
      await deleteProject(projectId)
      setArchivedProjects(prev => prev.filter(p => p.id !== projectId))
      loadFolders()
      loadAllNotes()
      toast.push({
        title: 'Project deleted',
        description: 'Its folders and notes were moved to Unfiled',
        duration: 3000,
      })
    } catch (error) {
      console.error('Error deleting archived project:', error)
      toast.push({ title: 'Error', description: 'Failed to delete project', duration: 5000 })
    }
  }

  return {
    showNewProjectModal,
    setShowNewProjectModal,
    handleCreateProject,
    handleConfirmCreateProject,
    handleRenameProject,
    handleDeleteProject,
    handleUpdateProjectColor,
    handleArchiveProject,
    handleRestoreProject,
    handleDeleteArchivedProject,
  }
}
