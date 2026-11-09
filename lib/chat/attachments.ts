/**
 * Attachment handling for the Chat view.
 *
 * Images are inlined as data URLs for vision requests; PDFs and DOCX files are
 * converted to plain text in the renderer before the message is sent, so no
 * server round-trip or storage bucket is required.
 */

import type { ChatAttachment } from './types'

export const MAX_IMAGE_ATTACHMENTS = 4
export const MAX_DOCUMENT_ATTACHMENTS = 3
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
const MAX_EXTRACTED_CHARS = 40000

export type SupportedDocumentType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const SUPPORTED_DOCUMENT_TYPES: readonly string[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export function isSupportedDocument(mediaType: string): mediaType is SupportedDocumentType {
  return SUPPORTED_DOCUMENT_TYPES.includes(mediaType)
}

/** Resolve browser MIME-type gaps from the file extension. */
export function getDocumentMediaType(file: Pick<File, 'name' | 'type'>): SupportedDocumentType | null {
  if (isSupportedDocument(file.type)) return file.type

  const extension = file.name.toLowerCase().split('.').pop()
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  return null
}

export function createAttachmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

const MAX_VISION_DIMENSION = 1280
/** Base64 budget per image (~480 KB binary) so a few attachments stay small. */
const MAX_VISION_DATA_URL_CHARS = 650_000

async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not decode the image'))
    image.src = dataUrl
  })
}

/**
 * Downscale large photos before they are inlined for vision. Keeps the model
 * payload small and works whether the request goes through the proxy or the
 * desktop command.
 */
async function prepareVisionDataUrl(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file)
  if (original.length <= MAX_VISION_DATA_URL_CHARS) return original

  try {
    const image = await loadImageElement(original)
    const scale = Math.min(1, MAX_VISION_DIMENSION / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))

    const context = canvas.getContext('2d')
    if (!context) return original
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    for (const quality of [0.86, 0.75, 0.62, 0.5]) {
      const encoded = canvas.toDataURL('image/jpeg', quality)
      if (encoded.length <= MAX_VISION_DATA_URL_CHARS) return encoded
    }
    return canvas.toDataURL('image/jpeg', 0.45)
  } catch {
    // Some webviews cannot decode the format — fall back to the original bytes.
    return original
  }
}

async function extractPdfText(file: File): Promise<string> {
  const lib = await import('pdfjs-dist')
  const { getDocument, GlobalWorkerOptions } = lib
  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => {
        const textItem = item as { str?: string; hasEOL?: boolean }
        return `${textItem.str ?? ''}${textItem.hasEOL ? '\n' : ' '}`
      })
      .join('')
    pages.push(pageText.replace(/[ \t]+/g, ' ').trim())
    if (pages.join('\n').length > MAX_EXTRACTED_CHARS) break
  }

  return pages.join('\n\n')
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value ?? ''
}

async function extractDocumentText(file: File, mediaType: SupportedDocumentType): Promise<string> {
  const raw = mediaType === 'application/pdf' ? await extractPdfText(file) : await extractDocxText(file)
  return raw.replace(/\n{3,}/g, '\n\n').trim()
}

/** Build an image attachment (thumbnail + vision data URL). */
export async function readImageAttachment(file: File): Promise<ChatAttachment> {
  return {
    id: createAttachmentId(),
    kind: 'image',
    name: file.name || 'Image',
    mediaType: file.type || 'image/png',
    size: file.size,
    dataUrl: await prepareVisionDataUrl(file),
  }
}

/** Build a document attachment with its text pre-extracted. */
export async function readDocumentAttachment(file: File): Promise<ChatAttachment> {
  const mediaType = getDocumentMediaType(file)
  if (!mediaType) throw new Error('Unsupported document type')

  const text = await extractDocumentText(file, mediaType)
  const truncated = text.length > MAX_EXTRACTED_CHARS

  return {
    id: createAttachmentId(),
    kind: 'document',
    name: file.name,
    mediaType,
    size: file.size,
    text: truncated ? `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[... truncated]` : text,
    truncated,
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
