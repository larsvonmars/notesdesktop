/**
 * File Attachment Custom Block
 * Unified file element used for both previous "file" and "file-ref" blocks.
 * Renders a compact in-editor card with open/download/remove actions.
 */

import type { CustomBlockDescriptor } from '../../components/RichTextEditor'
import { formatFileSize, getFileIconHint, triggerDownload, getFileUrl } from '../file-storage'

// Event and type for PDF annotation action
export const FILE_BLOCK_ANNOTATE_PDF_EVENT = 'file-block-annotate-pdf'
export const FILE_BLOCK_PREVIEW_PDF_EVENT = 'file-block-preview-pdf'

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

type FileAction = 'open' | 'download' | 'copy-path' | 'annotate-pdf' | 'remove'

/**
 * Escape HTML entities to prevent XSS
 */
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
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    mp3: 'audio/mpeg', mp4: 'video/mp4', zip: 'application/zip',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  if (maxLength <= 5) return value.slice(0, maxLength)
  const lead = Math.ceil((maxLength - 1) / 2)
  const trail = Math.floor((maxLength - 1) / 2)
  return `${value.slice(0, lead)}…${value.slice(value.length - trail)}`
}

function getFileExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.trim() || ''
  return ext ? ext.toUpperCase() : 'FILE'
}

function getFileKindLabel(mimeType: string): string {
  const hint = getFileIconHint(mimeType)
  switch (hint) {
    case 'image':
      return 'Image'
    case 'pdf':
      return 'PDF Document'
    case 'spreadsheet':
      return 'Spreadsheet'
    case 'presentation':
      return 'Presentation'
    case 'audio':
      return 'Audio'
    case 'video':
      return 'Video'
    case 'archive':
      return 'Archive'
    case 'text':
      return 'Text Document'
    default:
      return 'File'
  }
}

function formatAttachedAtLabel(value?: string): string {
  if (!value) return 'Added recently'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Added recently'

  const sameYear = date.getFullYear() === new Date().getFullYear()
  return `Added ${date.toLocaleDateString(undefined, {
    month: sameYear ? 'short' : 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })}`
}

function getPathHint(path: string): string {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 2) return path
  return `${parts[0]}/.../${parts[parts.length - 1]}`
}

function parsePayloadFromElement(el: HTMLElement): FileBlockPayload | undefined {
  const payloadAttr = el.getAttribute('data-block-payload')
  if (payloadAttr) {
    try {
      return JSON.parse(decodeURIComponent(payloadAttr))
    } catch {
    }
  }

  const name = el.getAttribute('data-file-name') || ''
  const path = el.getAttribute('data-file-path') || ''
  if (!name || !path) return undefined

  const sizeAttr = el.getAttribute('data-file-size')
  let size = sizeAttr ? Number(sizeAttr) : 0

  if (!size || Number.isNaN(size)) {
    const sizeText = el.querySelector('[data-file-size-label]')?.textContent || el.querySelector('.text-xs.text-gray-400')?.textContent || ''
    const sizeMatch = sizeText.match(/([\d.]+)\s*(B|KB|MB|GB)/i)
    if (sizeMatch) {
      const val = parseFloat(sizeMatch[1])
      const unit = sizeMatch[2].toUpperCase()
      const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 }
      size = Math.round(val * (multipliers[unit] || 1))
    } else {
      size = 0
    }
  }

  const typeAttr = el.getAttribute('data-file-type')
  const type = typeAttr || inferMimeTypeFromName(name)
  const attachedAt =
    el.getAttribute('data-file-attached-at') ||
    el.getAttribute('data-attached-at') ||
    undefined

  return { name, path, size, type, attached_at: attachedAt }
}

/**
 * Get an inline SVG icon string based on file type.
 */
function getFileIconSvg(mimeType: string): string {
  const hint = getFileIconHint(mimeType)
  const base = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'

  switch (hint) {
    case 'image':
      return `<svg ${base} class="text-pink-500">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>`
    case 'pdf':
      return `<svg ${base} class="text-red-500">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>`
    case 'spreadsheet':
      return `<svg ${base} class="text-green-600">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="8" y1="13" x2="16" y2="13"/>
        <line x1="8" y1="17" x2="16" y2="17"/>
        <line x1="12" y1="9" x2="12" y2="21"/>
      </svg>`
    case 'audio':
      return `<svg ${base} class="text-purple-500">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>`
    case 'video':
      return `<svg ${base} class="text-indigo-500">
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>`
    case 'archive':
      return `<svg ${base} class="text-yellow-600">
        <path d="M21 8v13H3V8"/>
        <path d="M1 3h22v5H1z"/>
        <path d="M10 12h4"/>
      </svg>`
    case 'text':
      return `<svg ${base} class="text-blue-500">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>`
    default:
      return `<svg ${base} class="text-gray-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>`
  }
}

/**
 * Get a background color class based on file type.
 */
function getFileBgClass(mimeType: string): string {
  const hint = getFileIconHint(mimeType)
  switch (hint) {
    case 'image': return 'bg-pink-50'
    case 'pdf': return 'bg-red-50'
    case 'spreadsheet': return 'bg-green-50'
    case 'audio': return 'bg-purple-50'
    case 'video': return 'bg-indigo-50'
    case 'archive': return 'bg-yellow-50'
    case 'text': return 'bg-blue-50'
    default: return 'bg-gray-50'
  }
}

function getFileAccentClass(mimeType: string): string {
  const hint = getFileIconHint(mimeType)
  switch (hint) {
    case 'image': return 'from-pink-400 to-rose-400'
    case 'pdf': return 'from-rose-500 to-red-500'
    case 'spreadsheet': return 'from-emerald-500 to-green-500'
    case 'audio': return 'from-violet-500 to-fuchsia-500'
    case 'video': return 'from-sky-500 to-blue-500'
    case 'archive': return 'from-amber-500 to-orange-500'
    case 'text': return 'from-cyan-500 to-teal-500'
    default: return 'from-slate-500 to-slate-400'
  }
}

/**
 * Custom block descriptor for file attachments.
 */
export const fileBlock: CustomBlockDescriptor = {
  type: 'file',

  render: (payload?: FileBlockPayload) => {
    if (!payload || !payload.name || !payload.path) {
      return '<div class="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-400 rounded border border-gray-300">📎 Invalid File Attachment</div>'
    }

    const name = escapeHtml(payload.name)
    const path = escapeHtml(payload.path)
    const type = payload.type || 'application/octet-stream'
    const size = payload.size || 0
    const sizeStr = escapeHtml(formatFileSize(size))
    const iconSvg = getFileIconSvg(type)
    const bgClass = getFileBgClass(type)
    const accentClass = getFileAccentClass(type)
    const escapedType = escapeHtml(type)

    const ext = getFileExtension(payload.name)
    const attachedAtIso = payload.attached_at ? escapeHtml(payload.attached_at) : ''

    const isPdf = type === 'application/pdf'
    const pdfButtonHtml = isPdf ? `
      <button type="button" class="file-block-action file-block-annotate-pdf inline-flex items-center justify-center p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700" data-file-action="annotate-pdf" aria-label="Annotate PDF" title="Create PDF annotation" contenteditable="false">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
        </svg>
      </button>
    ` : ''

    return `<div class="file-block-container my-1 inline-block select-none align-middle" data-block="true" data-block-type="file" data-file-path="${path}" data-file-name="${name}" data-file-size="${size}" data-file-type="${escapedType}" data-file-attached-at="${attachedAtIso}" contenteditable="false">
      <div class="file-block-card flex max-w-sm items-center gap-2 rounded-full border border-slate-200 bg-white pr-1 pl-1.5 py-1 shadow-sm transition-all hover:border-slate-300 hover:shadow" data-file-path="${path}" data-file-name="${name}" data-file-size="${size}" data-file-type="${escapedType}" data-file-attached-at="${attachedAtIso}">
        
        <button type="button" class="file-block-surface file-block-surface-button flex min-w-0 items-center gap-1.5 outline-none" aria-label="Open file" title="Open ${name}" contenteditable="false">
          <div class="file-block-icon-wrap flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 [&>svg]:h-3.5 [&>svg]:w-3.5 ${bgClass}">
            ${iconSvg}
          </div>
          <span class="truncate text-xs font-medium text-slate-700" title="${name}">${name}</span>
          <span class="flex-shrink-0 text-[10px] text-slate-400" data-file-size-label="true">${sizeStr}</span>
        </button>

        <div class="flex items-center flex-shrink-0 ml-1 border-l border-slate-100 pl-1">
          ${pdfButtonHtml}
          <button type="button" class="file-block-action file-block-download inline-flex items-center justify-center p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600" data-file-action="download" aria-label="Download file" title="Download ${name}" contenteditable="false">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          
          <button type="button" class="file-block-action file-block-delete inline-flex items-center justify-center p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500" data-file-action="remove" aria-label="Remove file attachment" title="Remove from note" contenteditable="false">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    </div>`
  },

  parse: (el: HTMLElement): FileBlockPayload | undefined => parsePayloadFromElement(el),
}

/**
 * Initialize click handlers for file block action buttons (download, preview, delete).
 * Attaches event delegation on the editor element similar to imageBlock interactions.
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
      const action = actionEl.getAttribute('data-file-action') as FileAction | null
      if (action) return action
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

  const handleFileBlockClick = async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target) return

    const container = getContainer(target)
    if (!container) return

    const action = getAction(target)
    const clickedSurface = !!target.closest('.file-block-surface')

    // Clicking the main surface opens the file by default.
    const effectiveAction: FileAction | null = action || (clickedSurface ? 'open' : null)
    if (!effectiveAction) return

    e.preventDefault()
    e.stopPropagation()

    if (effectiveAction === 'open') {
      const fileType = container.getAttribute('data-file-type')
      if (fileType === 'application/pdf') {
        const filePath = container.getAttribute('data-file-path')
        const fileName = container.getAttribute('data-file-name')
        if (filePath && fileName) {
          const event = new CustomEvent<FileBlockPreviewPdfEventDetail>(
            FILE_BLOCK_PREVIEW_PDF_EVENT,
            { detail: { filePath, fileName } }
          )
          window.dispatchEvent(event)
          return
        }
      }

      await openFileInNewTab(container)
      return
    }

    if (effectiveAction === 'download') {
      const filePath = container.getAttribute('data-file-path')
      if (!filePath) return
      try {
        await triggerDownload(filePath)
      } catch (err) {
        console.error('[fileBlock] download failed:', err)
      }
      return
    }

    if (effectiveAction === 'annotate-pdf') {
      const filePath = container.getAttribute('data-file-path')
      const fileName = container.getAttribute('data-file-name')
      const fileType = container.getAttribute('data-file-type') || 'application/pdf'
      
      if (!filePath || !fileName) return

      const allMatches = Array.from(document.querySelectorAll(`[data-block-type="file"][data-file-path="${filePath}"]`))
      const occurrenceIndex = allMatches.indexOf(container) >= 0 ? allMatches.indexOf(container) : 0

      const event = new CustomEvent<FileBlockAnnotatePdfEventDetail>(
        FILE_BLOCK_ANNOTATE_PDF_EVENT,
        {
          detail: { filePath, fileName, fileType, occurrenceIndex }
        }
      )
      window.dispatchEvent(event)
      return
    }

    if (effectiveAction === 'copy-path') {
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

    if (effectiveAction === 'remove') {
      const nextElement = container.nextElementSibling
      container.remove()

      if (!nextElement) {
        const paragraph = document.createElement('p')
        paragraph.appendChild(document.createElement('br'))
        editorElement.appendChild(paragraph)
      }

      onContentChange()
    }
  }

  editorElement.addEventListener('click', handleFileBlockClick, true)

  return () => {
    editorElement.removeEventListener('click', handleFileBlockClick, true)
  }
}
