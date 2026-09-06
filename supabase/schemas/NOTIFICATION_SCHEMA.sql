-- ============================================================================
-- NOTIFICATION PREFERENCES - DATABASE SCHEMA
-- ============================================================================
-- Optional: Store notification preferences server-side so they sync 
-- across devices. The frontend also stores these in localStorage as fallback.
-- ============================================================================

-- ============================================================================
-- NOTIFICATION PREFERENCES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Master toggle
  enabled BOOLEAN DEFAULT TRUE,
  
  -- Channel toggles
  native_enabled BOOLEAN DEFAULT TRUE,        -- OS-level notifications
  toast_enabled BOOLEAN DEFAULT TRUE,         -- In-app toasts
  sound_enabled BOOLEAN DEFAULT FALSE,        -- Play alert sounds
  
  -- Timing
  task_due_reminder_minutes INTEGER DEFAULT 30,  -- Minutes before due to alert
  poll_interval_seconds INTEGER DEFAULT 60,       -- How often to check
  
  -- Content filters
  notify_overdue BOOLEAN DEFAULT TRUE,        -- Alert for overdue tasks
  
  -- Quiet hours (null = disabled)
  quiet_hours_start TIME,                     -- e.g. '22:00'
  quiet_hours_end TIME,                       -- e.g. '07:00'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS notification_preferences_user_id_idx 
  ON public.notification_preferences(user_id);

-- ============================================================================
-- NOTIFICATION LOG TABLE (optional - for history/analytics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- What triggered the notification
  notification_type TEXT CHECK (notification_type IN ('reminder', 'task_due', 'task_overdue', 'info', 'warning')) NOT NULL,
  
  -- Content
  title TEXT NOT NULL,
  body TEXT,
  
  -- References
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  reminder_id UUID REFERENCES public.reminders(id) ON DELETE SET NULL,
  
  -- Delivery status
  delivered_native BOOLEAN DEFAULT FALSE,
  delivered_toast BOOLEAN DEFAULT FALSE,
  
  -- User interaction
  read_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS notification_log_user_id_idx ON public.notification_log(user_id);
CREATE INDEX IF NOT EXISTS notification_log_created_at_idx ON public.notification_log(created_at);
CREATE INDEX IF NOT EXISTS notification_log_read_at_idx ON public.notification_log(read_at);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Notification Preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notification preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Notification Log
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification log"
  ON public.notification_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notification log entries"
  ON public.notification_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification log"
  ON public.notification_log FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notification log"
  ON public.notification_log FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notification_preferences_timestamp
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();
