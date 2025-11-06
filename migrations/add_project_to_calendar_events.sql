-- Add project_id column to calendar_events table
-- This allows calendar events to be linked to specific projects

-- Add the column
ALTER TABLE public.calendar_events
ADD COLUMN IF NOT EXISTS project_id uuid;

-- Add foreign key constraint
ALTER TABLE public.calendar_events
ADD CONSTRAINT calendar_events_project_id_fkey 
FOREIGN KEY (project_id) 
REFERENCES public.projects(id) 
ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_calendar_events_project_id 
ON public.calendar_events(project_id);

-- Add comment
COMMENT ON COLUMN public.calendar_events.project_id IS 'Optional reference to a project that this event belongs to';
