import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  WELCOME_ON_STARTUP_STORAGE_KEY,
  readWelcomeOnStartupPreference,
  setWelcomeOnStartupPreference,
  subscribeToWelcomeOnStartupPreference,
} from '@/lib/workspace/preferences'

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

describe('welcome-on-startup preference', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to enabled', () => {
    expect(readWelcomeOnStartupPreference()).toBe(true)
  })

  it('round-trips the flag through storage', () => {
    setWelcomeOnStartupPreference(false)
    expect(window.localStorage.getItem(WELCOME_ON_STARTUP_STORAGE_KEY)).toBe('off')
    expect(readWelcomeOnStartupPreference()).toBe(false)

    setWelcomeOnStartupPreference(true)
    expect(window.localStorage.getItem(WELCOME_ON_STARTUP_STORAGE_KEY)).toBe('on')
    expect(readWelcomeOnStartupPreference()).toBe(true)
  })

  it('notifies subscribers (and stops after unsubscribe)', () => {
    const seen: boolean[] = []
    const unsubscribe = subscribeToWelcomeOnStartupPreference((enabled) => seen.push(enabled))

    setWelcomeOnStartupPreference(false)
    setWelcomeOnStartupPreference(true)
    unsubscribe()
    setWelcomeOnStartupPreference(false)

    expect(seen).toEqual([false, true])
  })
})
