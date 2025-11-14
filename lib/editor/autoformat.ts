/**
 * Autoformatting Utilities
 * Automatically formats text as you type (e.g., **text** becomes bold)
 */

export interface AutoformatPattern {
  pattern: RegExp
  replacement: (match: string, ...groups: string[]) => string
  requiresSpace?: boolean // Only trigger after space/enter
}

/**
 * Markdown-style autoformatting patterns
 */
export const AUTOFORMAT_PATTERNS: AutoformatPattern[] = [
  // Bold with **
  {
    pattern: /\*\*([^*]+)\*\*$/,
    replacement: (match, text) => `<strong>${text}</strong>`,
    requiresSpace: true
  },
  // Italic with *
  {
    pattern: /(?<!\*)\*([^*]+)\*(?!\*)$/,
    replacement: (match, text) => `<em>${text}</em>`,
    requiresSpace: true
  },
  // Strikethrough with ~~
  {
    pattern: /~~([^~]+)~~$/,
    replacement: (match, text) => `<s>${text}</s>`,
    requiresSpace: true
  },
  // Inline code with `
  {
    pattern: /`([^`]+)`$/,
    replacement: (match, text) => `<code>${text}</code>`,
    requiresSpace: true
  },
  // Underline with __
  {
    pattern: /__([^_]+)__$/,
    replacement: (match, text) => `<u>${text}</u>`,
    requiresSpace: true
  },
]

/**
 * Check if autoformatting should be applied
 */
export function shouldApplyAutoformat(event: KeyboardEvent): boolean {
  // Apply on space or enter
  return event.key === ' ' || event.key === 'Enter'
}

/**
 * Apply autoformatting to text node
 * Returns true if formatting was applied
 */
export function applyAutoformat(
  textNode: Text,
  cursorOffset: number
): boolean {
  const text = textNode.textContent || ''
  const beforeCursor = text.substring(0, cursorOffset)
  
  // Try each pattern
  for (const { pattern, replacement } of AUTOFORMAT_PATTERNS) {
    const match = beforeCursor.match(pattern)
    if (match) {
      const matchStart = cursorOffset - match[0].length
      const matchEnd = cursorOffset
      
      // Create replacement HTML
      const replacementHtml = replacement(match[0], ...match.slice(1))
      
      // Replace the matched text
      const range = document.createRange()
      range.setStart(textNode, matchStart)
      range.setEnd(textNode, matchEnd)
      
      const fragment = range.createContextualFragment(replacementHtml)
      range.deleteContents()
      range.insertNode(fragment)
      
      // Move cursor after the inserted element
      const selection = window.getSelection()
      if (selection) {
        const newRange = document.createRange()
        const insertedElement = fragment.lastChild
        
        if (insertedElement) {
          if (insertedElement.nodeType === Node.TEXT_NODE) {
            newRange.setStart(insertedElement, insertedElement.textContent?.length || 0)
          } else {
            newRange.setStartAfter(insertedElement)
          }
          newRange.collapse(true)
          selection.removeAllRanges()
          selection.addRange(newRange)
        }
      }
      
      return true
    }
  }
  
  return false
}

/**
 * List prefix autoformatting patterns
 * Applied at the start of a new line
 */
export const LIST_PREFIX_PATTERNS = [
  // Unordered list with - or *
  {
    pattern: /^[-*]\s$/,
    action: 'unordered-list' as const
  },
  // Ordered list with 1.
  {
    pattern: /^\d+\.\s$/,
    action: 'ordered-list' as const
  },
  // Checklist with [ ] or [x]
  {
    pattern: /^\[[ x]\]\s$/i,
    action: 'checklist' as const
  },
  // Heading with #
  {
    pattern: /^#\s$/,
    action: 'heading1' as const
  },
  {
    pattern: /^##\s$/,
    action: 'heading2' as const
  },
  {
    pattern: /^###\s$/,
    action: 'heading3' as const
  },
  // Blockquote with >
  {
    pattern: /^>\s$/,
    action: 'blockquote' as const
  },
  // Code block with ```
  {
    pattern: /^```$/,
    action: 'code-block' as const
  },
  // Horizontal rule with ---
  {
    pattern: /^---$/,
    action: 'horizontal-rule' as const
  }
]

/**
 * Check if list prefix pattern matches and return the action
 */
export function checkListPrefixPattern(text: string): string | null {
  for (const { pattern, action } of LIST_PREFIX_PATTERNS) {
    if (pattern.test(text)) {
      return action
    }
  }
  return null
}
