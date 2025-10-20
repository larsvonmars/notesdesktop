"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type Toast = {
  id: string
  title?: string
  description?: string
  duration?: number
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

  useEffect(() => {
    const timers: Array<{ id: string; timer: number }> = []
    toasts.forEach((t) => {
      const dur = typeof t.duration === 'number' ? t.duration : 3000
      const timer = window.setTimeout(() => remove(t.id), dur)
      timers.push({ id: t.id, timer })
    })
    return () => {
      timers.forEach((t) => window.clearTimeout(t.timer))
    }
  }, [toasts, remove])

  const value = useMemo(() => ({ toasts, push, remove }), [toasts, push, remove])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="fixed right-4 top-16 z-50 flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="max-w-xs w-full bg-black/85 text-white px-3 py-2 rounded shadow-lg border border-gray-800"
            onClick={() => remove(t.id)}
          >
            {t.title && <div className="font-semibold text-sm">{t.title}</div>}
            {t.description && <div className="text-xs mt-0.5">{t.description}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export type { Toast }
