'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { THEME_OPTIONS, getResolvedThemeLabel, type Theme, useTheme } from '@/lib/theme-context'

interface ThemeSelectorProps {
  compact?: boolean
  onSelect?: () => void
}

const ICON_BY_THEME: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

export default function ThemeSelector({ compact = false, onSelect }: ThemeSelectorProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2'}>
      {THEME_OPTIONS.map(({ value, label, description }) => {
        const isActive = theme === value
        const Icon = ICON_BY_THEME[value]
        return (
          <button
            key={value}
            onClick={() => {
              setTheme(value)
              onSelect?.()
            }}
            className={`w-full flex items-center ${compact ? 'gap-3 px-3 py-2.5' : 'gap-4 px-4 py-3'} rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              isActive
                ? 'border-accent bg-accent-light ring-2 ring-accent/20'
                : 'border-border hover:border-border-strong hover:bg-surface-hover'
            }`}
          >
            <div
              className={`flex-shrink-0 rounded-full flex items-center justify-center ${
                compact ? 'w-8 h-8' : 'w-10 h-10'
              } ${
                isActive
                  ? 'bg-accent-light text-accent'
                  : 'bg-surface-hover text-muted'
              }`}
            >
              <Icon size={compact ? 16 : 20} />
            </div>

            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${isActive ? 'text-accent' : 'text-foreground'}`}>
                {label}
              </div>
              <div className="text-xs text-muted">{description}</div>
            </div>

            {isActive && !compact && (
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                <svg className="w-3 h-3 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        )
      })}

      {theme === 'system' && (
        <p className={`text-xs text-muted ${compact ? 'px-1 pt-1' : 'mt-2 px-1'}`}>
          Currently using <span className="font-medium text-foreground">{getResolvedThemeLabel(resolvedTheme)}</span> based on your system preference.
        </p>
      )}
    </div>
  )
}