import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  clampPdfPage,
  pdfViewStateKey,
  readPdfViewState,
  writePdfViewState,
} from '@/lib/pdf-view-state'

/**
 * This machine's Node exposes an experimental, method-less `localStorage`
 * (see the `--localstorage-file` warning) which shadows happy-dom's, so the
 * real Storage API is stubbed with a minimal in-memory implementation.
 */
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

describe('pdf-view-state / keys', () => {
  it('builds one key per note', () => {
    expect(pdfViewStateKey('note-a')).not.toBe(pdfViewStateKey('note-b'))
    expect(pdfViewStateKey('note-a')).toContain('note-a')
  })

  it('has no key without a note id (editor used outside a saved note)', () => {
    expect(pdfViewStateKey(null)).toBeNull()
    expect(pdfViewStateKey(undefined)).toBeNull()
    expect(pdfViewStateKey('')).toBeNull()
  })
})

describe('pdf-view-state / clampPdfPage', () => {
  it('keeps in-range pages', () => {
    expect(clampPdfPage(0, 10)).toBe(0)
    expect(clampPdfPage(7, 10)).toBe(7)
    expect(clampPdfPage(9, 10)).toBe(9)
  })

  it('clamps out-of-range and negative pages', () => {
    expect(clampPdfPage(42, 10)).toBe(9)
    expect(clampPdfPage(-3, 10)).toBe(0)
  })

  it('handles fractional, invalid and empty documents', () => {
    expect(clampPdfPage(3.9, 10)).toBe(3)
    expect(clampPdfPage(Number.NaN, 10)).toBe(0)
    expect(clampPdfPage(Number.POSITIVE_INFINITY, 10)).toBe(0)
    expect(clampPdfPage(4, 0)).toBe(0)
  })
})

describe('pdf-view-state / read & write', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips the position per note', () => {
    writePdfViewState('note-a', 12)
    writePdfViewState('note-b', 3)

    expect(readPdfViewState('note-a')).toEqual({ page: 12 })
    expect(readPdfViewState('note-b')).toEqual({ page: 3 })
    expect(readPdfViewState('note-c')).toBeNull()
  })

  it('overwrites the previous position for the same note', () => {
    writePdfViewState('note-a', 2)
    writePdfViewState('note-a', 5)
    expect(readPdfViewState('note-a')).toEqual({ page: 5 })
  })

  it('does nothing without a note id', () => {
    writePdfViewState(null, 4)
    writePdfViewState(undefined, 4)
    expect(window.localStorage.length).toBe(0)
    expect(readPdfViewState(null)).toBeNull()
  })

  it('normalizes fractional pages and ignores invalid values', () => {
    writePdfViewState('note-a', 2.8)
    expect(readPdfViewState('note-a')).toEqual({ page: 2 })

    writePdfViewState('note-a', Number.NaN)
    expect(readPdfViewState('note-a')).toEqual({ page: 2 })
  })

  it('ignores corrupt or unexpected entries', () => {
    window.localStorage.setItem(pdfViewStateKey('note-a') as string, 'not json')
    expect(readPdfViewState('note-a')).toBeNull()

    window.localStorage.setItem(
      pdfViewStateKey('note-a') as string,
      JSON.stringify({ page: 'first' })
    )
    expect(readPdfViewState('note-a')).toBeNull()
  })

  it('survives unavailable storage', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(readPdfViewState('note-a')).toBeNull()

    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => writePdfViewState('note-a', 4)).not.toThrow()
  })
})
