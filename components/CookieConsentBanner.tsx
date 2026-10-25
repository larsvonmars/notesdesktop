'use client'

import { useState, useEffect } from 'react'
import { Cookie } from 'lucide-react'

export default function CookieConsentBanner() {
  const [accepted, setAccepted] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('cookie-consent')
    if (!stored) setAccepted(false)
  }, [])

  if (accepted) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 sm:px-4"
      style={{ paddingBottom: 'calc(0.75rem + var(--sab))' }}
      role="region"
      aria-label="Cookie consent"
    >
      <div className="glass-strong animate-rise-in flex w-full max-w-3xl flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent"
            aria-hidden
          >
            <Cookie size={16} strokeWidth={1.9} />
          </span>
          <p className="text-sm leading-6 text-muted">
            This app uses cookies to remember your preferences and keep you signed in.
          </p>
        </div>
        <button
          onClick={() => { localStorage.setItem('cookie-consent', 'true'); setAccepted(true) }}
          className="glass-btn-primary h-9 shrink-0 self-end rounded-full px-5 text-[13px] font-medium text-accent-foreground transition-[filter,transform] duration-200 hover:brightness-105 active:scale-[0.985] sm:self-auto"
          type="button"
        >
          Accept
        </button>
      </div>
    </div>
  )
}