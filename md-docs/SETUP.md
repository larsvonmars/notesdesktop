# Quick Setup Guide

Follow these steps to get your Tauri + Next.js + Supabase app running:

## 1. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once created, go to **Settings** > **API**
3. Copy your **Project URL** and **anon/public key**
4. Open `.env.local` and replace the placeholder values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

## 2. Enable Email Authentication

1. In your Supabase dashboard, go to **Authentication** > **Providers**
2. Enable the **Email** provider
3. Configure email templates (optional):
   - Go to **Authentication** > **Email Templates**
   - Customize the confirmation and password reset emails

## 3. Run the Development Server

```bash
npm run tauri:dev
```

This will:
- Start the Next.js development server on port 3000
- Launch the Tauri desktop application
- Open a window with your app

## 4. Test Authentication

1. Click "Sign up" in the app
2. Enter an email and password
3. Check your email for a confirmation link
4. Click the confirmation link
5. Sign in with your credentials

## 5. Troubleshooting

### Rust not installed?
Install Rust from [rustup.rs](https://rustup.rs/)

### Tauri prerequisites missing?
Follow the [Tauri prerequisites guide](https://tauri.app/v1/guides/getting-started/prerequisites)

### Port 3000 already in use?
Change the port in `package.json` dev script and `src-tauri/tauri.conf.json`

### Supabase auth not working?
1. Check `.env.local` has correct values
2. Verify email provider is enabled in Supabase
3. Check browser console for errors

## Next Steps

- Add database tables for notes in Supabase
- Implement CRUD operations
- Add real-time subscriptions
- Customize the UI
