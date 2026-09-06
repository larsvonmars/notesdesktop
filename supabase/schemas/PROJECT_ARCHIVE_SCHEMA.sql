-- ============================================================================
-- Project Archive
-- Adds soft-delete ("archive") support to projects.
--
-- Archived projects are hidden from the active workspace but their folders and
-- notes stay intact (folders.project_id / notes.project_id still reference the
-- archived project). Restoring the project brings everything back.
-- ============================================================================

-- Add archived_at column (NULL = active project, non-NULL = archived)
alter table public.projects
  add column if not exists archived_at timestamp with time zone;

-- Index for filtering active vs archived per user
create index if not exists projects_user_archived_idx
  on public.projects (user_id, archived_at);
