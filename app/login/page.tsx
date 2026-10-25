'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'
import { AlertCircle, ArrowRight, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'

function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      router.push('/dashboard')
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError(null)
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      })

      if (error) throw error
    } catch (error: any) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <main className="page-aurora relative flex min-h-screen flex-col text-foreground">
      <ThemeToggle />

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
        <Link
          href="/"
          aria-label="MindViz Notes home"
          className="focus-ring mb-8 inline-flex items-center gap-2.5 rounded-2xl"
        >
          <img
            src="/icon-192.png"
            alt=""
            className="h-10 w-10 rounded-xl object-contain shadow-[0_12px_32px_-16px_var(--accent-glow)] ring-1 ring-black/5 dark:ring-white/10"
          />
          <span className="font-display text-lg font-semibold tracking-[-0.02em]">
            MindViz Notes
          </span>
        </Link>

        <div className="glass-card animate-rise-in w-full max-w-[420px] p-6 sm:p-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Welcome back
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.025em] text-foreground">
            Sign in to your workspace
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Continue where you left off — your notes, maps, and projects are waiting.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-xl bg-danger-light px-3.5 py-3 text-[13px] leading-5 text-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-foreground">
                Email
              </label>
              <div className="relative">
                <Mail
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="glass-input h-11 pl-10 pr-3.5 text-sm focus-ring"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-medium text-foreground"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="glass-input h-11 pl-10 pr-3.5 text-sm focus-ring"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glass-btn-primary focus-ring h-11 w-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3" aria-hidden>
            <div className="glass-divider flex-1" />
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              or continue with
            </span>
            <div className="glass-divider flex-1" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="glass-btn focus-ring h-11 w-full text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleIcon />
            Sign in with Google
          </button>

          <p className="mt-6 text-center text-sm text-muted">
            Don&lsquo;t have an account?{' '}
            <Link
              href="/signup"
              className="focus-ring rounded font-medium text-accent underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          </p>
        </div>

        <p className="mt-7 inline-flex items-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          Protected by Supabase Auth
        </p>
      </div>
    </main>
  )
}
