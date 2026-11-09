'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Task, TaskPriority, TaskStatus } from '@/lib/tasks'

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; short: string; className: string; dot: string; color: string }
> = {
  urgent: {
    label: 'Urgent',
    short: '!!',
    className: 'text-danger',
    dot: 'bg-danger',
    color: '#d93d5a',
  },
  high: {
    label: 'High',
    short: '!',
    className: 'text-orange-600 dark:text-orange-400',
    dot: 'bg-orange-500',
    color: '#ea580c',
  },
  medium: {
    label: 'Medium',
    short: '−',
    className: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    color: '#d97706',
  },
  low: {
    label: 'Low',
    short: '↓',
    className: 'text-muted',
    dot: 'bg-muted',
    color: '#6b7280',
  },
}

export const STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  todo: { label: 'To do', className: 'bg-[var(--surface-sunken)] text-muted' },
  in_progress: { label: 'In progress', className: 'bg-[var(--accent-light)] text-accent' },
  waiting: { label: 'Waiting', className: 'bg-[var(--warning-light)] text-warning' },
  completed: { label: 'Completed', className: 'bg-[var(--success-light)] text-success' },
  cancelled: { label: 'Cancelled', className: 'bg-[var(--surface-sunken)] text-muted' },
}

export const STATUS_ORDER: TaskStatus[] = [
  'todo',
  'in_progress',
  'waiting',
  'completed',
  'cancelled',
]

export const CALENDAR_CATEGORIES = [
  'work',
  'personal',
  'focus',
  'meeting',
  'exercise',
  'social',
  'timetable',
] as const

export const CATEGORY_COLORS: Record<string, string> = {
  work: '#16a34a',
  personal: '#10b981',
  focus: '#f59e0b',
  meeting: '#ec4899',
  exercise: '#14b8a6',
  social: '#84cc16',
  timetable: '#6366f1',
}

export const COLOR_SWATCHES = [
  '#16a34a',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#84cc16',
  '#f97316',
  '#6366f1',
  '#2f9bff',
  '#f45d8c',
]

export const FIELD_CLASS = 'glass-input h-10 px-3.5 text-sm'
export const TEXTAREA_CLASS =
  'glass-input h-auto min-h-[80px] w-full resize-none px-3.5 py-2.5 text-sm leading-6'
export const SELECT_CLASS = 'glass-input h-10 px-3 text-sm'
export const LABEL_CLASS =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted'

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const meta = PRIORITY_META[priority]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${meta.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  )
}

export function ProgressBar({
  value,
  className = '',
  tone = 'accent',
}: {
  value: number
  className?: string
  tone?: 'accent' | 'danger' | 'warning'
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  const toneClass =
    tone === 'danger' ? 'bg-danger' : tone === 'warning' ? 'bg-warning' : 'bg-accent'
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)] ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full transition-[width] duration-300 ${toneClass}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  id?: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-4 text-muted">{description}</span>}
      </span>
      <span
        className={`relative mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-[var(--border-strong)]'
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </label>
  )
}

export interface SegmentOption<T extends string> {
  key: T
  label: string
  icon?: LucideIcon
  count?: number
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <div className={`segmented ${className}`} role="tablist" aria-label={ariaLabel}>
      {options.map(({ key, label, icon: Icon, count }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          data-active={value === key}
          onClick={() => onChange(key)}
          className="segmented-item h-8 gap-1.5 px-3 text-[12px]"
        >
          {Icon && <Icon size={13} />}
          {label}
          {typeof count === 'number' && (
            <span className="tabular-nums opacity-60">{count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

export function PlannerEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="glass-card flex flex-col items-center px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-light)] text-accent">
        <Icon size={22} />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-5 text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PanelHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function ProgressRing({
  value,
  size = 64,
  label,
}: {
  value: number
  size?: number
  label?: string
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const dash = (clamped / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <span className="absolute text-[13px] font-semibold tabular-nums text-foreground">
        {label ?? `${clamped}%`}
      </span>
    </div>
  )
}

/** Compact "Due today / Tomorrow / Mon 4" label for a task. */
export function dueLabel(task: Task, now = new Date()): string {
  if (!task.due_date) return 'No date'
  const due = new Date(task.due_date)
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diffDays = Math.round((dueDay - today) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays < 7) {
    return due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
