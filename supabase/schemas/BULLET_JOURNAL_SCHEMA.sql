-- ============================================================================
-- BULLET JOURNAL SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Signifier/bullet types for rapid logging
CREATE TYPE bullet_signifier AS ENUM (
  'task',        -- • (dot)   — something to do
  'event',       -- ○ (circle) — date-specific happening
  'note',        -- – (dash)  — fact, idea, observation
  'completed',   -- × (cross) — finished task
  'migrated',    -- > (arrow) — moved to a future date/month
  'scheduled',   -- < (arrow) — moved to a specific calendar date
  'irrelevant'   -- struck    — no longer matters
);

-- ============================================================================
-- BULLET JOURNAL ENTRIES TABLE
-- Each note of type 'bullet-journal' stores its entries here.
-- The note row in `notes` acts as a "spread" (daily, monthly, etc.).
-- ============================================================================
CREATE TABLE IF NOT EXISTS bullet_journal_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id       UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,

  -- Core rapid-logging fields
  signifier     bullet_signifier NOT NULL DEFAULT 'task',
  content       TEXT NOT NULL DEFAULT '',
  indent_level  SMALLINT NOT NULL DEFAULT 0 CHECK (indent_level >= 0 AND indent_level <= 4),
  sort_order    INTEGER NOT NULL DEFAULT 0,

  -- Date context — the date this entry "belongs to" inside the spread
  entry_date    DATE,

  -- Migration tracking
  migrated_to   UUID REFERENCES bullet_journal_entries(id) ON DELETE SET NULL,
  migrated_from UUID REFERENCES bullet_journal_entries(id) ON DELETE SET NULL,

  -- Optional link to an existing task (two-way integration)
  linked_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  -- Flags
  is_starred    BOOLEAN NOT NULL DEFAULT FALSE,
  is_priority   BOOLEAN NOT NULL DEFAULT FALSE,
  is_inspiration BOOLEAN NOT NULL DEFAULT FALSE,

  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_bj_entries_user_id     ON bullet_journal_entries(user_id);
CREATE INDEX idx_bj_entries_note_id     ON bullet_journal_entries(note_id);
CREATE INDEX idx_bj_entries_entry_date  ON bullet_journal_entries(entry_date);
CREATE INDEX idx_bj_entries_sort_order  ON bullet_journal_entries(note_id, sort_order);
CREATE INDEX idx_bj_entries_signifier   ON bullet_journal_entries(signifier);
CREATE INDEX idx_bj_entries_linked_task ON bullet_journal_entries(linked_task_id)
  WHERE linked_task_id IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE bullet_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bullet journal entries"
  ON bullet_journal_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bullet journal entries"
  ON bullet_journal_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bullet journal entries"
  ON bullet_journal_entries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bullet journal entries"
  ON bullet_journal_entries FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION update_bullet_journal_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bullet_journal_entries_updated_at
  BEFORE UPDATE ON bullet_journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_bullet_journal_entries_updated_at();
