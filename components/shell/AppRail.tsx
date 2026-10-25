'use client'

import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { LogOut, Moon, Settings, Sun, UserRound } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { formatModShortcut } from '@/lib/platform'
import type { WorkspaceView } from '@/lib/workspace/types'
import { RAIL_DESTINATIONS } from '@/lib/workspace/view-navigation'
import type { ShellUser } from './types'
import { cn, getInitials } from './utils'

export interface AppRailProps {
  /** Currently active workspace view (Home === 'welcome'). */
  activeView: WorkspaceView
  /** Switch workspace view. Home maps to 'welcome'. */
  onNavigate: (view: WorkspaceView) => void
  onOpenSettings?: () => void
  onSignOut?: () => void
  /** Signed-in identity for the avatar menu. */
  user?: ShellUser | null
  className?: string
}

interface RailButtonProps {
  icon: LucideIcon
  label: string
  /** Digit shortcut rendered in the tooltip, e.g. '1' → ⌘1. */
  shortcut?: string | null
  active?: boolean
  onClick: () => void
}

function RailButton({ icon: Icon, label, shortcut, active, onClick }: RailButtonProps) {
  const hint = shortcut ? `${label} (${formatModShortcut(shortcut)})` : label
  return (
    <li className="flex w-full justify-center">
      <button
        type="button"
        className="nav-pill focus-ring"
        onClick={onClick}
        aria-label={hint}
        title={hint}
        aria-current={active ? 'page' : undefined}
      >
        <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={active ? 2.15 : 1.85} />
        <span className="nav-pill-label" aria-hidden="true">
          {label}
          {shortcut ? <span className="ml-1.5 text-muted">{formatModShortcut(shortcut)}</span> : null}
        </span>
      </button>
    </li>
  )
}

/**
 * 68px glass icon rail (desktop only).
 *
 * Brand → primary destinations → spacer → theme, settings and the account
 * menu. The active destination is a .nav-pill with aria-current="page", which
 * glass.css renders as a violet pill with a glowing left bar.
 */
export default function AppRail({
  activeView,
  onNavigate,
  onOpenSettings,
  onSignOut,
  user,
  className = '',
}: AppRailProps) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const frame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [menuOpen])

  const initials = getInitials(user)
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'Account'
  const hasAccountMenu = Boolean(onSignOut || onOpenSettings)
  const hasIdentity = Boolean(user?.email || user?.name)
  const themeLabel =
    resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'glass-subtle relative flex h-full w-[var(--rail-width,68px)] shrink-0 flex-col items-center border-y-0 border-l-0',
        className
      )}
    >
      {/* Brand */}
      <div className="flex h-[var(--topbar-height,56px)] w-full shrink-0 items-center justify-center">
        <button
          type="button"
          onClick={() => onNavigate('welcome')}
          className="focus-ring group relative flex h-10 w-10 items-center justify-center rounded-2xl transition-colors hover:bg-surface-hover"
          aria-label="MindViz Notes — go to Home"
          title="MindViz Notes"
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl bg-accent-light opacity-0 blur-md transition-opacity duration-200 group-hover:opacity-100"
          />
          <img
            src="/icon-192.png"
            alt=""
            className="relative h-[30px] w-[30px] rounded-[9px] object-contain ring-1 ring-black/5 drop-shadow-sm dark:ring-white/10"
          />
        </button>
      </div>

      <div className="glass-divider mx-auto w-8" aria-hidden="true" />

      {/* Primary destinations */}
      <ul className="mt-3 flex w-full flex-col items-center gap-1.5 px-2">
        {RAIL_DESTINATIONS.map((destination) => (
          <RailButton
            key={destination.id}
            icon={destination.icon}
            label={destination.label}
            shortcut={destination.shortcut}
            active={activeView === destination.view}
            onClick={() => onNavigate(destination.view)}
          />
        ))}
      </ul>

      <div className="min-h-8 flex-1" />

      {/* Theme / settings / account */}
      <div className="glass-divider mx-auto mb-3 w-8" aria-hidden="true" />
      <ul className="flex w-full flex-col items-center gap-2.5 px-2 pb-4">
        <li className="flex w-full justify-center">
          <button
            type="button"
            onClick={toggleTheme}
            className="nav-pill focus-ring"
            aria-label={themeLabel}
            title={themeLabel}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-[18px] w-[18px]" strokeWidth={1.85} />
            ) : (
              <Moon className="h-[18px] w-[18px]" strokeWidth={1.85} />
            )}
            <span className="nav-pill-label" aria-hidden="true">
              {resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}
            </span>
          </button>
        </li>

        {onOpenSettings ? (
          <li className="flex w-full justify-center">
            <button
              type="button"
              onClick={onOpenSettings}
              className="nav-pill focus-ring"
              aria-label="Open settings"
              title="Settings"
            >
              <Settings className="h-[18px] w-[18px]" strokeWidth={1.85} />
              <span className="nav-pill-label" aria-hidden="true">
                Settings
              </span>
            </button>
          </li>
        ) : null}

        {!hasAccountMenu && hasIdentity ? (
          <li className="flex w-full justify-center">
            <span className="nav-pill cursor-default" title={displayName}>
              <span
                aria-hidden="true"
                className="flex h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold tracking-wide text-accent-foreground shadow-sm [background:var(--accent-gradient)]"
              >
                {initials || <UserRound className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span className="nav-pill-label" aria-hidden="true">
                {displayName}
              </span>
            </span>
          </li>
        ) : null}

        {hasAccountMenu ? (
          <li className="relative flex w-full justify-center">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="nav-pill focus-ring"
              aria-label="Account menu"
              title={displayName}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span
                aria-hidden="true"
                className="flex h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold tracking-wide text-accent-foreground shadow-sm [background:var(--accent-gradient)]"
              >
                {initials || <UserRound className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span className="nav-pill-label" aria-hidden="true">
                Account
              </span>
            </button>

            {menuOpen ? (
              <div
                ref={menuRef}
                role="menu"
                aria-label="Account menu"
                className="glass-popover animate-rise-in fixed bottom-4 left-[calc(var(--rail-width,68px)+10px)] z-[80] w-60 overflow-hidden p-1.5"
              >
                <div className="px-2.5 pb-2 pt-1.5">
                  <p className="truncate text-[13px] font-semibold text-foreground">{displayName}</p>
                  {user?.email ? (
                    <p className="truncate text-[11px] text-muted">{user.email}</p>
                  ) : null}
                </div>
                <div className="glass-divider mb-1" aria-hidden="true" />

                {onOpenSettings ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="glass-row focus-ring items-center gap-2.5 px-2.5 py-2 text-[13px] font-medium"
                    onClick={() => {
                      setMenuOpen(false)
                      onOpenSettings()
                    }}
                  >
                    <Settings className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    Settings
                  </button>
                ) : null}

                {onSignOut ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="glass-row focus-ring items-center gap-2.5 px-2.5 py-2 text-[13px] font-medium text-danger"
                    onClick={() => {
                      setMenuOpen(false)
                      onSignOut()
                    }}
                  >
                    <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Sign out
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ) : null}
      </ul>
    </nav>
  )
}
