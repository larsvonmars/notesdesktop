# Manual Testing Guide for Tauri Heading Cursor Fix

This guide helps verify that the header creation cursor jumping issue has been resolved in Tauri.

## Prerequisites

1. Build the Tauri application:
   ```bash
   npm run tauri:dev
   ```
   OR for production build:
   ```bash
   npm run tauri:build
   ```

2. Also test in browser for comparison:
   ```bash
   npm run dev
   ```
   Navigate to `http://localhost:3000`

## Test Scenarios

### Test 1: Basic Heading Creation via Slash Command

**Steps:**
1. Open the note editor
2. Type some text: "This is a test"
3. Press Enter to create a new line
4. Type `/h1`
5. Select "Heading 1" from the slash command menu (or press Enter)

**Expected Result:**
- ✅ A heading 1 is created with an empty state
- ✅ Cursor is positioned inside the heading, ready for typing
- ✅ Cursor does NOT jump to the previous line
- ✅ You can immediately start typing in the heading

**Test in:**
- [ ] Browser (Chrome/Firefox/Safari)
- [ ] Tauri on Windows
- [ ] Tauri on macOS
- [ ] Tauri on Linux

### Test 2: Heading Creation with Text

**Steps:**
1. Open the note editor
2. Type: "My Important Title"
3. Select all the text (Cmd/Ctrl+A)
4. Type `/h2`
5. Select "Heading 2" from menu

**Expected Result:**
- ✅ The text "My Important Title" is replaced with an H2 heading
- ✅ Cursor is at the end of the heading
- ✅ You can continue typing

**Test in:**
- [ ] Browser
- [ ] Tauri on Windows
- [ ] Tauri on macOS
- [ ] Tauri on Linux

### Test 3: Keyboard Shortcut

**Steps:**
1. Open the note editor
2. Type some text on a line
3. Press Cmd+Alt+1 (Mac) or Ctrl+Alt+1 (Windows/Linux)

**Expected Result:**
- ✅ Line is converted to Heading 1
- ✅ Cursor stays at the end of the heading
- ✅ No cursor jumping

**Test in:**
- [ ] Browser
- [ ] Tauri on Windows
- [ ] Tauri on macOS
- [ ] Tauri on Linux

### Test 4: Multiple Headings in Quick Succession

**Steps:**
1. Open the note editor
2. Type `/h1` and press Enter
3. Type "First Heading" and press Enter
4. Type `/h2` and press Enter
5. Type "Second Heading" and press Enter
6. Type `/h3` and press Enter
7. Type "Third Heading"

**Expected Result:**
- ✅ All three headings are created correctly
- ✅ Cursor stays in each heading after creation
- ✅ No cursor jumping between operations
- ✅ Text is entered into correct heading each time

**Test in:**
- [ ] Browser
- [ ] Tauri on Windows
- [ ] Tauri on macOS
- [ ] Tauri on Linux

### Test 5: Heading at Document Start

**Steps:**
1. Open a new note
2. Immediately type `/h1` (first action in empty editor)
3. Select "Heading 1" from menu

**Expected Result:**
- ✅ Heading is created at the top of the document
- ✅ Cursor is inside the heading
- ✅ You can start typing immediately

**Test in:**
- [ ] Browser
- [ ] Tauri on Windows
- [ ] Tauri on macOS
- [ ] Tauri on Linux

### Test 6: Heading in Middle of Content

**Steps:**
1. Open the note editor
2. Type several paragraphs of text
3. Click in the middle of the content
4. Type `/h2`
5. Select "Heading 2" from menu

**Expected Result:**
- ✅ Heading is created at cursor position
- ✅ Cursor stays in the new heading
- ✅ Content above and below remains intact

**Test in:**
- [ ] Browser
- [ ] Tauri on Windows
- [ ] Tauri on macOS
- [ ] Tauri on Linux

### Test 7: Converting Existing Paragraph

**Steps:**
1. Type a paragraph: "This will become a heading"
2. Place cursor anywhere in the paragraph
3. Type `/h3`
4. Select "Heading 3" from menu

**Expected Result:**
- ✅ Paragraph is converted to Heading 3
- ✅ Cursor is at the end of the heading
- ✅ Text content is preserved
- ✅ No cursor jumping

**Test in:**
- [ ] Browser
- [ ] Tauri on Windows
- [ ] Tauri on macOS
- [ ] Tauri on Linux

## Regression Testing

These tests ensure the fix doesn't break existing functionality:

### Test R1: Other Slash Commands Still Work

**Steps:**
1. Test `/ul` (unordered list)
2. Test `/ol` (ordered list)
3. Test `/check` (checklist)
4. Test `/quote` (blockquote)
5. Test `/code` (code block)

**Expected Result:**
- ✅ All commands work correctly
- ✅ No cursor issues with any command

### Test R2: Inline Formatting Still Works

**Steps:**
1. Type text and select it
2. Press Cmd/Ctrl+B (bold)
3. Press Cmd/Ctrl+I (italic)
4. Press Cmd/Ctrl+U (underline)

**Expected Result:**
- ✅ All formatting applies correctly
- ✅ Cursor behavior is normal

### Test R3: Undo/Redo Works

**Steps:**
1. Create a heading via slash command
2. Type some text in the heading
3. Press Cmd/Ctrl+Z (undo)
4. Press Cmd/Ctrl+Shift+Z (redo)

**Expected Result:**
- ✅ Undo removes the heading
- ✅ Redo restores the heading
- ✅ Cursor position is maintained correctly

## Performance Testing

### Test P1: Rapid Operations

**Steps:**
1. Type `/h1` + Enter, then text, then Enter
2. Immediately type `/h2` + Enter, then text, then Enter
3. Immediately type `/h3` + Enter, then text, then Enter
4. Do this 5 times in quick succession

**Expected Result:**
- ✅ All headings created correctly
- ✅ No lag or freezing
- ✅ No cursor jumping even with rapid input
- ✅ Perceived latency is acceptable (< 200ms)

## Debugging

If issues occur, check the browser/Tauri console for:

- Warning: "Failed to position cursor after conversion"
- Warning: "Failed to position cursor after insert"
- Warning: "Heading was removed from DOM"
- Warning: "Failed to remove slash text"

These warnings indicate where the issue is occurring.

## Reporting Issues

If cursor jumping still occurs, please note:

1. **Platform**: Windows / macOS / Linux
2. **Environment**: Browser (which one) / Tauri
3. **Test Scenario**: Which test above failed
4. **Console Warnings**: Any warnings in the console
5. **Steps to Reproduce**: Exact steps that cause the issue
6. **Expected vs Actual**: What should happen vs what does happen

## Success Criteria

The fix is successful if:

- ✅ All Test 1-7 pass in both browser AND Tauri
- ✅ All Regression tests pass
- ✅ Performance is acceptable (headings created smoothly)
- ✅ No console errors or warnings
- ✅ User can type naturally without worrying about cursor position
