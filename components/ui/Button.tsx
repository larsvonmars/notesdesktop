'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass' | 'glassPrimary'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: LucideIcon
  children?: ReactNode
}

/**
 * Glass design-system buttons.
 *
 * - `primary` / `glassPrimary` — accent gradient CTA (.glass-btn-primary)
 * - `secondary` / `glass`      — neutral frosted button (.glass-btn)
 * - `ghost`                    — borderless icon action (.glass-btn-ghost)
 * - `danger`                   — destructive, solid token colour
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'glass-btn-primary font-semibold text-accent-foreground',
  glassPrimary:
    'glass-btn-primary font-semibold text-accent-foreground',
  secondary:
    'glass-btn text-foreground',
  glass:
    'glass-btn text-foreground',
  ghost:
    'glass-btn-ghost text-foreground',
  danger:
    'bg-danger font-semibold text-accent-foreground shadow-sm hover:brightness-105 active:brightness-95',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-full px-3 text-xs',
  md: 'h-9 gap-2 rounded-full px-3.5 text-[13px]',
  lg: 'h-11 gap-2 rounded-full px-5 text-sm',
}

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 rounded-full',
  md: 'h-9 w-9 rounded-full',
  lg: 'h-11 w-11 rounded-full',
}

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-[18px] w-[18px]',
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
    const isIconOnly = Boolean(Icon) && !children
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={[
          'inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
          'transition-[background-color,box-shadow,transform,color,opacity] duration-200 ease-out',
          'active:scale-[0.985]',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
          'max-sm:min-h-[44px] max-sm:min-w-[44px]',
          variantClasses[variant],
          isIconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
          variant === 'ghost' && !isIconOnly ? 'w-auto' : '',
          className,
        ].join(' ')}
        {...props}
      >
        {loading ? (
          <Loader2 className={`${iconSizeClasses[size]} shrink-0 animate-spin`} aria-hidden />
        ) : Icon ? (
          <Icon className={`${iconSizeClasses[size]} shrink-0`} strokeWidth={1.9} aria-hidden />
        ) : null}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'

export { Button }
export type { ButtonProps, ButtonVariant, ButtonSize }