import { supabase } from './supabase'

// ============================================================================
// TYPES
// ============================================================================

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'completed' | 'cancelled'

export interface TaskList {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string
  icon: string | null
  is_default: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TaskLink {
  url: string
  title?: string
  description?: string
}

export interface TaskAttachment {
  name: string
  url: string
  size?: number
  type?: string
  uploaded_at?: string
}

export interface Task {
  id: string
  user_id: string
  task_list_id: string | null
  note_id: string | null
  project_id: string | null
  title: string
  description: string | null
  priority: TaskPriority
  status: TaskStatus
  due_date: string | null
  start_date: string | null
  completed_at: string | null
  recurrence_pattern_id: string | null
  is_recurring: boolean
  parent_task_id: string | null
  sort_order: number
  estimated_minutes: number | null
  actual_minutes: number | null
  is_starred: boolean
  is_archived: boolean
  created_at: string
  updated_at: string
  // Enhanced fields
  links?: TaskLink[]
  color?: string
  cover_image?: string
  attachments?: TaskAttachment[]
  custom_fields?: Record<string, any>
  progress?: number
  labels?: string[]
}

export interface Subtask {
  id: string
  user_id: string
  parent_task_id: string
  title: string
  is_completed: boolean
  completed_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export interface TaskWithDetails extends Task {
  task_list?: TaskList
  tags?: Tag[]
  subtasks?: Subtask[]
  completion_percentage?: number
}

// ============================================================================
// TASK LISTS
// ============================================================================

export async function getTaskLists(): Promise<TaskList[]> {
  const { data, error } = await supabase
    .from('task_lists')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createTaskList(
  name: string,
  options?: {
    description?: string
    color?: string
    icon?: string
    is_default?: boolean
  }
): Promise<TaskList> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('task_lists')
    .insert({
      user_id: user.id,
      name,
      description: options?.description || null,
      color: options?.color || '#3B82F6',
      icon: options?.icon || null,
      is_default: options?.is_default || false,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateTaskList(
  id: string,
  updates: Partial<Omit<TaskList, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<TaskList> {
  const { data, error } = await supabase
    .from('task_lists')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteTaskList(id: string): Promise<void> {
  const { error } = await supabase
    .from('task_lists')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ============================================================================
// TASKS
// ============================================================================

export async function getTasks(filters?: {
  taskListId?: string
  projectId?: string
  noteId?: string
  status?: TaskStatus
  priority?: TaskPriority
  includeArchived?: boolean
  includeCompleted?: boolean
  dueBefore?: Date
  dueAfter?: Date
  isStarred?: boolean
}): Promise<Task[]> {
  let query = supabase
    .from('tasks')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })

  if (filters?.taskListId) {
    query = query.eq('task_list_id', filters.taskListId)
  }

  if (filters?.projectId) {
    query = query.eq('project_id', filters.projectId)
  }

  if (filters?.noteId) {
    query = query.eq('note_id', filters.noteId)
  }

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }

  if (filters?.priority) {
    query = query.eq('priority', filters.priority)
  }

  if (!filters?.includeArchived) {
    query = query.eq('is_archived', false)
  }

  if (!filters?.includeCompleted) {
    query = query.neq('status', 'completed')
  }

  if (filters?.dueBefore) {
    query = query.lte('due_date', filters.dueBefore.toISOString())
  }

  if (filters?.dueAfter) {
    query = query.gte('due_date', filters.dueAfter.toISOString())
  }

  if (filters?.isStarred !== undefined) {
    query = query.eq('is_starred', filters.isStarred)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function getTaskWithDetails(id: string): Promise<TaskWithDetails | null> {
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .single()

  if (taskError) throw taskError
  if (!task) return null

  // Get task list
  let taskList: TaskList | undefined
  if (task.task_list_id) {
    const { data } = await supabase
      .from('task_lists')
      .select('*')
      .eq('id', task.task_list_id)
      .single()
    if (data) taskList = data
  }

  // Get tags
  const { data: tagData } = await supabase
    .from('task_tags')
    .select('tag_id, tags(*)')
    .eq('task_id', id)

  const tags = tagData?.map((t: any) => t.tags).filter(Boolean) || []

  // Get subtasks
  const subtasks = await getSubtasks(id)

  // Calculate completion percentage
  let completion_percentage = 0
  if (subtasks.length > 0) {
    const completed = subtasks.filter(s => s.is_completed).length
    completion_percentage = Math.round((completed / subtasks.length) * 100)
  }

  return {
    ...task,
    task_list: taskList,
    tags,
    subtasks,
    completion_percentage,
  }
}

export async function createTask(
  title: string,
  options?: {
    description?: string
    taskListId?: string
    noteId?: string
    projectId?: string
    priority?: TaskPriority
    status?: TaskStatus
    dueDate?: Date
    startDate?: Date
    estimatedMinutes?: number
    isStarred?: boolean
    // Enhanced fields
    links?: TaskLink[]
    color?: string
    coverImage?: string
    attachments?: TaskAttachment[]
    customFields?: Record<string, any>
    progress?: number
    labels?: string[]
  }
): Promise<Task> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: user.id,
      title,
      description: options?.description || null,
      task_list_id: options?.taskListId || null,
      note_id: options?.noteId || null,
      project_id: options?.projectId || null,
      priority: options?.priority || 'medium',
      status: options?.status || 'todo',
      due_date: options?.dueDate?.toISOString() || null,
      start_date: options?.startDate?.toISOString() || null,
      estimated_minutes: options?.estimatedMinutes || null,
      is_starred: options?.isStarred || false,
      // Enhanced fields
      links: options?.links || [],
      color: options?.color || null,
      cover_image: options?.coverImage || null,
      attachments: options?.attachments || [],
      custom_fields: options?.customFields || {},
      progress: options?.progress || 0,
      labels: options?.labels || [],
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateTask(
  id: string,
  updates: Partial<Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function completeTask(id: string): Promise<Task> {
  return updateTask(id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  })
}

export async function uncompleteTask(id: string): Promise<Task> {
  return updateTask(id, {
    status: 'todo',
    completed_at: null,
  })
}

export async function toggleTaskStar(id: string, isStarred: boolean): Promise<Task> {
  return updateTask(id, { is_starred: isStarred })
}

export async function archiveTask(id: string): Promise<Task> {
  return updateTask(id, { is_archived: true })
}

export async function unarchiveTask(id: string): Promise<Task> {
  return updateTask(id, { is_archived: false })
}

// ============================================================================
// SUBTASKS
// ============================================================================

export async function getSubtasks(parentTaskId: string): Promise<Subtask[]> {
  const { data, error } = await supabase
    .from('subtasks')
    .select('*')
    .eq('parent_task_id', parentTaskId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createSubtask(
  parentTaskId: string,
  title: string
): Promise<Subtask> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('subtasks')
    .insert({
      user_id: user.id,
      parent_task_id: parentTaskId,
      title,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateSubtask(
  id: string,
  updates: Partial<Omit<Subtask, 'id' | 'user_id' | 'parent_task_id' | 'created_at' | 'updated_at'>>
): Promise<Subtask> {
  const { data, error } = await supabase
    .from('subtasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function toggleSubtask(id: string, isCompleted: boolean): Promise<Subtask> {
  return updateSubtask(id, {
    is_completed: isCompleted,
    completed_at: isCompleted ? new Date().toISOString() : null,
  })
}

export async function deleteSubtask(id: string): Promise<void> {
  const { error } = await supabase
    .from('subtasks')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ============================================================================
// TAGS
// ============================================================================

export async function getTags(): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createTag(name: string, color?: string): Promise<Tag> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('tags')
    .insert({
      user_id: user.id,
      name,
      color: color || '#6B7280',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteTag(id: string): Promise<void> {
  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function addTagToTask(taskId: string, tagId: string): Promise<void> {
  const { error } = await supabase
    .from('task_tags')
    .insert({
      task_id: taskId,
      tag_id: tagId,
    })

  if (error) throw error
}

export async function removeTagFromTask(taskId: string, tagId: string): Promise<void> {
  const { error } = await supabase
    .from('task_tags')
    .delete()
    .eq('task_id', taskId)
    .eq('tag_id', tagId)

  if (error) throw error
}

// ============================================================================
// STATISTICS
// ============================================================================

export interface TaskStats {
  total: number
  todo: number
  in_progress: number
  completed: number
  overdue: number
  due_today: number
  due_this_week: number
  starred: number
}

export async function getTaskStats(): Promise<TaskStats> {
  const allTasks = await getTasks({ includeArchived: false, includeCompleted: true })
  
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(today)
  endOfToday.setDate(endOfToday.getDate() + 1)
  
  const endOfWeek = new Date(today)
  endOfWeek.setDate(endOfWeek.getDate() + 7)

  const stats: TaskStats = {
    total: allTasks.length,
    todo: allTasks.filter(t => t.status === 'todo').length,
    in_progress: allTasks.filter(t => t.status === 'in_progress').length,
    completed: allTasks.filter(t => t.status === 'completed').length,
    overdue: allTasks.filter(t => 
      t.due_date && 
      new Date(t.due_date) < now && 
      t.status !== 'completed' && 
      t.status !== 'cancelled'
    ).length,
    due_today: allTasks.filter(t => 
      t.due_date && 
      new Date(t.due_date) >= today && 
      new Date(t.due_date) < endOfToday &&
      t.status !== 'completed' && 
      t.status !== 'cancelled'
    ).length,
    due_this_week: allTasks.filter(t => 
      t.due_date && 
      new Date(t.due_date) >= now && 
      new Date(t.due_date) < endOfWeek &&
      t.status !== 'completed' && 
      t.status !== 'cancelled'
    ).length,
    starred: allTasks.filter(t => t.is_starred).length,
  }

  return stats
}
