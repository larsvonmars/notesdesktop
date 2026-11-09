/**
 * Selection actions offered in the editor toolbar.
 *
 * Client-safe: only labels and prompt builders, no data access.
 */

export type SelectionAIActionId =
  | 'summarise'
  | 'improve'
  | 'explain'
  | 'translate'
  | 'flashcards'
  | 'tasks'
  | 'ask'

export interface SelectionAIAction {
  id: SelectionAIActionId
  label: string
  emoji: string
  description: string
}

export const SELECTION_AI_ACTIONS: SelectionAIAction[] = [
  { id: 'summarise', label: 'Summarise', emoji: '📄', description: 'Condense the selection into key points' },
  { id: 'improve', label: 'Improve writing', emoji: '✨', description: 'Rewrite for clarity and flow' },
  { id: 'explain', label: 'Explain', emoji: '💡', description: 'Explain the passage in plain language' },
  { id: 'translate', label: 'Translate', emoji: '🌍', description: 'Translate the selection' },
  { id: 'flashcards', label: 'Make flashcards', emoji: '🎓', description: 'Build a Learn deck from the selection' },
  { id: 'tasks', label: 'Extract tasks', emoji: '✅', description: 'Turn action items into planner tasks' },
  { id: 'ask', label: 'Ask about this…', emoji: '💬', description: 'Draft a question about the selection' },
]

const MAX_SELECTION_CHARS = 6000

export function getSelectionAIAction(id: string | null | undefined): SelectionAIAction | undefined {
  if (!id) return undefined
  return SELECTION_AI_ACTIONS.find((action) => action.id === id)
}

function normaliseSelection(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim()
    .slice(0, MAX_SELECTION_CHARS)
}

/** Render the selection as a markdown blockquote, keeping paragraph breaks. */
export function quoteSelection(text: string): string {
  return normaliseSelection(text)
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n')
}

function describeSource(noteTitle?: string | null): string {
  return noteTitle ? ` from my note "${noteTitle}"` : ''
}

/** The message auto-sent for a selection action. */
export function buildSelectionPrompt(
  actionId: SelectionAIActionId,
  selectionText: string,
  noteTitle?: string | null,
): string {
  const quote = quoteSelection(selectionText)
  const source = describeSource(noteTitle)

  switch (actionId) {
    case 'summarise':
      return `Summarise the passage I selected${source}. Keep concrete facts, names and numbers, and use at most 5 bullets.\n\n${quote}`
    case 'improve':
      return `Rewrite the passage I selected${source} so it is clearer and tighter. Keep the meaning, facts and any formatting structure. Return the rewritten text as a quote block, then add one short line describing what you changed.\n\n${quote}`
    case 'explain':
      return `Explain the passage I selected${source} in plain language. Lead with a one-sentence takeaway, then unpack the parts that need context.\n\n${quote}`
    case 'translate':
      return `Translate the passage I selected${source}. If I have not told you the target language, ask me which language to use instead of guessing.\n\n${quote}`
    case 'flashcards':
      return `Create flashcards from the passage I selected${source}.\n\n${quote}\n\nCreate one Learn deck named after the topic with 6-10 question/answer cards that cover the key facts. Tell me the deck name and card count when you are done.`
    case 'tasks':
      return `Extract the actionable items from the passage I selected${source} and create them as tasks in my planner. Include a due date only when the passage mentions one. Afterwards, list exactly which tasks you created.\n\n${quote}`
    case 'ask':
      return buildSelectionDraft(selectionText, noteTitle)
  }
}

/** Prefilled composer text for the open-ended "ask about this" action. */
export function buildSelectionDraft(selectionText: string, noteTitle?: string | null): string {
  const quote = quoteSelection(selectionText)
  const source = describeSource(noteTitle)
  return `About this passage${source}:\n\n${quote}\n\n`
}
