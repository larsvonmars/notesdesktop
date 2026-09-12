/**
 * Slash-menu model.
 *
 * Typing `/` at the start of a line (or after whitespace) opens a small block
 * inserter — "slash menu" — that filters a catalogue of block transformations
 * while the user keeps typing. All of the matching logic is pure so it can be
 * unit-tested without a DOM; `components/editor/SlashMenu.tsx` owns the
 * overlay, the caret anchoring and the keyboard handling.
 */

export type SlashCommandId =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'quote'
  | 'code'
  | 'ul'
  | 'ol'
  | 'checklist'
  | 'divider'
  | 'table'

export interface SlashCommandDefinition {
  id: SlashCommandId
  label: string
  /** Extra search terms ("todo", "checkbox", …) and alternate spellings. */
  keywords: string[]
}

/** Catalogue order = menu order when nothing has been typed yet. */
export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  { id: 'paragraph', label: 'Paragraph', keywords: ['text', 'body', 'plain', 'p'] },
  { id: 'h1', label: 'Heading 1', keywords: ['h1', 'title', '#'] },
  { id: 'h2', label: 'Heading 2', keywords: ['h2', 'subtitle', '##'] },
  { id: 'h3', label: 'Heading 3', keywords: ['h3', '###', 'subheading'] },
  { id: 'ul', label: 'Bulleted list', keywords: ['bullet', 'list', 'ul', '-'] },
  { id: 'ol', label: 'Numbered list', keywords: ['number', 'ordered', 'list', 'ol', '1.'] },
  { id: 'checklist', label: 'Checklist', keywords: ['todo', 'task', 'checkbox', 'check'] },
  { id: 'quote', label: 'Quote', keywords: ['blockquote', 'citation', '>'] },
  { id: 'code', label: 'Code block', keywords: ['code', 'pre', 'snippet', '```'] },
  { id: 'divider', label: 'Divider', keywords: ['hr', 'separator', 'rule', 'line', '---'] },
  { id: 'table', label: 'Table', keywords: ['grid', 'rows', 'columns', 'cells'] },
]

/** Longest query the menu still reacts to (`/` + 24 characters). */
export const SLASH_QUERY_MAX_LENGTH = 24

/** `/` at the start of the line or right after whitespace, then bare word. */
const TRIGGER_PATTERN = /(?:^|\s)\/([^\s/]{0,24})$/

export interface SlashTrigger {
  /** Text typed after the slash (empty right after `/`). */
  query: string
  /** Offset of the `/` inside the string that was passed in. */
  start: number
}

/**
 * Find a slash trigger in the text typed before the caret.
 * Only the current line counts and the query may not contain whitespace, so
 * the menu closes naturally when the user keeps writing prose.
 */
export function matchSlashTrigger(textBeforeCaret: string): SlashTrigger | null {
  if (!textBeforeCaret) return null

  const lineStart = textBeforeCaret.lastIndexOf('\n') + 1
  const line = textBeforeCaret.slice(lineStart)
  const match = TRIGGER_PATTERN.exec(line)
  if (!match) return null

  const slashIndex = match[0].lastIndexOf('/')
  if (slashIndex < 0) return null

  return { query: match[1], start: lineStart + match.index + slashIndex }
}

interface Filterable {
  label: string
  keywords: string[]
}

/** Higher = better; -1 means "no match". */
function scoreCommand(query: string, command: Filterable): number {
  const label = command.label.toLowerCase()

  if (label === query) return 200
  if (label.startsWith(query)) return 150 - label.length

  const keywordIndex = command.keywords.findIndex((keyword) =>
    keyword.toLowerCase().startsWith(query)
  )
  if (keywordIndex >= 0) return 120 - keywordIndex

  if (label.includes(query)) return 80

  if (command.keywords.some((keyword) => keyword.toLowerCase().includes(query))) return 50

  return -1
}

/**
 * Filter + rank the catalogue for the typed query. An empty query keeps the
 * catalogue order so the menu opens as a stable block palette.
 */
export function filterSlashCommands<T extends Filterable>(
  query: string,
  commands: readonly T[]
): T[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return commands.slice()

  return commands
    .map((command, index) => ({ command, index, score: scoreCommand(trimmed, command) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command)
}
