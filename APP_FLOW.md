# Application Flow

## 📱 User Journey

```
┌─────────────────────────────────────────────────────────────┐
│                     App Launch (/)                          │
│                                                             │
│  ┌─────────────────────────────────────────────────┐      │
│  │  AuthProvider checks for existing session       │      │
│  └─────────────────────────────────────────────────┘      │
│                           │                                 │
│                           ▼                                 │
│                    Has Session?                             │
│                     /         \                             │
│                   Yes         No                            │
│                   /             \                           │
│                  ▼               ▼                          │
│          /dashboard         /login                          │
└─────────────────────────────────────────────────────────────┘
```

## 🔐 Authentication Flow

### Login Flow
```
/login
  │
  ├─► User enters email & password
  │
  ├─► Submit form
  │
  ├─► supabase.auth.signInWithPassword()
  │
  ├─► Success?
  │     ├─► Yes → Redirect to /dashboard
  │     └─► No → Show error message
```

### Signup Flow
```
/signup
  │
  ├─► User enters email & password
  │
  ├─► Validate passwords match
  │
  ├─► Submit form
  │
  ├─► supabase.auth.signUp()
  │
  ├─► Success?
  │     ├─► Yes → Show "Check email" message
  │     │        → Redirect to /login after 3s
  │     └─► No → Show error message
```

### Protected Route Flow
```
/dashboard
  │
  ├─► useAuth() checks user session
  │
  ├─► User authenticated?
  │     ├─► Yes → Show dashboard content
  │     └─► No → Redirect to /login
```

## 🏗️ Component Architecture

```
RootLayout (app/layout.tsx)
├─► AuthProvider (lib/auth-context.tsx)
│   ├─► Manages user state
│   ├─► Listens to auth changes
│   └─► Provides useAuth() hook
│
└─► {children} - Page Content
    ├─► / (app/page.tsx)
    │   └─► Redirects based on auth state
    │
    ├─► /login (app/login/page.tsx)
    │   ├─► Email/password form
    │   └─► Calls Supabase signIn
    │
    ├─► /signup (app/signup/page.tsx)
    │   ├─► Registration form
    │   └─► Calls Supabase signUp
    │
    └─► /dashboard (app/dashboard/page.tsx)
        ├─► Protected route
        ├─► Shows user info
        └─► Sign out button
```

## 🔄 State Management

### Auth Context State
```typescript
{
  user: User | null,        // Current user object
  session: Session | null,  // Current session
  loading: boolean,         // Initial load state
  signOut: () => Promise    // Sign out function
}
```

### Session Persistence
```
User logs in
  │
  ├─► Supabase stores session in localStorage
  │
  ├─► App restarts
  │
  ├─► AuthProvider checks localStorage
  │
  └─► Session restored automatically
```

## 🛠️ Tech Stack Flow

```
User Interaction
      │
      ▼
┌───────────────────────────────┐
│  React Components (Next.js)   │
│  - TypeScript                 │
│  - Tailwind CSS               │
└───────────────────────────────┘
      │
      ▼
┌───────────────────────────────┐
│  Auth Context                 │
│  - State management           │
│  - useAuth() hook             │
└───────────────────────────────┘
      │
      ▼
┌───────────────────────────────┐
│  Supabase Client              │
│  - auth.signIn()              │
│  - auth.signUp()              │
│  - auth.signOut()             │
└───────────────────────────────┘
      │
      ▼
┌───────────────────────────────┐
│  Supabase Cloud               │
│  - Authentication             │
│  - Session management         │
│  - User database              │
└───────────────────────────────┘
```

## 🖥️ Desktop Integration

```
Tauri Application
      │
      ├─► Rust Backend (src-tauri/src/main.rs)
      │   └─► Native system integration
      │
      └─► WebView
          └─► Next.js Static Export (out/)
              ├─► HTML/CSS/JS
              └─► React components
```

## 🚀 Build & Development

### Development Mode
```
npm run tauri:dev
      │
      ├─► Start Next.js dev server (localhost:3000)
      │
      └─► Launch Tauri window
          └─► Load localhost:3000 in WebView
```

### Production Build
```
npm run tauri:build
      │
      ├─► Build Next.js static export → out/
      │
      └─► Build Tauri app with bundled files
          └─► Output: src-tauri/target/release/bundle/
```

## 📝 Adding New Features

### To add a new page:
```
1. Create app/[name]/page.tsx
2. Add 'use client' if using hooks
3. Use useAuth() for protection
4. Style with Tailwind
```

### To add database operations:
```
1. Create lib/[feature].ts
2. Import supabase client
3. Write async functions
4. Handle errors
5. Call from components
```
