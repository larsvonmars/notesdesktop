/**
 * Device-local reading position for the PDF annotation editor.
 *
 * Flipping to another page is view state, not a document edit: the note body
 * carries the whole annotated-PDF payload (potentially several megabytes), so
 * persisting the current page through the note would upload that payload to the
 * server on every page flip. The position is therefore cached locally, per
 * note, and never synced — desktop and phone each remember their own page.
 *
 * `PdfAnnotationData.currentPage` stays in the synced payload as a fallback for
 * notes that have no local entry yet (fresh device, shared link, first open) and
 * is refreshed whenever an annotation edit is saved.
 */

/** localStorage key prefix; the note id makes the entry per note and per device. */
const STORAGE_PREFIX = 'notesdesktop:pdf-page:'

export interface PdfViewState {
  /** Zero-based index into the editor's page list (inserted blank pages included). */
  page: number
}

export function pdfViewStateKey(noteId: string | null | undefined): string | null {
  if (!noteId) return null
  return `${STORAGE_PREFIX}${noteId}`
}

/**
 * Clamp a page index to a document's page list. Blank/invalid values fall back
 * to the first page; an empty document (pageCount 0) always yields 0.
 */
export function clampPdfPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page) || pageCount <= 0) return 0
  return Math.min(Math.max(Math.floor(page), 0), pageCount - 1)
}

/** The last page the user viewed for this note on this device, if cached. */
export function readPdfViewState(noteId: string | null | undefined): PdfViewState | null {
  const key = pdfViewStateKey(noteId)
  if (!key || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const page = (parsed as { page?: unknown }).page
    if (typeof page !== 'number' || !Number.isFinite(page)) return null
    return { page: Math.max(0, Math.floor(page)) }
  } catch {
    // Corrupt JSON or unavailable storage — fall back to the note payload.
    return null
  }
}

/** Remember the last viewed page locally (synchronous, never synced). */
export function writePdfViewState(noteId: string | null | undefined, page: number): void {
  const key = pdfViewStateKey(noteId)
  if (!key || typeof window === 'undefined') return
  if (typeof page !== 'number' || !Number.isFinite(page)) return
  try {
    window.localStorage.setItem(key, JSON.stringify({ page: Math.max(0, Math.floor(page)) }))
  } catch {
    // Quota reached / private mode: the position just won't survive a reload.
  }
}
