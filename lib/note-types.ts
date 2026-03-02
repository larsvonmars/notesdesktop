import type { NoteType } from './notes'

export type NoteTypeIconKey = 'file-text' | 'pen-tool' | 'network' | 'book-open' | 'table-2'

export interface NoteTypePresentation {
  id: NoteType
  label: string
  pickerLabel: string
  description: string
  iconKey: NoteTypeIconKey
  iconClassName: string
  iconBgClassName: string
  graphFill: string
  graphStroke: string
}

const NOTE_TYPE_ORDER: NoteType[] = ['rich-text', 'drawing', 'mindmap', 'bullet-journal', 'data-sheet']

const NOTE_TYPE_PRESENTATIONS: Record<NoteType, NoteTypePresentation> = {
  'rich-text': {
    id: 'rich-text',
    label: 'Rich Text',
    pickerLabel: 'Text Note',
    description: 'Write with rich formatting, tables, and note links.',
    iconKey: 'file-text',
    iconClassName: 'text-alpine-500',
    iconBgClassName: 'bg-alpine-100 text-alpine-600',
    graphFill: '#e0f2fe',
    graphStroke: '#2563eb',
  },
  drawing: {
    id: 'drawing',
    label: 'Drawing',
    pickerLabel: 'Drawing Note',
    description: 'Sketch ideas with multi-page canvas tools.',
    iconKey: 'pen-tool',
    iconClassName: 'text-purple-500',
    iconBgClassName: 'bg-purple-100 text-purple-600',
    graphFill: '#f3e8ff',
    graphStroke: '#9333ea',
  },
  mindmap: {
    id: 'mindmap',
    label: 'Mind Map',
    pickerLabel: 'Mind Map',
    description: 'Visualize concepts and relationships quickly.',
    iconKey: 'network',
    iconClassName: 'text-green-500',
    iconBgClassName: 'bg-green-100 text-green-600',
    graphFill: '#dcfce7',
    graphStroke: '#16a34a',
  },
  'bullet-journal': {
    id: 'bullet-journal',
    label: 'Journal',
    pickerLabel: 'Bullet Journal',
    description: 'Rapid-log tasks, events, and notes with signifiers.',
    iconKey: 'book-open',
    iconClassName: 'text-amber-500',
    iconBgClassName: 'bg-amber-100 text-amber-600',
    graphFill: '#fef3c7',
    graphStroke: '#d97706',
  },
  'data-sheet': {
    id: 'data-sheet',
    label: 'Data Sheet',
    pickerLabel: 'Data Sheet',
    description: 'Create and edit spreadsheet data with formulas and CSV import/export.',
    iconKey: 'table-2',
    iconClassName: 'text-cyan-500',
    iconBgClassName: 'bg-cyan-100 text-cyan-600',
    graphFill: '#cffafe',
    graphStroke: '#0891b2',
  },
}

export function getNoteTypePresentation(noteType?: NoteType | null): NoteTypePresentation {
  if (!noteType) return NOTE_TYPE_PRESENTATIONS['rich-text']
  return NOTE_TYPE_PRESENTATIONS[noteType] ?? NOTE_TYPE_PRESENTATIONS['rich-text']
}

export function getOrderedNoteTypePresentations(): NoteTypePresentation[] {
  return NOTE_TYPE_ORDER.map((noteType) => NOTE_TYPE_PRESENTATIONS[noteType])
}
