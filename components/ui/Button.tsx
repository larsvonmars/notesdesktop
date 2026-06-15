'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: LucideIcon
  children?: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-foreground hover:opacity-90 active:opacity-80 shadow-sm',
  secondary:
    'bg-surface border border-border text-foreground hover:bg-surface-hover active:bg-surface-active',
  ghost:
    'text-foreground hover:bg-surface-hover active:bg-surface-active',
  danger:
    'bg-danger text-white hover:opacity-90 active:opacity-80 shadow-sm',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2 text-sm gap-2 rounded-xl',
  lg: 'px-5 py-2.5 text-base gap-2.5 rounded-xl',
}

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  sm: 'p-1.5 rounded-lg',
  md: 'p-2 rounded-xl',
  lg: 'p-2.5 rounded-xl',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      icon: Icon,
      children,
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    const isIconOnly = Icon && !children
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'select-none touch-target',
          variantClasses[variant],
          isIconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        ) : Icon ? (
          <Icon className="h-4 w-4 shrink-0" />
        ) : null}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'

export { Button }
export type { ButtonProps, ButtonVariant, ButtonSize }
