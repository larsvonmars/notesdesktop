'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  X,
  Trash2,
  Clock,
  AlertTriangle,
  AlertCircle,
  Info,
  Settings,
  ChevronRight,
} from 'lucide-react'
import {
  subscribeToNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  clearAllNotifications,
  type AppNotification,
} from '@/lib/notifications'

// ============================================================================
// TOAST NOTIFICATION
// ============================================================================

interface ToastProps {
  notification: AppNotification
  onDismiss: (id: string) => void
  onAction?: (notification: AppNotification) => void
}

function Toast({ notification, onDismiss, onAction }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => onDismiss(notification.id), 300)
    }, 5000)
    return () => clearTimeout(timer)
  }, [notification.id, onDismiss])

  const iconMap = {
    reminder: <Clock className="w-5 h-5 text-blue-400" />,
    task_due: <AlertCircle className="w-5 h-5 text-yellow-400" />,
    task_overdue: <AlertTriangle className="w-5 h-5 text-red-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
  }

  const borderColorMap = {
    reminder: 'border-l-blue-400',
    task_due: 'border-l-yellow-400',
    task_overdue: 'border-l-red-400',
    info: 'border-l-blue-400',
    warning: 'border-l-amber-400',
  }

  return (
    <div
      className={`
        w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700
        border-l-4 ${borderColorMap[notification.type]}
        transition-all duration-300 cursor-pointer
        ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
      `}
      onClick={() => {
        if (onAction) onAction(notification)
        onDismiss(notification.id)
      }}
    >
      <div className="p-3 flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {iconMap[notification.type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {notification.title}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">
            {notification.body}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {formatTimeAgo(notification.timestamp)}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismiss(notification.id)
          }}
          className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <X className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// TOAST CONTAINER
// ============================================================================

interface ToastContainerProps {
  onAction?: (notification: AppNotification) => void
}

export function ToastContainer({ onAction }: ToastContainerProps) {
  const [toasts, setToasts] = useState<AppNotification[]>([])
  const shownIds = useRef(new Set<string>())

  useEffect(() => {
    const unsubscribe = subscribeToNotifications((notifications) => {
      const newToasts = notifications.filter(
        n => !n.read && !n.dismissed && !shownIds.current.has(n.id)
      )
      if (newToasts.length > 0) {
        newToasts.forEach(n => shownIds.current.add(n.id))
        setToasts(prev => [...newToasts.slice(0, 3), ...prev].slice(0, 5))
      }
    })
    return unsubscribe
  }, [])

  const handleDismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    dismissNotification(id)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          notification={toast}
          onDismiss={handleDismiss}
          onAction={onAction}
        />
      ))}
    </div>
  )
}

// ============================================================================
// NOTIFICATION CENTER (Bell + Dropdown)
// ============================================================================

interface NotificationCenterProps {
  onAction?: (notification: AppNotification) => void
  onOpenSettings?: () => void
}

export default function NotificationCenter({ onAction, onOpenSettings }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const unsubscribe = subscribeToNotifications((notifs) => {
      setNotifications(notifs.filter(n => !n.dismissed))
      setUnreadCount(notifs.filter(n => !n.read && !n.dismissed).length)
    })
    return unsubscribe
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [isOpen])

  const iconMap = {
    reminder: <Clock className="w-4 h-4 text-blue-400" />,
    task_due: <AlertCircle className="w-4 h-4 text-yellow-400" />,
    task_overdue: <AlertTriangle className="w-4 h-4 text-red-400" />,
    info: <Info className="w-4 h-4 text-blue-400" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  }

  const handleNotificationClick = (notif: AppNotification) => {
    markAsRead(notif.id)
    if (onAction) onAction(notif)
  }

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-96 max-h-[480px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {unreadCount} unread
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => clearAllNotifications()}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  title="Clear all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  title="Notification settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <BellOff className="w-10 h-10 mb-2 opacity-50" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {notifications.map(notif => (
                  <div
                    key={notif.id}
                    className={`
                      flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors
                      hover:bg-gray-50 dark:hover:bg-gray-700/50
                      ${!notif.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}
                    `}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {iconMap[notif.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm truncate ${!notif.read ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                        {notif.body}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {formatTimeAgo(notif.timestamp)}
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-1">
                      {notif.action && (
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          dismissNotification(notif.id)
                        }}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Dismiss"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// NOTIFICATION SETTINGS PANEL
// ============================================================================

interface NotificationSettingsProps {
  isOpen: boolean
  onClose: () => void
}

export function NotificationSettings({ isOpen, onClose }: NotificationSettingsProps) {
  const [prefs, setPrefs] = useState(() => {
    // Import dynamically to avoid SSR issues
    const { getPreferences } = require('@/lib/notifications')
    return getPreferences()
  })

  const updatePref = (key: string, value: any) => {
    const { updatePreferences, getPreferences } = require('@/lib/notifications')
    updatePreferences({ [key]: value })
    setPrefs(getPreferences())
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Notification Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Settings */}
        <div className="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Master toggle */}
          <SettingToggle
            label="Enable Notifications"
            description="Receive notifications for reminders and tasks"
            checked={prefs.enabled}
            onChange={(v) => updatePref('enabled', v)}
          />

          {prefs.enabled && (
            <>
              {/* Native notifications */}
              <SettingToggle
                label="Desktop / Browser Notifications"
                description="Show native OS notifications"
                checked={prefs.nativeEnabled}
                onChange={(v) => updatePref('nativeEnabled', v)}
              />

              {/* Toast notifications */}
              <SettingToggle
                label="In-App Toast Notifications"
                description="Show popup toasts inside the app"
                checked={prefs.toastEnabled}
                onChange={(v) => updatePref('toastEnabled', v)}
              />

              {/* Overdue notifications */}
              <SettingToggle
                label="Overdue Task Alerts"
                description="Get notified when tasks are past due"
                checked={prefs.notifyOverdue}
                onChange={(v) => updatePref('notifyOverdue', v)}
              />

              {/* Due reminder window */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Remind Before Due Date
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  How many minutes before a task is due to notify you
                </p>
                <select
                  value={prefs.taskDueReminderMinutes}
                  onChange={(e) => updatePref('taskDueReminderMinutes', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                >
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={1440}>1 day</option>
                </select>
              </div>

              {/* Poll interval */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Check Interval
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  How often to check for due reminders and tasks
                </p>
                <select
                  value={prefs.pollIntervalSeconds}
                  onChange={(e) => updatePref('pollIntervalSeconds', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                >
                  <option value={30}>Every 30 seconds</option>
                  <option value={60}>Every minute</option>
                  <option value={120}>Every 2 minutes</option>
                  <option value={300}>Every 5 minutes</option>
                </select>
              </div>

              {/* Quiet hours */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Quiet Hours
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={prefs.quietHoursStart || ''}
                    onChange={(e) => updatePref('quietHoursStart', e.target.value || null)}
                    className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                    placeholder="Start"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="time"
                    value={prefs.quietHoursEnd || ''}
                    onChange={(e) => updatePref('quietHoursEnd', e.target.value || null)}
                    className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                    placeholder="End"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  No native notifications during quiet hours
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          ${checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}
        `}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white transition-transform
            ${checked ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>
    </div>
  )
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`

  return date.toLocaleDateString()
}
