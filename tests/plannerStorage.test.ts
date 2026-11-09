import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

import type { Task } from '@/lib/tasks'

/**
 * This machine's Node exposes an experimental, method-less `localStorage`
 * which shadows happy-dom's, so stub a minimal in-memory Storage.
 */
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key: string) => (entries.has(key) ? (entries.get(key) as string) : null),
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key)
    },
    setItem: (key: string, value: string) => {
      entries.set(key, String(value))
    },
  }
}

const missingPlansError = { code: '42P01', message: 'relation "public.plans" does not exist' }

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    user_id: 'user-1',
    task_list_id: null,
    note_id: null,
    project_id: null,
    title: 'A task',
    description: null,
    priority: 'medium',
    status: 'todo',
    due_date: new Date().toISOString(),
    start_date: null,
    completed_at: null,
    recurrence_pattern_id: null,
    is_recurring: false,
    parent_task_id: null,
    sort_order: 0,
    estimated_minutes: 30,
    actual_minutes: null,
    is_starred: false,
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    labels: [],
    progress: 0,
    ...overrides,
  }
}

describe('planner storage fallback', () => {
  let storage: typeof import('../lib/planner/storage')

  beforeEach(async () => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    window.localStorage.clear()
    vi.resetModules()
    storage = await import('../lib/planner/storage')
    const mock = (globalThis as any).__supabase_mock
    mock.__resetMockState()
    // Simulate a project that has not applied PLANNER_SCHEMA.sql yet.
    mock.__mockState.nextError = missingPlansError
  })

  it('stores plans locally when the plans table is missing', async () => {
    const plan = await storage.createPlan({
      title: 'Today plan',
      scope: 'today',
      scope_start: new Date().toISOString(),
      scope_end: new Date().toISOString(),
      availability_start: '09:00',
      availability_end: '17:00',
      break_minutes: 5,
    })

    expect(plan.title).toBe('Today plan')
    expect(plan.items).toEqual([])

    const items = await storage.createPlanItems(plan.id, [
      {
        task_id: 'task-1',
        task_title: 'A task',
        task_priority: 'medium',
        scheduled_start: new Date().toISOString(),
        scheduled_end: new Date().toISOString(),
        sort_order: 0,
        status: 'pending',
        estimated_minutes: 30,
      },
    ])
    expect(items).toHaveLength(1)

    await storage.updatePlanItem(items[0].id, { status: 'completed' })

    const plans = await storage.fetchPlans()
    expect(plans).toHaveLength(1)
    expect(plans[0].items[0].status).toBe('completed')

    await storage.deletePlan(plan.id)
    expect(await storage.fetchPlans()).toHaveLength(0)
  })

  it('records completions locally and learns preferences', async () => {
    const task = makeTask()
    await storage.recordCompletion(task, null, 45)
    await storage.recordCompletion(task, null, 50)
    await storage.recordCompletion(task, null, 55)

    const completions = await storage.fetchCompletions()
    expect(completions).toHaveLength(3)
    expect(completions[0].labels).toEqual([])

    const preferences = await storage.fetchSchedulingPreferences()
    expect(preferences?.total_completions).toBe(3)
    expect(preferences?.peak_start_hour).toBeGreaterThanOrEqual(5)
    expect(preferences?.avg_estimation_accuracy).toBeCloseTo(50 / 30, 2)
  })

  it('computes peak hours from the busiest three hour window', () => {
    const completions = [10, 10, 10, 11, 15].map((hour, index) => ({
      id: `c-${index}`,
      task_id: 'task-1',
      plan_item_id: null,
      completed_at: new Date(2026, 0, 1 + index).toISOString(),
      actual_minutes: 30,
      estimated_minutes: 30,
      day_of_week: index,
      hour_of_day: hour,
      priority: 'medium' as const,
      labels: [],
      project_id: null,
    }))

    const preferences = storage.computePreferences(completions)
    expect(preferences?.peak_start_hour).toBe(9)
    expect(preferences?.peak_end_hour).toBe(12)
    expect(preferences?.avg_tasks_per_day).toBe(1)
  })
})
