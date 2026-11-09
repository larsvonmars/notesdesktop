# Saentis Notes 🏔️

An Alpine-themed desktop notes application built with Tauri, Next.js, and Supabase authentication.

## Prerequisites

- Node.js (v18 or higher)
- Rust (latest stable version)
- Supabase account

## Setup

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Configure Supabase**

   - Create a new project in [Supabase](https://supabase.com)
   - Copy `.env.local.example` to `.env.local` (already done)
   - Add your Supabase URL and anon key to `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   NEXT_PUBLIC_DELETE_ACCOUNT_ENDPOINT=https://your-domain.example/api/account/delete
   ```

   `SUPABASE_SERVICE_ROLE_KEY` is used only by the server-side account deletion endpoint.
   `NEXT_PUBLIC_DELETE_ACCOUNT_ENDPOINT` is optional and recommended for static/Tauri builds to point at a deployed delete-account API.

3. **Configure AI (DeepSeek)**

   - Add the DeepSeek key to `.env.local` for web proxy and desktop fallback:

   ```
   DEEPSEEK_API_KEY=your-deepseek-api-key
   ```

   - Desktop builds can also store the key in OS keychain via the integrated AI assistant settings path.

4. **App Icon** ✅

   - A placeholder icon has been created for development
   - To customize: See `ICON_SETUP.md` for instructions

5. **Enable Email Auth in Supabase**

   - Go to Authentication > Providers in your Supabase dashboard
   - Enable Email provider
   - Configure email templates (optional)

## Development

Run the app in development mode:

```bash
npm run tauri:dev
```

This will start both the Next.js dev server and the Tauri application.

### WebView Compatibility Check

To verify WebView compatibility:

```bash
npm run check:webview
```

This checks for common WebView compatibility issues. See [WEBVIEW_COMPATIBILITY.md](./WEBVIEW_COMPATIBILITY.md) for detailed information about WebView support.

## UI Architecture

The interface is a glassmorphic app shell. Everything is built from two layers:

- **Design system** — `app/styles/tokens.css` (semantic colours, glass material,
  shell geometry) and `app/styles/glass.css` (`.glass`, `.glass-card`,
  `.glass-row`, `.glass-btn*`, `.glass-input`, `.nav-pill`, `.segmented`, `.kbd`,
  aurora background). Tailwind exposes the same tokens and a few extras
  (`font-display`, `shadow-glass`, `ease-soft`, `animate-rise-in`, `max-w-reading`).
  Both light and dark themes are first-class; surfaces are intentionally
  translucent so they read as frosted glass over the aurora field.
- **Shell** — `components/shell/` contains the presentational navigation
  (68px `AppRail`, `TopBar` with breadcrumbs + history, `NoteListPane`,
  `MobileTabBar`, `EmptyEditorPane`, `ShellBackground`).
  `components/WorkspaceShell.tsx` owns the state, routing and wiring.

Navigation model: **rail → library → note list → editor → details**.
`lib/navigation/nav-history.ts` provides in-memory back/forward over
`{ view, folderId, projectId, noteId }`, and `lib/workspace/view-navigation.ts`
is the single source of truth for destinations and shortcuts.

Keyboard shortcuts: `⌘/Ctrl+K` command palette, `⌘/Ctrl+N` new note,
`⌘/Ctrl+J` AI assistant, `⌘/Ctrl+1..6` Home/Notes/Tasks/Files/Chat/Learn, `⌘/Ctrl+\` toggle
library, `⌘/Ctrl+[` and `⌘/Ctrl+]` back/forward.

The **AI assistant** (`components/AIAssistant.tsx` with markdown rendering in
`components/ai/AIMarkdown.tsx`) is a floating glass copilot panel: streaming
transcript with collapsible reasoning, context picker, quick actions, chat
history and structured suggestions. Open it from the note details footer, the
top-bar overflow menu, or `⌘/Ctrl+J`; `Escape` closes it.

The **Chat view** (`components/chat/` with the turn engine in `lib/chat/`) is a
full-page assistant: conversation history backed by the shared `chat_conversations`
/ `chat_messages` tables, streamed answers with collapsible reasoning, markdown,
image and PDF/DOCX attachments, a tool menu, and an agent mode that delegates to
scoped sub-agents. Tools call the app's own data layer (`lib/chat/tools.ts`), so
every request runs with the signed-in user's Supabase session. Open it from the
rail or `⌘/Ctrl+5`.

The **Learn view** (`components/learn/` with the data layer in `lib/learn/`) is the
workspace for everything flashcard-related, sharing the `learn_*` Supabase tables
with the MindViz Learn app. It includes a gamified dashboard (XP, level, streak,
daily goal, badges), deck management with single/bulk-CSV/PDF-AI card creation,
eight study modes (flashcard, multiple choice, spaced repetition with SM-2,
typed answer, timed test, smart three-round, AI Learn and AI Tutor), sprint-based
sessions with XP breakdowns and badge unlocks, a progress page with a study
heatmap and session history, study preferences, and a tool-using AI assistant
that can create decks/cards, analyze deck quality and build decks from PDFs.
Open it from the rail or `⌘/Ctrl+6`. Integration goes beyond the view:
the library pane becomes a Learn hub (navigation, deck search, mastery and a
Continue card), the top bar switches to "New deck" with Learn breadcrumbs and a
details toggle, Home shows a Learning panel, Settings gets a Learning section,
the command palette lists decks and searches flashcards, the Chat view gains
Learn tools, and the mobile bar gets a dedicated Learn tab. In Learn, `⌘/Ctrl+N`
creates a deck, `⌘/Ctrl+J` opens the Learn assistant, and the right-hand details
panel surfaces deck context, quick study modes and current-card info.

The **PDF annotation workspace** (`components/PdfAnnotationEditor.tsx`) follows the
same system: a single glass command bar (tools, colour/size popovers, undo/redo,
always-visible page navigation and zoom, search, panels, export), a contextual
property row, a Pages/Annotations side panel, a status bar, auto fit-to-page and
a touch dock with a pinned Style sheet.

The full design contract lives in [UI_REDESIGN_SPEC.md](./md-docs/UI_REDESIGN_SPEC.md).

## Build

Build the application for production:

```bash
npm run tauri:build
```

For web/server mode (includes AI proxy routes):

```bash
npm run build
```

For desktop static export assets (used by Tauri packaging internally):

```bash
npm run build:tauri
```

For Cloudflare Pages static output:

```bash
npm run build:pages
```

The built application will be available in `src-tauri/target/release/bundle/`.

## Cloudflare Deployment (Pages + Worker)

The web deployment is split into:

- Cloudflare Pages: static frontend (`out/` from `npm run build:pages`)
- Cloudflare Worker: AI proxy routes (`/api/ai/chat`, `/api/ai/stream`, `/api/ai/key-status`)

### 1) Configure Pages project

- Build command: `npm run build:pages`
- Build output directory: `out`
- Deploy command: `npm run cf:worker:deploy`
- Build environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SHARE_BASE_URL`
   - `NEXT_PUBLIC_AI_API_BASE_URL` (optional; set when Worker is hosted on a different origin)

Important: do not use bare `npx wrangler deploy` unless a root `wrangler.toml` exists and points to your AI Worker. This repository includes that file to avoid Cloudflare's OpenNext auto-migration path.

### 2) Configure Worker

Worker source and config are in `cloudflare/ai-worker/`.

Set Worker secrets/vars in Cloudflare:

- Required secrets:
   - `DEEPSEEK_API_KEY`
- Required vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Optional vars:
   - `ALLOWED_ORIGIN`
   - `AI_RATE_LIMIT_REQUESTS`
   - `AI_RATE_LIMIT_WINDOW_MS`
   - `AI_UPSTREAM_TIMEOUT_MS`

Run locally / deploy:

```bash
npm run cf:worker:dev
npm run cf:worker:deploy
```

### 3) Route AI endpoints

Choose one of the following:

- Same-origin route rule (recommended): route `/api/ai/*` to the Worker, keep `NEXT_PUBLIC_AI_API_BASE_URL` unset.
- Separate Worker domain: set `NEXT_PUBLIC_AI_API_BASE_URL` to the Worker origin (for example `https://notesdesktop-ai.example.workers.dev`).

Important: do not bind this Worker to `/*` on your main app domain. If you do, browser `GET /` requests will hit the AI worker instead of your Pages frontend.

## Features

- ✅ Desktop application with Tauri
- ✅ Next.js frontend with TypeScript
- ✅ Supabase authentication (email/password)
- ✅ Login and signup pages
- ✅ Protected routes
- ✅ Responsive UI with Tailwind CSS
- ✅ **Unified floating panel** - Single interface for all navigation and controls
- ✅ **Complete folder management** (create, rename, move, delete, nested folders)
- ✅ **Complete note management** (create, duplicate, move, delete, sort)
- ✅ **Multiple note types** (text, drawing, mindmap)
- ✅ **Note linking** - Create hyperlinks between notes with `/note-link` command
- ✅ **Knowledge Graph** - Visualize all notes and their connections
- ✅ **Context menus** for quick actions on folders and notes
- ✅ **Advanced search** across notes and folders
- ✅ **Drag and drop** - Move notes between folders with visual feedback
- ✅ **Keyboard shortcuts** for efficient workflow
- ✅ **Note sorting** (by updated date, created date, or title)
- ✅ **Delete confirmations** with safety warnings
- ✅ **Learn workspace** - Gamified flashcards with eight study modes, SM-2 spaced repetition, AI tutoring, PDF-to-deck generation, a context-aware library sidebar, Home/Settings panels, command-palette search and Chat tools
- ✅ **Real-time synchronization** with Supabase
- ✅ **Offline-first notes and folders** - local IndexedDB cache, write-behind sync and conflict detection
- ✅ **100% WebView and Tauri compatible** - Fully optimized for Windows, macOS, and Linux

## Project Structure

```
.
├── app/                  # Next.js app directory
│   ├── dashboard/       # Protected dashboard page
│   ├── login/          # Login page
│   ├── signup/         # Signup page
│   ├── layout.tsx      # Root layout with AuthProvider
│   └── page.tsx        # Home page (redirects)
├── components/learn/    # Learn view UI (dashboard, decks, 8 study modes, progress, AI)
├── lib/                 # Utilities
│   ├── learn/          # Learn data layer, gamification and AI flows
│   ├── supabase.ts     # Supabase client
│   └── auth-context.tsx # Auth context provider
├── src-tauri/          # Tauri backend
│   ├── src/            # Rust source
│   ├── Cargo.toml      # Rust dependencies
│   └── tauri.conf.json # Tauri configuration
└── package.json        # Node dependencies
```

## Documentation

- [Unified Panel Guide](./UNIFIED_PANEL_GUIDE.md) - Complete guide to the unified floating panel interface
- [Panel Migration Summary](./PANEL_MIGRATION_SUMMARY.md) - Technical details of the panel optimization
- [Note Link Feature](./NOTE_LINK_QUICKSTART.md) - Create hyperlinks between notes
- [Note Link Technical Guide](./NOTE_LINK_FEATURE.md) - Technical documentation for note linking
- [Knowledge Graph](./KNOWLEDGE_GRAPH_QUICKSTART.md) - Visual graph of note connections
- [Knowledge Graph Technical Guide](./KNOWLEDGE_GRAPH_FEATURE.md) - Technical documentation for knowledge graph
- [Folder and Notes Management Guide](./FOLDER_AND_NOTES_MANAGEMENT.md) - Complete guide to all folder and note management features
- [Project Summary](./PROJECT_SUMMARY.md) - Overview of the entire project
- [Database Schema](./DATABASE_SCHEMA.md) - Database structure and relationships
- [Offline-first storage](./md-docs/OFFLINE_FIRST.md) - Local cache, outbox, conflict resolution and data-layer scaling
- [WebView Compatibility Guide](./WEBVIEW_COMPATIBILITY.md) - Information about WebView and Tauri compatibility

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘6` / `Ctrl+6` | Open Learn |
| `⌘\` / `Ctrl+\` | Toggle unified panel |
| `N` (in panel) | Create new text note |
| `D` (in panel) | Create new drawing |
| `M` (in panel) | Create new mindmap |
| `F` (in panel) | Create new folder |

Right-click (or use ⋮ button) on folders and notes for more options!

## License

MIT
