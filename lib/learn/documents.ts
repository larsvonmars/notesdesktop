import { supabase } from '@/lib/supabase'
import { mapDocument, requireUserId } from './db'
import { extractPdfText, type PdfContent } from './pdf-text'
import type { LearnDocument } from './types'

const BUCKET = 'learn-docs'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf']

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function uploadToStorage(
  userId: string,
  path: string,
  data: ArrayBuffer
): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, data, {
    contentType: 'application/pdf',
    upsert: false,
    cacheControl: '3600',
  })

  if (!error) return path
  if (
    error.message?.includes('already exists') ||
    error.message?.includes('Duplicate')
  ) {
    const retryPath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${path.split('/').pop()}`
    const { error: retryError } = await supabase.storage
      .from(BUCKET)
      .upload(retryPath, data, {
        contentType: 'application/pdf',
        upsert: false,
        cacheControl: '3600',
      })
    if (retryError) throw retryError
    return retryPath
  }

  throw error
}

/** Upload a PDF to the shared `learn-docs` bucket and track it. */
export async function uploadDocument(file: File): Promise<LearnDocument> {
  const userId = await requireUserId()

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(
      `Only PDF files are allowed. Received: ${file.type || 'unknown type'}`
    )
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large (${(file.size / (1024 * 1024)).toFixed(1)} MiB). Maximum is ${MAX_FILE_SIZE / (1024 * 1024)} MiB.`
    )
  }

  const buffer = await file.arrayBuffer()
  const storagePath = await uploadToStorage(
    userId,
    `${userId}/${Date.now()}-${safeFileName(file.name)}`,
    buffer
  )

  const { data, error } = await supabase
    .from('learn_documents')
    .insert({
      user_id: userId,
      filename: file.name,
      file_path: storagePath,
      file_size: file.size,
      status: 'uploaded',
    })
    .select()
    .single()

  if (error) throw error
  return mapDocument(data)
}

export async function getDocuments(): Promise<LearnDocument[]> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('learn_documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapDocument)
}

export async function deleteDocument(id: string): Promise<void> {
  const userId = await requireUserId()
  const { data: document, error: fetchError } = await supabase
    .from('learn_documents')
    .select('file_path')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (fetchError) throw fetchError

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([document.file_path])
  if (storageError) {
    // Keep going: an orphaned storage object is less harmful than a stuck row.
    console.warn(
      'Failed to delete learn document from storage:',
      storageError.message
    )
  }

  const { error } = await supabase
    .from('learn_documents')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function updateDocument(
  id: string,
  update: { status?: LearnDocument['status']; deckId?: string | null }
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (update.status !== undefined) payload.status = update.status
  if (update.deckId !== undefined) payload.deck_id = update.deckId
  if (Object.keys(payload).length === 0) return

  const { error } = await supabase
    .from('learn_documents')
    .update(payload)
    .eq('id', id)
  if (error) throw error
}

/** Short-lived signed URL for in-app PDF preview. */
export async function getDocumentUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 3600)
  if (error) throw error
  return data?.signedUrl ?? null
}

/** Download and extract text from a tracked document for AI processing. */
export async function getDocumentText(documentId: string): Promise<PdfContent> {
  const userId = await requireUserId()
  const { data: document, error: fetchError } = await supabase
    .from('learn_documents')
    .select('file_path')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()

  if (fetchError) throw fetchError

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(document.file_path)
  if (error || !data) {
    throw new Error(
      `Failed to download document: ${error?.message ?? 'Unknown error'}`
    )
  }

  await updateDocument(documentId, { status: 'processing' }).catch(() => {})
  try {
    const result = await extractPdfText(await data.arrayBuffer())
    await updateDocument(documentId, { status: 'processed' }).catch(() => {})
    return result
  } catch (error) {
    await updateDocument(documentId, { status: 'error' }).catch(() => {})
    throw error
  }
}
