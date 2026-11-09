/**
 * Persistence for smart-planner artifacts.
 *
 * Plans, plan items, completion history and learned preferences live in
 * Supabase when the optional planner schema has been applied. When those
 * tables are missing (fresh project, offline install, demo mode) everything
 * gracefully degrades to a device-local store so the planner keeps working.
 */

import { supabase } from '../supabase'
import type { Task } from '../tasks'
import type {
  PlanItem,
  PlanItemStatus,
  PlannerPlan,
  PlanScope,
  PlanStatus,
  TaskCompletion,
  UserSchedulingPreferences,
} from './types'

const LOCAL_KEY = 'planner:store:v1'
let supabasePlannerDisabled = false

interface LocalStore {
  plans: PlannerPlan[]
  completions: TaskCompletion[]
  preferences: UserSchedulingPreferences | null
}

function emptyStore(): LocalStore {
  return { plans: [], completions: [], preferences: null }
}

function readLocal(): LocalStore {
  if (typeof window === 'undefined') return emptyStore()
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<LocalStore>
    return {
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      completions: Array.isArray(parsed.completions) ? parsed.completions : [],
      preferences: parsed.preferences ?? null,
    }
  } catch {
    return emptyStore()
  }
}

function writeLocal(store: LocalStore): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store))
  } catch {
    // Storage quota exceeded or private mode — ignore.
  }
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('schema cache')
  )
}

function markUnavailable(error: { code?: string; message?: string } | null): boolean {
  if (isMissingTable(error)) {
    supabasePlannerDisabled = true
    return true
  }
  return false
}

async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// ── Row mappers ──────────────────────────────────────────────────────

type PlanRow = {
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
}

type PlanItemRow = {
  id: string
  plan_id: string
  task_id: string
  task_title: string
  task_priority: PlanItem['task_priority']
  scheduled_start: string | null
  scheduled_end: string | null
  sort_order: number
  status: PlanItemStatus
  estimated_minutes: number | null
}

type CompletionRow = {
  id: string
  task_id: string
  plan_item_id: string | null
  completed_at: string
  actual_minutes: number | null
  estimated_minutes: number | null
  day_of_week: number
  hour_of_day: number
  priority: Task['priority']
  labels: string[] | null
  project_id: string | null
}

type PreferenceRow = {
  peak_start_hour: number
  peak_end_hour: number
  avg_estimation_accuracy: number
  preferred_break_minutes: number
  avg_tasks_per_day: number
  total_completions: number
  updated_at: string
}

function mapPlan(row: PlanRow, items: PlanItem[]): PlannerPlan {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    scope: row.scope,
    scope_start: row.scope_start,
    scope_end: row.scope_end,
    availability_start: row.availability_start,
    availability_end: row.availability_end,
    break_minutes: row.break_minutes,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items,
  }
}

function mapItem(row: PlanItemRow): PlanItem {
  return {
    id: row.id,
    plan_id: row.plan_id,
    task_id: row.task_id,
    task_title: row.task_title,
    task_priority: row.task_priority,
    scheduled_start: row.scheduled_start,
    scheduled_end: row.scheduled_end,
    sort_order: row.sort_order,
    status: row.status,
    estimated_minutes: row.estimated_minutes,
  }
}

function mapCompletion(row: CompletionRow): TaskCompletion {
  return {
    id: row.id,
    task_id: row.task_id,
    plan_item_id: row.plan_item_id,
    completed_at: row.completed_at,
    actual_minutes: row.actual_minutes,
    estimated_minutes: row.estimated_minutes,
    day_of_week: row.day_of_week,
    hour_of_day: row.hour_of_day,
    priority: row.priority,
    labels: row.labels ?? [],
    project_id: row.project_id,
  }
}

function mapPreferences(row: PreferenceRow): UserSchedulingPreferences {
  return {
    peak_start_hour: row.peak_start_hour,
    peak_end_hour: row.peak_end_hour,
    avg_estimation_accuracy: row.avg_estimation_accuracy,
    preferred_break_minutes: row.preferred_break_minutes,
    avg_tasks_per_day: row.avg_tasks_per_day,
    total_completions: row.total_completions,
    updated_at: row.updated_at,
  }
}

// ── Plans ────────────────────────────────────────────────────────────

export interface CreatePlanInput {
  title: string
  scope: PlanScope
  scope_start: string
  scope_end: string
  availability_start: string
  availability_end: string
  break_minutes: number
  status?: PlanStatus
}

export type CreatePlanItemInput = Omit<
  PlanItem,
  'id' | 'plan_id' | 'scheduled_start' | 'scheduled_end'
> & {
  scheduled_start: string | null
  scheduled_end: string | null
}

export async function fetchPlans(): Promise<PlannerPlan[]> {
  const userId = await currentUserId()

  if (!supabasePlannerDisabled) {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      if (!markUnavailable(error)) throw error
    } else {
      const plans = (data ?? []) as PlanRow[]
      if (plans.length === 0) return []

      const { data: itemData, error: itemError } = await supabase
        .from('plan_items')
        .select('*')
        .in(
          'plan_id',
          plans.map((plan) => plan.id),
        )
        .order('sort_order', { ascending: true })

      if (itemError && !markUnavailable(itemError)) throw itemError

      const itemsByPlan = new Map<string, PlanItem[]>()
      for (const row of (itemData ?? []) as PlanItemRow[]) {
        const list = itemsByPlan.get(row.plan_id) ?? []
        list.push(mapItem(row))
        itemsByPlan.set(row.plan_id, list)
      }

      return plans.map((plan) => mapPlan(plan, itemsByPlan.get(plan.id) ?? []))
    }
  }

  return readLocal()
    .plans.filter((plan) => plan.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function createPlan(input: CreatePlanInput): Promise<PlannerPlan> {
  const userId = await currentUserId()
  const now = new Date().toISOString()

  if (!supabasePlannerDisabled) {
    const { data, error } = await supabase
      .from('plans')
      .insert({
        user_id: userId,
        title: input.title,
        scope: input.scope,
        scope_start: input.scope_start,
        scope_end: input.scope_end,
        availability_start: input.availability_start,
        availability_end: input.availability_end,
        break_minutes: input.break_minutes,
        status: input.status ?? 'active',
      })
      .select()
      .single()

    if (error) {
      if (!markUnavailable(error)) throw error
    } else {
      return mapPlan(data as PlanRow, [])
    }
  }

  const plan: PlannerPlan = {
    id: newId(),
    user_id: userId,
    title: input.title,
    scope: input.scope,
    scope_start: input.scope_start,
    scope_end: input.scope_end,
    availability_start: input.availability_start,
    availability_end: input.availability_end,
    break_minutes: input.break_minutes,
    status: input.status ?? 'active',
    created_at: now,
    updated_at: now,
    items: [],
  }

  const store = readLocal()
  store.plans.push(plan)
  writeLocal(store)
  return plan
}

export async function createPlanItems(
  planId: string,
  items: CreatePlanItemInput[],
): Promise<PlanItem[]> {
  if (items.length === 0) return []

  if (!supabasePlannerDisabled) {
    const { data, error } = await supabase
      .from('plan_items')
      .insert(
        items.map((item) => ({
          plan_id: planId,
          task_id: item.task_id,
          task_title: item.task_title,
          task_priority: item.task_priority,
          scheduled_start: item.scheduled_start,
          scheduled_end: item.scheduled_end,
          sort_order: item.sort_order,
          status: item.status,
          estimated_minutes: item.estimated_minutes,
        })),
      )
      .select()

    if (error) {
      if (!markUnavailable(error)) throw error
    } else {
      return ((data ?? []) as PlanItemRow[]).map(mapItem)
    }
  }

  const created: PlanItem[] = items.map((item) => ({
    ...item,
    id: newId(),
    plan_id: planId,
  }))

  const store = readLocal()
  const plan = store.plans.find((candidate) => candidate.id === planId)
  if (plan) {
    plan.items = [...plan.items, ...created]
    plan.updated_at = new Date().toISOString()
  }
  writeLocal(store)
  return created
}

export async function updatePlan(
  planId: string,
  updates: { status?: PlanStatus; title?: string },
): Promise<void> {
  if (!supabasePlannerDisabled) {
    const { error } = await supabase.from('plans').update(updates).eq('id', planId)
    if (error) {
      if (!markUnavailable(error)) throw error
    } else {
      return
    }
  }

  const store = readLocal()
  const plan = store.plans.find((candidate) => candidate.id === planId)
  if (plan) {
    if (updates.status) plan.status = updates.status
    if (updates.title) plan.title = updates.title
    plan.updated_at = new Date().toISOString()
    writeLocal(store)
  }
}

export async function updatePlanItem(
  itemId: string,
  updates: {
    status?: PlanItemStatus
    scheduled_start?: string | null
    scheduled_end?: string | null
    sort_order?: number
  },
): Promise<void> {
  if (!supabasePlannerDisabled) {
    const { error } = await supabase.from('plan_items').update(updates).eq('id', itemId)
    if (error) {
      if (!markUnavailable(error)) throw error
    } else {
      return
    }
  }

  const store = readLocal()
  for (const plan of store.plans) {
    const item = plan.items.find((candidate) => candidate.id === itemId)
    if (!item) continue
    if (updates.status) item.status = updates.status
    if (updates.scheduled_start !== undefined) item.scheduled_start = updates.scheduled_start
    if (updates.scheduled_end !== undefined) item.scheduled_end = updates.scheduled_end
    if (updates.sort_order !== undefined) item.sort_order = updates.sort_order
    plan.updated_at = new Date().toISOString()
    break
  }
  writeLocal(store)
}

export async function deletePlan(planId: string): Promise<void> {
  if (!supabasePlannerDisabled) {
    const { error } = await supabase.from('plan_items').delete().eq('plan_id', planId)
    if (error && !markUnavailable(error)) throw error
    const { error: planError } = await supabase.from('plans').delete().eq('id', planId)
    if (planError) {
      if (!markUnavailable(planError)) throw planError
    } else {
      return
    }
  }

  const store = readLocal()
  store.plans = store.plans.filter((plan) => plan.id !== planId)
  writeLocal(store)
}

// ── Completion tracking & learned preferences ────────────────────────

export async function recordCompletion(
  task: Task,
  planItemId: string | null = null,
  actualMinutes?: number | null,
): Promise<void> {
  const userId = await currentUserId()
  const now = new Date()
  const completion: TaskCompletion = {
    id: newId(),
    task_id: task.id,
    plan_item_id: planItemId,
    completed_at: now.toISOString(),
    actual_minutes: actualMinutes ?? task.actual_minutes ?? null,
    estimated_minutes: task.estimated_minutes ?? null,
    day_of_week: now.getDay(),
    hour_of_day: now.getHours(),
    priority: task.priority,
    labels: task.labels ?? [],
    project_id: task.project_id,
  }

  if (!supabasePlannerDisabled) {
    const { error } = await supabase.from('task_completions').insert({
      user_id: userId,
      task_id: completion.task_id,
      plan_item_id: completion.plan_item_id,
      completed_at: completion.completed_at,
      actual_minutes: completion.actual_minutes,
      estimated_minutes: completion.estimated_minutes,
      day_of_week: completion.day_of_week,
      hour_of_day: completion.hour_of_day,
      priority: completion.priority,
      labels: completion.labels,
      project_id: completion.project_id,
    })
    if (error) {
      if (!markUnavailable(error)) throw error
    } else {
      await recalculatePreferences(userId)
      return
    }
  }

  const store = readLocal()
  store.completions.push(completion)
  store.preferences = computePreferences(store.completions)
  writeLocal(store)
}

export async function fetchCompletions(limit = 500): Promise<TaskCompletion[]> {
  const userId = await currentUserId()

  if (!supabasePlannerDisabled) {
    const { data, error } = await supabase
      .from('task_completions')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(limit)

    if (error) {
      if (!markUnavailable(error)) throw error
    } else {
      return ((data ?? []) as CompletionRow[]).map(mapCompletion)
    }
  }

  return readLocal().completions.slice(-limit)
}

export async function fetchSchedulingPreferences(): Promise<UserSchedulingPreferences | null> {
  const userId = await currentUserId()

  if (!supabasePlannerDisabled) {
    const { data, error } = await supabase
      .from('user_scheduling_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      if (!markUnavailable(error)) throw error
    } else {
      return data ? mapPreferences(data as PreferenceRow) : null
    }
  }

  return readLocal().preferences
}

export function computePreferences(
  completions: TaskCompletion[],
): UserSchedulingPreferences | null {
  if (completions.length < 3) return null

  const hourCounts = new Array<number>(24).fill(0)
  for (const completion of completions) hourCounts[completion.hour_of_day]++

  let peakStart = 9
  let bestWindow = 0
  for (let hour = 5; hour <= 20; hour++) {
    const window = hourCounts[hour] + hourCounts[hour + 1] + hourCounts[hour + 2]
    if (window > bestWindow) {
      bestWindow = window
      peakStart = hour
    }
  }

  const withEstimates = completions.filter(
    (c) => c.estimated_minutes && c.estimated_minutes > 0 && c.actual_minutes && c.actual_minutes > 0,
  )
  let accuracy = 1
  if (withEstimates.length >= 3) {
    const ratios = withEstimates.map((c) => c.actual_minutes! / c.estimated_minutes!)
    accuracy = Math.max(0.3, Math.min(3, ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length))
  }

  const days = new Set(completions.map((c) => c.completed_at.slice(0, 10)))
  const avgPerDay = days.size > 0 ? completions.length / days.size : 4

  return {
    peak_start_hour: peakStart,
    peak_end_hour: peakStart + 3,
    avg_estimation_accuracy: accuracy,
    preferred_break_minutes: 5,
    avg_tasks_per_day: Math.round(avgPerDay * 10) / 10,
    total_completions: completions.length,
    updated_at: new Date().toISOString(),
  }
}

export async function recalculatePreferences(
  userId?: string,
): Promise<UserSchedulingPreferences | null> {
  const uid = userId ?? (await currentUserId())

  if (supabasePlannerDisabled) {
    const store = readLocal()
    store.preferences = computePreferences(store.completions)
    writeLocal(store)
    return store.preferences
  }

  const completions = await fetchCompletions(500)
  const preferences = computePreferences(completions)
  if (!preferences) return null

  const { error } = await supabase.from('user_scheduling_preferences').upsert(
    {
      user_id: uid,
      peak_start_hour: preferences.peak_start_hour,
      peak_end_hour: preferences.peak_end_hour,
      avg_estimation_accuracy: preferences.avg_estimation_accuracy,
      preferred_break_minutes: preferences.preferred_break_minutes,
      avg_tasks_per_day: preferences.avg_tasks_per_day,
      total_completions: preferences.total_completions,
      updated_at: preferences.updated_at,
    },
    { onConflict: 'user_id' },
  )

  if (error && !markUnavailable(error)) throw error
  return preferences
}
