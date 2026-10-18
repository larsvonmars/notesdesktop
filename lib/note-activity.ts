/**
 * Local "last opened" tracking for notes.
 *
 * Notes already carry `updated_at`, but that only says when a note changed.
 * The Home screen wants to resume the note the user actually looked at last.
 * Activity is intentionally local to the device: it is cheap, works offline,
 * and does not require a database migration or a write on every note open.
 */

const STORAGE_PREFIX = 'notesdesktop:note-activity'
const CHANGE_EVENT = 'notesdesktop:note-activity-change'
const MAX_ENTRIES = 200

export interface NoteActivity {
  noteId: string
  openedAt: string
}

export interface NoteActivityChangeDetail {
  userId: string
  noteId: string
  openedAt: string
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`
}

function readActivityMap(userId: string): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const activity: Record<string, string> = {}
    for (const [noteId, openedAt] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof openedAt === 'string' && openedAt) activity[noteId] = openedAt
    }
    return activity
  } catch {
    return {}
  }
}

function writeActivityMap(userId: string, activity: Record<string, string>): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(activity))
  } catch {
    /* Storage unavailable — tracking stays session-only. */
  }
}

function newestFirst(activity: Record<string, string>): [string, string][] {
  return Object.entries(activity).sort((a, b) => b[1].localeCompare(a[1]))
}

/** Record that a note was opened. Keeps at most {@link MAX_ENTRIES}. */
export function recordNoteOpened(
  userId: string | null | undefined,
  noteId: string,
): void {
  if (!userId || !noteId) return

  const activity = readActivityMap(userId)
  const openedAt = new Date().toISOString()
  activity[noteId] = openedAt

  const pruned = Object.fromEntries(newestFirst(activity).slice(0, MAX_ENTRIES))
  writeActivityMap(userId, pruned)

  try {
    window.dispatchEvent(
      new CustomEvent<NoteActivityChangeDetail>(CHANGE_EVENT, {
        detail: { userId, noteId, openedAt },
      }),
    )
  } catch {
    /* CustomEvent unavailable — storage is still up to date. */
  }
}

/** Most recently opened note, or null when nothing has been opened yet. */
export function getLastOpenedNote(
  userId: string | null | undefined,
): NoteActivity | null {
  if (!userId) return null

  const [entry] = newestFirst(readActivityMap(userId))
  if (!entry) return null

  return { noteId: entry[0], openedAt: entry[1] }
}

/** Opened timestamp for a specific note, if it has ever been opened. */
export function getNoteOpenedAt(
  userId: string | null | undefined,
  noteId: string,
): string | null {
  if (!userId || !noteId) return null
  return readActivityMap(userId)[noteId] ?? null
}

/** Drop a note from the activity list (e.g. after deleting it). */
export function forgetNoteOpened(
  userId: string | null | undefined,
  noteId: string,
): void {
  if (!userId || !noteId) return

  const activity = readActivityMap(userId)
  if (!(noteId in activity)) return

  delete activity[noteId]
  writeActivityMap(userId, activity)
}

/** Subscribe to activity changes for one user (same tab). */
export function subscribeToNoteActivity(
  userId: string | null | undefined,
  handler: (activity: NoteActivity) => void,
): () => void {
  if (typeof window === 'undefined' || !userId) return () => {}

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<NoteActivityChangeDetail>).detail
    if (!detail || detail.userId !== userId) return
    handler({ noteId: detail.noteId, openedAt: detail.openedAt })
  }

  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}
