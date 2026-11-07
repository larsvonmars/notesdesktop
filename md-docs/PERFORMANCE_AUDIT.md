# Performance audit & improvements

Date: 2026-11-07. Scope: whole app (React render path, data/cache layer, network,
bundle). Method: two read-only audits (UI/render + data/network/bundle), static
inspection, `.next/diagnostics/route-bundle-stats.json`, and micro-benchmarks of
the hot serialization/render paths.

## Measured baseline

- `/dashboard` first load was **1,758,001 B (≈474 KB gzip)**. The largest single
  chunk (**744 KB raw / ≈194 KB gzip**) was the whole editor graph (all six note
  editors + grammar/PDF helpers), loaded even with no note open.
- Heavy binary deps were already lazy (pdf.js, jsPDF + html2canvas, mammoth,
  JSZip) — good.
- Annotated PDF note payloads are large: a synthetic 10 pages × 50 strokes ×
  100 pts payload is ~3 MB (3.5 ms `JSON.stringify`); a dense 30 × 200 × 100
  payload is ~35 MB (44 ms per stringify). The old dirty-check serialized the
  whole payload on *every* page switch / zoom / stroke.
- Data cache: note bodies and summaries share one IndexedDB store, so every
  summary read deserializes all cached bodies (linear in cached content).

## Implemented in this pass

1. **Code-split the note editor** (`components/WorkspaceShell.tsx`)
   NoteEditor (and with it all six editors) is now a `next/dynamic` import. It is
   only fetched when a note is opened.
   *Measured: `/dashboard` first load 1,758,001 B → **1,088,496 B (-38%)**.*
2. **Reference-based dirty tracking** (`components/NoteEditor.tsx`)
   `hasChanges` compares editor data objects against the last loaded/saved
   snapshot instead of `JSON.stringify`-ing multi-MB payloads on every change.
   Removes ~23 ms (typical annotated PDF) to ~90 ms (dense) per page switch,
   stroke commit or zoom step. Mindmap/journal mount-time normalization
   emissions are treated as baseline, so fresh notes stay clean.
3. **Wheel-zoom coalescing** (`components/PdfAnnotationEditor.tsx`)
   Ctrl/Cmd+wheel zoom persisted the whole note on every wheel tick; now
   coalesced to one view-state update after the gesture (180 ms).
4. **AI streaming batching** (`components/AIAssistant.tsx`)
   Token callbacks now buffer and flush UI state every 80 ms instead of
   re-parsing markdown + re-rendering per token (O(n²) → O(n) over a response).
5. **Lightweight backlink index** (`lib/notes.ts`)
   `getNoteLinkIndex` no longer downloads every rich-text body *into the note
   cache*; it parses link targets once per TTL and persists only
   `{id,title,folder_id,linkIds}` metadata. Removes the cache bloat that slowed
   every subsequent cache read, and improves offline backlinks.
6. **PDF page raster no longer re-runs per annotation**
   (`components/PdfAnnotationEditor.tsx`): the pdf.js raster effect now depends
   on primitive page descriptors, not the whole `pages` array. Committing a
   stroke/shape/text no longer re-rasterizes the page at DPR scale
   (previously 30–150 ms per annotation on large pages).
7. **PDF open work deferred** (`components/PdfAnnotationEditor.tsx`):
   cross-page search-index text extraction now starts on first search instead of
   on open; AI text extraction starts 1.5 s after open. Stale index is cleared
   when a different PDF is loaded.
8. **SidebarTree O(N+F)** (`components/SidebarTree.tsx`): per-folder note lists,
   descendant note counts, per-project note/folder counts and project lookups are
   precomputed once per data change instead of filtering `allNotes` per row
   (previously 4.9 ms/tree at 100 folders + 3k notes, 18 ms at 200 + 6k).
9. **WorkspaceShell derived data** (`components/WorkspaceShell.tsx`):
   `listNotes`/`recentNotes`/current folder+project are memoized so unrelated
   renders no longer rebuild/sort the full list.
10. **Silent, table-aware cache refresh** (`lib/workspace/useWorkspaceData.ts`):
    background reloads triggered by cache events no longer flip loading flags
    (no note-list skeleton flash every autosave) and only reload the affected
    collections (note events skip folder reloads).

## Remaining recommendations (ranked, not implemented here)

1. **DrawingEditor live-stroke redraw** — `components/DrawingEditor.tsx:310-394,
   482-509`: every pointermove re-runs `perfect-freehand` + Path2D + fill for all
   strokes (measured 13/30/50 ms at 100/200/400 strokes). Draw the live stroke on
   an overlay canvas and commit on pointerup, cache Path2D per stroke, rAF-batch
   points.
2. **PDF annotation overlay redraw** — `PdfAnnotationEditor.tsx:1246-1367`:
   full DPR canvas clear + stroke/shape/text redraw per pointermove and per text
   keystroke (up to ~55 ms measured). Cache per-stroke Path2D, draw static content
   once + live stroke on a second canvas, rAF-throttle previews.
3. **DataSheet grid** — `components/DataSheetEditor.tsx:1708`: whole grid rebuilds
   per edit (render lower bound 26 ms at 1000×10, ~130 ms at 5k rows). Memoize
   `<SheetRow>` by row identity and window the tbody; move the in-cell editor to
   an overlay. Also replace `data.filters ?? {}` with a stable empty object so the
   `visibleRowIndices` memo actually hits.
4. **Rich-text per-keystroke work** — `components/RichTextEditor.tsx:2778` reads
   `innerHTML` on every input (0.9–5.8 ms on large notes) and NoteEditor
   recomputes `stripHtml` + word counts. Debounce the parent `onChange` (~120 ms
   trailing, flush on blur/save/hide) and compute stats from the debounced value.
5. **Harper 15 MB wasm** — `lib/editor/grammar/useGrammarCheck.ts:287` preloads
   the engine on opening any rich-text note (first lint at 500 ms loads it
   anyway). Consider deferring to first edit/idle, or shipping grammar opt-in.
6. **Cache architecture** — note bodies and summaries share one store; consider a
   dedicated summaries store/columns so list reads don't deserialize bodies, plus
   an in-memory note map (IndexedDB as journal). This is the biggest remaining
   structural win for large libraries.
7. **Autosave fan-out** — `useWorkspaceData` still re-reads all summaries after
   each cache event; patching the one changed summary from the event's
   `recordId` would remove O(N) cache reads per autosave.
8. **Realtime/folder N+1** — notes channel re-subscribes on folder change;
   folder move/delete do per-note writes; `getNotes()` has a sequential
   pagination/body waterfall; `moveFolder` emits per note.
9. **Virtualization** — no list is virtualized; NoteListPane/TasksView are fine
   ≤~200 rows but SidebarTree/DataSheet need windowing for large workspaces.
10. **AI context budget** — up to 320 k injected chars and the entire chat history
    is rewritten per reply; consider a smaller budget and incremental appends.

## Verification

- `tsc --noEmit` clean; `eslint` 0 errors (pre-existing warnings only).
- **559/559 tests pass**, including a new regression test asserting the backlink
  index stays lightweight and works offline.
- Production `next build` passes; route bundle stats confirm the editor chunk is
  no longer part of the dashboard first load.

## Measurement recipes

- DevTools Performance (long tasks) for: drawing 100+ strokes, flipping/zooming a
  heavily annotated PDF, typing in a 1000-row sheet, typing 10 s in a ~200 KB
  note.
- React Profiler: commits per keystroke and "highlight updates" during an
  autosave (checks list-surface fan-out).
- Temporary `performance.mark/measure` around DrawingEditor `render()`, PDF
  `renderAnnotations()`/page raster, the NoteEditor dirty effect and each
  `useWorkspaceData` loader; log p50/p95.
