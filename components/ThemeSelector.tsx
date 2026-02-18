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
            className={`w-full flex items-center ${compact ? 'gap-3 px-3 py-2.5' : 'gap-4 px-4 py-3'} rounded-xl border text-left transition-all ${
              isActive
                ? 'border-alpine-500 dark:border-alpine-400 bg-alpine-50 dark:bg-alpine-900/20 ring-2 ring-alpine-500/20 dark:ring-alpine-400/30'
                : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <div
              className={`flex-shrink-0 rounded-full flex items-center justify-center ${
                compact ? 'w-8 h-8' : 'w-10 h-10'
              } ${
                isActive
                  ? 'bg-alpine-100 dark:bg-alpine-800/40 text-alpine-600 dark:text-alpine-300'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
              }`}
            >
              <Icon size={compact ? 16 : 20} />
            </div>

            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${isActive ? 'text-alpine-700 dark:text-alpine-200' : 'text-gray-900 dark:text-slate-100'}`}>
                {label}
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400">{description}</div>
            </div>

            {isActive && !compact && (
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-alpine-600 dark:bg-alpine-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        )
      })}

      {theme === 'system' && (
        <p className={`text-xs text-gray-500 dark:text-slate-400 ${compact ? 'px-1 pt-1' : 'mt-2 px-1'}`}>
          Currently using <span className="font-medium text-gray-700 dark:text-slate-200">{getResolvedThemeLabel(resolvedTheme)}</span> based on your system preference.
        </p>
      )}
    </div>
  )
}