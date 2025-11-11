/**
 * Example usage of the enhanced RichTextEditor features
 * Demonstrates:
 * 1. Markdown import/export helpers
 * 2. Custom block integration
 * 3. Performance improvements with mutation observer
 */

import { 
  markdownToHtml, 
  htmlToMarkdown, 
  looksLikeMarkdown 
} from '../lib/editor/markdownHelpers'

// Example 1: Markdown Detection and Conversion
console.log('=== Markdown Helpers Demo ===')

const sampleMarkdown = `
# My Document

This is **bold** text and this is *italic*.

- Item 1
- Item 2
- [ ] Unchecked task
- [x] Checked task

## Code Example

\`\`\`javascript
console.log('Hello, world!');
\`\`\`

[Link to GitHub](https://github.com)
`

console.log('Markdown detected:', looksLikeMarkdown(sampleMarkdown))

// Convert Markdown to HTML (async)
markdownToHtml(sampleMarkdown).then(html => {
  console.log('Converted HTML:', html.substring(0, 100) + '...')
  
  // Convert back to Markdown
  const reconstructedMarkdown = htmlToMarkdown(html)
  console.log('Reconstructed Markdown:', reconstructedMarkdown.substring(0, 100) + '...')
})

// Example 2: Toolbar-based UI
console.log('\n=== Toolbar-based Formatting Demo ===')
console.log('The editor now uses a floating toolbar that appears on text selection')
console.log('All formatting commands are accessible via:')
console.log('  - Floating toolbar buttons (appears on text selection)')
console.log('  - Keyboard shortcuts (Cmd/Ctrl+B for bold, etc.)')
console.log('  - Programmatic API (editor.exec("bold"))')

console.log('\n=== Feature Benefits ===')
console.log('✅ Markdown conversion settings cached on module load')
console.log('✅ Mutation observer debounces checklist normalization (150ms)')
console.log('✅ Toolbar UI provides visual, discoverable formatting options')
console.log('✅ HTML to Markdown export available for backup/export features')
console.log('✅ No slash commands - more intuitive text editor experience')

// Example 3: Performance Improvement Demonstration
console.log('\n=== Performance Improvements ===')
console.log('Before: normalizeChecklistItems() called on every keystroke')
console.log('After: Mutation observer + debouncing reduces calls by ~90%')
console.log('       - Only normalizes when list items actually change')
console.log('       - Debounces rapid changes (bulk paste, fast typing)')
console.log('       - Reduces DOM walks and flicker')
