'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useToast } from '@/components/ToastProvider'
import BaseModal, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/BaseModal'
import { Button } from '@/components/ui/Button'
import type { NoteSummary } from '@/lib/notes'
import type { Project } from '@/lib/projects'
import {
  createTask,
  deleteTask,
  setTaskRecurrence,
  updateTask,
  type Task,
  type TaskList,
  type TaskPriority,
  type TaskStatus,
  type TaskRecurrenceInput,
} from '@/lib/tasks'
import type { RecurrencePattern } from '@/lib/events'
import {
  dateAndTimeToLocalDate,
  dateInputToLocalDate,
  toDateInputValue,
  toTimeInputValue,
} from '@/lib/task-agenda'
import {
  COLOR_SWATCHES,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIORITY_META,
  SELECT_CLASS,
  STATUS_META,
  STATUS_ORDER,
  TEXTAREA_CLASS,
  ToggleSwitch,
} from './PlannerUi'

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
] as const

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface FormState {
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  dueDate: string
  dueTime: string
  startDate: string
  estimatedMinutes: string
  actualMinutes: string
  progress: string
  labels: string
  projectId: string
  taskListId: string
  noteId: string
  isStarred: boolean
  color: string
  isRecurring: boolean
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: string
  daysOfWeek: number[]
  recEndDate: string
}

function emptyState(defaultDueDate?: string | null): FormState {
  return {
    title: '',
    description: '',
    priority: 'medium',
    status: 'todo',
    dueDate: defaultDueDate ?? '',
    dueTime: '',
    startDate: '',
    estimatedMinutes: '',
    actualMinutes: '',
    progress: '0',
    labels: '',
    projectId: '',
    taskListId: '',
    noteId: '',
    isStarred: false,
    color: '',
    isRecurring: false,
    frequency: 'weekly',
    interval: '1',
    daysOfWeek: [],
    recEndDate: '',
  }
}

function stateFromTask(task: Task, pattern: RecurrencePattern | null): FormState {
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    status: task.status,
    dueDate: toDateInputValue(task.due_date),
    dueTime: task.due_date ? toTimeInputValue(task.due_date) : '',
    startDate: toDateInputValue(task.start_date),
    estimatedMinutes: task.estimated_minutes?.toString() ?? '',
    actualMinutes: task.actual_minutes?.toString() ?? '',
    progress: (task.progress ?? 0).toString(),
    labels: (task.labels ?? []).join(', '),
    projectId: task.project_id ?? '',
    taskListId: task.task_list_id ?? '',
    noteId: task.note_id ?? '',
    isStarred: task.is_starred,
    color: task.color ?? '',
    isRecurring: task.is_recurring,
    frequency:
      pattern && pattern.frequency !== 'custom'
        ? (pattern.frequency as FormState['frequency'])
        : 'weekly',
    interval: pattern?.interval?.toString() ?? '1',
    daysOfWeek: pattern?.days_of_week ?? [],
    recEndDate: pattern?.end_date?.slice(0, 10) ?? '',
  }
}

export interface TaskFormModalProps {
  isOpen: boolean
  task?: Task | null
  defaultDueDate?: string | null
  projects: Project[]
  notes: NoteSummary[]
  taskLists: TaskList[]
  recurrencePatterns: RecurrencePattern[]
  onSaved: (task: Task, isNew: boolean) => void
  onDeleted: (taskId: string) => void
  onClose: () => void
}

export default function TaskFormModal({
  isOpen,
  task,
  defaultDueDate,
  projects,
  notes,
  taskLists,
  recurrencePatterns,
  onSaved,
  onDeleted,
  onClose,
}: TaskFormModalProps) {
  const toast = useToast()
  const editing = Boolean(task)

  const existingPattern = useMemo(() => {
    if (!task?.recurrence_pattern_id) return null
    return recurrencePatterns.find((pattern) => pattern.id === task.recurrence_pattern_id) ?? null
  }, [task?.recurrence_pattern_id, recurrencePatterns])

  const [form, setForm] = useState<FormState>(() =>
    task ? stateFromTask(task, existingPattern) : emptyState(defaultDueDate),
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setForm(task ? stateFromTask(task, existingPattern) : emptyState(defaultDueDate))
    setSaving(false)
    setDeleting(false)
    setConfirmingDelete(false)
    setError(null)
  }, [isOpen, task, existingPattern, defaultDueDate])

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const recurrenceKey = (state: {
    isRecurring: boolean
    frequency: string
    interval: string
    daysOfWeek: number[]
    recEndDate: string
  }) =>
    [
      state.isRecurring ? '1' : '0',
      state.frequency,
      state.interval,
      [...state.daysOfWeek].sort().join(','),
      state.recEndDate,
    ].join('|')

  const initialRecurrenceKey = useMemo(
    () =>
      recurrenceKey({
        isRecurring: task?.is_recurring ?? false,
        frequency:
          existingPattern && existingPattern.frequency !== 'custom'
            ? existingPattern.frequency
            : 'weekly',
        interval: existingPattern?.interval?.toString() ?? '1',
        daysOfWeek: existingPattern?.days_of_week ?? [],
        recEndDate: existingPattern?.end_date?.slice(0, 10) ?? '',
      }),
    [task?.is_recurring, existingPattern],
  )

  const noteOptions = useMemo(() => {
    const sorted = [...notes]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 200)
    const current = form.noteId ? notes.find((note) => note.id === form.noteId) : undefined
    if (!current) return sorted
    return [current, ...sorted.filter((note) => note.id !== current.id)]
  }, [notes, form.noteId])

  const buildRecurrence = (): TaskRecurrenceInput | null => {
    if (!form.isRecurring) return null
    return {
      frequency: form.frequency,
      interval: Number.parseInt(form.interval, 10) || 1,
      daysOfWeek:
        form.frequency === 'weekly' && form.daysOfWeek.length > 0 ? form.daysOfWeek : null,
      endDate: form.recEndDate ? new Date(`${form.recEndDate}T23:59:59`) : null,
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = form.title.trim()
    if (!title || saving) return

    setSaving(true)
    setError(null)

    const dueDate = form.dueDate
      ? form.dueTime
        ? dateAndTimeToLocalDate(form.dueDate, form.dueTime)
        : dateInputToLocalDate(form.dueDate)
      : null
    const startDate = form.startDate ? dateInputToLocalDate(form.startDate, 9) : null
    const labels = form.labels
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean)
    const estimatedMinutes = form.estimatedMinutes
      ? Number.parseInt(form.estimatedMinutes, 10)
      : null
    const actualMinutes = form.actualMinutes ? Number.parseInt(form.actualMinutes, 10) : null
    const progress = Math.max(0, Math.min(100, Number.parseInt(form.progress, 10) || 0))

    try {
      if (task) {
        const statusChangedToComplete =
          form.status === 'completed' && task.status !== 'completed'
        const statusChangedFromComplete =
          form.status !== 'completed' && task.status === 'completed'

        const updated = await updateTask(task.id, {
          title,
          description: form.description.trim() || null,
          priority: form.priority,
          status: form.status,
          due_date: dueDate?.toISOString() ?? null,
          start_date: startDate?.toISOString() ?? null,
          estimated_minutes: estimatedMinutes,
          actual_minutes: actualMinutes,
          progress,
          labels,
          project_id: form.projectId || null,
          task_list_id: form.taskListId || null,
          note_id: form.noteId || null,
          is_starred: form.isStarred,
          color: form.color || undefined,
          completed_at: statusChangedToComplete
            ? (task.completed_at ?? new Date().toISOString())
            : statusChangedFromComplete
              ? null
              : task.completed_at,
        })

        const recurrenceChanged = recurrenceKey(form) !== initialRecurrenceKey

        let finalTask = updated
        if (recurrenceChanged) {
          finalTask = await setTaskRecurrence(
            task.id,
            buildRecurrence(),
            task.recurrence_pattern_id,
          )
        }

        onSaved(finalTask, false)
        toast.push({ title: 'Task updated', description: finalTask.title, variant: 'success' })
        onClose()
      } else {
        const created = await createTask(title, {
          description: form.description.trim() || undefined,
          priority: form.priority,
          status: form.status,
          dueDate: dueDate ?? undefined,
          startDate: startDate ?? undefined,
          estimatedMinutes: estimatedMinutes ?? undefined,
          progress,
          labels,
          projectId: form.projectId || undefined,
          taskListId: form.taskListId || undefined,
          noteId: form.noteId || undefined,
          isStarred: form.isStarred,
          color: form.color || undefined,
          recurrence: buildRecurrence(),
        })
        onSaved(created, true)
        toast.push({ title: 'Task created', description: created.title, variant: 'success' })
        onClose()
      }
    } catch (err) {
      console.error('Saving task failed:', err)
      setError(err instanceof Error ? err.message : 'Could not save the task.')
      toast.push({ title: 'Could not save task', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!task) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    setDeleting(true)
    try {
      await deleteTask(task.id)
      onDeleted(task.id)
      toast.push({ title: 'Task deleted', description: task.title, variant: 'success' })
      onClose()
    } catch (err) {
      console.error('Deleting task failed:', err)
      setError(err instanceof Error ? err.message : 'Could not delete the task.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      maxHeight="88vh"
      closeOnBackdropClick={!saving && !deleting}
      closeOnEscape={!saving && !deleting}
    >
      <ModalHeader onClose={onClose}>
        <div className="min-w-0">
          <ModalTitle>{editing ? 'Edit task' : 'New task'}</ModalTitle>
          <p className="mt-0.5 text-[11px] text-muted">
            {editing ? 'Update details, link notes or repeat it' : 'Capture it, then plan it'}
          </p>
        </div>
      </ModalHeader>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLASS} htmlFor="task-title">
                Title
              </label>
              <input
                id="task-title"
                required
                value={form.title}
                onChange={(event) => patch('title', event.target.value)}
                placeholder="What needs to be done?"
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="task-description">
                Description
              </label>
              <textarea
                id="task-description"
                value={form.description}
                onChange={(event) => patch('description', event.target.value)}
                placeholder="Add details, context or acceptance criteria…"
                className={TEXTAREA_CLASS}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS} htmlFor="task-priority">
                  Priority
                </label>
                <select
                  id="task-priority"
                  value={form.priority}
                  onChange={(event) => patch('priority', event.target.value as TaskPriority)}
                  className={SELECT_CLASS}
                >
                  {(Object.keys(PRIORITY_META) as TaskPriority[]).map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_META[priority].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="task-status">
                  Status
                </label>
                <select
                  id="task-status"
                  value={form.status}
                  onChange={(event) => patch('status', event.target.value as TaskStatus)}
                  className={SELECT_CLASS}
                >
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={LABEL_CLASS} htmlFor="task-due">
                  Due date
                </label>
                <input
                  id="task-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => patch('dueDate', event.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="task-due-time">
                  Due time
                </label>
                <input
                  id="task-due-time"
                  type="time"
                  value={form.dueTime}
                  onChange={(event) => patch('dueTime', event.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="task-start">
                  Start date
                </label>
                <input
                  id="task-start"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => patch('startDate', event.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={LABEL_CLASS} htmlFor="task-estimate">
                  Estimate (min)
                </label>
                <input
                  id="task-estimate"
                  type="number"
                  min={0}
                  value={form.estimatedMinutes}
                  onChange={(event) => patch('estimatedMinutes', event.target.value)}
                  placeholder="30"
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="task-actual">
                  Actual (min)
                </label>
                <input
                  id="task-actual"
                  type="number"
                  min={0}
                  value={form.actualMinutes}
                  onChange={(event) => patch('actualMinutes', event.target.value)}
                  placeholder="—"
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="task-progress">
                  Progress ({form.progress}%)
                </label>
                <input
                  id="task-progress"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.progress}
                  onChange={(event) => patch('progress', event.target.value)}
                  className="mt-2 w-full accent-[var(--accent)]"
                />
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="task-labels">
                Labels
              </label>
              <input
                id="task-labels"
                value={form.labels}
                onChange={(event) => patch('labels', event.target.value)}
                placeholder="Comma separated, e.g. deep-work, uni"
                className={FIELD_CLASS}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={LABEL_CLASS} htmlFor="task-project">
                  Project
                </label>
                <select
                  id="task-project"
                  value={form.projectId}
                  onChange={(event) => patch('projectId', event.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="task-list">
                  Task list
                </label>
                <select
                  id="task-list"
                  value={form.taskListId}
                  onChange={(event) => patch('taskListId', event.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">No list</option>
                  {taskLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="task-note">
                  Linked note
                </label>
                <select
                  id="task-note"
                  value={form.noteId}
                  onChange={(event) => patch('noteId', event.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">No note</option>
                  {noteOptions.map((note) => (
                    <option key={note.id} value={note.id}>
                      {note.title || 'Untitled'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-sunken)] p-4 sm:grid-cols-2">
              <ToggleSwitch
                label="Starred"
                description="Pin to the top of starred views"
                checked={form.isStarred}
                onChange={(checked) => patch('isStarred', checked)}
              />
              <div>
                <span className={LABEL_CLASS}>Colour</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => patch('color', '')}
                    className={`h-6 w-6 rounded-full border text-[9px] font-semibold ${
                      form.color === ''
                        ? 'border-accent text-accent'
                        : 'border-[var(--border-strong)] text-muted'
                    }`}
                    title="No colour"
                  >
                    —
                  </button>
                  {COLOR_SWATCHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => patch('color', color)}
                      aria-label={`Colour ${color}`}
                      className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                        form.color === color ? 'border-foreground' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
              <ToggleSwitch
                label="Recurring task"
                description="Completing it advances the due date to the next occurrence"
                checked={form.isRecurring}
                onChange={(checked) => patch('isRecurring', checked)}
              />

              {form.isRecurring && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL_CLASS} htmlFor="task-recurrence">
                        Repeats
                      </label>
                      <select
                        id="task-recurrence"
                        value={form.frequency}
                        onChange={(event) =>
                          patch('frequency', event.target.value as FormState['frequency'])
                        }
                        className={SELECT_CLASS}
                      >
                        {FREQUENCIES.map((frequency) => (
                          <option key={frequency.value} value={frequency.value}>
                            {frequency.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="task-interval">
                        Every
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="task-interval"
                          type="number"
                          min={1}
                          max={365}
                          value={form.interval}
                          onChange={(event) => patch('interval', event.target.value)}
                          className={`${FIELD_CLASS} w-20`}
                        />
                        <span className="text-xs text-muted">
                          {form.frequency === 'daily' && 'day(s)'}
                          {form.frequency === 'weekly' && 'week(s)'}
                          {form.frequency === 'monthly' && 'month(s)'}
                          {form.frequency === 'yearly' && 'year(s)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {form.frequency === 'weekly' && (
                    <div>
                      <span className={LABEL_CLASS}>On days</span>
                      <div className="flex flex-wrap gap-1.5">
                        {DAY_LABELS.map((label, index) => {
                          const active = form.daysOfWeek.includes(index)
                          return (
                            <button
                              key={label}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                patch(
                                  'daysOfWeek',
                                  active
                                    ? form.daysOfWeek.filter((day) => day !== index)
                                    : [...form.daysOfWeek, index].sort(),
                                )
                              }
                              className={`h-8 w-9 rounded-lg text-[11px] font-semibold transition-colors ${
                                active
                                  ? 'bg-accent text-accent-foreground'
                                  : 'bg-[var(--surface-hover)] text-muted hover:text-foreground'
                              }`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={LABEL_CLASS} htmlFor="task-recurrence-end">
                      Ends on (optional)
                    </label>
                    <input
                      id="task-recurrence-end"
                      type="date"
                      value={form.recEndDate}
                      onChange={(event) => patch('recEndDate', event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-xl border border-danger bg-[var(--danger-light)] px-3 py-2 text-xs text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <div className="flex items-center justify-between gap-3">
            {editing ? (
              <Button
                type="button"
                variant={confirmingDelete ? 'danger' : 'ghost'}
                size="sm"
                onClick={handleDelete}
                loading={deleting}
              >
                {confirmingDelete ? 'Confirm delete' : 'Delete'}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {confirmingDelete && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
              )}
              <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={saving}>
                Close
              </Button>
              <Button type="submit" variant="primary" size="md" loading={saving}>
                {editing ? 'Save task' : 'Create task'}
              </Button>
            </div>
          </div>
        </ModalFooter>
      </form>
    </BaseModal>
  )
}
