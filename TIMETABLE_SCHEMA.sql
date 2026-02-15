-- ============================================================================
-- TIMETABLE FEATURE - DATABASE ADDITIONS
-- ============================================================================
-- The timetable feature uses the existing calendar_events and recurrence_patterns
-- tables. Timetable entries are identified by category = 'timetable'.
-- No new tables are needed - only additional indexes for performance.
-- ============================================================================

-- Index for fast timetable event filtering
CREATE INDEX IF NOT EXISTS calendar_events_category_idx 
  ON public.calendar_events(category, user_id);

-- Index for looking up events by project
CREATE INDEX IF NOT EXISTS calendar_events_project_id_idx 
  ON public.calendar_events(project_id);

-- ============================================================================
-- HOW IT WORKS
-- ============================================================================
-- 
-- 1. A timetable entry is a calendar_event with:
--    - category = 'timetable'
--    - is_recurring = true
--    - recurrence_pattern_id -> recurrence_patterns (frequency = 'weekly')
--    - parent_event_id IS NULL (it's a template, not an instance)
--    - project_id -> projects (optional, for linking classes to course projects)
--
-- 2. The recurrence_pattern stores:
--    - frequency = 'weekly'
--    - interval = 1
--    - days_of_week = [1, 3, 5] (e.g., Mon, Wed, Fri)
--
-- 3. Weekly instances are generated ON-DEMAND in the frontend
--    using generateTimetableInstances() from lib/events.ts.
--    They are NOT stored as separate rows - this avoids
--    infinite storage growth for indefinitely repeating schedules.
--
-- 4. The start_time and end_time on the parent event store
--    the TIME portion only (the date portion is a reference date).
--    Instance generation copies only hours/minutes to the target dates.
--
-- ============================================================================
-- EXAMPLE TIMETABLE ENTRY
-- ============================================================================
-- 
-- INSERT INTO recurrence_patterns (user_id, frequency, interval, days_of_week)
-- VALUES ('user-uuid', 'weekly', 1, ARRAY[1, 3, 5]);
--
-- INSERT INTO calendar_events (
--   user_id, title, start_time, end_time,
--   category, is_recurring, recurrence_pattern_id, project_id
-- ) VALUES (
--   'user-uuid', 'Calculus 101',
--   '2026-02-16T10:00:00Z', '2026-02-16T11:30:00Z',
--   'timetable', true, 'pattern-uuid', 'math-project-uuid'
-- );
