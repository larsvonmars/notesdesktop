'use client'

import { useEffect, useCallback, type ReactNode } from 'react'
import ModalCloseButton from './ModalCloseButton'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full'

interface BaseModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  /** Modal width preset. Default: 'lg' */
  size?: ModalSize
  /** Custom max-height. Default: '82vh' */
  maxHeight?: string
  /** z-index layer. Default: 50 */
  zIndex?: number
  /** Use blur on backdrop. Default: true (modern default) */
  backdropBlur?: boolean
  /** Close when clicking outside the modal. Default: true */
  closeOnBackdropClick?: boolean
  /** Close when pressing Escape. Default: true */
  closeOnEscape?: boolean
  /** Render as full view (no overlay, fills parent). Default: false */
  asView?: boolean
  /** Extra classes on the backdrop wrapper */
  backdropClassName?: string
  /** Extra classes on the modal card */
  className?: string
  /** Entry animation. Default: 'fade' */
  animation?: 'fade' | 'zoom' | 'none'
}

const SIZE_MAP: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  full: 'max-w-7xl',
}

export default function BaseModal({
  isOpen,
  onClose,
  children,
  size = 'lg',
  maxHeight = '82vh',
  zIndex = 50,
  backdropBlur = true,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  asView = false,
  backdropClassName = '',
  className = '',
  animation = 'fade',
}: BaseModalProps) {
  // Escape key handler
  useEffect(() => {
    if (!isOpen || !closeOnEscape || asView) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeOnEscape, onClose, asView])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (closeOnBackdropClick && e.target === e.currentTarget) onClose()
    },
    [closeOnBackdropClick, onClose],
  )

  if (!isOpen && !asView) return null

  // Full-view mode: no overlay, just fill the parent
  if (asView) {
    return (
      <div className={`h-full w-full flex flex-col overflow-hidden bg-background ${className}`}>
        {children}
      </div>
    )
  }

  const blurClass = backdropBlur ? 'backdrop-blur-sm' : ''

  const animationCls =
    animation === 'zoom'
      ? 'animate-in fade-in zoom-in-95 duration-200'
      : animation === 'fade'
        ? 'animate-in fade-in duration-200'
        : ''

  return (
    <div
      className={[
        'fixed inset-0 flex items-center justify-center p-3 sm:p-6',
        'bg-black/40',
        blurClass,
        animationCls,
        backdropClassName,
      ].join(' ')}
      style={{ zIndex }}
      onClick={handleBackdropClick}
    >
      <div
        className={[
          'w-full',
          SIZE_MAP[size],
          'bg-surface rounded-2xl shadow-xl border border-border',
          'flex flex-col overflow-hidden',
          className,
        ].join(' ')}
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/* ─── Sub-components for consistent structure ───────────────────────── */

interface ModalHeaderProps {
  children: ReactNode
  onClose?: () => void
  closeAriaLabel?: string
  /** Extra classes on the header bar */
  className?: string
  /** Show gradient background. Default: true */
  gradient?: boolean
}

export function ModalHeader({
  children,
  onClose,
  closeAriaLabel = 'Close modal',
  className = '',
  gradient = true,
}: ModalHeaderProps) {
  const gradientCls = gradient
    ? 'bg-gradient-to-b from-surface to-surface-hover/50 dark:from-surface dark:to-surface-hover/30'
    : ''

  return (
    <div
      className={[
        'flex items-center justify-between px-5 py-4',
        'border-b border-border shrink-0',
        gradientCls,
        className,
      ].join(' ')}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">{children}</div>
      {onClose && (
        <ModalCloseButton
          onClick={onClose}
          ariaLabel={closeAriaLabel}
          className="shrink-0 ml-3"
        />
      )}
    </div>
  )
}

interface ModalBodyProps {
  children: ReactNode
  /** Extra classes. Default has padding + scroll. */
  className?: string
  /** Disable default padding. Default: false */
  noPadding?: boolean
}

export function ModalBody({ children, className = '', noPadding = false }: ModalBodyProps) {
  const paddingCls = noPadding ? '' : 'px-5 py-5'
  return (
    <div className={`flex-1 overflow-y-auto ${paddingCls} ${className}`}>{children}</div>
  )
}

interface ModalFooterProps {
  children: ReactNode
  className?: string
}

export function ModalFooter({ children, className = '' }: ModalFooterProps) {
  return (
    <div
      className={[
        'border-t border-border px-5 py-4 shrink-0',
        'bg-surface-hover/30',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

/** Convenience title component */
interface ModalTitleProps {
  children: ReactNode
  className?: string
}

export function ModalTitle({ children, className = '' }: ModalTitleProps) {
  return (
    <h2 className={`text-lg font-semibold text-foreground ${className}`}>
      {children}
    </h2>
  )
}
