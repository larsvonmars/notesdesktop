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
  row was deleted).
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
