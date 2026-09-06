-- ============================================================================
-- TASK & CALENDAR MANAGEMENT SYSTEM - DATABASE SCHEMA
-- ============================================================================
-- This schema provides comprehensive task management, calendar events,
-- recurring patterns, reminders, tags, and time tracking capabilities.
-- ============================================================================

-- ============================================================================
-- TASK LISTS (Projects/Categories for Tasks)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.task_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6', -- Hex color for UI
  icon TEXT, -- Icon name/emoji
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS task_lists_user_id_idx ON public.task_lists(user_id);
CREATE INDEX IF NOT EXISTS task_lists_sort_order_idx ON public.task_lists(sort_order);

-- ============================================================================
-- RECURRENCE PATTERNS (Created before tasks/events that reference it)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.recurrence_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Pattern type: daily, weekly, monthly, yearly, custom
  frequency TEXT CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')) NOT NULL,
  interval INTEGER DEFAULT 1, -- Every X days/weeks/months/years
  
  -- Days of week (for weekly): 0=Sunday, 1=Monday, etc.
  days_of_week INTEGER[], -- e.g., [1,3,5] for Mon, Wed, Fri
  
  -- Day of month (for monthly): 1-31
  day_of_month INTEGER,
  
  -- Month of year (for yearly): 1-12
  month_of_year INTEGER,
  
  -- End conditions
  end_date TIMESTAMP WITH TIME ZONE,
  occurrence_count INTEGER, -- End after X occurrences
  
  -- Timezone
  timezone TEXT DEFAULT 'UTC',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS recurrence_patterns_user_id_idx ON public.recurrence_patterns(user_id);

-- ============================================================================
-- TASKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task_list_id UUID REFERENCES public.task_lists(id) ON DELETE SET NULL,
  note_id UUID REFERENCES public.notes(id) ON DELETE SET NULL, -- Link to notes
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- Link to projects
  
  -- Task details
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  status TEXT CHECK (status IN ('todo', 'in_progress', 'waiting', 'completed', 'cancelled')) DEFAULT 'todo',
  
  -- Dates & time
  due_date TIMESTAMP WITH TIME ZONE,
  start_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Recurrence
  recurrence_pattern_id UUID REFERENCES public.recurrence_patterns(id) ON DELETE SET NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE, -- For recurring task instances
  
  -- Organization
  sort_order INTEGER DEFAULT 0,
  
  -- Time tracking
  estimated_minutes INTEGER, -- Estimated time to complete
  actual_minutes INTEGER, -- Actual time spent
  
  -- Flags
  is_starred BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_task_list_id_idx ON public.tasks(task_list_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS tasks_priority_idx ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS tasks_note_id_idx ON public.tasks(note_id);
CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON public.tasks(project_id);

-- ============================================================================
-- CALENDAR EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE, -- Optional link to task
  note_id UUID REFERENCES public.notes(id) ON DELETE SET NULL, -- Optional link to note
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- Optional link to project
  
  -- Event details
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  
  -- Time
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  is_all_day BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'UTC',
  
  -- Recurrence
  recurrence_pattern_id UUID REFERENCES public.recurrence_patterns(id) ON DELETE SET NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  parent_event_id UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  
  -- Categorization
  category TEXT, -- Meeting, Deadline, Personal, etc.
  color TEXT DEFAULT '#3B82F6',
  
  -- Attendees & collaboration
  attendees JSONB, -- Array of {name, email, status}
  
  -- Meeting links
  meeting_url TEXT,
  meeting_platform TEXT, -- Zoom, Meet, Teams, etc.
  
  -- Flags
  is_cancelled BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS calendar_events_user_id_idx ON public.calendar_events(user_id);
CREATE INDEX IF NOT EXISTS calendar_events_start_time_idx ON public.calendar_events(start_time);
CREATE INDEX IF NOT EXISTS calendar_events_end_time_idx ON public.calendar_events(end_time);
CREATE INDEX IF NOT EXISTS calendar_events_task_id_idx ON public.calendar_events(task_id);

-- ============================================================================
-- TAGS (for both tasks and events)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS tags_user_id_idx ON public.tags(user_id);

-- ============================================================================
-- TASK TAGS (Many-to-Many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.task_tags (
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  PRIMARY KEY (task_id, tag_id)
);

CREATE INDEX IF NOT EXISTS task_tags_task_id_idx ON public.task_tags(task_id);
CREATE INDEX IF NOT EXISTS task_tags_tag_id_idx ON public.task_tags(tag_id);

-- ============================================================================
-- EVENT TAGS (Many-to-Many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.event_tags (
  event_id UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE NOT NULL,
  tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  PRIMARY KEY (event_id, tag_id)
);

CREATE INDEX IF NOT EXISTS event_tags_event_id_idx ON public.event_tags(event_id);
CREATE INDEX IF NOT EXISTS event_tags_tag_id_idx ON public.event_tags(tag_id);

-- ============================================================================
-- REMINDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  
  -- Reminder time
  remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Notification preferences
  notification_type TEXT CHECK (notification_type IN ('app', 'email', 'both')) DEFAULT 'app',
  is_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Custom message
  message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  CONSTRAINT reminder_target CHECK (
    (task_id IS NOT NULL AND event_id IS NULL) OR 
    (task_id IS NULL AND event_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS reminders_user_id_idx ON public.reminders(user_id);
CREATE INDEX IF NOT EXISTS reminders_remind_at_idx ON public.reminders(remind_at);
CREATE INDEX IF NOT EXISTS reminders_is_sent_idx ON public.reminders(is_sent);

-- ============================================================================
-- TIME TRACKING ENTRIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.time_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  
  -- Time tracking
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER, -- Calculated or manual
  
  -- Notes about the work
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS time_entries_user_id_idx ON public.time_entries(user_id);
CREATE INDEX IF NOT EXISTS time_entries_task_id_idx ON public.time_entries(task_id);
CREATE INDEX IF NOT EXISTS time_entries_started_at_idx ON public.time_entries(started_at);

-- ============================================================================
-- SUBTASKS (Task Hierarchy)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subtasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS subtasks_parent_task_id_idx ON public.subtasks(parent_task_id);
CREATE INDEX IF NOT EXISTS subtasks_user_id_idx ON public.subtasks(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Task Lists
ALTER TABLE public.task_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own task lists"
  ON public.task_lists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own task lists"
  ON public.task_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own task lists"
  ON public.task_lists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own task lists"
  ON public.task_lists FOR DELETE
  USING (auth.uid() = user_id);

-- Tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tasks"
  ON public.tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks"
  ON public.tasks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks"
  ON public.tasks FOR DELETE
  USING (auth.uid() = user_id);

-- Recurrence Patterns
ALTER TABLE public.recurrence_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recurrence patterns"
  ON public.recurrence_patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own recurrence patterns"
  ON public.recurrence_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurrence patterns"
  ON public.recurrence_patterns FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurrence patterns"
  ON public.recurrence_patterns FOR DELETE
  USING (auth.uid() = user_id);

-- Calendar Events
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own calendar events"
  ON public.calendar_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own calendar events"
  ON public.calendar_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calendar events"
  ON public.calendar_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calendar events"
  ON public.calendar_events FOR DELETE
  USING (auth.uid() = user_id);

-- Tags
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tags"
  ON public.tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tags"
  ON public.tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags"
  ON public.tags FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags"
  ON public.tags FOR DELETE
  USING (auth.uid() = user_id);

-- Task Tags
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own task tags"
  ON public.task_tags FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = auth.uid()));

CREATE POLICY "Users can create their own task tags"
  ON public.task_tags FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = auth.uid()));

CREATE POLICY "Users can delete their own task tags"
  ON public.task_tags FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.tasks WHERE tasks.id = task_tags.task_id AND tasks.user_id = auth.uid()));

-- Event Tags
ALTER TABLE public.event_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own event tags"
  ON public.event_tags FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.calendar_events WHERE calendar_events.id = event_tags.event_id AND calendar_events.user_id = auth.uid()));

CREATE POLICY "Users can create their own event tags"
  ON public.event_tags FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.calendar_events WHERE calendar_events.id = event_tags.event_id AND calendar_events.user_id = auth.uid()));

CREATE POLICY "Users can delete their own event tags"
  ON public.event_tags FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.calendar_events WHERE calendar_events.id = event_tags.event_id AND calendar_events.user_id = auth.uid()));

-- Reminders
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reminders"
  ON public.reminders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reminders"
  ON public.reminders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reminders"
  ON public.reminders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reminders"
  ON public.reminders FOR DELETE
  USING (auth.uid() = user_id);

-- Time Entries
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own time entries"
  ON public.time_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own time entries"
  ON public.time_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own time entries"
  ON public.time_entries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own time entries"
  ON public.time_entries FOR DELETE
  USING (auth.uid() = user_id);

-- Subtasks
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subtasks"
  ON public.subtasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own subtasks"
  ON public.subtasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subtasks"
  ON public.subtasks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subtasks"
  ON public.subtasks FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- ============================================================================

-- Task Lists
CREATE TRIGGER set_task_lists_updated_at
  BEFORE UPDATE ON public.task_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Tasks
CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Calendar Events
CREATE TRIGGER set_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Subtasks
CREATE TRIGGER set_subtasks_updated_at
  BEFORE UPDATE ON public.subtasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get task completion percentage (based on subtasks)
CREATE OR REPLACE FUNCTION get_task_completion_percentage(task_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  total_count INTEGER;
  completed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count
  FROM public.subtasks
  WHERE parent_task_id = task_uuid;
  
  IF total_count = 0 THEN
    RETURN 0;
  END IF;
  
  SELECT COUNT(*) INTO completed_count
  FROM public.subtasks
  WHERE parent_task_id = task_uuid AND is_completed = TRUE;
  
  RETURN (completed_count * 100 / total_count);
END;
$$ LANGUAGE plpgsql;

-- Function to get overdue tasks count
CREATE OR REPLACE FUNCTION get_overdue_tasks_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM public.tasks
    WHERE user_id = user_uuid
      AND status != 'completed'
      AND status != 'cancelled'
      AND due_date < NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get upcoming tasks (next 7 days)
CREATE OR REPLACE FUNCTION get_upcoming_tasks_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM public.tasks
    WHERE user_id = user_uuid
      AND status != 'completed'
      AND status != 'cancelled'
      AND due_date >= NOW()
      AND due_date <= NOW() + INTERVAL '7 days'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA (Optional - Create default task list)
-- ============================================================================

-- This would be run per-user after they sign up
-- INSERT INTO public.task_lists (user_id, name, description, is_default, color, icon)
-- VALUES (auth.uid(), 'My Tasks', 'Default task list', TRUE, '#3B82F6', '📝');

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. Run this schema in your Supabase SQL Editor
-- 2. The handle_updated_at() function should already exist from notes schema
-- 3. All tables have RLS enabled for security
-- 4. Supports rich task management, calendar events, time tracking, and more
-- 5. Ready for real-time subscriptions
-- ============================================================================
