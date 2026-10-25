import type { LucideIcon } from 'lucide-react'
import type { NoteSummary, NoteType } from '@/lib/notes'
import type { WorkspaceView } from '@/lib/workspace/types'

/**
 * Shared, presentational-only types for the app shell.
 *
 * Everything under `components/shell/*` is data-in / callbacks-out: no data
 * fetching, no auth and no Supabase imports. The Lead wires real state into
 * these components from `components/WorkspaceShell.tsx`.
 */

/** A primary destination rendered by the rail and the mobile tab bar. */
export interface ShellDestination {
  /** Stable id used by tests/analytics. */
  id: string
  /** Workspace view this destination activates. */
  view: WorkspaceView
  label: string
  icon: LucideIcon
  /** Single character used with the platform modifier, e.g. `'1'` → ⌘1. */
  shortcut?: string | null
  description?: string
}

/** One segment of the top-bar breadcrumb trail (Home / Project / Folder / Note). */
export interface Breadcrumb {
  id: string
  label: string
  icon?: LucideIcon
  /** When provided the crumb becomes an interactive button. */
  onClick?: () => void
  /** Accent colour dot, used for project crumbs. */
  color?: string | null
}

/** Sort order for the note list pane. */
export type NoteListSort = 'updated' | 'created' | 'title'

/** Row density for the note list pane. */
export type NoteListDensity = 'comfortable' | 'compact'

export type NoteListGroupId = 'today' | 'yesterday' | 'previous-7-days' | 'older' | 'all'

/** A date bucket rendered by {@link NoteListGroup}. */
export interface NoteListGroup {
  id: NoteListGroupId
  label: string
  notes: NoteSummary[]
}

/** Minimal folder shape used to resolve a note's location label. */
export interface NoteListFolderRef {
  id: string
  name: string
}

/** Minimal project shape used to resolve a note's location label. */
export interface NoteListProjectRef {
  id: string
  name: string
}

/** A single action in the top bar overflow menu. */
export interface TopBarMenuItem {
  id: string
  label: string
  icon?: LucideIcon
  shortcut?: string
  onSelect: () => void
  /** Renders in danger colours (e.g. destructive actions). */
  danger?: boolean
}

/** Serializable shell location used by the navigation history. */
export interface ShellLocation {
  view: WorkspaceView
  folderId: string | null
  projectId: string | null
  noteId: string | null
}

/** Identity displayed by the rail avatar + signed-in drawer footer. */
export interface ShellUser {
  name?: string | null
  email?: string | null
  avatarUrl?: string | null
}

/** Note-type presentation helper shared by the list, chips and menus. */
export interface NoteTypeVisual {
  type: NoteType
  label: string
  icon: LucideIcon
  /** Tinted square background classes (theme aware). */
  tileClassName: string
  /** Icon colour classes (theme aware). */
  iconClassName: string
}
