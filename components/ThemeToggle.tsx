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
  const isDark = resolvedTheme === 'dark'

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
        className="p-2.5 rounded-full bg-white dark:bg-slate-800/90  border border-gray-200 dark:border-slate-700 shadow-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all"
        title="Theme settings"
        aria-label="Theme settings"
      >
        {isDark ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      {isOpen && (
        <div className="absolute top-12 right-0 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-white to-gray-50 dark:from-slate-900 dark:to-slate-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Appearance</h3>
          </div>

          <div className="p-3 space-y-2">
            <ThemeSelector compact onSelect={() => setIsOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
