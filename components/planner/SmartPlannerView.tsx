'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gauge,
  Lightbulb,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
  SkipForward,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ToastProvider'
import type { Task } from '@/lib/tasks'
import type { CalendarEvent, RecurrencePattern } from '@/lib/events'
import { freeMinutesForDay, generatePlan, type SchedulerResult } from '@/lib/planner/scheduler'
import { estimateTaskDuration, getStrategy } from '@/lib/planner/scoring'
import {
  createPlan,
  createPlanItems,
  deletePlan,
  fetchCompletions,
  fetchPlans,
  fetchSchedulingPreferences,
  recordCompletion,
  updatePlan,
  updatePlanItem,
} from '@/lib/planner/storage'
import type {
  PlanItem,
  PlannerInsight,
  PlannerPlan,
  PlanScope,
  PlanningMode,
  TaskCompletion,
  UserSchedulingPreferences,
} from '@/lib/planner/types'
import { formatTime } from '@/lib/planner/date-utils'
import {
  FIELD_CLASS,
  LABEL_CLASS,
  PRIORITY_META,
  PlannerToolbar,
  ProgressBar,
  ProgressRing,
  SELECT_CLASS,
  SectionCardHeader,
  ToolbarDivider,
  ToolbarLabel,
} from './PlannerUi'

const SCOPE_OPTIONS: { value: PlanScope; label: string; hint: string }[] = [
  { value: 'today', label: 'Today', hint: 'Rest of today' },
  { value: 'tomorrow', label: 'Tomorrow', hint: 'All of tomorrow' },
  { value: 'this_week', label: 'This week', hint: 'Weekdays ahead' },
  { value: 'this_weekend', label: 'Weekend', hint: 'Sat + Sun' },
  { value: 'custom', label: 'Custom', hint: 'Pick a range' },
]

type Step = 'configure' | 'estimate' | 'review' | 'history'

function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function planProgress(plan: PlannerPlan): number {
  if (plan.items.length === 0) return 0
  const done = plan.items.filter(
    (item) => item.status === 'completed' || item.status === 'skipped',
  ).length
  return Math.round((done / plan.items.length) * 100)
}

export interface SmartPlannerViewProps {
  tasks: Task[]
  events: CalendarEvent[]
  recurrencePatterns: RecurrencePattern[]
  planningMode: PlanningMode
  onPlanningModeChange: (mode: PlanningMode) => void
  onOpenTask: (task: Task) => void
  onPlansChanged?: () => void
}

export default function SmartPlannerView({
  tasks,
  events,
  recurrencePatterns,
  planningMode,
  onPlanningModeChange,
  onOpenTask,
  onPlansChanged,
}: SmartPlannerViewProps) {
  const toast = useToast()
  const [step, setStep] = useState<Step>('configure')
  const [scope, setScope] = useState<PlanScope>('today')
  const [availabilityStart, setAvailabilityStart] = useState('09:00')
  const [availabilityEnd, setAvailabilityEnd] = useState('17:00')
  const [breakMinutes, setBreakMinutes] = useState(5)
  const [customStart, setCustomStart] = useState(() => toLocalInput(new Date()))
  const [customEnd, setCustomEnd] = useState(() => {
    const end = new Date()
    end.setHours(18, 0, 0, 0)
    return toLocalInput(end)
  })

  const [estimateOverrides, setEstimateOverrides] = useState<Record<string, number>>({})
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [tasksNeedingEstimates, setTasksNeedingEstimates] = useState<Task[]>([])
  const [result, setResult] = useState<SchedulerResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [plans, setPlans] = useState<PlannerPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<PlannerPlan | null>(null)
  const [completions, setCompletions] = useState<TaskCompletion[]>([])
  const [preferences, setPreferences] = useState<UserSchedulingPreferences | null>(null)
  const [error, setError] = useState<string | null>(null)

  const outstandingTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          !task.is_archived &&
          (task.status === 'todo' || task.status === 'in_progress' || task.status === 'waiting'),
      ),
    [tasks],
  )

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true)
    try {
      const loaded = await fetchPlans()
      setPlans(loaded)
      setSelectedPlan((current) =>
        current ? loaded.find((plan) => plan.id === current.id) ?? null : current,
      )
    } catch (err) {
      console.warn('Plans unavailable:', err)
      setPlans([])
    } finally {
      setLoadingPlans(false)
    }
  }, [])

  const loadAdaptiveData = useCallback(async () => {
    try {
      const [history, prefs] = await Promise.all([
        fetchCompletions(),
        fetchSchedulingPreferences(),
      ])
      setCompletions(history)
      setPreferences(prefs)
    } catch (err) {
      console.warn('Completion history unavailable:', err)
    }
  }, [])

  useEffect(() => {
    void loadPlans()
    void loadAdaptiveData()
  }, [loadPlans, loadAdaptiveData])

  const runScheduler = () => {
    setGenerating(true)
    setError(null)
    try {
      const filteredTasks = outstandingTasks.filter((task) => !skipped.has(task.id))
      const adjustedDurations: Record<string, number> = {}

      for (const task of filteredTasks) {
        const estimation = estimateTaskDuration(
          task,
          completions,
          preferences,
          estimateOverrides[task.id],
        )
        if (estimation.source !== 'default' || estimateOverrides[task.id]) {
          adjustedDurations[task.id] = estimation.minutes
        }
      }

      const scheduleResult = generatePlan({
        config: {
          scope,
          customStart: scope === 'custom' ? customStart : undefined,
          customEnd: scope === 'custom' ? customEnd : undefined,
          availabilityStart,
          availabilityEnd,
          breakMinutes,
        },
        tasks: filteredTasks,
        events,
        recurrencePatterns,
        estimateOverrides,
        adjustedDurations,
        strategy: getStrategy(planningMode),
        completions,
        preferences,
      })

      setResult(scheduleResult)
      setStep('review')
    } catch (err) {
      console.error('Plan generation failed:', err)
      setError(err instanceof Error ? err.message : 'Could not generate a plan.')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerate = () => {
    const missing = outstandingTasks.filter(
      (task) => !task.estimated_minutes && !estimateOverrides[task.id],
    )
    if (missing.length > 0) {
      setTasksNeedingEstimates(missing)
      setStep('estimate')
      return
    }
    runScheduler()
  }

  const handleAcceptPlan = async () => {
    if (!result) return
    setSaving(true)
    setError(null)
    try {
      const scopeLabel = SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? scope
      const dateLabel = new Date().toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })

      const plan = await createPlan({
        title: `${scopeLabel} plan — ${dateLabel}`,
        scope,
        scope_start: result.scopeStart,
        scope_end: result.scopeEnd,
        availability_start: availabilityStart,
        availability_end: availabilityEnd,
        break_minutes: breakMinutes,
        status: 'active',
      })

      const allItems = [...result.scheduledItems, ...result.unscheduledItems]
      if (allItems.length > 0) {
        await createPlanItems(
          plan.id,
          allItems.map((item) => ({
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
      }

      await loadPlans()
      onPlansChanged?.()
      setResult(null)
      setStep('history')
      toast.push({ title: 'Plan created', description: `${allItems.length} blocks scheduled`, variant: 'success' })
    } catch (err) {
      console.error('Saving plan failed:', err)
      setError(err instanceof Error ? err.message : 'Could not save the plan.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleItem = async (item: PlanItem) => {
    const next = item.status === 'completed' ? 'pending' : 'completed'
    try {
      await updatePlanItem(item.id, { status: next })
      if (next === 'completed') {
        const task = tasks.find((candidate) => candidate.id === item.task_id)
        if (task) await recordCompletion(task, item.id, item.estimated_minutes)
        await loadAdaptiveData()
      }
      await loadPlans()
    } catch (err) {
      console.error('Updating plan item failed:', err)
      toast.push({ title: 'Could not update the item', variant: 'error' })
    }
  }

  const handleSkipItem = async (item: PlanItem) => {
    const next = item.status === 'skipped' ? 'pending' : 'skipped'
    try {
      await updatePlanItem(item.id, { status: next })
      await loadPlans()
    } catch (err) {
      console.error('Skipping plan item failed:', err)
    }
  }

  const handleCompletePlan = async (plan: PlannerPlan) => {
    try {
      await updatePlan(plan.id, { status: 'completed' })
      await loadPlans()
      toast.push({ title: 'Plan completed', variant: 'success' })
    } catch (err) {
      console.error('Completing plan failed:', err)
    }
  }

  const handleDiscardPlan = async (plan: PlannerPlan) => {
    try {
      await deletePlan(plan.id)
      if (selectedPlan?.id === plan.id) setSelectedPlan(null)
      await loadPlans()
      onPlansChanged?.()
      toast.push({ title: 'Plan discarded', variant: 'success' })
    } catch (err) {
      console.error('Discarding plan failed:', err)
      toast.push({ title: 'Could not discard plan', variant: 'error' })
    }
  }

  const insights = useMemo<PlannerInsight[]>(() => {
    if (completions.length < 5 || !preferences) return []
    const formatHour = (hour: number) => {
      const period = hour >= 12 ? 'PM' : 'AM'
      const value = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
      return `${value} ${period}`
    }
    const result: PlannerInsight[] = [
      {
        type: 'peak_hours',
        label: 'Peak productivity',
        value: `${formatHour(preferences.peak_start_hour)} – ${formatHour(preferences.peak_end_hour)}`,
        description: `You complete the most tasks between ${formatHour(preferences.peak_start_hour)} and ${formatHour(preferences.peak_end_hour)}`,
      },
      {
        type: 'daily_capacity',
        label: 'Daily capacity',
        value: `~${Math.round(preferences.avg_tasks_per_day)} tasks/day`,
        description: `You average ${Math.round(preferences.avg_tasks_per_day)} completed tasks per day`,
      },
    ]

    const accuracy = Math.round(preferences.avg_estimation_accuracy * 100)
    result.push({
      type: 'estimation_accuracy',
      label: 'Estimation accuracy',
      value: `${accuracy}%`,
      description:
        preferences.avg_estimation_accuracy > 1.15
          ? `You typically take ${accuracy}% of your estimate — you tend to underestimate`
          : preferences.avg_estimation_accuracy < 0.85
            ? `You typically take ${accuracy}% of your estimate — you tend to overestimate`
            : 'Your time estimates are quite accurate!',
    })

    return result
  }, [completions.length, preferences])

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.status === 'active' || plan.status === 'draft'),
    [plans],
  )
  const archivedPlans = useMemo(
    () => plans.filter((plan) => plan.status === 'completed' || plan.status === 'discarded'),
    [plans],
  )

  const todayFreeMinutes = useMemo(
    () =>
      freeMinutesForDay(
        new Date(),
        events,
        recurrencePatterns,
        availabilityStart,
        availabilityEnd,
      ),
    [events, recurrencePatterns, availabilityStart, availabilityEnd],
  )

  return (
    <div className="space-y-4">
      <PlannerToolbar label="Smart planner controls">
        <div className="segmented" role="tablist" aria-label="Smart planner sections">
          <button
            type="button"
            role="tab"
            aria-selected={step !== 'history'}
            data-active={step !== 'history'}
            onClick={() => {
              setStep('configure')
              setResult(null)
              setSelectedPlan(null)
            }}
            className="segmented-item h-8 gap-1.5 px-3 text-[12px]"
          >
            <Wand2 size={13} />
            New plan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={step === 'history'}
            data-active={step === 'history'}
            onClick={() => {
              setStep('history')
              setResult(null)
            }}
            className="segmented-item h-8 gap-1.5 px-3 text-[12px]"
          >
            <CalendarCheck2 size={13} />
            My plans
            <span className="tabular-nums opacity-60">{plans.length}</span>
          </button>
        </div>

        <ToolbarDivider />

        <div className="ml-auto flex items-center gap-1.5 pr-1">
          <ToolbarLabel>Mode</ToolbarLabel>
          <div className="segmented">
            {(['adaptive', 'standard'] as PlanningMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onPlanningModeChange(mode)}
                aria-pressed={planningMode === mode}
                data-active={planningMode === mode}
                className="segmented-item h-7 px-2.5 text-[11px] capitalize"
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </PlannerToolbar>

      {error && (
        <p className="rounded-xl border border-danger bg-[var(--danger-light)] px-3 py-2 text-[11px] text-danger">
          {error}
        </p>
      )}

      {step !== 'history' && (
        <ol className="pl-steps" aria-label="Plan creation steps">
          {(
            [
              { key: 'configure', label: 'Configure' },
              { key: 'estimate', label: 'Estimates' },
              { key: 'review', label: 'Review' },
            ] as const
          ).map((item, index, steps) => {
            const currentIndex = steps.findIndex((candidate) => candidate.key === step)
            const position = currentIndex === -1 ? 0 : currentIndex
            const state = index < position ? 'done' : index === position ? 'current' : 'todo'
            return (
              <li key={item.key} className="pl-step" data-state={state}>
                <span className="pl-step-dot">
                  {state === 'done' ? <Check size={10} /> : index + 1}
                </span>
                {item.label}
                {index < steps.length - 1 && <span className="pl-step-connector" aria-hidden="true" />}
              </li>
            )
          })}
        </ol>
      )}

      {step === 'configure' && (
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <section className="glass-card p-4">
              <SectionCardHeader
                icon={Sparkles}
                title="What should I plan?"
                subtitle="The planner fills your free time with the most important open tasks, avoids your existing events and inserts breaks."
              />
              <div className="mt-3" />

              <PlannerToolbar label="Plan scope">
                <ToolbarLabel>Scope</ToolbarLabel>
                <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scroll-thin">
                  {SCOPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setScope(option.value)}
                      aria-pressed={scope === option.value}
                      data-active={scope === option.value}
                      title={option.hint}
                      className="pl-chip focus-ring shrink-0"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </PlannerToolbar>

              {scope === 'custom' && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={LABEL_CLASS} htmlFor="plan-start">
                      From
                    </label>
                    <input
                      id="plan-start"
                      type="datetime-local"
                      value={customStart}
                      onChange={(event) => setCustomStart(event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS} htmlFor="plan-end">
                      To
                    </label>
                    <input
                      id="plan-end"
                      type="datetime-local"
                      value={customEnd}
                      onChange={(event) => setCustomEnd(event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={LABEL_CLASS} htmlFor="plan-avail-start">
                    Availability from
                  </label>
                  <input
                    id="plan-avail-start"
                    type="time"
                    value={availabilityStart}
                    onChange={(event) => setAvailabilityStart(event.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="plan-avail-end">
                    until
                  </label>
                  <input
                    id="plan-avail-end"
                    type="time"
                    value={availabilityEnd}
                    onChange={(event) => setAvailabilityEnd(event.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="plan-break">
                    Break between tasks
                  </label>
                  <select
                    id="plan-break"
                    value={breakMinutes}
                    onChange={(event) => setBreakMinutes(Number(event.target.value))}
                    className={SELECT_CLASS}
                  >
                    {[0, 5, 10, 15, 20, 30].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 0 ? 'No break' : `${minutes} min`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
                <span className="text-[11px] text-muted">
                  {outstandingTasks.length} open tasks · about {Math.round(todayFreeMinutes / 60)}h
                  free today between {availabilityStart} and {availabilityEnd}
                </span>
                {planningMode === 'adaptive' && (
                  <span className="rounded-full bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-semibold text-accent">
                    Adaptive scoring
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  icon={Wand2}
                  onClick={handleGenerate}
                  loading={generating}
                  disabled={outstandingTasks.length === 0}
                >
                  Generate plan
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  icon={RefreshCw}
                  onClick={() => {
                    setEstimateOverrides({})
                    setSkipped(new Set())
                  }}
                >
                  Reset inputs
                </Button>
              </div>
            </section>

            {insights.length > 0 && (
              <section className="glass-card p-4">
                <SectionCardHeader
                  icon={Lightbulb}
                  tone="warning"
                  title="Learned from your history"
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {insights.map((insight) => (
                    <div key={insight.type} className="rounded-xl bg-[var(--surface-sunken)] p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                        {insight.label}
                      </p>
                      <p className="mt-0.5 text-[13px] font-semibold text-foreground">
                        {insight.value}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-4 text-muted">{insight.description}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-muted">
                  Based on {completions.length} completed plan items. Complete plan items to improve
                  the estimates.
                </p>
              </section>
            )}
          </div>

          <aside className="space-y-3">
            <section className="glass-card p-4">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                In the queue
              </h3>
              <ul className="space-y-1.5">
                {outstandingTasks.slice(0, 8).map((task) => (
                  <li key={task.id} className="flex items-center gap-1.5 text-[11px]">
                    <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_META[task.priority].dot}`} />
                    <button
                      type="button"
                      onClick={() => onOpenTask(task)}
                      className="min-w-0 flex-1 truncate text-left text-foreground hover:underline"
                    >
                      {task.title}
                    </button>
                    <span className="shrink-0 text-[10px] text-muted">
                      {estimateOverrides[task.id] ?? task.estimated_minutes ?? 30}m
                    </span>
                  </li>
                ))}
                {outstandingTasks.length === 0 && (
                  <li className="text-[11px] text-muted">Nothing open — enjoy the calm.</li>
                )}
              </ul>
              {outstandingTasks.length > 8 && (
                <p className="mt-2 text-[10px] text-muted">
                  +{outstandingTasks.length - 8} more tasks
                </p>
              )}
            </section>

            {activePlans.length > 0 && (
              <section className="glass-card p-4">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Active plans
                </h3>
                <ul className="space-y-2">
                  {activePlans.slice(0, 3).map((plan) => (
                    <li key={plan.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPlan(plan)
                          setStep('history')
                        }}
                        className="w-full rounded-lg px-1 py-1 text-left hover:bg-[var(--surface-hover)]"
                      >
                        <span className="block truncate text-[11px] font-medium text-foreground">
                          {plan.title}
                        </span>
                        <ProgressBar value={planProgress(plan)} className="mt-1" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      {step === 'estimate' && (
        <section className="glass-card p-4">
          <SectionCardHeader
            icon={Clock3}
            title="A few tasks need an estimate"
            subtitle="Set a duration or skip a task — skipped tasks are left out of this plan."
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={X}
                onClick={() => setStep('configure')}
              >
                Cancel
              </Button>
            }
          />

          <ul className="mt-3 divide-y divide-[var(--border)]">
            {tasksNeedingEstimates.map((task) => {
              const isSkipped = skipped.has(task.id)
              return (
                <li key={task.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_META[task.priority].dot}`} />
                  <span className={`min-w-0 flex-1 truncate text-[12px] ${isSkipped ? 'text-muted line-through' : 'text-foreground'}`}>
                    {task.title}
                  </span>
                  <div className="flex items-center gap-1">
                    {[15, 30, 45, 60, 90].map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() =>
                          setEstimateOverrides((current) => ({ ...current, [task.id]: minutes }))
                        }
                        aria-pressed={estimateOverrides[task.id] === minutes}
                        className={`rounded-lg border px-1.5 py-0.5 text-[10px] font-semibold ${
                          estimateOverrides[task.id] === minutes
                            ? 'border-accent bg-[var(--accent-light)] text-accent'
                            : 'border-[var(--border)] text-muted hover:text-foreground'
                        }`}
                      >
                        {minutes}m
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      value={estimateOverrides[task.id] ?? ''}
                      onChange={(event) =>
                        setEstimateOverrides((current) => ({
                          ...current,
                          [task.id]: Number(event.target.value),
                        }))
                      }
                      placeholder="min"
                      className="glass-input h-7 w-16 px-1.5 text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSkipped((current) => {
                          const next = new Set(current)
                          if (next.has(task.id)) next.delete(task.id)
                          else next.add(task.id)
                          return next
                        })
                      }
                      aria-pressed={isSkipped}
                      className={`rounded-lg border px-1.5 py-0.5 text-[10px] font-semibold ${
                        isSkipped
                          ? 'border-[var(--border)] bg-[var(--surface-sunken)] text-muted'
                          : 'border-[var(--border)] text-muted hover:text-foreground'
                      }`}
                    >
                      Skip
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="mt-3 flex items-center gap-2">
            <Button type="button" variant="primary" size="md" icon={Wand2} onClick={runScheduler}>
              Continue
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setStep('configure')}>
              Back
            </Button>
          </div>
        </section>
      )}

      {step === 'review' && result && (
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="glass-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-foreground">
                  Proposed plan
                </h2>
                <p className="text-[11px] text-muted">
                  {result.scheduledItems.length} blocks ·{' '}
                  {Math.round(result.totalScheduledMinutes / 60)}h scheduled of{' '}
                  {Math.round(result.totalFreeMinutes / 60)}h free
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" icon={ArrowLeft} onClick={() => setStep('configure')}>
                  Change setup
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  onClick={runScheduler}
                  loading={generating}
                >
                  Regenerate
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  icon={Check}
                  onClick={handleAcceptPlan}
                  loading={saving}
                >
                  Accept plan
                </Button>
              </div>
            </div>

            {result.scheduledItems.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-semibold text-foreground">Nothing to schedule</p>
                <p className="mt-1 text-xs text-muted">
                  There are no open tasks with estimates, or no free time in this range.
                </p>
              </div>
            ) : (
              <ol className="divide-y divide-[var(--border)]">
                {result.scheduledItems.map((item) => (
                  <li key={`${item.task_id}-${item.sort_order}`} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-24 shrink-0 text-[11px] font-semibold tabular-nums text-foreground">
                      {item.scheduled_start ? formatTime(new Date(item.scheduled_start)) : '—'}
                      {item.scheduled_end ? ` – ${formatTime(new Date(item.scheduled_end))}` : ''}
                    </span>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_META[item.task_priority].dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-foreground">
                        {item.task_title}
                      </span>
                      <span className="text-[10px] text-muted">
                        {item.estimated_minutes ? `${item.estimated_minutes} min` : 'No estimate'} ·{' '}
                        {PRIORITY_META[item.task_priority].label}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <aside className="space-y-3">
            <section className="glass-card flex flex-col items-center p-4">
              <h3 className="mb-2 self-start text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Schedule quality
              </h3>
              <ProgressRing value={result.quality.overall} size={76} />
              <div className="mt-3 w-full space-y-2">
                {[
                  ['Peak utilisation', result.quality.peakUtilization],
                  ['Task batching', result.quality.batchingScore],
                  ['Deadline buffer', result.quality.deadlineBuffer],
                  ['Breaks respected', result.quality.breakCompliance],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span>{label}</span>
                      <span className="tabular-nums">{value}%</span>
                    </div>
                    <ProgressBar value={Number(value)} className="mt-0.5" />
                  </div>
                ))}
              </div>
            </section>

            <section className="glass-card p-4 text-[11px] text-muted">
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                <Gauge size={12} />
                How it was built
              </h3>
              <ul className="space-y-1">
                <li>• Scope: {SCOPE_OPTIONS.find((option) => option.value === scope)?.label}</li>
                <li>• Availability: {availabilityStart} – {availabilityEnd}</li>
                <li>• {breakMinutes} min break between tasks</li>
                <li>• Strategy: {planningMode}</li>
                <li>• Existing events and timetable blocks are avoided</li>
              </ul>
            </section>
          </aside>
        </div>
      )}

      {step === 'history' && (
        <div className="grid gap-4 2xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-2">
            {loadingPlans ? (
              <div className="glass-card flex items-center justify-center gap-2 py-8 text-[11px] text-muted">
                <Loader2 size={14} className="animate-spin" />
                Loading plans…
              </div>
            ) : plans.length === 0 ? (
              <div className="glass-card px-4 py-8 text-center">
                <ListChecks size={20} className="mx-auto text-accent" />
                <p className="mt-2 text-[12px] font-semibold text-foreground">No saved plans</p>
                <p className="mt-0.5 text-[11px] text-muted">Generate your first plan.</p>
              </div>
            ) : (
              <>
                {activePlans.length > 0 && (
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Active
                  </p>
                )}
                {activePlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      selectedPlan?.id === plan.id
                        ? 'border-accent bg-[var(--accent-light)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[12px] font-semibold text-foreground">
                        {plan.title}
                      </span>
                      <ChevronRight size={13} className="shrink-0 text-muted" />
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                      <Clock3 size={9} />
                      {new Date(plan.scope_start).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                      · {plan.items.length} items
                    </span>
                    <ProgressBar value={planProgress(plan)} className="mt-1.5" />
                  </button>
                ))}

                {archivedPlans.length > 0 && (
                  <p className="mt-3 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Archive
                  </p>
                )}
                {archivedPlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      selectedPlan?.id === plan.id
                        ? 'border-accent bg-[var(--accent-light)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[12px] font-medium text-muted">
                        {plan.title}
                      </span>
                      <span className="shrink-0 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[9px] font-semibold text-muted">
                        {plan.status}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </aside>

          <section className="glass-card min-h-[240px] p-4">
            {!selectedPlan ? (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                <ListChecks size={22} className="text-accent" />
                <p className="mt-2 text-[13px] font-semibold text-foreground">Select a plan</p>
                <p className="mt-1 max-w-xs text-[11px] text-muted">
                  Pick a plan on the left to see its blocks and check items off as you go.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-sm font-semibold text-foreground">
                      {selectedPlan.title}
                    </h2>
                    <p className="text-[11px] text-muted">
                      {new Date(selectedPlan.scope_start).toLocaleDateString()} –{' '}
                      {new Date(selectedPlan.scope_end).toLocaleDateString()} ·{' '}
                      {selectedPlan.availability_start} – {selectedPlan.availability_end} ·{' '}
                      {selectedPlan.break_minutes} min breaks
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedPlan.status === 'active' && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={CheckCircle2}
                        onClick={() => void handleCompletePlan(selectedPlan)}
                      >
                        Complete
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      onClick={() => void handleDiscardPlan(selectedPlan)}
                    >
                      Discard
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={X}
                      onClick={() => setSelectedPlan(null)}
                      aria-label="Close plan"
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <ProgressBar value={planProgress(selectedPlan)} className="flex-1" />
                  <span className="text-[11px] font-semibold tabular-nums text-foreground">
                    {planProgress(selectedPlan)}%
                  </span>
                </div>

                <ol className="mt-3 space-y-1">
                  {selectedPlan.items.map((item) => {
                    const done = item.status === 'completed'
                    const skippedItem = item.status === 'skipped'
                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-2 rounded-xl px-1.5 py-1.5 hover:bg-[var(--surface-sunken)]"
                      >
                        <button
                          type="button"
                          onClick={() => void handleToggleItem(item)}
                          aria-label={done ? 'Reopen item' : 'Complete item'}
                          className={`focus-ring flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                            done
                              ? 'border-accent bg-accent text-accent-foreground'
                              : 'border-[var(--border-strong)] text-transparent hover:border-accent'
                          }`}
                        >
                          <Check size={9} />
                        </button>
                        <span className="w-[104px] shrink-0 text-[10px] font-semibold tabular-nums text-muted">
                          {item.scheduled_start
                            ? formatTime(new Date(item.scheduled_start))
                            : 'Unscheduled'}
                          {item.scheduled_end ? ` – ${formatTime(new Date(item.scheduled_end))}` : ''}
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate text-[12px] ${
                            done || skippedItem ? 'text-muted line-through' : 'text-foreground'
                          }`}
                        >
                          {item.task_title}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted">
                          {item.estimated_minutes ? `${item.estimated_minutes}m` : '—'}
                        </span>
                        <span className={`shrink-0 text-[9px] font-semibold uppercase ${PRIORITY_META[item.task_priority].className}`}>
                          {PRIORITY_META[item.task_priority].label}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleSkipItem(item)}
                          aria-label={skippedItem ? 'Restore item' : 'Skip item'}
                          className={`focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            skippedItem ? 'text-accent' : 'text-muted hover:text-foreground'
                          }`}
                        >
                          <SkipForward size={11} />
                        </button>
                      </li>
                    )
                  })}
                  {selectedPlan.items.length === 0 && (
                    <li className="px-1 py-6 text-center text-[11px] text-muted">
                      This plan has no items.
                    </li>
                  )}
                </ol>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
