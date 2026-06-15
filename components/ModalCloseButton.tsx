'use client'

import { X } from 'lucide-react'

interface ModalCloseButtonProps {
  onClick: () => void
  ariaLabel?: string
  className?: string
  size?: number
}

export default function ModalCloseButton({
  onClick,
  ariaLabel = 'Close modal',
  className = '',
  size = 18,
}: ModalCloseButtonProps) {
  return (
    <button
      onClick={onClick}
      className={[
        'inline-flex h-9 w-9 items-center justify-center rounded-full',
        'text-muted hover:text-foreground',
        'hover:bg-surface-hover active:bg-surface-active',
        'transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        className,
      ].join(' ')}
      aria-label={ariaLabel}
      type="button"
    >
      <X size={size} />
    </button>
  )
}
