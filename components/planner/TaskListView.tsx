'use client'

import { useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  FileText,
  Layers,
  ListTodo,
  Pencil,
  Plus,
  Repeat,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import type { NoteSummary } from '@/lib/notes'
import type { Project } from '@/lib/projects'
import type { RecurrencePattern } from '@/lib/events'
import { isTaskOpen } from '@/lib/task-agenda'
import type { Task, TaskPriority, TaskStatus } from '@/lib/tasks'
import {
  PRIORITY_META,
  ProgressBar,
  STATUS_META,
  STATUS_ORDER,
  dueLabel,
} from './PlannerUi'

const STATUS_FILTERS: (TaskStatus | 'all')[] = ['all', ...STATUS_ORDER]
const PRIORITY_FILTERS: (TaskPriority | 'all')[] = ['all', 'urgent', 'high', 'medium', 'low']

type SortKey = 'due' | 'priority' | 'updated' | 'title' | 'manual'
type GroupKey = 'none' | 'status' | 'priority' | 'project'

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function compareTasks(a: Task, b: Task, sort: SortKey): number {
  switch (sort) {
    case 'priority':
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    case 'updated':
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    case 'title':
      return a.title.localeCompare(b.title)
    case 'manual':
      return a.sort_order - b.sort_order
    case 'due':
    default: {
      const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
      const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
      if (aDue !== bDue) return aDue - bDue
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    }
  }
}

export interface TaskListViewProps {
  tasks: Task[]
  projects: Project[]
  notes: NoteSummary[]
  recurrencePatterns: RecurrencePattern[]
  starredOnly?: boolean
  emptyTitle?: string
  emptyDescription?: string
  onOpenTask: (task: Task) => void
  onEditTask: (task: Task) => void
  onToggleComplete: (task: Task) => void
  onToggleStar: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onQuickAdd: (title: string, defaultDate?: Date) => void
  onNewTask: () => void
}

export default function TaskListView({
  tasks,
  projects,
  notes,
  recurrencePatterns,
  starredOnly = false,
  emptyTitle,
  emptyDescription,
  onOpenTask,
  onEditTask,
  onToggleComplete,
  onToggleStar,
  onDeleteTask,
  onQuickAdd,
  onNewTask,
}: TaskListViewProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all')
  const [onlyStarred, setOnlyStarred] = useState(starredOnly)
  const [sort, setSort] = useState<SortKey>('due')
  const [groupBy, setGroupBy] = useState<GroupKey>('none')
  const [quickTitle, setQuickTitle] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes])
  const patternById = useMemo(
    () => new Map(recurrencePatterns.map((pattern) => [pattern.id, pattern])),
    [recurrencePatterns],
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tasks
      .filter((task) => task.is_archived === false)
      .filter((task) => (onlyStarred ? task.is_starred : true))
      .filter((task) => (statusFilter === 'all' ? true : task.status === statusFilter))
      .filter((task) => (priorityFilter === 'all' ? true : task.priority === priorityFilter))
      .filter((task) => {
        if (!query) return true
        const haystack = [
          task.title,
          task.description ?? '',
          ...(task.labels ?? []),
          task.project_id ? projectById.get(task.project_id)?.name ?? '' : '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(query)
      })
      .sort((a, b) => compareTasks(a, b, sort))
  }, [tasks, onlyStarred, statusFilter, priorityFilter, search, sort, projectById])

  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: '', tasks: filtered }]

    const map = new Map<string, { key: string; label: string; tasks: Task[] }>()
    for (const task of filtered) {
      let key = 'none'
      let label = 'No group'
      if (groupBy === 'status') {
        key = task.status
        label = STATUS_META[task.status].label
      } else if (groupBy === 'priority') {
        key = task.priority
        label = PRIORITY_META[task.priority].label
      } else if (groupBy === 'project') {
        key = task.project_id ?? 'none'
        label = task.project_id
          ? projectById.get(task.project_id)?.name ?? 'Unknown project'
          : 'No project'
      }
      const group = map.get(key) ?? { key, label, tasks: [] }
      group.tasks.push(task)
      map.set(key, group)
    }

    const order: string[] =
      groupBy === 'status'
        ? STATUS_ORDER
        : groupBy === 'priority'
          ? ['urgent', 'high', 'medium', 'low']
          : ['none', ...projects.map((project) => project.id)]

    return Array.from(map.values()).sort(
      (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
    )
  }, [filtered, groupBy, projectById, projects])

  const handleQuickAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = quickTitle.trim()
    if (!title) return
    onQuickAdd(title, statusFilter === 'completed' ? undefined : new Date())
    setQuickTitle('')
  }

  const counts = useMemo(
    () => ({
      all: tasks.filter((task) => !task.is_archived).length,
      open: tasks.filter(isTaskOpen).length,
      overdue: tasks.filter(
        (task) =>
          isTaskOpen(task) &&
          task.due_date &&
          new Date(task.due_date).getTime() < new Date().setHours(0, 0, 0, 0),
      ).length,
      completed: tasks.filter((task) => task.status === 'completed').length,
    }),
    [tasks],
  )

  return (
    <div className="space-y-3">
      <div className="glass-card p-2">
        <form onSubmit={handleQuickAdd} className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg bg-[var(--accent-light)] text-accent">
            <Plus size={13} />
          </span>
          <input
            value={quickTitle}
            onChange={(event) => setQuickTitle(event.target.value)}
            placeholder="Quick add a task and press Enter…"
            className="h-10 w-full rounded-xl border border-transparent bg-transparent pl-11 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted/70 focus:border-[var(--border)] focus:bg-[var(--surface-sunken)]"
          />
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks…"
            className="glass-input h-8 w-full pl-8 pr-2 text-[12px]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as TaskStatus | 'all')}
          aria-label="Filter by status"
          className="glass-input h-8 px-2 text-[12px]"
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {status === 'all' ? `All statuses (${counts.all})` : STATUS_META[status].label}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | 'all')}
          aria-label="Filter by priority"
          className="glass-input h-8 px-2 text-[12px] capitalize"
        >
          {PRIORITY_FILTERS.map((priority) => (
            <option key={priority} value={priority}>
              {priority === 'all' ? 'All priorities' : PRIORITY_META[priority].label}
            </option>
          ))}
        </select>

        <select
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value as GroupKey)}
          aria-label="Group tasks"
          className="glass-input h-8 px-2 text-[12px]"
        >
          <option value="none">No grouping</option>
          <option value="status">Group: status</option>
          <option value="priority">Group: priority</option>
          <option value="project">Group: project</option>
        </select>

        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <ArrowUpDown size={12} />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sort tasks"
            className="glass-input h-8 px-2 text-[12px]"
          >
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
            <option value="updated">Recently updated</option>
            <option value="title">Title</option>
            <option value="manual">Manual order</option>
          </select>
        </label>

        {!starredOnly && (
          <button
            type="button"
            onClick={() => setOnlyStarred((current) => !current)}
            aria-pressed={onlyStarred}
            data-active={onlyStarred}
            className="pl-chip focus-ring"
            style={
              onlyStarred
                ? { background: 'var(--warning-light)', color: 'var(--warning)' }
                : undefined
            }
          >
            <Star size={12} fill={onlyStarred ? 'currentColor' : 'none'} />
            Starred
          </button>
        )}

        <span className="ml-auto text-[11px] tabular-nums text-muted">
          {filtered.length} of {counts.all} tasks
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={ListTodo}
            title={
              emptyTitle ?? (tasks.length === 0 ? 'No tasks yet' : 'No tasks match these filters')
            }
            description={
              emptyDescription ??
              (tasks.length === 0
                ? 'Add your first task to get organised.'
                : 'Try clearing the search or filters.')
            }
            action={
              <Button type="button" variant="primary" size="md" icon={Plus} onClick={onNewTask}>
                New task
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <section key={group.key} className="glass-card overflow-hidden">
              {group.label && (
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-sunken)]/50 px-3.5 py-2.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
                    {group.label}
                  </h3>
                  <span className="rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
                    {group.tasks.length}
                  </span>
                </div>
              )}
              <ul className="divide-y divide-[var(--border)]">
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    project={task.project_id ? projectById.get(task.project_id) : undefined}
                    note={task.note_id ? noteById.get(task.note_id) : undefined}
                    pattern={
                      task.recurrence_pattern_id
                        ? patternById.get(task.recurrence_pattern_id)
                        : undefined
                    }
                    expanded={expandedId === task.id}
                    confirmingDelete={confirmDeleteId === task.id}
                    onToggleExpand={() =>
                      setExpandedId((current) => (current === task.id ? null : task.id))
                    }
                    onOpen={() => onOpenTask(task)}
                    onEdit={() => onEditTask(task)}
                    onToggleComplete={() => onToggleComplete(task)}
                    onToggleStar={() => onToggleStar(task)}
                    onDelete={() => {
                      if (confirmDeleteId !== task.id) {
                        setConfirmDeleteId(task.id)
                        return
                      }
                      onDeleteTask(task)
                      setConfirmDeleteId(null)
                    }}
                    onCancelDelete={() => setConfirmDeleteId(null)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  project,
  note,
  pattern,
  expanded,
  confirmingDelete,
  onToggleExpand,
  onOpen,
  onEdit,
  onToggleComplete,
  onToggleStar,
  onDelete,
  onCancelDelete,
}: {
  task: Task
  project?: Project
  note?: NoteSummary
  pattern?: RecurrencePattern
  expanded: boolean
  confirmingDelete: boolean
  onToggleExpand: () => void
  onOpen: () => void
  onEdit: () => void
  onToggleComplete: () => void
  onToggleStar: () => void
  onDelete: () => void
  onCancelDelete: () => void
}) {
  const completed = task.status === 'completed' || task.status === 'cancelled'
  const overdue =
    isTaskOpen(task) && task.due_date && new Date(task.due_date).getTime() < new Date().setHours(0, 0, 0, 0)
  const labels = task.labels ?? []
  const progress = task.progress ?? 0

  return (
    <li
      className="pl-task-row group/row px-3.5 py-2.5 pl-4 transition-colors hover:bg-[var(--surface-hover)]"
      style={{ ['--pl-rail' as string]: completed ? 'transparent' : PRIORITY_META[task.priority].color }}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={onToggleComplete}
          aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
          className={`focus-ring mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border transition-all ${
            completed
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-[var(--border-strong)] text-transparent hover:scale-110 hover:border-accent hover:bg-[var(--accent-light)] hover:text-accent'
          }`}
        >
          {completed ? <Check size={11} /> : <Circle size={9} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="focus-ring block min-w-0 flex-1 rounded-md text-left"
            >
              <span
                className={`block text-[13px] font-medium leading-snug ${
                  completed ? 'text-muted line-through' : 'text-foreground'
                }`}
              >
                {task.title}
              </span>
            </button>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${PRIORITY_META[task.priority].soft}`}
            >
              {PRIORITY_META[task.priority].label}
            </span>
          </div>

          {task.description && !expanded && (
            <p className="mt-0.5 truncate text-[11px] text-muted">{task.description}</p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
            {task.due_date ? (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${
                  overdue
                    ? 'bg-[var(--danger-light)] text-danger'
                    : 'bg-[var(--surface-sunken)] text-muted'
                }`}
              >
                {overdue ? <AlertTriangle size={10} /> : <CalendarDays size={10} />}
                {dueLabel(task)}
              </span>
            ) : (
              <span className="text-muted">No due date</span>
            )}

            {task.estimated_minutes ? (
              <span className="inline-flex items-center gap-1 text-muted">
                <Clock3 size={10} />
                {task.estimated_minutes}m
              </span>
            ) : null}

            {task.status !== 'todo' && !completed && (
              <span className={`rounded-full px-1.5 py-0.5 font-semibold ${STATUS_META[task.status].className}`}>
                {STATUS_META[task.status].label}
              </span>
            )}

            {task.is_recurring && (
              <span className="inline-flex items-center gap-1 text-muted" title={pattern ? 'Recurring task' : 'Recurring'}>
                <Repeat size={10} />
              </span>
            )}

            {project && (
              <span className="inline-flex max-w-[140px] items-center gap-1 text-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                <Layers size={10} />
                <span className="truncate">{project.name}</span>
              </span>
            )}

            {note && (
              <span className="inline-flex max-w-[150px] items-center gap-1 text-muted">
                <FileText size={10} />
                <span className="truncate">{note.title || 'Untitled'}</span>
              </span>
            )}

            {labels.slice(0, 3).map((label) => (
              <span key={label} className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 text-muted">
                {label}
              </span>
            ))}
            {labels.length > 3 && <span className="text-muted">+{labels.length - 3}</span>}
          </div>

          {progress > 0 && progress < 100 && (
            <div className="mt-1.5 flex items-center gap-2">
              <ProgressBar value={progress} className="max-w-[160px]" />
              <span className="text-[9px] tabular-nums text-muted">{progress}%</span>
            </div>
          )}

          {expanded && (
            <div className="mt-2 space-y-2 rounded-xl bg-[var(--surface-sunken)] p-2.5">
              {task.description && (
                <p className="whitespace-pre-wrap text-[11px] leading-5 text-foreground/90">
                  {task.description}
                </p>
              )}
              <div className="flex flex-wrap gap-2 text-[10px] text-muted">
                <span>Created {new Date(task.created_at).toLocaleDateString()}</span>
                <span>Updated {new Date(task.updated_at).toLocaleDateString()}</span>
                {task.actual_minutes ? <span>{task.actual_minutes}m actual</span> : null}
                {task.task_list_id ? <span>List linked</span> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>
                  Edit
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
                  Open details
                </Button>
                <Button
                  type="button"
                  variant={confirmingDelete ? 'danger' : 'ghost'}
                  size="sm"
                  icon={Trash2}
                  onClick={onDelete}
                >
                  {confirmingDelete ? 'Confirm delete' : 'Delete'}
                </Button>
                {confirmingDelete && (
                  <Button type="button" variant="ghost" size="sm" onClick={onCancelDelete}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover/row:opacity-100">
          <button
            type="button"
            onClick={onToggleStar}
            aria-label={task.is_starred ? `Unstar ${task.title}` : `Star ${task.title}`}
            className={`focus-ring flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-active)] ${
              task.is_starred ? 'text-amber-500 opacity-100' : 'text-muted'
            }`}
          >
            <Star size={13} fill={task.is_starred ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${task.title}`}
            className="focus-ring hidden h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-active)] hover:text-foreground sm:flex"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse task' : 'Expand task'}
            className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-active)] hover:text-foreground"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>
      </div>
    </li>
  )
}
