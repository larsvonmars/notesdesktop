/**
 * File Attachment Custom Block
 * Unified file element used for both previous "file" and "file-ref" blocks.
 * Renders a compact in-editor card with open/download/remove actions.
 * Supports PDF preview, DOCX preview, and PDF annotation creation.
 */

import type { CustomBlockDescriptor } from '../../components/RichTextEditor'
import { formatFileSize, getFileIconHint, triggerDownload, getFileUrl } from '../file-storage'

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
export const FILE_BLOCK_ANNOTATE_PDF_EVENT = 'file-block-annotate-pdf'
export const FILE_BLOCK_PREVIEW_PDF_EVENT = 'file-block-preview-pdf'
export const FILE_BLOCK_PREVIEW_DOCX_EVENT = 'file-block-preview-docx'

export interface FileBlockAnnotatePdfEventDetail {
  filePath: string
  fileName: string
  fileType: string
  occurrenceIndex?: number
}

export interface FileBlockPreviewPdfEventDetail {
  filePath: string
  fileName: string
}

export interface FileBlockPreviewDocxEventDetail {
  filePath: string
  fileName: string
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------
export interface FileBlockPayload {
  /** File name */
  name: string
  /** Relative path within user storage (e.g. 'documents/report.pdf') */
  path: string
  /** File size in bytes */
  size: number
  /** MIME type */
  type: string
  /** When the file was attached */
  attached_at?: string
}

type FileAction = 'open' | 'preview-pdf' | 'preview-docx' | 'download' | 'copy-path' | 'annotate-pdf' | 'remove'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function inferMimeTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    mp3: 'audio/mpeg', mp4: 'video/mp4', zip: 'application/zip',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function isPdfType(type: string): boolean {
  return type === 'application/pdf'
}

function isDocxType(type: string, name?: string): boolean {
  return type === DOCX_MIME || (name?.toLowerCase().endsWith('.docx') ?? false)
}

// ---------------------------------------------------------------------------
// Payload parsing – the canonical payload lives in data-block-payload.
// Falls back to discrete data-* attributes for legacy blocks.
// ---------------------------------------------------------------------------
function parsePayloadFromElement(el: HTMLElement): FileBlockPayload | undefined {
  // 1. Prefer the canonical encoded attribute
  const payloadAttr = el.getAttribute('data-block-payload')
  if (payloadAttr) {
    try {
      const parsed = JSON.parse(decodeURIComponent(payloadAttr))
      if (parsed && parsed.name && parsed.path) return parsed as FileBlockPayload
    } catch { /* fall through */ }
  }

  // 2. Fall back to discrete data-* attributes
  const name = el.getAttribute('data-file-name') || ''
  const path = el.getAttribute('data-file-path') || ''
  if (!name || !path) return undefined

  const sizeAttr = el.getAttribute('data-file-size')
  let size = sizeAttr ? Number(sizeAttr) : 0
  if (!size || Number.isNaN(size)) size = 0

  const typeAttr = el.getAttribute('data-file-type')
  const type = typeAttr || inferMimeTypeFromName(name)
  const attachedAt =
    el.getAttribute('data-file-attached-at') ||
    el.getAttribute('data-attached-at') ||
    undefined

  return { name, path, size, type, attached_at: attachedAt }
}

// ---------------------------------------------------------------------------
// Icon SVG
// ---------------------------------------------------------------------------
function getFileIconSvg(mimeType: string): string {
  const hint = getFileIconHint(mimeType)
  const base = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'

  switch (hint) {
    case 'image':
      return `<svg ${base} class="text-pink-500 dark:text-pink-400">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>`
    case 'pdf':
      return `<svg ${base} class="text-red-500 dark:text-red-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>`
    case 'spreadsheet':
      return `<svg ${base} class="text-green-600 dark:text-green-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="8" y1="13" x2="16" y2="13"/>
        <line x1="8" y1="17" x2="16" y2="17"/>
        <line x1="12" y1="9" x2="12" y2="21"/>
      </svg>`
    case 'audio':
      return `<svg ${base} class="text-purple-500 dark:text-purple-400">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>`
    case 'video':
      return `<svg ${base} class="text-indigo-500 dark:text-indigo-400">
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>`
    case 'archive':
      return `<svg ${base} class="text-yellow-600 dark:text-yellow-400">
        <path d="M21 8v13H3V8"/>
        <path d="M1 3h22v5H1z"/>
        <path d="M10 12h4"/>
      </svg>`
    case 'text':
      return `<svg ${base} class="text-blue-500 dark:text-blue-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>`
    default:
      return `<svg ${base} class="text-gray-400 dark:text-gray-500">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>`
  }
}

function getFileBgClass(mimeType: string): string {
  const hint = getFileIconHint(mimeType)
  switch (hint) {
    case 'image': return 'bg-pink-50 dark:bg-pink-950/40'
    case 'pdf': return 'bg-red-50 dark:bg-red-950/40'
    case 'spreadsheet': return 'bg-green-50 dark:bg-green-950/40'
    case 'audio': return 'bg-purple-50 dark:bg-purple-950/40'
    case 'video': return 'bg-indigo-50 dark:bg-indigo-950/40'
    case 'archive': return 'bg-yellow-50 dark:bg-yellow-950/40'
    case 'text': return 'bg-blue-50 dark:bg-blue-950/40'
    default: return 'bg-gray-50 dark:bg-gray-800'
  }
}

// ---------------------------------------------------------------------------
// SVG icon constants for action buttons (kept small for compactness)
// ---------------------------------------------------------------------------
const ICON_14 = 'xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

const SVG_ANNOTATE = `<svg ${ICON_14}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`
const SVG_EYE = `<svg ${ICON_14}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
const SVG_DOWNLOAD = `<svg ${ICON_14}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
const SVG_REMOVE = `<svg ${ICON_14}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function renderFileBlock(payload: FileBlockPayload): string {
  const name = escapeHtml(payload.name)
  const path = escapeHtml(payload.path)
  const type = payload.type || 'application/octet-stream'
  const size = payload.size || 0
  const sizeStr = escapeHtml(formatFileSize(size))
  const iconSvg = getFileIconSvg(type)
  const bgClass = getFileBgClass(type)
  const escapedType = escapeHtml(type)
  const attachedAtIso = payload.attached_at ? escapeHtml(payload.attached_at) : ''

  // Build per-type action buttons
  const pdf = isPdfType(type)
  const docx = isDocxType(type, payload.name)

  let extraButtons = ''

  if (pdf) {
    // Preview (eye icon) + Annotate (pen icon)
    extraButtons += `
      <button type="button" class="file-block-action file-block-preview-pdf inline-flex items-center justify-center p-1.5 text-red-500 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-300 rounded" data-file-action="preview-pdf" aria-label="Preview PDF" title="Preview PDF" contenteditable="false">${SVG_EYE}</button>
      <button type="button" class="file-block-action file-block-annotate-pdf inline-flex items-center justify-center p-1.5 text-indigo-600 dark:text-indigo-400 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 rounded" data-file-action="annotate-pdf" aria-label="Annotate PDF" title="Create PDF annotation" contenteditable="false">${SVG_ANNOTATE}</button>`
  }

  if (docx) {
    // Preview (eye icon)
    extraButtons += `
      <button type="button" class="file-block-action file-block-preview-docx inline-flex items-center justify-center p-1.5 text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 rounded" data-file-action="preview-docx" aria-label="Preview Document" title="Preview Document" contenteditable="false">${SVG_EYE}</button>`
  }

  return `<div class="file-block-container my-1 inline-block select-none align-middle" data-block="true" data-block-type="file" data-file-path="${path}" data-file-name="${name}" data-file-size="${size}" data-file-type="${escapedType}" data-file-attached-at="${attachedAtIso}" contenteditable="false">
  <div class="file-block-card flex max-w-sm items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pr-1 pl-1.5 py-1 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-600 hover:shadow">

    <button type="button" class="file-block-surface file-block-surface-button flex min-w-0 items-center gap-1.5 outline-none" aria-label="Open file" title="Open ${name}" contenteditable="false">
      <div class="file-block-icon-wrap flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5 ${bgClass}">
        ${iconSvg}
      </div>
      <span class="truncate text-xs font-medium text-slate-700 dark:text-slate-200" title="${name}">${name}</span>
      <span class="flex-shrink-0 text-[10px] text-slate-400 dark:text-slate-500" data-file-size-label="true">${sizeStr}</span>
    </button>

    <div class="flex items-center flex-shrink-0 ml-1 border-l border-slate-100 dark:border-slate-700 pl-1">
      ${extraButtons}
      <button type="button" class="file-block-action file-block-download inline-flex items-center justify-center p-1.5 text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 rounded" data-file-action="download" aria-label="Download file" title="Download ${name}" contenteditable="false">${SVG_DOWNLOAD}</button>
      <button type="button" class="file-block-action file-block-delete inline-flex items-center justify-center p-1.5 text-slate-400 dark:text-slate-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400 rounded" data-file-action="remove" aria-label="Remove file attachment" title="Remove from note" contenteditable="false">${SVG_REMOVE}</button>
    </div>
  </div>
</div>`
}

// ---------------------------------------------------------------------------
// Custom block descriptor
// ---------------------------------------------------------------------------
export const fileBlock: CustomBlockDescriptor = {
  type: 'file',

  render: (payload?: FileBlockPayload) => {
    if (!payload || !payload.name || !payload.path) {
      return '<div class="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 rounded border border-gray-300 dark:border-gray-600">📎 Invalid File Attachment</div>'
    }
    return renderFileBlock(payload)
  },

  parse: (el: HTMLElement): FileBlockPayload | undefined => parsePayloadFromElement(el),
}

// ---------------------------------------------------------------------------
// Interaction handler
// ---------------------------------------------------------------------------

/**
 * Initialize click handlers for file block action buttons.
 * Attaches event delegation on the editor element.
 *
 * @param editorElement  The contenteditable div
 * @param onContentChange Callback to fire after a block is removed so the editor saves
 * @returns Cleanup function to remove listeners
 */
export function initializeFileBlockInteractions(
  editorElement: HTMLElement,
  onContentChange: () => void
): () => void {
  if (!editorElement) return () => {}

  // Migrate legacy "file-ref" blocks
  let hasMigratedLegacyRefs = false
  const legacyNodes = Array.from(editorElement.querySelectorAll('[data-block-type="file-ref"]')) as HTMLElement[]
  legacyNodes.forEach((node) => {
    const parsed = parsePayloadFromElement(node)
    if (!parsed) return
    const wrapper = document.createElement('div')
    wrapper.innerHTML = fileBlock.render(parsed)
    const replacement = wrapper.firstElementChild
    if (replacement) {
      node.replaceWith(replacement)
      hasMigratedLegacyRefs = true
    }
  })

  if (hasMigratedLegacyRefs) {
    onContentChange()
  }

  const getContainer = (target: Element | null): HTMLElement | null => {
    if (!target) return null
    return target.closest('.file-block-container, [data-block-type="file"], [data-block-type="file-ref"]') as HTMLElement | null
  }

  const getAction = (target: HTMLElement): FileAction | null => {
    const actionEl = target.closest('[data-file-action]') as HTMLElement | null
    if (actionEl) {
      return actionEl.getAttribute('data-file-action') as FileAction | null
    }
    if (target.closest('.file-block-preview')) return 'open'
    if (target.closest('.file-block-download')) return 'download'
    if (target.closest('.file-block-delete')) return 'remove'
    return null
  }

  const openFileInNewTab = async (container: HTMLElement) => {
    const filePath = container.getAttribute('data-file-path')
    if (!filePath) return
    try {
      const url = await getFileUrl(filePath)
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      console.error('[fileBlock] open failed:', err)
    }
  }

  const dispatchPdfPreview = (container: HTMLElement) => {
    const filePath = container.getAttribute('data-file-path')
    const fileName = container.getAttribute('data-file-name')
    if (!filePath || !fileName) return
    window.dispatchEvent(
      new CustomEvent<FileBlockPreviewPdfEventDetail>(FILE_BLOCK_PREVIEW_PDF_EVENT, {
        detail: { filePath, fileName },
      })
    )
  }

  const dispatchDocxPreview = (container: HTMLElement) => {
    const filePath = container.getAttribute('data-file-path')
    const fileName = container.getAttribute('data-file-name')
    if (!filePath || !fileName) return
    window.dispatchEvent(
      new CustomEvent<FileBlockPreviewDocxEventDetail>(FILE_BLOCK_PREVIEW_DOCX_EVENT, {
        detail: { filePath, fileName },
      })
    )
  }

  const dispatchPdfAnnotate = (container: HTMLElement) => {
    const filePath = container.getAttribute('data-file-path')
    const fileName = container.getAttribute('data-file-name')
    const fileType = container.getAttribute('data-file-type') || 'application/pdf'
    if (!filePath || !fileName) return

    const allMatches = Array.from(
      document.querySelectorAll(`[data-block-type="file"][data-file-path="${CSS.escape(filePath)}"]`)
    )
    const occurrenceIndex = Math.max(0, allMatches.indexOf(container))

    window.dispatchEvent(
      new CustomEvent<FileBlockAnnotatePdfEventDetail>(FILE_BLOCK_ANNOTATE_PDF_EVENT, {
        detail: { filePath, fileName, fileType, occurrenceIndex },
      })
    )
  }

  const handleFileBlockClick = async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target) return

    const container = getContainer(target)
    if (!container) return

    const action = getAction(target)
    const clickedSurface = !!target.closest('.file-block-surface')

    // Clicking the main surface opens the file using the best available viewer.
    const effectiveAction: FileAction | null = action || (clickedSurface ? 'open' : null)
    if (!effectiveAction) return

    e.preventDefault()
    e.stopPropagation()

    const fileType = container.getAttribute('data-file-type') || ''
    const fileName = container.getAttribute('data-file-name') || ''

    switch (effectiveAction) {
      case 'open': {
        // Route to the best viewer based on file type
        if (isPdfType(fileType)) {
          dispatchPdfPreview(container)
        } else if (isDocxType(fileType, fileName)) {
          dispatchDocxPreview(container)
        } else {
          await openFileInNewTab(container)
        }
        return
      }

      case 'preview-pdf': {
        dispatchPdfPreview(container)
        return
      }

      case 'preview-docx': {
        dispatchDocxPreview(container)
        return
      }

      case 'download': {
        const filePath = container.getAttribute('data-file-path')
        if (!filePath) return
        try {
          await triggerDownload(filePath)
        } catch (err) {
          console.error('[fileBlock] download failed:', err)
        }
        return
      }

      case 'annotate-pdf': {
        dispatchPdfAnnotate(container)
        return
      }

      case 'copy-path': {
        const filePath = container.getAttribute('data-file-path')
        if (!filePath) return
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(filePath)
          }
        } catch (err) {
          console.warn('[fileBlock] copy path failed:', err)
        }
        return
      }

      case 'remove': {
        const nextElement = container.nextElementSibling
        container.remove()

        if (!nextElement) {
          const paragraph = document.createElement('p')
          paragraph.appendChild(document.createElement('br'))
          editorElement.appendChild(paragraph)
        }

        onContentChange()
        return
      }
    }
  }

  editorElement.addEventListener('click', handleFileBlockClick, true)

  return () => {
    editorElement.removeEventListener('click', handleFileBlockClick, true)
  }
}
