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
    <div className={['flex flex-col items-center justify-center text-center py-16 px-4', className].join(' ')}>
      <div className="rounded-2xl bg-surface-hover p-4 mb-4">
        <Icon className="h-8 w-8 text-muted" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted max-w-sm mb-4">{description}</p>
      )}
      {action}
    </div>
  )
}

export { EmptyState }
export type { EmptyStateProps }
