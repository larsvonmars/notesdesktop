'use client'

import type { ComponentProps, TouchEvent } from 'react'
import { FileText, FolderOpen, Home, ListTodo, LogOut, X } from 'lucide-react'
import SidebarTree from '@/components/SidebarTree'
import type { NoteSummary } from '@/lib/notes'
import type { WorkspaceView } from '@/lib/workspace/types'

type TreeProps = ComponentProps<typeof SidebarTree>
type OwnedTreeProps = 'collapsed' | 'onToggleCollapsed' | 'dense' | 'showHeader'
type InjectedTreeProps = 'onOpenProjectDashboard' | 'onOpenFileExplorer' | 'onOpenArchive' | 'onOpenSettings' | 'onOpenWelcome' | 'onOpenTasks' | 'onOpenCommandPalette'

interface WorkspaceSidebarProps {
  isMobile: boolean
  activeView: WorkspaceView
  sidebarCollapsed: boolean
  mobileOpen: boolean
  /**
   * Tree props minus the ones this component owns: navigation callbacks are
   * wrapped here so both layouts close/move the mobile drawer consistently.
   */
  treeProps: Omit<TreeProps, OwnedTreeProps | InjectedTreeProps>
  onSwitchView: (view: WorkspaceView) => void
  onToggleCollapsed: () => void
  onCloseMobileNav: () => void
  onEnsureNotesView: () => void
  onOpenProjectDashboard: (projectId: string) => void
  onOpenFileExplorer: () => void
  onOpenArchive: () => void
  onOpenSettings: () => void
  onOpenWelcome: () => void
  onOpenTasks: () => void
  onOpenCommandPalette: () => void
  onSignOut: () => void
  onMobileTouchStart?: (clientX: number, clientY: number) => void
  onMobileTouchEnd?: (clientX: number, clientY: number) => void
}

export default function WorkspaceSidebar({
  isMobile,
  activeView,
  sidebarCollapsed,
  mobileOpen,
  treeProps,
  onSwitchView,
  onToggleCollapsed,
  onCloseMobileNav,
  onEnsureNotesView,
  onOpenProjectDashboard,
  onOpenFileExplorer,
  onOpenArchive,
  onOpenSettings,
  onOpenWelcome,
  onOpenTasks,
  onOpenCommandPalette,
  onSignOut,
  onMobileTouchStart,
  onMobileTouchEnd,
}: WorkspaceSidebarProps) {
  const sharedTreeProps: Omit<TreeProps, OwnedTreeProps> = {
    ...treeProps,
    onSelectNote: (note: NoteSummary) => {
      treeProps.onSelectNote(note)
      onEnsureNotesView()
    },
    onNewNote: (noteType?: string, folderId?: string | null, projectId?: string | null) => {
      onEnsureNotesView()
      treeProps.onNewNote(noteType, folderId, projectId)
    },
    onOpenProjectDashboard: (projectId: string) => {
      onOpenProjectDashboard(projectId)
    },
    onOpenFileExplorer: () => {
      onOpenFileExplorer()
    },
    onOpenArchive: () => {
      onOpenArchive()
    },
    onOpenSettings: () => {
      onOpenSettings()
      onCloseMobileNav()
    },
    onOpenWelcome: () => {
      onOpenWelcome()
      onCloseMobileNav()
    },
    onOpenTasks: () => {
      onOpenTasks()
      onCloseMobileNav()
    },
    onOpenCommandPalette: () => {
      onOpenCommandPalette()
      onCloseMobileNav()
    },
  }

  if (!isMobile) {
    return (
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border/60 bg-surface transition-[width] duration-300 ease-out ${
          sidebarCollapsed ? 'w-16' : 'w-[300px]'
        }`}
      >
        <SidebarTree
          {...sharedTreeProps}
          dense
          collapsed={sidebarCollapsed}
          onToggleCollapsed={onToggleCollapsed}
        />
      </aside>
    )
  }

  if (!mobileOpen) return null

  const swipeHandlers = {
    onTouchStart: (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      onMobileTouchStart?.(touch.clientX, touch.clientY)
    },
    onTouchEnd: (event: TouchEvent) => {
      const touch = event.changedTouches[0]
      if (!touch) return
      onMobileTouchEnd?.(touch.clientX, touch.clientY)
    },
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onCloseMobileNav} {...swipeHandlers} />
      <aside
        className="safe-top fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col border-r border-border/60 bg-surface shadow-2xl"
        {...swipeHandlers}
      >
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
          <img
            src="/icon-192.png"
            alt="MindViz Notes"
            className="h-[22px] w-[22px] shrink-0 rounded-[6px] object-contain"
          />
          <span className="flex-1 truncate text-[13px] font-semibold text-foreground/90">
            MindViz Notes
          </span>
          <button
            onClick={onCloseMobileNav}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted/70 transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="Close navigation"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 px-3 pb-2">
          {([
            { key: 'welcome' as WorkspaceView, label: 'Home', icon: Home },
            { key: 'notes' as WorkspaceView, label: 'Notes', icon: FileText },
            { key: 'tasks' as WorkspaceView, label: 'Tasks', icon: ListTodo },
            { key: 'files' as WorkspaceView, label: 'Files', icon: FolderOpen },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                if (key === 'welcome') {
                  onOpenWelcome()
                } else {
                  onSwitchView(key)
                }
                onCloseMobileNav()
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
                activeView === key
                  ? 'bg-surface-active/70 text-foreground'
                  : 'text-muted/70 hover:bg-surface-hover hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <SidebarTree
            {...sharedTreeProps}
            collapsed={false}
            onToggleCollapsed={onCloseMobileNav}
            showHeader={false}
          />
        </div>

        <div className="shrink-0 border-t border-border/60 px-2 py-2">
          <button
            onClick={onSignOut}
            className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium text-muted/80 transition-colors hover:bg-danger-light hover:text-danger"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="truncate">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
