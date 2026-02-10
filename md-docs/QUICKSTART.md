# 🚀 Quick Start

## Prerequisites

1. **Install Rust**: https://rustup.rs/
2. **Install Tauri Prerequisites**: https://tauri.app/v1/guides/getting-started/prerequisites
3. **Dependencies already installed**: ✅ `npm install` has been run

## Setup (5 minutes)

### 1. Configure Supabase

Create a project at [supabase.com](https://supabase.com), then:

```bash
# Edit .env.local with your Supabase credentials
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 2. Enable Email Auth

In Supabase Dashboard:
- Go to **Authentication** > **Providers**
- Enable **Email** provider

### 3. Create Notes Database Table

In Supabase Dashboard:
- Go to **SQL Editor**
- Click **New Query**
- Copy the entire SQL from `DATABASE_SCHEMA.md`
- Click **Run** to create the notes table

### 4. Run the App

```bash
npm run tauri:dev
```

## That's it! 🎉

The desktop app will open with login/signup pages.

---

## Common Commands

```bash
npm run tauri:dev    # Run desktop app (dev mode)
npm run tauri:build  # Build for production
npm run dev          # Next.js dev server only
```

## File Structure (Key Files)

```
app/
  ├── login/page.tsx      # Login page
  ├── signup/page.tsx     # Signup page
  └── dashboard/page.tsx  # Protected dashboard

lib/
  ├── supabase.ts         # Supabase client
  └── auth-context.tsx    # Auth state management

src-tauri/
  ├── src/main.rs         # Tauri backend
  └── tauri.conf.json     # Tauri config
```

## Need Help?

- 📖 Full docs: `README.md`
- 🔧 Setup guide: `SETUP.md`
- ✅ Feature checklist: `CHECKLIST.md`
- 📊 Project overview: `PROJECT_SUMMARY.md`
