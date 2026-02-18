'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export const THEME_OPTIONS: ReadonlyArray<{
  value: Theme
  label: string
  description: string
}> = [
  { value: 'light', label: 'Light', description: 'Always use light appearance' },
  { value: 'dark', label: 'Dark', description: 'Always use dark appearance' },
  { value: 'system', label: 'System', description: 'Match your operating system' },
]

export function getThemeLabel(theme: Theme): string {
  return THEME_OPTIONS.find((option) => option.value === theme)?.label ?? 'System'
}

export function getResolvedThemeLabel(resolvedTheme: 'light' | 'dark'): string {
  return resolvedTheme === 'dark' ? 'Dark' : 'Light'
}

interface ThemeContextValue {
  /** The resolved appearance — always 'light' or 'dark' */
  resolvedTheme: 'light' | 'dark'
  /** The user's preference — 'light', 'dark', or 'system' */
  theme: Theme
  /** Update the theme preference */
  setTheme: (theme: Theme) => void
  /** Convenience toggle between light ↔ dark (resets 'system' to explicit) */
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const STORAGE_KEY = 'theme'

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return getSystemPreference()
  return theme
}

function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
    return 'system'
  })

  const resolvedTheme = resolveTheme(theme)

  // Apply the class whenever resolvedTheme changes
  useEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  // Listen for system preference changes when theme === 'system'
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme(resolveTheme('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    localStorage.setItem(STORAGE_KEY, next)
    applyTheme(resolveTheme(next))
  }, [])

  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }, [resolvedTheme, setTheme])

  return (
    <ThemeContext.Provider value={{ resolvedTheme, theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
