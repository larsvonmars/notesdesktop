'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarDays,
  Check,
  Circle,
  Clock3,
  FileText,
  Layers,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { NoteSummary } from '@/lib/notes'
import type { Project } from '@/lib/projects'
import type { RecurrencePattern } from '@/lib/events'
import {
  createSubtask,
  deleteSubtask,
  getSubtasks,
  toggleSubtask,
  updateTask,
  type Subtask,
  type Task,
} from '@/lib/tasks'
import {
  getActiveTimeEntry,
  getTimeEntries,
  startTimeTracking,
  stopTimeTracking,
  type TimeEntry,
} from '@/lib/events'
import { describeRecurrence } from '@/lib/planner/date-utils'
import {
  PRIORITY_META,
  ProgressBar,
  STATUS_META,
  dueLabel,
} from './PlannerUi'

export interface TaskDetailPanelProps {
  task: Task
  projects: Project[]
  notes: NoteSummary[]
  recurrencePattern?: RecurrencePattern | null
  onClose: () => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onToggleComplete: (task: Task) => void
  onToggleStar: (task: Task) => void
  onTaskUpdated: (task: Task) => void
  onOpenNote?: (note: NoteSummary) => void
}

function formatElapsed(entry: TimeEntry, now: number): string {
  const start = new Date(entry.started_at).getTime()
  const seconds = Math.max(0, Math.floor((now - start) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`
}

export default function TaskDetailPanel({
  task,
  projects,
  notes,
  recurrencePattern,
  onClose,
  onEdit,
  onDelete,
  onToggleComplete,
  onToggleStar,
  onTaskUpdated,
  onOpenNote,
}: TaskDetailPanelProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null)
  const [newSubtask, setNewSubtask] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const project = useMemo(
    () => (task.project_id ? projects.find((candidate) => candidate.id === task.project_id) : undefined),
    [projects, task.project_id],
  )
  const note = useMemo(
    () => (task.note_id ? notes.find((candidate) => candidate.id === task.note_id) : undefined),
    [notes, task.note_id],
  )

  const loadDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [subtaskResult, entriesResult, activeResult] = await Promise.allSettled([
        getSubtasks(task.id),
        getTimeEntries({ taskId: task.id }),
        getActiveTimeEntry(),
      ])
      if (subtaskResult.status === 'fulfilled') setSubtasks(subtaskResult.value)
      if (entriesResult.status === 'fulfilled') setTimeEntries(entriesResult.value)
      if (activeResult.status === 'fulfilled') {
        setActiveEntry(
          activeResult.value && activeResult.value.task_id === task.id ? activeResult.value : null,
        )
      }
    } catch (err) {
      console.error('Loading task detail failed:', err)
      setError('Could not load subtasks or time entries.')
    } finally {
      setLoading(false)
    }
  }, [task.id])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    if (!activeEntry) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [activeEntry])

  const completedSubtasks = subtasks.filter((subtask) => subtask.is_completed).length
  const subtaskProgress =
    subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0
  const trackedMinutes =
    timeEntries.reduce((sum, entry) => sum + (entry.duration_minutes ?? 0), 0) +
    (activeEntry
      ? Math.max(0, Math.round((now - new Date(activeEntry.started_at).getTime()) / 60_000))
      : 0)

  const patchTask = async (updates: Partial<Task>) => {
    setBusy(true)
    try {
      const updated = await updateTask(task.id, updates)
      onTaskUpdated(updated)
    } catch (err) {
      console.error('Updating task failed:', err)
      setError('Could not update the task.')
    } finally {
      setBusy(false)
    }
  }

  const handleAddSubtask = async () => {
    const title = newSubtask.trim()
    if (!title) return
    setBusy(true)
    try {
      const created = await createSubtask(task.id, title)
      setSubtasks((current) => [...current, created])
      setNewSubtask('')
    } catch (err) {
      console.error('Adding subtask failed:', err)
      setError('Could not add the subtask.')
    } finally {
      setBusy(false)
    }
  }

  const handleToggleSubtask = async (subtask: Subtask) => {
    const next = !subtask.is_completed
    setSubtasks((current) =>
      current.map((candidate) =>
        candidate.id === subtask.id ? { ...candidate, is_completed: next } : candidate,
      ),
    )
    try {
      await toggleSubtask(subtask.id, next)
    } catch (err) {
      console.error('Toggling subtask failed:', err)
      setSubtasks((current) =>
        current.map((candidate) =>
          candidate.id === subtask.id ? { ...candidate, is_completed: !next } : candidate,
        ),
      )
    }
  }

  const handleDeleteSubtask = async (subtask: Subtask) => {
    setSubtasks((current) => current.filter((candidate) => candidate.id !== subtask.id))
    try {
      await deleteSubtask(subtask.id)
    } catch (err) {
      console.error('Deleting subtask failed:', err)
      void loadDetail()
    }
  }

  const handleToggleTimer = async () => {
    setBusy(true)
    setError(null)
    try {
      if (activeEntry) {
        const stopped = await stopTimeTracking(activeEntry.id)
        setActiveEntry(null)
        setTimeEntries((current) => [stopped, ...current])
        const totalActual =
          timeEntries.reduce((sum, entry) => sum + (entry.duration_minutes ?? 0), 0) +
          (stopped.duration_minutes ?? 0)
        const updated = await updateTask(task.id, { actual_minutes: totalActual })
        onTaskUpdated(updated)
      } else {
        const started = await startTimeTracking(task.id)
        setActiveEntry(started)
      }
    } catch (err) {
      console.error('Time tracking failed:', err)
      setError('Time tracking is unavailable right now.')
    } finally {
      setBusy(false)
    }
  }

  const handleProgress = async (value: number) => {
    await patchTask({ progress: value })
  }

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-start justify-end">
      <button
        type="button"
        aria-label="Close task detail"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
        className="glass-strong animate-rise-in relative z-10 m-3 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl sm:m-4"
      >
        <div
          className="relative px-5 pb-4 pt-5"
          style={{ backgroundColor: `${task.color ?? PRIORITY_META[task.priority].color}12` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${STATUS_META[task.status].className}`}>
                  {STATUS_META[task.status].label}
                </span>
                <span className={`text-[10px] font-semibold ${PRIORITY_META[task.priority].className}`}>
                  {PRIORITY_META[task.priority].label} priority
                </span>
                {task.is_recurring && (
                  <span className="flex items-center gap-1 text-[10px] text-muted">
                    <Repeat size={10} />
                    Recurring
                  </span>
                )}
              </div>
              <h3 className="font-display text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground">
                {task.title}
              </h3>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleStar(task)}
                aria-label={task.is_starred ? 'Unstar task' : 'Star task'}
                className={`focus-ring flex h-8 w-8 items-center justify-center rounded-xl ${
                  task.is_starred ? 'text-amber-500' : 'text-muted hover:text-foreground'
                }`}
              >
                <Star size={15} fill={task.is_starred ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close task detail"
                className="focus-ring flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 scroll-thin">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={task.status === 'completed' ? 'secondary' : 'primary'}
              size="sm"
              icon={Check}
              onClick={() => onToggleComplete(task)}
            >
              {task.status === 'completed' ? 'Reopen' : 'Complete'}
            </Button>
            <Button type="button" variant="secondary" size="sm" icon={Pencil} onClick={() => onEdit(task)}>
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={activeEntry ? Pause : Play}
              loading={busy}
              onClick={handleToggleTimer}
            >
              {activeEntry ? `Stop ${formatElapsed(activeEntry, now)}` : 'Start focus'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={Trash2}
              onClick={() => {
                if (!confirmingDelete) {
                  setConfirmingDelete(true)
                  return
                }
                onDelete(task)
              }}
            >
              {confirmingDelete ? 'Confirm' : 'Delete'}
            </Button>
          </div>

          {error && (
            <p className="rounded-xl border border-danger bg-[var(--danger-light)] px-3 py-2 text-[11px] text-danger">
              {error}
            </p>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span className="font-semibold uppercase tracking-[0.08em]">Progress</span>
              <span className="tabular-nums">{task.progress ?? 0}%</span>
            </div>
            <ProgressBar value={task.progress ?? 0} />
            <div className="flex flex-wrap gap-1.5">
              {[0, 25, 50, 75, 100].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => void handleProgress(value)}
                  disabled={busy}
                  className={`rounded-lg border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    (task.progress ?? 0) === value
                      ? 'border-accent bg-[var(--accent-light)] text-accent'
                      : 'border-[var(--border)] text-muted hover:text-foreground'
                  }`}
                >
                  {value}%
                </button>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl bg-[var(--surface-sunken)] p-2.5">
              <span className="flex items-center gap-1 text-muted">
                <CalendarDays size={11} /> Due
              </span>
              <p className="mt-0.5 font-medium text-foreground">
                {task.due_date
                  ? new Date(task.due_date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'No date'}
                <span className="ml-1 text-[10px] text-muted">({dueLabel(task)})</span>
              </p>
            </div>
            <div className="rounded-xl bg-[var(--surface-sunken)] p-2.5">
              <span className="flex items-center gap-1 text-muted">
                <Clock3 size={11} /> Time
              </span>
              <p className="mt-0.5 font-medium text-foreground">
                {task.estimated_minutes ? `${task.estimated_minutes}m est.` : 'No estimate'}
                {trackedMinutes > 0 && (
                  <span className="ml-1 text-[10px] text-muted">· {trackedMinutes}m tracked</span>
                )}
                {!trackedMinutes && task.actual_minutes ? (
                  <span className="ml-1 text-[10px] text-muted">· {task.actual_minutes}m actual</span>
                ) : null}
              </p>
            </div>
          </section>

          {recurrencePattern && (
            <section className="flex items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-[11px] text-muted">
              <Repeat size={12} />
              {describeRecurrence(recurrencePattern)}
            </section>
          )}

          {(project || note) && (
            <section className="flex flex-wrap items-center gap-2">
              {project && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
                  <Layers size={10} className="text-muted" />
                  {project.name}
                </span>
              )}
              {note && onOpenNote && (
                <button
                  type="button"
                  onClick={() => onOpenNote(note)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-foreground hover:border-accent hover:text-accent"
                >
                  <FileText size={10} />
                  {note.title || 'Untitled'}
                </button>
              )}
            </section>
          )}

          {(task.labels ?? []).length > 0 && (
            <section className="flex flex-wrap gap-1">
              {(task.labels ?? []).map((label) => (
                <span
                  key={label}
                  className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] font-medium text-muted"
                >
                  {label}
                </span>
              ))}
            </section>
          )}

          {task.description && (
            <section>
              <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Notes
              </h4>
              <p className="whitespace-pre-wrap text-[13px] leading-6 text-foreground/90">
                {task.description}
              </p>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Subtasks {subtasks.length > 0 && `· ${completedSubtasks}/${subtasks.length}`}
              </h4>
              {subtasks.length > 0 && (
                <span className="text-[10px] tabular-nums text-muted">{subtaskProgress}%</span>
              )}
            </div>
            {subtasks.length > 0 && <ProgressBar value={subtaskProgress} className="mb-2" />}

            {loading ? (
              <p className="text-[11px] text-muted">Loading subtasks…</p>
            ) : (
              <ul className="space-y-1">
                {subtasks.map((subtask) => (
                  <li
                    key={subtask.id}
                    className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-[var(--surface-sunken)]"
                  >
                    <button
                      type="button"
                      onClick={() => void handleToggleSubtask(subtask)}
                      aria-label={subtask.is_completed ? 'Mark incomplete' : 'Mark complete'}
                      className={`focus-ring flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        subtask.is_completed
                          ? 'border-accent bg-accent text-accent-foreground'
                          : 'border-[var(--border-strong)] text-transparent hover:border-accent'
                      }`}
                    >
                      {subtask.is_completed ? <Check size={9} /> : <Circle size={7} />}
                    </button>
                    <span
                      className={`min-w-0 flex-1 truncate text-[12px] ${
                        subtask.is_completed ? 'text-muted line-through' : 'text-foreground'
                      }`}
                    >
                      {subtask.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteSubtask(subtask)}
                      aria-label="Delete subtask"
                      className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-2 flex items-center gap-1.5">
              <input
                value={newSubtask}
                onChange={(event) => setNewSubtask(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleAddSubtask()
                  }
                }}
                placeholder="Add a subtask…"
                className="glass-input h-8 flex-1 px-2.5 text-[12px]"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={() => void handleAddSubtask()}
                disabled={!newSubtask.trim() || busy}
                aria-label="Add subtask"
              />
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-2.5">
          <span className="text-[10px] text-muted">
            Updated{' '}
            {new Date(task.updated_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
