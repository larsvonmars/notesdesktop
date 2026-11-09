'use client'

import { useEffect, useState } from 'react'
import {
  Bell,
  Check,
  Loader2,
  Palette,
  Save,
  Settings2,
  ShieldAlert,
  UserCircle,
} from 'lucide-react'
import ThemeSelector from '@/components/ThemeSelector'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ToastProvider'
import { describeLearnError } from '@/lib/learn/db'
import {
  getProfile,
  updateProfile,
  updateStudyPreferences,
} from '@/lib/learn/stats'
import { useLearning } from '@/lib/learn/context'
import { cn } from '@/lib/learn/utils'

export function LearnSettings({
  onOpenAppSettings,
}: {
  onOpenAppSettings: () => void
}) {
  const { stats, refreshStats } = useLearning()
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [dailyGoal, setDailyGoal] = useState(20)
  const [streakReminder, setStreakReminder] = useState(true)
  const [prefsInitialised, setPrefsInitialised] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    getProfile()
      .then((profile) => {
        if (!active) return
        setUsername(profile.username ?? '')
        setEmail(profile.email ?? '')
      })
      .catch((error) => console.warn('Failed to load Learn profile:', error))
      .finally(() => {
        if (active) setProfileLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (stats && !prefsInitialised) {
      setDailyGoal(stats.dailyGoal ?? 20)
      setStreakReminder(stats.streakReminderEnabled ?? true)
      setPrefsInitialised(true)
    }
  }, [stats, prefsInitialised])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setSaved(false)
    try {
      const tasks: Array<Promise<unknown>> = [
        updateStudyPreferences({ dailyGoal, streakReminder }),
      ]
      if (username.trim())
        tasks.push(updateProfile({ username: username.trim() }))
      await Promise.all(tasks)
      await refreshStats()
      setSaved(true)
      toast.push({ title: 'Settings saved', variant: 'success' })
      window.setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      toast.push({
        title: 'Could not save settings',
        description: describeLearnError(error),
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 animate-rise-in">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-foreground">
          Study settings
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Preferences for your learning workspace.
        </p>
      </div>

      <section className="glass-card space-y-4 p-5">
        <SectionHeading icon={Palette} label="Appearance" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Theme</p>
            <p className="mt-0.5 text-xs text-muted">
              Light, dark or follow the system.
            </p>
          </div>
          <div className="sm:w-64">
            <ThemeSelector compact />
          </div>
        </div>
      </section>

      <section className="glass-card space-y-4 p-5">
        <SectionHeading icon={UserCircle} label="Profile" />
        <div>
          <label
            htmlFor="learn-display-name"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
          >
            Display name
          </label>
          <input
            id="learn-display-name"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Your name"
            disabled={profileLoading}
            className="glass-input h-10 w-full px-3.5 text-sm disabled:opacity-50"
          />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Email
          </p>
          <div className="glass-input flex h-10 items-center px-3.5 text-sm text-muted">
            {profileLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <span className="truncate">{email || 'Unknown'}</span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Email cannot be changed here.
          </p>
        </div>
      </section>

      <section className="glass-card space-y-4 p-5">
        <SectionHeading icon={Bell} label="Study" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Daily goal</p>
            <p className="mt-0.5 text-xs text-muted">
              Cards to review per day.
            </p>
          </div>
          <select
            value={dailyGoal}
            onChange={(event) => setDailyGoal(Number(event.target.value))}
            className="glass-input h-9 px-3 text-sm font-medium"
          >
            {[10, 20, 30, 50, 100].map((goal) => (
              <option key={goal} value={goal}>
                {goal} cards
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Streak reminder
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Show reminders to keep your streak alive.
            </p>
          </div>
          <Toggle
            checked={streakReminder}
            onChange={setStreakReminder}
            label="Streak reminder"
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={saved ? Check : Save}
          loading={saving}
          onClick={() => void handleSave()}
        >
          {saved ? 'Saved' : 'Save changes'}
        </Button>
      </div>

      <section className="glass-card space-y-4 p-5">
        <SectionHeading icon={ShieldAlert} label="Account" danger />
        <p className="text-sm leading-6 text-muted">
          Password, account deletion, data export and AI settings live in the
          app-wide settings.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={Settings2}
          onClick={onOpenAppSettings}
        >
          Open app settings
        </Button>
      </section>
    </div>
  )
}

function SectionHeading({
  icon: Icon,
  label,
  danger,
}: {
  icon: typeof Palette
  label: string
  danger?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-xl',
          danger ? 'bg-danger-light text-danger' : 'bg-accent-light text-accent'
        )}
      >
        <Icon size={14} />
      </span>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </h2>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-ring',
        checked
          ? 'border-accent/40 bg-accent'
          : 'border-border bg-surface-sunken'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  )
}
