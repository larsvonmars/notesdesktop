# Tauri Heading Cursor Fix - December 2024

## Problem
When creating headers via slash commands in Tauri, the cursor would jump back up to the line above the newly created header instead of staying within the header element. This issue was specific to Tauri's WebView environment and did not occur in regular browsers.

## Symptoms
1. User types `/h1`, `/h2`, or `/h3` in the editor
2. Slash command menu appears and user selects a heading option
3. Heading is created but cursor jumps to previous line
4. User must manually click into the heading to continue typing

## Root Cause
The issue was caused by timing and focus management problems in Tauri's WebView:

1. **Focus Loss**: After removing the slash text and DOM manipulation, the editor would lose focus
2. **Race Conditions**: Multiple setTimeout operations with short delays (20-50ms) were causing race conditions
3. **Missing Focus Restoration**: No explicit focus calls after critical DOM changes
4. **Insufficient Delays**: Tauri's WebView needed longer delays than browser for cursor positioning

## Solution

### 1. Immediate Focus After DOM Changes
Added `editor.focus()` immediately after any DOM modification:
```typescript
// Replace the block
if (blockToConvert.parentNode) {
  blockToConvert.parentNode.replaceChild(heading, blockToConvert);
  
  // CRITICAL FIX: Focus editor immediately after DOM change for Tauri
  editor.focus();
  
  setTimeout(() => {
    // Position cursor...
  }, 80);
}
```

### 2. Increased setTimeout Delays
Updated delays for better Tauri WebView stability:
- Cursor positioning: 50ms → 80ms
- Content normalization: 100ms → 150ms
- Command execution: 20ms → 50ms

### 3. DOM Safety Checks
Added verification that heading still exists before cursor positioning:
```typescript
setTimeout(() => {
  // Verify heading is still in DOM (Tauri safety check)
  if (!editor.contains(heading)) {
    console.warn('Heading was removed from DOM');
    return;
  }
  
  // Position cursor...
}, 80);
```

### 4. Marker Paragraph
Added a paragraph element after heading to prevent cursor jumping:
```typescript
// Add a marker paragraph after heading to prevent cursor jump in Tauri
const markerP = document.createElement('p');
markerP.appendChild(document.createElement('br'));

// Insert marker paragraph immediately after heading
if (heading.nextSibling) {
  heading.parentNode?.insertBefore(markerP, heading.nextSibling);
} else {
  heading.parentNode?.appendChild(markerP);
}
```

### 5. Focus Management in executeSlashCommand
Enhanced focus handling in slash command execution:
```typescript
// CRITICAL FIX for Tauri: Refocus editor immediately after slash removal
if (editorRef.current) {
  editorRef.current.focus();
}

setTimeout(() => {
  // Special handling for headings
  if (command.command === 'heading1' || command.command === 'heading2' || command.command === 'heading3') {
    // CRITICAL FIX: Ensure editor is focused before applying heading
    if (editorRef.current) {
      editorRef.current.focus();
    }
    
    applyHeading(level);
  }
}, 50); // Increased delay
```

## Files Changed
- `components/RichTextEditor.tsx`
  - Modified `applyHeading()` callback (lines ~899-1061)
  - Modified `executeSlashCommand()` callback (lines ~1382-1571)

## Testing Checklist

### Browser Testing (Chrome/Firefox/Safari)
- [x] `/h1` creates H1 and cursor stays in heading
- [x] `/h2` creates H2 and cursor stays in heading
- [x] `/h3` creates H3 and cursor stays in heading
- [x] Keyboard shortcuts (Cmd/Ctrl+Alt+1/2/3) work correctly
- [x] Converting existing paragraph to heading works
- [x] Creating heading on empty line works

### Tauri Testing (All Platforms)
- [ ] `/h1` creates H1 and cursor stays in heading (Windows)
- [ ] `/h2` creates H2 and cursor stays in heading (Windows)
- [ ] `/h3` creates H3 and cursor stays in heading (Windows)
- [ ] `/h1` creates H1 and cursor stays in heading (macOS)
- [ ] `/h2` creates H2 and cursor stays in heading (macOS)
- [ ] `/h3` creates H3 and cursor stays in heading (macOS)
- [ ] `/h1` creates H1 and cursor stays in heading (Linux)
- [ ] `/h2` creates H2 and cursor stays in heading (Linux)
- [ ] `/h3` creates H3 and cursor stays in heading (Linux)
- [ ] Keyboard shortcuts work in Tauri
- [ ] No cursor jumping during rapid operations
- [ ] Focus remains in editor after heading creation

### Edge Cases
- [ ] Creating heading at start of document
- [ ] Creating heading at end of document
- [ ] Creating heading in middle of text
- [ ] Rapid heading creation (multiple in quick succession)
- [ ] Creating heading after undo/redo
- [ ] Creating heading with selected text
- [ ] Creating heading on empty line

## Performance Impact
The increased setTimeout delays add minimal perceived latency (30-130ms total) but significantly improve reliability in WebView environments. This trade-off is acceptable for cross-platform consistency.

## Browser vs. Tauri Differences

### Why Browser Works
- More lenient with DOM timing
- Better handling of rapid focus changes
- More forgiving with selection/range operations
- Synchronous DOM updates in most cases

### Why Tauri/WebView Required Fixes
- Stricter timing requirements for DOM updates
- Asynchronous focus handling
- Selection/range operations need explicit focus management
- DOM changes need longer settling time
- Focus can be lost more easily during operations

## Monitoring and Debugging

If cursor jumping issues persist:

1. **Enable Console Logging**: Look for warnings:
   - "Failed to position cursor after conversion"
   - "Failed to position cursor after insert"
   - "Heading was removed from DOM"

2. **Check Focus**: Verify editor has focus before and after operations
   ```javascript
   console.log('Has focus:', document.activeElement === editorRef.current)
   ```

3. **Verify Timing**: If issues persist, may need to increase delays further:
   - Try 100ms for cursor positioning
   - Try 200ms for normalization
   - Try 75ms for command execution

4. **Test Platform-Specific**: Issues may be specific to WebView version
   - Windows: WebView2 (Chromium)
   - macOS: WKWebView (WebKit)
   - Linux: WebKitGTK

## Related Documentation
- `TAURI_HEADING_FIX.md` - Previous heading creation fix
- `WEBVIEW_COMPATIBILITY.md` - General WebView compatibility guide
- `EDITOR_STABILITY_IMPROVEMENTS.md` - Editor stability improvements

## Future Improvements

1. **Platform Detection**: Detect if running in Tauri vs browser and use platform-specific timings
2. **Event-Based Cursor Positioning**: Use MutationObserver instead of setTimeout
3. **Progressive Enhancement**: Start with simple approach, add complexity only if needed
4. **Better Error Recovery**: More granular fallbacks for each operation type
5. **Automated Testing**: Add E2E tests for Tauri-specific behavior

## References
- [Tauri WebView Documentation](https://tauri.app/v1/guides/features/webview/)
- [Selection API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Selection)
- [contentEditable Best Practices](https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Editable_content)
