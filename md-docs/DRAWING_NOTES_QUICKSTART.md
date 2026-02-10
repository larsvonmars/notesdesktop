# Quick Start: Testing Drawing Notes

## Step 1: Database Setup

Before testing, you need to add the `note_type` column to your Supabase database:

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run this SQL:

```sql
-- Add note_type column to notes table
ALTER TABLE public.notes 
ADD COLUMN IF NOT EXISTS note_type text DEFAULT 'rich-text' 
CHECK (note_type IN ('rich-text', 'drawing'));

-- Update existing notes
UPDATE public.notes 
SET note_type = 'rich-text' 
WHERE note_type IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS notes_note_type_idx 
ON public.notes(note_type);
```

## Step 2: Start the Application

```bash
npm run tauri:dev
```

Or for web-only testing:
```bash
npm run dev
```

## Step 3: Create Your First Drawing Note

1. **Log in** to your account
2. Look for the **purple "New Drawing" button** in the left sidebar (it has a pen icon)
3. Click it to create a new drawing note

## Step 4: Try the Drawing Tools

### Toolbar Overview (from left to right):

**Tools:**
- 🖊️ **Pen** - Standard drawing tool (supports pressure sensitivity)
- 🖍️ **Highlighter** - Semi-transparent broad strokes
- ⌫ **Eraser** - Remove parts of your drawing

**Colors** (8 options):
- Black, Blue, Red, Green, Purple, Orange, Yellow, Pink

**Sizes** (4 options):
- Thin, Medium, Thick, Very Thick

**Actions:**
- ⟲ **Undo** - Step back
- ⟳ **Redo** - Step forward
- 🗑️ **Clear All** - Erase everything

### Drawing Tips:

1. **Try the Pen tool first**:
   - Select the Pen tool (should be selected by default)
   - Choose a color
   - Draw on the white canvas

2. **Test Pressure Sensitivity** (if you have a stylus):
   - Press lightly for thin strokes
   - Press harder for thicker strokes

3. **Use the Highlighter**:
   - Switch to the Highlighter tool
   - Draw over existing strokes to create transparent overlays

4. **Erase Mistakes**:
   - Select the Eraser tool
   - Draw over areas you want to remove

5. **Undo/Redo**:
   - Make several strokes
   - Click Undo to step back
   - Click Redo to step forward

## Step 5: Save Your Drawing

1. **Add a title** in the text field at the top
2. Click the **Save button** (or press `Cmd/Ctrl+S`)
3. Your drawing will be saved to the database

## Step 6: Test Persistence

1. **Close the note** (click the X or Cancel button)
2. **Find your drawing note** in the notes list (it has a purple pen icon 🖊️)
3. **Click to reopen** it
4. **Verify** your drawing loaded correctly
5. **Make more changes** and save again

## What to Look For

✅ **Smooth strokes** - Lines should be smooth and natural-looking  
✅ **Color changes** - Each color should render correctly  
✅ **Tool switching** - Each tool should behave differently  
✅ **Undo/Redo** - Should step through your drawing history  
✅ **Persistence** - Drawings should save and reload correctly  
✅ **Visual distinction** - Drawing notes have a purple pen icon in the list  

## Creating Both Note Types

To test that both note types work together:

1. Create a **text note** (blue "New Text Note" button)
2. Create a **drawing note** (purple "New Drawing" button)
3. Switch between them in the notes list
4. Verify each loads with the correct editor

## Common Issues

### Drawing doesn't appear:
- Make sure you clicked Save after drawing
- Check browser console for errors
- Verify database migration ran successfully

### Can't draw on canvas:
- Check that you're clicking inside the white canvas area
- Make sure the note isn't in a disabled state

### Strokes look pixelated:
- This is normal for very small strokes
- Try using a larger stroke size

## Advanced Testing

### Test on Different Devices:

1. **Desktop with Mouse**:
   - Should work normally
   - No pressure sensitivity

2. **Laptop with Trackpad**:
   - Should work normally
   - No pressure sensitivity

3. **Tablet with Stylus** (iPad, Surface, etc.):
   - Should support pressure sensitivity
   - Pressure should affect stroke thickness

4. **Touch Device**:
   - Should work with finger
   - No pressure sensitivity

### Test Edge Cases:

- Create a drawing with no strokes (empty canvas) - should save
- Create a very complex drawing (100+ strokes) - should handle well
- Undo all the way to empty - should work
- Redo after undo - should restore strokes
- Clear all, then undo - should restore everything

## Next Steps

Once you've tested the basic features, check out:

- **DRAWING_NOTES_FEATURE.md** - Complete feature documentation
- **DRAWING_NOTES_MIGRATION.md** - Database details and future enhancements

## Need Help?

If something doesn't work:
1. Check the browser console for errors
2. Verify the database migration ran successfully
3. Check that perfect-freehand is installed (`npm list perfect-freehand`)
4. Try refreshing the page

Enjoy creating with your new drawing notes feature! 🎨
