'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  MoreVertical,
  Calendar,
  Flag,
  Link as LinkIcon,
  Image as ImageIcon,
  RefreshCw,
  Filter,
  Search,
  Star,
  StarOff,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
  Columns,
  X,
} from 'lucide-react';
import { Task, toggleTaskStar, updateTask } from '../lib/tasks';
import {
  BoardWithColumns,
  KanbanColumn,
  KanbanTaskPosition,
  moveTask,
  getBoard,
  getTaskPositions,
  createColumn,
  updateColumn,
  deleteColumn,
} from '../lib/kanban';
import { getTasks } from '../lib/tasks';
import { addAllTasksToDefaultBoard } from '../lib/kanban-utils';

interface KanbanBoardProps {
  boardId: string;
  onTaskClick?: (task: Task) => void;
  onCreateTask?: (columnId: string) => void;
}

interface ColumnTasksMap {
  [columnId: string]: Task[];
}

interface FilterState {
  search: string;
  priority: 'all' | Task['priority'];
  status: 'all' | Task['status'];
  label: 'all' | string;
  showCompleted: boolean;
  onlyStarred: boolean;
}

// ============================================================================
// TASK CARD COMPONENT
// ============================================================================

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  isDragging?: boolean;
  onToggleStar?: () => void;
  onToggleComplete?: () => void;
}

function TaskCard({ task, onClick, isDragging, onToggleStar, onToggleComplete }: TaskCardProps) {
  const priorityColors = {
    urgent: 'border-l-red-500 shadow-red-100',
    high: 'border-l-orange-500 shadow-orange-100',
    medium: 'border-l-alpine-500 shadow-alpine-100',
    low: 'border-l-gray-400 shadow-gray-100',
  };

  const statusColors = {
    todo: 'bg-gradient-to-br from-gray-50 to-gray-100',
    in_progress: 'bg-gradient-to-br from-alpine-50 to-alpine-100',
    waiting: 'bg-gradient-to-br from-amber-50 to-amber-100',
    completed: 'bg-gradient-to-br from-emerald-50 to-emerald-100',
    cancelled: 'bg-gradient-to-br from-gray-50 to-gray-100',
  };

  // Parse links and attachments if they exist
  const links = task.links && Array.isArray(task.links) ? task.links : [];
  const attachments = task.attachments && Array.isArray(task.attachments) ? task.attachments : [];
  const labels = task.labels && Array.isArray(task.labels) ? task.labels : [];

  const statusBadges: Record<string, string> = {
    todo: 'bg-gray-200 text-gray-700',
    in_progress: 'bg-alpine-100 text-alpine-700',
    waiting: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };

  const statusLabels: Record<string, string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    waiting: 'Waiting',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  const isOverdue = task.due_date ? new Date(task.due_date) < new Date() && task.status !== 'completed' : false;
  const dueToday = task.due_date ? new Date(task.due_date).toDateString() === new Date().toDateString() : false;

  return (
    <div
      className={`
        group bg-white border-l-4 ${priorityColors[task.priority]}
        rounded-lg p-3 shadow-md hover:shadow-xl transition-all duration-200 cursor-pointer
        ${statusColors[task.status]}
        ${isDragging ? 'opacity-50 ring-4 ring-alpine-300 scale-105' : 'hover:scale-[1.02]'}
        ${task.status === 'completed' ? 'opacity-75' : ''}
        transform
      `}
      style={{ borderLeftColor: task.color || undefined }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusBadges[task.status]} shadow-sm`}>
          {statusLabels[task.status]}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleStar?.(); }}
            className="p-1 rounded hover:bg-white/90 text-amber-500 transition-colors"
            aria-label={task.is_starred ? 'Unstar task' : 'Star task'}
          >
            {task.is_starred ? <Star className="w-4 h-4 fill-current drop-shadow" /> : <StarOff className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleComplete?.(); }}
            className="p-1 rounded hover:bg-white/90 text-emerald-600 transition-colors"
            aria-label="Toggle complete"
          >
            <CheckCircle2 className={`w-4 h-4 ${task.status === 'completed' ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {task.cover_image && (
        <div className="mb-2 -mx-3 -mt-3 overflow-hidden">
          <img
            src={task.cover_image}
            alt="Task cover"
            className="w-full h-24 object-cover rounded-t-lg group-hover:scale-105 transition-transform duration-200"
          />
        </div>
      )}

      <h4 className={`font-semibold text-sm text-gray-900 mb-1 line-clamp-2 ${task.status === 'completed' ? 'line-through text-gray-600' : ''}`}>
        {task.is_starred && <span className="text-amber-400 mr-1">⭐</span>}
        {task.title}
      </h4>

      {task.description && (
        <p className="text-xs text-gray-600 mb-2 line-clamp-2">
          {task.description}
        </p>
      )}

      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {labels.slice(0, 3).map((label: string, idx: number) => (
            <span
              key={idx}
              className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 font-medium shadow-sm"
            >
              {label}
            </span>
          ))}
          {labels.length > 3 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
              +{labels.length - 3}
            </span>
          )}
        </div>
      )}

      {task.progress !== undefined && task.progress > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Progress</span>
            <span className="text-xs font-medium text-alpine-600">{task.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden shadow-inner">
            <div
              className="bg-gradient-to-r from-alpine-500 to-alpine-600 h-2 rounded-full transition-all duration-300 shadow-sm"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/50">
            <Flag className="w-3 h-3" />
            <span className="capitalize font-medium">{task.priority}</span>
          </span>

          {task.due_date && (
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                isOverdue 
                  ? 'text-red-600 font-semibold bg-red-50' 
                  : dueToday 
                  ? 'text-amber-700 font-semibold bg-amber-50' 
                  : 'bg-white/50'
              }`}
            >
              <Calendar className="w-3 h-3" />
              {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}

          {links.length > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/50">
              <LinkIcon className="w-3 h-3" />
              {links.length}
            </span>
          )}

          {attachments.length > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/50">
              <ImageIcon className="w-3 h-3" />
              {attachments.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SORTABLE TASK CARD
// ============================================================================

interface SortableTaskCardProps {
  task: Task;
  onClick?: () => void;
  onToggleStar?: (task: Task) => void;
  onToggleComplete?: (task: Task) => void;
}

function SortableTaskCard({ task, onClick, onToggleStar, onToggleComplete }: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard
        task={task}
        onClick={onClick}
        isDragging={isDragging}
        onToggleStar={() => onToggleStar?.(task)}
        onToggleComplete={() => onToggleComplete?.(task)}
      />
    </div>
  );
}

// ============================================================================
// KANBAN COLUMN COMPONENT
// ============================================================================

interface KanbanColumnComponentProps {
  column: KanbanColumn;
  tasks: Task[];
  visibleTasks?: Task[];
  onTaskClick?: (task: Task) => void;
  onAddTask?: () => void;
  onToggleTaskStar?: (task: Task) => void;
  onToggleTaskComplete?: (task: Task) => void;
  onToggleMenu?: () => void;
  isMenuOpen?: boolean;
  onUpdateColumn?: (columnId: string, updates: Partial<KanbanColumn>) => Promise<void>;
  onDeleteColumn?: (columnId: string) => Promise<void>;
}

function KanbanColumnComponent({
  column,
  tasks,
  visibleTasks,
  onTaskClick,
  onAddTask,
  onToggleTaskStar,
  onToggleTaskComplete,
  onToggleMenu,
  isMenuOpen,
  onUpdateColumn,
  onDeleteColumn,
}: KanbanColumnComponentProps) {
  const taskCount = tasks.length;
  const isLimitReached = column.task_limit && taskCount >= column.task_limit;
  const limitExceeded = column.task_limit && taskCount > column.task_limit;
  const limitProgress = column.task_limit ? Math.min(100, Math.round((taskCount / column.task_limit) * 100)) : null;
  const displayTasks = visibleTasks ?? tasks;

  const [columnName, setColumnName] = useState(column.name);
  const [columnColor, setColumnColor] = useState(column.color);
  const [columnLimit, setColumnLimit] = useState(column.task_limit ? String(column.task_limit) : '');

  useEffect(() => {
    if (isMenuOpen) {
      setColumnName(column.name);
      setColumnColor(column.color);
      setColumnLimit(column.task_limit ? String(column.task_limit) : '');
    }
  }, [isMenuOpen, column]);

  // Make the column droppable
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: 'column',
      column,
    },
  });

  return (
    <div 
      ref={setNodeRef} 
      className={`flex flex-col h-full bg-white rounded-xl shadow-md border border-gray-200 transition-all duration-200 ${
        isOver ? 'ring-4 ring-alpine-400 ring-opacity-50 bg-alpine-50 scale-[1.02]' : ''
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white relative">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full shadow-sm"
              style={{ backgroundColor: column.color }}
            />
            <h3 className="font-semibold text-sm text-gray-900">
              {column.name}
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              limitExceeded 
                ? 'bg-red-100 text-red-700 shadow-sm' 
                : 'bg-white text-gray-600 border border-gray-200 shadow-sm'
            }`}>
              {taskCount}
              {column.task_limit && ` / ${column.task_limit}`}
            </span>
          </div>
          {column.task_limit && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                <div
                  className={`h-full transition-all duration-300 ${
                    limitExceeded ? 'bg-gradient-to-r from-red-400 to-red-500' : 'bg-gradient-to-r from-alpine-400 to-alpine-500'
                  }`}
                  style={{ width: `${limitProgress}%` }}
                />
              </div>
              <span className="font-medium">{limitProgress}%</span>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu?.();
            }}
            aria-label="Column menu"
          >
            <SlidersHorizontal className="w-4 h-4 text-gray-500" />
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-2xl z-20 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await onUpdateColumn?.(column.id, {
                    name: columnName,
                    color: columnColor,
                    task_limit: columnLimit === '' ? undefined : Number(columnLimit),
                  });
                  onToggleMenu?.();
                }}
              >
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Column Name</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alpine-500"
                    value={columnName}
                    onChange={(e) => setColumnName(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
                    <input
                      type="color"
                      className="w-full h-10 rounded-lg border border-gray-300 cursor-pointer"
                      value={columnColor}
                      onChange={(e) => setColumnColor(e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Task Limit</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="None"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alpine-500"
                      value={columnLimit}
                      onChange={(e) => setColumnLimit(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    onClick={async () => {
                      await onDeleteColumn?.(column.id);
                      onToggleMenu?.();
                    }}
                  >
                    Delete Column
                  </button>
                  <div className="flex items-center gap-2">
                    <button 
                      type="button" 
                      className="text-xs text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors" 
                      onClick={() => onToggleMenu?.()}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="text-xs px-4 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 font-medium transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Tasks Container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[200px] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        {displayTasks.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            {taskCount > 0 ? 'No tasks match your filters' : 'Drop tasks here or click Add Task'}
          </div>
        ) : (
          <SortableContext
            items={displayTasks.map(t => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {displayTasks.map(task => (
              <SortableTaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick?.(task)}
                onToggleStar={onToggleTaskStar}
                onToggleComplete={onToggleTaskComplete}
              />
            ))}
          </SortableContext>
        )}
      </div>

      {/* Add Task Button */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onAddTask}
          disabled={!!isLimitReached}
          className={`
            w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200
            ${isLimitReached
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-alpine-500 to-alpine-600 text-white hover:from-alpine-600 hover:to-alpine-700 shadow-md hover:shadow-lg active:scale-95'
            }
          `}
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
        {isLimitReached && (
          <p className="text-xs text-red-500 mt-2 text-center font-medium animate-pulse">
            ⚠️ Column limit reached
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN KANBAN BOARD COMPONENT
// ============================================================================

export default function KanbanBoard({ boardId, onTaskClick, onCreateTask }: KanbanBoardProps) {
  const [board, setBoard] = useState<BoardWithColumns | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskPositions, setTaskPositions] = useState<KanbanTaskPosition[]>([]);
  const [columnTasks, setColumnTasks] = useState<ColumnTasksMap>({});
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    priority: 'all',
    status: 'all',
    label: 'all',
    showCompleted: true,
    onlyStarred: false,
  });
  const [labelOptions, setLabelOptions] = useState<string[]>([]);
  const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
  const [showAddColumnForm, setShowAddColumnForm] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('#6B7280');
  const [newColumnLimit, setNewColumnLimit] = useState('');
  const [taskColumnMap, setTaskColumnMap] = useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const buildColumnMap = useCallback((positions: KanbanTaskPosition[]) => {
    const map: Record<string, string> = {};
    positions.forEach(pos => {
      map[pos.task_id] = pos.column_id;
    });
    return map;
  }, []);

  // Load board data
  const loadBoard = useCallback(async () => {
    try {
      setLoading(true);
      const boardData = await getBoard(boardId);
      setBoard(boardData);

      if (boardData) {
        // Load tasks and positions
        const [allTasks, positions] = await Promise.all([
          getTasks(),
          getTaskPositions(boardId)
        ]);

        setTasks(allTasks);
        setTaskPositions(positions);

        // Organize tasks by column
        const tasksMap: ColumnTasksMap = {};
        boardData.columns.forEach(col => {
          tasksMap[col.id] = [];
        });

        // Add tasks to their columns based on positions
        positions.forEach(pos => {
          const task = allTasks.find(t => t.id === pos.task_id);
          if (task && tasksMap[pos.column_id]) {
            tasksMap[pos.column_id].push(task);
          }
        });

        // Sort tasks within each column by position
        Object.keys(tasksMap).forEach(columnId => {
          tasksMap[columnId].sort((a, b) => {
            const posA = positions.find(p => p.task_id === a.id)?.sort_position ?? 0;
            const posB = positions.find(p => p.task_id === b.id)?.sort_position ?? 0;
            return posA - posB;
          });
        });

        setColumnTasks(tasksMap);
        setTaskColumnMap(buildColumnMap(positions));
        
        // Collect all unique labels
        const allLabels = new Set<string>();
        allTasks.forEach(task => {
          if (task.labels && Array.isArray(task.labels)) {
            task.labels.forEach(label => allLabels.add(label));
          }
        });
        setLabelOptions(Array.from(allLabels).sort());
      }
    } catch (error) {
      console.error('Error loading board:', error);
    } finally {
      setLoading(false);
    }
  }, [boardId, buildColumnMap]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Update a task in local state
  const updateTaskState = useCallback((updatedTask: Task) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    setColumnTasks(prev => {
      const newMap: ColumnTasksMap = {};
      Object.entries(prev).forEach(([colId, taskList]) => {
        newMap[colId] = taskList.map(t => t.id === updatedTask.id ? updatedTask : t);
      });
      return newMap;
    });
  }, []);

  // Toggle task star
  const handleToggleStar = useCallback(async (task: Task) => {
    try {
      const updated = await toggleTaskStar(task.id, !task.is_starred);
      updateTaskState(updated);
    } catch (error) {
      console.error('Failed to toggle star:', error);
    }
  }, [updateTaskState]);

  // Toggle task complete
  const handleToggleComplete = useCallback(async (task: Task) => {
    try {
      const nextStatus = task.status === 'completed' ? 'todo' : 'completed';
      const updated = await updateTask(task.id, { 
        status: nextStatus,
        completed_at: nextStatus === 'completed' ? new Date().toISOString() : null
      });
      updateTaskState(updated);
    } catch (error) {
      console.error('Failed to toggle complete:', error);
    }
  }, [updateTaskState]);

  const filterTask = useCallback((task: Task) => {
    if (!filters.showCompleted && task.status === 'completed') return false;
    if (filters.onlyStarred && !task.is_starred) return false;
    if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
    if (filters.status !== 'all' && task.status !== filters.status) return false;
    if (filters.label !== 'all') {
      const labels = task.labels || [];
      if (!labels.includes(filters.label)) return false;
    }
    if (filters.search.trim()) {
      const value = filters.search.toLowerCase();
      const haystack = `${task.title || ''} ${task.description || ''}`.toLowerCase();
      if (!haystack.includes(value)) return false;
    }
    return true;
  }, [filters]);

  const filteredColumnTasks = useMemo(() => {
    const map: ColumnTasksMap = {};
    Object.entries(columnTasks).forEach(([columnId, taskList]) => {
      map[columnId] = taskList.filter(filterTask);
    });
    return map;
  }, [columnTasks, filterTask]);

  const filteringActive = useMemo(() => {
    return Boolean(
      filters.search.trim() ||
      filters.priority !== 'all' ||
      filters.status !== 'all' ||
      filters.label !== 'all' ||
      !filters.showCompleted ||
      filters.onlyStarred
    );
  }, [filters]);

  const boardStats = useMemo(() => {
    const allTasks = Object.values(columnTasks).flat();
    const now = new Date();
    const total = allTasks.length;
    const completed = allTasks.filter(t => t.status === 'completed').length;
    const overdue = allTasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'completed').length;
    const dueToday = allTasks.filter(t => {
      if (!t.due_date) return false;
      const dueDate = new Date(t.due_date);
      return dueDate.toDateString() === now.toDateString();
    }).length;
    return { total, completed, overdue, dueToday };
  }, [columnTasks]);

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleCreateColumn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!board) return;
    try {
      const column = await createColumn(board.id, newColumnName || 'Untitled Column', {
        color: newColumnColor,
        task_limit: newColumnLimit ? Number(newColumnLimit) : undefined,
      });
      setBoard(prev => prev ? { ...prev, columns: [...prev.columns, column] } : prev);
      setColumnTasks(prev => ({ ...prev, [column.id]: [] }));
      setShowAddColumnForm(false);
      setNewColumnName('');
      setNewColumnLimit('');
    } catch (error) {
      console.error('Failed to create column:', error);
    }
  };

  const handleUpdateColumnDetails = useCallback(async (columnId: string, updates: Partial<KanbanColumn>) => {
    try {
      const updated = await updateColumn(columnId, updates);
      setBoard(prev => prev ? {
        ...prev,
        columns: prev.columns.map(col => (col.id === columnId ? updated : col))
      } : prev);
    } catch (error) {
      console.error('Failed to update column:', error);
    }
  }, []);

  const handleDeleteColumnRequest = useCallback(async (columnId: string) => {
    if (!board) return;
    const columnTasksCount = columnTasks[columnId]?.length || 0;
    if (columnTasksCount > 0) {
      alert('Move or archive tasks before deleting this column.');
      return;
    }
    const confirmed = typeof window !== 'undefined' ? window.confirm('Delete this column?') : true;
    if (!confirmed) return;
    try {
      await deleteColumn(columnId);
      setBoard(prev => prev ? {
        ...prev,
        columns: prev.columns.filter(col => col.id !== columnId)
      } : prev);
      setColumnTasks(prev => {
        const next = { ...prev };
        delete next[columnId];
        return next;
      });
    } catch (error) {
      console.error('Failed to delete column:', error);
    }
  }, [board, columnTasks]);

  // Handle drag over (for visual feedback)
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // If dragging over a column or a different task, we could update local state for visual feedback
    // For now, we'll just log it for debugging
    if (over.data.current?.type === 'column') {
      console.log(`Dragging ${activeId} over column ${overId}`);
    }
  };

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || !board) {
      setActiveTask(null);
      return;
    }

    const activeTaskId = active.id as string;
    let targetColumnId: string | null = null;
    let targetPosition = 0;

    // Check if dropped over a column directly
    if (over.data.current?.type === 'column') {
      targetColumnId = over.id as string;
      // Get the number of tasks in the target column to append at the end
      const targetColumnTasks = columnTasks[targetColumnId] || [];
      targetPosition = targetColumnTasks.length;
    } 
    // Check if dropped over another task
    else {
      const overTask = tasks.find(t => t.id === over.id);
      if (overTask) {
        const overPosition = taskPositions.find(p => p.task_id === overTask.id);
        if (overPosition) {
          targetColumnId = overPosition.column_id;
          targetPosition = overPosition.sort_position;
        }
      }
    }

    // Fallback: use the task's current column if not found
    if (!targetColumnId) {
      const activePosition = taskPositions.find(p => p.task_id === activeTaskId);
      if (activePosition) {
        targetColumnId = activePosition.column_id;
      }
    }

    // Only move if we have a valid target column
    if (targetColumnId) {
      // Find the source column
      const sourceColumnId = Object.keys(columnTasks).find(colId =>
        columnTasks[colId].some(t => t.id === activeTaskId)
      );

      // If no movement or just reordering within same column, skip if same position
      if (sourceColumnId === targetColumnId) {
        const currentIndex = columnTasks[sourceColumnId].findIndex(t => t.id === activeTaskId);
        if (currentIndex === targetPosition) {
          setActiveTask(null);
          return;
        }
      }

      // Optimistically update local state immediately
      const activeTask = tasks.find(t => t.id === activeTaskId);
      if (activeTask && sourceColumnId) {
        const newColumnTasks = { ...columnTasks };
        
        // Remove from source column
        newColumnTasks[sourceColumnId] = newColumnTasks[sourceColumnId].filter(
          t => t.id !== activeTaskId
        );
        
        // Add to target column at the specified position
        if (!newColumnTasks[targetColumnId]) {
          newColumnTasks[targetColumnId] = [];
        }
        newColumnTasks[targetColumnId].splice(targetPosition, 0, activeTask);
        
        // Update state immediately for smooth UI
        setColumnTasks(newColumnTasks);
        
        // Update task positions in background
        const newPositions = taskPositions.map(pos => {
          if (pos.task_id === activeTaskId) {
            return { ...pos, column_id: targetColumnId, sort_position: targetPosition };
          }
          return pos;
        });
        setTaskPositions(newPositions);
      }

      // Persist to server in background
      try {
        await moveTask(activeTaskId, boardId, targetColumnId, targetPosition);
        // Optionally reload to ensure sync with server
        // await loadBoard();
      } catch (error) {
        console.error('Error moving task:', error);
        // On error, reload to restore correct state
        await loadBoard();
      }
    }

    setActiveTask(null);
  };

  const handleAddTask = (columnId: string) => {
    onCreateTask?.(columnId);
  };

  const handleSyncTasks = async () => {
    setSyncing(true);
    try {
      await addAllTasksToDefaultBoard();
      await loadBoard(); // Reload board to show newly added tasks
    } catch (error) {
      console.error('Failed to sync tasks:', error);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-alpine-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading board...</p>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-600">Board not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 to-alpine-50">
      {/* Board Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{board.icon || '📋'}</span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{board.name}</h2>
              {board.description && (
                <p className="text-sm text-gray-600">{board.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddColumnForm(!showAddColumnForm)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              title="Add new column"
            >
              <Columns className="w-4 h-4" />
              Add Column
            </button>
            <button
              onClick={handleSyncTasks}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Add existing tasks to board"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Tasks'}
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-6 px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-alpine-500" />
            <span className="text-sm text-gray-600">Total: <span className="font-medium text-gray-900">{boardStats.total}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-gray-600">Completed: <span className="font-medium text-emerald-600">{boardStats.completed}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-gray-600">Overdue: <span className="font-medium text-red-600">{boardStats.overdue}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-gray-600">Due Today: <span className="font-medium text-amber-600">{boardStats.dueToday}</span></span>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-t border-gray-100">
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="flex-1 text-sm border-none outline-none bg-transparent placeholder-gray-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={filters.priority}
              onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value as any }))}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-alpine-500"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-alpine-500"
            >
              <option value="all">All Statuses</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting">Waiting</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {labelOptions.length > 0 && (
              <select
                value={filters.label}
                onChange={(e) => setFilters(prev => ({ ...prev, label: e.target.value }))}
                className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-alpine-500"
              >
                <option value="all">All Labels</option>
                {labelOptions.map(label => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => setFilters(prev => ({ ...prev, onlyStarred: !prev.onlyStarred }))}
              className={`p-1.5 rounded ${filters.onlyStarred ? 'bg-amber-100 text-amber-600' : 'text-gray-400 hover:text-amber-500'}`}
              title="Show starred only"
            >
              <Star className={`w-4 h-4 ${filters.onlyStarred ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={() => setFilters(prev => ({ ...prev, showCompleted: !prev.showCompleted }))}
              className={`p-1.5 rounded text-xs font-medium ${filters.showCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}
              title="Toggle completed tasks"
            >
              {filters.showCompleted ? 'Hide' : 'Show'} Completed
            </button>
            {filteringActive && (
              <button
                onClick={() => setFilters({
                  search: '',
                  priority: 'all',
                  status: 'all',
                  label: 'all',
                  showCompleted: true,
                  onlyStarred: false,
                })}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add Column Form */}
      {showAddColumnForm && (
        <div className="px-4 py-3 bg-alpine-50 border-b border-alpine-100">
          <form onSubmit={handleCreateColumn} className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Column name..."
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              className="flex-1 text-sm border border-alpine-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alpine-500"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newColumnColor}
                onChange={(e) => setNewColumnColor(e.target.value)}
                className="w-8 h-8 rounded border border-alpine-200"
              />
              <input
                type="number"
                placeholder="Limit"
                value={newColumnLimit}
                onChange={(e) => setNewColumnLimit(e.target.value)}
                className="w-20 text-sm border border-alpine-200 rounded px-2 py-2 focus:outline-none focus:ring-2 focus:ring-alpine-500"
                min={0}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-alpine-600 rounded-lg hover:bg-alpine-700"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddColumnForm(false);
                setNewColumnName('');
                setNewColumnLimit('');
              }}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Kanban Columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full" style={{ minWidth: 'max-content' }}>
            {board.columns.map(column => (
              <div key={column.id} className="w-80 flex-shrink-0 h-full">
                <KanbanColumnComponent
                  column={column}
                  tasks={columnTasks[column.id] || []}
                  visibleTasks={filteredColumnTasks[column.id]}
                  onTaskClick={onTaskClick}
                  onAddTask={() => handleAddTask(column.id)}
                  onToggleTaskStar={handleToggleStar}
                  onToggleTaskComplete={handleToggleComplete}
                  onToggleMenu={() => setActiveColumnMenu(activeColumnMenu === column.id ? null : column.id)}
                  isMenuOpen={activeColumnMenu === column.id}
                  onUpdateColumn={handleUpdateColumnDetails}
                  onDeleteColumn={handleDeleteColumnRequest}
                />
              </div>
            ))}
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeTask && (
              <div className="w-80 opacity-90 shadow-2xl">
                <TaskCard task={activeTask} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
