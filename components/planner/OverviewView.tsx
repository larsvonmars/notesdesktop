'use client'

import { useMemo } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Flame,
  ListTodo,
  MapPin,
  Repeat,
  Sparkles,
  TrendingUp,
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
  SectionCardHeader,
  StatCard,
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

  /** Today's merged, time-ordered timeline: events + recurring timetable blocks. */
  const todayTimeline = useMemo(() => {
    const seen = new Set<string>()
    const merged: CalendarEvent[] = []
    for (const event of [...todayEvents, ...timetableToday]) {
      if (seen.has(event.id)) continue
      seen.add(event.id)
      merged.push(event)
    }
    return merged.sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    )
  }, [todayEvents, timetableToday])

  return (
    <div className="space-y-4">
      <div className="pl-stagger grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard
          icon={ListTodo}
          tone="accent"
          label="Open tasks"
          value={openTasks.length}
          caption={`${overdue.length} overdue · ${dueToday.length} today`}
          onClick={() => onNavigate('tasks')}
        />
        <StatCard
          icon={CheckCircle2}
          tone="success"
          label="Completed this week"
          value={completedThisWeek.length}
          caption="Keep the streak going"
        />
        <StatCard
          icon={CalendarDays}
          tone="warning"
          label="Events today"
          value={todayEvents.length}
          caption={
            todayEvents[0]
              ? `Next at ${formatTime(new Date(todayEvents[0].start_time))}`
              : 'Nothing scheduled'
          }
          onClick={() => onNavigate('calendar')}
        />
        <StatCard
          icon={Clock3}
          tone="muted"
          label="Free focus time"
          value={`${Math.round(availableMinutes / 60)}h`}
          caption="Between 09:00 and 17:00"
          onClick={() => onNavigate('plan')}
        />
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="glass-card overflow-hidden">
            <SectionCardHeader
              icon={Flame}
              tone="danger"
              title="Needs attention"
              subtitle="Overdue and due-today tasks, oldest first."
              actions={
                <Button type="button" variant="ghost" size="sm" onClick={() => onNavigate('tasks')}>
                  All tasks
                  <ArrowRight size={12} />
                </Button>
              }
            />
            <div className="pl-card-body pt-3">
              {attention.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface-sunken)] px-4 py-5">
                  <span className="pl-icon-tile" data-tone="success" data-size="sm">
                    <Check size={13} />
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold text-foreground">All clear</p>
                    <p className="text-[11px] text-muted">
                      Nothing overdue or due today. Great work.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="-mx-1 space-y-0.5">
                  {attention.map((task) => {
                    const isOverdue =
                      task.due_date && new Date(task.due_date).getTime() < today.getTime()
                    return (
                      <li
                        key={task.id}
                        className="pl-task-row flex items-center gap-2.5 rounded-xl py-1.5 pl-3 pr-1.5 transition-colors hover:bg-[var(--surface-sunken)]"
                        style={{ ['--pl-rail' as string]: PRIORITY_META[task.priority].color }}
                      >
                        <button
                          type="button"
                          onClick={() => onCompleteTask(task)}
                          aria-label={`Complete ${task.title}`}
                          className="focus-ring flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-transparent transition-colors hover:border-accent hover:bg-[var(--accent-light)] hover:text-accent"
                        >
                          <CheckCircle2 size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenTask(task)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-[12.5px] font-medium text-foreground">
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
            </div>
          </section>

          <section className="glass-card overflow-hidden">
            <SectionCardHeader
              icon={Clock3}
              tone="muted"
              title="Today's schedule"
              subtitle="Events and recurring blocks in time order."
              actions={
                <Button type="button" variant="ghost" size="sm" onClick={() => onNavigate('timetable')}>
                  Timetable
                  <ArrowRight size={12} />
                </Button>
              }
            />
            <div className="pl-card-body pt-3">
              {todayTimeline.length === 0 ? (
                <p className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-5 text-center text-[11px] text-muted">
                  No events or timetable blocks today — the day is yours.
                </p>
              ) : (
                <ol className="pl-timeline space-y-1 pl-5">
                  {todayTimeline.map((event) => (
                    <li key={event.id} className="relative">
                      <span
                        aria-hidden
                        className="absolute -left-5 top-[7px] h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-solid)]"
                        style={{ backgroundColor: event.color || 'var(--accent)' }}
                      />
                      <button
                        type="button"
                        onClick={() => onNavigate('calendar')}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                      >
                        <span className="w-[104px] shrink-0 text-[10px] font-semibold tabular-nums text-muted">
                          {event.is_all_day
                            ? 'All day'
                            : `${formatTime(new Date(event.start_time))} – ${formatTime(new Date(event.end_time))}`}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                          {event.title}
                        </span>
                        {event.category === 'timetable' && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[9px] font-semibold text-muted">
                            <Repeat size={8} />
                            Repeats
                          </span>
                        )}
                        {event.location && (
                          <span className="hidden shrink-0 items-center gap-0.5 text-[10px] text-muted sm:flex">
                            <MapPin size={9} />
                            {event.location}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="glass-card overflow-hidden">
              <SectionCardHeader
                icon={CheckCircle2}
                tone="accent"
                title="Upcoming tasks"
                subtitle="Next dated items."
              />
              <div className="pl-card-body pt-3">
                {upcomingTasks.length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-muted">No dated tasks ahead.</p>
                ) : (
                  <ul className="space-y-1">
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
                        <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[9.5px] font-semibold text-muted">
                          {dueLabel(task)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="glass-card overflow-hidden">
              <SectionCardHeader
                icon={CalendarDays}
                tone="warning"
                title="Next events"
                subtitle="Coming up on the calendar."
              />
              <div className="pl-card-body pt-3">
                {upcomingEvents.length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-muted">Nothing scheduled.</p>
                ) : (
                  <ul className="space-y-1">
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
                        <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[9.5px] font-semibold text-muted">
                          {new Date(event.start_time).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>

        <aside className="space-y-4">
          {activePlan && planSummary && (
            <section className="glass-card overflow-hidden">
              <div className="border-b border-[var(--border)] bg-[var(--accent-light)]/60 px-4 py-3">
                <p className="pl-eyebrow text-accent">Active smart plan</p>
                <h2 className="mt-0.5 truncate font-display text-sm font-semibold text-foreground">
                  {activePlan.title}
                </h2>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <ProgressRing value={planSummary.progress} size={56} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-foreground">
                      {planSummary.remaining} blocks left
                    </p>
                    {planSummary.next && (
                      <p className="mt-0.5 truncate text-[10.5px] text-muted">
                        Next: {planSummary.next.task_title}
                        {planSummary.next.scheduled_start
                          ? ` · ${formatTime(new Date(planSummary.next.scheduled_start))}`
                          : ''}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full"
                  icon={Sparkles}
                  onClick={() => onNavigate('plan')}
                >
                  Open plan
                </Button>
              </div>
            </section>
          )}

          <section className="glass-card overflow-hidden">
            <SectionCardHeader
              icon={TrendingUp}
              tone="success"
              title="Week progress"
              subtitle="Tasks due this week that are done."
            />
            <div className="pl-card-body flex flex-col items-center pt-2">
              <ProgressRing value={weekProgress} size={92} />
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
            </div>
          </section>

          <section className="glass-card overflow-hidden">
            <SectionCardHeader icon={ListTodo} tone="muted" title="Priority breakdown" />
            <div className="pl-card-body pt-2">
              <div className="pl-share-bar">
                {priorityBreakdown.map(({ priority, percent }) => (
                  <span
                    key={priority}
                    style={{
                      width: `${percent}%`,
                      backgroundColor: PRIORITY_META[priority].color,
                    }}
                    title={`${PRIORITY_META[priority].label}: ${percent}%`}
                  />
                ))}
              </div>
              <ul className="mt-3 space-y-1.5">
                {priorityBreakdown.map(({ priority, count, percent }) => (
                  <li key={priority} className="flex items-center gap-2 text-[11px]">
                    <span className={`h-2 w-2 rounded-full ${PRIORITY_META[priority].dot}`} />
                    <span className="flex-1 font-medium text-foreground">
                      {PRIORITY_META[priority].label}
                    </span>
                    <span className="tabular-nums text-muted">{count}</span>
                    <span className="w-8 text-right text-[10px] tabular-nums text-muted">
                      {percent}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {projectBreakdown.length > 0 && (
            <section className="glass-card overflow-hidden">
              <SectionCardHeader
                icon={Sparkles}
                tone="accent"
                title="Projects"
                actions={
                  <Button type="button" variant="ghost" size="sm" onClick={() => onNavigate('projects')}>
                    All
                  </Button>
                }
              />
              <div className="pl-card-body pt-2">
                <ul className="space-y-2.5">
                  {projectBreakdown.map(({ project, open, total }) => (
                    <li key={project.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate('projects')}
                        className="block w-full text-left"
                      >
                        <span className="flex items-center justify-between text-[11px]">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            <span className="truncate font-medium text-foreground">{project.name}</span>
                          </span>
                          <span className="shrink-0 text-[10px] text-muted">{open} open</span>
                        </span>
                        <ProgressBar
                          value={total > 0 ? Math.round(((total - open) / total) * 100) : 0}
                          className="mt-1.5"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <section className="glass-card overflow-hidden">
            <SectionCardHeader icon={Sparkles} tone="accent" title="Jump back in" />
            <div className="pl-card-body grid grid-cols-1 gap-1.5 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={Sparkles}
                className="w-full justify-start"
                onClick={() => onNavigate('plan')}
              >
                Smart plan
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={CalendarDays}
                className="w-full justify-start"
                onClick={() => onNavigate('calendar')}
              >
                Open calendar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Repeat}
                className="w-full justify-start"
                onClick={() => onNavigate('timetable')}
              >
                Weekly timetable
              </Button>
            </div>
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
