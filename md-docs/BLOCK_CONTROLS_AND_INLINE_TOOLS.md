# Block Controls, Clear Formatting, Text Case & URL Autoformat

Second feature round for the rich text editor (first round: find bar, paste,
shortcuts, code blocks — see [EDITOR_FEATURES_IMPROVEMENTS.md](./EDITOR_FEATURES_IMPROVEMENTS.md)).

## 1. Block handle (hover, menu, drag, keyboard)

`components/editor/BlockControls.tsx` + `lib/editor/blockTools.ts`.

Hovering any block shows a small label button in the left gutter (`P`, `H2`,
`•`, `☑`, `</>`, …). It is rendered as an **overlay next to** the editor, never
inside it, so it can never leak into the saved HTML, the sanitizer or undo
snapshots. The editor gained a matching left gutter (`pl-7 sm:pl-8`) so the
handle never covers text.

| Interaction | Result |
|-------------|--------|
| Click the handle | Block menu (focus lands on the first item, ↑/↓ walk it, `Escape` closes and refocuses the note) |
| Turn into | Paragraph, Heading 1–3, Quote, Code block, Bulleted/Numbered list, Checklist — current type is highlighted, selecting it is a no-op (commands would otherwise toggle) |
| Duplicate | Deep copy right below, heading anchors regenerated uniquely (`intro` → `intro-2`), other ids dropped |
| Move up / down, Delete | Structural edit with a forced history snapshot (undoable immediately) |
| Drag the handle | Native drag & drop reorder: source block dims to 45 %, an accent drop indicator shows where it will land, `dragend` cleans up |
| `⌥↑` / `⌥↓` | Keyboard/touch path for reordering (works without hover) |

Hover tracking listens to `pointermove` **and** `pointerover` — the latter is
needed because Chromium does not fire a new `pointermove` when the element under
a stationary cursor changes (e.g. the menu closing). The block a menu action
applies to travels with the handle/menu state, so a pending hide timer can never
turn a click into a no-op. Hover is disabled for coarse pointers
(`(pointer: fine)`), where `⌥↑/⌥↓` is the supported path.

## 2. Clear formatting

`clearInlineFormatting()` in `lib/editor/commandDispatcher.ts`, exposed as the
`clear-formatting` command:

* Selection-scoped; a collapsed caret clears the whole block.
* Removes bold, italic, underline, strikethrough, inline code, highlight spans,
  text-colour spans and font-size spans.
* **Coverage-aware**: fully covered wrappers are unwrapped; partially covered
  wrappers are split first, so text outside the selection keeps its formatting
  (`<strong>bold</strong>` with "ol" selected → `b` + `ol` + `d`, outer parts
  still bold).
* Links, code blocks (`pre`) and custom `[data-block]` islands are preserved.
* Toolbar: the eraser button in the selection toolbar's "More" panel.
  Shortcut: `⌘/Ctrl+\`.

## 3. Text case (`Aa` dropdown)

`lib/editor/textCase.ts` (+ `case:upper|lower|title` commands and an `Aa`
dropdown in the toolbar's "More" panel).

The selected text is re-assembled **across text nodes** before transforming, so
`hel**lo** world` is title-cased as a whole; block boundaries insert a virtual
separator so words never merge across paragraphs. Case changes that alter the
string length (`ß` → `SS`) fall back to per-node transforms. With a collapsed
caret the whole block is converted.

## 4. URL autoformat

Typing `https://…`, `http://…` or `www.…` followed by a space turns the URL into
a real link (`target="_blank"`, `rel="noopener noreferrer"`, `https://` added to
`www.` addresses). Trailing punctuation stays outside the link, and a closing
bracket that belongs to an opening one inside the URL is kept
(`…/wiki/Foo_(bar)`). Skipped inside existing links and code blocks.

## 5. Undo reliability for explicit actions

Every explicit command now takes a **forced history snapshot first**
(`executeRichTextCommand`, block menu actions, block drops, `⌥↑/⌥↓`). Before
this, `Cmd/Ctrl+Z` right after a toolbar/menu action could do nothing, because
the debounced capture (500 ms) had not run yet and `canUndo()` was still false.
Typing keeps its debounced grouping.

## Tests

* `tests/blockTools.test.ts` — classification/labels, move/swap/drop math,
  duplicate (unique heading ids, dropped ids), delete (incl. last block), code
  conversion.
* `tests/clearFormatting.test.ts` — full/partial coverage, highlight/colour
  spans, code-block and link preservation, collapsed caret, no-op and
  outside-selection guards.
* `tests/textCase.test.ts` — pure transforms, cross-node selections, block
  separation, collapsed caret, length-changing case mapping, outside selections.
* Browser harness (real editor + real toolbar, Playwright): handle hover/label,
  menu actions (turn into / duplicate / delete / move), drag with indicator and
  dimming, `⌥↑` reorder, undo after each, clear formatting via the toolbar
  button, `Aa` dropdown upper/lower through the toolbar, and URL autoformat with
  trailing punctuation.
