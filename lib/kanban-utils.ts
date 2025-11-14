import { supabase } from './supabase';
import { addTaskToBoard, initializeDefaultBoard } from './kanban';
import { getTasks } from './tasks';

/**
 * Utility function to add all existing tasks to the default Kanban board
 * This is useful for migrating existing tasks to the Kanban system
 */
export async function addAllTasksToDefaultBoard(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get or create default board
  const board = await initializeDefaultBoard();
  
  if (!board || board.columns.length === 0) {
    throw new Error('No board columns found');
  }

  // Get all tasks
  const tasks = await getTasks();

  // Get tasks already on the board
  const { data: existingPositions } = await supabase
    .from('kanban_task_positions')
    .select('task_id')
    .eq('board_id', board.id);

  const existingTaskIds = new Set(existingPositions?.map(p => p.task_id) || []);

  // Find appropriate column for each task based on status
  const statusToColumnMap: Record<string, number> = {};
  board.columns.forEach((col, index) => {
    if (col.status_mapping) {
      statusToColumnMap[col.status_mapping] = index;
    }
  });

  // Add tasks that aren't already on the board
  let addedCount = 0;
  for (const task of tasks) {
    if (existingTaskIds.has(task.id)) {
      continue; // Skip tasks already on board
    }

    // Find the right column based on task status
    const columnIndex = statusToColumnMap[task.status] ?? 0; // Default to first column
    const column = board.columns[columnIndex];

    try {
      await addTaskToBoard(task.id, board.id, column.id);
      addedCount++;
    } catch (error) {
      console.error(`Failed to add task ${task.id} to board:`, error);
    }
  }

  console.log(`Added ${addedCount} tasks to Kanban board`);
}

/**
 * Add a specific list of tasks to the default board
 */
export async function addTasksToBoard(taskIds: string[]): Promise<void> {
  const board = await initializeDefaultBoard();
  
  if (!board || board.columns.length === 0) {
    throw new Error('No board columns found');
  }

  // Add to first column by default
  const firstColumn = board.columns[0];

  for (const taskId of taskIds) {
    try {
      await addTaskToBoard(taskId, board.id, firstColumn.id);
    } catch (error) {
      console.error(`Failed to add task ${taskId} to board:`, error);
    }
  }
}
