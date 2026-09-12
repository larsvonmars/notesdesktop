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
  | 'h4'
  | 'h5'
  | 'h6'
  | 'ul'
  | 'ol'
  | 'checklist'
  | 'quote'
  | 'code'
  | 'divider'
  | 'hyperlink'
  | 'table'
  | 'note-link'
  | 'data-sheet-table'
  | 'image'
  | 'file'

export type SlashCategory = 'Text' | 'Headings' | 'Lists' | 'Content' | 'Media'

/** Header order for the unfiltered palette view. */
export const SLASH_CATEGORY_ORDER: SlashCategory[] = ['Text', 'Headings', 'Lists', 'Content', 'Media']

export interface SlashCommandDefinition {
  id: SlashCommandId
  label: string
  /** One-liner shown as the row tooltip. */
  description: string
  /** Extra search terms ("todo", "checkbox", …) and alternate spellings. */
  keywords: string[]
  category: SlashCategory
}

/**
 * Catalogue for the slash menu. It intentionally covers everything the old
 * floating "insert content block" menu offered — the editor keeps the text
 * commands, the app-level entries (note link, data sheet, image, file) are
 * forwarded through `onCustomCommand`.
 *
 * Order = menu order when nothing has been typed yet (grouped by category).
 */
export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  // Text
  {
    id: 'paragraph',
    label: 'Text',
    description: 'Plain paragraph',
    keywords: ['paragraph', 'body', 'plain', 'p'],
    category: 'Text',
  },
  // Headings
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large section heading',
    keywords: ['h1', 'title', 'big', '#'],
    category: 'Headings',
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2', 'subtitle', '##'],
    category: 'Headings',
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3', 'subheading', '###'],
    category: 'Headings',
  },
  {
    id: 'h4',
    label: 'Heading 4',
    description: 'Sub-section heading',
    keywords: ['h4', '####'],
    category: 'Headings',
  },
  {
    id: 'h5',
    label: 'Heading 5',
    description: 'Minor heading',
    keywords: ['h5', '#####'],
    category: 'Headings',
  },
  {
    id: 'h6',
    label: 'Heading 6',
    description: 'Smallest heading',
    keywords: ['h6', '######'],
    category: 'Headings',
  },
  // Lists
  {
    id: 'ul',
    label: 'Bulleted list',
    description: 'Create an unordered list',
    keywords: ['bullet', 'list', 'unordered', 'ul', '-'],
    category: 'Lists',
  },
  {
    id: 'ol',
    label: 'Numbered list',
    description: 'Create an ordered list',
    keywords: ['number', 'ordered', 'list', 'ol', '1.'],
    category: 'Lists',
  },
  {
    id: 'checklist',
    label: 'Checklist',
    description: 'Task list with checkboxes',
    keywords: ['todo', 'task', 'checkbox', 'check'],
    category: 'Lists',
  },
  // Content
  {
    id: 'quote',
    label: 'Quote',
    description: 'Insert a blockquote',
    keywords: ['blockquote', 'citation', 'cite', '>'],
    category: 'Content',
  },
  {
    id: 'code',
    label: 'Code block',
    description: 'Literal text with monospace styling',
    keywords: ['code', 'pre', 'snippet', '```'],
    category: 'Content',
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Add a horizontal rule',
    keywords: ['hr', 'separator', 'rule', 'line', '---'],
    category: 'Content',
  },
  {
    id: 'hyperlink',
    label: 'Hyperlink',
    description: 'Insert a web link',
    keywords: ['url', 'link', 'a', 'web', 'href'],
    category: 'Content',
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Insert a customizable table',
    keywords: ['tbl', 'grid', 'spreadsheet', 'rows', 'columns'],
    category: 'Content',
  },
  {
    id: 'note-link',
    label: 'Note link',
    description: 'Link to another note',
    keywords: ['nl', 'notelink', 'internal', 'wiki'],
    category: 'Content',
  },
  {
    id: 'data-sheet-table',
    label: 'Data sheet table',
    description: 'Insert a table from a data sheet',
    keywords: ['dst', 'data', 'sheet', 'spreadsheet'],
    category: 'Content',
  },
  // Media
  {
    id: 'image',
    label: 'Image',
    description: 'Insert an image',
    keywords: ['img', 'picture', 'photo', 'pic'],
    category: 'Media',
  },
  {
    id: 'file',
    label: 'File',
    description: 'Attach a file from your storage',
    keywords: ['attachment', 'attach', 'upload', 'doc'],
    category: 'Media',
  },
]

export interface SlashCommandGroup {
  category: SlashCategory
  commands: SlashCommandDefinition[]
}

/**
 * Split commands into category sections (palette order). Commands whose
 * category is unknown are appended under `Content` so nothing can get lost.
 */
export function groupSlashCommands(
  commands: readonly SlashCommandDefinition[]
): SlashCommandGroup[] {
  const groups: SlashCommandGroup[] = []

  for (const category of SLASH_CATEGORY_ORDER) {
    const matching = commands.filter((command) => command.category === category)
    if (matching.length > 0) groups.push({ category, commands: matching })
  }

  const grouped = new Set(groups.flatMap((group) => group.commands))
  const leftovers = commands.filter((command) => !grouped.has(command))
  if (leftovers.length > 0) {
    const contentGroup = groups.find((group) => group.category === 'Content')
    if (contentGroup) {
      contentGroup.commands = [...contentGroup.commands, ...leftovers]
    } else {
      groups.push({ category: 'Content', commands: leftovers })
    }
  }

  return groups
}

// ── Sub-steps ("pick a note", "pick a data sheet", table size, …) ─────────

export interface SlashInlineOption {
  id: string
  label: string
  /** Secondary line — folder name, sheet size, … */
  description?: string
  keywords?: string[]
}

/**
 * A picker the host app supplies for one command. Choosing the command opens a
 * second palette view with `load()`'s rows instead of running the command;
 * `apply()` is called with the picked row id (the palette deletes the trigger
 * text first, exactly like a command from the first view).
 */
export interface SlashInlinePicker {
  /** Header above the rows, e.g. "Pick a note". */
  title: string
  load: () => Promise<SlashInlineOption[]> | SlashInlineOption[]
  apply: (optionId: string) => void
}

/** Command id → picker. Anything missing runs as a normal command. */
export type SlashInlinePickers = Partial<Record<SlashCommandId, SlashInlinePicker>>

/** Filter the rows of a sub-step (label, keywords and description). */
export function filterSlashOptions(
  query: string,
  options: readonly SlashInlineOption[]
): SlashInlineOption[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return options.slice()

  return options
    .map((option, index) => ({
      option,
      index,
      score: scoreCommand(trimmed, {
        label: option.label,
        keywords: option.keywords ?? [],
      }),
    }))
    .map((entry) =>
      entry.score > 0
        ? entry
        : {
            ...entry,
            // Matching the secondary line (folder, size, …) is still useful.
            score: (entry.option.description ?? '').toLowerCase().includes(trimmed) ? 30 : -1,
          }
    )
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.option)
}

/**
 * Which palette row to highlight after a (re)filter of the command list.
 *
 * * empty query + fresh open → the command the user used last, so `Enter`
 *   repeats it,
 * * query changed → the first row (best match),
 * * unchanged query (caret moved, mouse hovered) → keep what the user had.
 */
export function resolveCommandHighlight(options: {
  items: readonly SlashCommandDefinition[]
  query: string
  previousQuery: string | null
  previousIndex: number
  lastUsedId: SlashCommandId | null
}): number {
  const { items, query, previousQuery, previousIndex, lastUsedId } = options
  if (items.length === 0) return 0

  const clamped = Math.min(Math.max(previousIndex, 0), items.length - 1)
  if (query !== '') return query !== previousQuery ? 0 : clamped

  if (previousQuery !== null && previousQuery !== '') {
    // Just got back to the full palette — repeat-friendly highlight.
    const preferred = lastUsedId ? items.findIndex((item) => item.id === lastUsedId) : -1
    return preferred >= 0 ? preferred : 0
  }

  return previousQuery === null
    ? lastUsedId
      ? Math.max(
          items.findIndex((item) => item.id === lastUsedId),
          0
        )
      : 0
    : clamped
}

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
