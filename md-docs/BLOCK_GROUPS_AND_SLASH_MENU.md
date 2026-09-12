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

## 2. Slash menu (`/`)

`components/editor/SlashMenu.tsx` + `lib/editor/slashCommands.ts`.

Typing `/` after the start of a line (or whitespace) opens a filterable block
palette; typing narrows it, `↑`/`↓` walk it, `Enter`/`Tab` apply, `Escape`
closes it **and leaves the typed text alone**.

| Command | Keywords (examples) | Result |
|---------|---------------------|--------|
| Paragraph | `text`, `p` | `formatBlock p` |
| Heading 1–3 | `#`, `##`, `###`, `title` | `applyHeading(1…3)` |
| Bulleted / Numbered list | `bullet`, `ul`, `-`, `1.` | list commands |
| Checklist | `todo`, `task`, `checkbox` | checklist command |
| Quote | `>`, `blockquote` | `formatBlock blockquote` |
| Code block | `pre`, `snippet`, ` ``` ` | `convertBlockToCode` |
| Divider | `hr`, `---`, `separator` | horizontal rule |
| Table | `grid`, `rows`, `columns` | opens the table size dialog |

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
* Applying a command removes the `/query` first, then runs the same command
  path the toolbar/block menu uses (heading ids, list normalisation and caret
  handling stay in one place) and takes one history snapshot.

Pure helpers (`tests/slashCommands.test.ts`): `matchSlashTrigger` (line-scoped,
no spaces, max 24 characters) and `filterSlashCommands` (exact label → label
prefix → keyword prefix → substring, catalogue order as tie-break).

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
  a dragged run.
* `tests/slashCommands.test.ts` — trigger matching (line scope, whitespace
  neighbourhood, second slash, query length) and filter ranking.
* `tests/textOffsets.test.ts` — offset ⇄ caret round-trips, `<br>` handling,
  nested text nodes, out-of-block guards.
* Browser harness (real editor, Playwright): `Tab`/`Shift+Tab` with computed
  margins, shift+click ranges with the "3 blocks selected" menu, group
  duplicate/delete/move/indent + undo, pinned handle with count, group drag with
  dimming and reorder, slash menu open/filter (`h2`, `todo`, `bullet`,
  `divider`, `table`)/arrow navigation/apply/`Escape`, and the empty
  "No matching blocks" state.
