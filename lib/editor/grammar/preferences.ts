/**
 * Grammar-checking preference — shared by the editor and the settings UI.
 *
 * A plain localStorage flag keeps this independent of the account: it works in
 * static/Tauri builds, survives sign-out and is readable before the editor
 * mounts. Changes are broadcast on `window` so an already-open note reacts
 * immediately (the settings modal and the editor never talk directly).
 */

export const GRAMMAR_ENABLED_STORAGE_KEY = 'notesdesktop:grammar-check-enabled'

/** Fired on `window` whenever the preference changes. */
export const GRAMMAR_ENABLED_CHANGE_EVENT = 'notesdesktop:grammar-enabled-change'

export interface GrammarEnabledChangeDetail {
  enabled: boolean
}

/** Enabled unless the user turned it off (`'off'`) — or storage is unavailable. */
export function readGrammarEnabledPreference(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(GRAMMAR_ENABLED_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Persist without notifying (for callers that already hold the state). */
export function writeGrammarEnabledPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GRAMMAR_ENABLED_STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    /* storage unavailable — preference stays session-only */
  }
}

/** Persist and broadcast — the single entry point for preference changes. */
export function setGrammarEnabledPreference(enabled: boolean): void {
  writeGrammarEnabledPreference(enabled)
  if (typeof window === 'undefined') return

  try {
    window.dispatchEvent(
      new CustomEvent<GrammarEnabledChangeDetail>(GRAMMAR_ENABLED_CHANGE_EVENT, {
        detail: { enabled },
      })
    )
  } catch {
    /* CustomEvent unavailable — storage is still up to date */
  }
}

/**
 * Run `handler` whenever the preference changes (same tab). Returns the
 * unsubscribe function, ready to use as an effect cleanup.
 */
export function subscribeToGrammarEnabledPreference(
  handler: (enabled: boolean) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<GrammarEnabledChangeDetail>).detail
    handler(detail ? detail.enabled : readGrammarEnabledPreference())
  }

  window.addEventListener(GRAMMAR_ENABLED_CHANGE_EVENT, listener)
  return () => window.removeEventListener(GRAMMAR_ENABLED_CHANGE_EVENT, listener)
}
