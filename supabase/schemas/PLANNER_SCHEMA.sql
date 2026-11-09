-- ============================================================================
-- PLANNER SCHEMA — Smart planner, completion learning & learned preferences
-- ============================================================================
-- Optional companion to TASK_CALENDAR_SCHEMA.sql. The planner degrades to a
-- device-local store when these tables are missing, so applying this migration
-- is what enables cross-device plans and adaptive learning.
-- ============================================================================

-- ============================================================================
-- PLANS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  title TEXT NOT NULL,
  scope TEXT CHECK (scope IN ('today', 'tomorrow', 'this_week', 'this_weekend', 'custom')) NOT NULL,
  scope_start TIMESTAMP WITH TIME ZONE NOT NULL,
  scope_end TIMESTAMP WITH TIME ZONE NOT NULL,

  availability_start TEXT NOT NULL DEFAULT '09:00', -- HH:MM
  availability_end TEXT NOT NULL DEFAULT '17:00',
  break_minutes INTEGER NOT NULL DEFAULT 5,

  status TEXT CHECK (status IN ('draft', 'active', 'completed', 'discarded')) DEFAULT 'active',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS plans_user_id_idx ON public.plans(user_id);
CREATE INDEX IF NOT EXISTS plans_status_idx ON public.plans(status);
CREATE INDEX IF NOT EXISTS plans_scope_start_idx ON public.plans(scope_start);

-- ============================================================================
-- PLAN ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.plan_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID REFERENCES public.plans(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,

  task_title TEXT NOT NULL, -- snapshot at plan time
  task_priority TEXT CHECK (task_priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',

  scheduled_start TIMESTAMP WITH TIME ZONE,
  scheduled_end TIMESTAMP WITH TIME ZONE,

  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT CHECK (status IN ('pending', 'completed', 'skipped')) DEFAULT 'pending',
  estimated_minutes INTEGER,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS plan_items_plan_id_idx ON public.plan_items(plan_id);
CREATE INDEX IF NOT EXISTS plan_items_task_id_idx ON public.plan_items(task_id);
CREATE INDEX IF NOT EXISTS plan_items_sort_order_idx ON public.plan_items(plan_id, sort_order);

-- ============================================================================
-- COMPLETION HISTORY (adaptive learning input)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.task_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  plan_item_id UUID REFERENCES public.plan_items(id) ON DELETE SET NULL,

  completed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  actual_minutes INTEGER,
  estimated_minutes INTEGER,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  hour_of_day INTEGER CHECK (hour_of_day BETWEEN 0 AND 23),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  labels TEXT[] DEFAULT '{}',
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS task_completions_user_id_idx ON public.task_completions(user_id);
CREATE INDEX IF NOT EXISTS task_completions_completed_at_idx ON public.task_completions(completed_at);
CREATE INDEX IF NOT EXISTS task_completions_task_id_idx ON public.task_completions(task_id);

-- ============================================================================
-- LEARNED SCHEDULING PREFERENCES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_scheduling_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  peak_start_hour INTEGER DEFAULT 9,
  peak_end_hour INTEGER DEFAULT 12,
  avg_estimation_accuracy NUMERIC DEFAULT 1.0, -- actual / estimated
  preferred_break_minutes INTEGER DEFAULT 5,
  avg_tasks_per_day NUMERIC DEFAULT 4,
  total_completions INTEGER DEFAULT 0,

  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS user_scheduling_preferences_user_id_idx
  ON public.user_scheduling_preferences(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_scheduling_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own plans" ON public.plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own plan items" ON public.plan_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Users manage own completions" ON public.task_completions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own scheduling preferences" ON public.user_scheduling_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.touch_planner_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plans_touch_updated_at ON public.plans;
CREATE TRIGGER plans_touch_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_planner_updated_at();
