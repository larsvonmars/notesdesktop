'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  applyRealtimeNote,
  getAllNoteSummaries,
  getNotesByFolder,
  subscribeToNotes,
  type NoteSummary,
} from '@/lib/notes'
import {
  applyRealtimeFolder,
  buildFolderTree,
  getFolders,
  subscribeToFolders,
  type Folder,
  type FolderNode,
} from '@/lib/folders'
import { subscribeToDataChanges } from '@/lib/offline/events'
import { hasPendingMutation } from '@/lib/offline/queue'
import {
  getArchivedProjects,
  getProjects,
  subscribeToProjects,
  type Project,
} from '@/lib/projects'

export interface WorkspaceDataOptions {
  userId: string | undefined
  selectedFolderId: string | null
  /** Set while a local autosave is in flight so the echo is ignored. */
  suppressRealtimeRef: MutableRefObject<boolean>
}

/**
 * Owns every server-derived collection in the workspace: notes, folders,
 * projects and their loading flags, plus the realtime subscriptions that keep
 * them fresh. The shell only supplies selection state.
 */
export function useWorkspaceData({
  userId,
  selectedFolderId,
  suppressRealtimeRef,
}: WorkspaceDataOptions) {
  const [notes, setNotes] = useState<NoteSummary[]>([])
  // Subset of `notes` across every folder, used by the sidebar, AI context and
  // dashboards. Bodies are intentionally not loaded here.
  const [allNotes, setAllNotes] = useState<NoteSummary[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [folderTree, setFolderTree] = useState<FolderNode[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([])
  const [isLoadingNotes, setIsLoadingNotes] = useState(true)
  const [isLoadingFolders, setIsLoadingFolders] = useState(true)
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [isLoadingAllNotes, setIsLoadingAllNotes] = useState(true)

  const archivedProjectIds = useMemo(
    () => new Set(archivedProjects.map((project) => project.id)),
    [archivedProjects]
  )
  const archivedProjectIdsRef = useRef<Set<string>>(new Set())
  archivedProjectIdsRef.current = archivedProjectIds

  // Filter out folders/notes that belong to archived projects so they never
  // surface in the active workspace (recent, search, tree, folder lists).
  const filterOutArchivedContent = useCallback(<T extends { project_id: string | null }>(items: T[]): T[] => {
    const ids = archivedProjectIdsRef.current
    if (ids.size === 0) return items
    return items.filter((item) => !item.project_id || !ids.has(item.project_id))
  }, [])

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await getProjects())
    } catch (error) {
      console.error('Error loading projects:', error)
    } finally {
      setIsLoadingProjects(false)
    }
  }, [])

  const loadArchivedProjects = useCallback(async () => {
    try {
      setArchivedProjects(await getArchivedProjects())
    } catch (error) {
      console.error('Error loading archived projects:', error)
    }
  }, [])

  const loadFolders = useCallback(async () => {
    try {
      const fetchedFolders = filterOutArchivedContent(await getFolders())
      setFolders(fetchedFolders)
      setFolderTree(buildFolderTree(fetchedFolders))
    } catch (error) {
      console.error('Error loading folders:', error)
    } finally {
      setIsLoadingFolders(false)
    }
  }, [filterOutArchivedContent])

  const loadNotesInFolder = useCallback(async (folderId: string | null) => {
    try {
      setIsLoadingNotes(true)
      setNotes(filterOutArchivedContent(await getNotesByFolder(folderId)))
    } catch (error) {
      console.error('Error loading notes:', error)
    } finally {
      setIsLoadingNotes(false)
    }
  }, [filterOutArchivedContent])

  // Load note metadata for AI tool calling, the sidebar and dashboards.
  // Bodies are fetched on demand (getNote) so login does not download them all.
  const loadAllNotes = useCallback(async () => {
    try {
      setAllNotes(filterOutArchivedContent(await getAllNoteSummaries()))
    } catch (error) {
      console.error('Error loading all notes:', error)
    } finally {
      setIsLoadingAllNotes(false)
    }
  }, [filterOutArchivedContent])

  useEffect(() => {
    if (!userId) return
    loadFolders()
    loadProjects()
    loadArchivedProjects()
  }, [userId, loadFolders, loadProjects, loadArchivedProjects])

  useEffect(() => {
    if (userId) loadAllNotes()
  }, [userId, loadAllNotes])

  useEffect(() => {
    if (userId) loadNotesInFolder(selectedFolderId)
  }, [userId, selectedFolderId, loadNotesInFolder])

  // Subscribe to real-time note changes for the currently selected folder.
  useEffect(() => {
    if (!userId) return

    type RealtimeNoteRow = NoteSummary & { content?: string }
    type RealtimePayload = {
      eventType?: string
      new?: RealtimeNoteRow
      old?: { id?: string }
    }

    const unsubscribeNotes = subscribeToNotes(userId, (payload) => {
      try {
        const { eventType, new: newRow, old: oldRow } = payload as RealtimePayload
        // If we're suppressing realtime reloads (e.g. an autosave just happened), ignore
        if (suppressRealtimeRef.current) return

        // A local write not yet acknowledged by the server always wins over the
        // realtime echo of an older row.
        if (newRow && hasPendingMutation('notes', newRow.id)) return

        // Keep notes belonging to archived projects out of the active workspace.
        if (
          newRow?.project_id &&
          archivedProjectIdsRef.current.has(newRow.project_id)
        ) {
          if (eventType === 'INSERT') return
          if (eventType === 'UPDATE') {
            setAllNotes((prev) => prev.filter((n) => n.id !== newRow.id))
            setNotes((prev) => prev.filter((n) => n.id !== newRow.id))
            return
          }
        }

        const belongsInCurrentFolder = (note: NoteSummary) => {
          if (selectedFolderId === null) return note.folder_id === null
          return note.folder_id === selectedFolderId
        }

        if (eventType === 'INSERT') {
          if (newRow) {
            void applyRealtimeNote(newRow).catch(() => {})
            setAllNotes((prev) => {
              if (prev.some((n) => n.id === newRow.id)) return prev
              return [newRow, ...prev]
            })
            if (belongsInCurrentFolder(newRow)) {
              setNotes((prev) => {
                if (prev.some((n) => n.id === newRow.id)) return prev
                return [newRow, ...prev]
              })
            }
          }
        } else if (eventType === 'UPDATE') {
          if (newRow) {
            void applyRealtimeNote(newRow).catch(() => {})
            setAllNotes((prev) => {
              const exists = prev.some((n) => n.id === newRow.id)
              if (exists) return prev.map((n) => (n.id === newRow.id ? newRow : n))
              return [newRow, ...prev]
            })
            setNotes((prev) => {
              const exists = prev.some((n) => n.id === newRow.id)
              if (exists) return prev.map((n) => (n.id === newRow.id ? newRow : n))
              if (belongsInCurrentFolder(newRow)) return [newRow, ...prev]
              return prev
            })
          }
        } else if (eventType === 'DELETE') {
          if (oldRow?.id) {
            void applyRealtimeNote(null, oldRow.id).catch(() => {})
            setAllNotes((prev) => prev.filter((n) => n.id !== oldRow.id))
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

    const unsubscribeFolders = subscribeToFolders(userId, (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload as {
        eventType?: string
        new?: Folder
        old?: { id?: string }
      }
      if (newRow) void applyRealtimeFolder(newRow).catch(() => {})
      else if (eventType === 'DELETE' && oldRow?.id) {
        void applyRealtimeFolder(null, oldRow.id).catch(() => {})
      }
      loadFolders()
    })

    return () => {
      unsubscribeNotes()
      unsubscribeFolders()
    }
  }, [userId, selectedFolderId, suppressRealtimeRef, loadFolders, loadNotesInFolder])

  // Refresh React state whenever the offline cache changes (optimistic write,
  // sync completion, or background refresh), debounced to coalesce bursts.
  useEffect(() => {
    if (!userId) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = subscribeToDataChanges(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void loadNotesInFolder(selectedFolderId)
        void loadAllNotes()
        void loadFolders()
      }, 120)
    })

    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [userId, selectedFolderId, loadNotesInFolder, loadAllNotes, loadFolders])

  // Subscribe to real-time project changes
  useEffect(() => {
    if (!userId) return
    const unsubscribeProjects = subscribeToProjects(userId, () => {
      loadProjects()
      loadArchivedProjects()
      loadFolders()
      loadAllNotes()
    })
    return () => {
      unsubscribeProjects()
    }
  }, [userId, loadProjects, loadArchivedProjects, loadFolders, loadAllNotes])

  return {
    notes,
    setNotes,
    allNotes,
    setAllNotes,
    folders,
    setFolders,
    folderTree,
    setFolderTree,
    projects,
    setProjects,
    archivedProjects,
    setArchivedProjects,
    archivedProjectIds,
    isLoadingNotes,
    isLoadingFolders,
    isLoadingProjects,
    isLoadingAllNotes,
    filterOutArchivedContent,
    loadProjects,
    loadArchivedProjects,
    loadFolders,
    loadNotesInFolder,
    loadAllNotes,
  }
}

export type WorkspaceData = ReturnType<typeof useWorkspaceData>
