/**
 * Intelligent scheduling algorithm.
 *
 * Takes outstanding tasks, existing events (including recurring timetable
 * entries) and the user's availability, then produces time-blocked items.
 */

import type { CalendarEvent, RecurrencePattern } from '../events'
import type { Task } from '../tasks'
import type {
  PlanItem,
  PlanScope,
  ScheduleQuality,
  ScoringContext,
  TaskCompletion,
  UserSchedulingPreferences,
} from './types'
import {
  addMinutes,
  buildAvailabilitySlots,
  diffMinutes,
  expandRecurrences,
  getStartOfDay,
  getThisWeekRange,
  getThisWeekendRange,
  getTodayRange,
  getTomorrowRange,
  subtractOccupied,
  type TimeSlot,
} from './date-utils'
import { getStrategy, type ScoringStrategy } from './scoring'

const DEFAULT_TASK_MINUTES = 30

export interface SchedulerConfig {
  scope: PlanScope
  customStart?: string
  customEnd?: string
  availabilityStart: string
  availabilityEnd: string
  breakMinutes: number
}

export interface SchedulerInput {
  config: SchedulerConfig
  tasks: Task[]
  events: CalendarEvent[]
  recurrencePatterns: RecurrencePattern[]
  estimateOverrides?: Record<string, number>
  adjustedDurations?: Record<string, number>
  strategy?: ScoringStrategy
  completions?: TaskCompletion[]
  preferences?: UserSchedulingPreferences | null
}

export type ScheduledPlanItem = Omit<PlanItem, 'id' | 'plan_id'>

export interface SchedulerResult {
  scopeStart: string
  scopeEnd: string
  scheduledItems: ScheduledPlanItem[]
  unscheduledItems: ScheduledPlanItem[]
  totalFreeMinutes: number
  totalScheduledMinutes: number
  remainingSlots: TimeSlot[]
  quality: ScheduleQuality
}

export function computeHourlyProductivity(completions: TaskCompletion[]): number[] {
  const counts = new Array<number>(24).fill(0)
  for (const completion of completions) counts[completion.hour_of_day]++
  return counts
}

export function resolveScope(config: SchedulerConfig): TimeSlot {
  switch (config.scope) {
    case 'today':
      return getTodayRange()
    case 'tomorrow':
      return getTomorrowRange()
    case 'this_week':
      return getThisWeekRange()
    case 'this_weekend':
      return getThisWeekendRange()
    case 'custom': {
      if (!config.customStart || !config.customEnd) {
        throw new Error('Custom scope requires a start and end date')
      }
      return {
        start: new Date(config.customStart),
        end: new Date(config.customEnd),
      }
    }
    default:
      return getTodayRange()
  }
}

export function generatePlan(input: SchedulerInput): SchedulerResult {
  const {
    config,
    tasks,
    events,
    recurrencePatterns,
    estimateOverrides,
    adjustedDurations,
    strategy = getStrategy('standard'),
    completions = [],
    preferences = null,
  } = input

  const now = new Date()
  const scoringContext: ScoringContext = {
    now,
    preferences,
    completions,
    hourly_productivity: computeHourlyProductivity(completions),
    scheduled_so_far: [],
  }

  const scope = resolveScope(config)
  const availability = buildAvailabilitySlots(
    scope.start,
    scope.end,
    config.availabilityStart,
    config.availabilityEnd,
  )

  const occupied: TimeSlot[] = []
  for (const event of events) {
    if (event.is_cancelled || event.is_recurring) continue
    const start = new Date(event.start_time)
    const end = new Date(event.end_time)
    if (end <= scope.start || start >= scope.end) continue
    occupied.push({ start, end })
  }

  const patternById = new Map(recurrencePatterns.map((pattern) => [pattern.id, pattern]))
  for (const event of events) {
    if (event.is_cancelled || !event.is_recurring || !event.recurrence_pattern_id) continue
    const pattern = patternById.get(event.recurrence_pattern_id)
    if (!pattern) continue
    occupied.push(...expandRecurrences(event, pattern, scope.start, scope.end))
  }

  // A task can claim time through a linked calendar event; subtract those too.
  for (const task of tasks) {
    if (!task.start_date) continue
    const minutes = task.estimated_minutes ?? 0
    if (minutes <= 0) continue
    const start = new Date(task.start_date)
    if (start < scope.start || start >= scope.end) continue
    occupied.push({ start, end: addMinutes(start, minutes) })
  }

  let freeSlots = subtractOccupied(availability, occupied)
  const totalFreeMinutes = freeSlots.reduce((sum, slot) => sum + diffMinutes(slot.start, slot.end), 0)

  const eligible = tasks.filter(
    (task) =>
      !task.is_archived &&
      (task.status === 'todo' || task.status === 'in_progress' || task.status === 'waiting'),
  )

  const ranked = [...eligible].sort(
    (a, b) => strategy.scoreTask(b, scoringContext) - strategy.scoreTask(a, scoringContext),
  )

  const withDurations: { task: Task; minutes: number; hasEstimate: boolean }[] = []
  for (const task of ranked) {
    const adjusted = adjustedDurations?.[task.id]
    const override = estimateOverrides?.[task.id]
    const raw = adjusted ?? override ?? task.estimated_minutes
    const hasEstimate = Boolean(raw && raw > 0)
    const minutes = hasEstimate ? raw! : DEFAULT_TASK_MINUTES
    const remaining = Math.max(1, Math.round(minutes * (1 - (task.progress ?? 0) / 100)))
    withDurations.push({ task, minutes: remaining, hasEstimate })
  }

  const scheduledItems: ScheduledPlanItem[] = []
  let order = 0
  let totalScheduledMinutes = 0
  let overflowCursor: Date | null = null
  const usesScoredPlacement = strategy.name !== 'standard'

  const pushItem = (task: Task, start: Date, minutes: number, hasEstimate: boolean) => {
    const end = addMinutes(start, minutes)
    scheduledItems.push({
      task_id: task.id,
      task_title: task.title,
      task_priority: task.priority,
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      sort_order: order++,
      status: 'pending',
      estimated_minutes: hasEstimate ? minutes : null,
    })
    totalScheduledMinutes += minutes
    overflowCursor = end
    scoringContext.scheduled_so_far.push({
      task,
      slot_start: start,
      slot_end: end,
    })
    return end
  }

  for (const { task, minutes, hasEstimate } of withDurations) {
    const totalNeeded = minutes + config.breakMinutes
    let placed = false

    if (usesScoredPlacement) {
      let bestIndex = -1
      let bestScore = -Infinity
      for (let i = 0; i < freeSlots.length; i++) {
        const slot = freeSlots[i]
        if (diffMinutes(slot.start, slot.end) < minutes) continue
        const score = strategy.rankSlot(task, slot, scoringContext)
        if (score > bestScore) {
          bestScore = score
          bestIndex = i
        }
      }

      if (bestIndex >= 0) {
        const slot = freeSlots[bestIndex]
        const end = pushItem(task, slot.start, minutes, hasEstimate)
        const newStart = addMinutes(end, totalNeeded - minutes)
        if (diffMinutes(newStart, slot.end) >= 5) {
          freeSlots[bestIndex] = { start: newStart, end: slot.end }
        } else {
          freeSlots.splice(bestIndex, 1)
        }
        placed = true
      }
    } else {
      for (let i = 0; i < freeSlots.length; i++) {
        const slot = freeSlots[i]
        if (diffMinutes(slot.start, slot.end) >= minutes) {
          const end = pushItem(task, slot.start, minutes, hasEstimate)
          const newStart = addMinutes(end, totalNeeded - minutes)
          if (diffMinutes(newStart, slot.end) >= 5) {
            freeSlots[i] = { start: newStart, end: slot.end }
          } else {
            freeSlots.splice(i, 1)
          }
          placed = true
          break
        }
      }
    }

    if (!placed) {
      const base = overflowCursor ?? scope.start
      pushItem(task, addMinutes(base, config.breakMinutes), minutes, hasEstimate)
    }
  }

  if (usesScoredPlacement && scheduledItems.length >= 2) {
    optimizeBySwap(scheduledItems, withDurations, scoringContext, strategy)
  }

  const quality = strategy.evaluateSchedule(
    scoringContext.scheduled_so_far.map((entry) => ({
      task: entry.task,
      slotStart: entry.slot_start,
      slotEnd: entry.slot_end,
    })),
    scoringContext,
  )

  return {
    scopeStart: scope.start.toISOString(),
    scopeEnd: scope.end.toISOString(),
    scheduledItems,
    unscheduledItems: [],
    totalFreeMinutes,
    totalScheduledMinutes,
    remainingSlots: freeSlots,
    quality,
  }
}

/** Pairwise swap optimizer — keeps time slots, swaps the assigned tasks. */
function optimizeBySwap(
  items: ScheduledPlanItem[],
  durations: { task: Task; minutes: number }[],
  context: ScoringContext,
  strategy: ScoringStrategy,
): void {
  const taskById = new Map(durations.map((entry) => [entry.task.id, entry.task]))

  for (let pass = 0; pass < 2; pass++) {
    let improved = false

    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i]
      const b = items[i + 1]
      const taskA = taskById.get(a.task_id)
      const taskB = taskById.get(b.task_id)
      if (!taskA || !taskB || !a.scheduled_start || !b.scheduled_start) continue

      const slotA = { start: new Date(a.scheduled_start), end: new Date(a.scheduled_end!) }
      const slotB = { start: new Date(b.scheduled_start), end: new Date(b.scheduled_end!) }

      const current =
        strategy.rankSlot(taskA, slotA, context) + strategy.rankSlot(taskB, slotB, context)
      const swapped =
        strategy.rankSlot(taskA, slotB, context) + strategy.rankSlot(taskB, slotA, context)

      if (swapped > current) {
        const temp = {
          id: a.task_id,
          title: a.task_title,
          priority: a.task_priority,
          estimated: a.estimated_minutes,
        }
        a.task_id = b.task_id
        a.task_title = b.task_title
        a.task_priority = b.task_priority
        a.estimated_minutes = b.estimated_minutes

        b.task_id = temp.id
        b.task_title = temp.title
        b.task_priority = temp.priority
        b.estimated_minutes = temp.estimated
        improved = true
      }
    }

    if (!improved) break
  }
}

/** Total focus minutes available today after subtracting events. */
export function freeMinutesForDay(
  day: Date,
  events: CalendarEvent[],
  patterns: RecurrencePattern[],
  availStart = '09:00',
  availEnd = '17:00',
): number {
  const start = getStartOfDay(day)
  const end = new Date(day)
  end.setHours(23, 59, 59, 999)
  const availability = buildAvailabilitySlots(start, end, availStart, availEnd)
  const occupied: TimeSlot[] = []

  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]))
  for (const event of events) {
    if (event.is_cancelled) continue
    if (event.is_recurring && event.recurrence_pattern_id) {
      const pattern = patternById.get(event.recurrence_pattern_id)
      if (!pattern) continue
      occupied.push(...expandRecurrences(event, pattern, start, end))
      continue
    }
    const eventStart = new Date(event.start_time)
    const eventEnd = new Date(event.end_time)
    if (eventEnd <= start || eventStart >= end) continue
    occupied.push({ start: eventStart, end: eventEnd })
  }

  return subtractOccupied(availability, occupied).reduce(
    (sum, slot) => sum + diffMinutes(slot.start, slot.end),
    0,
  )
}
