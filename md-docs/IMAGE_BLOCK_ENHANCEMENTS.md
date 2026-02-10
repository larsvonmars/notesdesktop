# Image Block Enhancement Documentation

## Overview

The rich text editor's image content block has been enhanced with comprehensive features for image manipulation, desktop integration, and seamless text flow.

## Features

### 1. Image Alignment

Images can be aligned in four different ways:

- **Left**: Image aligned to the left with text flowing around it
- **Center**: Image centered (default)
- **Right**: Image aligned to the right with text flowing around it
- **Full Width**: Image spans the full width of the editor

**How to Use:**
- Hover over an image to reveal the toolbar
- Click one of the four alignment buttons (left, center, right, full-width icons)
- The image will reposition immediately

### 2. Image Cropping

Interactive cropping allows you to adjust the visible area of an image without modifying the original file.

**How to Use:**
1. Hover over an image and click the crop button (scissors icon) in the toolbar
2. A crop overlay appears with a draggable crop area
3. Drag the crop area to reposition it
4. Drag the handles (8 total: 4 corners + 4 edges) to resize the crop area
5. Click "Apply" to save the crop or "Cancel" to discard

**Technical Details:**
- Crops are non-destructive (original image is preserved)
- Crop data is stored as percentages for responsive scaling
- Uses CSS `object-fit: cover` and `object-position` for efficient rendering

### 3. Image Resizing

Enhanced resize functionality with 8 handles for precise control.

**How to Use:**
- Hover over an image to reveal resize handles
- Drag any of the 8 handles (4 corners + 4 edges)
- Aspect ratio is automatically preserved
- Minimum size: 100px, Maximum size: 4000px

### 4. Image Captions

Add descriptive text below images.

**How to Use:**
- Images can include an optional caption
- Captions appear below the image in italic gray text
- Captions are editable inline (click to edit)

**Security:**
- Captions are HTML-escaped during render
- Further sanitized by DOMPurify before display
- Safe from XSS attacks

### 5. Desktop/Tauri Integration

When running as a desktop app (Tauri), images benefit from native OS integration.

**Native File Picker:**
- Uses OS-native file dialog for selecting images
- Supports: PNG, JPG, JPEG, GIF, WebP, SVG, BMP

**Local File Storage:**
- Images are saved to the app's data directory (`$APPDATA/images/`)
- Referenced via `file://` URLs instead of data URLs
- Reduces memory usage and improves performance
- Automatically managed by the app

**Fallback:**
- Gracefully falls back to web file input in browser mode
- Works identically in both environments

### 6. Delete Images

**How to Use:**
- Hover over an image to reveal the delete button (red trash icon in top-right)
- Click to remove the image
- A paragraph is automatically created after deletion for continued typing

## Usage Examples

### Inserting an Image

**Web Mode:**
```typescript
// User clicks the image button in content blocks menu
// A file input dialog appears
// User selects an image
// Image is inserted as a data URL
```

**Desktop Mode (Tauri):**
```typescript
// User clicks the image button in content blocks menu
// Native OS file picker appears
// User selects an image
// Image is saved to local app directory
// Image is inserted with a file:// URL
```

### Programmatic Usage

```typescript
import { imageBlock, type ImagePayload } from '@/lib/editor/imageBlock'

// Create an image with all features
const payload: ImagePayload = {
  src: 'file:///path/to/image.png',
  alt: 'Description',
  width: 600,
  alignment: 'center',
  caption: 'This is my image caption',
  crop: {
    x: 10,      // 10% from left
    y: 20,      // 20% from top
    width: 80,  // 80% of image width
    height: 60  // 60% of image height
  }
}

const html = imageBlock.render(payload)
```

## API Reference

### Types

```typescript
type ImageAlignment = 'left' | 'center' | 'right' | 'full'

interface CropData {
  x: number      // X position as percentage (0-100)
  y: number      // Y position as percentage (0-100)
  width: number  // Width as percentage (0-100)
  height: number // Height as percentage (0-100)
}

interface ImagePayload {
  src: string
  alt?: string
  width?: number
  height?: number
  alignment?: ImageAlignment
  crop?: CropData
  caption?: string
}
```

### Functions

**`initializeImageBlockInteractions(editorElement, onContentChange)`**

Initializes event handlers for image interactions.

- **editorElement**: The editor DOM element
- **onContentChange**: Callback when image is modified
- **Returns**: Cleanup function

**Tauri Utilities** (`lib/tauri/imageStorage.ts`)

```typescript
// Check if running in Tauri
isTauriEnvironment(): boolean

// Save image to local storage
saveImageToLocal(dataUrl: string, filename?: string): Promise<string>

// Open native file picker
selectImageFile(): Promise<{ path: string; name: string } | null>

// Read image as data URL
readImageAsDataUrl(filePath: string): Promise<string | null>

// Convert file:// URL to data URL
convertFileUrlToDataUrl(fileUrl: string): Promise<string>
```

## Browser Compatibility

### Web Mode
- All modern browsers (Chrome, Firefox, Safari, Edge)
- Requires ES2015+ for full functionality
- Graceful degradation for older browsers

### Desktop Mode (Tauri)
- Windows 10+
- macOS 10.15+
- Linux (with WebKit2GTK)

## Performance Considerations

1. **Large Images**: Base64 encoding uses chunking to prevent stack overflow
2. **Memory**: Desktop mode uses file:// URLs to reduce memory usage
3. **Rendering**: CSS-based cropping is GPU-accelerated
4. **Constraints**: Maximum image size is 4000px to prevent performance issues

## Security

1. **XSS Protection**: 
   - All user input (alt text, captions) is HTML-escaped
   - DOMPurify sanitizes all HTML before rendering
   - Contenteditable areas are properly scoped

2. **File System Access**:
   - Tauri fs plugin is scoped to `$APPDATA/**` only
   - Cannot access system files outside app directory
   - File operations are asynchronous and non-blocking

3. **URL Validation**:
   - Image sources are validated
   - file:// URLs only work in Tauri environment
   - Cross-origin images respect CORS policies

## Testing

All features are covered by automated tests:
- 36 total tests
- 23 tests for existing functionality
- 13 tests for new features (alignment, caption, crop)
- 100% test pass rate

Run tests with:
```bash
npm test -- tests/imageBlock.test.ts
```

## Future Enhancements

Potential future improvements:
- Image rotation
- Image filters (brightness, contrast, etc.)
- Batch image operations
- Cloud storage integration
- Image optimization/compression
- Drag-and-drop image insertion
- Paste image from clipboard
