# Offline-first notes

Notes and folders are now local-first. The UI reads from an on-device cache and
writes are queued locally, so opening and saving a note no longer depends on a
network round-trip.

## Storage

- Cache and queue live in IndexedDB (`mindviz-offline`).
- `lib/offline/storage.ts` transparently falls back to an in-memory store when
  IndexedDB is unavailable (SSR, tests, restricted WebViews).
- Cached rows are scoped by `user_id`, so switching accounts never exposes
  another user's notes.
- Note bodies and folder metadata are cached separately from the outbox.
- A `BroadcastChannel` shares cache/sync/conflict events between multiple app
  windows, and other windows reload the outbox bookkeeping when one flushes.

## Read path

1. `getNoteSummaries()` / `getNotesByFolder()` return cached rows immediately
   and refresh in the background (15 s throttle).
2. `getNote(id)` returns a cached body when available; otherwise it fetches and
   caches it.
3. Workspace startup only loads **metadata** (`NOTE_SUMMARY_COLUMNS`). Note
   bodies are loaded lazily by the editor, AI tools, backlink index and the
   project dashboard.

## Write path

`createNote`, `updateNote`, `deleteNote`, `createFolder`, `updateFolder`,
`deleteFolder`, `moveNote`, `moveFolder` and `reorderFolders` all:

1. Update the local cache immediately (optimistic write).
2. Add a coalesced mutation to the outbox.
3. Try to flush immediately. If the network is unavailable the mutation stays
   queued and is retried when:
   - the browser fires `online`
   - the tab becomes visible
   - the 30 s retry timer runs
   - the user presses **Retry** in the sync indicator

Rapid edits to the same record are coalesced into a single queued mutation.

## Concurrency & ordering guarantees

Several invariants keep rapid saves (e.g. fast PDF page switching) from
producing false conflicts or losing edits:

1. **Saves are serialized per record.** `updateNote` / `updateFolder` run
   their cache-write + enqueue phase through a per-id promise chain, so a
   second save reads the cache (and the server-confirmed base) after the first
   local write; the network flush happens outside that lock so a slow save does
   not block the next edit.
2. **The guard uses the last server-confirmed timestamp.** The `notes` /
   `folders` tables have a `handle_updated_at()` trigger that overwrites
   `updated_at` with the server clock, so the optimistic local timestamp can
   never be used as the conflict base. Cached rows carry
   `__serverUpdatedAt` (set from every server row / realtime echo) and that is
   the value sent in `WHERE updated_at = ?`.
3. **Flushes are chained, not shared.** A flush requested by a newer save gets
   its own pass after the running one instead of being swallowed.
4. **In-flight edits are never dropped.** Outbox mutations carry a `revision`
   that is bumped when an edit is coalesced into them. Before removing an
   applied mutation the flusher checks the revision; if it changed, the newer
   payload is rebased on the server row that was just written and sent in the
   same flush (an insert that was edited in flight is converted to an update).
5. **Stale responses are ignored.** Merges from background fetches and
   realtime echoes are rejected when they are older than the cached
   server-confirmed `updated_at`, so a slow fetch cannot roll the cache back.
6. **Deletes are terminal.** A queued deletion drops later updates for the
   record, and a delete that lands while an update is in flight never
   resurrects the row in the cache or on the server.
7. **Duplicate flushes are idempotent.** If another window already applied the
   mutation (it is gone, or the remote row already contains the payload), the
   zero-row guard result is treated as success instead of a conflict. The
   conditional removal runs in one IndexedDB transaction, so a concurrent
   revision bump cannot be deleted by mistake.

## Editor vs. external writes

Chat (and any other client) writes through the same `notes` data layer, which
means the open note can change underneath the editor. `WorkspaceShell` keeps
that consistent:

1. **Dirty tracking** — `NoteEditor` reports `hasChanges` through
   `onDirtyChange`, and the shell keeps it in `editorDirtyRef`.
2. **Adoption** — every `emitDataChanged('notes', <id>)` for the open note
   triggers `getNote()` and, when the editor is clean, the fresh row replaces
   `selectedNote` (`shouldAdoptExternalNote` in `lib/workspace/noteRefresh.ts`).
   A `contentRevision` counter makes the mounted editor reload that body, since
   the load effect is keyed on the note **id** to avoid resets after save.
3. **Dirty buffers win** — nothing is adopted while the editor has unsaved
   edits; the save then fails the timestamp guard (see *Conflicts*) instead of
   silently overwriting the newer row.
4. **Flush on unmount** — switching views unmounts the editor while edits can
   still be inside the 2 s autosave debounce, so the editor flushes an autosave
   on unmount. Explicit cancel (after its confirm) and delete set a skip flag so
   a discarded buffer is never written or resurrected.
5. **Deleted while open** — if the row disappears and the editor is clean, the
   shell drops the selection instead of showing a ghost note that the next save
   would recreate.

## Conflicts

Updates are sent with a timestamp guard:

```sql
update notes ... where id = ? and updated_at = ?
```

If no row matches, the server row is fetched and compared:

- If the record no longer exists, the mutation is marked conflicted.
- Otherwise the mutation is stored as a conflict with both local and remote
  snapshots. The local copy stays in the cache and in the UI.

Conflicts are surfaced in the toast system and in the bottom-right sync
indicator. From there the user can:

- **Keep my version** — re-queue the local row (re-inserting it if the remote
  row was deleted). Cache-only fields (`__full`, `__serverUpdatedAt`) are
  stripped before the payload is sent to PostgREST.
- **Use server version** — replace the local cache row with the server row.

## Sync status

`lib/offline/sync.ts` exposes:

- `getSyncState()` — online state, pending / failed / conflicted counts.
- `subscribeToSyncState()` — reactive updates.
- `subscribeToConflicts()` — conflict events for toasts.
- `resolveConflict(id, strategy)`.

`OfflineStatusIndicator` renders this state and stays hidden when everything is
synced and online.

## Data-layer scaling

- `lib/database.types.ts` types the core workspace tables and is wired into
  `createClient<Database>()`. Regenerate it from the live project when the
  Supabase CLI is linked:

  ```sh
  npx supabase gen types typescript --linked > lib/database.types.ts
  ```

- Note list queries project only the columns they need. `select('*')` is now
  limited to attachment/single-row lookups.
- `getNoteSummaries({ limit, offset })` and `getNotesByFolder` paginate in the
  data layer (500-row pages, bounded at 5000 rows).
- `searchNotes(query, { limit })` is capped at 200 rows.
- Callers that only need metadata should use `NoteSummary` and `getNote` to
  hydrate a body on demand.

## Current limits

- Note attachments, bullet-journal entries and AI chat history still require a
  network round-trip.
- The IndexedDB cache is not encrypted. It is scoped per user but stored in the
  WebView profile like any other local app data.
- Backlinks use a lazily loaded rich-text content index (`getNoteLinkIndex`).
  A dedicated `note_links` table would remove that payload in the future.
