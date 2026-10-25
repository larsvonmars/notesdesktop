"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export type Toast = {
  id: string
  title?: string
  description?: string
  duration?: number
  /** Default: 'info' */
  variant?: ToastVariant
  /** Optional action (e.g. Undo). Keeps the toast visible longer. */
  action?: ToastAction
}

type ToastContextValue = {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => string
  remove: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

const DEFAULT_DURATION = 3000

function resolveDuration(toast: Toast): number {
  if (typeof toast.duration === 'number') return toast.duration
  if (toast.variant === 'error') return 7000
  if (toast.variant === 'warning') return 6000
  if (toast.action) return 8000
  return DEFAULT_DURATION
}

const VARIANT_STYLES: Record<ToastVariant, { tint: string; icon: string; Icon: typeof Info }> = {
  info: {
    tint: 'bg-[var(--accent-light)]',
    icon: 'text-accent',
    Icon: Info,
  },
  success: {
    tint: 'bg-[var(--success-light)]',
    icon: 'text-success',
    Icon: CheckCircle2,
  },
  warning: {
    tint: 'bg-[var(--warning-light)]',
    icon: 'text-warning',
    Icon: AlertTriangle,
  },
  error: {
    tint: 'bg-[var(--danger-light)]',
    icon: 'text-danger',
    Icon: XCircle,
  },
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false)
  const variant = toast.variant ?? 'info'
  const { tint, icon, Icon } = VARIANT_STYLES[variant]

  // Hover/focus pauses the countdown so the action stays reachable.
  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => onDismiss(toast.id), resolveDuration(toast))
    return () => window.clearTimeout(timer)
  }, [toast, paused, onDismiss])

  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className="glass-strong animate-rise-in pointer-events-auto flex w-full items-start gap-3 rounded-2xl px-3.5 py-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tint} ${icon}`}
        aria-hidden
      >
        <Icon size={15} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        {toast.title && (
          <div className="text-[13px] font-semibold leading-snug text-foreground">{toast.title}</div>
        )}
        {toast.description && (
          <div className="mt-0.5 text-xs leading-relaxed text-muted">{toast.description}</div>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick()
              onDismiss(toast.id)
            }}
            className="focus-ring mt-2 inline-flex h-7 items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] font-semibold text-foreground transition-colors duration-150 hover:bg-[var(--surface-hover)]"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="focus-ring -mr-1 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-foreground"
        aria-label="Dismiss notification"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  )
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const toast: Toast = { id, ...t }
    setToasts((s) => [...s, toast])
    return id
  }, [])

  const remove = useCallback((id: string) => {
    setToasts((s) => s.filter((t) => t.id !== id))
  }, [])

  const value = useMemo(() => ({ toasts, push, remove }), [toasts, push, remove])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed right-3 top-16 z-[120] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-4"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export type { ToastContextValue }
