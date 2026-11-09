'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Plus,
  Star,
} from 'lucide-react'
import type { Project } from '@/lib/projects'
import type { Task, TaskStatus } from '@/lib/tasks'
import { PRIORITY_META, ProgressBar, STATUS_META, STATUS_ORDER, dueLabel } from './PlannerUi'

const COLUMN_ACCENT: Record<TaskStatus, { dot: string; text: string; border: string }> = {
  todo: { dot: 'bg-muted', text: 'text-muted', border: 'border-[var(--border)]' },
  in_progress: { dot: 'bg-accent', text: 'text-accent', border: 'border-[var(--accent-light)]' },
  waiting: { dot: 'bg-warning', text: 'text-warning', border: 'border-[var(--warning-light)]' },
  completed: { dot: 'bg-success', text: 'text-success', border: 'border-[var(--success-light)]' },
  cancelled: { dot: 'bg-muted', text: 'text-muted', border: 'border-[var(--border)]' },
}

export interface TaskKanbanViewProps {
  tasks: Task[]
  projects: Project[]
  onOpenTask: (task: Task) => void
  onToggleStar: (task: Task) => void
  onQuickAdd: (title: string, status: TaskStatus) => void
  onMoveTask: (task: Task, status: TaskStatus, orderedIds: string[]) => void
  onClearCompleted: () => void
}

export default function TaskKanbanView({
  tasks,
  projects,
  onOpenTask,
  onToggleStar,
  onQuickAdd,
  onMoveTask,
  onClearCompleted,
}: TaskKanbanViewProps) {
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    setLocalTasks(tasks)
  }, [tasks])

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )

  const columns = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>()
    for (const status of STATUS_ORDER) map.set(status, [])
    for (const task of localTasks) {
      if (task.is_archived) continue
      const list = map.get(task.status) ?? []
      list.push(task)
      map.set(task.status, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order || compareByDue(a, b))
    }
    return map
  }, [localTasks])

  const activeTask = activeId ? localTasks.find((task) => task.id === activeId) ?? null : null
  const openCount = localTasks.filter(
    (task) => !task.is_archived && task.status !== 'completed' && task.status !== 'cancelled',
  ).length
  const completedCount = localTasks.filter((task) => task.status === 'completed').length

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragOver = (event: { active: { id: string | number }; over: { id: string | number; data: { current?: Record<string, unknown> } } | null }) => {
    const { active, over } = event
    if (!over) return

    const activeTaskId = String(active.id)
    const overData = over.data?.current as { status?: TaskStatus; taskId?: string } | undefined
    const overStatus =
      overData?.status ??
      (String(over.id).startsWith('column-')
        ? (String(over.id).replace('column-', '') as TaskStatus)
        : undefined)

    if (!overStatus) return

    setLocalTasks((current) =>
      current.map((task) =>
        task.id === activeTaskId && task.status !== overStatus
          ? { ...task, status: overStatus }
          : task,
      ),
    )
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const activeTaskId = String(active.id)
    const task = localTasks.find((candidate) => candidate.id === activeTaskId)
    if (!task) return

    const overData = over.data?.current as { status?: TaskStatus; taskId?: string } | undefined
    const overId = String(over.id)
    const destinationStatus =
      overData?.status ??
      (overId.startsWith('column-') ? (overId.replace('column-', '') as TaskStatus) : task.status)

    if (destinationStatus === task.status && overData?.taskId === activeTaskId) return

    // Build the destination column order without the dragged task.
    const columnTasks = localTasks
      .filter(
        (candidate) =>
          candidate.id !== activeTaskId &&
          !candidate.is_archived &&
          candidate.status === destinationStatus,
      )
      .sort((a, b) => a.sort_order - b.sort_order || compareByDue(a, b))

    let insertIndex = columnTasks.length
    const overTaskId = overData?.taskId
    if (overTaskId) {
      const index = columnTasks.findIndex((candidate) => candidate.id === overTaskId)
      if (index >= 0) insertIndex = index
    }

    columnTasks.splice(insertIndex, 0, { ...task, status: destinationStatus })
    const orderedIds = columnTasks.map((candidate) => candidate.id)

    setLocalTasks((current) =>
      current.map((candidate) => {
        if (candidate.id === activeTaskId) {
          return { ...candidate, status: destinationStatus, sort_order: insertIndex }
        }
        const position = orderedIds.indexOf(candidate.id)
        return position >= 0 && candidate.status === destinationStatus
          ? { ...candidate, sort_order: position }
          : candidate
      }),
    )

    onMoveTask(task, destinationStatus, orderedIds)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          {openCount} open · {completedCount} completed · drag cards between columns
        </p>
        <button
          type="button"
          onClick={onClearCompleted}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <CheckCircle2 size={12} />
          Clear completed
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-3 scroll-thin">
          {STATUS_ORDER.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={columns.get(status) ?? []}
              projectById={projectById}
              onOpenTask={onOpenTask}
              onToggleStar={onToggleStar}
              onQuickAdd={onQuickAdd}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="w-[260px] rotate-1">
              <KanbanCardBody task={activeTask} project={activeTask.project_id ? projectById.get(activeTask.project_id) : undefined} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function KanbanColumn({
  status,
  tasks,
  projectById,
  onOpenTask,
  onToggleStar,
  onQuickAdd,
}: {
  status: TaskStatus
  tasks: Task[]
  projectById: Map<string, Project>
  onOpenTask: (task: Task) => void
  onToggleStar: (task: Task) => void
  onQuickAdd: (title: string, status: TaskStatus) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status}`, data: { status } })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const accent = COLUMN_ACCENT[status]

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = title.trim()
    if (!value) return
    onQuickAdd(value, status)
    setTitle('')
    setAdding(false)
  }

  return (
    <section
      ref={setNodeRef}
      className={`flex w-[264px] shrink-0 flex-col rounded-2xl border bg-[var(--surface)] transition-all duration-200 ${
        isOver
          ? 'border-accent bg-[var(--accent-light)] shadow-[0_0_0_3px_var(--accent-glow)]'
          : accent.border
      }`}
    >
      <header className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <span className={`h-2 w-2 rounded-full ${accent.dot}`} />
        <h3 className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${accent.text}`}>
          {STATUS_META[status].label}
        </h3>
        <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
          {tasks.length}
        </span>
        <button
          type="button"
          onClick={() => setAdding((current) => !current)}
          aria-label={`Add task to ${STATUS_META[status].label}`}
          className="focus-ring ml-auto flex h-6 w-6 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
        >
          <Plus size={13} />
        </button>
      </header>

      {adding && (
        <form onSubmit={submit} className="px-2 pb-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (!title.trim()) setAdding(false)
            }}
            placeholder="Task title…"
            className="glass-input h-8 w-full px-2 text-[12px]"
          />
        </form>
      )}

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex-1 space-y-2 px-2 pb-2">
          {tasks.map((task) => (
            <SortableCard
              key={task.id}
              task={task}
              project={task.project_id ? projectById.get(task.project_id) : undefined}
              onOpen={() => onOpenTask(task)}
              onToggleStar={() => onToggleStar(task)}
            />
          ))}
          {tasks.length === 0 && (
            <li className="rounded-xl border border-dashed border-[var(--border)] px-2 py-6 text-center text-[11px] text-muted">
              Drop tasks here
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  )
}

function SortableCard({
  task,
  project,
  onOpen,
  onToggleStar,
}: {
  task: Task
  project?: Project
  onOpen: () => void
  onToggleStar: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status, taskId: task.id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  }

  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen()
          }
        }}
        className="pl-lift focus-ring cursor-grab rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-2.5 shadow-sm active:cursor-grabbing"
      >
        <KanbanCardBody task={task} project={project} onToggleStar={onToggleStar} />
      </div>
    </li>
  )
}

function KanbanCardBody({
  task,
  project,
  dragging = false,
  onToggleStar,
}: {
  task: Task
  project?: Project
  dragging?: boolean
  onToggleStar?: () => void
}) {
  const done = task.status === 'completed' || task.status === 'cancelled'
  const overdue =
    !done &&
    task.due_date &&
    new Date(task.due_date).getTime() < new Date().setHours(0, 0, 0, 0)
  const priority = PRIORITY_META[task.priority]
  const labels = task.labels ?? []
  const progress = task.progress ?? 0

  return (
    <div className={dragging ? 'rounded-xl border border-accent bg-[var(--surface-solid)] p-2.5 shadow-xl' : ''}>
      <div className="flex items-center justify-between gap-1">
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] ${priority.soft}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
          {priority.label}
        </span>
        {onToggleStar && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggleStar()
            }}
            aria-label={task.is_starred ? 'Unstar task' : 'Star task'}
            className={`focus-ring flex h-5 w-5 items-center justify-center rounded ${
              task.is_starred ? 'text-amber-500' : 'text-muted hover:text-foreground'
            }`}
          >
            <Star size={11} fill={task.is_starred ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      <p className={`mt-1.5 text-[12px] font-medium leading-snug ${done ? 'text-muted line-through' : overdue ? 'text-danger' : 'text-foreground'}`}>
        {task.title}
      </p>

      {progress > 0 && progress < 100 && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <ProgressBar value={progress} />
          <span className="text-[9px] tabular-nums text-muted">{progress}%</span>
        </div>
      )}

      {labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {labels.slice(0, 3).map((label) => (
            <span key={label} className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 text-[9px] text-muted">
              {label}
            </span>
          ))}
          {labels.length > 3 && <span className="text-[9px] text-muted">+{labels.length - 3}</span>}
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${
            overdue
              ? 'bg-[var(--danger-light)] font-semibold text-danger'
              : 'bg-[var(--surface-sunken)] text-muted'
          }`}
        >
          {overdue ? <AlertTriangle size={10} /> : <CalendarDays size={10} />}
          {dueLabel(task)}
        </span>
        <span className="flex items-center gap-1.5">
          {task.estimated_minutes ? (
            <span className="inline-flex items-center gap-0.5 text-muted">
              <Clock3 size={9} />
              {task.estimated_minutes}m
            </span>
          ) : null}
          {project && (
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: project.color }}
              title={project.name}
            />
          )}
        </span>
      </div>
    </div>
  )
}

function compareByDue(a: Task, b: Task): number {
  const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
  const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
  return aDue - bDue
}
