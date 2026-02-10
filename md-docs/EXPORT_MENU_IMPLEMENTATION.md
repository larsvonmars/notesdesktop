# Export Menu Implementation

## Overview

This document describes the export menu feature added to the Notes Desktop application, allowing users to export their notes in multiple formats directly from the UnifiedPanel.

## Location

The export functionality is implemented in `components/UnifiedPanel.tsx` and is accessible from the Browse tab of the unified panel.

## Features

### Export Formats

1. **PDF Export**
   - Uses browser's native print dialog
   - Creates a print-friendly version with proper styling
   - Removes background colors and adjusts typography for printing
   - Includes note title as H1
   - Works with rich-text notes

2. **Markdown Export**
   - Converts HTML content to Markdown syntax
   - Preserves headings (H1, H2, H3)
   - Maintains text formatting (bold, italic, code)
   - Converts lists (unordered, ordered, checklists)
   - Preserves blockquotes and links
   - Downloads as `.md` file

3. **HTML Export**
   - Creates a complete standalone HTML document
   - Includes embedded CSS for styling
   - Responsive design with max-width container
   - Clean, professional typography
   - Downloads as `.html` file

4. **Plain Text Export**
   - Strips all HTML formatting
   - Preserves basic text structure
   - Converts HTML entities
   - Downloads as `.txt` file

## User Interface

### Export Button

Located in the Browse tab's Quick Actions section, the export button features:
- Gradient background (emerald-500 to teal-600)
- Download icon from lucide-react
- Chevron icon that rotates when menu is open
- Full-width layout spanning 2 columns

### Export Menu Dropdown

The dropdown menu displays when the export button is clicked:
- 4 export options with icons and descriptions
- Color-coded icons (Red: PDF, Blue: Markdown, Orange: HTML, Gray: Plain Text)
- Hover effects with icon scaling
- Smooth fade-in animation
- Auto-closes when clicking outside

## Implementation Details

### State Management

```typescript
const [showExportMenu, setShowExportMenu] = useState(false)
```

### Export Functions

All export functions are implemented as `useCallback` hooks:

- `handleExportToPDF()` - Lines 885-930
- `handleExportToMarkdown()` - Lines 932-989
- `handleExportToHTML()` - Lines 991-1028
- `handleExportToPlainText()` - Lines 1030-1065

### HTML to Markdown Conversion

The Markdown export uses regex-based conversion to transform HTML elements:
- Headings: `<h1>` → `# `, `<h2>` → `## `, `<h3>` → `### `
- Bold: `<strong>` / `<b>` → `**text**`
- Italic: `<em>` / `<i>` → `*text*`
- Code: `<code>` → `` `text` ``
- Links: `<a href="url">text</a>` → `[text](url)`
- Lists: `<li>` → `- item`
- Blockquotes: `<blockquote>` → `> text`

### File Download Pattern

```typescript
const blob = new Blob([content], { type: 'text/...' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `${note.title || 'untitled'}.ext`
a.click()
URL.revokeObjectURL(url)
```

## WebView Compatibility

All export functionality uses standard browser APIs that work across WebView implementations:
- `window.print()` for PDF export
- `Blob` and `URL.createObjectURL()` for file downloads
- Standard DOM manipulation
- No deprecated or problematic APIs

## Usage

1. Open a note in the editor
2. Click the menu button (top-right)
3. Navigate to the Browse tab
4. Click the "Export Note" button
5. Select desired export format from the dropdown
6. File will be downloaded or print dialog will open

## Future Enhancements

Potential improvements for future versions:
- Custom PDF styling options
- Batch export multiple notes
- Export with images embedded
- Cloud storage integration
- Custom Markdown templates
- LaTeX/mathematical notation support
- Export note attachments/drawings
- Schedule automatic exports

## Testing

To test the export functionality:
1. Create a note with various formatting (headings, bold, italic, lists, etc.)
2. Open the UnifiedPanel
3. Click "Export Note" button
4. Test each export format:
   - PDF: Verify print preview looks correct
   - Markdown: Open in text editor, check formatting
   - HTML: Open in browser, verify styling
   - Plain Text: Check that formatting is stripped

## Known Limitations

- Drawing notes show informative message (cannot export visual content to text formats)
- Mindmap notes show informative message (cannot export graph structure to text formats)
- Complex HTML structures may not convert perfectly to Markdown
- PDF export uses browser's print dialog (limited customization)
- Images are exported as data URLs (increases file size)

## Browser Support

The export functionality works in all modern browsers:
- Chrome/Chromium (including Tauri WebView)
- Firefox
- Safari (including macOS WebView)
- Edge

## Security Considerations

- All export operations happen client-side
- No data is sent to external servers
- Blob URLs are properly cleaned up after use
- Filename sanitization prevents path traversal
- HTML entities are properly escaped
