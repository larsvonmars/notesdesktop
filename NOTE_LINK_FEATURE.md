# Note Link Feature

## Overview

The Note Link feature allows users to create hyperlinks to other notes within the workspace. This enables building a personal wiki-like knowledge base with interconnected notes.

## How to Use

### Creating a Note Link via Slash Command

1. While editing a rich-text note, type `/` to open the slash commands menu
2. Type `note` or `link` to filter for the "Note Link" command
3. Select "Note Link" from the menu (or press Enter/Tab when it's highlighted)
4. A dialog will open showing all your notes (excluding the current one)
5. Use the search bar to find a specific note
6. Click on a note to create a link to it

### Creating a Note Link Programmatically

You can also create note links programmatically using the editor's API:

```typescript
editorRef.current?.insertCustomBlock('note-link', {
  noteId: 'uuid-of-note',
  noteTitle: 'My Note Title',
  folderId: 'optional-folder-id' // or null
})
```

### How Note Links Appear

Note links are displayed as styled badges with:
- 📝 Icon to indicate it's a note link
- The note title in a blue badge
- Hover effects for better UX
- Click handling to navigate to the linked note

### Clicking on Note Links

When you click on a note link:
- If the note exists, it will be opened in the editor
- If the note has been deleted or can't be found, you'll see an error toast

## Technical Implementation

### Files Created

1. **`lib/editor/noteLinkBlock.ts`**
   - Custom block descriptor for rendering and parsing note links
   - Slash command registration
   - Helper functions for creating note link HTML

2. **`components/NoteLinkDialog.tsx`**
   - Dialog component for selecting notes to link
   - Search functionality
   - Displays notes with folder information
   - Excludes the current note from selection

### Files Modified

1. **`components/NoteEditor.tsx`**
   - Added note link dialog state management
   - Integrated note link custom block
   - Added event handler for clicking note links
   - Registered the note link slash command

2. **`components/RichTextEditor.tsx`**
   - Added `onCustomSlashCommand` prop for custom command handlers
   - Updated slash command execution to support custom UI interactions
   - Support for inserting custom blocks programmatically

### Data Structure

Note link blocks store the following payload:

```typescript
interface NoteLinkPayload {
  noteId: string        // UUID of the linked note
  noteTitle: string     // Display title of the note
  folderId?: string | null  // Optional folder ID for additional context
}
```

### HTML Output

Note links are rendered as inline HTML elements:

```html
<span 
  class="inline-flex items-center gap-1 px-2 py-1 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 cursor-pointer transition-colors"
  data-note-id="uuid"
  data-note-title="Note Title"
  onclick="..."
>
  📝 <span class="font-medium">Note Title</span>
</span>
```

## Features

### ✅ Implemented

- Slash command integration (`/note-link`)
- Note selection dialog with search
- Visual styling of note links
- Click navigation to linked notes
- Automatic exclusion of current note from selection
- Folder information display in note selector
- Error handling for missing notes
- Parsing and rehydration of note links from saved content

### 🔮 Future Enhancements

Consider adding these features:

1. **Backlinks Panel**: Show which notes link to the current note
2. **Note Preview**: Hover over a link to see a preview of the linked note
3. **Broken Link Detection**: Warn users about links to deleted notes
4. **Link Statistics**: Show number of incoming/outgoing links per note
5. **Auto-complete**: Suggest notes as you type `[[Note Title]]` (wiki-style)
6. **Link Types**: Support different types of links (references, mentions, etc.)
7. **Visual Graph**: Display a graph of note connections

## Keyboard Shortcuts

When the slash menu is open and "Note Link" is highlighted:
- **Enter** or **Tab**: Select the command and open note selector
- **Arrow Up/Down**: Navigate through slash commands
- **Escape**: Close the slash menu

In the note selector dialog:
- **Type to search**: Filter notes in real-time
- **Click**: Select a note to link
- **Escape** or **X button**: Close the dialog

## Examples

### Basic Usage

```typescript
// In a component using the note editor
import { noteLinkBlock } from '@/lib/editor/noteLinkBlock'

// Pass the custom block to RichTextEditor
<RichTextEditor
  customBlocks={[noteLinkBlock]}
  onCustomSlashCommand={(id) => {
    if (id === 'note-link') {
      setShowNoteLinkDialog(true)
    }
  }}
  // ... other props
/>
```

### Programmatic Link Creation

```typescript
// Create a link to a specific note
const createLinkToNote = (noteId: string, title: string) => {
  editorRef.current?.insertCustomBlock('note-link', {
    noteId,
    noteTitle: title,
    folderId: null
  })
}
```

## Browser Compatibility

The note link feature uses:
- CustomEvent API (for click handling)
- Modern CSS (flexbox, transitions)
- Standard DOM APIs

All are supported in modern browsers and WebView environments.

## Accessibility

Note links are:
- Keyboard accessible (can be reached via Tab navigation)
- Screen reader friendly (uses semantic HTML)
- Properly labeled with data attributes

## Troubleshooting

### Links don't navigate when clicked

Ensure that:
1. The `onSelectNote` prop is passed to NoteEditor
2. The `notes` prop contains all available notes
3. The event listener for 'note-link-click' is properly set up

### Note selector shows no notes

Check that:
1. Notes are being loaded correctly
2. The `getNotes()` function is working
3. User is authenticated and has permissions

### Link appears as plain text

Verify that:
1. The `noteLinkBlock` is included in the `customBlocks` array
2. The HTML is being sanitized with the correct configuration
3. The custom block's `render()` function is returning valid HTML

## Performance Considerations

- Note selection dialog loads all notes on open (consider pagination for large note collections)
- Search filtering is done client-side (consider server-side search for 1000+ notes)
- Click event uses event delegation for efficiency

## Security

- All HTML output is sanitized using DOMPurify
- Note IDs are properly escaped in data attributes
- Click handlers prevent default behavior to avoid XSS
- Custom event details are validated before use
