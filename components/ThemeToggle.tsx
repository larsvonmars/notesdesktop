'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { Moon, Sun } from 'lucide-react'
import ThemeSelector from './ThemeSelector'

/**
 * Floating theme control for login/signup pages.
 */

export default function ThemeToggle() {
  const { resolvedTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current) return
      if (event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div ref={menuRef} className="fixed top-4 right-4 z-50">
      <button
        onClick={() => setIsOpen((previous) => !previous)}
        className="p-2.5 rounded-full bg-surface border border-border shadow-sm text-muted hover:text-foreground hover:bg-surface-hover transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        title="Theme settings"
        aria-label={`Theme settings (${resolvedTheme})`}
        aria-expanded={isOpen}
      >
        <Sun size={18} className="dark:hidden" />
        <Moon size={18} className="hidden dark:block" />
      </button>

      {isOpen && (
        <div className="absolute top-12 right-0 w-80 bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-surface to-surface-hover/60">
            <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
          </div>

          <div className="p-3 space-y-2">
            <ThemeSelector compact onSelect={() => setIsOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
