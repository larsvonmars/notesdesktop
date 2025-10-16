/**
 * Slash Command Configuration
 * Centralized configuration for slash commands with extension hooks
 */

import type { ReactNode } from 'react'

export type RichTextCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'unordered-list'
  | 'ordered-list'
  | 'blockquote'
  | 'checklist'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'undo'
  | 'redo'
  | 'link'
  | 'horizontal-rule'

export interface SlashCommand {
  id: string
  label: string
  icon: ReactNode
  command: RichTextCommand | (() => void)
  description: string
  category?: 'formatting' | 'blocks' | 'lists' | 'media'
  keywords?: string[]
}

// Custom commands registry for extensions
const customCommands: SlashCommand[] = []

/**
 * Get all available slash commands (built-in + custom)
 */
export function getSlashCommands(customIcons: {
  Type: ReactNode
  List: ReactNode
  CheckSquare: ReactNode
  Quote: ReactNode
  Code: ReactNode
  Minus: ReactNode
  Link: ReactNode
}): SlashCommand[] {
  const builtInCommands: SlashCommand[] = [
    {
      id: 'h1',
      label: 'Heading 1',
      icon: customIcons.Type,
      command: 'heading1',
      description: 'Large heading',
      category: 'formatting',
      keywords: ['h1', 'title', 'header']
    },
    {
      id: 'h2',
      label: 'Heading 2',
      icon: customIcons.Type,
      command: 'heading2',
      description: 'Medium heading',
      category: 'formatting',
      keywords: ['h2', 'subtitle', 'header']
    },
    {
      id: 'h3',
      label: 'Heading 3',
      icon: customIcons.Type,
      command: 'heading3',
      description: 'Small heading',
      category: 'formatting',
      keywords: ['h3', 'section', 'header']
    },
    {
      id: 'ul',
      label: 'Bullet List',
      icon: customIcons.List,
      command: 'unordered-list',
      description: 'Create a bullet list',
      category: 'lists',
      keywords: ['ul', 'bullets', 'unordered']
    },
    {
      id: 'ol',
      label: 'Numbered List',
      icon: customIcons.List,
      command: 'ordered-list',
      description: 'Create a numbered list',
      category: 'lists',
      keywords: ['ol', 'numbers', 'ordered']
    },
    {
      id: 'check',
      label: 'Checklist',
      icon: customIcons.CheckSquare,
      command: 'checklist',
      description: 'Create a checklist',
      category: 'lists',
      keywords: ['todo', 'task', 'checkbox']
    },
    {
      id: 'quote',
      label: 'Quote',
      icon: customIcons.Quote,
      command: 'blockquote',
      description: 'Insert a quote',
      category: 'blocks',
      keywords: ['blockquote', 'citation']
    },
    {
      id: 'code',
      label: 'Code',
      icon: customIcons.Code,
      command: 'code',
      description: 'Inline code',
      category: 'formatting',
      keywords: ['monospace', 'code']
    },
    {
      id: 'hr',
      label: 'Divider',
      icon: customIcons.Minus,
      command: 'horizontal-rule',
      description: 'Insert horizontal rule',
      category: 'blocks',
      keywords: ['separator', 'line', 'break']
    },
    {
      id: 'link',
      label: 'Link',
      icon: customIcons.Link,
      command: 'link',
      description: 'Insert a link',
      category: 'media',
      keywords: ['url', 'hyperlink', 'anchor']
    },
  ]
  
  return [...builtInCommands, ...customCommands]
}

/**
 * Register a custom slash command
 */
export function registerSlashCommand(command: SlashCommand): void {
  // Check if command with this ID already exists
  const existingIndex = customCommands.findIndex(cmd => cmd.id === command.id)
  
  if (existingIndex >= 0) {
    // Replace existing command
    customCommands[existingIndex] = command
  } else {
    // Add new command
    customCommands.push(command)
  }
}

/**
 * Unregister a custom slash command
 */
export function unregisterSlashCommand(commandId: string): boolean {
  const index = customCommands.findIndex(cmd => cmd.id === commandId)
  
  if (index >= 0) {
    customCommands.splice(index, 1)
    return true
  }
  
  return false
}

/**
 * Get a specific slash command by ID
 */
export function getSlashCommand(commandId: string, icons?: any): SlashCommand | undefined {
  const allCommands = icons ? getSlashCommands(icons) : [...customCommands]
  return allCommands.find(cmd => cmd.id === commandId)
}

/**
 * Filter slash commands by query
 */
export function filterSlashCommands(
  commands: SlashCommand[],
  query: string
): SlashCommand[] {
  if (!query.trim()) {
    return commands
  }
  
  const lowerQuery = query.toLowerCase()
  
  return commands.filter(cmd => {
    // Check label
    if (cmd.label.toLowerCase().includes(lowerQuery)) {
      return true
    }
    
    // Check description
    if (cmd.description.toLowerCase().includes(lowerQuery)) {
      return true
    }
    
    // Check keywords
    if (cmd.keywords && cmd.keywords.some(kw => kw.toLowerCase().includes(lowerQuery))) {
      return true
    }
    
    return false
  })
}

/**
 * Clear all custom slash commands
 */
export function clearCustomSlashCommands(): void {
  customCommands.length = 0
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(
  category: SlashCommand['category'],
  icons?: any
): SlashCommand[] {
  const allCommands = icons ? getSlashCommands(icons) : [...customCommands]
  return allCommands.filter(cmd => cmd.category === category)
}
