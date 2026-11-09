'use client'

import { useMemo, useState, type FormEvent } from 'react'
import {
  Archive,
  ArrowRight,
  Check,
  Layers,
  List,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ToastProvider'
import type { Project } from '@/lib/projects'
import { createProject } from '@/lib/projects'
import {
  createTaskList,
  deleteTaskList,
  updateTaskList,
  type Task,
  type TaskList,
} from '@/lib/tasks'
import { isTaskOpen } from '@/lib/task-agenda'
import { COLOR_SWATCHES, FIELD_CLASS, LABEL_CLASS, ProgressBar } from './PlannerUi'

export interface ProjectsViewProps {
  projects: Project[]
  tasks: Task[]
  taskLists: TaskList[]
  onOpenProject: (projectId: string) => void
  onShowTasks: (projectId: string) => void
  onProjectsChanged: () => void
  onTaskListsChanged: () => void
}

export default function ProjectsView({
  projects,
  tasks,
  taskLists,
  onOpenProject,
  onShowTasks,
  onProjectsChanged,
  onTaskListsChanged,
}: ProjectsViewProps) {
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectColor, setProjectColor] = useState(COLOR_SWATCHES[0])
  const [saving, setSaving] = useState(false)

  const [listName, setListName] = useState('')
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [editingListName, setEditingListName] = useState('')
  const [confirmListDelete, setConfirmListDelete] = useState<string | null>(null)
  const [listBusy, setListBusy] = useState(false)

  const stats = useMemo(() => {
    const map = new Map<string, { open: number; done: number; total: number; overdue: number }>()
    const now = new Date().setHours(0, 0, 0, 0)
    for (const task of tasks) {
      const key = task.project_id ?? 'none'
      const entry = map.get(key) ?? { open: 0, done: 0, total: 0, overdue: 0 }
      entry.total++
      if (task.status === 'completed') entry.done++
      if (isTaskOpen(task)) entry.open++
      if (isTaskOpen(task) && task.due_date && new Date(task.due_date).getTime() < now) {
        entry.overdue++
      }
      map.set(key, entry)
    }
    return map
  }, [tasks])

  const listStats = useMemo(() => {
    const map = new Map<string, number>()
    for (const task of tasks) {
      if (!task.task_list_id || !isTaskOpen(task)) continue
      map.set(task.task_list_id, (map.get(task.task_list_id) ?? 0) + 1)
    }
    return map
  }, [tasks])

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
      toast.push({ title: 'Project created', description: name, variant: 'success' })
    } catch (err) {
      console.error('Creating project failed:', err)
      toast.push({ title: 'Could not create project', variant: 'error' })
    } finally {
      setSaving(false)
    }
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <section className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
                <Layers size={15} className="text-accent" />
                Projects
              </h2>
              <p className="mt-0.5 text-[11px] text-muted">
                Group tasks by the projects in your workspace.
              </p>
            </div>
            <Button
              type="button"
              variant={creating ? 'ghost' : 'primary'}
              size="sm"
              icon={creating ? X : Plus}
              onClick={() => setCreating((current) => !current)}
            >
              {creating ? 'Cancel' : 'New project'}
            </Button>
          </div>

          {creating && (
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
          )}

          <ul className="mt-3 divide-y divide-[var(--border)]">
            {projects.map((project) => {
              const entry = stats.get(project.id) ?? { open: 0, done: 0, total: 0, overdue: 0 }
              const progress =
                entry.total > 0 ? Math.round((entry.done / entry.total) * 100) : 0
              return (
                <li key={project.id} className="py-2.5">
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] font-semibold text-foreground">
                          {project.name}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted">
                          {entry.open} open · {entry.done} done
                          {entry.overdue > 0 ? ` · ${entry.overdue} overdue` : ''}
                        </span>
                      </div>
                      {project.description && (
                        <p className="truncate text-[10px] text-muted">{project.description}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <ProgressBar value={progress} className="max-w-[220px]" />
                        <span className="text-[9px] tabular-nums text-muted">{progress}%</span>
                      </div>
                    </div>
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
                        icon={Archive}
                        aria-label={`Open ${project.name}`}
                        onClick={() => onOpenProject(project.id)}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
            {projects.length === 0 && (
              <li className="py-8 text-center text-[11px] text-muted">
                No projects yet. Create one to group tasks.
              </li>
            )}
          </ul>
        </section>

        {(() => {
          const unfiled = stats.get('none')
          if (!unfiled || unfiled.total === 0) return null
          return (
            <section className="glass-card flex items-center justify-between p-4">
              <div>
                <p className="text-[12px] font-semibold text-foreground">Tasks without a project</p>
                <p className="text-[10px] text-muted">
                  {unfiled.open} open · {unfiled.done} completed
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => onShowTasks('')}>
                Show tasks
              </Button>
            </section>
          )
        })()}
      </div>

      <aside className="space-y-4">
        <section className="glass-card p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
            <List size={14} className="text-accent" />
            Task lists
          </h2>
          <p className="mt-0.5 text-[11px] text-muted">
            Task lists are lightweight buckets independent of projects.
          </p>

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
            Open a task and pick a project or task list to file it. The filters on the Tasks tab
            then show each bucket separately, and the calendar can show project-linked events.
          </p>
        </section>
      </aside>
    </div>
  )
}
