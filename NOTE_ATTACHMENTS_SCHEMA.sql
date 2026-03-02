-- =============================================================
-- Note Attachments Schema (Images / Files)
-- =============================================================
-- Run this in your Supabase SQL Editor.
-- Creates attachment metadata table for note-linked storage objects.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.note_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'file')),
  storage_path TEXT NOT NULL,
  url TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  source_type TEXT NOT NULL DEFAULT 'insert' CHECK (source_type IN ('insert', 'paste', 'drop', 'migration')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS note_attachments_note_id_idx ON public.note_attachments(note_id);
CREATE INDEX IF NOT EXISTS note_attachments_user_id_idx ON public.note_attachments(user_id);
CREATE INDEX IF NOT EXISTS note_attachments_storage_path_idx ON public.note_attachments(storage_path);

ALTER TABLE public.note_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own note attachments"
  ON public.note_attachments
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own note attachments"
  ON public.note_attachments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own note attachments"
  ON public.note_attachments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own note attachments"
  ON public.note_attachments
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_note_attachments_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_note_attachments_updated_at ON public.note_attachments;
CREATE TRIGGER trg_note_attachments_updated_at
  BEFORE UPDATE ON public.note_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_note_attachments_updated_at();
