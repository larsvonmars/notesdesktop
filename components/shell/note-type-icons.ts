import { BookOpen, FilePenLine, FileText, Network, PenTool, Table2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { NoteType } from '@/lib/notes'
import type { NoteTypeIconKey } from '@/lib/note-types'
import { getNoteTypePresentation, getOrderedNoteTypePresentations } from '@/lib/note-types'
import type { NoteTypeVisual } from './types'

/** Icon per note type — kept local so shell components stay presentational. */
export const NOTE_TYPE_ICON_MAP: Record<NoteTypeIconKey, LucideIcon> = {
  'file-text': FileText,
  'pen-tool': PenTool,
  network: Network,
  'book-open': BookOpen,
  'table-2': Table2,
  'file-pen-line': FilePenLine,
}

/**
 * Theme-aware tinted squares for each note type. The values are full literal
 * class strings so Tailwind can see them; light mode uses the saturated tint on
 * a wash, dark mode switches to a luminous pastel on a deeper translucent wash.
 */
const NOTE_TYPE_TONES: Record<NoteType, { tile: string; icon: string }> = {
  'rich-text': {
    tile: 'bg-sky-500/10 ring-sky-500/10 dark:bg-sky-400/20 dark:ring-sky-300/10',
    icon: 'text-sky-600 dark:text-sky-300',
  },
  drawing: {
    tile: 'bg-violet-500/10 ring-violet-500/10 dark:bg-violet-400/20 dark:ring-violet-300/10',
    icon: 'text-violet-600 dark:text-violet-300',
  },
  mindmap: {
    tile: 'bg-emerald-500/10 ring-emerald-500/10 dark:bg-emerald-400/20 dark:ring-emerald-300/10',
    icon: 'text-emerald-600 dark:text-emerald-300',
  },
  'bullet-journal': {
    tile: 'bg-amber-500/10 ring-amber-500/10 dark:bg-amber-400/20 dark:ring-amber-300/10',
    icon: 'text-amber-600 dark:text-amber-300',
  },
  'data-sheet': {
    tile: 'bg-cyan-500/10 ring-cyan-500/10 dark:bg-cyan-400/20 dark:ring-cyan-300/10',
    icon: 'text-cyan-600 dark:text-cyan-300',
  },
  'pdf-annotation': {
    tile: 'bg-rose-500/10 ring-rose-500/10 dark:bg-rose-400/20 dark:ring-rose-300/10',
    icon: 'text-rose-600 dark:text-rose-300',
  },
}

/** Resolve icon + tint for a note type (defensive against unknown values). */
export function getNoteTypeVisual(noteType?: NoteType | null): NoteTypeVisual {
  const presentation = getNoteTypePresentation(noteType)
  const tone = NOTE_TYPE_TONES[presentation.id] ?? NOTE_TYPE_TONES['rich-text']
  return {
    type: presentation.id,
    label: presentation.label,
    icon: NOTE_TYPE_ICON_MAP[presentation.iconKey],
    tileClassName: tone.tile,
    iconClassName: tone.icon,
  }
}

/** All note types in picker order, resolved to their visuals. */
export function getOrderedNoteTypeVisuals(): NoteTypeVisual[] {
  return getOrderedNoteTypePresentations().map((presentation) => getNoteTypeVisual(presentation.id))
}
