-- =============================================================
-- Data Sheet Note Type Migration
-- =============================================================
-- Run this in your Supabase SQL Editor to allow the 'data-sheet'
-- note type in the notes table.
-- =============================================================

-- Update the CHECK constraint on note_type to include 'data-sheet'
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_note_type_check;
ALTER TABLE notes ADD CONSTRAINT notes_note_type_check 
    CHECK (note_type IN ('rich-text', 'drawing', 'mindmap', 'bullet-journal', 'data-sheet'));
