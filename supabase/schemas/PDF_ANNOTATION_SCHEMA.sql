-- Migration: Add 'pdf-annotation' to the notes.note_type CHECK constraint
-- Run this in the Supabase SQL Editor

ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_note_type_check;
ALTER TABLE notes ADD CONSTRAINT notes_note_type_check 
    CHECK (note_type IN ('rich-text', 'drawing', 'mindmap', 'bullet-journal', 'data-sheet', 'pdf-annotation'));
