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

## Next Steps

1. Add notes database schema in Supabase
2. Implement CRUD operations for notes
3. Add real-time synchronization
4. Implement note categories/tags
5. Add search functionality

## License

MIT
