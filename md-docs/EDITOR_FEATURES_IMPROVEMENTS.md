# Editor Feature Improvements (Find & Replace, Paste, Shortcuts, Autoformat)

Follow-up round of polish for the rich text editor, focused on the features
around typing rather than the selection toolbar itself (see
[SELECTION_TOOLBAR_RELIABILITY.md](./SELECTION_TOOLBAR_RELIABILITY.md) for the
toolbar rework).

## 1. Find & Replace is now a live, non-modal find bar

**Before:** a modal dialog with a dark backdrop — the document was hidden behind
it, matches only updated when the "Find" button was pressed, and there was no
keyboard flow.

**Now:** `components/editor/SearchReplaceBar.tsx` (replaces
`SearchReplaceDialog.tsx`) — a floating bar below the app header:

| Behaviour | Detail |
|-----------|--------|
| Live search | Debounced 120 ms while typing, immediate for the toggles |
| Match feedback | `3/12` counter, `No results`, `1000+` when capped |
| Navigation | `Enter` next, `Shift+Enter` previous, wrap-around, first match scrolled into view when off-screen |
| Replace | `Replace` button or `Enter` inside the replace field; `Replace all` replaces in one undo step |
| Options | `Match case` and `Match whole word` toggles |
| Close | `Escape` (from anywhere), the ✕ button, or closing via `Cmd/Ctrl+F` is unaffected |
| Prefill | Opening with `Cmd/Ctrl+F` prefills from the current selection |
| Focus | Search field is focused/selected on open; replace keeps focus in the field; "replace all" returns focus to the query |
| Non-modal | The note stays visible and editable; the bar re-runs the search when content changes behind it (MutationObserver, 250 ms debounce) |

### Match model — `lib/editor/searchMatches.ts`

* Matches live in **one text node** each. The old flattened-`textContent` index
  reported matches that could not be highlighted or replaced (e.g. `foo bar`
  across `foo <strong>bar</strong>`); those are no longer counted.
* Read-only islands (`contenteditable="false"`) are skipped — their text is
  never replaced.
* Whole-word uses a runtime-built `\p{L}\p{N}_` regex (the project targets ES5,
  so the `u`-flag literal must not appear in source) with an ASCII fallback.
* `replaceMatches()` replaces back-to-front so earlier offsets stay valid and
  surrounding inline formatting is preserved. Stale matches (nodes that left the
  DOM) are skipped.

### Painting — `lib/editor/searchHighlight.ts` + `app/styles/editor-search.css`

All matches are painted with the **CSS Custom Highlight API**
(`::highlight(note-search-all)` / `::highlight(note-search-current)`) — no DOM
mutation, so nothing extra is sanitized, saved or exported. In browsers without
the API (older WebViews) the editor falls back to selecting the current match.

## 2. Paste as plain text (`Cmd/Ctrl+Shift+V`)

The keyboard handler used to *claim* this shortcut in a comment while doing
nothing. The paste event carries no modifier state, so the intent is recorded on
`keydown` (`plainTextPasteRef`, 1.5 s safety window) and consumed by the next
`paste`:

* With text on the clipboard → only the plain text is inserted (markdown/HTML
  conversion is skipped).
* Without text (e.g. a screenshot) → the normal image/HTML path still runs.

## 3. Shortcut fixes

* **macOS heading shortcuts now work.** `⌥⌘1…6` reported `event.key = '¡'…` on
  macOS, so the previous `key === '1'` checks never matched. The handler now
  derives the digit from `event.key` **or** `event.code` (`Digit1`…`Digit0`).
* **New:** `⌘/Ctrl+Alt+0` → normal paragraph.
* **New:** `⌘/Ctrl+Shift+V` → paste as plain text (see above).
* The keyboard-shortcut reference (`lib/editor/keyboardShortcuts.ts`, shown in
  the shortcuts dialog) was updated for the above, plus the autoformat list now
  includes the code-block fence and the missing heading levels.

## 4. `+` no longer hijacks typing in inputs

The global `+` handler in `NoteEditor` (opens the content-blocks menu) fired for
**any** `+` keystroke — including the note title, the find bar, the link dialog
and the word-goal input. It is now restricted to keystrokes typed inside the
editor's contenteditable root.

## 5. ``` code-block autoformat (and code-block protection)

* `checkListPrefixPattern('```')` already returned `code-block`, but the keydown
  switch had no case for it: the fence was deleted and nothing was inserted.
  There is now an `insertCodeBlockAtTrigger()` that turns the emptied line into
  `<pre><code><br></code></pre>` and places the caret inside.
* Markdown autoformat (inline patterns **and** block prefixes) is now skipped
  while the caret is inside `<pre>` — markup typed in a code block stays literal.

## Tests

* `tests/searchMatches.test.ts` — match finding (case/whole-word/limits/edges),
  single-text-node rule, read-only islands, `matchRange`, replace-all/one/stale.
* `tests/autoformat.test.ts` — code-block prefix detection.
* Browser harness (real `RichTextEditor` bundled with esbuild, real app CSS from
  the Tailwind CLI, driven with Playwright): `Cmd+F` opens the bar and prefills
  from the selection, live counting, Enter/Shift+Enter navigation with wrap,
  highlight registration (`CSS.highlights` keys), case/whole-word toggles,
  replace/replace-all, Escape from anywhere closes and clears highlights, count
  refresh while typing behind the bar, plain-text paste vs rich paste, macOS
  `⌥⌘1`/`⌥⌘0` (including the toggle back to paragraph), ``` + space creating a
  code block, literal markdown inside it, and autoformat still working outside.
