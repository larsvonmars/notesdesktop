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
      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${className}`}
      aria-label={ariaLabel}
      type="button"
    >
      <X size={size} />
    </button>
  )
}