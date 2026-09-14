# On-Device Grammar Checking (Harper)

Spelling, grammar, punctuation and style suggestions for the rich text editor —
computed **locally** with [Harper](https://writewithharper.com) (Rust → WebAssembly,
Apache-2.0, shipped as the `harper.js` npm package). No text ever leaves the device.

> Harper only supports **English**. Blocks that are clearly not English are skipped
> automatically (see “Language guard” below); there is deliberately no attempt to
> check German/other languages.

## Architecture

```
lib/editor/grammar/
  engine.ts          Harper lifecycle: worker, wasm staging, ignore list, dictionary
  units.ts           pure DOM: which blocks to lint, flattened text + offset ⇄ Range maps
  highlight.ts       non-mutating squiggles via the CSS Custom Highlight API
  useGrammarCheck.ts scheduler (debounced, incremental), popover state, fix/ignore actions

components/editor/GrammarPopover.tsx   suggestion card (fixed overlay, never inside the editor)
app/styles/editor-grammar.css          ::highlight() rules (imported from globals.css)
```

`engine.ts` is the only file that imports `harper.js`; everything else is plain DOM,
so `units.ts` runs in the unit tests without WebAssembly.

## How a pass works

1. **Units** — `collectLintUnits` walks the editor’s top-level blocks. Paragraphs,
   headings and quotes are one unit each; every `<li>` is its own unit; `pre`,
   tables and `[data-block]` islands are never linted.
2. **Text** — `collectUnitText` flattens a unit into one string plus a segment map
   (`Text` node → offset range). Nested blocks contribute `\n` so paragraphs never
   read as one run-on sentence. Offsets are unit-relative, which keeps lints stable
   across inline formatting (`hello <strong>world</strong>` maps to one range).
3. **Lint** — units are packed into batches (blank-line separated, ≤ 24 k chars) and
   sent to Harper in one call per batch. Lints that straddle a separator are dropped.
   Blocks edited while the worker runs are re-queued instead of being mapped blindly.
4. **Paint** — each issue becomes a `Range` and is painted as a wavy underline with
   the **CSS Custom Highlight API**. The DOM is never mutated, so there is nothing to
   sanitize, normalise or save. Search highlights already rely on the same API.
5. **Fix** — clicking a squiggle resolves the caret position (`caretPositionFromPoint`)
   to the unit offset, finds the issue, and anchors the popover to the issue’s rect.
   Applying a suggestion:
   - re-reads the unit text and bails out if it no longer matches the lint (re-lint instead),
   - calls `onBeforeApply` (the editor pushes a history snapshot — same pattern as
     the other explicit commands),
   - patches the text node in place (single-node spans) or splices the range
     (spans across inline elements),
   - calls `onAfterApply` (`normalizeEditorContent` + `mergeAdjacentLists` +
     `emitChange`) and re-lints that unit.

Mutating the DOM via the editor’s own pipeline means undo/redo, autosave and the
sanitizer see the fix exactly like a manual edit.

## Scheduling

- `MutationObserver` on the editor root (child list + character data). Mutations are
  mapped to the unit they touched via `resolveDirtyTarget`; root-level/list-structure
  changes mark the whole document dirty.
- Debounce: 700 ms after the last mutation; the first pass after a note opens runs
  after 500 ms; after a fix the unit is re-linted after 150 ms.
- Passes are serialised (a promise chain) so results always merge in order.
- `preloadGrammarEngine()` compiles the wasm and builds Harper’s dictionary while the
  note is being read, so the first visible pass is quick.

## Engine details (gotchas)

- **Wasm staging**: the bundler hands Harper a root-relative asset URL, and Harper
  fetches the wasm *from inside its worker* — where relative URLs cannot be resolved
  (blob workers have no base URL). On top of that, a 16 MB response streaming into
  Chromium’s HTTP cache can fail/abort mid-body. `loadBinaryModule()` therefore
  downloads the asset once on the main thread and stages it as a `blob:` URL that
  both the worker and the main thread read from.
- **Fallback**: `WorkerLinter` gets 8 s to set up; WebViews that reject blob/module
  workers (or custom-scheme fetches from a worker) fall back to `LocalLinter` on the
  main thread. Both paths are transparent to the rest of the feature.
- **`isolateEnglish` stays off.** Harper’s isolation pass is documented as
  “proof of concept” and — verified in a real browser — it silently drops real
  problems in ordinary English (lowercase “i”, `dont`, `honney`). English quality
  wins over isolation.
- **Language guard**: `isNonEnglishText()` skips a block when Harper *both* says it is
  not English (`isLikelyEnglish`) *and* finds nothing to isolate, and the text is at
  least 80 characters. Short fragments are routinely misclassified (“Milk and
  honney” reads as non-English), so anything uncertain is linted — a missed error is
  worse than a stray squiggle. Verified: a 130-char German paragraph stays silent.
- **Ignore vs. dictionary**: “Ignore” uses Harper’s context hash (`ignoreLint`) and is
  context-sensitive — editing nearby text makes the lint eligible again. For names
  and jargon the popover therefore offers **Add word** (spelling lints only), which
  imports the word into Harper’s user dictionary. Both are persisted:
  - `notesdesktop:grammar-ignored-lints` — opaque hash list
  - `notesdesktop:grammar-dictionary` — word list

## Toggling & preferences

- `notesdesktop:grammar-check-enabled` (`'off'` disables) is read on mount.
- `RichTextEditorHandle.setGrammarCheckEnabled(enabled)` updates and persists it —
  ready to be wired to a settings UI / toolbar button.
- Harper’s `Dialect` (US/UK/…) and additional config live behind
  `lintPlainText(text, options)` in `engine.ts`.

## Tests & verification

- `tests/grammarUnits.test.ts` (23 tests) covers unit collection (lists, nested
  lists, islands, code, tables), flattening/offsets, dirty-target resolution,
  offset ⇄ range round-trips, and replacement (in-node, cross-node, insertions,
  separator gaps, removals). Highlight helpers are asserted to no-op when the
  Highlight API is missing.
- Browser-verified in real Chromium (temporary dev harness, since removed): worker
  path staging the wasm from a blob URL, squiggles on paragraphs **and** list items,
  click → popover → apply (`honney` → `honey`, count 5 → 4), debounced re-lint after
  typing, German paragraph quiet, Ignore persisting, Add word persisting and
  silencing future instances.

## Known trade-offs

- Native WebView `spellCheck` stays enabled (it covers other languages and the OS
  dictionary), so English spelling errors can show both Harper’s wavy underline and
  the platform’s squiggle. Flip `spellCheck` to `false` in `RichTextEditor` if the
  double marking bothers us after a release.
- Lint batches share one call, so cross-paragraph rules (“sentence starts with…”)
  only ever see a single block.
- The engine and its ~16 MB wasm load lazily and stay resident for the session;
  mobile WebViews pay the setup cost once per app launch.
