# Manual Testing Guide: Active Formatting Display

This guide helps verify that the active formatting display fixes are working correctly in both the floating selection menu and the fixed top toolbar.

## Test Environment Setup

1. Start the development server:
   ```bash
   npm run tauri:dev
   ```
   or
   ```bash
   npm run dev
   ```

2. Navigate to the editor (dashboard with a note open)

## Test Cases

### Test 1: Heading Detection in Fixed Toolbar

**Steps:**
1. Create or open a note
2. Type some text: "This is a heading"
3. Click anywhere in the text
4. Click the "Block" dropdown in the top toolbar
5. Select "Heading 1"
6. **Expected:** The dropdown should now show "Heading 1" as selected
7. Change to "Heading 2"
8. **Expected:** The dropdown should now show "Heading 2" as selected
9. Change to "Heading 3"
10. **Expected:** The dropdown should now show "Heading 3" as selected

**Pass Criteria:**
- ✅ Block type dropdown correctly reflects current heading level
- ✅ Dropdown updates immediately when heading level changes

### Test 2: Heading Detection in Floating Toolbar

**Steps:**
1. In a note, type "Test Heading" on a line
2. Apply Heading 1 formatting (use dropdown or Cmd/Ctrl+Alt+1)
3. Select the text by dragging mouse over it
4. **Expected:** Floating toolbar appears above/below selection
5. **Expected:** H1 button in floating toolbar is highlighted (blue background)
6. Change to H2 (click H2 in floating toolbar or use Cmd/Ctrl+Alt+2)
7. Select the text again
8. **Expected:** H2 button is now highlighted, H1 is not

**Pass Criteria:**
- ✅ Floating toolbar appears on text selection
- ✅ H1, H2, or H3 button is highlighted when text is that heading level
- ✅ Only the correct heading button is highlighted

### Test 3: Blockquote Detection

**Steps:**
1. Type "This is a quote"
2. Select the text
3. Click "Quote" in the fixed toolbar lists section (or select "Quote" from Block dropdown)
4. **Expected:** Text is formatted as a blockquote
5. Click anywhere in the blockquote
6. **Expected:** Block dropdown shows "Quote" as selected
7. Select the quote text
8. **Expected:** Quote button in floating toolbar is highlighted

**Pass Criteria:**
- ✅ Block dropdown shows "Quote" when cursor is in blockquote
- ✅ Quote button in floating toolbar highlights when blockquote text is selected

### Test 4: Inline Formatting Detection

**Steps:**
1. Type "Bold text here"
2. Select "Bold"
3. Click Bold button (B) in toolbar or press Cmd/Ctrl+B
4. Keep text selected
5. **Expected:** Bold button in floating toolbar is highlighted (blue background)
6. **Expected:** Bold button in fixed toolbar is highlighted
7. Click elsewhere to deselect
8. Click in the bold text
9. Select it again
10. **Expected:** Bold button still highlighted

**Repeat for:**
- Italic (I button or Cmd/Ctrl+I)
- Underline (U button or Cmd/Ctrl+U)
- Strikethrough (S button or Cmd/Ctrl+Shift+X)
- Code (</> button or Cmd/Ctrl+`)

**Pass Criteria:**
- ✅ Inline format buttons highlight when their formatting is active
- ✅ Multiple formats can be active simultaneously (e.g., bold + italic)

### Test 5: List Detection

**Steps:**
1. Type a line of text
2. Click "Bullets" button or press Cmd/Ctrl+Shift+L
3. **Expected:** Text becomes bulleted list
4. **Expected:** Bullets button in fixed toolbar is highlighted
5. Select the list item text
6. **Expected:** Bullets button in floating toolbar is highlighted
7. Click "Numbered" button or press Cmd/Ctrl+Shift+O
8. **Expected:** List changes to numbered
9. **Expected:** Numbered button is highlighted, Bullets button is not

**Pass Criteria:**
- ✅ List buttons highlight when cursor is in that list type
- ✅ Only the correct list button is highlighted

### Test 6: Combined Formatting

**Steps:**
1. Create a Heading 2
2. Select part of the heading text
3. Apply bold formatting
4. **Expected:** Both H2 button AND Bold button are highlighted in floating toolbar
5. **Expected:** Block dropdown shows "Heading 2"
6. Apply italic as well
7. **Expected:** H2, Bold, AND Italic buttons all highlighted

**Pass Criteria:**
- ✅ Multiple formatting states can be active at once
- ✅ Block-level (heading) and inline (bold, italic) formats don't interfere

### Test 7: Switching Between Block Types

**Steps:**
1. Type "Sample text"
2. Apply Heading 1
3. **Expected:** Block dropdown shows "Heading 1"
4. Change to Paragraph via dropdown
5. **Expected:** Block dropdown shows "Paragraph"
6. Change to Heading 3
7. **Expected:** Block dropdown shows "Heading 3"
8. Change to Quote
9. **Expected:** Block dropdown shows "Quote"

**Pass Criteria:**
- ✅ Dropdown always reflects current block type
- ✅ Transitions between all block types work smoothly

## Visual Indicators

### Highlighted Button Appearance
- **Active state:** Blue background (bg-blue-50 or bg-blue-100)
- **Inactive state:** White/transparent background
- **Text color:** Blue (text-blue-700) when active, gray when inactive

### Block Type Dropdown
- Should show the exact text matching the current format:
  - "Paragraph" (default/paragraph)
  - "Heading 1" (h1)
  - "Heading 2" (h2)
  - "Heading 3" (h3)
  - "Quote" (blockquote)

## Common Issues to Watch For

❌ **Dropdown stuck on "Paragraph"** - Should update when heading is applied
❌ **Floating toolbar buttons not highlighting** - Should highlight for active formats
❌ **Multiple heading buttons highlighted** - Only one heading level should be active
❌ **Active state doesn't update** - Should update when selection changes
❌ **Fixed toolbar doesn't match floating toolbar** - Both should show same active states

## Success Criteria Summary

✅ All formatting buttons in fixed toolbar show active state correctly
✅ All formatting buttons in floating toolbar show active state correctly  
✅ Block type dropdown reflects current block type accurately
✅ Heading levels (H1, H2, H3) detection works
✅ Blockquote detection works
✅ Inline formatting (bold, italic, underline, strike, code) detection works
✅ List detection (bullets, numbered) works
✅ Combined formatting states work correctly
✅ Active states update immediately on selection/format change

## Reporting Issues

If any test fails, please note:
1. Which test case failed
2. Expected vs actual behavior
3. Browser/environment details
4. Steps to reproduce
5. Screenshots if possible
