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
      type="button"
      aria-label={ariaLabel}
      className={[
        'focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        'text-muted transition-[background-color,color,transform] duration-150 ease-out',
        'hover:bg-[var(--surface-hover)] hover:text-foreground active:scale-95',
        className,
      ].join(' ')}
    >
      <X size={size} strokeWidth={1.9} />
    </button>
  )
}
