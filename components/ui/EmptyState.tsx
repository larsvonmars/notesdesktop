'use client'

import { type ReactNode } from 'react'
import { type LucideIcon, FileText } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

function EmptyState({
  icon: Icon = FileText,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={['flex flex-col items-center justify-center px-6 py-16 text-center', className].join(' ')}>
      <div className="relative mb-5">
        <div
          className="absolute inset-0 rounded-2xl bg-[var(--accent-light)] blur-xl"
          aria-hidden
        />
        <div className="glass relative flex h-14 w-14 items-center justify-center rounded-2xl text-accent">
          <Icon className="h-6 w-6" strokeWidth={1.7} />
        </div>
      </div>
      <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export { EmptyState }
export type { EmptyStateProps }
