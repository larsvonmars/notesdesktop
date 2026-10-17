'use client'

import {
  Archive,
  ArrowRightLeft,
  Copy,
  Edit3,
  FileText,
  FolderInput,
  FolderPlus,
  LayoutDashboard,
  Palette,
  Trash2,
} from 'lucide-react'
import type { NoteSummary } from '@/lib/notes'
import type { Project } from '@/lib/projects'

export interface SidebarContextMenuState {
  x?: number
  y?: number
  type: 'folder' | 'note' | 'project'
  id: string
  name: string
  projectId?: string | null
}

export interface MovePickerRequest {
  type: 'note-to-folder' | 'note-to-project' | 'folder-to-project'
  id: string
  name: string
}

export interface DeleteRequest {
  type: 'project' | 'folder' | 'note'
  id: string
  name: string
}

export interface InlineRenameRequest {
  type: 'project' | 'folder'
  id: string
  value: string
}

interface SidebarContextMenuProps {
  contextMenu: SidebarContextMenuState
  projects: Project[]
  allNotes: NoteSummary[]
  onUpdateProjectColor?: (projectId: string, color: string) => void
  onOpenProjectDashboard?: (projectId: string) => void
  onArchiveProject?: (projectId: string) => void
  onCreateFolder: (parentId: string | null, projectId?: string | null) => void
  onNewNote: (noteType?: string, folderId?: string | null, projectId?: string | null) => void
  onDeleteProject?: (projectId: string) => void
  onMoveFolderToProject?: (folderId: string, projectId: string | null) => void
  onMoveFolder?: (folderId: string, newParentId: string | null) => void
  onDuplicateNote?: (note: NoteSummary) => void
  onMoveNote?: (noteId: string, newFolderId: string | null) => Promise<void>
  onMoveNoteToProject?: (noteId: string, projectId: string | null) => Promise<void>
  onDeleteNote?: (noteId: string) => void
  onInlineRename: (request: InlineRenameRequest) => void
  onOpenColorPicker: (projectId: string, currentColor: string) => void
  onOpenDeleteModal: (request: DeleteRequest) => void
  onOpenMovePicker: (request: MovePickerRequest) => void
  onClose: () => void
}

const NEUTRAL_DOT = '#8b8b8b'

/**
 * Context-menu body rendered inside the sidebar's positioned menu shell.
 * Kept separate from SidebarTree so the menu's three variants stay readable.
 */
export default function SidebarContextMenu({
  contextMenu,
  projects,
  allNotes,
  onUpdateProjectColor,
  onOpenProjectDashboard,
  onArchiveProject,
  onCreateFolder,
  onNewNote,
  onDeleteProject,
  onMoveFolderToProject,
  onMoveFolder,
  onDuplicateNote,
  onMoveNote,
  onMoveNoteToProject,
  onDeleteNote,
  onInlineRename,
  onOpenColorPicker,
  onOpenDeleteModal,
  onOpenMovePicker,
  onClose,
}: SidebarContextMenuProps) {
  const menuItem = 'flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[13px] transition-colors'
  const menuItemNormal = `${menuItem} text-foreground/80 hover:bg-surface-hover`
  const menuItemDanger = `${menuItem} text-danger hover:bg-danger-light`
  const menuDivider = 'mx-2 my-1 border-t border-border/60'

  return (
    <>
      {/* ---- PROJECT CONTEXT MENU ---- */}
      {contextMenu.type === 'project' && (
        <>
          <button
            onClick={() => {
              onInlineRename({ type: 'project', id: contextMenu.id, value: contextMenu.name })
              onClose()
            }}
            className={menuItemNormal}
          >
            <Edit3 size={14} className="shrink-0 text-muted/70" />
            <span className="font-medium">Rename project</span>
          </button>
          {onUpdateProjectColor && (
            <button
              onClick={() => {
                const project = projects.find(p => p.id === contextMenu.id)
                onOpenColorPicker(contextMenu.id, project?.color ?? NEUTRAL_DOT)
                onClose()
              }}
              className={menuItemNormal}
            >
              <Palette size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">Change color</span>
            </button>
          )}
          {onOpenProjectDashboard && (
            <button
              onClick={() => {
                onOpenProjectDashboard(contextMenu.id)
                onClose()
              }}
              className={menuItemNormal}
            >
              <LayoutDashboard size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">Open dashboard</span>
            </button>
          )}
          {onArchiveProject && (
            <button
              onClick={() => {
                onArchiveProject(contextMenu.id)
                onClose()
              }}
              className={menuItemNormal}
            >
              <Archive size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">Archive project</span>
            </button>
          )}
          <div className={menuDivider} />
          <button
            onClick={() => { onCreateFolder(null, contextMenu.id); onClose() }}
            className={menuItemNormal}
          >
            <FolderPlus size={14} className="shrink-0 text-muted/70" />
            <span className="font-medium">New folder</span>
          </button>
          <button
            onClick={() => { onNewNote(undefined, null, contextMenu.id); onClose() }}
            className={menuItemNormal}
          >
            <FileText size={14} className="shrink-0 text-muted/70" />
            <span className="font-medium">New note</span>
          </button>
          {onDeleteProject && (
            <>
              <div className={menuDivider} />
              <button
                onClick={() => {
                  onOpenDeleteModal({ type: 'project', id: contextMenu.id, name: contextMenu.name })
                  onClose()
                }}
                className={menuItemDanger}
              >
                <Trash2 size={14} className="shrink-0" />
                <span className="font-medium">Delete project</span>
              </button>
            </>
          )}
        </>
      )}

      {/* ---- FOLDER CONTEXT MENU ---- */}
      {contextMenu.type === 'folder' && (
        <>
          <button
            onClick={() => {
              onInlineRename({ type: 'folder', id: contextMenu.id, value: contextMenu.name })
              onClose()
            }}
            className={menuItemNormal}
          >
            <Edit3 size={14} className="shrink-0 text-muted/70" />
            <span className="font-medium">Rename</span>
          </button>
          <button
            onClick={() => { onCreateFolder(contextMenu.id, contextMenu.projectId); onClose() }}
            className={menuItemNormal}
          >
            <FolderPlus size={14} className="shrink-0 text-muted/70" />
            <span className="font-medium">New subfolder</span>
          </button>
          <button
            onClick={() => { onNewNote(undefined, contextMenu.id, contextMenu.projectId); onClose() }}
            className={menuItemNormal}
          >
            <FileText size={14} className="shrink-0 text-muted/70" />
            <span className="font-medium">New note here</span>
          </button>
          {(onMoveFolderToProject || onMoveFolder) && projects.length > 0 && (
            <>
              <div className={menuDivider} />
              <button
                onClick={() => {
                  onOpenMovePicker({ type: 'folder-to-project', id: contextMenu.id, name: contextMenu.name })
                  onClose()
                }}
                className={menuItemNormal}
              >
                <FolderInput size={14} className="shrink-0 text-muted/70" />
                <span className="font-medium">Move to project…</span>
              </button>
            </>
          )}
          <div className={menuDivider} />
          <button
            onClick={() => {
              onOpenDeleteModal({ type: 'folder', id: contextMenu.id, name: contextMenu.name })
              onClose()
            }}
            className={menuItemDanger}
          >
            <Trash2 size={14} className="shrink-0" />
            <span className="font-medium">Delete folder</span>
          </button>
        </>
      )}

      {/* ---- NOTE CONTEXT MENU ---- */}
      {contextMenu.type === 'note' && (
        <>
          {onDuplicateNote && (
            <button
              onClick={() => {
                const note = allNotes.find(n => n.id === contextMenu.id)
                if (note) onDuplicateNote(note)
                onClose()
              }}
              className={menuItemNormal}
            >
              <Copy size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">Duplicate note</span>
            </button>
          )}
          {onMoveNote && (
            <button
              onClick={() => {
                onOpenMovePicker({ type: 'note-to-folder', id: contextMenu.id, name: contextMenu.name })
                onClose()
              }}
              className={menuItemNormal}
            >
              <FolderInput size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">Move to folder…</span>
            </button>
          )}
          {onMoveNoteToProject && projects.length > 0 && (
            <button
              onClick={() => {
                onOpenMovePicker({ type: 'note-to-project', id: contextMenu.id, name: contextMenu.name })
                onClose()
              }}
              className={menuItemNormal}
            >
              <ArrowRightLeft size={14} className="shrink-0 text-muted/70" />
              <span className="font-medium">Move to project…</span>
            </button>
          )}
          {onDeleteNote && (
            <>
              <div className={menuDivider} />
              <button
                onClick={() => {
                  onOpenDeleteModal({ type: 'note', id: contextMenu.id, name: contextMenu.name })
                  onClose()
                }}
                className={menuItemDanger}
              >
                <Trash2 size={14} className="shrink-0" />
                <span className="font-medium">Delete note</span>
              </button>
            </>
          )}
        </>
      )}
    </>
  )
}
