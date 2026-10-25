'use client'

import { useEffect, type ComponentProps, type TouchEvent } from 'react'
import {
  LogOut,
  Moon,
  PanelLeftOpen,
  Settings,
  Sun,
  UserRound,
  X,
} from 'lucide-react'
import SidebarTree from '@/components/SidebarTree'
import AppRail from '@/components/shell/AppRail'
import { cn, getInitials } from '@/components/shell/utils'
import type { NoteSummary } from '@/lib/notes'
import { formatModShortcut } from '@/lib/platform'
import { useTheme } from '@/lib/theme-context'
import type { WorkspaceView } from '@/lib/workspace/types'

type TreeProps = ComponentProps<typeof SidebarTree>
type OwnedTreeProps = 'collapsed' | 'onToggleCollapsed' | 'dense' | 'showHeader'
type InjectedTreeProps =
  | 'onOpenProjectDashboard'
  | 'onOpenFileExplorer'
  | 'onOpenArchive'
  | 'onOpenSettings'
  | 'onOpenWelcome'
  | 'onOpenTasks'
  | 'onOpenCommandPalette'

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
  /** Optional identity for the rail avatar + drawer footer. */
  userName?: string | null
  userEmail?: string | null
}

/**
 * Composition layer for workspace navigation.
 *
 * Desktop: 68px AppRail + the glass library pane (SidebarTree supplies its own
 * header, including the collapse control). Collapsing hides the whole pane and
 * reveals a floating expand affordance.
 *
 * Mobile: the same SidebarTree inside a drawer over a scrim. No rail — the
 * MobileTabBar rendered by WorkspaceShell owns global navigation.
 */
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
  onOpenSettings,
  onOpenWelcome,
  onOpenCommandPalette,
  onSignOut,
  onMobileTouchStart,
  onMobileTouchEnd,
  userName,
  userEmail,
}: WorkspaceSidebarProps) {
  const { resolvedTheme, toggleTheme } = useTheme()

  // Escape closes the mobile drawer (parity with other overlays).
  useEffect(() => {
    if (!isMobile || !mobileOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobileNav()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMobile, mobileOpen, onCloseMobileNav])

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
    onOpenCommandPalette: () => {
      onOpenCommandPalette()
      onCloseMobileNav()
    },
  }

  const displayName = userName?.trim() || userEmail?.split('@')[0] || 'Account'
  const initials = getInitials({ name: userName, email: userEmail })
  const themeLabel = resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  const signOutLabel = 'Sign out'

  if (!isMobile) {
    return (
      <div className="fixed inset-y-0 left-0 z-40 flex">
        <AppRail
          activeView={activeView}
          onNavigate={(view) => {
            if (view === 'welcome') {
              onOpenWelcome()
            } else {
              onSwitchView(view)
            }
          }}
          onOpenSettings={onOpenSettings}
          onSignOut={onSignOut}
          user={{ name: userName, email: userEmail }}
        />

        <aside
          aria-label="Library"
          aria-hidden={sidebarCollapsed || undefined}
          className={cn(
            'glass-subtle flex h-full shrink-0 flex-col overflow-hidden border-y-0 border-l-0 transition-[width] duration-300 ease-soft',
            sidebarCollapsed ? 'w-0 border-r-0' : 'w-[var(--library-width,300px)]'
          )}
        >
          {!sidebarCollapsed ? (
            <SidebarTree
              {...sharedTreeProps}
              dense
              collapsed={false}
              onToggleCollapsed={onToggleCollapsed}
            />
          ) : null}
        </aside>

        {sidebarCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="glass focus-ring fixed left-[calc(var(--rail-width,68px)+6px)] top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
            aria-label="Expand library"
            title={`Expand library (${formatModShortcut('\\')})`}
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
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
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close navigation"
        className="animate-fade-in fixed inset-0 z-40 bg-[rgb(9_8_18_/_0.45)] backdrop-blur-[2px]"
        onClick={onCloseMobileNav}
        {...swipeHandlers}
      />
      <aside
        role="dialog"
        aria-label="Library"
        className="glass-strong motion-safe:animate-slide-in-left safe-top fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col overflow-hidden rounded-none border-y-0 border-l-0 shadow-glass-lg"
        {...swipeHandlers}
      >
        {/* Drawer header */}
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
          <img
            src="/icon-192.png"
            alt=""
            className="h-[22px] w-[22px] shrink-0 rounded-[6px] object-contain ring-1 ring-black/5 dark:ring-white/10"
          />
          <span className="min-w-0 flex-1 truncate font-display text-[13px] font-semibold text-foreground">
            MindViz Notes
          </span>
          <button
            type="button"
            onClick={onCloseMobileNav}
            className="glass-btn-ghost focus-ring h-7 w-7 shrink-0"
            aria-label="Close navigation"
            title="Close navigation"
          >
            <X className="h-[15px] w-[15px]" aria-hidden="true" />
          </button>
        </div>

        <div className="glass-divider shrink-0" aria-hidden="true" />

        {/* Library tree (SidebarTree owns the local filter field) */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <SidebarTree
            {...sharedTreeProps}
            collapsed={false}
            onToggleCollapsed={onCloseMobileNav}
            showHeader={false}
          />
        </div>

        {/* Footer: identity, appearance, settings, sign out */}
        <div className="shrink-0 border-t border-border px-2 py-2">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold text-accent-foreground shadow-sm [background:var(--accent-gradient)]"
            >
              {initials || <UserRound className="h-3.5 w-3.5" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-foreground">{displayName}</p>
              {userEmail ? <p className="truncate text-[11px] text-muted">{userEmail}</p> : null}
            </div>
          </div>

          <div className="mt-1 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="glass-btn focus-ring h-8 gap-1.5 px-2 text-[12px]"
              aria-label={themeLabel}
              title={themeLabel}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{resolvedTheme === 'dark' ? 'Light' : 'Dark'} theme</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onCloseMobileNav()
                onOpenSettings()
              }}
              className="glass-btn focus-ring h-8 gap-1.5 px-2 text-[12px]"
              aria-label="Open settings"
              title="Settings"
            >
              <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Settings</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="glass-row focus-ring mt-1 items-center gap-2.5 px-2 py-2 text-[13px] font-medium text-danger"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{signOutLabel}</span>
          </button>
        </div>
      </aside>
    </>
  )
}
