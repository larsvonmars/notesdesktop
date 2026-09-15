import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  GRAMMAR_ENABLED_STORAGE_KEY,
  readGrammarEnabledPreference,
  setGrammarEnabledPreference,
  subscribeToGrammarEnabledPreference,
  writeGrammarEnabledPreference,
} from '@/lib/editor/grammar/preferences'

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

describe('grammar preference', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to enabled', () => {
    expect(readGrammarEnabledPreference()).toBe(true)
  })

  it('round-trips the flag through storage', () => {
    setGrammarEnabledPreference(false)
    expect(window.localStorage.getItem(GRAMMAR_ENABLED_STORAGE_KEY)).toBe('off')
    expect(readGrammarEnabledPreference()).toBe(false)

    setGrammarEnabledPreference(true)
    expect(window.localStorage.getItem(GRAMMAR_ENABLED_STORAGE_KEY)).toBe('on')
    expect(readGrammarEnabledPreference()).toBe(true)
  })

  it('notifies subscribers (and stops after unsubscribe)', () => {
    const seen: boolean[] = []
    const unsubscribe = subscribeToGrammarEnabledPreference((enabled) => seen.push(enabled))

    setGrammarEnabledPreference(false)
    setGrammarEnabledPreference(true)
    unsubscribe()
    setGrammarEnabledPreference(false)

    expect(seen).toEqual([false, true])
  })

  it('persists silently when the caller already holds the state', () => {
    const seen: boolean[] = []
    const unsubscribe = subscribeToGrammarEnabledPreference((enabled) => seen.push(enabled))

    writeGrammarEnabledPreference(false)
    unsubscribe()

    expect(readGrammarEnabledPreference()).toBe(false)
    expect(seen).toEqual([])
  })
})
