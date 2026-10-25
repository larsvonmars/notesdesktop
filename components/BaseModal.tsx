'use client'

import { useEffect, useCallback, useId, useRef, type ReactNode } from 'react'
import ModalCloseButton from './ModalCloseButton'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Open dialogs, innermost last — only the top one traps Tab. */
const modalStack: HTMLElement[] = []

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
  /** Accessible name when the dialog has no heading. Default: 'Dialog' */
  ariaLabel?: string
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
  ariaLabel = 'Dialog',
}: BaseModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

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

  // Dialog semantics: label from the first heading, focus trap, scroll lock.
  useEffect(() => {
    if (!isOpen || asView) return
    const card = cardRef.current
    if (!card) return

    const heading = card.querySelector<HTMLElement>('h1, h2, h3')
    if (heading) {
      if (!heading.id) heading.id = titleId
      card.setAttribute('aria-labelledby', heading.id)
      card.removeAttribute('aria-label')
    } else {
      card.setAttribute('aria-label', ariaLabel)
      card.removeAttribute('aria-labelledby')
    }

    const previouslyFocused = document.activeElement as HTMLElement | null
    const bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modalStack.push(card)

    const focusCard = () => card.focus({ preventScroll: true })
    const raf = requestAnimationFrame(focusCard)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      // Only the topmost dialog manages focus.
      if (modalStack[modalStack.length - 1] !== card) return

      const focusable = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => element.getClientRects().length > 0)

      if (focusable.length === 0) {
        event.preventDefault()
        card.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      const outside = !active || !card.contains(active)

      if (event.shiftKey && (active === first || active === card || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', handleKeyDown)
      const index = modalStack.lastIndexOf(card)
      if (index >= 0) modalStack.splice(index, 1)
      document.body.style.overflow = bodyOverflow
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [isOpen, asView, ariaLabel, titleId])

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
      <div className={`flex h-full w-full flex-col overflow-hidden bg-background text-foreground ${className}`}>
        {children}
      </div>
    )
  }

  // Entrance choreography comes from the glass stylesheet: .animate-fade-in
  // for the scrim and .animate-rise-in for the zoom variant.
  const backdropEnter = animation === 'none' ? '' : 'animate-fade-in'
  const cardEnter =
    animation === 'none' ? '' : animation === 'zoom' ? 'animate-rise-in' : 'animate-fade-in'

  return (
    <div
      className={[
        'fixed inset-0 flex items-center justify-center p-3 sm:p-6',
        'bg-black/30 dark:bg-black/60',
        backdropBlur ? 'backdrop-blur-md' : '',
        backdropEnter,
        backdropClassName,
      ].join(' ')}
      style={{ zIndex }}
      onClick={handleBackdropClick}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={[
          'glass-strong flex w-full flex-col overflow-hidden rounded-3xl',
          'focus:outline-none',
          SIZE_MAP[size],
          cardEnter,
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
  /** Show a subtle gradient sheen. Default: true */
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
    ? 'bg-gradient-to-b from-[var(--surface-hover)] to-transparent'
    : ''

  return (
    <div
      className={[
        'flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-6',
        'border-b border-[var(--border)]',
        gradientCls,
        className,
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {onClose && (
        <ModalCloseButton
          onClick={onClose}
          ariaLabel={closeAriaLabel}
          className="-mr-1.5 shrink-0"
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
  const paddingCls = noPadding ? '' : 'px-5 py-5 sm:px-6 sm:py-6'
  return (
    <div className={`scroll-thin flex-1 overflow-y-auto overscroll-contain ${paddingCls} ${className}`}>
      {children}
    </div>
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
        'shrink-0 border-t border-[var(--border)]',
        'bg-[var(--surface-sunken)] px-5 py-4 sm:px-6',
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
    <h2 className={`font-display text-base font-semibold leading-tight tracking-[-0.01em] text-foreground ${className}`}>
      {children}
    </h2>
  )
}