import { supabase } from './supabase'
import type { NoteType } from './notes'

const NO_ROWS_ERROR_CODE = 'PGRST116'

export interface NoteShareMetadata {
  pdfUrl?: string | null
  pdfStoragePath?: string | null
  [key: string]: any
}

export interface PublishedNoteShare {
  id: string
  note_id: string
  user_id: string
  share_token: string
  title: string
  content: string
  note_type: NoteType
  metadata: NoteShareMetadata | null
  published_at: string
  created_at: string
  updated_at: string
}

export interface PublishNoteShareInput {
  title: string
  content: string
  note_type: NoteType
  metadata?: NoteShareMetadata | null
}

function isNoRowsError(error: any): boolean {
  return error?.code === NO_ROWS_ERROR_CODE
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

export function getPublicShareBaseUrl(): string | null {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_SHARE_BASE_URL?.trim()
  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl)
  }

  if (typeof window === 'undefined') {
    return null
  }

  return normalizeBaseUrl(window.location.origin)
}

export function buildPublicShareUrl(shareToken: string): string | null {
  const baseUrl = getPublicShareBaseUrl()
  if (!baseUrl) {
    return null
  }

  return `${baseUrl}/share?token=${encodeURIComponent(shareToken)}`
}

export async function getNoteShare(noteId: string): Promise<PublishedNoteShare | null> {
  const { data, error } = await supabase
    .from('note_shares')
    .select('*')
    .eq('note_id', noteId)
    .maybeSingle()

  if (error && !isNoRowsError(error)) {
    throw error
  }

  return data
}

export async function publishNoteShare(noteId: string, input: PublishNoteShareInput): Promise<PublishedNoteShare> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data, error } = await supabase
    .from('note_shares')
    .upsert(
      {
        note_id: noteId,
        user_id: user.id,
        title: input.title,
        content: input.content,
        note_type: input.note_type,
        metadata: input.metadata ?? null,
        published_at: new Date().toISOString(),
      },
      {
        onConflict: 'note_id',
      }
    )
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function unpublishNoteShare(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('note_shares')
    .delete()
    .eq('note_id', noteId)

  if (error) {
    throw error
  }
}

export async function getPublishedNoteShareByToken(shareToken: string): Promise<PublishedNoteShare | null> {
  const { data, error } = await supabase
    .from('note_shares')
    .select('*')
    .eq('share_token', shareToken)
    .maybeSingle()

  if (error && !isNoRowsError(error)) {
    throw error
  }

  return data
}