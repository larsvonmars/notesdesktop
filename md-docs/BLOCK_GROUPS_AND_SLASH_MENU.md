# Block Groups, Slash Menu & Block Indentation

Third feature round for the rich text editor
(previous rounds: [editor features](./EDITOR_FEATURES_IMPROVEMENTS.md),
[block controls & inline tools](./BLOCK_CONTROLS_AND_INLINE_TOOLS.md)).

## 1. Multi-block selections (shift+click on the handle)

`components/editor/BlockControls.tsx` + group helpers in `lib/editor/blockTools.ts`.

| Interaction | Result |
|-------------|--------|
| Click the handle | Menu for that single block (unchanged) |
| `Shift`+click the handle of another block | Selects the **contiguous range** between the anchor (the block whose handle was clicked last) and the clicked block, then opens the group menu |
| `Shift`+click again | Grows or **shrinks** the range towards the anchor |
| `Escape` (menu closed) / click into the text | Clears the selection |
| Drag the handle | Moves the **whole selection** |

Group menu: `N blocks selected` + Duplicate, Indent, Outdent, Move up, Move
down, Delete, Clear selection — "Turn into" is hidden because it only makes
sense for a single block.

* The highlight is an overlay rectangle (never a `class` on the blocks), so
  nothing about a selection can leak into saved HTML, sanitisation or undo.
* The handle **pins itself to the top of the selection** and shows the block
  count; hovering a block *outside* the selection makes the handle follow that
  block so a shift+click can extend the range.
* Group edits are one history step each, and the selection survives them
  (deleting disconnects the blocks, which clears it automatically).
* Dragging dims every selected block (45 %), shows the drop indicator at the
  reference block and moves the run with its internal order intact.

Pure helpers (`tests/blockTools.test.ts`): `getBlockRange`, `canMoveBlocks`,
`moveBlocks`, `canMoveBlocksBefore`, `moveBlocksBefore`, `duplicateBlocks`
(unique heading anchors), `removeBlocks` (leaves one empty paragraph when
everything goes) and `findDropReference` (ignores a whole dragged run).

## 2. Block inserter (the slash menu)

`components/editor/SlashMenu.tsx` + `lib/editor/slashCommands.ts`.

**One palette, four ways in.** It replaces the old floating "Insert Content
Block" modal entirely; every command that menu offered is in the catalogue now.

| Entry point | Behaviour |
|-------------|-----------|
| Type `/` at the start of a line (or after whitespace) | Opens with the typed text as the filter; the `/query` is removed when a command is applied |
| Floating **+** button (bottom right, rich text notes) | Opens the same palette at the caret |
| `+` key (while the caret is in the note body) | Same as the button |
| Type while a "+"-opened palette is visible | Filters it; whatever you typed is removed on apply, normal prose (whitespace) closes it |

Typing narrows the list, `↑`/`↓` walk it, `Enter`/`Tab` apply, `Escape` closes
it **without touching the text**. An unfiltered palette shows category sections
(Text, Headings, Lists, Content, Media); while filtering it becomes one flat
ranked list.

| Command | Keywords (examples) | Result |
|---------|---------------------|--------|
| Text | `paragraph`, `p` | `formatBlock p` |
| Heading 1–6 | `h1`…`h6`, `#`…`######`, `title` | `applyHeading(1…6)` |
| Bulleted / Numbered list | `bullet`, `ul`, `-`, `1.` | list commands |
| Checklist | `todo`, `task`, `checkbox` | checklist command |
| Quote | `>`, `blockquote`, `cite` | `formatBlock blockquote` |
| Code block | `pre`, `snippet`, ` ``` ` | `convertBlockToCode` |
| Divider | `hr`, `---`, `separator` | horizontal rule |
| Hyperlink | `url`, `link`, `a`, `href` | link dialog |
| Table | `tbl`, `grid`, `rows`, `columns` | table size dialog |
| Note link | `nl`, `notelink`, `wiki` | app: note picker (`onCustomCommand('note-link')`) |
| Data sheet table | `dst`, `data`, `sheet` | app: data sheet picker |
| Image | `img`, `picture`, `photo` | app: image file dialog + upload |
| File | `attach`, `attachment`, `upload` | app: file picker |

Editor-level commands run through the same code paths as the toolbar and the
block menu (heading ids, list normalisation, caret restoration); app-level ones
are forwarded to the host through the existing `onCustomCommand` hook, so
`NoteEditor` keeps owning uploads, pickers and dialogs.

Implementation notes:

* The menu is an overlay **next to** the editor, so it can never be serialised.
* While it is open it owns `↑ ↓ Enter Tab Escape` through a capture-phase
  listener on `document`; every other key flows into the editor and re-filters.
* The trigger is read **block-relative** (`lib/editor/textOffsets.ts`): browsers
  frequently leave the caret in a freshly created empty text node, so holding on
  to a specific text node would miss the trigger. `getTextOffsetInBlock` uses
  `Range.toString()` semantics, `findTextPosition` maps an offset back to a
  `(text node, offset)` pair — the `/query` run is deleted with a range built
  from those positions.
* Skipped inside code blocks (`pre`), custom `[data-block]` islands and table
  cells, and while a non-collapsed selection exists.
* Applying a command takes one history snapshot, so `Cmd/Ctrl+Z` always steps
  back over it.
* Commands that only insert elsewhere (image, file, note link, table, …) leave
  the emptied block behind — `ensureBlockPlaceholder` puts its `<br>` back so the
  block keeps its line height and stays clickable.

Pure helpers (`tests/slashCommands.test.ts`): `matchSlashTrigger` (line-scoped,
no spaces, max 24 characters), `filterSlashCommands` (exact label → label
prefix → keyword prefix → substring, catalogue order as tie-break) and
`groupSlashCommands` (ordered category sections).

## 3. Block indentation (`Tab` / `Shift+Tab`)

`getBlockIndent` / `setBlockIndent` / `indentBlock` in `lib/editor/blockTools.ts`.

* `Tab` indents, `Shift+Tab` outdents — three levels (28 px steps), stored as
  `data-indent` on the block and rendered by
  `app/styles/editor-blocks.css` (`margin-left`, because headings and
  blockquotes own their padding).
* Lists keep their own indent/outdent nesting, tables keep cell navigation and
  custom islands never move; `Tab` is swallowed at the limits so focus can never
  jump out of the note while writing.
* Also reachable from the block menu (**Indent** / **Outdent**) for every block
  that supports it — including whole selections.

## 4. Tests

* `tests/blockTools.test.ts` — indentation clamping/junk values/list guards,
  contiguous ranges, run moves (both directions + boundaries), gap-filling
  duplication, heading-anchor deduplication, run deletion, drop references with
  a dragged run, and `ensureBlockPlaceholder` (empty text nodes, islands, media).
* `tests/slashCommands.test.ts` — trigger matching (line scope, whitespace
  neighbourhood, second slash, query length), filter ranking for every command
  (including `nl`, `dst`, `img`, `attach`) and category grouping.
* `tests/textOffsets.test.ts` — offset ⇄ caret round-trips, `<br>` handling,
  nested text nodes, out-of-block guards.
* Browser harness (real editor, Playwright): `Tab`/`Shift+Tab` with computed
  margins, shift+click ranges with the "3 blocks selected" menu, group
  duplicate/delete/move/indent + undo, pinned handle with count, group drag with
  dimming and reorder, the inserter's category sections and filtered list,
  `/h5`/`/link`/`/todo`/`/divider`/`/table`, the app-level commands
  (`note-link`, `image`, `file`, `data-sheet-table` forwarded through
  `onCustomCommand`), the "+" button and `+` key opening the same palette with
  typed filtering, `Escape` leaving the text untouched, the empty
  "No matching blocks" state and undo after every apply.
