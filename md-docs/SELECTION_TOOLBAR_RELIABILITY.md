# Selection Toolbar Reliability

Summary of the rework that made text selection + the floating formatting
toolbar reliable across desktop (WKWebView/WebKit), Chromium WebView and touch
devices. The user-visible behaviour table also lives in
[TOOLBAR_UI_GUIDE.md](./TOOLBAR_UI_GUIDE.md).

## Architecture

| File | Responsibility |
|------|----------------|
| `lib/editor/toolbarPosition.ts` | Pure placement math (unit-tested, no DOM access) |
| `lib/editor/selectionSnapshot.ts` | Capture/restore of the active selection across DOM mutations |
| `lib/editor/useFloatingToolbar.ts` | Show/hide rules, geometry inputs, event wiring, selection preservation |
| `components/SelectionToolbar.tsx` | Presentational toolbar: pointer hardening, keyboard nav, dropdowns, docked (touch) layout |
| `components/NoteEditor.tsx` | Wires the hook to the editor; runs commands with the selection guard |

## Show / hide rules (`useFloatingToolbar`)

The toolbar is **never** driven by raw `selectionchange` alone. The hook tracks
gesture state so the toolbar can never get in the way:

1. **Pointer down inside the editor** → hide immediately and ignore
   `selectionchange` until the pointer is released. During a drag the toolbar
   would otherwise sit under the cursor and swallow events.
2. **Pointer up / touch end** → re-evaluate one frame later (the browser
   finalizes the selection at mouse/touch end).
3. **Keyboard selection** (Shift+Arrow, Select-All, programmatic) → evaluated on
   `selectionchange`, since no pointer is involved.
4. **Press inside the toolbar** → enters "toolbar interaction" mode: nothing is
   re-evaluated (and the toolbar cannot unmount) until the button's `click` has
   been processed or a 1.5 s safety timer expires. This is what stops a WebView
   from clearing the selection on pointerdown and tearing the toolbar down
   before the command runs.
5. **Pointer down outside editor and toolbar** → dismiss; the toolbar stays
   hidden even if the browser keeps the old selection alive, until the user
   touches the text again (pointer or keyboard).
6. **Selection collapsed / empty / outside the editor** → hidden.
7. **Selection inside a read-only island** (`contenteditable="false"`, inputs) → hidden.
8. **Escape while visible** → hides and returns focus to the editor (the
   toolbar's own handler closes an open heading dropdown first).
9. **Selection scrolled out of the editor/window** → hidden (re-shown when it
   scrolls back into view).
10. **`enabled` is false** (saving/deleting) or the note changes → hidden.

## Placement rules (`toolbarPosition.ts`)

* Anchor **above the first selected line**, centred on that line.
* No room above → anchor **below the last selected line**, centred on it.
* Neither side fits → pick the side with more room and clamp to the viewport.
* Horizontal position is always clamped to a 16 px margin.
* Zero-size rects (blank lines, line-break rects) are ignored; the horizontal
  anchor prefers a line that actually has width.
* `range.getClientRects()` is used so multi-line selections anchor on *lines*,
  not on the bounding box of the whole block.
* The hook measures the toolbar (including a `ResizeObserver` for the "more"
  panel and narrow-screen wrapping) and re-runs the math whenever it changes.

## Selection preservation (`selectionSnapshot.ts`)

Pressing a toolbar button must never lose the user's selection. Before running a
command, `ensureEditorSelection()`:

1. Returns immediately if a healthy non-collapsed selection lives in the editor.
2. Otherwise focuses the editor and re-applies the captured snapshot:
   * **Node identity** — `Range.cloneRange()`. Browsers keep live ranges in sync
     when wrapping commands split text nodes, so the clone usually already
     covers the styled text.
   * **Block index + text offsets** — re-resolves the captured character offsets
     inside the block for commands that rebuild the block element.
3. Validates the restored selection against the text that was captured; a
   mismatching range is rejected instead of silently formatting the wrong words.

If no usable selection can be established, `handleCommand` **skips the command**
(running `bold` on a collapsed caret would otherwise insert placeholder text).

## Interaction details

* The toolbar container calls `preventDefault()` on `pointerdown`/`mousedown`, so
  pressing a button never moves focus or clears the selection. `click` still
  fires (canceled pointerdown only suppresses compatibility mouse events).
* Keyboard: `Tab` reaches the toolbar, `ArrowLeft/Right/Up/Down/Home/End` move
  between enabled buttons, `Enter`/`Space` activate. Buttons expose
  `aria-keyshortcuts`.
* The heading dropdown opens towards the side with more room and is clamped with
  `max-height: min(320px, 50vh)` + scrolling so it stays usable in short windows.
* Touch/compact layout (`docked`): the toolbar is replaced by a bottom-centred
  bar above `env(safe-area-inset-bottom)`, so it cannot cover the selection or
  the native selection handles. No geometry is computed in this mode.
* A short enter animation (`.selection-toolbar-in`) plays once per show; it is
  disabled under `prefers-reduced-motion`.

## Tests

* `tests/toolbarPosition.test.ts` — placement/clamping/flip cases.
* `tests/selectionSnapshot.test.ts` — capture/restore, node-identity restore
  across wrapping, offset fallback across block rebuilds, focus handling.
* Browser harness (built with esbuild, real `useFloatingToolbar` +
  `SelectionToolbar` in Chromium) verified: no toolbar during drag; placement
  above/below with clamping; button press keeps selection + focus; selection
  lost on pointerdown is restored before the command; "more" panel resize keeps
  the toolbar on screen; dropdown flip + height clamp; Escape behaviour; outside
  click dismisses; scroll out/in; docked layout at the bottom edge; Tab/arrow
  keyboard navigation.

## Gotchas for maintainers

* happy-dom's `Range.extractContents()` **splits** text nodes (same as browsers)
  but does *not* auto-adjust live ranges like Chromium does — that is why the
  restores are validated and why the offset fallback exists.
* Never re-add logic that shows the toolbar from a plain `selectionchange`
  handler without the gesture checks above: it re-introduces both the
  drag-blocking and the disappearing-toolbar bugs.
* Keep `pointerDownRef` / `toolbarInteractionRef` symmetric (`pointercancel`,
  `touchcancel`, window blur all clear the pointer state).
