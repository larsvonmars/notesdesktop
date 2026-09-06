-- PROJECT_DASHBOARD_SCHEMA.sql
-- Adds quick_links JSONB column to the projects table for storing
-- user-defined bookmarks / quick-access links per project.
--
-- Each element in the array has the shape:
--   { "id": "<uuid>", "label": "<string>", "url": "<string>", "icon": "<string|null>" }

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS quick_links JSONB DEFAULT '[]'::jsonb;

-- Optional: validate the shape with a CHECK constraint
-- ALTER TABLE projects
--   ADD CONSTRAINT quick_links_is_array CHECK (jsonb_typeof(quick_links) = 'array');
