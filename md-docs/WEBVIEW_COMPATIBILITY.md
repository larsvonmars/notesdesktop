# WebView and Tauri Compatibility Guide

This document describes the changes made to ensure 100% compatibility with WebView and Tauri environments.

## Overview

The Notes Desktop application has been optimized to work seamlessly in Tauri's WebView environment across different platforms (Windows, macOS, Linux). This includes handling various WebView implementations that may have different API support levels.

## Key Compatibility Fixes

### 1. CSS.escape() Polyfill

**Issue**: `CSS.escape()` is not available in all WebView implementations.

**Solution**: Added a polyfill in `lib/webview-polyfills.ts` that provides a standards-compliant implementation when the native API is missing.

**Usage**:
```typescript
// The polyfill is automatically initialized on app startup
const escapedId = CSS.escape(headingId)
```

### 2. document.queryCommandState() Compatibility

**Issue**: `document.queryCommandState()` is deprecated and unreliable in WebView environments.

**Solution**: Replaced with direct DOM queries for all formatting commands:
- Uses `element.closest()` to detect formatting states
- Falls back to `queryCommandState` only when necessary with proper error handling
- Provides consistent behavior across all platforms

**Example**:
```typescript
// Old approach (unreliable in WebView)
const isBold = document.queryCommandState('bold')

// New approach (WebView-compatible)
const element = selection.getRangeAt(0).commonAncestorContainer
const isBold = !!element?.closest('strong, b')
```

### 3. Timer Type Compatibility

**Issue**: `NodeJS.Timeout` type is not available in browser environments.

**Solution**: Changed timer refs to use `ReturnType<typeof setTimeout>`:
```typescript
// Before
const timerRef = useRef<NodeJS.Timeout | null>(null)

// After (browser-compatible)
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

### 4. DOM Node Detection

**Issue**: `isConnected` property may not be available in all WebView versions.

**Solution**: Replaced `isConnected` checks with `contains()` method:
```typescript
// More reliable across WebView implementations
const isInDocument = editorElement.contains(node)
```

### 5. DOMPurify SSR Safety

**Issue**: DOMPurify requires `window` to be available.

**Solution**: Added window existence check in sanitize function:
```typescript
const sanitize = (html: string) => {
  if (typeof window === 'undefined') return html
  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}
```

### 6. Canvas Device Pixel Ratio

**Issue**: `window.devicePixelRatio` might not be available or might be undefined.

**Solution**: Added safe fallback:
```typescript
const devicePixelRatio = typeof window !== 'undefined' && 
  typeof window.devicePixelRatio === 'number' 
    ? window.devicePixelRatio 
    : 1
```

### 7. Touch and Pointer Events

**Issue**: Touch interactions may not work properly in WebView.

**Solution**: Enhanced canvas elements with:
- `onPointerCancel` handler for proper touch cleanup
- `touchAction: 'none'` to prevent default browser behaviors
- `-webkit-user-select: none` for WebKit-based WebViews
- Pointer capture for smooth dragging

## Testing in Tauri

To test the application in Tauri:

1. **Development Mode**:
   ```bash
   npm run tauri:dev
   ```

2. **Production Build**:
   ```bash
   npm run tauri:build
   ```

3. **Testing Checklist**:
   - [ ] RichTextEditor: Formatting buttons work correctly
   - [ ] RichTextEditor: Slash commands menu functions properly
   - [ ] RichTextEditor: Undo/redo operations work
   - [ ] RichTextEditor: Link insertion dialog works
   - [ ] RichTextEditor: Search and replace functions correctly
   - [ ] DrawingEditor: Touch/stylus drawing works smoothly
   - [ ] DrawingEditor: Multi-page navigation works
   - [ ] DrawingEditor: Undo/redo functions correctly
   - [ ] DrawingEditor: Export to PNG/SVG works
   - [ ] MindmapEditor: Node creation and editing works
   - [ ] MindmapEditor: Zoom and pan functions smoothly
   - [ ] MindmapEditor: Node collapse/expand animations work
   - [ ] MindmapEditor: Mini-map displays correctly

## Platform-Specific Considerations

### Windows
- WebView2 (Chromium-based) - Full support for modern APIs
- All features should work without issues

### macOS
- WKWebView (WebKit-based) - Good support with polyfills
- `-webkit-` prefixed CSS properties used for compatibility

### Linux
- WebKitGTK - Good support with polyfills
- All polyfills ensure consistent behavior

## Known Limitations

1. **Image Optimization**: The mindmap editor uses `<img>` tags instead of Next.js Image component for user-uploaded attachments. This is intentional to support dynamic URLs.

2. **Canvas Performance**: Very large drawings or mindmaps with 100+ nodes may experience slight performance differences compared to native implementations. This is a WebView limitation.

## Debugging WebView Issues

If you encounter issues in Tauri:

1. **Enable Developer Tools**:
   - Add to `tauri.conf.json`:
   ```json
   "windows": [{
     "devTools": true
   }]
   ```

2. **Check Console Logs**:
   - Open DevTools in the Tauri window
   - Look for polyfill warnings or errors

3. **Test in Browser First**:
   - Run `npm run dev` to test in a regular browser
   - Ensure the issue is WebView-specific

4. **Verify Polyfills**:
   - Check browser console for "CSS.escape polyfill loaded" or similar messages
   - Ensure `WebViewPolyfillsInitializer` is mounted

## Future Improvements

- Monitor WebView API support changes
- Update polyfills as needed
- Consider native Tauri commands for file operations
- Optimize canvas rendering for mobile WebView

## References

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [CSS.escape() Specification](https://drafts.csswg.org/cssom/#the-css.escape%28%29-method)
- [contentEditable Best Practices](https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Editable_content)
- [Pointer Events Specification](https://www.w3.org/TR/pointerevents/)
