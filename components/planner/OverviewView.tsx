'use client'

import { useMemo } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flame,
  ListTodo,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Project } from '@/lib/projects'
import type { CalendarEvent, RecurrencePattern } from '@/lib/events'
import type { Task } from '@/lib/tasks'
import type { PlannerPlan } from '@/lib/planner/types'
import { isTaskOpen } from '@/lib/task-agenda'
import { formatTime, isSameDay } from '@/lib/planner/date-utils'
import {
  PRIORITY_META,
  ProgressBar,
  ProgressRing,
  STATUS_META,
  dueLabel,
} from './PlannerUi'

type PlannerSection = 'overview' | 'tasks' | 'calendar' | 'timetable' | 'plan' | 'projects' | 'settings'

export interface OverviewViewProps {
  tasks: Task[]
  events: CalendarEvent[]
  recurrencePatterns: RecurrencePattern[]
  projects: Project[]
  onNavigate: (section: PlannerSection) => void
  onOpenTask: (task: Task) => void
  onCompleteTask: (task: Task) => void
  onNewTask: () => void
  onNewEvent: () => void
  availableMinutes: number
  activePlan?: PlannerPlan | null
}

export default function OverviewView({
  tasks,
  events,
  recurrencePatterns,
  projects,
  onNavigate,
  onOpenTask,
  onCompleteTask,
  onNewTask,
  onNewEvent,
  availableMinutes,
  activePlan = null,
}: OverviewViewProps) {
  const now = useMemo(() => new Date(), [])
  const today = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    [now],
  )
  const weekAgo = useMemo(() => new Date(today.getTime() - 7 * 86_400_000), [today])

  const openTasks = useMemo(() => tasks.filter(isTaskOpen), [tasks])
  const completedThisWeek = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status === 'completed' &&
          task.completed_at &&
          new Date(task.completed_at) >= weekAgo,
      ),
    [tasks, weekAgo],
  )
  const overdue = useMemo(
    () => openTasks.filter((task) => task.due_date && new Date(task.due_date) < today),
    [openTasks, today],
  )
  const dueToday = useMemo(
    () =>
      openTasks.filter((task) => task.due_date && isSameDay(new Date(task.due_date), today)),
    [openTasks, today],
  )
  const attention = useMemo(
    () =>
      [...overdue, ...dueToday]
        .sort((a, b) => {
          const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
          const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
          return aDue - bDue
        })
        .slice(0, 6),
    [overdue, dueToday],
  )

  const todayEvents = useMemo(
    () =>
      events
        .filter((event) => !event.is_cancelled && isSameDay(new Date(event.start_time), today))
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [events, today],
  )

  const upcomingTasks = useMemo(
    () =>
      [...openTasks]
        .filter((task) => task.due_date && new Date(task.due_date) >= today)
        .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
        .slice(0, 5),
    [openTasks, today],
  )
  const upcomingEvents = useMemo(
    () =>
      events
        .filter((event) => !event.is_cancelled && new Date(event.start_time) >= now)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        .slice(0, 5),
    [events, now],
  )

  const priorityBreakdown = useMemo(() => {
    const total = openTasks.length || 1
    return (['urgent', 'high', 'medium', 'low'] as const).map((priority) => {
      const count = openTasks.filter((task) => task.priority === priority).length
      return { priority, count, percent: Math.round((count / total) * 100) }
    })
  }, [openTasks])

  const weekProgress = useMemo(() => {
    const dueThisWeek = tasks.filter(
      (task) =>
        task.due_date &&
        new Date(task.due_date) >= weekAgo &&
        new Date(task.due_date) <= new Date(today.getTime() + 7 * 86_400_000),
    )
    const completed = dueThisWeek.filter((task) => task.status === 'completed').length
    return dueThisWeek.length > 0 ? Math.round((completed / dueThisWeek.length) * 100) : 0
  }, [tasks, weekAgo, today])

  const projectBreakdown = useMemo(
    () =>
      projects
        .map((project) => {
          const projectTasks = tasks.filter((task) => task.project_id === project.id)
          const open = projectTasks.filter(isTaskOpen).length
          const done = projectTasks.filter((task) => task.status === 'completed').length
          return { project, open, done, total: projectTasks.length }
        })
        .filter((entry) => entry.total > 0)
        .sort((a, b) => b.open - a.open)
        .slice(0, 4),
    [projects, tasks],
  )

  const planSummary = useMemo(() => {
    if (!activePlan || activePlan.items.length === 0) return null
    const done = activePlan.items.filter(
      (item) => item.status === 'completed' || item.status === 'skipped',
    ).length
    const next = activePlan.items.find((item) => item.status === 'pending')
    return {
      progress: Math.round((done / activePlan.items.length) * 100),
      remaining: activePlan.items.length - done,
      next,
    }
  }, [activePlan])

  const timetableToday = useMemo(
    () =>
      events.filter(
        (event) =>
          event.category === 'timetable' &&
          !event.is_cancelled &&
          (event.recurrence_pattern_id
            ? recurrencePatterns.some(
                (pattern) =>
                  pattern.id === event.recurrence_pattern_id &&
                  (pattern.days_of_week ?? [new Date(event.start_time).getDay()]).includes(
                    now.getDay(),
                  ),
              )
            : isSameDay(new Date(event.start_time), today)),
      ),
    [events, recurrencePatterns, now, today],
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Open tasks
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-foreground">
                {openTasks.length}
              </p>
              <p className="mt-0.5 text-[10px] text-muted">
                {overdue.length} overdue · {dueToday.length} today
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent">
              <ListTodo size={15} />
            </span>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Completed this week
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-foreground">
                {completedThisWeek.length}
              </p>
              <p className="mt-0.5 text-[10px] text-muted">Keep the streak going</p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--success-light)] text-success">
              <CheckCircle2 size={15} />
            </span>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Events today
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-foreground">
                {todayEvents.length}
              </p>
              <p className="mt-0.5 text-[10px] text-muted">
                {todayEvents[0]
                  ? `Next at ${formatTime(new Date(todayEvents[0].start_time))}`
                  : 'Nothing scheduled'}
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--warning-light)] text-warning">
              <CalendarDays size={15} />
            </span>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Free focus time
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-foreground">
                {Math.round(availableMinutes / 60)}h
              </p>
              <p className="mt-0.5 text-[10px] text-muted">Between 09:00 and 17:00</p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-muted">
              <Clock3 size={15} />
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="glass-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
                <Flame size={15} className="text-danger" />
                Needs attention
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => onNavigate('tasks')}>
                All tasks
                <ArrowRight size={12} />
              </Button>
            </div>

            {attention.length === 0 ? (
              <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-6 text-center text-[11px] text-muted">
                Nothing overdue or due today. Great work.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {attention.map((task) => {
                  const isOverdue =
                    task.due_date && new Date(task.due_date).getTime() < today.getTime()
                  return (
                    <li key={task.id} className="flex items-center gap-2.5 py-2">
                      <button
                        type="button"
                        onClick={() => onCompleteTask(task)}
                        aria-label={`Complete ${task.title}`}
                        className="focus-ring flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-transparent hover:border-accent hover:bg-[var(--accent-light)] hover:text-accent"
                      >
                        <CheckCircle2 size={9} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenTask(task)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-[12px] font-medium text-foreground">
                          {task.title}
                        </span>
                        <span className="flex items-center gap-2 text-[10px] text-muted">
                          <span className={isOverdue ? 'font-semibold text-danger' : ''}>
                            {isOverdue && <AlertTriangle size={9} className="mr-0.5 inline" />}
                            {dueLabel(task)}
                          </span>
                          <span className={PRIORITY_META[task.priority].className}>
                            {PRIORITY_META[task.priority].label}
                          </span>
                          {task.estimated_minutes ? <span>{task.estimated_minutes}m</span> : null}
                        </span>
                      </button>
                      <StatusBadge task={task} />
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="glass-card p-4">
              <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-foreground">
                <Target size={14} className="text-accent" />
                Upcoming tasks
              </h2>
              {upcomingTasks.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-muted">No dated tasks ahead.</p>
              ) : (
                <ul className="space-y-1.5">
                  {upcomingTasks.map((task) => (
                    <li key={task.id} className="flex items-center gap-1.5 text-[11px]">
                      <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_META[task.priority].dot}`} />
                      <button
                        type="button"
                        onClick={() => onOpenTask(task)}
                        className="min-w-0 flex-1 truncate text-left text-foreground hover:underline"
                      >
                        {task.title}
                      </button>
                      <span className="shrink-0 text-[10px] text-muted">{dueLabel(task)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="glass-card p-4">
              <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-foreground">
                <CalendarDays size={14} className="text-warning" />
                Next events
              </h2>
              {upcomingEvents.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-muted">Nothing scheduled.</p>
              ) : (
                <ul className="space-y-1.5">
                  {upcomingEvents.map((event) => (
                    <li key={event.id} className="flex items-center gap-1.5 text-[11px]">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: event.color || 'var(--accent)' }}
                      />
                      <button
                        type="button"
                        onClick={() => onNavigate('calendar')}
                        className="min-w-0 flex-1 truncate text-left text-foreground hover:underline"
                      >
                        {event.title}
                      </button>
                      <span className="shrink-0 text-[10px] text-muted">
                        {new Date(event.start_time).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="glass-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
                <Clock3 size={14} className="text-muted" />
                Today&apos;s recurring schedule
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => onNavigate('timetable')}>
                Timetable
                <ArrowRight size={12} />
              </Button>
            </div>
            {timetableToday.length === 0 ? (
              <p className="py-3 text-center text-[11px] text-muted">
                No timetable blocks today.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {timetableToday.map((event) => (
                  <li key={event.id} className="flex items-center gap-2 text-[11px]">
                    <span className="w-20 shrink-0 text-[10px] font-semibold tabular-nums text-muted">
                      {formatTime(new Date(event.start_time))} –{' '}
                      {formatTime(new Date(event.end_time))}
                    </span>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: event.color || 'var(--accent)' }}
                    />
                    <span className="min-w-0 flex-1 truncate text-foreground">{event.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {activePlan && planSummary && (
            <section className="glass-card p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
                Active smart plan
              </p>
              <h2 className="mt-0.5 truncate font-display text-sm font-semibold text-foreground">
                {activePlan.title}
              </h2>
              <div className="mt-2 flex items-center gap-2">
                <ProgressBar value={planSummary.progress} className="flex-1" />
                <span className="text-[10px] font-semibold tabular-nums text-foreground">
                  {planSummary.progress}%
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted">
                {planSummary.remaining} blocks left
              </p>
              {planSummary.next && (
                <p className="mt-2 rounded-lg bg-[var(--surface-sunken)] px-2 py-1.5 text-[10px] text-muted">
                  Next:{' '}
                  <span className="font-semibold text-foreground">
                    {planSummary.next.task_title}
                  </span>
                  {planSummary.next.scheduled_start
                    ? ` · ${formatTime(new Date(planSummary.next.scheduled_start))}`
                    : ''}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => onNavigate('plan')}
              >
                Open plan
                <ArrowRight size={11} />
              </Button>
            </section>
          )}

          <section className="glass-card flex flex-col items-center p-4">
            <h2 className="mb-2 self-start flex items-center gap-2 font-display text-sm font-semibold text-foreground">
              <TrendingUp size={14} className="text-accent" />
              Week progress
            </h2>
            <ProgressRing value={weekProgress} size={84} />
            <p className="mt-2 text-center text-[10px] text-muted">
              Tasks due this week that are already done.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              icon={Sparkles}
              onClick={() => onNavigate('plan')}
            >
              Plan my day
            </Button>
          </section>

          <section className="glass-card p-4">
            <h2 className="mb-2 font-display text-sm font-semibold text-foreground">
              Priority breakdown
            </h2>
            <ul className="space-y-2">
              {priorityBreakdown.map(({ priority, count, percent }) => (
                <li key={priority}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className={`font-semibold ${PRIORITY_META[priority].className}`}>
                      {PRIORITY_META[priority].label}
                    </span>
                    <span className="tabular-nums text-muted">{count}</span>
                  </div>
                  <ProgressBar value={percent} className="mt-0.5" />
                </li>
              ))}
            </ul>
          </section>

          {projectBreakdown.length > 0 && (
            <section className="glass-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-foreground">Projects</h2>
                <Button type="button" variant="ghost" size="sm" onClick={() => onNavigate('projects')}>
                  All
                </Button>
              </div>
              <ul className="space-y-2">
                {projectBreakdown.map(({ project, open, total }) => (
                  <li key={project.id}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="truncate text-foreground">{project.name}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted">
                        {open} open
                      </span>
                    </div>
                    <ProgressBar
                      value={total > 0 ? Math.round(((total - open) / total) * 100) : 0}
                      className="mt-1"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="glass-card space-y-2 p-4">
            <h2 className="font-display text-sm font-semibold text-foreground">Quick actions</h2>
            <Button type="button" variant="primary" size="sm" icon={Plus} className="w-full" onClick={onNewTask}>
              New task
            </Button>
            <Button type="button" variant="secondary" size="sm" icon={CalendarDays} className="w-full" onClick={onNewEvent}>
              New event
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Wand2}
              className="w-full"
              onClick={() => onNavigate('plan')}
            >
              Smart plan
            </Button>
          </section>
        </aside>
      </div>
    </div>
  )
}

function StatusBadge({ task }: { task: Task }) {
  if (task.status === 'todo') return null
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_META[task.status].className}`}>
      {STATUS_META[task.status].label}
    </span>
  )
}
