/** Platform-aware modifier hints for keyboard shortcuts (UI labels only). */

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** e.g. `formatModShortcut('K')` → "⌘K" on Apple platforms, "Ctrl+K" elsewhere. */
export function formatModShortcut(key: string): string {
  return isApplePlatform() ? `⌘${key}` : `Ctrl+${key}`
}
