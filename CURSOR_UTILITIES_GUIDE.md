# Cursor Position Utilities - Developer Guide

## Overview

The `lib/editor/cursorPosition.ts` module provides a comprehensive set of utilities for managing cursor positioning in the RichTextEditor. These utilities are designed to work reliably across different environments, including browsers and Tauri WebView.

## Why Use These Utilities?

1. **Consistency**: All cursor operations use the same underlying logic
2. **Reliability**: Proper timing for WebView/Tauri compatibility
3. **Maintainability**: Centralized code is easier to debug and enhance
4. **Safety**: Built-in checks for DOM validity and element existence
5. **Focus Management**: Explicit focus handling prevents cursor jumping

## Core Functions

### Basic Cursor Positioning

#### `setCursorAtEnd(element: HTMLElement): boolean`

Positions the cursor at the end of an element.

```typescript
const heading = document.createElement('h1')
heading.textContent = 'My Heading'
editor.appendChild(heading)

if (setCursorAtEnd(heading)) {
  console.log('Cursor positioned at end')
}
```

#### `setCursorAtStart(element: HTMLElement): boolean`

Positions the cursor at the start of an element.

```typescript
const paragraph = document.querySelector('p')
if (paragraph && setCursorAtStart(paragraph)) {
  console.log('Cursor positioned at start')
}
```

### Smart Positioning

#### `positionCursorInElement(element, position, editorElement?)`

The recommended way to position cursor in an element. Handles focus management and uses `requestAnimationFrame` for reliability.

```typescript
// Position at end (default)
positionCursorInElement(newHeading, 'end', editorRef.current)

// Position at start
positionCursorInElement(newParagraph, 'start', editorRef.current)
```

**Benefits:**
- Automatically focuses the editor element
- Uses `requestAnimationFrame` for DOM stability
- Verifies element is still in DOM before positioning
- Provides fallback positioning if operation fails

### Save/Restore Patterns

#### `saveCursorPosition(): CursorSnapshot | null`

Saves the current cursor position for later restoration. Useful for operations that temporarily lose focus (like opening dialogs).

```typescript
// Save position before opening dialog
const snapshot = saveCursorPosition()

// ... dialog opens and user makes selection ...

// Restore position before inserting
restoreCursorPosition(snapshot, editorRef.current)
```

#### `restoreCursorPosition(snapshot, editorElement?): boolean`

Restores a previously saved cursor position.

```typescript
const handleDialogConfirm = () => {
  if (restoreCursorPosition(savedSnapshot, editor)) {
    // Insert content at restored position
    insertContent()
  }
}
```

### Text Offset Based Positioning

#### `getTextOffsetInBlock(block: HTMLElement): number`

Gets the cursor position as a text offset within a block element. Useful for preserving position across DOM changes.

```typescript
// Before changing the DOM
const offset = getTextOffsetInBlock(paragraph)

// Make DOM changes...
paragraph.innerHTML = transformedHTML

// Restore position
restoreTextOffsetInBlock(paragraph, offset)
```

#### `restoreTextOffsetInBlock(block, targetOffset): boolean`

Restores cursor to a specific text offset within a block.

```typescript
// Useful when converting between block types
const offset = getTextOffsetInBlock(oldBlock)
const newBlock = convertToHeading(oldBlock)
restoreTextOffsetInBlock(newBlock, offset)
```

### Marker-Based Positioning

#### `createCursorMarker(): HTMLSpanElement | null`

Creates a hidden marker element at the cursor position. Useful for complex DOM operations where selection may be lost.

```typescript
// Before complex operation
const marker = createCursorMarker()

// Perform complex DOM manipulations...
restructureDOM()

// Restore cursor to marker
if (marker) {
  restoreCursorToMarker(marker) // Automatically removes marker
}
```

#### `restoreCursorToMarker(marker): boolean`

Restores cursor to a marker position and removes the marker.

### Timing Utilities

#### `CURSOR_TIMING` Constants

Pre-defined timing constants for different operation types:

```typescript
export const CURSOR_TIMING = {
  SHORT: 10,       // Simple operations
  MEDIUM: 50,      // DOM changes
  LONG: 80,        // Complex operations (heading creation)
  EXTRA_LONG: 150  // Operations needing significant settling
}
```

#### `applyCursorOperation(operation, delay?)`

Wraps a cursor operation with appropriate timing using `requestAnimationFrame` and `setTimeout`.

```typescript
// Use default MEDIUM delay
applyCursorOperation(() => {
  positionCursorInElement(element, 'end')
})

// Use custom delay
applyCursorOperation(() => {
  restoreTextOffsetInBlock(block, offset)
}, CURSOR_TIMING.LONG)
```

## Common Patterns

### Pattern 1: Creating a New Block Element

```typescript
const createHeading = (level: 1 | 2 | 3, editor: HTMLElement) => {
  // Create element
  const heading = document.createElement(`h${level}`)
  heading.textContent = ''
  
  // Insert into DOM
  editor.appendChild(heading)
  
  // Position cursor with proper timing
  positionCursorInElement(heading, 'start', editor)
}
```

### Pattern 2: Converting Between Block Types

```typescript
const convertToHeading = (paragraph: HTMLElement, editor: HTMLElement) => {
  // Save text offset
  const offset = getTextOffsetInBlock(paragraph)
  
  // Create new heading
  const heading = document.createElement('h2')
  heading.innerHTML = paragraph.innerHTML
  
  // Replace in DOM
  paragraph.parentNode?.replaceChild(heading, paragraph)
  
  // Restore cursor with timing
  applyCursorOperation(() => {
    restoreTextOffsetInBlock(heading, offset)
  }, CURSOR_TIMING.LONG)
}
```

### Pattern 3: Dialog-Based Operations

```typescript
const insertLink = () => {
  // Save position before dialog opens
  const snapshot = saveCursorPosition()
  
  // Open dialog
  setShowLinkDialog(true)
}

const applyLink = (url: string, text: string) => {
  // Restore position
  restoreCursorPosition(snapshot, editorRef.current)
  
  // Insert link
  const link = document.createElement('a')
  link.href = url
  link.textContent = text
  
  const selection = window.getSelection()
  const range = selection?.getRangeAt(0)
  range?.insertNode(link)
  
  // Position after link
  applyCursorOperation(() => {
    const newRange = document.createRange()
    newRange.setStartAfter(link)
    newRange.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(newRange)
  }, CURSOR_TIMING.SHORT)
}
```

### Pattern 4: Complex DOM Manipulation

```typescript
const restructureContent = (editor: HTMLElement) => {
  // Create marker at cursor position
  const marker = createCursorMarker()
  
  // Perform complex operations
  normalizeDOM(editor)
  mergeAdjacentBlocks(editor)
  cleanupEmptyElements(editor)
  
  // Restore cursor
  if (marker) {
    applyCursorOperation(() => {
      restoreCursorToMarker(marker)
    }, CURSOR_TIMING.MEDIUM)
  }
}
```

## Best Practices

### 1. Always Focus Before Cursor Operations

```typescript
// ✅ Good
editor.focus()
positionCursorInElement(element, 'end', editor)

// ❌ Bad - cursor may not be positioned correctly
positionCursorInElement(element, 'end')
```

### 2. Use Appropriate Timing

```typescript
// ✅ Good - Simple operation
applyCursorOperation(() => {
  setCursorAtEnd(element)
}, CURSOR_TIMING.SHORT)

// ✅ Good - Complex operation
applyCursorOperation(() => {
  restoreTextOffsetInBlock(block, offset)
}, CURSOR_TIMING.LONG)

// ❌ Bad - No timing
restoreTextOffsetInBlock(block, offset)
```

### 3. Check Return Values

```typescript
// ✅ Good
const saved = saveCursorPosition()
if (saved) {
  // ... do operations ...
  if (restoreCursorPosition(saved, editor)) {
    console.log('Position restored successfully')
  }
}

// ❌ Bad - No checking
const saved = saveCursorPosition()
restoreCursorPosition(saved, editor) // May fail silently
```

### 4. Verify Elements in DOM

```typescript
// ✅ Good
if (element.isConnected) {
  positionCursorInElement(element, 'end', editor)
}

// ❌ Bad - Element might be removed
positionCursorInElement(element, 'end', editor)
```

### 5. Use requestAnimationFrame for DOM Changes

```typescript
// ✅ Good
requestAnimationFrame(() => {
  positionCursorInElement(newElement, 'start', editor)
})

// ✅ Even Better - Use applyCursorOperation
applyCursorOperation(() => {
  positionCursorInElement(newElement, 'start', editor)
})

// ❌ Bad - May execute before DOM is ready
positionCursorInElement(newElement, 'start', editor)
```

## WebView/Tauri Considerations

### Timing is Critical

WebView environments (Tauri) require longer delays than browsers:

```typescript
// Browser: May work immediately
setCursorAtEnd(element)

// Tauri: Needs delay
applyCursorOperation(() => {
  setCursorAtEnd(element)
}, CURSOR_TIMING.LONG)
```

### Focus Management is Essential

```typescript
// Always ensure focus before and after operations
editor.focus()
performOperation()
applyCursorOperation(() => {
  editor.focus()
}, CURSOR_TIMING.MEDIUM)
```

### Verify DOM Stability

```typescript
// Check element is still in DOM
if (!element.isConnected) {
  console.warn('Element removed from DOM')
  return
}
```

## Testing

The cursor utilities have comprehensive test coverage in `tests/cursorPosition.test.ts`:

```bash
npm test -- cursorPosition.test.ts
```

### Example Test

```typescript
it('should save and restore cursor position', () => {
  const p = document.createElement('p')
  const textNode = document.createTextNode('Test')
  p.appendChild(textNode)
  editor.appendChild(p)

  // Set cursor
  const selection = window.getSelection()!
  const range = document.createRange()
  range.setStart(textNode, 2)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)

  // Save
  const snapshot = saveCursorPosition()
  expect(snapshot).toBeTruthy()

  // Restore
  const restored = restoreCursorPosition(snapshot, editor)
  expect(restored).toBe(true)
  expect(selection.getRangeAt(0).startOffset).toBe(2)
})
```

## Troubleshooting

### Cursor Jumping to Wrong Position

**Problem**: Cursor moves to unexpected location after operation.

**Solution**: Use `applyCursorOperation` with appropriate delay:

```typescript
applyCursorOperation(() => {
  positionCursorInElement(element, 'end', editor)
}, CURSOR_TIMING.LONG)
```

### Cursor Lost After Dialog

**Problem**: Cursor position lost when dialog closes.

**Solution**: Save position before opening dialog:

```typescript
const snapshot = saveCursorPosition()
// ... open dialog ...
restoreCursorPosition(snapshot, editor)
```

### Focus Issues in WebView

**Problem**: Cursor positioning doesn't work in Tauri.

**Solution**: Ensure explicit focus management:

```typescript
editor.focus()
applyCursorOperation(() => {
  positionCursorInElement(element, 'end', editor)
  editor.focus()
}, CURSOR_TIMING.LONG)
```

### Selection Restoration Fails

**Problem**: `restoreCursorPosition` returns false.

**Solution**: Check if element was removed from DOM:

```typescript
const snapshot = saveCursorPosition()
// ... perform operations ...
if (snapshot && snapshot.element.isConnected) {
  restoreCursorPosition(snapshot, editor)
} else {
  // Fallback: position at end of editor
  setCursorAtEnd(editor)
}
```

## Migration Guide

### Before (Old Pattern)

```typescript
const selection = window.getSelection()
const range = document.createRange()
range.setStart(element, 0)
range.collapse(true)
selection?.removeAllRanges()
selection?.addRange(range)
```

### After (New Pattern)

```typescript
positionCursorInElement(element, 'start', editor)
```

### Before (Old Timing)

```typescript
setTimeout(() => {
  // position cursor
}, 50)
```

### After (New Timing)

```typescript
applyCursorOperation(() => {
  // position cursor
}, CURSOR_TIMING.MEDIUM)
```

## Further Reading

- [MDN: Selection API](https://developer.mozilla.org/en-US/docs/Web/API/Selection)
- [MDN: Range API](https://developer.mozilla.org/en-US/docs/Web/API/Range)
- [Tauri WebView Documentation](https://tauri.app/v1/guides/features/webview/)
- Related project documentation:
  - `CURSOR_POSITION_FIX.md` - Dialog-based cursor fixes
  - `TAURI_HEADING_CURSOR_FIX.md` - Heading creation fixes
  - `EDITOR_IMPROVEMENTS.md` - General editor enhancements
