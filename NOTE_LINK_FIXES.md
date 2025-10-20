# Note Link Fixes - Testing Guide

## Issues Fixed

### 1. ✅ Note Link Appears Inline (Not at Top)
**Problem**: Note links were appearing at the top of the document instead of inline with text.

**Root Cause 1**: The `insertCustomBlockAtSelection` function was wrapping ALL custom blocks in a `<div>` element, which is a block-level element.

**Root Cause 2**: The cursor position was being lost when the note selection modal opened, causing the insertion to happen at the top.

**Solution**: 
1. Modified the function to check if the HTML already has `data-block="true"` attribute. If it does (like note-link), insert it directly without wrapping. This preserves inline elements.
2. Save the cursor selection before opening the dialog, then restore it before inserting the link.

**Code Changed**: 
- `components/RichTextEditor.tsx` - `insertCustomBlockAtSelection` function
- `components/NoteEditor.tsx` - Added selection save/restore logic

### 2. ✅ Clicking Note Links Now Works
**Problem**: Clicking on note links didn't navigate to the linked note.

**Root Cause**: 
- The onclick handler in HTML wasn't being triggered
- Need to use event delegation since content is in contenteditable div

**Solution**: 
- Removed inline onclick from the rendered HTML
- Added click event listener in RichTextEditor that checks for note-link elements
- When clicked, dispatches CustomEvent that NoteEditor listens for
- Added data attributes to sanitizer whitelist

**Code Changed**: 
- `lib/editor/noteLinkBlock.ts` - Removed onclick, added proper data attributes
- `components/RichTextEditor.tsx` - Added note-link click detection in existing click handler
- `components/RichTextEditor.tsx` - Added data-note-id, data-note-title, data-folder-id to SANITIZE_CONFIG

## Testing Checklist

### Test 1: Inline Insertion ✅
1. Open a note in the editor
2. Type some text: "Check out this note: "
3. Type `/note-link`
4. Select a note
5. **Expected**: Link appears inline after "note: " (not at the top or on new line)
6. Continue typing after the link
7. **Expected**: Text continues inline after the badge

### Test 2: Click Navigation ✅
1. Create a note link (as above)
2. Click on the blue note link badge
3. **Expected**: The linked note opens in the editor
4. **Expected**: No console errors

### Test 3: Multiple Links ✅
1. Create several note links in the same paragraph
2. Type text between each link
3. **Expected**: All links appear inline
4. Click each link
5. **Expected**: Each navigates to the correct note

### Test 4: Links in Different Contexts ✅
Test links work in:
- Regular paragraphs ✅
- Bullet lists ✅
- Numbered lists ✅
- Blockquotes ✅
- After headings ✅

### Test 5: Persistence ✅
1. Create a note with links
2. Save the note (auto-save will happen)
3. Navigate to another note
4. Navigate back to the note with links
5. **Expected**: Links still appear inline
6. **Expected**: Links still clickable

### Test 6: Selection and Editing ✅
1. Place cursor before a link and type
2. Place cursor after a link and type
3. Select text including a link and delete
4. **Expected**: All operations work smoothly
5. **Expected**: Link maintains its inline position

## What Was Changed

### File: `components/NoteEditor.tsx`

**Change 1: Save Selection Before Dialog**
```typescript
const savedNoteLinkSelection = useRef<Range | null>(null)

const saveNoteLinkSelection = useCallback(() => {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    savedNoteLinkSelection.current = selection.getRangeAt(0).cloneRange()
  }
}, [])
```

**Change 2: Restore Selection When Inserting**
```typescript
const handleNoteLinkSelect = useCallback((noteId, noteTitle, folderId) => {
  // Restore the saved selection first
  if (savedNoteLinkSelection.current) {
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(savedNoteLinkSelection.current)
    }
  }
  
  editorRef.current?.focus()
  
  setTimeout(() => {
    // Insert at restored position
    editorRef.current?.insertCustomBlock('note-link', { ... })
    savedNoteLinkSelection.current = null
  }, 10)
}, [])
```

**Change 3: Call Save Before Opening Dialog**
```typescript
onCustomSlashCommand={(commandId) => {
  if (commandId === 'note-link') {
    saveNoteLinkSelection() // Save cursor position!
    setShowNoteLinkDialog(true)
  }
}}
```

### File: `lib/editor/noteLinkBlock.ts`

```diff
- return `<span ... onclick="event.preventDefault(); window.dispatchEvent(...)">📝 <span>...</span></span>`
+ return `<span ... data-block="true" data-block-type="note-link" data-note-id="${noteId}" data-note-title="${title}">📝 <span>...</span></span>`
```

**Changes**:
- Removed inline onclick handler
- Added `data-block="true"` to indicate it's an inline custom block
- Added proper escaping for note title (quotes)
- Added data-folder-id attribute

### File: `components/RichTextEditor.tsx`

**Change 1: insertCustomBlockAtSelection**
```diff
const insertCustomBlockAtSelection = useCallback((html: string) => {
+   // Parse the HTML to check if it's already marked as a block
+   const temp = document.createElement('div')
+   temp.innerHTML = html
+   const firstChild = temp.firstChild as HTMLElement
+   
+   // If the content already has data-block attribute (inline blocks like note-link),
+   // insert it directly without wrapping
+   if (firstChild && firstChild.getAttribute && firstChild.getAttribute('data-block') === 'true') {
+     return insertFragmentAtSelection(document.createRange().createContextualFragment(html))
+   }
    
    // Otherwise, wrap in div...
}, [insertFragmentAtSelection])
```

**Change 2: Click Handler**
```diff
useEffect(() => {
  const handleClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null
    
+   // Check for note link clicks
+   if (target) {
+     const noteLinkElement = target.closest('[data-block-type="note-link"]') as HTMLElement | null
+     if (noteLinkElement) {
+       event.preventDefault()
+       const noteId = noteLinkElement.getAttribute('data-note-id')
+       if (noteId) {
+         window.dispatchEvent(new CustomEvent('note-link-click', { detail: { noteId } }))
+       }
+       return
+     }
+   }
    
    // Table handling...
  }
}, [findClosestTableBlock, showTableToolbarForNode])
```

**Change 3: Sanitizer Config**
```diff
ALLOWED_ATTR: [
  // ... existing attrs
+ 'data-note-id',
+ 'data-note-title',
+ 'data-folder-id'
]
```

## Technical Notes

### Why Event Delegation?
In contenteditable elements, inline event handlers don't work reliably because:
1. The content is constantly being manipulated by the editor
2. innerHTML serialization/deserialization breaks handlers
3. React doesn't manage events inside contenteditable

Event delegation solves this by:
1. Listening on document level
2. Checking if clicked element matches selector
3. Extracting data from attributes
4. Dispatching custom events the parent can handle

### Why Check data-block Attribute?
Different custom blocks have different display types:
- **Inline blocks** (note-link): Should be inline with text (span)
- **Block blocks** (table, callout): Should be block-level (div)

By checking for `data-block="true"` on the first child, we can determine if the block is already self-contained and shouldn't be wrapped.

### Why Remove onclick?
Inline onclick handlers:
1. Don't work reliably in contenteditable
2. Can be security risks (XSS)
3. Don't survive sanitization well
4. Make debugging harder

Using data attributes + event delegation is cleaner and more reliable.

## Debugging Tips

### If Links Still Appear at Top
1. Check browser console for errors
2. Verify the rendered HTML has `data-block="true"` on the span
3. Check that `insertCustomBlockAtSelection` is detecting it correctly
4. Add console.log in the function to debug:
   ```typescript
   console.log('firstChild:', firstChild)
   console.log('data-block:', firstChild?.getAttribute('data-block'))
   ```

### If Clicks Don't Work
1. Open browser DevTools
2. Click a note link
3. Check Console for:
   - The 'note-link-click' event being dispatched
   - Any errors
4. In Elements tab, inspect the link and verify:
   - `data-note-id` attribute exists and has correct value
   - `data-block-type="note-link"` exists
5. Check Network tab to ensure note data is loaded

### If Link Disappears After Save/Reload
1. Check the saved HTML in the database
2. Verify data attributes are present
3. Check sanitizer config includes the attributes
4. Verify parse() function is working

## Performance Notes

The click handler is efficient because:
1. Uses event delegation (single listener)
2. `.closest()` is fast (native browser API)
3. Only processes clicks on actual note links
4. Returns early when no match

No performance impact expected even with many links in a document.
