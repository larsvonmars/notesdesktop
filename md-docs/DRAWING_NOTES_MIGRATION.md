# Drawing Notes Feature - Database Migration

This guide explains how to add support for drawing notes to your Supabase database.

## Database Changes Required

Run the following SQL in your Supabase SQL Editor:

```sql
-- Add note_type column to notes table
ALTER TABLE public.notes 
ADD COLUMN IF NOT EXISTS note_type text DEFAULT 'rich-text' CHECK (note_type IN ('rich-text', 'drawing'));

-- Update existing notes to have the default note_type
UPDATE public.notes 
SET note_type = 'rich-text' 
WHERE note_type IS NULL;

-- Create index on note_type for faster filtering
CREATE INDEX IF NOT EXISTS notes_note_type_idx ON public.notes(note_type);

-- Add comment to document the column
COMMENT ON COLUMN public.notes.note_type IS 'Type of note: rich-text for standard text notes, drawing for canvas-based drawing notes';
```

## How Drawing Notes Work

### Storage Format

- **Rich Text Notes**: Content is stored as HTML string in the `content` column
- **Drawing Notes**: Content is stored as JSON string containing drawing data in the `content` column

Drawing data structure:
```json
{
  "strokes": [
    {
      "points": [
        { "x": 100, "y": 150, "pressure": 0.5 },
        { "x": 102, "y": 152, "pressure": 0.6 }
      ],
      "color": "#000000",
      "size": 2,
      "tool": "pen"
    }
  ],
  "width": 800,
  "height": 600
}
```

### Features

1. **Drawing Tools**:
   - Pen - Standard drawing tool with pressure sensitivity
   - Highlighter - Semi-transparent broad strokes
   - Eraser - Remove strokes

2. **Customization**:
   - 8 colors: Black, Blue, Red, Green, Purple, Orange, Yellow, Pink
   - 4 sizes: Thin, Medium, Thick, Very Thick

3. **Canvas**:
   - Default size: 800x600 pixels
   - Smooth, natural-looking strokes using perfect-freehand library
   - Pressure sensitivity support (on compatible devices)

4. **History**:
   - Undo/Redo support
   - Clear all strokes

## Usage

### Creating a New Drawing Note

1. Click "New Drawing" button in the sidebar
2. Use the drawing tools to create your artwork
3. Enter a title
4. Click Save

### Switching Between Note Types

Notes cannot be converted between types after creation. The note type is set when the note is created and remains fixed.

## Technical Implementation

### Components

- **DrawingEditor** (`components/DrawingEditor.tsx`): Canvas-based drawing editor with toolbar
- **NoteEditor** (`components/NoteEditor.tsx`): Updated to support both rich-text and drawing note types
- **UnifiedPanel** (`components/UnifiedPanel.tsx`): Updated with buttons to create both note types

### Libraries Used

- **perfect-freehand**: Generates smooth, pressure-sensitive strokes
- **HTML5 Canvas API**: For rendering drawings
- **Pointer Events API**: For touch and stylus support

### Data Flow

1. User draws on canvas → Points collected with pressure data
2. Stroke completed → Added to drawing data state
3. Save button clicked → Drawing data serialized to JSON
4. JSON stored in `content` column with `note_type = 'drawing'`
5. On load → JSON parsed back to drawing data → Rendered on canvas

## Future Enhancements

Potential improvements for the drawing feature:

- [ ] Add shapes tool (rectangle, circle, line, arrow)
- [ ] Add text tool to combine text and drawings
- [ ] Export drawings as PNG/SVG
- [ ] Handwriting recognition (OCR)
- [ ] Layers support
- [ ] Import images as background
- [ ] Collaboration features (real-time drawing)
- [ ] More brush types and effects
- [ ] Color picker for custom colors
- [ ] Canvas size customization
- [ ] Zoom and pan controls
