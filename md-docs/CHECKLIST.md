# Development Checklist

## ✅ Completed Setup

- [x] Tauri backend configuration
- [x] Next.js frontend with TypeScript
- [x] Tailwind CSS styling
- [x] Supabase client setup
- [x] Authentication context
- [x] Login page
- [x] Signup page
- [x] Dashboard (protected route)
- [x] Route protection logic

## 🔧 Required Before Running

- [ ] Install Rust and Tauri prerequisites
- [ ] Run `npm install`
- [ ] Create Supabase project
- [ ] Update `.env.local` with Supabase credentials
- [ ] Enable email auth in Supabase

## 🚀 Ready to Start Development

Once you've completed the checklist above, run:

```bash
npm run tauri:dev
```

## 📝 Suggested Next Features

### Database Schema
- [ ] Create `notes` table in Supabase
  - id (uuid, primary key)
  - user_id (uuid, references auth.users)
  - title (text)
  - content (text)
  - created_at (timestamp)
  - updated_at (timestamp)
- [ ] Enable Row Level Security (RLS) policies
- [ ] Create indexes for performance

### Notes Features
- [ ] Create note component
- [ ] List all notes
- [ ] Create new note
- [ ] Edit existing note
- [ ] Delete note
- [ ] Search/filter notes
- [ ] Categories/tags system

### UI Enhancements
- [ ] Rich text editor
- [ ] Markdown support
- [ ] Dark mode toggle
- [ ] Keyboard shortcuts
- [ ] Note templates
- [ ] Export notes (PDF, Markdown, etc.)

### Advanced Features
- [ ] Real-time sync between devices
- [ ] Offline mode with local storage
- [ ] File attachments
- [ ] Note sharing
- [ ] Version history
- [ ] Tauri system tray integration
- [ ] Auto-save functionality

## Chat QA Checklist

Use this checklist after changing the Chat view or its tools.

### Conversations
- [ ] Start a new conversation, send a prompt, and confirm the title is generated and history persists after reload.
- [ ] Attach an image and a PDF/DOCX document and confirm both reach the model.
- [ ] Toggle agent mode and verify multi-step and sub-agent work completes.

### Tools
- [ ] Ask Chat to search and read notes, including a mindmap, bullet-journal and data-sheet note.
- [ ] Ask Chat to create a note, update it, and file it in a folder or project.
- [ ] Ask Chat to schedule an event and list the calendar for that day.
- [ ] Ask Chat to create a Learn deck with flashcards and read the cards back.
- [ ] Confirm delete tools refuse to run until the user explicitly confirms deletion.

### Guardrails
- [ ] Verify oversized Chat payloads return 413 from the stream route.
- [ ] Verify invalid JSON request bodies return 400 with a clear validation error.
