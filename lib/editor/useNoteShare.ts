'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getNote, type NoteType } from '@/lib/notes'
import {
  buildPublicShareUrl,
  getNoteShare,
  publishNoteShare,
  unpublishNoteShare,
  type NoteShareMetadata,
  type PublishedNoteShare,
} from '@/lib/note-shares'

interface ToastLike {
  push: (toast: { title: string; description?: string }) => void
}

export interface UseNoteShareOptions {
  noteId: string | undefined
  hasChanges: boolean
  save: () => Promise<void>
  toast: ToastLike
  buildMetadata: (content: string, type: NoteType) => Promise<NoteShareMetadata | null>
}

/**
 * Encapsulates the public-share lifecycle for a note: loading the existing
 * share, publishing/unpublishing, and the derived link/status display.
 */
export function useNoteShare({ noteId, hasChanges, save, toast, buildMetadata }: UseNoteShareOptions) {
  const [shareRecord, setShareRecord] = useState<PublishedNoteShare | null>(null)
  const [isLoadingShare, setIsLoadingShare] = useState(false)
  const [isPublishingShare, setIsPublishingShare] = useState(false)
  const [isUnpublishingShare, setIsUnpublishingShare] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadShare = async () => {
      if (!noteId) {
        setShareRecord(null)
        setIsLoadingShare(false)
        return
      }

      setIsLoadingShare(true)

      try {
        const existingShare = await getNoteShare(noteId)
        if (!cancelled) {
          setShareRecord(existingShare)
        }
      } catch (error) {
        console.error('Failed to load note share:', error)
        if (!cancelled) {
          setShareRecord(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingShare(false)
        }
      }
    }

    void loadShare()

    return () => {
      cancelled = true
    }
  }, [noteId])

  const shareUrl = useMemo(() => {
    if (!shareRecord) return null
    return buildPublicShareUrl(shareRecord.share_token)
  }, [shareRecord])

  const sharePublishedDisplay = useMemo(() => {
    if (!shareRecord?.published_at) return null
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(shareRecord.published_at))
  }, [shareRecord?.published_at])

  const shareHint = useMemo(() => {
    if (!noteId) {
      return 'Save this note once before publishing it.'
    }

    if (!process.env.NEXT_PUBLIC_SHARE_BASE_URL && typeof window !== 'undefined') {
      const protocol = window.location.protocol
      if (protocol === 'tauri:' || protocol === 'file:') {
        return 'Set NEXT_PUBLIC_SHARE_BASE_URL to your public web app URL so copied links work outside the desktop app.'
      }
    }

    return 'Publishing creates a read-only page for anyone with the link.'
  }, [noteId])

  const copyShareLink = useCallback(async () => {
    if (!shareUrl) return

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = shareUrl
        textArea.setAttribute('readonly', 'true')
        textArea.style.position = 'absolute'
        textArea.style.left = '-9999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }

      toast.push({ title: 'Share link copied' })
    } catch (error) {
      console.error('Failed to copy share link:', error)
      toast.push({ title: 'Copy failed', description: 'The share link could not be copied.' })
    }
  }, [shareUrl, toast])

  const openSharePage = useCallback(() => {
    if (!shareUrl) return
    window.open(shareUrl, '_blank', 'noopener,noreferrer')
  }, [shareUrl])

  const publishShare = useCallback(async () => {
    if (!noteId) {
      toast.push({ title: 'Save required', description: 'Save the note before publishing it.' })
      return
    }

    setIsPublishingShare(true)

    try {
      if (hasChanges) {
        await save()
      }

      const latestNote = await getNote(noteId)
      if (!latestNote) {
        throw new Error('Could not load the saved note for publishing.')
      }

      const metadata = await buildMetadata(latestNote.content, latestNote.note_type)
      const publishedShare = await publishNoteShare(latestNote.id, {
        title: latestNote.title,
        content: latestNote.content,
        note_type: latestNote.note_type,
        metadata,
      })

      setShareRecord(publishedShare)
      toast.push({
        title: shareRecord ? 'Share updated' : 'Note published',
        description: 'The read-only share page is ready.',
      })
    } catch (error: any) {
      console.error('Failed to publish note share:', error)
      toast.push({
        title: 'Publish failed',
        description: error?.message || 'The share page could not be published.',
      })
    } finally {
      setIsPublishingShare(false)
    }
  }, [buildMetadata, save, hasChanges, noteId, shareRecord, toast])

  const unpublishShare = useCallback(async () => {
    if (!noteId) return

    setIsUnpublishingShare(true)

    try {
      await unpublishNoteShare(noteId)
      setShareRecord(null)
      toast.push({ title: 'Share removed', description: 'The public share page is no longer available.' })
    } catch (error: any) {
      console.error('Failed to unpublish note share:', error)
      toast.push({
        title: 'Unpublish failed',
        description: error?.message || 'The share page could not be removed.',
      })
    } finally {
      setIsUnpublishingShare(false)
    }
  }, [noteId, toast])

  return {
    shareRecord,
    isLoadingShare,
    isPublishingShare,
    isUnpublishingShare,
    shareUrl,
    sharePublishedDisplay,
    shareHint,
    copyShareLink,
    openSharePage,
    publishShare,
    unpublishShare,
  }
}
