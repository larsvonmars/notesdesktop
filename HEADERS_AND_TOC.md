# Headers and Table of Contents

## Overview
The note editor now supports semantic headings (H1, H2, H3) with automatic table of contents generation and smooth scroll navigation.

## Features

### 1. Header Support
- **H1 (Heading 1)**: Largest heading for main titles
- **H2 (Heading 2)**: Section headings
- **H3 (Heading 3)**: Subsection headings

### 2. Keyboard Shortcuts
- **Cmd/Ctrl + Alt + 1**: Apply H1 heading
- **Cmd/Ctrl + Alt + 2**: Apply H2 heading
- **Cmd/Ctrl + Alt + 3**: Apply H3 heading

### 3. Toolbar Buttons
Three new heading buttons added at the start of the formatting toolbar:
- **H1 icon**: Creates/converts to Heading 1
- **H2 icon**: Creates/converts to Heading 2
- **H3 icon**: Creates/converts to Heading 3

### 4. Table of Contents (TOC)
- **Toggle Button**: ListTree icon in toolbar to show/hide TOC
- **Automatic Generation**: Updates in real-time as you add/edit headings
- **Hierarchical Display**: Indented based on heading level
- **Smooth Navigation**: Click any heading to scroll smoothly to that section

## Technical Implementation

### Auto-Generated IDs
When you create a heading, the system automatically:
1. Generates a unique ID from the heading text
2. Converts to lowercase and replaces spaces with hyphens
3. Removes special characters
4. Assigns the ID to the heading element

**Example:**
- Heading text: "Getting Started Guide"
- Generated ID: "getting-started-guide"

### TOC Panel
- **Width**: 256px (16rem) fixed sidebar
- **Max Height**: Inherits from editor container
- **Scrollable**: Independent scroll for long TOC lists
- **Visual Hierarchy**: Indentation increases by 12px per level

### Heading Styles
```css
H1: 2em, bold (700), dark gray (#111827)
H2: 1.5em, semibold (600), darker gray (#1f2937)
H3: 1.17em, semibold (600), medium gray (#374151)
```

All headings include:
- Proper margin spacing
- Scroll margin for smooth navigation
- Optimized line heights for readability

### Sanitization
Headers are included in the DOMPurify allowlist:
- Allowed tags: `h1`, `h2`, `h3`
- Allowed attributes: `id` (for TOC linking)

## Usage Examples

### Creating a Document Structure
```
# Main Title (H1)

## Introduction (H2)
Content about the introduction...

### Background (H3)
More detailed content...

### Objectives (H3)
List of objectives...

## Methods (H2)
Methodology details...
```

### Navigation Flow
1. Click ListTree icon in toolbar to open TOC
2. TOC displays all headings with proper indentation
3. Click any heading in TOC to jump to that section
4. Smooth scroll animation takes you to the heading
5. Heading appears at top of viewport

### Best Practices
1. **Use H1 sparingly**: Typically one per note for the main title
2. **Logical hierarchy**: Don't skip levels (e.g., H1 → H3)
3. **Descriptive text**: Heading text becomes the TOC link
4. **Keep it concise**: Short, clear heading text works best
5. **Update headings**: TOC updates automatically on edit

## Accessibility Features
- Semantic HTML headings for screen readers
- Keyboard shortcuts for power users
- Visual hierarchy with size and weight
- Scroll margin prevents headers from hiding under UI
- High contrast colors for readability

## Browser Compatibility
- Uses native `formatBlock` command
- Smooth scroll with fallback to instant scroll
- getElementById for reliable navigation
- Works in all modern browsers

## Integration Notes
- Headers stored as HTML in database
- IDs persist across saves/loads
- Real-time heading extraction via `getHeadings()` method
- TOC state persists during editing session
- No external dependencies (built from scratch)

## Future Enhancements (Optional)
- [ ] H4, H5, H6 support for deeper nesting
- [ ] Numbered headings (1.1, 1.2, etc.)
- [ ] Collapse/expand TOC sections
- [ ] Export to PDF with TOC bookmarks
- [ ] Search within headings only
- [ ] Copy TOC as markdown outline
