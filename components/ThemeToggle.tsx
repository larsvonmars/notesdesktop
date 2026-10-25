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
    <div ref={menuRef} className="fixed right-4 top-4 z-50">
      <button
        onClick={() => setIsOpen((previous) => !previous)}
        className="glass glass-round focus-ring flex h-10 w-10 items-center justify-center text-muted transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-foreground"
        title="Theme settings"
        aria-label={`Theme settings (${resolvedTheme})`}
        aria-expanded={isOpen}
        type="button"
      >
        <Sun size={17} strokeWidth={1.9} className="dark:hidden" />
        <Moon size={17} strokeWidth={1.9} className="hidden dark:block" />
      </button>

      {isOpen && (
        <div className="glass-popover absolute right-0 top-12 w-[19rem] animate-rise-in overflow-hidden rounded-2xl p-3">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              Appearance
            </h3>
          </div>

          <ThemeSelector compact onSelect={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  )
}