/**
 * Device-local planner preferences: display options, planning mode and
 * notification behaviour. Safe to read during render (guarded by `window`).
 */

import type {
  CalendarViewMode,
  NotificationSettings,
  PlannerDisplayPreferences,
  PlanningMode,
} from './types'

const DISPLAY_KEY = 'planner:display-prefs:v1'
const NOTIFICATION_KEY = 'planner:notification-settings:v1'

export const DEFAULT_DISPLAY_PREFERENCES: PlannerDisplayPreferences = {
  weekStartsOn: 1,
  dayStartHour: 6,
  dayEndHour: 23,
  defaultCalendarView: 'month',
  planningMode: 'adaptive',
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  overdueTaskAlerts: true,
  upcomingEventAlerts: true,
  eventReminderMinutes: 15,
  urgentTaskAlerts: true,
  checkIntervalMinutes: 5,
}

export function loadDisplayPreferences(): PlannerDisplayPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_DISPLAY_PREFERENCES }
  try {
    const raw = window.localStorage.getItem(DISPLAY_KEY)
    if (!raw) return { ...DEFAULT_DISPLAY_PREFERENCES }
    return { ...DEFAULT_DISPLAY_PREFERENCES, ...(JSON.parse(raw) as Partial<PlannerDisplayPreferences>) }
  } catch {
    return { ...DEFAULT_DISPLAY_PREFERENCES }
  }
}

export function saveDisplayPreferences(preferences: PlannerDisplayPreferences): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISPLAY_KEY, JSON.stringify(preferences))
  } catch {
    // ignore
  }
}

export function loadPlanningMode(): PlanningMode {
  return loadDisplayPreferences().planningMode
}

export function savePlanningMode(mode: PlanningMode): void {
  saveDisplayPreferences({ ...loadDisplayPreferences(), planningMode: mode })
}

export function loadCalendarView(): CalendarViewMode {
  return loadDisplayPreferences().defaultCalendarView
}

export function saveCalendarView(view: CalendarViewMode): void {
  saveDisplayPreferences({ ...loadDisplayPreferences(), defaultCalendarView: view })
}

export function loadNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_NOTIFICATION_SETTINGS }
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_KEY)
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS }
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(JSON.parse(raw) as Partial<NotificationSettings>),
    }
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}
