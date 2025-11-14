import { supabase } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface KanbanBoard {
  id: string;
  user_id: string;
  task_list_id?: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  is_default: boolean;
  view_settings?: Record<string, any>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface KanbanColumn {
  id: string;
  user_id: string;
  board_id: string;
  name: string;
  color: string;
  status_mapping?: string;
  task_limit?: number;
  sort_order: number;
  auto_assign_status?: string;
  created_at: string;
  updated_at: string;
}

export interface KanbanTaskPosition {
  id: string;
  user_id: string;
  task_id: string;
  column_id: string;
  board_id: string;
  sort_position: number;
  updated_at: string;
}

export interface BoardWithColumns extends KanbanBoard {
  columns: KanbanColumn[];
}

// ============================================================================
// KANBAN BOARDS
// ============================================================================

export async function getBoards(): Promise<KanbanBoard[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('kanban_boards')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getBoard(boardId: string): Promise<BoardWithColumns | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: board, error: boardError } = await supabase
    .from('kanban_boards')
    .select('*')
    .eq('id', boardId)
    .single();

  if (boardError) throw boardError;
  if (!board) return null;

  const { data: columns, error: columnsError } = await supabase
    .from('kanban_columns')
    .select('*')
    .eq('board_id', boardId)
    .order('sort_order', { ascending: true });

  if (columnsError) throw columnsError;

  return {
    ...board,
    columns: columns || []
  };
}

export async function getDefaultBoard(): Promise<BoardWithColumns | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: board, error: boardError } = await supabase
    .from('kanban_boards')
    .select('*')
    .eq('is_default', true)
    .single();

  if (boardError || !board) {
    // No default board, return null
    return null;
  }

  const { data: columns, error: columnsError } = await supabase
    .from('kanban_columns')
    .select('*')
    .eq('board_id', board.id)
    .order('sort_order', { ascending: true});

  if (columnsError) throw columnsError;

  return {
    ...board,
    columns: columns || []
  };
}

export async function createBoard(
  name: string,
  options?: {
    description?: string;
    color?: string;
    icon?: string;
    task_list_id?: string;
    is_default?: boolean;
  }
): Promise<KanbanBoard> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('kanban_boards')
    .insert({
      user_id: user.id,
      name,
      description: options?.description,
      color: options?.color || '#3B82F6',
      icon: options?.icon,
      task_list_id: options?.task_list_id,
      is_default: options?.is_default || false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBoard(
  boardId: string,
  updates: Partial<Omit<KanbanBoard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<KanbanBoard> {
  const { data, error } = await supabase
    .from('kanban_boards')
    .update(updates)
    .eq('id', boardId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBoard(boardId: string): Promise<void> {
  const { error } = await supabase
    .from('kanban_boards')
    .delete()
    .eq('id', boardId);

  if (error) throw error;
}

// ============================================================================
// KANBAN COLUMNS
// ============================================================================

export async function getColumns(boardId: string): Promise<KanbanColumn[]> {
  const { data, error } = await supabase
    .from('kanban_columns')
    .select('*')
    .eq('board_id', boardId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createColumn(
  boardId: string,
  name: string,
  options?: {
    color?: string;
    status_mapping?: string;
    task_limit?: number;
    auto_assign_status?: string;
    sort_order?: number;
  }
): Promise<KanbanColumn> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('kanban_columns')
    .insert({
      user_id: user.id,
      board_id: boardId,
      name,
      color: options?.color || '#6B7280',
      status_mapping: options?.status_mapping,
      task_limit: options?.task_limit,
      auto_assign_status: options?.auto_assign_status,
      sort_order: options?.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateColumn(
  columnId: string,
  updates: Partial<Omit<KanbanColumn, 'id' | 'user_id' | 'board_id' | 'created_at' | 'updated_at'>>
): Promise<KanbanColumn> {
  const { data, error } = await supabase
    .from('kanban_columns')
    .update(updates)
    .eq('id', columnId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteColumn(columnId: string): Promise<void> {
  const { error } = await supabase
    .from('kanban_columns')
    .delete()
    .eq('id', columnId);

  if (error) throw error;
}

export async function reorderColumns(boardId: string, columnIds: string[]): Promise<void> {
  // Update sort_order for each column
  const updates = columnIds.map((id, index) => 
    supabase
      .from('kanban_columns')
      .update({ sort_order: index })
      .eq('id', id)
  );

  await Promise.all(updates);
}

// ============================================================================
// TASK POSITIONS
// ============================================================================

export async function getTaskPositions(boardId: string): Promise<KanbanTaskPosition[]> {
  const { data, error } = await supabase
    .from('kanban_task_positions')
    .select('*')
    .eq('board_id', boardId)
    .order('sort_position', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getColumnTaskPositions(columnId: string): Promise<KanbanTaskPosition[]> {
  const { data, error } = await supabase
    .from('kanban_task_positions')
    .select('*')
    .eq('column_id', columnId)
    .order('sort_position', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function moveTask(
  taskId: string,
  boardId: string,
  newColumnId: string,
  newPosition: number
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Use the database function for proper position management
  const { error } = await supabase.rpc('move_task_to_column', {
    task_uuid: taskId,
    new_column_uuid: newColumnId,
    board_uuid: boardId,
    new_position: newPosition,
    user_uuid: user.id
  });

  if (error) throw error;
}

export async function addTaskToBoard(
  taskId: string,
  boardId: string,
  columnId: string,
  position?: number
): Promise<KanbanTaskPosition> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get current max position in column if position not provided
  let finalPosition = position;
  if (finalPosition === undefined) {
    const { data: positions } = await supabase
      .from('kanban_task_positions')
      .select('sort_position')
      .eq('column_id', columnId)
      .order('sort_position', { ascending: false })
      .limit(1);
    
    finalPosition = positions && positions.length > 0 ? positions[0].sort_position + 1 : 0;
  }

  const { data, error } = await supabase
    .from('kanban_task_positions')
    .insert({
      user_id: user.id,
      task_id: taskId,
      column_id: columnId,
      board_id: boardId,
      sort_position: finalPosition,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeTaskFromBoard(taskId: string, boardId: string): Promise<void> {
  const { error } = await supabase
    .from('kanban_task_positions')
    .delete()
    .eq('task_id', taskId)
    .eq('board_id', boardId);

  if (error) throw error;
}

// ============================================================================
// BOARD INITIALIZATION
// ============================================================================

export async function initializeDefaultBoard(): Promise<BoardWithColumns> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Check if user already has a default board
  const existing = await getDefaultBoard();
  if (existing) return existing;

  // Create default board
  const board = await createBoard('My Board', {
    description: 'Default kanban board',
    is_default: true,
    color: '#3B82F6',
    icon: '📋'
  });

  // Create default columns
  const todoColumn = await createColumn(board.id, 'To Do', {
    color: '#64748B',
    status_mapping: 'todo',
    auto_assign_status: 'todo',
    sort_order: 0
  });

  const inProgressColumn = await createColumn(board.id, 'In Progress', {
    color: '#3B82F6',
    status_mapping: 'in_progress',
    auto_assign_status: 'in_progress',
    sort_order: 1
  });

  const reviewColumn = await createColumn(board.id, 'Review', {
    color: '#F59E0B',
    status_mapping: 'waiting',
    auto_assign_status: 'waiting',
    sort_order: 2
  });

  const doneColumn = await createColumn(board.id, 'Done', {
    color: '#10B981',
    status_mapping: 'completed',
    auto_assign_status: 'completed',
    sort_order: 3
  });

  return {
    ...board,
    columns: [todoColumn, inProgressColumn, reviewColumn, doneColumn]
  };
}
