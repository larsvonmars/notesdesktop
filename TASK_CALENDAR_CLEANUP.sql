-- ============================================================================
-- CLEANUP SCRIPT - Run this FIRST if you've already tried to create the tables
-- ============================================================================

-- Drop all tables in reverse dependency order
DROP TABLE IF EXISTS public.subtasks CASCADE;
DROP TABLE IF EXISTS public.time_entries CASCADE;
DROP TABLE IF EXISTS public.reminders CASCADE;
DROP TABLE IF EXISTS public.event_tags CASCADE;
DROP TABLE IF EXISTS public.task_tags CASCADE;
DROP TABLE IF EXISTS public.tags CASCADE;
DROP TABLE IF EXISTS public.calendar_events CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.recurrence_patterns CASCADE;
DROP TABLE IF EXISTS public.task_lists CASCADE;

-- Drop helper functions
DROP FUNCTION IF EXISTS get_task_completion_percentage(UUID);
DROP FUNCTION IF EXISTS get_overdue_tasks_count(UUID);
DROP FUNCTION IF EXISTS get_upcoming_tasks_count(UUID);

-- ============================================================================
-- After running this, run TASK_CALENDAR_SCHEMA.sql
-- ============================================================================
