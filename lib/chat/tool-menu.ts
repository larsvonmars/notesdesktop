/**
 * Curated list of tools the user can force from the chat input's tool menu.
 * Client-safe: names and display metadata only.
 */

export interface ChatToolMenuEntry {
  /** Tool name as registered with the model. */
  toolName: string
  label: string
  emoji: string
  description: string
}

export const CHAT_TOOL_MENU: ChatToolMenuEntry[] = [
  { toolName: 'search_notes', label: 'Search Notes', emoji: '🔎', description: 'Search across your notes' },
  { toolName: 'list_notes', label: 'My Notes', emoji: '📝', description: 'List your notes and folders' },
  { toolName: 'read_note', label: 'Read Note', emoji: '📄', description: 'Open a note and summarise it' },
  { toolName: 'create_note', label: 'Write Note', emoji: '✍️', description: 'Create a new note from your prompt' },
  { toolName: 'update_note', label: 'Edit Note', emoji: '📝', description: 'Rename, rewrite or file an existing note' },
  { toolName: 'create_mindmap_note', label: 'Mindmap', emoji: '🕸️', description: 'Turn an idea into a mindmap note' },
  { toolName: 'create_data_sheet_note', label: 'Data Sheet', emoji: '📊', description: 'Turn a table into a data-sheet note' },
  { toolName: 'create_bullet_journal_note', label: 'Journal', emoji: '📓', description: 'Create a bullet-journal note' },
  { toolName: 'list_tasks', label: 'My Tasks', emoji: '📋', description: 'Review your tasks and due dates' },
  { toolName: 'create_task', label: 'Create Task', emoji: '✅', description: 'Add a task to your planner' },
  { toolName: 'update_task', label: 'Edit Task', emoji: '📌', description: 'Change a task status, priority or due date' },
  { toolName: 'list_events', label: 'Calendar', emoji: '📅', description: 'Review upcoming calendar events' },
  { toolName: 'create_event', label: 'New Event', emoji: '🗓️', description: 'Schedule a calendar event' },
  { toolName: 'list_projects', label: 'Projects', emoji: '📁', description: 'List your projects and progress' },
  { toolName: 'get_workspace_overview', label: 'Overview', emoji: '🧭', description: 'Summarise your whole workspace' },
  { toolName: 'list_decks', label: 'My Decks', emoji: '🎓', description: 'List your Learn flashcard decks' },
  { toolName: 'add_cards', label: 'Add Flashcards', emoji: '🃏', description: 'Add cards to a Learn deck' },
  { toolName: 'get_cards', label: 'Deck Cards', emoji: '📇', description: 'Read the cards in a Learn deck' },
  { toolName: 'get_stats', label: 'Learning Stats', emoji: '📈', description: 'Review XP, streaks and study activity' },
  { toolName: 'get_current_date', label: 'Date & Time', emoji: '🕐', description: 'Get the current date and time' },
]

const TOOL_MENU_NAMES = new Set(CHAT_TOOL_MENU.map((entry) => entry.toolName))

/** Returns the tool name when it is in the menu whitelist, otherwise null. */
export function validateForcedTool(name: string | null | undefined): string | null {
  return name && TOOL_MENU_NAMES.has(name) ? name : null
}

export function getToolMenuEntry(name: string | null | undefined): ChatToolMenuEntry | undefined {
  if (!name) return undefined
  return CHAT_TOOL_MENU.find((entry) => entry.toolName === name)
}
