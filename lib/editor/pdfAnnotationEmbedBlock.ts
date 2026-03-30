/**
 * PDF Annotation Embed Custom Block
 * Renders an inline card in rich text notes that links to a dedicated
 * `pdf-annotation` note created from a file attachment.
 */

import type { CustomBlockDescriptor } from '../../components/RichTextEditor'

export interface PdfAnnotationEmbedPayload {
  noteId: string
  noteTitle: string
  sourcePath: string
  sourceName: string
  occurrenceIndex?: number
  createdAt?: string
}

function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  if (maxLength <= 5) return value.slice(0, maxLength)
  const lead = Math.ceil((maxLength - 1) / 2)
  const trail = Math.floor((maxLength - 1) / 2)
  return `${value.slice(0, lead)}…${value.slice(value.length - trail)}`
}

function parsePayloadFromElement(el: HTMLElement): PdfAnnotationEmbedPayload | undefined {
  const payloadAttr = el.getAttribute('data-block-payload')
  if (payloadAttr) {
    try {
      return JSON.parse(decodeURIComponent(payloadAttr)) as PdfAnnotationEmbedPayload
    } catch {
      // Fall back to attribute parsing below.
    }
  }

  const noteId = el.getAttribute('data-pdf-note-id') || ''
  const noteTitle = el.getAttribute('data-pdf-note-title') || ''
  const sourcePath = el.getAttribute('data-pdf-source-path') || ''
  const sourceName = el.getAttribute('data-pdf-source-name') || ''
  const occurrenceIndex = Number(el.getAttribute('data-pdf-source-occurrence') || '0')
  const createdAt = el.getAttribute('data-created-at') || undefined

  if (!noteId || !sourcePath || !sourceName) return undefined

  return {
    noteId,
    noteTitle: noteTitle || 'PDF Annotation',
    sourcePath,
    sourceName,
    occurrenceIndex: Number.isNaN(occurrenceIndex) ? 0 : occurrenceIndex,
    createdAt,
  }
}

export const pdfAnnotationEmbedBlock: CustomBlockDescriptor = {
  type: 'pdf-annotation-embed',

  render: (payload?: PdfAnnotationEmbedPayload) => {
    if (!payload?.noteId || !payload.sourcePath || !payload.sourceName) {
      return '<div class="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-400 rounded border border-gray-300">Invalid PDF annotation embed</div>'
    }

    const noteId = escapeHtml(payload.noteId)
    const noteTitle = escapeHtml(payload.noteTitle || 'PDF Annotation')
    const sourcePath = escapeHtml(payload.sourcePath)
    const sourceName = escapeHtml(payload.sourceName)
    const pathHint = escapeHtml(truncateMiddle(payload.sourcePath, 44))
    const occurrenceIndex = typeof payload.occurrenceIndex === 'number' ? payload.occurrenceIndex : 0
    const createdAt = payload.createdAt ? escapeHtml(payload.createdAt) : ''

    return `<div class="pdf-annotation-embed-block my-3" data-block="true" data-block-type="pdf-annotation-embed" data-pdf-note-id="${noteId}" data-pdf-note-title="${noteTitle}" data-pdf-source-path="${sourcePath}" data-pdf-source-name="${sourceName}" data-pdf-source-occurrence="${occurrenceIndex}" data-created-at="${createdAt}" contenteditable="false">
      <div class="overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/60 shadow-sm">
        <div class="flex items-start gap-3 px-3.5 py-3">
          <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-white text-indigo-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Embedded PDF Annotation</p>
            <p class="mt-0.5 truncate text-sm font-semibold text-indigo-900" title="${sourceName}">${sourceName}</p>
            <p class="mt-1 text-xs text-indigo-700/85">Linked note: <span class="font-semibold">${noteTitle}</span></p>
            <p class="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-indigo-100/80 px-2 py-1 text-[11px] text-indigo-700" title="${sourcePath}">
              <span class="font-medium">Path</span>
              <span class="truncate">${pathHint}</span>
            </p>
          </div>

          <button type="button" class="inline-flex flex-shrink-0 items-center rounded-md border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100" data-open-pdf-note-id="${noteId}" aria-label="Open PDF annotation note" title="Open PDF annotation" contenteditable="false">Open</button>
        </div>
      </div>
    </div>`
  },

  parse: (el: HTMLElement): PdfAnnotationEmbedPayload | undefined => parsePayloadFromElement(el),
}
