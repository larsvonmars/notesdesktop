import { supabase } from './supabase'
import { isTauriEnvironment } from './webview-polyfills'
import { getReminders, markReminderAsSent, type Reminder } from './events'
import { getTasks, type Task } from './tasks'

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType = 'reminder' | 'task_due' | 'task_overdue' | 'info' | 'warning'
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  priority: NotificationPriority
  timestamp: Date
  read: boolean
  dismissed: boolean
  /** Associated task ID */
  taskId?: string
  /** Associated event ID */
  eventId?: string
  /** Associated reminder ID */
  reminderId?: string
  /** Action to perform when notification is clicked */
  action?: {
    type: 'open_task' | 'open_event' | 'open_note' | 'custom'
    payload?: string
  }
}

export interface NotificationPreferences {
  enabled: boolean
  /** Show native OS notifications */
  nativeEnabled: boolean
  /** Show in-app toast notifications */
  toastEnabled: boolean
  /** Play sound on notification */
  soundEnabled: boolean
  /** Minutes before due date to notify */
  taskDueReminderMinutes: number
  /** Check interval in seconds */
  pollIntervalSeconds: number
  /** Notify about overdue tasks */
  notifyOverdue: boolean
  /** Quiet hours start (HH:MM format) */
  quietHoursStart: string | null
  /** Quiet hours end (HH:MM format) */
  quietHoursEnd: string | null
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  nativeEnabled: true,
  toastEnabled: true,
  soundEnabled: false,
  taskDueReminderMinutes: 30,
  pollIntervalSeconds: 60,
  notifyOverdue: true,
  quietHoursStart: null,
  quietHoursEnd: null,
}

// ============================================================================
// NOTIFICATION STORE (in-memory)
// ============================================================================

type NotificationListener = (notifications: AppNotification[]) => void

let notifications: AppNotification[] = []
let listeners: NotificationListener[] = []
let preferences: NotificationPreferences = { ...DEFAULT_PREFERENCES }
let pollInterval: ReturnType<typeof setInterval> | null = null
let isPolling = false

/** Processed reminder and task IDs to avoid duplicate notifications */
const processedReminderIds = new Set<string>()
const processedTaskDueIds = new Set<string>()

function generateId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

function notifyListeners() {
  const current = [...notifications]
  listeners.forEach(fn => fn(current))
}

// ============================================================================
// SUBSCRIBE / UNSUBSCRIBE
// ============================================================================

export function subscribeToNotifications(listener: NotificationListener): () => void {
  listeners.push(listener)
  // Immediately notify with current state
  listener([...notifications])
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

// ============================================================================
// NOTIFICATION CRUD
// ============================================================================

export function getNotifications(): AppNotification[] {
  return [...notifications]
}

export function getUnreadCount(): number {
  return notifications.filter(n => !n.read && !n.dismissed).length
}

export function addNotification(
  notification: Omit<AppNotification, 'id' | 'timestamp' | 'read' | 'dismissed'>
): AppNotification {
  const newNotif: AppNotification = {
    ...notification,
    id: generateId(),
    timestamp: new Date(),
    read: false,
    dismissed: false,
  }
  notifications = [newNotif, ...notifications]
  // Keep max 100 notifications in memory
  if (notifications.length > 100) {
    notifications = notifications.slice(0, 100)
  }
  notifyListeners()
  return newNotif
}

export function markAsRead(id: string): void {
  notifications = notifications.map(n =>
    n.id === id ? { ...n, read: true } : n
  )
  notifyListeners()
}

export function markAllAsRead(): void {
  notifications = notifications.map(n => ({ ...n, read: true }))
  notifyListeners()
}

export function dismissNotification(id: string): void {
  notifications = notifications.map(n =>
    n.id === id ? { ...n, dismissed: true } : n
  )
  notifyListeners()
}

export function clearAllNotifications(): void {
  notifications = []
  notifyListeners()
}

// ============================================================================
// PREFERENCES
// ============================================================================

export function getPreferences(): NotificationPreferences {
  return { ...preferences }
}

export function updatePreferences(updates: Partial<NotificationPreferences>): void {
  preferences = { ...preferences, ...updates }
  // Persist to localStorage
  try {
    localStorage.setItem('notification_preferences', JSON.stringify(preferences))
  } catch {}
  // Restart polling with new interval if changed
  if (updates.pollIntervalSeconds || updates.enabled !== undefined) {
    stopPolling()
    if (preferences.enabled) {
      startPolling()
    }
  }
}

export function loadPreferences(): NotificationPreferences {
  try {
    const stored = localStorage.getItem('notification_preferences')
    if (stored) {
      preferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) }
    }
  } catch {}
  return { ...preferences }
}

// ============================================================================
// QUIET HOURS
// ============================================================================

function isInQuietHours(): boolean {
  if (!preferences.quietHoursStart || !preferences.quietHoursEnd) return false

  const now = new Date()
  const [startH, startM] = preferences.quietHoursStart.split(':').map(Number)
  const [endH, endM] = preferences.quietHoursEnd.split(':').map(Number)

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  if (startMinutes <= endMinutes) {
    // Same day range (e.g., 22:00 - 23:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  } else {
    // Overnight range (e.g., 22:00 - 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes
  }
}

// ============================================================================
// NATIVE NOTIFICATIONS (Browser + Tauri)
// ============================================================================

let nativePermissionGranted = false

export async function requestNativePermission(): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification')
      let permitted = await isPermissionGranted()
      if (!permitted) {
        const result = await requestPermission()
        permitted = result === 'granted'
      }
      nativePermissionGranted = permitted
      return permitted
    } catch (e) {
      console.warn('Tauri notification plugin not available:', e)
      return false
    }
  } else {
    // Browser Notification API
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') {
      nativePermissionGranted = true
      return true
    }
    if (Notification.permission !== 'denied') {
      const result = await Notification.requestPermission()
      nativePermissionGranted = result === 'granted'
      return nativePermissionGranted
    }
    return false
  }
}

export async function sendNativeNotification(title: string, body: string, options?: {
  icon?: string
  tag?: string
}): Promise<void> {
  if (!preferences.nativeEnabled || !nativePermissionGranted) return
  if (isInQuietHours()) return

  if (isTauriEnvironment()) {
    try {
      const { sendNotification } = await import('@tauri-apps/plugin-notification')
      sendNotification({ title, body })
    } catch (e) {
      console.warn('Failed to send Tauri notification:', e)
    }
  } else {
    // Browser Notification API
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: options?.icon || '/icons/web/icon-192.png',
          tag: options?.tag,
        })
      } catch (e) {
        console.warn('Failed to send browser notification:', e)
      }
    }
  }
}

// ============================================================================
// REMINDER & TASK POLLING
// ============================================================================

async function checkReminders(): Promise<void> {
  try {
    const reminders = await getReminders({ includeSent: false })
    const now = new Date()

    for (const reminder of reminders) {
      if (processedReminderIds.has(reminder.id)) continue

      const remindAt = new Date(reminder.remind_at)
      if (remindAt <= now) {
        processedReminderIds.add(reminder.id)

        const title = reminder.message || 'Reminder'
        const body = reminder.task_id
          ? 'You have a task reminder'
          : reminder.event_id
          ? 'You have an event reminder'
          : 'Reminder'

        // Add in-app notification
        const notif = addNotification({
          type: 'reminder',
          title,
          body,
          priority: 'high',
          reminderId: reminder.id,
          taskId: reminder.task_id || undefined,
          eventId: reminder.event_id || undefined,
          action: reminder.task_id
            ? { type: 'open_task', payload: reminder.task_id }
            : reminder.event_id
            ? { type: 'open_event', payload: reminder.event_id }
            : undefined,
        })

        // Send native notification
        await sendNativeNotification(title, body, {
          tag: `reminder_${reminder.id}`,
        })

        // Mark as sent in database
        try {
          await markReminderAsSent(reminder.id)
        } catch (e) {
          console.warn('Failed to mark reminder as sent:', e)
        }
      }
    }
  } catch (e) {
    console.warn('Failed to check reminders:', e)
  }
}

async function checkTasksDue(): Promise<void> {
  try {
    const now = new Date()
    const tasks = await getTasks({
      includeCompleted: false,
      includeArchived: false,
    })

    for (const task of tasks) {
      if (!task.due_date) continue
      if (processedTaskDueIds.has(task.id)) continue

      const dueDate = new Date(task.due_date)
      const minutesUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60)

      // Check if task is overdue
      if (minutesUntilDue < 0 && preferences.notifyOverdue) {
        const overdueKey = `overdue_${task.id}`
        if (processedTaskDueIds.has(overdueKey)) continue
        processedTaskDueIds.add(overdueKey)

        const title = 'Task Overdue'
        const body = `"${task.title}" is overdue`

        addNotification({
          type: 'task_overdue',
          title,
          body,
          priority: 'urgent',
          taskId: task.id,
          action: { type: 'open_task', payload: task.id },
        })

        await sendNativeNotification(title, body, {
          tag: `task_overdue_${task.id}`,
        })
      }
      // Check if task is due soon
      else if (
        minutesUntilDue > 0 &&
        minutesUntilDue <= preferences.taskDueReminderMinutes
      ) {
        processedTaskDueIds.add(task.id)

        const title = 'Task Due Soon'
        const body = minutesUntilDue < 1
          ? `"${task.title}" is due now`
          : minutesUntilDue < 60
          ? `"${task.title}" is due in ${Math.round(minutesUntilDue)} minutes`
          : `"${task.title}" is due in ${Math.round(minutesUntilDue / 60)} hours`

        addNotification({
          type: 'task_due',
          title,
          body,
          priority: 'high',
          taskId: task.id,
          action: { type: 'open_task', payload: task.id },
        })

        await sendNativeNotification(title, body, {
          tag: `task_due_${task.id}`,
        })
      }
    }
  } catch (e) {
    console.warn('Failed to check tasks due:', e)
  }
}

async function pollOnce(): Promise<void> {
  if (isPolling) return
  isPolling = true
  try {
    await Promise.all([checkReminders(), checkTasksDue()])
  } finally {
    isPolling = false
  }
}

// ============================================================================
// START / STOP
// ============================================================================

export function startPolling(): void {
  if (pollInterval) return
  if (!preferences.enabled) return

  // Run immediately, then on interval
  pollOnce()
  pollInterval = setInterval(pollOnce, preferences.pollIntervalSeconds * 1000)
}

export function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

/**
 * Initialize the notification system.
 * Call this once when the app starts (after auth).
 */
export async function initNotifications(): Promise<void> {
  loadPreferences()
  await requestNativePermission()
  startPolling()
}

/**
 * Tear down the notification system.
 * Call this on logout or app unmount.
 */
export function destroyNotifications(): void {
  stopPolling()
  notifications = []
  listeners = []
  processedReminderIds.clear()
  processedTaskDueIds.clear()
}
