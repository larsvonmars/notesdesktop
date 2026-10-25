import { FileText, Files, FolderOpen, Home, Layers, ListTodo } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { WorkspaceView } from '@/lib/workspace/types'

/**
 * Single source of truth for workspace view metadata.
 *
 * The rail, the mobile tab bar, the top bar and the keyboard shortcut help all
 * read labels/icons/shortcuts from here so navigation stays consistent.
 */
export interface ViewNavigationItem {
  /** Stable id used by components and tests. */
  id: 'home' | 'notes' | 'tasks' | 'files' | 'projects'
  /** Workspace view activated by this destination. */
  view: WorkspaceView
  label: string
  icon: LucideIcon
  /** Digit shown with the platform modifier (⌘1 / Ctrl+1). `null` = none. */
  shortcut: string | null
  description: string
}

/** Primary destinations shown in the desktop rail, in order. */
export const RAIL_DESTINATIONS: readonly ViewNavigationItem[] = [
  {
    id: 'home',
    view: 'welcome',
    label: 'Home',
    icon: Home,
    shortcut: '1',
    description: 'Today, recent notes and quick actions',
  },
  {
    id: 'notes',
    view: 'notes',
    label: 'Notes',
    icon: FileText,
    shortcut: '2',
    description: 'Browse and write your notes',
  },
  {
    id: 'tasks',
    view: 'tasks',
    label: 'Tasks',
    icon: ListTodo,
    shortcut: '3',
    description: 'Tasks and agenda',
  },
  {
    id: 'files',
    view: 'files',
    label: 'Files',
    icon: FolderOpen,
    shortcut: '4',
    description: 'Files attached to this workspace',
  },
]

/** Project dashboard is reachable from the library, not a rail destination. */
export const PROJECTS_VIEW: ViewNavigationItem = {
  id: 'projects',
  view: 'projects',
  label: 'Project',
  icon: Layers,
  shortcut: null,
  description: 'Project dashboard',
}

/** Destinations shown in the mobile bottom tab bar (search + more are actions). */
export const MOBILE_TAB_DESTINATIONS: readonly ViewNavigationItem[] = RAIL_DESTINATIONS

/** Every view that participates in navigation metadata. */
export const ALL_VIEW_NAVIGATION: readonly ViewNavigationItem[] = [
  ...RAIL_DESTINATIONS,
  PROJECTS_VIEW,
]

/** Resolve metadata for a workspace view. */
export function getViewNavigation(view: WorkspaceView): ViewNavigationItem | null {
  return ALL_VIEW_NAVIGATION.find((item) => item.view === view) ?? null
}

/** Resolve metadata by stable destination id. */
export function getViewNavigationById(id: ViewNavigationItem['id']): ViewNavigationItem | null {
  return ALL_VIEW_NAVIGATION.find((item) => item.id === id) ?? null
}

/** Human label for a view, used by breadcrumbs and compact top bars. */
export function getViewLabel(view: WorkspaceView): string {
  return getViewNavigation(view)?.label ?? 'Workspace'
}

/** True when the view has a rail destination (Home/Notes/Tasks/Files). */
export function isPrimaryView(view: WorkspaceView): boolean {
  return RAIL_DESTINATIONS.some((item) => item.view === view)
}

/** Icons re-exported for breadcrumbs so callers don't re-import lucide. */
export const VIEW_ICONS = {
  home: Home,
  notes: FileText,
  tasks: ListTodo,
  files: Files,
  folder: FolderOpen,
  project: Layers,
} satisfies Record<string, LucideIcon>
