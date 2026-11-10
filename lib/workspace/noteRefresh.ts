import type { Note } from '@/lib/notes'

type NoteContent = Pick<Note, 'id' | 'title' | 'content' | 'note_type'>

/**
 * True when both rows describe the body the editor already shows.
 * `updated_at` is ignored on purpose: a folder move or a no-op write bumps it
 * without changing anything the editor renders, and reloading then would only
 * disturb the caret.
 */
export function isSameNoteContent(
  current: NoteContent,
  fresh: NoteContent,
): boolean {
  return (
    current.title === fresh.title &&
    current.content === fresh.content &&
    current.note_type === fresh.note_type
  )
}

/**
 * Decide whether the workspace should adopt a note row that changed underneath
 * the editor (another device, or Chat writing to the focused note).
 *
 * Never adopt while the editor holds unsaved edits: replacing the body would
 * throw away what the user typed. The dirty buffer wins and the write is left to
 * the offline sync layer, which already refuses to overwrite a newer server row.
 */
export function shouldAdoptExternalNote(
  current: NoteContent | null | undefined,
  fresh: NoteContent | null | undefined,
  hasUnsavedEdits: boolean,
): boolean {
  if (!current || !fresh) return false
  if (current.id !== fresh.id) return false
  if (hasUnsavedEdits) return false
  return !isSameNoteContent(current, fresh)
}
