-- ============================================================================
-- TASK & CALENDAR ENHANCEMENTS - Additional Features
-- ============================================================================
-- This adds enhanced task details (links, colors, attachments) and Kanban boards
-- Run this AFTER TASK_CALENDAR_SCHEMA.sql
-- ============================================================================

-- ============================================================================
-- Add enhanced columns to tasks table
-- ============================================================================

-- Links and URLs
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS links JSONB DEFAULT '[]'; -- Array of {url, title, description}

-- Custom color per task
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS color TEXT;

-- Cover image
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS cover_image TEXT; -- URL to image

-- Attachments
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'; -- Array of {name, url, size, type}

-- Custom fields (flexible metadata)
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'; -- {field_name: value}

-- Progress percentage (0-100)
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);

-- Labels (quick visual tags)
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT '{}'; -- Array of label names

COMMENT ON COLUMN public.tasks.links IS 'Array of link objects: [{url, title, description}]';
COMMENT ON COLUMN public.tasks.attachments IS 'Array of attachment objects: [{name, url, size, type, uploaded_at}]';
COMMENT ON COLUMN public.tasks.custom_fields IS 'Flexible key-value pairs for custom metadata';

-- ============================================================================
-- KANBAN BOARDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kanban_boards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task_list_id UUID REFERENCES public.task_lists(id) ON DELETE CASCADE, -- Optional: board per list
  
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  icon TEXT,
  
  -- View settings
  is_default BOOLEAN DEFAULT FALSE,
  view_settings JSONB DEFAULT '{}', -- {groupBy, sortBy, filters, etc.}
  
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS kanban_boards_user_id_idx ON public.kanban_boards(user_id);
CREATE INDEX IF NOT EXISTS kanban_boards_task_list_id_idx ON public.kanban_boards(task_list_id);

-- ============================================================================
-- KANBAN COLUMNS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kanban_columns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  board_id UUID REFERENCES public.kanban_boards(id) ON DELETE CASCADE NOT NULL,
  
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  
  -- Maps to task status or custom
  status_mapping TEXT, -- 'todo', 'in_progress', 'completed', or null for custom
  
  -- Column limits (WIP limit)
  task_limit INTEGER, -- Max tasks in this column
  
  -- Ordering
  sort_order INTEGER DEFAULT 0,
  
  -- Auto-rules
  auto_assign_status TEXT, -- When task moves to this column, set this status
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS kanban_columns_board_id_idx ON public.kanban_columns(board_id);
CREATE INDEX IF NOT EXISTS kanban_columns_user_id_idx ON public.kanban_columns(user_id);

-- ============================================================================
-- KANBAN TASK POSITIONS (Track position within columns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kanban_task_positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  column_id UUID REFERENCES public.kanban_columns(id) ON DELETE CASCADE NOT NULL,
  board_id UUID REFERENCES public.kanban_boards(id) ON DELETE CASCADE NOT NULL,
  
  sort_position INTEGER NOT NULL, -- 0-based position in column (renamed from 'position' which is a reserved word)
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  UNIQUE(task_id, board_id) -- Task can only be in one column per board
);

CREATE INDEX IF NOT EXISTS kanban_task_positions_board_id_idx ON public.kanban_task_positions(board_id);
CREATE INDEX IF NOT EXISTS kanban_task_positions_column_id_idx ON public.kanban_task_positions(column_id);
CREATE INDEX IF NOT EXISTS kanban_task_positions_task_id_idx ON public.kanban_task_positions(task_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Kanban Boards
ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own kanban boards"
  ON public.kanban_boards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own kanban boards"
  ON public.kanban_boards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own kanban boards"
  ON public.kanban_boards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own kanban boards"
  ON public.kanban_boards FOR DELETE
  USING (auth.uid() = user_id);

-- Kanban Columns
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own kanban columns"
  ON public.kanban_columns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own kanban columns"
  ON public.kanban_columns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own kanban columns"
  ON public.kanban_columns FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own kanban columns"
  ON public.kanban_columns FOR DELETE
  USING (auth.uid() = user_id);

-- Kanban Task Positions
ALTER TABLE public.kanban_task_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own kanban task positions"
  ON public.kanban_task_positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own kanban task positions"
  ON public.kanban_task_positions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own kanban task positions"
  ON public.kanban_task_positions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own kanban task positions"
  ON public.kanban_task_positions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- ============================================================================

CREATE TRIGGER set_kanban_boards_updated_at
  BEFORE UPDATE ON public.kanban_boards
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_kanban_columns_updated_at
  BEFORE UPDATE ON public.kanban_columns
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_kanban_task_positions_updated_at
  BEFORE UPDATE ON public.kanban_task_positions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get tasks in a column ordered by position
CREATE OR REPLACE FUNCTION get_column_tasks(column_uuid UUID)
RETURNS TABLE (
  task_id UUID,
  sort_position INTEGER,
  title TEXT,
  priority TEXT,
  due_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    ktp.sort_position,
    t.title,
    t.priority,
    t.due_date
  FROM public.tasks t
  JOIN public.kanban_task_positions ktp ON t.id = ktp.task_id
  WHERE ktp.column_id = column_uuid
  ORDER BY ktp.sort_position ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to move task to new column
CREATE OR REPLACE FUNCTION move_task_to_column(
  task_uuid UUID,
  new_column_uuid UUID,
  board_uuid UUID,
  new_position INTEGER,
  user_uuid UUID
)
RETURNS VOID AS $$
DECLARE
  old_column_uuid UUID;
  old_position INTEGER;
BEGIN
  -- Get current position
  SELECT column_id, sort_position INTO old_column_uuid, old_position
  FROM public.kanban_task_positions
  WHERE task_id = task_uuid AND board_id = board_uuid;
  
  -- If task exists in a column, update positions in old column
  IF old_column_uuid IS NOT NULL THEN
    UPDATE public.kanban_task_positions
    SET sort_position = sort_position - 1
    WHERE column_id = old_column_uuid 
      AND board_id = board_uuid
      AND sort_position > old_position;
  END IF;
  
  -- Update positions in new column
  UPDATE public.kanban_task_positions
  SET sort_position = sort_position + 1
  WHERE column_id = new_column_uuid 
    AND board_id = board_uuid
    AND sort_position >= new_position;
  
  -- Insert or update task position
  INSERT INTO public.kanban_task_positions (user_id, task_id, column_id, board_id, sort_position)
  VALUES (user_uuid, task_uuid, new_column_uuid, board_uuid, new_position)
  ON CONFLICT (task_id, board_id)
  DO UPDATE SET 
    column_id = new_column_uuid,
    sort_position = new_position,
    updated_at = NOW();
    
  -- Update task status if column has auto-assign
  UPDATE public.tasks t
  SET status = kc.auto_assign_status
  FROM public.kanban_columns kc
  WHERE t.id = task_uuid 
    AND kc.id = new_column_uuid
    AND kc.auto_assign_status IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA - Create default Kanban board with standard columns
-- ============================================================================

-- This creates a default board for a user (run after sign up or manually)
/*
DO $$
DECLARE
  board_uuid UUID;
  col_todo UUID;
  col_progress UUID;
  col_review UUID;
  col_done UUID;
BEGIN
  -- Create default board
  INSERT INTO public.kanban_boards (user_id, name, description, is_default, color, icon)
  VALUES (auth.uid(), 'My Board', 'Default kanban board', TRUE, '#3B82F6', '📋')
  RETURNING id INTO board_uuid;
  
  -- Create To Do column
  INSERT INTO public.kanban_columns (user_id, board_id, name, color, status_mapping, auto_assign_status, sort_order)
  VALUES (auth.uid(), board_uuid, 'To Do', '#64748B', 'todo', 'todo', 0)
  RETURNING id INTO col_todo;
  
  -- Create In Progress column
  INSERT INTO public.kanban_columns (user_id, board_id, name, color, status_mapping, auto_assign_status, sort_order)
  VALUES (auth.uid(), board_uuid, 'In Progress', '#3B82F6', 'in_progress', 'in_progress', 1)
  RETURNING id INTO col_progress;
  
  -- Create Review column
  INSERT INTO public.kanban_columns (user_id, board_id, name, color, status_mapping, auto_assign_status, sort_order)
  VALUES (auth.uid(), board_uuid, 'Review', '#F59E0B', 'waiting', 'waiting', 2)
  RETURNING id INTO col_review;
  
  -- Create Done column
  INSERT INTO public.kanban_columns (user_id, board_id, name, color, status_mapping, auto_assign_status, sort_order)
  VALUES (auth.uid(), board_uuid, 'Done', '#10B981', 'completed', 'completed', 3)
  RETURNING id INTO col_done;
END $$;
*/

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. Run this AFTER TASK_CALENDAR_SCHEMA.sql
-- 2. Adds enhanced task fields (links, colors, attachments, etc.)
-- 3. Adds Kanban board system with columns and task positions
-- 4. Includes drag-and-drop position management
-- 5. Auto-updates task status when moved between columns
-- ============================================================================
