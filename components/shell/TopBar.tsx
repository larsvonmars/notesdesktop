'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Menu,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
} from 'lucide-react'
import type { NoteType } from '@/lib/notes'
import { formatModShortcut } from '@/lib/platform'
import type { Breadcrumb, TopBarMenuItem } from './types'
import { getOrderedNoteTypeVisuals } from './note-type-icons'
import { cn } from './utils'

export interface TopBarProps {
  /** Trail from the workspace root to the current page; last = current. */
  breadcrumbs: Breadcrumb[]
  canGoBack?: boolean
  canGoForward?: boolean
  onBack?: () => void
  onForward?: () => void
  onOpenSearch?: () => void
  /** Override the search shortcut hint. Defaults to the platform ⌘K / Ctrl+K. */
  searchShortcut?: string
  /** Called with no type to open the type picker, or with a concrete type. */
  onCreateNote?: (type?: NoteType) => void
  noteListOpen?: boolean
  onToggleNoteList?: () => void
  detailsOpen?: boolean
  onToggleDetails?: () => void
  /** Extra actions for the overflow menu (Files, Archive, Settings, …). */
  overflowItems?: TopBarMenuItem[]
  /** Mobile only: opens the library drawer. */
  onOpenLibrary?: () => void
  className?: string
}

type OpenMenu = 'types' | 'overflow' | 'crumbs' | null

function CrumbBody({
  crumb,
  hideLabelBelowLg = false,
}: {
  crumb: Breadcrumb
  hideLabelBelowLg?: boolean
}) {
  const Icon = crumb.icon
  return (
    <>
      {crumb.color ? (
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full ring-1 ring-border"
          style={{ backgroundColor: crumb.color }}
        />
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
      ) : null}
      <span className={hideLabelBelowLg ? 'hidden truncate lg:inline' : 'truncate'}>
        {crumb.label}
      </span>
    </>
  )
}

/**
 * Sticky glass workspace top bar: history controls, breadcrumbs, search, the
 * primary New note action, pane toggles and an overflow menu.
 *
 * The bar is 52px on phones and 56px on tablet/desktop. Below lg the trail
 * collapses to first + full-path popover + current, the search field becomes an
 * icon button and pane toggles fold away, so it stays usable from 320 to 1440.
 */
export default function TopBar({
  breadcrumbs,
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
  onOpenSearch,
  searchShortcut,
  onCreateNote,
  noteListOpen = false,
  onToggleNoteList,
  detailsOpen = false,
  onToggleDetails,
  overflowItems,
  onOpenLibrary,
  className = '',
}: TopBarProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const typeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const overflowTriggerRef = useRef<HTMLButtonElement | null>(null)
  const crumbsTriggerRef = useRef<HTMLButtonElement | null>(null)

  const resolvedSearchShortcut = searchShortcut ?? formatModShortcut('K')
  const newNoteShortcut = formatModShortcut('N')
  const noteTypes = getOrderedNoteTypeVisuals()
  const overflow = overflowItems?.filter(Boolean) ?? []
  const fullPath = breadcrumbs.map((crumb) => crumb.label).join(' / ')
  const lastIndex = breadcrumbs.length - 1
  const hasHistory = Boolean(onBack || onForward)
  const showEllipsis = breadcrumbs.length > 2

  useEffect(() => {
    if (!openMenu) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-topbar-popover], [data-topbar-trigger]')) return
      setOpenMenu(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const previous = openMenu
      setOpenMenu(null)
      if (previous === 'types') typeTriggerRef.current?.focus()
      else if (previous === 'overflow') overflowTriggerRef.current?.focus()
      else if (previous === 'crumbs') crumbsTriggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenu])

  const toggleMenu = (menu: Exclude<OpenMenu, null>) => {
    setOpenMenu((previous) => (previous === menu ? null : menu))
  }

  return (
    <header
      aria-label="Workspace top bar"
      className={cn(
        'glass sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-1.5 rounded-none border-x-0 border-t-0 px-2 sm:gap-2 sm:px-3 md:h-[var(--topbar-height,56px)]',
        className
      )}
    >
      {onOpenLibrary ? (
        <button
          type="button"
          onClick={onOpenLibrary}
          className="glass-btn-ghost focus-ring h-8 w-8 shrink-0 md:hidden"
          aria-label="Open navigation"
          title="Open navigation"
        >
          <Menu className="h-[17px] w-[17px]" aria-hidden="true" />
        </button>
      ) : null}

      {hasHistory ? (
        <div className="hidden shrink-0 items-center gap-0.5 md:flex">
          <button
            type="button"
            onClick={onBack}
            disabled={!canGoBack || !onBack}
            className="glass-btn-ghost focus-ring disabled:pointer-events-none disabled:opacity-35"
            aria-label="Go back"
            title={`Back (${formatModShortcut('[')})`}
          >
            <ArrowLeft className="h-[17px] w-[17px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onForward}
            disabled={!canGoForward || !onForward}
            className="glass-btn-ghost focus-ring disabled:pointer-events-none disabled:opacity-35"
            aria-label="Go forward"
            title={`Forward (${formatModShortcut(']')})`}
          >
            <ArrowRight className="h-[17px] w-[17px]" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === lastIndex
            const isMiddle = index > 0 && index < lastIndex
            const isFirst = index === 0
            const compactFirst = isFirst && breadcrumbs.length > 2 && Boolean(crumb.icon)
            const Icon = crumb.icon
            return (
              <li
                key={crumb.id}
                className={cn(
                  'min-w-0 items-center gap-1',
                  isMiddle ? 'hidden lg:flex' : 'flex',
                  isFirst && 'shrink-0',
                  isLast && 'order-1'
                )}
              >
                {index > 0 ? (
                  <ChevronRight
                    className="h-3 w-3 shrink-0 text-muted opacity-50"
                    aria-hidden="true"
                  />
                ) : null}
                {crumb.onClick ? (
                  <button
                    type="button"
                    onClick={crumb.onClick}
                    className={cn(
                      'focus-ring flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium transition-colors hover:bg-surface-hover',
                      isLast ? 'text-foreground' : 'text-muted hover:text-foreground'
                    )}
                    aria-current={isLast ? 'page' : undefined}
                    aria-label={crumb.label}
                    title={crumb.label}
                  >
                    <CrumbBody crumb={crumb} hideLabelBelowLg={compactFirst} />
                  </button>
                ) : (
                  <span
                    className={cn(
                      'flex min-w-0 items-center gap-1.5 px-1 py-0.5 text-[13px] font-medium',
                      isLast ? 'text-foreground' : 'text-muted'
                    )}
                    aria-current={isLast ? 'page' : undefined}
                    aria-label={crumb.label}
                    title={crumb.label}
                  >
                    {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" /> : null}
                    <span className={compactFirst ? 'hidden truncate lg:inline' : 'truncate'}>
                      {crumb.label}
                    </span>
                  </span>
                )}
              </li>
            )
          })}

          {showEllipsis ? (
            <li className="relative flex items-center gap-1 lg:hidden">
              <ChevronRight className="h-3 w-3 shrink-0 text-muted opacity-50" aria-hidden="true" />
              <button
                ref={crumbsTriggerRef}
                type="button"
                data-topbar-trigger="crumbs"
                onClick={() => toggleMenu('crumbs')}
                className="glass-btn-ghost focus-ring h-7 w-7"
                aria-label={`Show full path: ${fullPath}`}
                aria-haspopup="menu"
                aria-expanded={openMenu === 'crumbs'}
                title={fullPath}
              >
                <Ellipsis className="h-4 w-4" aria-hidden="true" />
              </button>

              {openMenu === 'crumbs' ? (
                <div
                  data-topbar-popover="crumbs"
                  role="menu"
                  aria-label="Full path"
                  className="glass-popover animate-rise-in absolute left-0 top-[calc(100%+8px)] z-50 w-64 p-1.5"
                >
                  {breadcrumbs.map((crumb, index) => {
                    const CrumbIcon = crumb.icon
                    const isLast = index === lastIndex
                    const content = (
                      <>
                        {crumb.color ? (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: crumb.color }}
                            aria-hidden="true"
                          />
                        ) : CrumbIcon ? (
                          <CrumbIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        ) : null}
                        <span className="truncate">{crumb.label}</span>
                        {isLast ? (
                          <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                            Current
                          </span>
                        ) : null}
                      </>
                    )
                    return crumb.onClick ? (
                      <button
                        key={crumb.id}
                        type="button"
                        role="menuitem"
                        className="glass-row focus-ring items-center gap-2.5 px-2 py-1.5 text-[13px]"
                        onClick={() => {
                          setOpenMenu(null)
                          crumb.onClick?.()
                        }}
                      >
                        {content}
                      </button>
                    ) : (
                      <div
                        key={crumb.id}
                        role="menuitem"
                        aria-disabled="true"
                        className="glass-row items-center gap-2.5 px-2 py-1.5 text-[13px] text-muted"
                      >
                        {content}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </li>
          ) : null}
        </ol>
      </nav>

      {onOpenSearch ? (
        <button
          type="button"
          onClick={onOpenSearch}
          className="glass-input focus-ring flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full px-0 text-muted transition-colors hover:text-foreground xl:w-64 xl:justify-start xl:rounded-[10px] xl:px-3"
          aria-label={`Search notes and commands (${resolvedSearchShortcut})`}
          title={`Search notes and commands (${resolvedSearchShortcut})`}
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden truncate text-[13px] xl:inline">Search or jump to…</span>
          <span className="kbd ml-auto hidden shrink-0 xl:inline-flex">{resolvedSearchShortcut}</span>
        </button>
      ) : null}

      {onCreateNote ? (
        <div className="relative flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onCreateNote()}
            className="glass-btn-primary focus-ring h-9 gap-1.5 px-3 lg:px-4"
            title={`New note (${newNoteShortcut})`}
            aria-label={`New note (${newNoteShortcut})`}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden text-[13px] xl:inline">New note</span>
          </button>
          <button
            ref={typeTriggerRef}
            type="button"
            data-topbar-trigger="types"
            onClick={() => toggleMenu('types')}
            className="glass-btn-ghost focus-ring hidden h-9 w-7 md:inline-flex"
            aria-label="Choose note type"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'types'}
            title="Choose note type"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>

          {openMenu === 'types' ? (
            <div
              data-topbar-popover="types"
              role="menu"
              aria-label="New note type"
              className="glass-popover animate-rise-in absolute right-0 top-[calc(100%+8px)] z-50 w-64 p-1.5"
            >
              <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Create
              </p>
              {noteTypes.map((visual) => {
                const TypeIcon = visual.icon
                return (
                  <button
                    key={visual.type}
                    type="button"
                    role="menuitem"
                    className="glass-row focus-ring items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium"
                    onClick={() => {
                      setOpenMenu(null)
                      onCreateNote(visual.type)
                    }}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] ring-1 ring-inset',
                        visual.tileClassName
                      )}
                      aria-hidden="true"
                    >
                      <TypeIcon className={cn('h-3.5 w-3.5', visual.iconClassName)} />
                    </span>
                    <span className="truncate">{visual.label}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {onToggleNoteList ? (
        <button
          type="button"
          onClick={onToggleNoteList}
          className={cn(
            'glass-btn-ghost focus-ring hidden h-8 w-8 shrink-0 lg:inline-flex',
            noteListOpen ? 'text-foreground' : 'text-muted'
          )}
          aria-label={noteListOpen ? 'Hide note list' : 'Show note list'}
          aria-pressed={noteListOpen}
          title={noteListOpen ? 'Hide note list' : 'Show note list'}
        >
          <PanelLeft className="h-[17px] w-[17px]" aria-hidden="true" />
        </button>
      ) : null}

      {onToggleDetails ? (
        <button
          type="button"
          onClick={onToggleDetails}
          className={cn(
            'glass-btn-ghost focus-ring hidden h-8 w-8 shrink-0 xl:inline-flex',
            detailsOpen ? 'text-foreground' : 'text-muted'
          )}
          aria-label={detailsOpen ? 'Hide details' : 'Show details'}
          aria-pressed={detailsOpen}
          title={detailsOpen ? 'Hide details' : 'Show details'}
        >
          <PanelRight className="h-[17px] w-[17px]" aria-hidden="true" />
        </button>
      ) : null}

      {overflow.length > 0 ? (
        <div className="relative shrink-0">
          <button
            ref={overflowTriggerRef}
            type="button"
            data-topbar-trigger="overflow"
            onClick={() => toggleMenu('overflow')}
            className="glass-btn-ghost focus-ring h-8 w-8"
            aria-label="More workspace actions"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'overflow'}
            title="More actions"
          >
            <Ellipsis className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>

          {openMenu === 'overflow' ? (
            <div
              data-topbar-popover="overflow"
              role="menu"
              aria-label="More workspace actions"
              className="glass-popover animate-rise-in absolute right-0 top-[calc(100%+8px)] z-50 w-56 p-1.5"
            >
              {overflow.map((item) => {
                const ItemIcon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={cn(
                      'glass-row focus-ring items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium',
                      item.danger ? 'text-danger' : 'text-foreground'
                    )}
                    onClick={() => {
                      setOpenMenu(null)
                      item.onSelect()
                    }}
                  >
                    {ItemIcon ? (
                      <ItemIcon
                        className={cn('h-4 w-4 shrink-0', item.danger ? 'text-danger' : 'text-muted')}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="flex-1 truncate text-left">{item.label}</span>
                    {item.shortcut ? <span className="kbd shrink-0">{item.shortcut}</span> : null}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}
