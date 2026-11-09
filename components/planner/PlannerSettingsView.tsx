'use client'

import {
  BellRing,
  CalendarRange,
  CheckCircle2,
  Download,
  Info,
  Keyboard,
  Trash2,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type {
  NotificationSettings,
  PlannerDisplayPreferences,
  PlanningMode,
} from '@/lib/planner/types'
import { FIELD_CLASS, LABEL_CLASS, SELECT_CLASS, SectionCardHeader, ToggleSwitch } from './PlannerUi'

export interface PlannerSettingsViewProps {
  display: PlannerDisplayPreferences
  notifications: NotificationSettings
  taskCount: number
  eventCount: number
  planCount: number
  onDisplayChange: (update: Partial<PlannerDisplayPreferences>) => void
  onNotificationsChange: (update: Partial<NotificationSettings>) => void
  onExportIcs: () => void
  onClearCompleted: () => void
  onClearPlans: () => void
}

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '← / →', action: 'Previous / next period' },
  { keys: 'T', action: 'Jump to today' },
  { keys: 'M / W / D / A', action: 'Month / week / day / agenda' },
  { keys: '↑ / ↓', action: 'Zoom between week and day' },
  { keys: 'Enter', action: 'Open focused task or day' },
  { keys: 'Esc', action: 'Close panels and dialogs' },
]

export default function PlannerSettingsView({
  display,
  notifications,
  taskCount,
  eventCount,
  planCount,
  onDisplayChange,
  onNotificationsChange,
  onExportIcs,
  onClearCompleted,
  onClearPlans,
}: PlannerSettingsViewProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="glass-card p-4">
        <SectionCardHeader
          icon={Wand2}
          title="Smart planner"
          subtitle="Choose how the scheduler ranks tasks and places them in your day."
        />

        <div className="mt-3 space-y-2">
          {(
            [
              {
                mode: 'adaptive' as PlanningMode,
                title: 'Adaptive',
                description:
                  'Learns your peak hours, batches related tasks and protects deadlines.',
              },
              {
                mode: 'standard' as PlanningMode,
                title: 'Standard',
                description: 'Simple priority-first, first-fit scheduling.',
              },
            ]
          ).map((option) => {
            const active = display.planningMode === option.mode
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => onDisplayChange({ planningMode: option.mode })}
                aria-pressed={active}
                className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-accent bg-[var(--accent-light)]'
                    : 'border-[var(--border)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    active ? 'border-accent bg-accent text-accent-foreground' : 'border-[var(--border-strong)]'
                  }`}
                >
                  {active && <CheckCircle2 size={10} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-foreground">
                    {option.title}
                  </span>
                  <span className="block text-[10px] leading-4 text-muted">
                    {option.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="glass-card p-4">
        <SectionCardHeader icon={CalendarRange} title="Calendar display" />
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor="week-start">
                Week starts on
              </label>
              <select
                id="week-start"
                value={display.weekStartsOn}
                onChange={(event) =>
                  onDisplayChange({ weekStartsOn: Number(event.target.value) === 1 ? 1 : 0 })
                }
                className={SELECT_CLASS}
              >
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="default-view">
                Default view
              </label>
              <select
                id="default-view"
                value={display.defaultCalendarView}
                onChange={(event) =>
                  onDisplayChange({
                    defaultCalendarView: event.target.value as PlannerDisplayPreferences['defaultCalendarView'],
                  })
                }
                className={SELECT_CLASS}
              >
                <option value="month">Month</option>
                <option value="week">Week</option>
                <option value="day">Day</option>
                <option value="agenda">Agenda</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor="day-start">
                Day grid starts
              </label>
              <input
                id="day-start"
                type="number"
                min={0}
                max={23}
                value={display.dayStartHour}
                onChange={(event) =>
                  onDisplayChange({
                    dayStartHour: Math.max(0, Math.min(23, Number(event.target.value))),
                  })
                }
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="day-end">
                Day grid ends
              </label>
              <input
                id="day-end"
                type="number"
                min={1}
                max={24}
                value={display.dayEndHour}
                onChange={(event) =>
                  onDisplayChange({
                    dayEndHour: Math.max(1, Math.min(24, Number(event.target.value))),
                  })
                }
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-[10px] leading-4 text-muted">
            <Info size={11} className="mt-0.5 shrink-0" />
            The grid range applies to the week and day calendar views and to double-click creation.
          </p>
        </div>
      </section>

      <section className="glass-card p-4">
        <SectionCardHeader
          icon={BellRing}
          tone="warning"
          title="Reminders"
          subtitle="In-app reminders appear while Notes is open."
        />
        <div className="mt-3 space-y-3">
          <ToggleSwitch
            label="Enable reminders"
            description="Master switch for all planner alerts"
            checked={notifications.enabled}
            onChange={(checked) => onNotificationsChange({ enabled: checked })}
          />
          <ToggleSwitch
            label="Overdue tasks"
            description="Warn about tasks whose due date has passed"
            checked={notifications.overdueTaskAlerts}
            onChange={(checked) => onNotificationsChange({ overdueTaskAlerts: checked })}
          />
          <ToggleSwitch
            label="Urgent tasks due today"
            description="Alert for urgent or high priority tasks due today"
            checked={notifications.urgentTaskAlerts}
            onChange={(checked) => onNotificationsChange({ urgentTaskAlerts: checked })}
          />
          <ToggleSwitch
            label="Upcoming events"
            description="Remind before an event starts"
            checked={notifications.upcomingEventAlerts}
            onChange={(checked) => onNotificationsChange({ upcomingEventAlerts: checked })}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor="event-lead">
                Event lead time
              </label>
              <select
                id="event-lead"
                value={notifications.eventReminderMinutes}
                onChange={(event) =>
                  onNotificationsChange({ eventReminderMinutes: Number(event.target.value) })
                }
                className={SELECT_CLASS}
              >
                {[5, 10, 15, 30, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min before
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="check-interval">
                Check every
              </label>
              <select
                id="check-interval"
                value={notifications.checkIntervalMinutes}
                onChange={(event) =>
                  onNotificationsChange({ checkIntervalMinutes: Number(event.target.value) })
                }
                className={SELECT_CLASS}
              >
                {[1, 5, 10, 15, 30].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card p-4">
        <SectionCardHeader
          icon={Download}
          title="Data"
          subtitle={`${taskCount} tasks · ${eventCount} events · ${planCount} saved plans`}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" icon={Download} onClick={onExportIcs}>
            Export calendar (.ics)
          </Button>
          <Button type="button" variant="ghost" size="sm" icon={CheckCircle2} onClick={onClearCompleted}>
            Archive completed tasks
          </Button>
          <Button type="button" variant="ghost" size="sm" icon={Trash2} onClick={onClearPlans}>
            Delete all plans
          </Button>
        </div>
      </section>

      <section className="glass-card p-4 lg:col-span-2">
        <SectionCardHeader icon={Keyboard} tone="muted" title="Keyboard shortcuts" />
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center gap-2 text-[11px] text-muted">
              <kbd className="kbd shrink-0">{shortcut.keys}</kbd>
              {shortcut.action}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
