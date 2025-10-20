# Notes Desktop

A desktop notes application built with Tauri, Next.js, and Supabase authentication.

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
   ```

3. **App Icon** ✅

   - A placeholder icon has been created for development
   - To customize: See `ICON_SETUP.md` for instructions

4. **Enable Email Auth in Supabase**

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

## Build

Build the application for production:

```bash
npm run tauri:build
```

The built application will be available in `src-tauri/target/release/bundle/`.

## Features

- ✅ Desktop application with Tauri
- ✅ Next.js frontend with TypeScript
- ✅ Supabase authentication (email/password)
- ✅ Login and signup pages
- ✅ Protected routes
- ✅ Responsive UI with Tailwind CSS
- ✅ **Complete folder management** (create, rename, move, delete, nested folders)
- ✅ **Complete note management** (create, duplicate, move, delete, sort)
- ✅ **Multiple note types** (text, drawing, mindmap)
- ✅ **Note linking** - Create hyperlinks between notes with `/note-link` command
- ✅ **Knowledge Graph** - Visualize all notes and their connections
- ✅ **Context menus** for quick actions on folders and notes
- ✅ **Advanced search** across notes and folders
- ✅ **Keyboard shortcuts** for efficient workflow
- ✅ **Note sorting** (by updated date, created date, or title)
- ✅ **Delete confirmations** with safety warnings
- ✅ **Real-time synchronization** with Supabase
- ✅ **100% WebView and Tauri compatible** - All editors work seamlessly across platforms

## Project Structure

```
.
├── app/                  # Next.js app directory
│   ├── dashboard/       # Protected dashboard page
│   ├── login/          # Login page
│   ├── signup/         # Signup page
│   ├── layout.tsx      # Root layout with AuthProvider
│   └── page.tsx        # Home page (redirects)
├── lib/                 # Utilities
│   ├── supabase.ts     # Supabase client
│   └── auth-context.tsx # Auth context provider
├── src-tauri/          # Tauri backend
│   ├── src/            # Rust source
│   ├── Cargo.toml      # Rust dependencies
│   └── tauri.conf.json # Tauri configuration
└── package.json        # Node dependencies
```

## Documentation

- [Note Link Feature](./NOTE_LINK_QUICKSTART.md) - Create hyperlinks between notes
- [Note Link Technical Guide](./NOTE_LINK_FEATURE.md) - Technical documentation for note linking
- [Knowledge Graph](./KNOWLEDGE_GRAPH_QUICKSTART.md) - Visual graph of note connections
- [Knowledge Graph Technical Guide](./KNOWLEDGE_GRAPH_FEATURE.md) - Technical documentation for knowledge graph
- [Folder and Notes Management Guide](./FOLDER_AND_NOTES_MANAGEMENT.md) - Complete guide to all folder and note management features
- [Project Summary](./PROJECT_SUMMARY.md) - Overview of the entire project
- [Database Schema](./DATABASE_SCHEMA.md) - Database structure and relationships
- [WebView Compatibility Guide](./WEBVIEW_COMPATIBILITY.md) - Information about WebView and Tauri compatibility

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘\` / `Ctrl+\` | Toggle unified panel |
| `N` (in panel) | Create new text note |
| `D` (in panel) | Create new drawing |
| `M` (in panel) | Create new mindmap |
| `F` (in panel) | Create new folder |

Right-click (or use ⋮ button) on folders and notes for more options!

## License

MIT
