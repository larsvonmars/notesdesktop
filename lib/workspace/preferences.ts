/**
 * Workspace-level preferences — shared by the workspace shell, the welcome
 * view and the settings UI.
 *
 * A plain localStorage flag keeps this independent of the account: it works in
 * static/Tauri builds and survives sign-out. Changes are broadcast on `window`
 * so an already-mounted welcome view stays in sync with the settings modal.
 */

export const WELCOME_ON_STARTUP_STORAGE_KEY = 'notesdesktop:welcome-on-startup'

/** Fired on `window` whenever the preference changes. */
export const WELCOME_ON_STARTUP_CHANGE_EVENT = 'notesdesktop:welcome-on-startup-change'

export interface WelcomeOnStartupChangeDetail {
  enabled: boolean
}

/** Enabled unless the user turned it off (`'off'`) — or storage is unavailable. */
export function readWelcomeOnStartupPreference(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(WELCOME_ON_STARTUP_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Persist and broadcast. */
export function setWelcomeOnStartupPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(WELCOME_ON_STARTUP_STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    /* storage unavailable — preference stays session-only */
  }

  try {
    window.dispatchEvent(
      new CustomEvent<WelcomeOnStartupChangeDetail>(WELCOME_ON_STARTUP_CHANGE_EVENT, {
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
export function subscribeToWelcomeOnStartupPreference(
  handler: (enabled: boolean) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<WelcomeOnStartupChangeDetail>).detail
    handler(detail ? detail.enabled : readWelcomeOnStartupPreference())
  }

  window.addEventListener(WELCOME_ON_STARTUP_CHANGE_EVENT, listener)
  return () => window.removeEventListener(WELCOME_ON_STARTUP_CHANGE_EVENT, listener)
}
