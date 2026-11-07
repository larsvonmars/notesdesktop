# Agent integration — data-layer audit (Saentis Notes / notesdesktop)

Scope: how notes and adjacent data are modelled, persisted and synchronised, and what an MCP
server would have to reuse or add. **Exploration only — no code changed.** Line refs are from the
working tree at audit time; the tree is dirty (offline-layer refactor of `lib/notes.ts`,
`lib/folders.ts`, `lib/offline/*` in progress), so refs may drift a few lines. Paths repo-relative.

---

## 0. TL;DR

1. **No server-side data API.** Next routes exist only for the AI proxy (`app/api/ai/*`, JWT checked,
   no note access) and account deletion (`app/api/account/delete`, service role). Tauri builds are a
   **static export** (`next.config.js:2-7`, `package.json:10`), so desktop mode has no Next server.
   MCP must call Supabase/PostgREST directly or ship a new backend.
2. **One column, six formats.** `notes.content text` = HTML for `rich-text`, raw JSON for the other
   five types. No version field, no server validation; the contract lives in 2k–5k-line components.
3. **Only notes/folders are offline-first** (IndexedDB cache + outbox + `updated_at` CAS). Projects,
   tasks, calendar, journal rows, attachments, shares, AI chats are direct client→REST calls.
4. **Auth is user-JWT + RLS; service role is used only for account deletion.** No PAT/OAuth/API-key
   model exists for agents.
5. **Realtime covers notes/folders/projects only, partially for bodies.** Supabase Postgres-change
   payloads cap at 1,024 KB and omit fields >64 B above that
   ([limits](https://supabase.com/docs/guides/realtime/limits)); the open editor is never refreshed
   from realtime (§6).

---

## 1. Entity / table inventory

| Entity | Table (schema source) | IDs | Key columns | Scoping / RLS |
|---|---|---|---|---|
| Note | `notes` (`DATABASE_SCHEMA.md:11-48`; type check in `supabase/schemas/DATA_SHEET_SCHEMA.sql:9`, `PDF_ANNOTATION_SCHEMA.sql:4`) | `uuid pk`, also client-supplied | `user_id`, `title text not null`, `content text not null default ''`, `folder_id`, `project_id`, `position`, `note_type` (6), `updated_at` (trigger) | owner-only, 4 policies, `auth.uid()=user_id` |
| Folder | `folders` (`FOLDERS_SCHEMA.md:11-51`) | `uuid`, also client-supplied | `user_id`, `name`, `parent_id` self-FK cascade, `project_id`, `position` | owner-only |
| Project | `projects` (`PROJECTS_SCHEMA.md:11-51`; `PROJECT_ARCHIVE_SCHEMA.sql:12`; `PROJECT_DASHBOARD_SCHEMA.sql:8`) | `uuid` | `name`, `description`, `color`, `position`, `quick_links jsonb`, `archived_at` | owner-only |
| Task lists / tasks / subtasks | `task_lists`, `tasks`, `subtasks` (`TASK_CALENDAR_SCHEMA.sql:11,62,260`) | `uuid` | tasks: `title`, `status` (5), `priority` (4), `due_date`, `completed_at`, `task_list_id`, `note_id`, `project_id`, `is_starred`, `is_archived`, `sort_order` | owner-only |
| Tags / task_tags | `tags`, `task_tags` (`:162-196`) | `tags.uuid`; join PK `(task_id,tag_id)` | `name`, `color` | owner via `EXISTS` on tasks |
| Calendar / Timetable | `calendar_events`, `recurrence_patterns` (`:112,30`); timetable = `category='timetable'` (`TIMETABLE_SCHEMA.sql:5-25`) | `uuid` | `start_time`, `end_time`, `timezone`, `category`, `is_recurring`, `recurrence_pattern_id`, `parent_event_id`, `attendees jsonb`, `is_cancelled` | owner-only |
| Reminders / time entries | `reminders`, `time_entries` (`:205,237`) | `uuid` | remind_at/is_sent; started/ended/duration | owner-only |
| Bullet-journal entry | `bullet_journal_entries` (`BULLET_JOURNAL_SCHEMA.sql:22-100`) | `uuid` | `note_id` FK cascade, `signifier` enum (7), `content`, `indent_level` 0-4, `sort_order`, `entry_date date`, `migrated_to/from`, `linked_task_id` | owner-only |
| Note attachment | `note_attachments` (`NOTE_ATTACHMENTS_SCHEMA.sql:8-51`) | `uuid` | `note_id` FK cascade, `kind image|file`, `storage_path`, `url` (signed), `mime_type`, `size_bytes`, dimensions, `metadata jsonb` | owner-only; binaries in bucket `user_docs` |
| Note share | `note_shares` (`NOTE_SHARES_SCHEMA.sql:5-47`) | `uuid` + `share_token` | `note_id` unique, `title`, `content` (**snapshot**), `note_type`, `metadata`, `published_at` | owner policies **plus public `select using (published_at is not null)`** → anon can read all published shares |
| AI chat | `ai_chats` (`AI_CHATS_SCHEMA.md:11-58`) | `uuid` | `note_id`, `title`, `messages jsonb` | owner-only |
| Kanban / notifications | `kanban_*` (`TASK_CALENDAR_ENHANCEMENTS.sql:47-120`), `notification_*` (`NOTIFICATION_SCHEMA.sql`) | `uuid` | boards/columns/positions; prefs/log | owner-only; out of MCP scope |
| Storage objects | bucket `user_docs`, path `<userId>/<rel>` (`lib/file-storage.ts:88-91`) | storage id | MIME/size; signed URLs 1 h or 30 days (`:10,341-350`) | **bucket policies not in repo** (dashboard only) |

Not tables: drawing, mindmap, data-sheet and PDF-annotation data are the `notes.content` string of
a `notes` row (PDF binaries in Storage).

Scoping/identity facts for MCP:
- Every row has `user_id uuid references auth.users(id) on delete cascade`; every table enables RLS
  `auth.uid() = user_id`. No teams, collaborators or per-note ACLs — sharing is a public token
  snapshot only.
- UUID PKs; **notes/folders accept client-supplied IDs** (offline creation, §4), so an MCP server
  can generate stable IDs. `database.types.ts` is hand-written and permissive
  (`[key:string]: any`, lines 168-173) — not a schema contract.
- Schema truth is 12 SQL snippets + 6 markdown guides, **no `supabase/migrations`**; constraints
  such as `notes_note_type_check` only exist as scattered `ALTER TABLE` snippets. Snapshot the live
  DB before building codecs.

---

## 2. Exact content representation per note type

Parse/serialise lives in `components/NoteEditor.tsx` (load 698-830, save 1843-1925, export
2445-2487). `note_type` values: `lib/note-types.ts:17`.

| `note_type` | Physical format | Type definition | Measured size (representative) |
|---|---|---|---|
| `rich-text` | HTML string, DOMPurify-sanitised on load/save | `lib/editor/sanitizeConfig.ts:3-30`; `RichTextEditor.tsx:562-565,2617-2632` | 0.7 KB for heading+paragraph+list+note-link+image block |
| `drawing` | JSON `DrawingData` | `DrawingEditor.tsx:48-64` | 1 page / 40-pt stroke ≈ 2.0 KB; **200 strokes × 200 points ≈ 1.31 MB** |
| `mindmap` | JSON `MindmapData` | `lib/mindmap/types.ts:5-45` | 3 nodes ≈ 0.6 KB; 120 nodes ≈ 21 KB |
| `bullet-journal` | **dual**: `BulletJournalData` JSON in `content` **and** rows in `bullet_journal_entries` | `BulletJournalEditor.tsx:57-75` | 1 serialised entry ≈ 0.25 KB |
| `data-sheet` | JSON `{columns, rows: string[][], columnWidths?, rowHeights?, frozenRows?, frozenCols?, filters?, sort?, headerRows?}` | `DataSheetEditor.tsx:40-66` | 20×6 ≈ 0.77 KB; 500×12 ≈ 66 KB |
| `pdf-annotation` | JSON `PdfAnnotationData` + PDF in Storage | `PdfAnnotationEditor.tsx:105-178` (PDF ≤ 50 MB, `:95`) | 1 annotated page ≈ 0.8 KB, grows with strokes |

Rich-text as persisted (shape from `noteLinkBlock.ts:20-30`, `imageBlock.ts:110-125`; attributes are
the DOMPurify allowlist):

```html
<h1>Project kickoff</h1>
<p>Notes from the <mark>meeting</mark>. See <span data-block="true" data-block-type="note-link"
 data-note-id="6a3f1c0e-…" data-note-title="Roadmap Q3" data-folder-id="f1">📝 Roadmap Q3</span></p>
<div class="image-block-container" data-block="true" data-block-type="image">
  <img src="https://<project>.supabase.co/storage/v1/object/sign/user_docs/<uid>/plan.png?token=…"
       alt="plan" width="640"/></div>
```

Mindmap: `{"rootId":"root","nodes":{"root":{id,text,x,y,parentId,children,collapsed,color,
description,attachments[]},…},"customEdges":[],"parentEdgeMeta":{}}`. Drawing:
`{"pages":[{"strokes":[{points:[{x,y,pressure?}],color,size,tool}],"background"}],"width":800,
"height":600,"currentPage":0}` (legacy `{strokes,width,height}` migrated on load,
`NoteEditor.tsx:709-722`). PDF annotation:
`{"pdfStoragePath","pages":[{pageNumber,pdfPageNumber?,isBlank?,strokes[],textAnnotations[],
shapes[],stickyNotes?}],"currentPage","totalPages","zoom"}`.

Format facts that matter:
- **Bullet journal: the editor renders `notes.content`, not the table.** `saveToDb()` is called on
  save (`NoteEditor.tsx:1892`) but `loadFromDb()` is never called (`BulletJournalEditor.tsx:220-233`),
  so `bullet_journal_entries` is currently write-only for the UI. An agent writing rows changes
  nothing a user sees; only `content` displays.
- Data-sheet formulas are raw `=A1+B1` strings evaluated only in the browser
  (`lib/editor/dataSheetSnapshot.ts:13-48`) — no server-side evaluation.
- Rich-text is **rewritten** by DOMPurify on load; custom blocks need `data-block` +
  URL-encoded `data-block-payload` + documented attrs (`noteLinkBlock.ts:32-55`).
- Image `src` is a 30-day signed URL (`file-storage.ts:10,356-380`) → content drifts stale. File
  blocks store a relative path and resolve lazily (`fileBlock.ts:38-47`).
- No app-level cap on `content`. Nearby limits: image 10 MB (`file-storage.ts:8`), PDF 50 MB,
  undo history 5 MB (`historyManager.ts:34`), home preview skips bodies >400 KB
  (`HomeDashboard.tsx:430`).

---

## 3. Operation inventory

All are **client-side** module functions issuing Supabase calls as the signed-in user. "Queue" =
offline write-behind (§4); "direct" = network round-trip required.

**Notes (`lib/notes.ts`)** — `getNotes(): Note[]` (408); `getNoteSummaries({limit,offset})` (458);
`getAllNoteSummaries(limit=5000)` (488); `getNote(id)` (493), `getNotesByIds(ids)` (525);
`getNotesByFolder(folderId,{limit,offset})` (679, `position` order); `getNotesByProject` (761),
`getNotesWithContentByProject` (801), `getNotesWithContentByType(type,limit=200)` (827);
`createNote({title,content,folder_id?,project_id?,position?,note_type?})` (873, queue);
`updateNote(id,{title?,content?,folder_id?,project_id?,position?,note_type?})` (923, queue + CAS);
`deleteNote(id)` (977, queue, hard delete); `moveNote(noteId,newFolderId,newPosition?,newProjectId?)`
(1005); `searchNotes(query,{limit?})` (1036, ILIKE title+content, ≤200, sanitised); `getNoteLinkIndex()`
(559, up to 5,000 rich-text bodies, 15 s throttle); attachments `createNoteAttachment(s)`/
`getNoteAttachments`/`updateNoteAttachment`/`deleteNoteAttachment` (1140-1233, direct);
`applyRealtimeNote` (1082), `subscribeToNotes` (1116). Duplicate/restore are UI-only:
`handleDuplicateNote` (`lib/workspace/useNoteActions.ts:224-251`) and `restoreNoteSnapshot`
(`:164-188`, new UUIDs → links break).

**Folders (`lib/folders.ts`)** — `getFolders` (200), `getRootFolders` (241), `getSubfolders` (247),
`getFolder` (253), `createFolder` (300), `updateFolder` (345), `deleteFolder` (412, cascades
descendants + cancels queued edits), `moveFolder` (498, cycle-checked), `reorderFolders` (666),
`getFolderPath` (539), `buildFolderTree` (559), `applyRealtimeFolder`/`subscribeToFolders` (612/642).

**Projects (`lib/projects.ts`)** — `getProjects` (55), `getArchivedProjects` (70), `getProject` (85),
`createProject` (99), `updateProject` (134), `archiveProject` (161), `restoreProject` (179),
`deleteProject` (199, children un-filed via `ON DELETE SET NULL`), `updateProjectQuickLinks` (314),
counts (262/275), `subscribeToProjects` (288). **Two bypass paths:** `moveFolderToProject` (213) and
`moveNoteToProject` (244) update `folders`/`notes` directly with no queue, no CAS and no
`emitDataChanged`; the folder move is a non-transactional two-step write.

**Tasks / calendar (`lib/tasks.ts`, `lib/events.ts`)** — task lists 101-163; `getTasks(filters)`
(169: list/project/note/status/priority/archived/completed/due range/starred); `getTaskWithDetails`
(233); `createTask` (281); `updateTask` (338); `deleteTask` (353); `completeTask` (362);
`uncompleteTask` (369); `toggleTaskStar` (376); `archiveTask`/`unarchiveTask` (380/384); subtasks
(392-454); tags (460-516); `getTaskStats` (533). Events: `getEvents(filters)` (75), `createEvent`
(131), `updateEvent` (178), `deleteEvent` (193), `cancelEvent` (202), recurrence (210-256),
reminders (258-345), time entries (347-461), timetable `getTimetableEntries` (493),
`createTimetableEntry(title,startHHMM,endHHMM,daysOfWeek,opts)` (514), `updateTimetableEntry` (580),
`deleteTimetableEntry` (647); instances generated client-side only (`generateTimetableInstances`,
665). All direct/network.

**Bullet journal (`lib/bullet-journal.ts`)** — `getEntriesForNote` (114), `getEntriesByDate` (125),
`getEntriesByDateRange` (140), `createEntry` (158), `updateEntry` (186), `deleteEntry` (201),
`bulkUpdateSortOrder` (210, N sequential updates), `migrateEntry` (226, 4-step non-transactional
clone). Direct; dual-store caveat in §2.

**Shares / AI chats / files** — shares `getNoteShare` (63), `publishNoteShare(noteId,{title,
content,note_type,metadata?})` (77, upsert on `note_id`, **snapshot not live**), `unpublishNoteShare`
(112), `getPublishedNoteShareByToken` (123), `buildPublicShareUrl` (54); AI chats `getAIChats`,
`getAIChat`, `createAIChat`, `updateAIChat`, `addMessage(s)ToChat`, `deleteAIChat`
(`lib/ai-chats.ts:43-165`), `subscribeToAIChats` (183, unused); files `listItems/uploadFile/
getFileSignedUrl/uploadImageFile/downloadFile/deleteFile/moveFile/renameFile`
(`lib/file-storage.ts:203-557`).

**AI assistant "tools" (not an API)** — `lib/ai.ts:616-751` declares 6 OpenAI-style functions
(`list_notes`, `read_note`, `search_notes`, `create_mindmap_note`, `replace_note_content`,
`edit_note_content`), executed inside the open note's React tree by `AIAssistant.tsx:770-929`. Write
tools mutate the editor buffer via `onReplaceText`; persistence is the normal 2 s autosave. The
proxy validates only tool *names* (`app/api/ai/validation.ts:4-12`). Closest existing analogue to an
agent write, not a reusable data API.

Sorting: notes in a folder by `position ASC` (734-745); global lists by `updated_at DESC` (201-203);
folders/projects by `position ASC`. No note-reorder function; no unique constraint on
`(folder_id, position)`.

---

## 4. Offline-first architecture (notes + folders only)

**Storage.** IndexedDB `mindviz-offline` v1, stores `notes`, `folders`, `outbox` + `meta`
(`lib/offline/storage.ts:14-16,68-75`), in-memory fallback for SSR/tests/locked-down WebViews
(45-48). Cached rows carry `__full` and `__serverUpdatedAt` (`lib/notes.ts:131-142`;
`lib/folders.ts:54-57`). Unencrypted (`OFFLINE_FIRST.md:124`), filtered per `user_id` at read time
(`lib/notes.ts:205-213`), cross-window events via `BroadcastChannel`
(`lib/offline/events.ts:7-13,58-74`).

**Write path.** (1) optimistic cache write + `emitDataChanged`; (2) `enqueueMutation`
(`lib/offline/queue.ts:140-207`) coalesces updates, merges insert+update, replaces entries on
delete, and blocks later updates while a delete is pending (`hasPendingDelete`, `:91,152-155`);
(3) immediate flush with a 4 s timeout (`flushEntry`, `lib/notes.ts:645`); on failure the queue
retries on `online`, `visibilitychange` and a 30 s interval (`lib/offline/sync.ts:498-526`), mounted
by `WorkspaceShell.tsx:129`.

**Conflicts / versioning.** Mutations carry `baseUpdatedAt`, `revision`, status
`pending|failed|conflicted`, plus `local`/`remote` snapshots (`lib/offline/types.ts:6-34`). Updates
are `UPDATE … WHERE id=? AND updated_at=?` (`lib/offline/sync.ts:168-174`); `updated_at` is
server-rewritten by `handle_updated_at()` (`DATABASE_SCHEMA.md:51-63`), so the guard always uses the
last server-confirmed timestamp. Zero rows → fetch remote: if the base still matches, retry without
the guard (clock skew, 184-196); else mark conflicted (198-203, `queue.ts:296`). In-flight coalesced
edits are rebased/resubmitted via `revision` (`sync.ts:358-386`); insert edited mid-flight becomes
an update (`:374`). Conflicts surface as toasts with keep-local/use-remote (`sync.ts:431`;
`OFFLINE_FIRST.md:69-100`) — no 3-way merge, no version history. Permanent errors (`42501`,
`23503`, `22P02`, `PGRST116`) fail fast, others retry ≤5 (`sync.ts:19,52-58`). Writes are serialised
per record (`lib/notes.ts:156-168`, `lib/folders.ts:81-95`, `queue.ts:25-42`).

**Temp IDs.** None: offline-created notes/folders get a real RFC-4122 v4 UUID
(`lib/offline/identity.ts:28-50`) used directly as the Postgres PK. An agent can therefore supply
IDs and there is no `local-*` remap layer. Lost insert responses are recovered on `23505`
(`sync.ts:150-158`).

**What an agent write must satisfy to be consistent/visible:**
1. Authenticate as the user (not service role); `user_id` must equal the JWT subject for RLS
   `WITH CHECK`.
2. Supply a UUID for `id` if you choose it; `title` non-null; `note_type` one of the 6 values, else
   the insert fails the CHECK.
3. Preserve denormalised invariants: `notes.project_id` should equal the folder's `project_id`
   (`lib/notes.ts:1005-1029`); `position` should be `max(sibling)+1` (`:608-619`). Nothing enforces
   this server-side.
4. Don't fight the `updated_at` trigger: send changed fields only; for CAS, `SELECT updated_at` and
   add `&updated_at=eq.<value>` to the PATCH (app-side only today).
5. Write the exact per-type envelope (§2); JSON types are `JSON.parse`d with fallbacks (corruption
   silently opens as empty/default) and rich-text is DOMPurify-rewritten on load.
6. Expect the outbox to win or conflict: if the user has unsynced edits, realtime echoes are
   ignored (`useWorkspaceData.ts:160`) and the flush either overwrites the agent (matching CAS) or
   records a conflict. There is no cross-writer lock API.
7. A note open in the editor does **not** refresh; its next 2 s autosave overwrites the agent (§6).
8. Attachments need a Storage object **and** a `note_attachments` row; paths are `<userId>/…`;
   bucket policy unverified.
9. All `*_at`/`*_time` are ISO-8601 UTC.

**Desktop/local agent constraints.** Tauri registers only `shell`, `opener`, `dialog`, `fs` plugins
and 4 AI commands (`src-tauri/src/lib.rs:12-21`); capabilities allow `shell:allow-open` and `fs`
under `$APPDATA/**`/`$APPDATA/images/**` only (`capabilities/default.json:8-20`); CSP is `null`
(`tauri.conf.json:20`). There is **no SQL plugin, no local HTTP server, no sidecar permission**. The
session is in WebView localStorage (supabase-js default), unreadable by a separate process. An
external writer cannot keep the in-memory + IDB outbox bookkeeping consistent, so **local MCP agents
should write via Supabase/PostgREST (or a future server API), never the IDB cache.**

---

## 5. Auth / identity in the data path

- `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` compiled into the client (`lib/supabase.ts:4-7`),
  default session persistence/auto-refresh; `AuthProvider` exposes session/user
  (`lib/auth-context.tsx:29-65`); email/password + OAuth login (`app/login/page.tsx:34,54`).
- `getCurrentUserId()` uses `getSession()` first so it works offline, then `getUser()`
  (`lib/offline/identity.ts:8-21`); writes stamp `user_id` explicitly.
- **RLS is the only authorisation boundary**; all policies are owner-only (`DATABASE_SCHEMA.md:27-48`,
  `FOLDERS_SCHEMA.md:30-44`, `PROJECTS_SCHEMA.md:30-44`, `TASK_CALENDAR_SCHEMA.sql:278-457`,
  `BULLET_JOURNAL_SCHEMA.sql:66-84`, `NOTE_ATTACHMENTS_SCHEMA.sql:30-51`,
  `AI_CHATS_SCHEMA.md:26-48`). No policy grants another user or an agent access.
- **Server routes**: `app/api/ai/chat|stream` require `Bearer <jwt>`, validate with an anon client's
  `auth.getUser(token)` (`route.ts:26-44`) and only proxy DeepSeek; the Cloudflare worker does the
  same against `/auth/v1/user` (`cloudflare/ai-worker/src/index.js:147-172`). `key-status` reports
  only server-key presence.
- **RLS bypass / service role call sites:** `app/api/account/delete/route.ts:16-72` verifies the JWT
  then uses `SUPABASE_SERVICE_ROLE_KEY` for `auth.admin.deleteUser` — the only service-role use
  (README:32). `note_shares`' public SELECT policy (`NOTE_SHARES_SCHEMA.sql:45-47`) lets the anon key
  enumerate all published shares (tokens included). Storage bucket `user_docs` policies are not in
  the repo (dashboard-only), so access control there is unverifiable. `.env` is git-ignored (empty
  `git ls-files .env`), but this workspace's `.env` holds a live DeepSeek key — don't copy it.
- **Reusable by MCP:** Supabase JWT verification and the RLS-scoped user client. **Missing:** token
  issuance/consent/scopes/audit (auth report's scope). Service role must not be the agent's data
  path — it removes the only cross-user isolation guarantee.

---

## 6. Realtime — would agent writes show up live?

- Subscriptions: `notes-changes` filtered `user_id=eq.<uid>` (`lib/notes.ts:1116-1136`),
  `folders-changes` (`lib/folders.ts:642-662`), `project-changes` (`lib/projects.ts:288-309`).
  `ai_chats` helper (`lib/ai-chats.ts:183`) is unused. Tasks/events/journal entries/attachments/
  shares have **no** subscriptions.
- Consumer: `useWorkspaceData` handles INSERT/UPDATE/DELETE, merges into IDB cache + React state via
  `applyRealtimeNote`/`applyRealtimeFolder` (`lib/workspace/useWorkspaceData.ts:152-240`); stale
  echoes are dropped, pending local mutations win, realtime is suppressed during autosave; project
  changes trigger a full reload (269-278).
- Publication config for notes/folders/projects is **not in the repo** (only `ai_chats` is added to
  `supabase_realtime`, `AI_CHATS_SCHEMA.md:56-57`) — verify in the dashboard.
- If published, agent writes reach clients as full-row changes (RLS-checked for the subscriber): list
  metadata and the IDB cache update in ~1 s. **But an update to the note currently open is not
  applied to `selectedNote`**: `WorkspaceShell` passes `selectedNote` (`WorkspaceShell.tsx:1135-1147`)
  and the editor reload effect is keyed only on `note?.id` (`NoteEditor.tsx:844`). The editor keeps
  its buffer and the 2 s autosave (`:2030-2063`) writes it back over the agent's change — silent
  last-writer-wins because the CAS base (fresh from realtime) matches.
- Payload size: >1,024 KB Postgres changes omit fields >64 B, so `content` is dropped for large
  drawing/PDF bodies; `applyRealtimeNote` keeps the cached body when `content` is absent
  (`lib/notes.ts:1104-1120`) → metadata updates, body stays stale.
- No live path for journal entries/tasks/calendar/shares/attachments: agent writes appear only on
  the next load/re-mount.

---

## 7. Gaps / risks for MCP integration (ranked)

1. **No server-side data API.** Remote MCP must speak PostgREST with a user JWT and re-implement
   ~40 operations, or a new backend must mirror client logic. Desktop can't host Next routes
   (static export) without a new sidecar/bridge.
2. **Opaque, versionless content formats.** Six formats in one `text` column, defined only by TS
   interfaces/component behaviour; no validation/versioning; corruption fails silently to an empty
   editor.
3. **Rich-text contract is non-obvious.** Persisted HTML includes editor chrome (toolbars, SVG,
   `contenteditable`) and custom blocks in `data-block-*`/URL-encoded payloads; DOMPurify rewrites
   agent input; `textToHtml()` only emits `<p>`/`<br>` (`lib/ai.ts:1626`), so "write markdown" is
   lossy.
4. **Offline outbox is invisible to other writers.** No server-enforced concurrency: agent writes
   can be ignored/overwritten by an open tab with pending edits, or surface as user-visible
   conflicts. `moveNoteToProject`/`moveFolderToProject` bypass the queue and cache entirely.
5. **Size limits & realtime payloads.** Bodies unbounded; drawing/PDF JSON often >1 MB, where
   realtime omits big fields; tool responses need their own caps (search ≤200, assistant list ≤60).
6. **No trash / soft delete / history.** Deletes are hard; folder delete cascades all descendant
   notes (`lib/folders.ts:412-459`); undo lives in toast memory and recreates rows with new UUIDs
   (`folderSnapshot.ts:81-121`), breaking links. Agent delete needs explicit safety design.
7. **Dual / duplicated sources of truth.** Journal: `notes.content` vs `bullet_journal_entries` (UI
   reads content; table is write-only from the app). Folder/note `project_id` consistency maintained
   by two different move implementations. `note_shares` snapshots never update. Image `src` URLs
   expire. Two note-link parsers (`NoteEditor.tsx:412`, `SharedNoteView.tsx:59-125`) and three
   HTML→text converters (`lib/ai.ts:1606`, `lib/home.ts:252`, `NoteEditor.tsx:164`) can disagree on
   what an agent "sees".
8. **Auth/consent model missing.** No agent identity, scopes, token issuance/revocation, audit log
   or data rate limits (only the AI proxy's per-request limiter, `app/api/ai/rate-limit.ts`). The
   service-role shortcut destroys isolation.
9. **Monolithic components own the formats.** `PdfAnnotationEditor` 5,050 lines, `NoteEditor` 3,979,
   `RichTextEditor` 3,743, `AIAssistant` 2,877, `MindmapEditor` 2,516, `DataSheetEditor` 1,977;
   serialisation/parse logic duplicated across editor/export/share/AI paths.
10. **Search is weak.** ILIKE over title+content only (no FTS/vectors, no tag/folder filters in the
    query, no cross-entity search), cap 200, offline fallback only over full cached bodies.
11. **Attachments/storage + schema drift.** Bucket RLS unversioned and note deletion cascades
    metadata but leaves storage objects orphaned. DB truth is manual SQL with no migrations;
    `database.types.ts` permissive. IndexedDB cache is unencrypted on disk (`OFFLINE_FIRST.md:124`),
    so a local process with profile access can read bodies without an API.

---

## 8. MCP mapping table (proposed surface → existing implementation)

**exists** = callable today (client-side; needs a server shell); **wrapper** = thin server adapter
over existing semantics; **new code** = logic only in UI/hook or absent.

| Proposed MCP tool / resource | Existing thing | Status |
|---|---|---|
| `notes_list(folderId?, projectId?, limit?, offset?)` | `getNoteSummaries`/`getNotesByFolder`/`getNotesByProject` (`notes.ts:458,679,761`) | wrapper |
| `notes_get(id)` | `getNote` (`notes.ts:493`) | wrapper + per-type decoder (new) |
| `notes_search(query, limit≤200)` | `searchNotes` (`notes.ts:1036`) | wrapper (reimplement ILIKE) |
| `notes_create(...)` | `createNote` (`notes.ts:873`) | wrapper (UUID/position/project rules) |
| `notes_update(id, patch)` | `updateNote` (`notes.ts:923`) | wrapper + per-type encoder |
| `notes_append` / `notes_replace_section` | none (AI tools edit the editor buffer) | new code |
| `notes_set_title` / `notes_move` | `updateNote`, `moveNote` (`notes.ts:1005`) | wrapper |
| `notes_duplicate(id)` | `handleDuplicateNote` (`useNoteActions.ts:224`) | new code (server copy) |
| `notes_delete(id)` | `deleteNote` (`notes.ts:977`) | wrapper + new safety/undo |
| `notes_links` / `notes_backlinks` | `getNoteLinkIndex` (`:559`) + HTML parser (`NoteEditor.tsx:412`); no links table | new code |
| `notes_link(from,to)` | `createNoteLinkHTML` + `updateNote` | new code (HTML mutation) |
| `folders_list` / `folders_tree` | `getFolders`, `buildFolderTree` (`folders.ts:200,559`) | wrapper |
| `folders_create/rename/move/delete` | `folders.ts:300,345,498,412` | wrapper (+ cascade semantics) |
| `projects_list/get/create/update/archive/delete` | `projects.ts:55,85,99,134,161,199` | wrapper |
| `tasks_list/get/create/update/complete/delete` | `tasks.ts:169,233,281,338,362,353` | wrapper |
| `calendar_list` / `timetable_list` / `timetable_create` | `events.ts:75,493,514` | wrapper |
| `journal_list/add/update/delete` | `bullet-journal.ts:114,158,186,201`; **UI reads `notes.content`** | new code (pick canonical store) |
| `datasheet_get` / `datasheet_set_cell` | `notes.content` JSON (`DataSheetEditor.tsx:40-66`) | new code (codec + formula policy) |
| `pdf_annotations_get/add` | `notes.content` JSON + Storage (`PdfAnnotationEditor.tsx:105-178`) | new code (codec + signed URL) |
| `drawing_get` / `mindmap_get/update` | `notes.content` JSON (`DrawingEditor.tsx:48-64`, `mindmap/types.ts:18-45`) | new code (codecs) |
| `attachments_list/upload` | `getNoteAttachments`/`createNoteAttachment`/`uploadFile` (`notes.ts:1199,1140`, `file-storage.ts:270`) | wrapper (storage policy TBD) |
| `shares_publish/unpublish` | `note-shares.ts:77,112` | wrapper (snapshot caveat) |
| `ai_chats_list/get` | `ai-chats.ts:43,70` | wrapper |
| `whoami` | `supabase.auth.getUser` / JWT `sub` | exists (token issuance = new, auth report) |
| Resources `note://{id}`, `folder://{id}`, `project://{id}`, `task://{id}`, `journal://{date}` | same tables/functions | new code (templates + codecs) |
| `agent_activity` / audit | none | new code |

Mapping notes: none of these are reachable over HTTP except raw PostgREST, so most tools are MCP-
server wrappers, not app changes — but wrappers must not re-derive business rules from UI code they
can't import (type encoders, note-link HTML, position/project resolution). `notes_update` is the
highest-risk tool (polymorphic, whole-body, unvalidated); prefer typed tools per note type plus a
read-modify-write CAS. Journal/share/chat writes are currently invisible to the UI without reload
and journal rows are not rendered — keep read-mostly in phase 1.

---

## 9. Open questions for the design doc

1. Are `notes`/`folders`/`projects` in the `supabase_realtime` publication? (Not provable from the
   repo.) If not, plan a change or drop "live update" from the MCP promise.
2. Is there an operational cap on `notes.content` size? Large drawings/PDF annotations exceed
   realtime and may exceed PostgREST response budgets.
3. Canonical write model: direct PostgREST + RLS, or a new backend owning codecs/validation? The
   latter is required if typed tools (datasheet, mindmap, PDF annotations) are in scope.
4. Which store is canonical for bullet-journal entries? Wire `loadFromDb` or retire the table?
5. Do we need soft delete/trash before exposing delete to agents? No recovery path exists except a
   toast undo that changes IDs.
6. Should agent writes to an open note be last-writer-wins, or does the app need an external-change
   banner / realtime→editor propagation?
7. Attachment/Storage policy, orphan cleanup, and whether agents may upload.
8. Is `note_shares`' public SELECT acceptable before an agent can list/publish shares?

---

## Appendix — files read

`lib/{notes,folders,projects,tasks,events,bullet-journal,ai-chats,note-shares,file-storage,
note-types,database.types,supabase,auth-context,ai,ai-model}`; `lib/offline/*`; `lib/editor/
{sanitizeConfig,noteLinkBlock,imageBlock,fileBlock,dataSheetSnapshot,pdf-stroke}`; `lib/mindmap/
types`; `lib/workspace/{useNoteActions,useFolderActions,useWorkspaceData,folderSnapshot}`;
`components/{NoteEditor,RichTextEditor,DataSheetEditor,DrawingEditor,MindmapEditor,
PdfAnnotationEditor,BulletJournalEditor,WorkspaceShell,AIAssistant,HomeDashboard,SidebarContextMenu}`;
`app/{dashboard,share,login,signup}/page.tsx`; `app/api/**`; worker `cloudflare/ai-worker/*`;
`src-tauri/src/*`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/*`; `next.config.js`,
`package.json`, `.env`; `supabase/schemas/*.sql`; `md-docs/*` schema/offline guides; `examples/*`;
`tests/{notes,offline,projects}.test.ts`, `tests/__mocks__/supabase.mock.ts`.
