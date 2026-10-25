/**
 * Cross-component trigger for the AI assistant.
 *
 * The assistant lives inside the note editor, but it should be reachable from
 * the shell (top-bar overflow, keyboard shortcut) without threading state
 * through every component. A tiny DOM event keeps that decoupled.
 */
export const AI_ASSISTANT_OPEN_EVENT = 'mindviz:ai-assistant-open'

export type AIAssistantOpenDetail = {
  /** What the caller wants the assistant to focus on, when known. */
  context?: 'note' | 'selection'
}

/** Ask the mounted note editor to open the AI assistant. */
export function requestOpenAIAssistant(detail: AIAssistantOpenDetail = {}): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<AIAssistantOpenDetail>(AI_ASSISTANT_OPEN_EVENT, { detail }))
}
