import type { NoteSummary } from '@/lib/notes'
import type {
  NoteListFolderRef,
  NoteListGroup,
  NoteListProjectRef,
  NoteListSort,
  ShellUser,
} from './types'

/** Tiny class-name joiner (keeps conditional classes readable). */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/** Two-letter initials for the rail avatar (falls back to a neutral glyph). */
export function getInitials(user?: ShellUser | null): string {
  const source = (user?.name ?? '').trim() || (user?.email ?? '').split('@')[0] || ''
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Parse an ISO timestamp defensively (bad values sort as oldest). */
export function parseNoteDate(value?: string | null): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Compact relative time, e.g. "Just now", "12m ago", "3h ago", "Mar 4". */
export function formatRelativeTime(value?: string | null, now: Date = new Date()): string {
  const timestamp = parseNoteDate(value)
  if (!timestamp) return 'Unknown'

  const diff = now.getTime() - timestamp
  if (diff < 45_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))}h ago`

  const days = Math.floor(diff / 86_400_000)
  if (days <= 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  const date = new Date(timestamp)
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** The "project / folder" descriptor shown in a note row's meta line. */
export function getNoteLocationLabel(
  note: Pick<NoteSummary, 'folder_id' | 'project_id'>,
  folders: readonly NoteListFolderRef[] = [],
  projects: readonly NoteListProjectRef[] = []
): string {
  const project = note.project_id
    ? projects.find((candidate) => candidate.id === note.project_id)?.name
    : undefined
  const folder = note.folder_id
    ? folders.find((candidate) => candidate.id === note.folder_id)?.name
    : undefined

  if (project && folder) return `${project} / ${folder}`
  return project ?? folder ?? 'Unfiled'
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

const DAY_MS = 86_400_000

/**
 * Group notes into Today / Yesterday / Previous 7 days / Older.
 *
 * When sorting by title the list is flat ("All notes") because date bucketing
 * would fight the alphabetical order. Group order always newest → oldest.
 */
export function groupNotesByRecency(
  notes: readonly NoteSummary[],
  sort: NoteListSort = 'updated',
  now: Date = new Date()
): NoteListGroup[] {
  const sorted = [...notes].sort((a, b) => {
    if (sort === 'title') {
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
    }
    const field = sort === 'created' ? 'created_at' : 'updated_at'
    const difference = parseNoteDate(b[field]) - parseNoteDate(a[field])
    if (difference !== 0) return difference
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
  })

  if (sort === 'title') {
    return sorted.length > 0 ? [{ id: 'all', label: 'All notes', notes: sorted }] : []
  }

  const todayStart = startOfDay(now)
  const yesterdayStart = todayStart - DAY_MS
  const weekStart = todayStart - 6 * DAY_MS
  const dateField = sort === 'created' ? 'created_at' : 'updated_at'

  const buckets: NoteListGroup[] = [
    { id: 'today', label: 'Today', notes: [] },
    { id: 'yesterday', label: 'Yesterday', notes: [] },
    { id: 'previous-7-days', label: 'Previous 7 days', notes: [] },
    { id: 'older', label: 'Older', notes: [] },
  ]

  for (const note of sorted) {
    const timestamp = parseNoteDate(note[dateField])
    if (timestamp >= todayStart) {
      buckets[0].notes.push(note)
    } else if (timestamp >= yesterdayStart) {
      buckets[1].notes.push(note)
    } else if (timestamp >= weekStart) {
      buckets[2].notes.push(note)
    } else {
      buckets[3].notes.push(note)
    }
  }

  return buckets.filter((group) => group.notes.length > 0)
}
