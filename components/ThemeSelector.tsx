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
  const activeOption = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2]

  return (
    <div className="space-y-2.5">
      <div className="segmented w-full" role="group" aria-label="Appearance">
        {THEME_OPTIONS.map(({ value, label }) => {
          const isActive = theme === value
          const Icon = ICON_BY_THEME[value]
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                setTheme(value)
                onSelect?.()
              }}
              className={[
                'segmented-item flex-1 justify-center rounded-full',
                'transition-colors duration-150 ease-out',
                compact ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-[13px]',
              ].join(' ')}
            >
              <Icon size={compact ? 13 : 15} strokeWidth={1.9} aria-hidden />
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      <p className="px-0.5 text-xs leading-5 text-muted">
        {theme === 'system' ? (
          <>
            Currently using{' '}
            <span className="font-medium text-foreground">{getResolvedThemeLabel(resolvedTheme)}</span>{' '}
            based on your system preference.
          </>
        ) : (
          activeOption.description
        )}
      </p>
    </div>
  )
}
