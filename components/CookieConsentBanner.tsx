'use client'

import { useState, useEffect } from 'react'

export default function CookieConsentBanner() {
  const [accepted, setAccepted] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('cookie-consent')
    if (!stored) setAccepted(false)
  }, [])

  if (accepted) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-surface border-t border-border shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-muted">
          This app uses cookies to remember your preferences and keep you signed in.
        </p>
        <button
          onClick={() => { localStorage.setItem('cookie-consent', 'true'); setAccepted(true) }}
          className="px-4 py-2 bg-accent text-accent-foreground text-sm font-medium rounded-xl hover:opacity-90 transition-opacity"
        >
          Accept
        </button>
      </div>
    </div>
  )
}
