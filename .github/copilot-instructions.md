# Copilot Instructions for Notes Desktop

This is a Tauri desktop application with a Next.js frontend and Supabase authentication.

## Project Stack

- **Frontend**: Next.js 14 with TypeScript and Tailwind CSS
- **Desktop Framework**: Tauri (Rust)
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS

## Key Architecture Decisions

1. **Static Export**: Next.js is configured for static export (`output: 'export'`) to work with Tauri
2. **Auth Context**: Authentication state is managed via React Context (`lib/auth-context.tsx`)
3. **Client Components**: All pages use `'use client'` directive for client-side rendering
4. **Protected Routes**: Dashboard checks for authentication and redirects to login if needed

## Important Files

- `src-tauri/tauri.conf.json`: Tauri configuration, points to Next.js dev server in dev mode and `out/` in production
- `lib/supabase.ts`: Supabase client configuration
- `lib/auth-context.tsx`: Authentication context provider
- `.env.local`: Environment variables (create from `.env.local.example`)

## Development Commands

- `npm run dev`: Next.js development server only
- `npm run tauri:dev`: Full Tauri app with Next.js dev server
- `npm run tauri:build`: Build production desktop app

## Code Conventions

- Use TypeScript for all files
- Use functional components with hooks
- Use Tailwind CSS for styling
- Follow Next.js 14 app directory conventions
- Use async/await for Supabase calls
- Everything must be WebView compatible

## Common Tasks

### Adding a New Page
1. Create file in `app/[pagename]/page.tsx`
2. Add `'use client'` if using hooks or client-side features
3. Import and use `useAuth()` for protected pages

### Adding Supabase Database Operations
1. Create functions in `lib/` directory
2. Import `supabase` from `lib/supabase.ts`
3. Use async/await pattern
4. Handle errors appropriately

### Modifying Tauri Backend
1. Edit Rust code in `src-tauri/src/`
2. Update `Cargo.toml` for new dependencies
3. Use `#[tauri::command]` for exposed functions
4. Register commands in `main.rs`

## Next Development Steps

The app currently has authentication set up. Consider adding:
1. Notes database schema in Supabase
2. CRUD operations for notes
3. Real-time synchronization with Supabase
4. Note categories and tags
5. Search and filtering functionality
