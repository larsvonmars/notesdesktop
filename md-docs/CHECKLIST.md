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

## 🤖 AI Assistant QA Checklist

Use this checklist after AI assistant context changes to verify note access behavior is safe and predictable.

### Consent Flow
- [ ] Open AI assistant with a note selected and "current note in context" enabled.
- [ ] Send a prompt and confirm the note-context consent modal appears before the request is sent.
- [ ] Click "Cancel" and verify no user message is sent and no assistant response starts.
- [ ] Send again, click "Continue", and verify the pending prompt is sent automatically.
- [ ] Enable "Remember this choice on this device", send another prompt with note context, and verify the consent modal no longer appears.

### Context Diagnostics
- [ ] Select multiple notes in context picker and confirm the diagnostics row updates counts and char usage.
- [ ] Confirm diagnostics shows truncation warning when long notes are selected.
- [ ] Confirm diagnostics shows omitted-note warning when selected notes exceed injection limits.
- [ ] Switch between Chat and Reasoner models and verify context diagnostics remain visible and accurate.

### Tooling Behavior
- [ ] Ask the assistant to "search notes for <keyword>" and verify results are ranked and excerpted with readable boundaries.
- [ ] Ask the assistant to "read note <title>" for a long note and verify truncation marker is present.
- [ ] Ask for "list notes" in a large workspace and verify response is bounded with total-count summary.

### API Guardrails
- [ ] Verify oversized AI payloads return 413 from chat route.
- [ ] Verify oversized AI payloads return 413 from stream route.
- [ ] Verify invalid JSON request bodies return 400 with a clear validation error.
