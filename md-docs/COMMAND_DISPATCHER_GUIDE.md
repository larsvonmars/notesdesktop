# Custom Command Dispatcher - Implementation Guide

This document explains the modern Range-based editing system implemented in the RichTextEditor component.

## Overview

We've replaced the deprecated `document.execCommand` API with a custom command dispatcher that uses the Selection and Range APIs directly. This provides better control, consistency, and maintainability.

## Architecture

### 1. Command Dispatcher (`lib/editor/commandDispatcher.ts`)

Handles inline and block formatting through manual DOM manipulation:

**Inline Styles:**
- `applyInlineStyle(tagName)` - Wraps selections with semantic tags
- Supports: `<strong>`, `<em>`, `<code>`, `<u>`, `<s>`
- Automatically detects existing formatting and toggles it
- Handles both collapsed (empty) and expanded selections

**Block Formats:**
- `applyBlockFormat(tagName)` - Swaps block-level tags
- Supports: `<p>`, `<h1>`, `<h2>`, `<h3>`, `<blockquote>`
- Preserves cursor position within the block
- Automatically generates IDs for headings (for TOC support)

**Selection Management:**
- `saveSelection()` - Captures current Range as a snapshot
- `restoreSelection(snapshot)` - Restores a saved Range

### 2. DOM Normalizer (`lib/editor/domNormalizer.ts`)

Maintains a clean, predictable DOM structure:

**Operations:**
- Merges adjacent identical inline elements (`<strong>text</strong><strong> more</strong>` → `<strong>text more</strong>`)
- Removes empty inline elements (`<strong></strong>` → removed)
- Unwraps redundant nested tags (`<strong><strong>text</strong></strong>` → `<strong>text</strong>`)
- Merges adjacent text nodes

**Usage:**
- `normalizeEditorContent(element)` - Full editor normalization (runs after each command)
- `sanitizeInlineNodes(range)` - Range-specific normalization
- `normalizeInlineNodes(element)` - Inline-only normalization

### 3. List Handler (`lib/editor/listHandler.ts`)

Dedicated utilities for list operations:

**Features:**
- `createList(type)` - Creates `<ul>` or `<ol>` around selection
- `toggleListType(type)` - Converts between list types
- `toggleChecklistState()` - Adds/removes checkboxes for checklist items
- `mergeAdjacentLists()` - Merges adjacent lists of the same type

**Checklist Support:**
- Automatically marks list items with `checklist-item` class
- Adds `data-checklist` attributes for persistence
- Handles checkbox state with `data-checked` attribute

### 4. History Manager (`lib/editor/historyManager.ts`)

Custom undo/redo stack implementation:

**Features:**
- Snapshot-based history (captures innerHTML + selection state)
- Debounced capture (500ms default) to avoid excessive snapshots
- Maximum stack size (100 snapshots default)
- Range restoration on undo/redo for accurate cursor positioning

**Usage:**
```typescript
const manager = new HistoryManager(editorElement)
manager.initialize() // Capture initial state
manager.push() // Manual capture
manager.undo() // Undo last change
manager.redo() // Redo undone change
```

## Implementation in RichTextEditor

### Initialization

```typescript
// History manager setup
const historyManagerRef = useRef<HistoryManager | null>(null)
const debouncedCaptureRef = useRef<(() => void) | null>(null)

useEffect(() => {
  if (editorRef.current && !historyManagerRef.current) {
    const manager = new HistoryManager(editorRef.current)
    manager.initialize()
    historyManagerRef.current = manager
    debouncedCaptureRef.current = createDebouncedCapture(manager)
  }
}, [])
```

### Command Execution

```typescript
const execCommand = (command: string, valueArg?: string) => {
  // 1. Pre-normalize selection area
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    sanitizeInlineNodes(range)
  }
  
  // 2. Execute command
  switch (command) {
    case 'bold':
      applyInlineStyle('strong')
      break
    // ... other commands
  }
  
  // 3. Post-normalize entire editor
  normalizeEditorContent(editorRef.current)
  mergeAdjacentLists(editorRef.current)
  
  // 4. Emit change (triggers debounced history capture)
  emitChange()
}
```

### Keyboard Shortcuts

All keyboard shortcuts updated to use the new system:

- `Ctrl+B` → Bold (strong)
- `Ctrl+I` → Italic (em)
- `Ctrl+U` → Underline (u)
- `Ctrl+Shift+X` → Strikethrough (s)
- `Ctrl+\`` → Inline code (code)
- `Ctrl+Alt+1/2/3` → Headings (h1/h2/h3)
- `Ctrl+Shift+L` → Unordered list
- `Ctrl+Shift+O` → Ordered list
- `Ctrl+Shift+C` → Checklist
- `Ctrl+Z` → Undo
- `Ctrl+Shift+Z` → Redo

## Benefits

1. **Better Browser Compatibility** - No reliance on deprecated execCommand
2. **Semantic HTML** - Uses proper semantic tags (strong, em vs b, i)
3. **Predictable Structure** - DOM normalization ensures consistency
4. **Selection Preservation** - Accurate cursor positioning after operations
5. **Custom Undo/Redo** - Full control over history stack
6. **Maintainability** - Clear, testable code structure

## Testing

The implementation has been manually tested for:
- ✅ Inline formatting (bold, italic, code, underline, strikethrough)
- ✅ Block formatting (headings, blockquote, paragraph)
- ✅ List creation and conversion (ul, ol, checklist)
- ✅ Selection preservation
- ✅ DOM normalization
- ✅ Undo/redo functionality
- ✅ Keyboard shortcuts

## Future Enhancements

Potential improvements:
1. Add unit tests for each utility module
2. Implement table support
3. Add image insertion via Range API
4. Support for nested lists
5. Rich text paste handling improvements
6. Performance optimization for large documents
