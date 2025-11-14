/**
 * Keyboard Shortcuts Reference
 * Complete list of keyboard shortcuts available in the Rich Text Editor
 */

export interface KeyboardShortcut {
  keys: string[]
  description: string
  category: 'formatting' | 'blocks' | 'navigation' | 'editing'
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // Formatting shortcuts
  {
    keys: ['⌘B', 'Ctrl+B'],
    description: 'Bold',
    category: 'formatting'
  },
  {
    keys: ['⌘I', 'Ctrl+I'],
    description: 'Italic',
    category: 'formatting'
  },
  {
    keys: ['⌘U', 'Ctrl+U'],
    description: 'Underline',
    category: 'formatting'
  },
  {
    keys: ['⌘⇧X', 'Ctrl+Shift+X'],
    description: 'Strikethrough',
    category: 'formatting'
  },
  {
    keys: ['⌘`', 'Ctrl+`'],
    description: 'Code',
    category: 'formatting'
  },
  {
    keys: ['⌘K', 'Ctrl+K'],
    description: 'Insert Link',
    category: 'formatting'
  },
  
  // Block shortcuts
  {
    keys: ['⌘⇧B', 'Ctrl+Shift+B'],
    description: 'Blockquote',
    category: 'blocks'
  },
  {
    keys: ['⌘⇧L', 'Ctrl+Shift+L'],
    description: 'Bulleted List',
    category: 'blocks'
  },
  {
    keys: ['⌘⇧O', 'Ctrl+Shift+O'],
    description: 'Numbered List',
    category: 'blocks'
  },
  {
    keys: ['⌘⇧C', 'Ctrl+Shift+C'],
    description: 'Checklist',
    category: 'blocks'
  },
  {
    keys: ['⌘⌥1', 'Ctrl+Alt+1'],
    description: 'Heading 1',
    category: 'blocks'
  },
  {
    keys: ['⌘⌥2', 'Ctrl+Alt+2'],
    description: 'Heading 2',
    category: 'blocks'
  },
  {
    keys: ['⌘⌥3', 'Ctrl+Alt+3'],
    description: 'Heading 3',
    category: 'blocks'
  },
  
  // Editing shortcuts
  {
    keys: ['⌘Z', 'Ctrl+Z'],
    description: 'Undo',
    category: 'editing'
  },
  {
    keys: ['⌘⇧Z', 'Ctrl+Shift+Z'],
    description: 'Redo',
    category: 'editing'
  },
  {
    keys: ['⌘F', 'Ctrl+F'],
    description: 'Find & Replace',
    category: 'editing'
  },
]

/**
 * Autoformat patterns that work as you type
 */
export const AUTOFORMAT_HELP = [
  { pattern: '**text**', description: 'Bold text' },
  { pattern: '*text*', description: 'Italic text' },
  { pattern: '~~text~~', description: 'Strikethrough text' },
  { pattern: '`code`', description: 'Inline code' },
  { pattern: '__text__', description: 'Underline text' },
  { pattern: '# ', description: 'Heading 1 (at start of line)' },
  { pattern: '## ', description: 'Heading 2 (at start of line)' },
  { pattern: '### ', description: 'Heading 3 (at start of line)' },
  { pattern: '- ', description: 'Bulleted list (at start of line)' },
  { pattern: '1. ', description: 'Numbered list (at start of line)' },
  { pattern: '[ ] ', description: 'Checklist (at start of line)' },
  { pattern: '> ', description: 'Blockquote (at start of line)' },
  { pattern: '---', description: 'Horizontal rule' },
]

/**
 * Get shortcuts by category
 */
export function getShortcutsByCategory(category: KeyboardShortcut['category']): KeyboardShortcut[] {
  return KEYBOARD_SHORTCUTS.filter(s => s.category === category)
}

/**
 * Format shortcut keys for display (show Mac or Windows version)
 */
export function formatShortcutKeys(keys: string[]): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  return isMac ? keys[0] : keys[1] || keys[0]
}
