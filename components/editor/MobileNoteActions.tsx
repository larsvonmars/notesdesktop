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
 *
 * Visual language: a glass-strong sheet that floats over a soft scrim, with
 * quiet meta label + pill action tiles. Behaviour (Escape, scrim click, run
 * then close) is unchanged.
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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgb(14_12_32_/_0.42)] backdrop-blur-[3px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Note actions"
        className="floating-pop-in glass-strong w-full max-w-md rounded-t-3xl rounded-b-none px-3 pt-2.5"
        style={{ paddingBottom: 'calc(0.75rem + var(--sab))' }}
      >
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border-strong" aria-hidden />
        <div className="flex items-center justify-between px-1 pb-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Note actions
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close note actions"
            className="focus-ring flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X size={15} />
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
              className={`focus-ring flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-[12px] font-medium transition-colors touch-target disabled:cursor-not-allowed disabled:opacity-40 ${
                tone === 'danger'
                  ? 'border-danger bg-danger-light text-danger hover:border-danger hover:bg-danger-light'
                  : 'border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-hover'
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
