# Cursor Position Fix - Summary

## The Problem

When using the `/note-link` slash command:
1. User types text and places cursor in the middle
2. User types `/note-link`
3. Note selection dialog opens
4. **Dialog steals focus and cursor jumps to top**
5. When user selects a note, link is inserted at the top instead of where the cursor was

## The Solution

Implemented a **selection save/restore pattern**:

### Step 1: Save Selection Before Dialog Opens
```typescript
const savedNoteLinkSelection = useRef<Range | null>(null)

const saveNoteLinkSelection = useCallback(() => {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    // Clone the range so it's not affected by focus changes
    savedNoteLinkSelection.current = selection.getRangeAt(0).cloneRange()
  }
}, [])
```

### Step 2: Call Save Before Opening Dialog
```typescript
onCustomSlashCommand={(commandId) => {
  if (commandId === 'note-link') {
    saveNoteLinkSelection() // ← Save cursor position FIRST
    setShowNoteLinkDialog(true)
  }
}}
```

### Step 3: Restore Selection Before Inserting
```typescript
const handleNoteLinkSelect = useCallback((noteId, noteTitle, folderId) => {
  // Restore the saved selection
  if (savedNoteLinkSelection.current) {
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(savedNoteLinkSelection.current)
    }
  }
  
  // Focus the editor
  editorRef.current?.focus()
  
  // Small delay to ensure focus is set
  setTimeout(() => {
    editorRef.current?.insertCustomBlock('note-link', { ... })
    savedNoteLinkSelection.current = null // Clean up
  }, 10)
}, [])
```

## Why This Works

### The Range API
- `Range` objects represent a portion of the document
- `cloneRange()` creates a copy that's not affected by DOM changes or focus changes
- We can restore the exact cursor position later

### The Timing
1. **Before dialog opens**: Save the range
2. **While dialog is open**: Range is safely stored in a ref (not affected by focus changes)
3. **After selection**: Restore the range, focus editor, insert at correct position

### The setTimeout
- Small 10ms delay ensures the editor has time to focus
- Without it, the insertion might happen before focus is fully restored
- 10ms is imperceptible to users but enough for the browser

## Testing

### Before Fix ❌
```
User types: "Check out this |note"  (| = cursor)
Opens dialog → cursor jumps to top
Selects note → inserted at top:
"📝 Note Link\nCheck out this note"  ❌ Wrong!
```

### After Fix ✅
```
User types: "Check out this |note"  (| = cursor)
Opens dialog → cursor position saved
Selects note → inserted at saved position:
"Check out this 📝 Note Link note"  ✅ Correct!
```

## Benefits

1. **Intuitive UX**: Link appears where user expects it
2. **No manual cursor management**: User doesn't need to reposition
3. **Works with any text**: Beginning, middle, end, nested elements
4. **Reliable**: Uses native browser APIs (Selection API)

## Similar Patterns in the Codebase

This same pattern is used for:
- Link insertion (`insertLink` function in RichTextEditor)
- Other dialog-based insertions

We've extended it to work with custom blocks via slash commands.

## Edge Cases Handled

✅ No selection (cursor at end of document)  
✅ Selection in nested element (list, quote, etc.)  
✅ Empty document  
✅ Multiple paragraphs  
✅ After other custom blocks  

## Performance

- Negligible performance impact
- Only stores one Range object
- Cleared after use
- No memory leaks

## Browser Compatibility

The Selection API is supported in:
- ✅ All modern browsers
- ✅ WebView (Tauri)
- ✅ Mobile browsers

## Future Improvements

This pattern could be extended to:
- [ ] Other custom blocks that use dialogs
- [ ] Image/file upload dialogs
- [ ] Embed dialogs
- [ ] Any UI that interrupts editing flow
