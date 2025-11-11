'use client'

import { useMemo } from 'react'
import {
  X,
  FolderTree,
  FileText,
  ChevronRight,
  ArrowLeft,
  FilePlus2,
  NotebookPen,
  FolderPlus,
  FolderOpen,
  CalendarClock,
  PenTool,
  Network,
} from 'lucide-react'
import type { Folder } from '@/lib/folders'
import type { Note, NoteType } from '@/lib/notes'

interface FolderContentsModalProps {
  isOpen: boolean
  folder: Folder | null
  folders: Folder[]
  notes: Note[]
  onClose: () => void
  onOpenFolder?: (folderId: string) => void
  onOpenFolderInWorkspace?: (folderId: string) => void
  onSelectNote?: (note: Note) => void
  onCreateNote?: (noteType?: NoteType, folderId?: string | null, projectId?: string | null) => void
  onDuplicateNote?: (note: Note) => void
  onCreateSubfolder?: (parentId: string) => void
}

const updatedAtFormatter = new Intl.DateTimeFormat('default', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const noteTypeIcon = (type: NoteType) => {
  switch (type) {
    case 'mindmap':
      return <Network size={16} className="text-green-500" />
    case 'drawing':
      return <PenTool size={16} className="text-purple-500" />
    default:
      return <FileText size={16} className="text-blue-500" />
  }
}

export default function FolderContentsModal({
  isOpen,
  folder,
  folders,
  notes,
  onClose,
  onOpenFolder,
  onOpenFolderInWorkspace,
  onSelectNote,
  onCreateNote,
  onDuplicateNote,
  onCreateSubfolder,
}: FolderContentsModalProps) {
  const folderMap = useMemo(() => {
    const map = new Map<string, Folder>()
    folders.forEach((item) => map.set(item.id, item))
    return map
  }, [folders])

  const breadcrumb = useMemo(() => {
    if (!folder) return []
    const path: Folder[] = []
    let current: Folder | null | undefined = folder
    while (current) {
      path.unshift(current)
      current = current.parent_id ? folderMap.get(current.parent_id) ?? null : null
    }
    return path
  }, [folder, folderMap])

  const childFolders = useMemo(() => {
    if (!folder) return []
    return folders.filter((item) => item.parent_id === folder.id)
  }, [folder, folders])

  const noteCountsByFolder = useMemo(() => {
    const counts = new Map<string, number>()
    notes.forEach((note) => {
      if (!note.folder_id) return
      counts.set(note.folder_id, (counts.get(note.folder_id) ?? 0) + 1)
    })
    return counts
  }, [notes])

  const folderNotes = useMemo(() => {
    if (!folder) return []
    return notes
      .filter((note) => note.folder_id === folder.id)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [folder, notes])

  if (!isOpen || !folder) return null

  const projectId = folder.project_id ?? null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 sm:p-6">
      <div className="flex w-full max-w-4xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:max-h-[calc(100vh-4rem)]">
        <header className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Folder details</p>
            <h2 className="text-xl font-semibold text-gray-900">{folder.name}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <FolderTree size={14} />
                {childFolders.length} subfolder{childFolders.length === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText size={14} />
                {folderNotes.length} note{folderNotes.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {folder.parent_id && (
              <button
                type="button"
                onClick={() => onOpenFolder?.(folder.parent_id!)}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
              >
                <ArrowLeft size={16} />
                Parent folder
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onOpenFolderInWorkspace?.(folder.id)
              }}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
            >
              <FolderOpen size={16} />
              Open in workspace
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200"
            >
              <X size={16} />
              Close
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
            <button
              type="button"
              onClick={() => onClose()}
              className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              Workspace
            </button>
            <ChevronRight size={12} className="text-gray-400" />
            {breadcrumb.map((item, index) => {
              const isLast = index === breadcrumb.length - 1
              return (
                <div key={item.id} className="flex items-center gap-1">
                  {!isLast ? (
                    <button
                      type="button"
                      onClick={() => onOpenFolder?.(item.id)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    >
                      {item.name}
                    </button>
                  ) : (
                    <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                      {item.name}
                    </span>
                  )}
                  {!isLast && <ChevronRight size={12} className="text-gray-400" />}
                </div>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="flex flex-col rounded-2xl border border-gray-200 bg-gray-50">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Subfolders</h3>
                  <p className="text-xs text-gray-500">Folders nested inside this one</p>
                </div>
                <button
                  type="button"
                  onClick={() => onCreateSubfolder?.(folder.id)}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
                >
                  <FolderPlus size={14} />
                  New subfolder
                </button>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto px-4 py-3">
                {childFolders.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                    No subfolders yet.
                  </div>
                ) : (
                  childFolders.map((child) => (
                    <div key={child.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{child.name}</p>
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                            <FolderTree size={12} />
                            {noteCountsByFolder.get(child.id) ?? 0} notes
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenFolder?.(child.id)}
                          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          <FolderOpen size={14} />
                          View contents
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenFolderInWorkspace?.(child.id)}
                          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
                        >
                          Open in workspace
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="flex flex-col rounded-2xl border border-gray-200 bg-gray-50">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
                  <p className="text-xs text-gray-500">Notes stored in this folder</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onCreateNote?.('rich-text', folder.id, projectId)}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    <FilePlus2 size={14} />
                    New note
                  </button>
                  <button
                    type="button"
                    onClick={() => onCreateNote?.('mindmap', folder.id, projectId)}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
                  >
                    <NotebookPen size={14} />
                    New mind map
                  </button>
                </div>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto px-4 py-3">
                {folderNotes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                    No notes yet. Create one to get started.
                  </div>
                ) : (
                  folderNotes.map((note) => (
                    <div key={note.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                          {noteTypeIcon(note.note_type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">{note.title || 'Untitled note'}</p>
                          <p className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                            <CalendarClock size={12} />
                            Updated {updatedAtFormatter.format(new Date(note.updated_at))}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectNote?.(note)}
                          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          <FileText size={14} />
                          Open note
                        </button>
                        {onDuplicateNote && (
                          <button
                            type="button"
                            onClick={() => onDuplicateNote(note)}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
                          >
                            Duplicate
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
