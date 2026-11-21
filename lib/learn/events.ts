/**
 * Lightweight change signal for the Learn data layer.
 *
 * Decks and cards can be mutated from several surfaces (Learn itself, Chat
 * tools, the command palette). The shared LearningProvider listens for this
 * event so the rail badge, Home learning panel, sidebar and details panel stay
 * in sync without a reload.
 */

export const LEARN_DATA_CHANGED_EVENT = 'notesdesktop:learn-data-changed'

export function notifyLearnDataChanged(): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(LEARN_DATA_CHANGED_EVENT))
  } catch {
    // Non-browser environments (tests, SSR) simply skip the notification.
  }
}

export function subscribeToLearnDataChanged(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(LEARN_DATA_CHANGED_EVENT, handler)
  return () => window.removeEventListener(LEARN_DATA_CHANGED_EVENT, handler)
}
