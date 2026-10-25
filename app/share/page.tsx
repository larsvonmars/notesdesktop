'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowRight, Loader2, SearchX } from 'lucide-react'
import SharedNoteView from '@/components/SharedNoteView'
import { getPublishedNoteShareByToken, type PublishedNoteShare } from '@/lib/note-shares'

function SharePageContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')?.trim() || ''
  const [share, setShare] = useState<PublishedNoteShare | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<'missing-token' | 'not-found' | 'error'>('not-found')

  useEffect(() => {
    let cancelled = false

    const loadShare = async () => {
      if (!token) {
        setShare(null)
        setErrorType('missing-token')
        setErrorMessage('A share token is required to open this page.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage(null)

      try {
        const publishedShare = await getPublishedNoteShareByToken(token)
        if (cancelled) return

        if (!publishedShare) {
          setShare(null)
          setErrorType('not-found')
          setErrorMessage('This shared note could not be found or is no longer published.')
          return
        }

        setShare(publishedShare)
      } catch (error) {
        console.error('Failed to load shared note:', error)
        if (!cancelled) {
          setShare(null)
          setErrorType('error')
          setErrorMessage('The shared note could not be loaded right now. Please try again later.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadShare()

    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) {
    return (
      <main className="page-aurora flex min-h-screen items-center justify-center px-5 py-12 text-foreground">
        <div
          className="glass-card animate-rise-in w-full max-w-sm p-8 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-light text-accent">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <p className="mt-5 text-sm font-medium text-foreground">Loading shared note…</p>
          <p className="mt-1.5 text-xs text-muted">Fetching the latest published version.</p>
          <div className="mx-auto mt-5 h-1 w-32 overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-accent opacity-70" />
          </div>
        </div>
      </main>
    )
  }

  if (!share) {
    const ErrorIcon = errorType === 'error' ? AlertTriangle : SearchX
    const iconTone =
      errorType === 'error'
        ? 'bg-warning-light text-warning'
        : 'bg-accent-light text-accent'

    return (
      <main className="page-aurora flex min-h-screen items-center justify-center px-5 py-12 text-foreground">
        <div className="glass-card animate-rise-in w-full max-w-md overflow-hidden text-center">
          <div aria-hidden className="h-1 w-full" style={{ background: 'var(--accent-gradient)' }} />
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${iconTone}`}>
              <ErrorIcon className="h-6 w-6" />
            </div>
            <h1 className="mt-5 font-display text-2xl font-semibold tracking-[-0.025em] text-foreground">
              {errorType === 'missing-token'
                ? 'Invalid share link'
                : errorType === 'error'
                  ? 'Something went wrong'
                  : 'Note unavailable'}
            </h1>
            <p className="mt-2.5 text-sm leading-6 text-muted">
              {errorMessage || 'This share link is invalid or no longer available.'}
            </p>

            <Link href="/" className="glass-btn focus-ring mt-6 h-10 px-4 text-xs">
              Go to MindViz Notes
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <div className="mt-7 flex items-center justify-center gap-2 border-t border-border pt-5 text-[11px] text-muted">
              <img src="/icon-192.png" alt="" className="h-4 w-4 rounded object-contain ring-1 ring-black/5 dark:ring-white/10" />
              <span>Powered by</span>
              <span className="font-semibold text-foreground">MindViz Notes</span>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return <SharedNoteView share={share} />
}

function SharePageFallback() {
  return (
    <main className="page-aurora flex min-h-screen items-center justify-center px-5 py-12">
      <div
        className="glass-card flex items-center gap-3 rounded-full px-5 py-3 text-sm font-medium text-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        <span>Loading shared note…</span>
      </div>
    </main>
  )
}

export default function SharePage() {
  return (
    <Suspense fallback={<SharePageFallback />}>
      <SharePageContent />
    </Suspense>
  )
}
