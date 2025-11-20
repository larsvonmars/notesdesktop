# Image Block UI Elements - Implementation Guide

## Overview

This document describes the custom UI elements added to image content blocks in the Notes Desktop application. These enhancements provide users with intuitive controls for managing images within their notes.

## Features

### 1. Resize Handlers

Images can be resized by dragging one of 8 resize handles:

- **Corner Handles** (4):
  - Northwest (top-left)
  - Northeast (top-right)
  - Southwest (bottom-left)
  - Southeast (bottom-right)

- **Edge Handles** (4):
  - North (top)
  - South (bottom)
  - West (left)
  - East (right)

**Behavior:**
- Handles appear on hover
- Dragging maintains aspect ratio
- Minimum size is 100px to prevent tiny images
- Visual feedback during resize with blue circular handles
- Dimensions are saved automatically

### 2. Delete Button

A red circular delete button appears in the top-right corner of images on hover.

**Behavior:**
- Click to delete the image immediately
- No confirmation dialog (follows inline editing patterns)
- Changes are auto-saved via the editor's change detection

### 3. Visual Feedback

**Hover State:**
- Resize handles fade in (opacity: 0 → 1)
- Delete button fades in (opacity: 0 → 1)
- Smooth transitions (0.2s ease-in-out)

**Resizing State:**
- Container gets `.resizing` class
- Cursor changes to match resize direction
- Image becomes unselectable during resize

## Implementation Details

### Files Modified

1. **lib/editor/imageBlock.ts**
   - Enhanced `render()` function to include UI elements
   - Updated `parse()` function to handle width/height from inline styles
   - Added `initializeImageBlockInteractions()` for event handling

2. **components/RichTextEditor.tsx**
   - Added useEffect hook to initialize image interactions
   - Extended SANITIZE_CONFIG to allow necessary HTML elements and attributes

3. **app/globals.css**
   - Added CSS classes for image block styling
   - Defined hover states and transitions

### Security Considerations

- All user-provided content (src, alt) is escaped using `escapeHtml()`
- DOMPurify sanitization is applied by RichTextEditor
- contenteditable="false" prevents direct text editing of image blocks
- Resize dimensions are validated (minimum 100px)

### Browser Compatibility

The implementation uses standard web APIs:
- `addEventListener` for event handling
- `getBoundingClientRect()` for positioning
- CSS transforms and transitions
- All features are WebView compatible

## Usage

### Inserting an Image

1. Click the "+" button or press "+" key in the editor
2. Select "Image" from the content blocks menu
3. Choose an image file (max 10MB)
4. Image is inserted with full UI controls

### Resizing an Image

1. Hover over an image to reveal resize handles
2. Click and drag any handle to resize
3. Release to commit the new size
4. Changes are auto-saved

### Deleting an Image

1. Hover over an image to reveal the delete button
2. Click the red delete button in the top-right corner
3. Image is immediately removed
4. Changes are auto-saved

## Testing

Comprehensive test coverage in `tests/imageBlock.test.ts`:

- ✅ Render functionality (6 tests)
- ✅ Parse functionality (3 tests)
- ✅ Interaction initialization (4 tests)
- ✅ Resize handlers (2 tests)
- ✅ Security & XSS prevention (2 tests)
- ✅ Data attributes (2 tests)

**Total: 19 tests, all passing**

## Future Enhancements

Potential improvements for future iterations:

1. **Alignment Controls**: Left, center, right, full-width
2. **Image Captions**: Add text descriptions below images
3. **Image Filters**: Basic filters (grayscale, sepia, etc.)
4. **Zoom/Lightbox**: Click to view full-size in modal
5. **Undo/Redo**: Better integration with history manager
6. **Keyboard Shortcuts**: Arrow keys for precise resizing
7. **Alt Text Editor**: Inline editor for accessibility
8. **Image Optimization**: Compress large images automatically

## API Reference

### ImagePayload Interface

```typescript
interface ImagePayload {
  src: string        // Image data URL or URL
  alt?: string       // Alt text for accessibility
  width?: number     // Width in pixels
  height?: number    // Height in pixels
}
```

### initializeImageBlockInteractions

```typescript
function initializeImageBlockInteractions(
  editorElement: HTMLElement,
  onContentChange: () => void
): (() => void) | undefined
```

Initializes event handlers for image block interactions. Returns a cleanup function.

**Parameters:**
- `editorElement`: The contenteditable editor element
- `onContentChange`: Callback to trigger when content changes

**Returns:**
- Cleanup function to remove event listeners

## CSS Classes

### Container Classes
- `.image-block-container` - Main container
- `.image-block-wrapper` - Inner wrapper for sizing
- `.image-block-img` - The actual image element

### Control Classes
- `.image-delete-btn` - Delete button
- `.image-resize-handle` - Base class for all handles
- `.image-resize-nw/ne/sw/se` - Corner handles
- `.image-resize-n/s/e/w` - Edge handles

### State Classes
- `.resizing` - Applied during resize operation
- `.group` - Tailwind group for hover state management

## Troubleshooting

### Images not showing UI elements

1. Check that CSS is loaded (`app/globals.css`)
2. Verify editor initialization in `RichTextEditor.tsx`
3. Ensure image has correct data attributes

### Resize not working

1. Check browser console for JavaScript errors
2. Verify `initializeImageBlockInteractions()` is called
3. Ensure event listeners are properly attached

### Delete button not appearing

1. Check CSS hover styles are loaded
2. Verify parent has `.group` class
3. Check z-index stacking context

## Performance Notes

- Event listeners are attached once per editor instance
- Mousemove events are only active during resize
- Cleanup function removes all listeners on unmount
- CSS transitions are GPU-accelerated
- No performance impact when not interacting with images
