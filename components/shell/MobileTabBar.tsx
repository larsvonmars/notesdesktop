'use client'

import { Ellipsis, FileText, GraduationCap, Home, ListTodo } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { WorkspaceView } from '@/lib/workspace/types'
import { cn } from './utils'

export interface MobileTabBarProps {
  /** Active workspace view (Home === 'welcome'). */
  activeView: WorkspaceView
  onNavigate: (view: WorkspaceView) => void
  onOpenSearch?: () => void
  /** Opens the "More" sheet / drawer with secondary destinations. */
  onOpenMore?: () => void
  className?: string
}

interface TabItem {
  id: string
  label: string
  icon: LucideIcon
  view?: WorkspaceView
}

const VIEW_TABS: TabItem[] = [
  { id: 'home', label: 'Home', icon: Home, view: 'welcome' },
  { id: 'notes', label: 'Notes', icon: FileText, view: 'notes' },
]

const MORE_VIEWS: WorkspaceView[] = ['files', 'chat', 'projects']

/**
 * Bottom glass navigation for phones. Five equal tabs (Home, Notes, Learn,
 * Planner, More) with a safe-area gutter; the active tab gets an accent pill and
 * aria-current="page". Search lives in the top bar; "More" opens the drawer.
 */
export default function MobileTabBar({
  activeView,
  onNavigate,
  onOpenSearch,
  onOpenMore,
  className = '',
}: MobileTabBarProps) {
  const moreActive = MORE_VIEWS.includes(activeView)

  const tabClass = (active: boolean) =>
    cn(
      'focus-ring flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors',
      active ? 'text-accent' : 'text-muted hover:text-foreground'
    )

  const iconWrapClass = (active: boolean) =>
    cn(
      'flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200',
      active ? 'bg-accent-light' : 'bg-transparent'
    )

  return (
    <nav
      aria-label="Mobile navigation"
      className={cn(
        'glass fixed inset-x-0 bottom-0 z-40 flex items-stretch rounded-none border-x-0 border-b-0 px-1 md:hidden',
        className
      )}
      style={{
        paddingBottom: 'var(--sab)',
        paddingLeft: 'max(0.25rem, var(--sal))',
        paddingRight: 'max(0.25rem, var(--sar))',
      }}
    >
      <div className="flex min-h-[var(--mobile-bar-height,60px)] w-full items-stretch">
        {VIEW_TABS.map((tab) => {
          const TabIcon = tab.icon
          const active = activeView === tab.view
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => tab.view && onNavigate(tab.view)}
              className={tabClass(active)}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.label}
            >
              <span className={iconWrapClass(active)} aria-hidden="true">
                <TabIcon className="h-[19px] w-[19px]" strokeWidth={active ? 2.2 : 1.85} />
              </span>
              <span>{tab.label}</span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => onNavigate('learn')}
          className={tabClass(activeView === 'learn')}
          aria-current={activeView === 'learn' ? 'page' : undefined}
          aria-label="Learn"
        >
          <span className={iconWrapClass(activeView === 'learn')} aria-hidden="true">
            <GraduationCap
              className="h-[19px] w-[19px]"
              strokeWidth={activeView === 'learn' ? 2.2 : 1.85}
            />
          </span>
          <span>Learn</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('tasks')}
          className={tabClass(activeView === 'tasks')}
          aria-current={activeView === 'tasks' ? 'page' : undefined}
          aria-label="Planner"
        >
          <span className={iconWrapClass(activeView === 'tasks')} aria-hidden="true">
            <ListTodo className="h-[19px] w-[19px]" strokeWidth={activeView === 'tasks' ? 2.2 : 1.85} />
          </span>
          <span>Planner</span>
        </button>

        {onOpenMore ? (
          <button
            type="button"
            onClick={onOpenMore}
            className={tabClass(moreActive)}
            aria-current={moreActive ? 'page' : undefined}
            aria-label="More"
          >
            <span className={iconWrapClass(moreActive)} aria-hidden="true">
              <Ellipsis className="h-[19px] w-[19px]" strokeWidth={moreActive ? 2.2 : 1.85} />
            </span>
            <span>More</span>
          </button>
        ) : null}
      </div>
    </nav>
  )
}
