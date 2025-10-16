# Database Migration for Mindmap Note Type

This document describes the database changes needed to support the mindmap note type.

## Overview

The mindmap note type has been added to the application. Since the existing `notes` table already stores note content as text and has a `note_type` column, no schema changes are strictly required. However, you should verify that your database accepts 'mindmap' as a valid note_type value.

## Verification Steps

### 1. Check Current Schema

Run this query in your Supabase SQL Editor to check if note_type has any constraints:

```sql
SELECT 
    column_name, 
    data_type, 
    udt_name,
    column_default
FROM information_schema.columns 
WHERE table_name = 'notes' AND column_name = 'note_type';
```

### 2. Check for Check Constraints

If there's a CHECK constraint limiting note_type values, you'll need to update it:

```sql
SELECT 
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE rel.relname = 'notes'
    AND con.contype = 'c'; -- 'c' stands for CHECK constraint
```

### 3. Update Check Constraint (if needed)

If you have a CHECK constraint like:
```sql
CHECK (note_type IN ('rich-text', 'drawing'))
```

Update it to include 'mindmap':

```sql
-- Drop the old constraint (replace 'constraint_name' with actual name)
ALTER TABLE notes DROP CONSTRAINT constraint_name;

-- Add the new constraint
ALTER TABLE notes ADD CONSTRAINT notes_note_type_check 
    CHECK (note_type IN ('rich-text', 'drawing', 'mindmap'));
```

## If No Constraint Exists

If there's no CHECK constraint (which is the recommended setup for flexibility), the database will already accept 'mindmap' as a value. No migration needed!

## Adding a Default Index (Optional)

For better performance when filtering by note type:

```sql
-- Create an index on note_type if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_notes_note_type ON notes(note_type);
```

## Testing the Migration

After making any changes, test that all note types work:

```sql
-- Test inserting each note type
INSERT INTO notes (user_id, title, content, note_type) 
VALUES 
    (auth.uid(), 'Test Rich Text', 'Test content', 'rich-text'),
    (auth.uid(), 'Test Drawing', '{"pages":[{"strokes":[]}]}', 'drawing'),
    (auth.uid(), 'Test Mindmap', '{"rootId":"root","nodes":{}}', 'mindmap');

-- Verify they were inserted
SELECT id, title, note_type FROM notes WHERE title LIKE 'Test %';

-- Clean up test data
DELETE FROM notes WHERE title LIKE 'Test %';
```

## Recommended Complete Schema

For reference, here's the recommended complete notes table schema that supports all three note types:

```sql
-- Notes table structure
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  position integer DEFAULT 0,
  note_type text DEFAULT 'rich-text',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS notes_user_id_idx ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON public.notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_folder_id_idx ON public.notes(folder_id);
CREATE INDEX IF NOT EXISTS notes_note_type_idx ON public.notes(note_type);

-- Optional: Add check constraint for note types
ALTER TABLE notes ADD CONSTRAINT notes_note_type_check 
    CHECK (note_type IN ('rich-text', 'drawing', 'mindmap'));

-- RLS policies (should already exist)
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own notes"
  ON public.notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can create their own notes"
  ON public.notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own notes"
  ON public.notes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete their own notes"
  ON public.notes FOR DELETE
  USING (auth.uid() = user_id);
```

## Rollback Plan

If you need to rollback the mindmap feature:

```sql
-- Option 1: Convert all mindmap notes to rich-text
UPDATE notes 
SET note_type = 'rich-text', content = 'Converted from mindmap'
WHERE note_type = 'mindmap';

-- Option 2: Delete all mindmap notes (destructive!)
DELETE FROM notes WHERE note_type = 'mindmap';

-- Option 3: Update constraint to exclude mindmap
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_note_type_check;
ALTER TABLE notes ADD CONSTRAINT notes_note_type_check 
    CHECK (note_type IN ('rich-text', 'drawing'));
```

## Summary

✅ The mindmap note type stores data in the existing `content` text field as JSON
✅ No schema changes are required if there's no restrictive CHECK constraint
✅ Existing indexes and RLS policies work with mindmap notes
✅ The `note_type` column already supports storing 'mindmap' as text

Simply ensure your database doesn't have a CHECK constraint that restricts note_type to only 'rich-text' and 'drawing'. If it does, follow the update steps above.
