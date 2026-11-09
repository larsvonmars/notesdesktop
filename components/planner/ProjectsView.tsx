'use client'

import { useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  FolderOpen,
  Layers,
  List,
  ListTodo,
  Pencil,
  Plus,
  Repeat,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ToastProvider'
import type { Project } from '@/lib/projects'
import { createProject } from '@/lib/projects'
import {
  createTaskList,
  deleteTaskList,
  updateTaskList,
  type Task,
  type TaskList,
  type TaskPriority,
} from '@/lib/tasks'
import { isTaskOpen } from '@/lib/task-agenda'
import {
  COLOR_SWATCHES,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIORITY_META,
  ProgressBar,
  STATUS_META,
  SectionCardHeader,
  dueLabel,
} from './PlannerUi'

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function dueTime(task: Task): number {
  return task.due_date ? new Date(task.due_date).getTime() : Number.MAX_SAFE_INTEGER
}

function compareOpenTasks(a: Task, b: Task): number {
  const dueDiff = dueTime(a) - dueTime(b)
  if (dueDiff !== 0) return dueDiff
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}

function compareDoneTasks(a: Task, b: Task): number {
  const aDone = a.completed_at ? new Date(a.completed_at).getTime() : 0
  const bDone = b.completed_at ? new Date(b.completed_at).getTime() : 0
  if (aDone !== bDone) return bDone - aDone
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
}

function isOverdue(task: Task): boolean {
  if (!isTaskOpen(task) || !task.due_date) return false
  return new Date(task.due_date).getTime() < new Date().setHours(0, 0, 0, 0)
}

export interface ProjectsViewProps {
  projects: Project[]
  tasks: Task[]
  taskLists: TaskList[]
  onOpenProject: (projectId: string) => void
  /** Jump to the Tasks section filtered to a single project. */
  onShowTasks: (projectId: string) => void
  onOpenTask: (task: Task) => void
  onEditTask: (task: Task) => void
  onToggleComplete: (task: Task) => void
  onToggleStar: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onQuickAddTask: (projectId: string, title: string) => Promise<void>
  onProjectsChanged: () => void
  onTaskListsChanged: () => void
}

interface ProjectGroup {
  project: Project
  open: Task[]
  done: Task[]
  overdue: number
}

/**
 * Project roll-up for the planner: every project that has tasks assigned to
 * it, with those tasks listed underneath. Projects without tasks are omitted
 * so the section only shows work that is actually being tracked.
 */
export default function ProjectsView({
  projects,
  tasks,
  taskLists,
  onOpenProject,
  onShowTasks,
  onOpenTask,
  onEditTask,
  onToggleComplete,
  onToggleStar,
  onDeleteTask,
  onQuickAddTask,
  onProjectsChanged,
  onTaskListsChanged,
}: ProjectsViewProps) {
  const toast = useToast()

  const [creating, setCreating] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectColor, setProjectColor] = useState(COLOR_SWATCHES[0])
  const [saving, setSaving] = useState(false)

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [showCompleted, setShowCompleted] = useState<Set<string>>(() => new Set())
  const [quickTitles, setQuickTitles] = useState<Record<string, string>>({})
  const [quickBusy, setQuickBusy] = useState<string | null>(null)
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<string | null>(null)

  const [listName, setListName] = useState('')
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [editingListName, setEditingListName] = useState('')
  const [confirmListDelete, setConfirmListDelete] = useState<string | null>(null)
  const [listBusy, setListBusy] = useState(false)

  const groups = useMemo<ProjectGroup[]>(() => {
    const byProject = new Map<string, Task[]>()
    for (const task of tasks) {
      if (!task.project_id || task.is_archived) continue
      const bucket = byProject.get(task.project_id)
      if (bucket) bucket.push(task)
      else byProject.set(task.project_id, [task])
    }

    const result: ProjectGroup[] = []
    for (const project of projects) {
      const projectTasks = byProject.get(project.id)
      if (!projectTasks || projectTasks.length === 0) continue

      const open: Task[] = []
      const done: Task[] = []
      let overdue = 0
      for (const task of projectTasks) {
        if (isTaskOpen(task)) {
          open.push(task)
          if (isOverdue(task)) overdue++
        } else {
          done.push(task)
        }
      }
      open.sort(compareOpenTasks)
      done.sort(compareDoneTasks)
      result.push({ project, open, done, overdue })
    }
    return result
  }, [projects, tasks])

  const totals = useMemo(() => {
    let open = 0
    let done = 0
    let overdue = 0
    for (const group of groups) {
      open += group.open.length
      done += group.done.length
      overdue += group.overdue
    }
    return { open, done, overdue }
  }, [groups])

  const listStats = useMemo(() => {
    const map = new Map<string, number>()
    for (const task of tasks) {
      if (!task.task_list_id || !isTaskOpen(task)) continue
      map.set(task.task_list_id, (map.get(task.task_list_id) ?? 0) + 1)
    }
    return map
  }, [tasks])

  const toggleInSet = (current: Set<string>, id: string) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = projectName.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      await createProject({
        name,
        description: projectDescription.trim() || undefined,
        color: projectColor,
      })
      setProjectName('')
      setProjectDescription('')
      setCreating(false)
      onProjectsChanged()
      toast.push({
        title: 'Project created',
        description: `${name} appears here once a task is assigned to it.`,
        variant: 'success',
      })
    } catch (err) {
      console.error('Creating project failed:', err)
      toast.push({ title: 'Could not create project', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleQuickAdd = async (event: FormEvent<HTMLFormElement>, projectId: string) => {
    event.preventDefault()
    const title = (quickTitles[projectId] ?? '').trim()
    if (!title || quickBusy) return
    setQuickBusy(projectId)
    try {
      await onQuickAddTask(projectId, title)
      setQuickTitles((current) => ({ ...current, [projectId]: '' }))
    } catch {
      // The parent surfaces the failure; keep the typed title for a retry.
    } finally {
      setQuickBusy(null)
    }
  }

  const requestDeleteTask = (task: Task) => {
    if (confirmDeleteTask !== task.id) {
      setConfirmDeleteTask(task.id)
      return
    }
    setConfirmDeleteTask(null)
    onDeleteTask(task)
  }

  const handleCreateList = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = listName.trim()
    if (!name || listBusy) return
    setListBusy(true)
    try {
      await createTaskList(name)
      setListName('')
      onTaskListsChanged()
      toast.push({ title: 'Task list created', description: name, variant: 'success' })
    } catch (err) {
      console.error('Creating task list failed:', err)
      toast.push({ title: 'Could not create list', variant: 'error' })
    } finally {
      setListBusy(false)
    }
  }

  const handleRenameList = async (list: TaskList) => {
    const name = editingListName.trim()
    if (!name || name === list.name) {
      setEditingListId(null)
      return
    }
    setListBusy(true)
    try {
      await updateTaskList(list.id, { name })
      setEditingListId(null)
      onTaskListsChanged()
    } catch (err) {
      console.error('Renaming list failed:', err)
      toast.push({ title: 'Could not rename list', variant: 'error' })
    } finally {
      setListBusy(false)
    }
  }

  const handleDeleteList = async (list: TaskList) => {
    if (confirmListDelete !== list.id) {
      setConfirmListDelete(list.id)
      return
    }
    setListBusy(true)
    try {
      await deleteTaskList(list.id)
      setConfirmListDelete(null)
      onTaskListsChanged()
      toast.push({ title: 'Task list deleted', description: list.name, variant: 'success' })
    } catch (err) {
      console.error('Deleting list failed:', err)
      toast.push({ title: 'Could not delete list', variant: 'error' })
    } finally {
      setListBusy(false)
    }
  }

  const createForm = (
    <form onSubmit={handleCreateProject} className="mt-3 space-y-3 rounded-xl bg-[var(--surface-sunken)] p-3">
      <div>
        <label className={LABEL_CLASS} htmlFor="project-name">
          Name
        </label>
        <input
          id="project-name"
          required
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="e.g. Thesis"
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label className={LABEL_CLASS} htmlFor="project-description">
          Description
        </label>
        <input
          id="project-description"
          value={projectDescription}
          onChange={(event) => setProjectDescription(event.target.value)}
          placeholder="Optional description"
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <span className={LABEL_CLASS}>Colour</span>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setProjectColor(color)}
              aria-label={`Colour ${color}`}
              className={`h-6 w-6 rounded-full border-2 ${
                projectColor === color ? 'border-foreground' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
      <Button type="submit" variant="primary" size="sm" loading={saving}>
        Create project
      </Button>
    </form>
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3">
        <section className="glass-card overflow-hidden">
          <SectionCardHeader
            icon={Layers}
            title="Projects"
            subtitle="Only projects with tasks assigned — expand one to see its tasks."
            actions={
              <>
                <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
                  {groups.length}
                </span>
                <Button
                  type="button"
                  variant={creating ? 'ghost' : 'primary'}
                  size="sm"
                  icon={creating ? X : Plus}
                  onClick={() => setCreating((current) => !current)}
                >
                  {creating ? 'Cancel' : 'New project'}
                </Button>
              </>
            }
          />

          <div className="pl-card-body pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-foreground">
                <ListTodo size={11} className="text-[var(--hue-sky)]" />
                {totals.open} open {totals.open === 1 ? 'task' : 'tasks'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-foreground">
                <Check size={11} className="text-[var(--hue-mint)]" />
                {totals.done} completed
              </span>
              {totals.overdue > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--danger-light)] px-2.5 py-1 text-[11px] font-semibold text-danger">
                  <AlertTriangle size={11} />
                  {totals.overdue} overdue
                </span>
              )}
            </div>

            {creating && createForm}
          </div>
        </section>

        {groups.length === 0 ? (
          <div className="glass-card">
            <EmptyState
              icon={Layers}
              title="No projects with tasks"
              description="Assign a task to a project and the project — with all of its tasks — shows up here."
              action={
                <Button type="button" variant="primary" size="md" icon={Plus} onClick={() => setCreating(true)}>
                  New project
                </Button>
              }
            />
          </div>
        ) : (
          groups.map((group) => {
            const { project, open, done, overdue } = group
            const isCollapsed = collapsed.has(project.id)
            const isShowingDone = showCompleted.has(project.id)
            const total = open.length + done.length
            const progress = total > 0 ? Math.round((done.length / total) * 100) : 0
            const quickTitle = quickTitles[project.id] ?? ''

            return (
              <section key={project.id} className="glass-card overflow-hidden">
                <div className="border-b border-[var(--border)] px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setCollapsed((current) => toggleInSet(current, project.id))}
                      aria-expanded={!isCollapsed}
                      className="focus-ring flex min-w-0 flex-1 items-start gap-2.5 rounded-lg text-left"
                    >
                      <span className="mt-0.5 shrink-0 text-muted">
                        {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                      </span>
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-[13px] font-semibold text-foreground">
                            {project.name}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted">
                            {open.length} open · {done.length} done
                          </span>
                          {overdue > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--danger-light)] px-1.5 py-0.5 text-[9.5px] font-semibold text-danger">
                              <AlertTriangle size={9} />
                              {overdue} overdue
                            </span>
                          )}
                        </span>
                        {project.description && (
                          <span className="mt-0.5 block truncate text-[11px] text-muted">
                            {project.description}
                          </span>
                        )}
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onShowTasks(project.id)}
                      >
                        Tasks
                        <ArrowRight size={11} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={FolderOpen}
                        aria-label={`Open ${project.name}`}
                        onClick={() => onOpenProject(project.id)}
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2 pl-[42px]">
                    <ProgressBar value={progress} className="max-w-[260px]" />
                    <span className="text-[9px] tabular-nums text-muted">{progress}%</span>
                  </div>
                </div>

                {!isCollapsed && (
                  <div>
                    <form
                      onSubmit={(event) => void handleQuickAdd(event, project.id)}
                      className="flex items-center gap-1.5 border-b border-[var(--border)] px-4 py-2"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-light)] text-accent">
                        <Plus size={12} />
                      </span>
                      <input
                        value={quickTitle}
                        onChange={(event) =>
                          setQuickTitles((current) => ({
                            ...current,
                            [project.id]: event.target.value,
                          }))
                        }
                        placeholder={`Add a task to ${project.name}…`}
                        aria-label={`Add a task to ${project.name}`}
                        className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[12px] text-foreground outline-none placeholder:text-muted/70"
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        disabled={!quickTitle.trim() || quickBusy !== null}
                      >
                        Add
                      </Button>
                    </form>

                    {total === 0 ? (
                      <p className="px-4 py-5 text-center text-[11px] text-muted">No tasks yet.</p>
                    ) : (
                      <ul className="divide-y divide-[var(--border)]">
                        {open.map((task) => (
                          <ProjectTaskRow
                            key={task.id}
                            task={task}
                            confirmingDelete={confirmDeleteTask === task.id}
                            onOpen={() => onOpenTask(task)}
                            onEdit={() => onEditTask(task)}
                            onToggleComplete={() => onToggleComplete(task)}
                            onToggleStar={() => onToggleStar(task)}
                            onDelete={() => requestDeleteTask(task)}
                            onCancelDelete={() => setConfirmDeleteTask(null)}
                          />
                        ))}

                        {done.length > 0 && (
                          <li>
                            <button
                              type="button"
                              onClick={() =>
                                setShowCompleted((current) => toggleInSet(current, project.id))
                              }
                              aria-expanded={isShowingDone}
                              className="focus-ring flex w-full items-center gap-1.5 px-4 py-2 text-left text-[11px] font-medium text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
                            >
                              {isShowingDone ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              {isShowingDone ? 'Hide' : 'Show'} {done.length} completed
                            </button>
                          </li>
                        )}

                        {isShowingDone &&
                          done.map((task) => (
                            <ProjectTaskRow
                              key={task.id}
                              task={task}
                              confirmingDelete={confirmDeleteTask === task.id}
                              onOpen={() => onOpenTask(task)}
                              onEdit={() => onEditTask(task)}
                              onToggleComplete={() => onToggleComplete(task)}
                              onToggleStar={() => onToggleStar(task)}
                              onDelete={() => requestDeleteTask(task)}
                              onCancelDelete={() => setConfirmDeleteTask(null)}
                            />
                          ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            )
          })
        )}
      </div>

      <aside className="space-y-4">
        <section className="glass-card p-4">
          <SectionCardHeader
            icon={List}
            title="Task lists"
            subtitle="Lightweight buckets independent of projects."
          />

          <form onSubmit={handleCreateList} className="mt-3 flex items-center gap-1.5">
            <input
              value={listName}
              onChange={(event) => setListName(event.target.value)}
              placeholder="New list name…"
              className="glass-input h-8 flex-1 px-2.5 text-[12px]"
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              icon={Plus}
              disabled={!listName.trim() || listBusy}
              aria-label="Create task list"
            />
          </form>

          <ul className="mt-3 space-y-1">
            {taskLists.map((list) => (
              <li key={list.id} className="group flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-[var(--surface-sunken)]">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: list.color }}
                />
                {editingListId === list.id ? (
                  <input
                    value={editingListName}
                    onChange={(event) => setEditingListName(event.target.value)}
                    onBlur={() => void handleRenameList(list)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void handleRenameList(list)
                      }
                      if (event.key === 'Escape') setEditingListId(null)
                    }}
                    className="glass-input h-6 flex-1 px-1.5 text-[11px]"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                    {list.name}
                  </span>
                )}
                <span className="shrink-0 text-[10px] text-muted">
                  {listStats.get(list.id) ?? 0}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingListId(list.id)
                    setEditingListName(list.name)
                  }}
                  aria-label={`Rename ${list.name}`}
                  className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-muted opacity-0 hover:text-foreground group-hover:opacity-100"
                >
                  <Pencil size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteList(list)}
                  aria-label={
                    confirmListDelete === list.id ? 'Confirm delete list' : `Delete ${list.name}`
                  }
                  className={`focus-ring flex h-6 w-6 items-center justify-center rounded-md ${
                    confirmListDelete === list.id
                      ? 'bg-[var(--danger-light)] text-danger'
                      : 'text-muted opacity-0 hover:text-danger group-hover:opacity-100'
                  }`}
                >
                  {confirmListDelete === list.id ? <Check size={10} /> : <Trash2 size={10} />}
                </button>
              </li>
            ))}
            {taskLists.length === 0 && (
              <li className="py-4 text-center text-[11px] text-muted">No task lists yet.</li>
            )}
          </ul>
        </section>

        <section className="glass-card p-4">
          <h3 className={LABEL_CLASS}>Assignment</h3>
          <p className="text-[10px] leading-4 text-muted">
            Open a task and pick a project or task list to file it. Projects only appear in this
            section once at least one task is assigned to them.
          </p>
        </section>
      </aside>
    </div>
  )
}

function ProjectTaskRow({
  task,
  confirmingDelete,
  onOpen,
  onEdit,
  onToggleComplete,
  onToggleStar,
  onDelete,
  onCancelDelete,
}: {
  task: Task
  confirmingDelete: boolean
  onOpen: () => void
  onEdit: () => void
  onToggleComplete: () => void
  onToggleStar: () => void
  onDelete: () => void
  onCancelDelete: () => void
}) {
  const done = !isTaskOpen(task)
  const overdue = isOverdue(task)
  const labels = task.labels ?? []

  return (
    <li
      className="pl-task-row group/row px-4 py-2.5 pl-5 transition-colors hover:bg-[var(--surface-hover)]"
      style={{
        ['--pl-rail' as string]: done ? 'transparent' : PRIORITY_META[task.priority].color,
      }}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={onToggleComplete}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          className={`focus-ring mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border transition-all ${
            done
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-[var(--border-strong)] text-transparent hover:scale-110 hover:border-accent hover:bg-[var(--accent-light)] hover:text-accent'
          }`}
        >
          {done ? <Check size={11} /> : <Circle size={9} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="focus-ring block min-w-0 flex-1 rounded-md text-left"
            >
              <span
                className={`block text-[12.5px] font-medium leading-snug ${
                  done ? 'text-muted line-through' : 'text-foreground'
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

          {task.description && !done && (
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

            {task.status !== 'todo' && !done && (
              <span
                className={`rounded-full px-1.5 py-0.5 font-semibold ${STATUS_META[task.status].className}`}
              >
                {STATUS_META[task.status].label}
              </span>
            )}

            {task.is_recurring && (
              <span className="inline-flex items-center gap-1 text-muted" title="Recurring task">
                <Repeat size={10} />
              </span>
            )}

            {labels.slice(0, 3).map((label) => (
              <span key={label} className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 text-muted">
                {label}
              </span>
            ))}
            {labels.length > 3 && <span className="text-muted">+{labels.length - 3}</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center opacity-70 transition-opacity group-hover/row:opacity-100">
          <button
            type="button"
            onClick={onToggleStar}
            aria-label={task.is_starred ? `Unstar ${task.title}` : `Star ${task.title}`}
            className={`focus-ring flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-active)] ${
              task.is_starred ? 'text-amber-500 opacity-100' : 'text-muted'
            }`}
          >
            <Star size={12} fill={task.is_starred ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${task.title}`}
            className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-active)] hover:text-foreground"
          >
            <Pencil size={12} />
          </button>
          {confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Confirm deleting ${task.title}`}
                className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--danger-light)] text-danger"
              >
                <Check size={12} />
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                aria-label="Cancel delete"
                className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-active)] hover:text-foreground"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${task.title}`}
              className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-active)] hover:text-danger"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
