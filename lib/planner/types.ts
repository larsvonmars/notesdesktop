import type { Task, TaskPriority } from '../tasks'

export type PlanScope = 'today' | 'tomorrow' | 'this_week' | 'this_weekend' | 'custom'
export type PlanStatus = 'draft' | 'active' | 'completed' | 'discarded'
export type PlanItemStatus = 'pending' | 'completed' | 'skipped'
export type PlanningMode = 'standard' | 'adaptive'
export type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda'
export type TimetableViewMode = 'cards' | 'grid' | 'schedule' | 'timeline'

export interface PlanItem {
  id: string
  plan_id: string
  task_id: string
  task_title: string
  task_priority: TaskPriority
  scheduled_start: string | null
  scheduled_end: string | null
  sort_order: number
  status: PlanItemStatus
  estimated_minutes: number | null
}

export interface PlannerPlan {
  id: string
  user_id: string
  title: string
  scope: PlanScope
  scope_start: string
  scope_end: string
  availability_start: string
  availability_end: string
  break_minutes: number
  status: PlanStatus
  created_at: string
  updated_at: string
  items: PlanItem[]
}

export interface TaskCompletion {
  id: string
  task_id: string
  plan_item_id: string | null
  completed_at: string
  actual_minutes: number | null
  estimated_minutes: number | null
  /** 0 = Sunday, 6 = Saturday */
  day_of_week: number
  hour_of_day: number
  priority: TaskPriority
  labels: string[]
  project_id: string | null
}

export interface UserSchedulingPreferences {
  peak_start_hour: number
  peak_end_hour: number
  /** actual / estimated ratio, 1 = perfect */
  avg_estimation_accuracy: number
  preferred_break_minutes: number
  avg_tasks_per_day: number
  total_completions: number
  updated_at: string
}

export interface ScoringContext {
  now: Date
  preferences: UserSchedulingPreferences | null
  completions: TaskCompletion[]
  /** Hourly completion counts [0..23] */
  hourly_productivity: number[]
  scheduled_so_far: {
    task: Task
    slot_start: Date
    slot_end: Date
  }[]
}

export interface ScheduleQuality {
  overall: number
  peakUtilization: number
  batchingScore: number
  deadlineBuffer: number
  breakCompliance: number
}

export interface PlannerInsight {
  type: 'peak_hours' | 'estimation_accuracy' | 'daily_capacity' | 'suggestion'
  label: string
  value?: string
  description: string
}

export interface NotificationSettings {
  enabled: boolean
  overdueTaskAlerts: boolean
  upcomingEventAlerts: boolean
  eventReminderMinutes: number
  urgentTaskAlerts: boolean
  checkIntervalMinutes: number
}

export interface PlannerDisplayPreferences {
  /** 0 = Sunday, 1 = Monday */
  weekStartsOn: 0 | 1
  /** Hour the calendar grid starts (0–23) */
  dayStartHour: number
  /** Hour the calendar grid ends (1–24) */
  dayEndHour: number
  defaultCalendarView: CalendarViewMode
  planningMode: PlanningMode
}
