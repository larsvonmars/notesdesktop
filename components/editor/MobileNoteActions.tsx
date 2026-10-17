'use client'

import { useEffect } from 'react'
import { X, type LucideIcon } from 'lucide-react'

export interface MobileNoteAction {
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'danger'
}

interface MobileNoteActionsProps {
  isOpen: boolean
  onClose: () => void
  actions: MobileNoteAction[]
}

/**
 * Bottom-sheet action menu for phones, where the details sidebar is not
 * rendered at all. Each action runs and then closes the sheet.
 */
export default function MobileNoteActions({ isOpen, onClose, actions }: MobileNoteActionsProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Note actions"
        className="w-full max-w-md rounded-t-2xl border-t border-border bg-surface p-3 shadow-2xl"
        style={{ paddingBottom: 'calc(0.75rem + var(--sab))' }}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong/60" aria-hidden />
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-sm font-semibold text-foreground">Note actions</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close note actions"
            className="rounded-md p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {actions.map(({ label, icon: Icon, onClick, disabled, tone = 'default' }) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => {
                onClick()
                onClose()
              }}
              className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border border-border px-2 py-3 text-[12px] font-medium transition-colors touch-target disabled:cursor-not-allowed disabled:opacity-40 ${
                tone === 'danger'
                  ? 'text-danger hover:bg-danger-light'
                  : 'text-foreground hover:bg-surface-hover'
              }`}
            >
              <Icon size={18} aria-hidden />
              <span className="text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
