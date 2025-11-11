# Toolbar-Based Rich Text Editor Guide

## Overview

The RichTextEditor has been refactored to use a **toolbar-based UI** instead of slash commands. This provides a more intuitive, standard text editor experience that's easier to discover and use.

## What Changed

### Before (Slash Commands)
- Type `/` to open a command menu
- Type to filter commands (e.g., `/heading`)
- Arrow keys to navigate, Enter to select
- Required memorizing or discovering commands

### After (Toolbar UI)
- **Floating Toolbar** appears automatically when you select text
- All formatting options visible as buttons with icons
- Click button or use keyboard shortcut
- No learning curve - immediate visual feedback

## Available Formatting Options

### Floating Toolbar

The floating toolbar appears when you select text and includes:

#### Text Formatting
- **Bold** (`Cmd/Ctrl+B`) - Make text bold
- **Italic** (`Cmd/Ctrl+I`) - Make text italic
- **Underline** (`Cmd/Ctrl+U`) - Underline text
- **Strikethrough** (`Cmd/Ctrl+Shift+X`) - Strike through text
- **Code** (`Cmd/Ctrl+\``) - Inline code formatting
- **Link** (`Cmd/Ctrl+K`) - Insert hyperlink

#### Headings
- **H1** (`Cmd/Ctrl+Alt+1`) - Large heading
- **H2** (`Cmd/Ctrl+Alt+2`) - Medium heading
- **H3** (`Cmd/Ctrl+Alt+3`) - Small heading

#### Lists & Blocks
- **Bullet List** (`Cmd/Ctrl+Shift+L`) - Unordered list
- **Numbered List** (`Cmd/Ctrl+Shift+O`) - Ordered list
- **Checklist** (`Cmd/Ctrl+Shift+C`) - Task list with checkboxes
- **Quote** (`Cmd/Ctrl+Shift+B`) - Block quote

#### Special Features
- **Table** - Insert table (opens size picker dialog)
- **Note Link** - Link to another note in workspace
- **Undo** (`Cmd/Ctrl+Z`) - Undo last change
- **Redo** (`Cmd/Ctrl+Shift+Z`) - Redo undone change

## How to Use

### Basic Text Formatting

1. Select text you want to format
2. Floating toolbar appears automatically
3. Click the formatting button you want

**Example:**
```
Select "important text" → Click Bold button → **important text**
```

### Inserting Special Elements

#### Tables
1. Position cursor where you want the table
2. Click the **Table** button in toolbar
3. Hover over grid to select size (e.g., 3×3)
4. Click to insert

#### Note Links
1. Position cursor where you want the link
2. Click the **Note Link** button in toolbar
3. Search and select the note you want to link to
4. Link is inserted at cursor position

### Keyboard Shortcuts

All formatting commands have keyboard shortcuts for power users:

| Action | Shortcut |
|--------|----------|
| Bold | `Cmd/Ctrl+B` |
| Italic | `Cmd/Ctrl+I` |
| Underline | `Cmd/Ctrl+U` |
| Strikethrough | `Cmd/Ctrl+Shift+X` |
| Code | `Cmd/Ctrl+\`` |
| Link | `Cmd/Ctrl+K` |
| Heading 1 | `Cmd/Ctrl+Alt+1` |
| Heading 2 | `Cmd/Ctrl+Alt+2` |
| Heading 3 | `Cmd/Ctrl+Alt+3` |
| Bullet List | `Cmd/Ctrl+Shift+L` |
| Numbered List | `Cmd/Ctrl+Shift+O` |
| Checklist | `Cmd/Ctrl+Shift+C` |
| Quote | `Cmd/Ctrl+Shift+B` |
| Undo | `Cmd/Ctrl+Z` |
| Redo | `Cmd/Ctrl+Shift+Z` |
| Search | `Cmd/Ctrl+F` |

## Programmatic API

For developers integrating the editor, you can control it programmatically:

```typescript
import type { RichTextEditorHandle } from '@/components/RichTextEditor'

const editorRef = useRef<RichTextEditorHandle>(null)

// Apply formatting
editorRef.current?.exec('bold')
editorRef.current?.exec('heading1')

// Insert special elements
editorRef.current?.showTableDialog()
editorRef.current?.requestNoteLink()

// Show dialogs
editorRef.current?.showLinkDialog()
editorRef.current?.showSearchDialog()

// Query state
const isBold = editorRef.current?.queryCommandState('bold')

// Export content
const html = editorRef.current?.getHTML()
const markdown = editorRef.current?.getMarkdown()
```

## Custom Blocks

To add custom block types (like callouts, embeds, etc.):

```typescript
import type { CustomBlockDescriptor } from '@/components/RichTextEditor'

const calloutBlock: CustomBlockDescriptor = {
  type: 'callout',
  render: (payload) => {
    const text = payload?.text || 'Callout'
    return `<div class="callout">${text}</div>`
  },
  parse: (el) => ({ text: el.textContent })
}

// Pass to editor
<RichTextEditor 
  customBlocks={[calloutBlock]}
  onCustomCommand={(commandId) => {
    if (commandId === 'callout') {
      // Show callout dialog
    }
  }}
/>

// Insert programmatically
editorRef.current?.insertCustomBlock('callout', { text: 'Important!' })
```

## Benefits

### For Users
- ✅ **Easier to discover** - All options visible in toolbar
- ✅ **No memorization** - Icons and labels show what each button does
- ✅ **Familiar UX** - Works like Google Docs, Word, Notion
- ✅ **Visual feedback** - Active formatting highlighted in toolbar
- ✅ **Touch-friendly** - Large clickable buttons work on tablets

### For Developers
- ✅ **Simpler code** - ~400 lines removed
- ✅ **Standard patterns** - Toolbar UI is well-understood
- ✅ **Better maintainability** - Fewer edge cases to handle
- ✅ **Easier testing** - Button clicks vs. slash command navigation
- ✅ **Flexible** - Easy to add/remove toolbar buttons

## Migration Notes

### From Slash Commands

If you were using slash commands before:

**Old way:**
```
Type: /h1
Select: Heading 1
```

**New way:**
1. Select text → Click **H1** button
2. Or use keyboard: `Cmd/Ctrl+Alt+1`

### Custom Commands

**Old way:**
```typescript
registerSlashCommand({
  id: 'custom',
  label: 'Custom',
  icon: <Icon />,
  command: () => { /* ... */ }
})
```

**New way:**
```typescript
// Add button to toolbar (in NoteEditor or wrapper component)
const customToolbar = [
  {
    label: 'Custom',
    icon: <Icon />,
    onClick: () => editorRef.current?.insertCustomBlock('custom')
  }
]
```

## See Also

- [Editor Enhancements](./EDITOR_ENHANCEMENTS.md) - Performance improvements
- [Note Link Feature](./NOTE_LINK_QUICKSTART.md) - Linking notes together
- [Custom Blocks Example](./examples/custom-blocks.ts) - Creating custom block types
