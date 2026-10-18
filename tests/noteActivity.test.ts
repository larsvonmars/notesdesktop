import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  forgetNoteOpened,
  getLastOpenedNote,
  getNoteOpenedAt,
  recordNoteOpened,
  subscribeToNoteActivity,
} from '@/lib/note-activity'

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => {
      entries.clear()
    },
    getItem: (key: string) => (entries.has(key) ? (entries.get(key) as string) : null),
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key)
    },
    setItem: (key: string, value: string) => {
      entries.set(key, String(value))
    },
  } as Storage
}

describe('note activity', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns null until a note has been opened', () => {
    expect(getLastOpenedNote('user-1')).toBeNull()
    expect(getNoteOpenedAt('user-1', 'note-1')).toBeNull()
    expect(getLastOpenedNote(undefined)).toBeNull()
  })

  it('tracks the most recently opened note', () => {
    recordNoteOpened('user-1', 'note-1')
    vi.setSystemTime(new Date('2026-10-18T10:05:00.000Z'))
    recordNoteOpened('user-1', 'note-2')

    expect(getLastOpenedNote('user-1')).toEqual({
      noteId: 'note-2',
      openedAt: '2026-10-18T10:05:00.000Z',
    })
    expect(getNoteOpenedAt('user-1', 'note-1')).toBe('2026-10-18T10:00:00.000Z')
  })

  it('keeps activity isolated per user', () => {
    recordNoteOpened('user-1', 'note-1')
    recordNoteOpened('user-2', 'note-2')

    expect(getLastOpenedNote('user-1')?.noteId).toBe('note-1')
    expect(getLastOpenedNote('user-2')?.noteId).toBe('note-2')
  })

  it('can forget a deleted note', () => {
    recordNoteOpened('user-1', 'note-1')
    vi.setSystemTime(new Date('2026-10-18T10:05:00.000Z'))
    recordNoteOpened('user-1', 'note-2')

    forgetNoteOpened('user-1', 'note-2')

    expect(getLastOpenedNote('user-1')?.noteId).toBe('note-1')
  })

  it('notifies subscribers for the matching user only', () => {
    const seen: string[] = []
    const unsubscribe = subscribeToNoteActivity('user-1', (activity) => {
      seen.push(activity.noteId)
    })

    recordNoteOpened('user-2', 'other-user-note')
    recordNoteOpened('user-1', 'note-1')
    unsubscribe()
    recordNoteOpened('user-1', 'note-2')

    expect(seen).toEqual(['note-1'])
  })

  it('ignores malformed stored data', () => {
    window.localStorage.setItem('notesdesktop:note-activity:user-1', '{not json')
    expect(getLastOpenedNote('user-1')).toBeNull()
  })
})
