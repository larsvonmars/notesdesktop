'use client'

import { type ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-[var(--border)] bg-[var(--surface-sunken)] text-foreground',
  success: 'border-[var(--success-light)] bg-[var(--success-light)] text-success',
  warning: 'border-[var(--warning-light)] bg-[var(--warning-light)] text-warning',
  danger: 'border-[var(--danger-light)] bg-[var(--danger-light)] text-danger',
  info: 'border-[var(--accent-light)] bg-[var(--accent-light)] text-accent',
}

function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px]',
        'text-[11px] font-medium leading-4 tracking-[0.01em]',
        'backdrop-blur-sm',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}

export { Badge }
export type { BadgeProps, BadgeVariant }
