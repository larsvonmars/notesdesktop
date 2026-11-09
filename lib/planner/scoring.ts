/**
 * Scoring strategies and the duration-estimation engine for the smart planner.
 *
 * Standard: greedy, priority + deadline steps (original planner behavior).
 * Adaptive: energy-aware placement, task batching, smooth deadline pressure.
 */

import type { Task, TaskPriority } from '../tasks'
import type {
  ScheduleQuality,
  ScoringContext,
  TaskCompletion,
  UserSchedulingPreferences,
} from './types'
import { diffMinutes, type TimeSlot } from './date-utils'

export interface ScoringStrategy {
  readonly name: 'standard' | 'adaptive'
  scoreTask(task: Task, context: ScoringContext): number
  rankSlot(task: Task, slot: TimeSlot, context: ScoringContext): number
  evaluateSchedule(
    scheduled: { task: Task; slotStart: Date; slotEnd: Date }[],
    context: ScoringContext,
  ): ScheduleQuality
}

const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  urgent: 100,
  high: 70,
  medium: 40,
  low: 10,
}

export class StandardScoringStrategy implements ScoringStrategy {
  readonly name = 'standard' as const

  scoreTask(task: Task, context: ScoringContext): number {
    const now = context.now
    let score = PRIORITY_WEIGHTS[task.priority] ?? 40

    if (task.due_date) {
      const hoursUntilDue = (new Date(task.due_date).getTime() - now.getTime()) / 3_600_000
      if (hoursUntilDue < 0) {
        score += 150 + Math.min(Math.abs(hoursUntilDue), 720)
      } else if (hoursUntilDue < 24) {
        score += 80
      } else if (hoursUntilDue < 72) {
        score += 50
      } else if (hoursUntilDue < 168) {
        score += 25
      }
    }

    if (task.is_starred) score += 15

    const progress = task.progress ?? 0
    if (progress > 0 && progress < 100) score += Math.round(progress * 0.2)

    return score
  }

  rankSlot(): number {
    return 0
  }

  evaluateSchedule(scheduled: { task: Task; slotStart: Date; slotEnd: Date }[]): ScheduleQuality {
    const overall = scheduled.length > 0 ? 50 : 0
    return {
      overall,
      peakUtilization: 50,
      batchingScore: 50,
      deadlineBuffer: 50,
      breakCompliance: 50,
    }
  }
}

export class AdaptiveScoringStrategy implements ScoringStrategy {
  readonly name = 'adaptive' as const

  scoreTask(task: Task, context: ScoringContext): number {
    const now = context.now
    let score = PRIORITY_WEIGHTS[task.priority] ?? 40

    if (task.due_date) {
      const hoursUntilDue = (new Date(task.due_date).getTime() - now.getTime()) / 3_600_000
      if (hoursUntilDue < 0) {
        score += 150 + Math.min(50 * Math.log1p(Math.abs(hoursUntilDue)), 300)
      } else {
        score += Math.round(120 * Math.exp(-hoursUntilDue / 48))
      }
    }

    if (task.is_starred) score += 15

    const progress = task.progress ?? 0
    if (progress > 0 && progress < 100) {
      score += Math.round((progress / 100) ** 2 * 20)
    }

    const estimated = task.estimated_minutes ?? 30
    if (estimated <= 15) score += 8
    else if (estimated <= 30) score += 4

    return score
  }

  rankSlot(task: Task, slot: TimeSlot, context: ScoringContext): number {
    let score = 0
    const slotHour = slot.start.getHours()
    const prefs = context.preferences
    const hourly = context.hourly_productivity

    if (prefs && hourly.some((h) => h > 0)) {
      const isPeakSlot = slotHour >= prefs.peak_start_hour && slotHour < prefs.peak_end_hour
      const isHardTask = task.priority === 'urgent' || task.priority === 'high'
      const isLongTask = (task.estimated_minutes ?? 30) >= 45

      if (isPeakSlot && (isHardTask || isLongTask)) score += 30
      else if (!isPeakSlot && !isHardTask && !isLongTask) score += 15
      else if (isPeakSlot && !isHardTask && !isLongTask) score -= 10
    }

    const labels = task.labels ?? []

    if (task.project_id && context.scheduled_so_far.length > 0) {
      const last = context.scheduled_so_far[context.scheduled_so_far.length - 1]
      if (last.task.project_id === task.project_id) score += 20
      for (const prev of context.scheduled_so_far.slice(-3)) {
        if (prev.task.project_id === task.project_id) {
          const gap = diffMinutes(prev.slot_end, slot.start)
          if (gap >= 0 && gap <= 30) score += 15
        }
      }
    }

    if (labels.length > 0 && context.scheduled_so_far.length > 0) {
      const last = context.scheduled_so_far[context.scheduled_so_far.length - 1]
      const shared = labels.filter((label) => (last.task.labels ?? []).includes(label))
      if (shared.length > 0) score += 10 * shared.length
    }

    if (task.due_date) {
      const dueDate = new Date(task.due_date)
      const duration = task.estimated_minutes ?? 30
      const slotEnd = new Date(slot.start.getTime() + duration * 60_000)
      const buffer = diffMinutes(slotEnd, dueDate)
      if (buffer < 0) score -= 50
      else if (buffer < 30) score -= 15
      else if (buffer > 120) score += 5
    }

    if (slotHour < 10 && (task.estimated_minutes ?? 30) <= 15) score += 10

    return score
  }

  evaluateSchedule(
    scheduled: { task: Task; slotStart: Date; slotEnd: Date }[],
    context: ScoringContext,
  ): ScheduleQuality {
    if (scheduled.length === 0) {
      return {
        overall: 0,
        peakUtilization: 0,
        batchingScore: 0,
        deadlineBuffer: 100,
        breakCompliance: 100,
      }
    }

    const prefs = context.preferences

    let peakUtilization = 50
    if (prefs) {
      const peakItems = scheduled.filter(
        (item) =>
          item.slotStart.getHours() >= prefs.peak_start_hour &&
          item.slotStart.getHours() < prefs.peak_end_hour,
      )
      const hardPeakItems = peakItems.filter(
        (item) => item.task.priority === 'urgent' || item.task.priority === 'high',
      )
      peakUtilization =
        peakItems.length > 0 ? Math.round((hardPeakItems.length / peakItems.length) * 100) : 50
    }

    let transitions = 0
    let smooth = 0
    for (let i = 1; i < scheduled.length; i++) {
      const prev = scheduled[i - 1]
      const curr = scheduled[i]
      const sameProject =
        prev.task.project_id != null && prev.task.project_id === curr.task.project_id
      const prevLabels = prev.task.labels ?? []
      const sharedLabel = prevLabels.some((label) => (curr.task.labels ?? []).includes(label))
      if (sameProject || sharedLabel) smooth++
      transitions++
    }
    const batchingScore = transitions > 0 ? Math.round((smooth / transitions) * 100) : 50

    let withDeadline = 0
    let adequate = 0
    for (const item of scheduled) {
      if (!item.task.due_date) continue
      withDeadline++
      if (diffMinutes(item.slotEnd, new Date(item.task.due_date)) >= 30) adequate++
    }
    const deadlineBuffer = withDeadline > 0 ? Math.round((adequate / withDeadline) * 100) : 100

    let breakChecks = 0
    let breaksOk = 0
    for (let i = 1; i < scheduled.length; i++) {
      const gap = diffMinutes(scheduled[i - 1].slotEnd, scheduled[i].slotStart)
      breakChecks++
      if (gap >= (prefs?.preferred_break_minutes ?? 5)) breaksOk++
    }
    const breakCompliance = breakChecks > 0 ? Math.round((breaksOk / breakChecks) * 100) : 100

    const overall = Math.round(
      peakUtilization * 0.3 +
        batchingScore * 0.25 +
        deadlineBuffer * 0.25 +
        breakCompliance * 0.2,
    )

    return { overall, peakUtilization, batchingScore, deadlineBuffer, breakCompliance }
  }
}

export function getStrategy(mode: 'standard' | 'adaptive'): ScoringStrategy {
  return mode === 'standard' ? new StandardScoringStrategy() : new AdaptiveScoringStrategy()
}

// ── Estimation engine ────────────────────────────────────────────────

const DEFAULT_MINUTES = 30

export interface EstimationResult {
  minutes: number
  source:
    | 'task_history'
    | 'priority_correction'
    | 'label_correction'
    | 'global_correction'
    | 'default'
  confidence: number
  explanation?: string
}

export function estimationAccuracyByPriority(
  completions: TaskCompletion[],
): Record<TaskPriority, number> {
  const result: Record<TaskPriority, number> = { low: 1, medium: 1, high: 1, urgent: 1 }
  const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

  for (const priority of priorities) {
    const subset = completions.filter(
      (c) =>
        c.priority === priority &&
        c.estimated_minutes &&
        c.estimated_minutes > 0 &&
        c.actual_minutes &&
        c.actual_minutes > 0,
    )
    if (subset.length >= 2) {
      const ratios = subset.map((c) => c.actual_minutes! / c.estimated_minutes!)
      const avg = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
      result[priority] = Math.max(0.3, Math.min(3, avg))
    }
  }

  return result
}

export function estimationAccuracyByLabel(completions: TaskCompletion[]): Record<string, number> {
  const data: Record<string, { total: number; count: number }> = {}

  for (const completion of completions) {
    if (
      !completion.estimated_minutes ||
      completion.estimated_minutes <= 0 ||
      !completion.actual_minutes ||
      completion.actual_minutes <= 0
    ) {
      continue
    }
    const ratio = completion.actual_minutes / completion.estimated_minutes
    for (const label of completion.labels) {
      if (!data[label]) data[label] = { total: 0, count: 0 }
      data[label].total += ratio
      data[label].count++
    }
  }

  const result: Record<string, number> = {}
  for (const [label, entry] of Object.entries(data)) {
    if (entry.count >= 2) {
      result[label] = Math.max(0.3, Math.min(3, entry.total / entry.count))
    }
  }
  return result
}

function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

export function estimateTaskDuration(
  task: Task,
  completions: TaskCompletion[],
  preferences: UserSchedulingPreferences | null,
  overrideMinutes?: number,
): EstimationResult {
  const rawMinutes = overrideMinutes ?? task.estimated_minutes

  if (!rawMinutes || rawMinutes <= 0) {
    return estimateWithoutBase(task, completions)
  }

  const taskHistory = completions.filter(
    (c) => c.task_id === task.id && c.actual_minutes && c.actual_minutes > 0,
  )
  if (taskHistory.length >= 2) {
    const avg = taskHistory.reduce((sum, c) => sum + c.actual_minutes!, 0) / taskHistory.length
    return {
      minutes: Math.round(avg),
      source: 'task_history',
      confidence: Math.min(1, taskHistory.length / 5),
      explanation: `Based on ${taskHistory.length} previous completions of this task (avg ${Math.round(avg)}m)`,
    }
  }

  const priorityAccuracy = estimationAccuracyByPriority(completions)
  const priorityRatio = priorityAccuracy[task.priority]
  if (priorityRatio !== 1) {
    const matching = completions.filter(
      (c) => c.priority === task.priority && c.estimated_minutes && c.actual_minutes,
    )
    if (matching.length >= 2) {
      return {
        minutes: Math.round(rawMinutes * priorityRatio),
        source: 'priority_correction',
        confidence: Math.min(0.8, matching.length / 8),
        explanation: `${task.priority} tasks typically take ${formatRatio(priorityRatio)} of the estimate`,
      }
    }
  }

  const labels = task.labels ?? []
  if (labels.length > 0) {
    const labelAccuracy = estimationAccuracyByLabel(completions)
    const matching = labels.filter((label) => label in labelAccuracy)
    if (matching.length > 0) {
      const avgRatio =
        matching.reduce((sum, label) => sum + labelAccuracy[label], 0) / matching.length
      return {
        minutes: Math.round(rawMinutes * avgRatio),
        source: 'label_correction',
        confidence: 0.6,
        explanation: `Tasks labelled "${matching[0]}" typically take ${formatRatio(avgRatio)} of the estimate`,
      }
    }
  }

  if (preferences && preferences.total_completions >= 5 && preferences.avg_estimation_accuracy !== 1) {
    return {
      minutes: Math.round(rawMinutes * preferences.avg_estimation_accuracy),
      source: 'global_correction',
      confidence: Math.min(0.5, preferences.total_completions / 20),
      explanation: `You typically take ${formatRatio(preferences.avg_estimation_accuracy)} of your estimates`,
    }
  }

  return { minutes: rawMinutes, source: 'default', confidence: 0 }
}

function estimateWithoutBase(task: Task, completions: TaskCompletion[]): EstimationResult {
  const taskHistory = completions.filter(
    (c) => c.task_id === task.id && c.actual_minutes && c.actual_minutes > 0,
  )
  if (taskHistory.length >= 1) {
    const avg = taskHistory.reduce((sum, c) => sum + c.actual_minutes!, 0) / taskHistory.length
    return {
      minutes: Math.round(avg),
      source: 'task_history',
      confidence: Math.min(0.8, taskHistory.length / 5),
      explanation: 'Based on previous completions of this task',
    }
  }

  const priorityHistory = completions.filter(
    (c) => c.priority === task.priority && c.actual_minutes && c.actual_minutes > 0,
  )
  if (priorityHistory.length >= 3) {
    const avg =
      priorityHistory.reduce((sum, c) => sum + c.actual_minutes!, 0) / priorityHistory.length
    return {
      minutes: Math.round(avg),
      source: 'priority_correction',
      confidence: Math.min(0.5, priorityHistory.length / 10),
      explanation: `Your ${task.priority}-priority tasks typically take ${Math.round(avg)}m`,
    }
  }

  return { minutes: DEFAULT_MINUTES, source: 'default', confidence: 0 }
}
