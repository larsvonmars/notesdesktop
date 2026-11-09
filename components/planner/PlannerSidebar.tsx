'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarDays,
  CalendarPlus,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  LayoutDashboard,
  ListTodo,
  Plus,
  Repeat,
  Settings2,
  Sparkles,
  Star,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/components/shell/utils'
import { ProgressBar } from './PlannerUi'

export type PlannerSection =
  | 'overview'
  | 'tasks'
  | 'starred'
  | 'projects'
  | 'calendar'
  | 'timetable'
  | 'plan'
  | 'settings'

export interface PlannerSidebarCounts {
  open: number
  starred: number
  projects: number
  upcomingEvents: number
  overdue: number
  dueToday: number
  freeHours: number
  activePlanProgress: number | null
}

interface NavItem {
  id: PlannerSection
  label: string
  icon: LucideIcon
  shortcut: string
  /** Token-driven hue used for the icon, keeps the rail scannable. */
  hue: string
  badge?: number | string | null
}

export const PLANNER_SECTION_LABELS: Record<PlannerSection, string> = {
  overview: 'Overview',
  tasks: 'Tasks',
  starred: 'Starred',
  projects: 'Projects',
  calendar: 'Calendar',
  timetable: 'Timetable',
  plan: 'Smart plan',
  settings: 'Settings',
}

const NAV_GROUPS: { title: string; items: PlannerSection[] }[] = [
  { title: 'Overview', items: ['overview'] },
  { title: 'Your work', items: ['tasks', 'projects', 'starred'] },
  { title: 'Schedule', items: ['calendar', 'timetable'] },
  { title: 'Tools', items: ['plan'] },
]

const NAV_ITEMS: Record<PlannerSection, Omit<NavItem, 'badge'>> = {
  overview: { id: 'overview', label: 'Overview', icon: LayoutDashboard, shortcut: '1', hue: 'var(--hue-lime)' },
  tasks: { id: 'tasks', label: 'Tasks', icon: ListTodo, shortcut: '2', hue: 'var(--hue-sky)' },
  starred: { id: 'starred', label: 'Starred', icon: Star, shortcut: '3', hue: 'var(--hue-amber)' },
  projects: { id: 'projects', label: 'Projects', icon: Layers, shortcut: '4', hue: 'var(--hue-rose)' },
  calendar: { id: 'calendar', label: 'Calendar', icon: CalendarDays, shortcut: '5', hue: 'var(--hue-mint)' },
  timetable: { id: 'timetable', label: 'Timetable', icon: Repeat, shortcut: '6', hue: 'var(--hue-sky)' },
  plan: { id: 'plan', label: 'Smart plan', icon: Wand2, shortcut: '7', hue: 'var(--hue-rose)' },
  settings: { id: 'settings', label: 'Settings', icon: Settings2, shortcut: '8', hue: 'var(--muted)' },
}

function badgesFor(counts: PlannerSidebarCounts): Partial<Record<PlannerSection, number | string | null>> {
  return {
    tasks: counts.open > 0 ? counts.open : null,
    starred: counts.starred > 0 ? counts.starred : null,
    projects: counts.projects > 0 ? counts.projects : null,
    calendar: counts.upcomingEvents > 0 ? counts.upcomingEvents : null,
    plan: counts.activePlanProgress !== null ? `${counts.activePlanProgress}%` : null,
  }
}

function NavButton({
  item,
  active,
  collapsed,
  badge,
  onSelect,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
  badge?: number | string | null
  onSelect: (section: PlannerSection) => void
}) {
  const Icon = item.icon
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        aria-current={active ? 'page' : undefined}
        title={
          collapsed
            ? `${item.label}${badge != null ? ` (${badge})` : ''} · Alt+${item.shortcut}`
            : `${item.label} (Alt+${item.shortcut})`
        }
        data-active={active}
        className={cn(
          'pl-nav-item focus-ring group',
          collapsed && 'justify-center px-0',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors',
            active ? '' : 'bg-[var(--surface-sunken)] group-hover:bg-[var(--surface-active)]',
          )}
          style={active ? { background: 'var(--accent)', color: 'var(--accent-foreground)' } : { color: item.hue }}
        >
          <Icon size={13} strokeWidth={active ? 2.2 : 1.9} />
        </span>
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>}
        {!collapsed && badge != null && (
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
              active ? 'bg-accent text-accent-foreground' : 'bg-[var(--surface-sunken)] text-muted',
            )}
          >
            {badge}
          </span>
        )}
        {collapsed && badge != null && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        )}
      </button>
    </li>
  )
}

function NavContent({
  activeSection,
  counts,
  collapsed,
  onSelect,
}: {
  activeSection: PlannerSection
  counts: PlannerSidebarCounts
  collapsed: boolean
  onSelect: (section: PlannerSection) => void
}) {
  const badges = badgesFor(counts)

  return (
    <nav aria-label="Planner" className="flex-1 overflow-y-auto px-2.5 py-2 scroll-thin">
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="mb-1">
          {!collapsed && (
            <p className="px-2 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              {group.title}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((section) => (
              <NavButton
                key={section}
                item={{ ...NAV_ITEMS[section], badge: badges[section] }}
                active={activeSection === section}
                collapsed={collapsed}
                badge={badges[section]}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SidebarFooter({
  counts,
  collapsed,
  activeSection,
  onNewTask,
  onNewEvent,
  onSelect,
}: {
  counts: PlannerSidebarCounts
  collapsed: boolean
  activeSection: PlannerSection
  onNewTask: () => void
  onNewEvent: () => void
  onSelect: (section: PlannerSection) => void
}) {
  if (collapsed) {
    return (
      <div className="space-y-1.5 border-t border-[var(--border)] p-2">
        <button
          type="button"
          onClick={onNewTask}
          title="New task"
          aria-label="New task"
          className="focus-ring flex h-9 w-full items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-[0_10px_22px_-12px_var(--accent-glow)] transition-[filter,transform] hover:brightness-105 active:scale-95"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          onClick={onNewEvent}
          title="New event"
          aria-label="New event"
          className="focus-ring flex h-9 w-full items-center justify-center rounded-xl border border-[var(--border)] text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
        >
          <CalendarPlus size={15} />
        </button>
        <button
          type="button"
          onClick={() => onSelect('settings')}
          title="Planner settings"
          aria-label="Planner settings"
          aria-current={activeSection === 'settings' ? 'page' : undefined}
          className={cn(
            'focus-ring flex h-9 w-full items-center justify-center rounded-xl transition-colors',
            activeSection === 'settings'
              ? 'bg-[var(--accent-light)] text-accent'
              : 'text-muted hover:bg-[var(--surface-hover)] hover:text-foreground',
          )}
        >
          <Settings2 size={15} />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--border)] p-2.5">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-sunken)] p-2.5">
        <p className="pl-eyebrow px-0.5">Today</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
          <div className="rounded-xl bg-[var(--surface)] px-1 py-1.5">
            <p
              className={cn(
                'text-[14px] font-bold tabular-nums leading-none',
                counts.overdue > 0 ? 'text-danger' : 'text-foreground',
              )}
            >
              {counts.overdue}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-muted">
              Overdue
            </p>
          </div>
          <div className="rounded-xl bg-[var(--surface)] px-1 py-1.5">
            <p className="text-[14px] font-bold tabular-nums leading-none text-foreground">
              {counts.dueToday}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-muted">
              Due today
            </p>
          </div>
          <div className="rounded-xl bg-[var(--surface)] px-1 py-1.5">
            <p className="text-[14px] font-bold tabular-nums leading-none text-foreground">
              {counts.freeHours}h
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-muted">
              Free focus
            </p>
          </div>
        </div>
        {counts.activePlanProgress !== null && (
          <button
            type="button"
            onClick={() => onSelect('plan')}
            className="focus-ring mt-2 w-full rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-[var(--surface-hover)]"
          >
            <span className="flex items-center justify-between text-[10px] font-medium text-muted">
              <span className="flex items-center gap-1">
                <Sparkles size={10} className="text-accent" />
                Active plan
              </span>
              <span className="tabular-nums">{counts.activePlanProgress}%</span>
            </span>
            <ProgressBar value={counts.activePlanProgress} className="mt-1" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={onNewTask}
          className="focus-ring flex items-center justify-center gap-1 rounded-xl bg-accent px-2 py-2 text-[11px] font-semibold text-accent-foreground shadow-[0_10px_22px_-12px_var(--accent-glow)] transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
        >
          <Plus size={12} />
          Task
        </button>
        <button
          type="button"
          onClick={onNewEvent}
          className="focus-ring flex items-center justify-center gap-1 rounded-xl border border-[var(--border)] px-2 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-[var(--surface-hover)]"
        >
          <CalendarPlus size={12} />
          Event
        </button>
      </div>

      <button
        type="button"
        onClick={() => onSelect('settings')}
        aria-current={activeSection === 'settings' ? 'page' : undefined}
        className={cn(
          'focus-ring flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors',
          activeSection === 'settings'
            ? 'bg-[var(--accent-light)] text-accent'
            : 'text-muted hover:bg-[var(--surface-hover)] hover:text-foreground',
        )}
      >
        <Settings2 size={12} />
        Settings
        <span className="ml-auto rounded bg-[var(--surface-sunken)] px-1 text-[9px] font-semibold tabular-nums text-muted">
          Alt+8
        </span>
      </button>
    </div>
  )
}

export interface PlannerSidebarProps {
  activeSection: PlannerSection
  counts: PlannerSidebarCounts
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelect: (section: PlannerSection) => void
  onNewTask: () => void
  onNewEvent: () => void
  className?: string
}

export default function PlannerSidebar({
  activeSection,
  counts,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onNewTask,
  onNewEvent,
  className = '',
}: PlannerSidebarProps) {
  return (
    <aside
      aria-label="Planner navigation"
      className={cn(
        'glass-subtle relative flex h-full shrink-0 flex-col overflow-hidden border-l border-[var(--border)] transition-[width] duration-300 ease-out',
        collapsed ? 'w-[68px]' : 'w-[248px]',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-[var(--border)] px-2.5',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        {!collapsed && (
          <span className="flex items-center gap-2 px-1">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-[9px] text-accent-foreground shadow-[0_8px_18px_-8px_var(--accent-glow)]"
              style={{ background: 'var(--accent-gradient)' }}
            >
              <CalendarDays size={14} strokeWidth={2} />
            </span>
            <span className="font-display text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              Planner
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand planner sidebar' : 'Collapse planner sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
        >
          {collapsed ? <ChevronsLeft size={15} /> : <ChevronsRight size={15} />}
        </button>
      </div>

      <NavContent
        activeSection={activeSection}
        counts={counts}
        collapsed={collapsed}
        onSelect={onSelect}
      />

      <SidebarFooter
        counts={counts}
        collapsed={collapsed}
        activeSection={activeSection}
        onNewTask={onNewTask}
        onNewEvent={onNewEvent}
        onSelect={onSelect}
      />
    </aside>
  )
}

/** Right-hand slide-over used on small screens. */
export function PlannerSidebarDrawer({
  open,
  onClose,
  activeSection,
  counts,
  onSelect,
  onNewTask,
  onNewEvent,
  usePortal = true,
}: {
  open: boolean
  onClose: () => void
  activeSection: PlannerSection
  counts: PlannerSidebarCounts
  onSelect: (section: PlannerSection) => void
  onNewTask: () => void
  onNewEvent: () => void
  /** Set to false when embedding the drawer in a non-portal context. */
  usePortal?: boolean
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus({ preventScroll: true })
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const drawer = (
    <div className="fixed inset-0 z-50 xl:hidden">
      <button
        type="button"
        aria-label="Close planner navigation"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-[rgb(9_8_18_/_0.45)] backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Planner navigation"
        tabIndex={-1}
        style={{
          paddingTop: 'max(var(--sat), 0.5rem)',
          paddingBottom: 'max(var(--sab), 0.5rem)',
        }}
        className="glass-strong animate-rise-in absolute inset-y-0 right-0 flex w-[min(85vw,300px)] flex-col overflow-hidden border-l border-[var(--border)] shadow-glass-lg outline-none"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-[9px] text-accent-foreground"
              style={{ background: 'var(--accent-gradient)' }}
            >
              <CalendarDays size={14} strokeWidth={2} />
            </span>
            <span className="font-display text-[13px] font-semibold text-foreground">Planner</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>
        <NavContent
          activeSection={activeSection}
          counts={counts}
          collapsed={false}
          onSelect={(section) => {
            onSelect(section)
            onClose()
          }}
        />
        <SidebarFooter
          counts={counts}
          collapsed={false}
          activeSection={activeSection}
          onNewTask={() => {
            onNewTask()
            onClose()
          }}
          onNewEvent={() => {
            onNewEvent()
            onClose()
          }}
          onSelect={(section) => {
            onSelect(section)
            onClose()
          }}
        />
      </div>
    </div>
  )

  if (!usePortal || typeof document === 'undefined') return drawer
  return createPortal(drawer, document.body)
}
