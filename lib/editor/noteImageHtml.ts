/**
 * Pure HTML helpers for note image blocks. Kept outside NoteEditor so the
 * migration/reconciliation logic can be tested without the editor.
 */

const LEGACY_IMAGE_SRC_PATTERN = /src\s*=\s*["'](?:data:|file:\/\/)/i

export const sanitizeImageAltText = (value: string | null | undefined, fallback: string = 'Image') => {
  const sanitized = (value || '')
    .replace(/[<>"']/g, '')
    .trim()
  return sanitized || fallback
}

export const containsLegacyImageSources = (html: string): boolean => {
  if (!html) return false
  return LEGACY_IMAGE_SRC_PATTERN.test(html)
}

export const extractReferencedImageAttachments = (html: string): { attachmentIds: Set<string>; storagePaths: Set<string> } => {
  const attachmentIds = new Set<string>()
  const storagePaths = new Set<string>()

  if (!html) {
    return { attachmentIds, storagePaths }
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const imageBlocks = Array.from(doc.querySelectorAll('[data-block-type="image"]'))

  for (const block of imageBlocks) {
    const attachmentId = block.getAttribute('data-attachment-id')?.trim()
    if (attachmentId) {
      attachmentIds.add(attachmentId)
    }

    const storagePath = block.getAttribute('data-storage-path')?.trim()
    if (storagePath) {
      storagePaths.add(storagePath)
    }

    const encodedPayload = block.getAttribute('data-block-payload')
    if (!encodedPayload) continue

    try {
      const parsed = JSON.parse(decodeURIComponent(encodedPayload)) as { attachmentId?: string; storagePath?: string }
      if (parsed.attachmentId && typeof parsed.attachmentId === 'string') {
        attachmentIds.add(parsed.attachmentId)
      }
      if (parsed.storagePath && typeof parsed.storagePath === 'string') {
        storagePaths.add(parsed.storagePath)
      }
    } catch {
      // ignore malformed payloads
    }
  }

  return { attachmentIds, storagePaths }
}
