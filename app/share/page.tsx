'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, SearchX } from 'lucide-react'
import SharedNoteView from '@/components/SharedNoteView'
import { getPublishedNoteShareByToken, type PublishedNoteShare } from '@/lib/note-shares'

function SharePageContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')?.trim() || ''
  const [share, setShare] = useState<PublishedNoteShare | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadShare = async () => {
      if (!token) {
        setShare(null)
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
          setErrorMessage('This shared note could not be found or is no longer published.')
          return
        }

        setShare(publishedShare)
      } catch (error) {
        console.error('Failed to load shared note:', error)
        if (!cancelled) {
          setShare(null)
          setErrorMessage('The shared note could not be loaded right now.')
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
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#ccfbf1_0%,#f8fafc_40%,#e2e8f0_100%)] px-6 py-10">
        <div className="flex items-center gap-3 rounded-full border border-white/70 bg-white/80 px-5 py-3 text-sm font-medium text-slate-700 shadow-lg backdrop-blur">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading shared note...</span>
        </div>
      </main>
    )
  }

  if (!share) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#ccfbf1_0%,#f8fafc_40%,#e2e8f0_100%)] px-6 py-10">
        <div className="max-w-md rounded-[28px] border border-white/70 bg-white/85 p-8 text-center shadow-[0_30px_100px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <SearchX className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-950">Shared note unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{errorMessage || 'This share link is invalid or no longer available.'}</p>
        </div>
      </main>
    )
  }

  return <SharedNoteView share={share} />
}

function SharePageFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#ccfbf1_0%,#f8fafc_40%,#e2e8f0_100%)] px-6 py-10">
      <div className="flex items-center gap-3 rounded-full border border-white/70 bg-white/80 px-5 py-3 text-sm font-medium text-slate-700 shadow-lg backdrop-blur">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading shared note...</span>
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