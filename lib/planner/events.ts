/**
 * Cross-surface signal for planner data (tasks and calendar events).
 *
 * Chat tools can keep running while the user navigates to Home or Planner
 * (ChatView stays mounted). Those surfaces listen for this event and refresh
 * their agenda instead of showing stale data until a remount.
 */

export const PLANNER_DATA_CHANGED_EVENT = 'notesdesktop:planner-data-changed'

export function notifyPlannerDataChanged(): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(PLANNER_DATA_CHANGED_EVENT))
  } catch {
    // ignore
  }
}

export function subscribeToPlannerDataChanged(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(PLANNER_DATA_CHANGED_EVENT, handler)
  return () => window.removeEventListener(PLANNER_DATA_CHANGED_EVENT, handler)
}
