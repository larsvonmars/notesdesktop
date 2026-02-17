/**
 * File Attachment Custom Block
 * Allows users to embed file attachments from Supabase storage into their notes.
 * Shows a styled card with file icon, name, size, and action buttons.
 */

import type { CustomBlockDescriptor } from '../../components/RichTextEditor'
import { formatFileSize, getFileIconHint, triggerDownload, getFileUrl } from '../file-storage'

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

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
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

    // Get file extension for badge
    const ext = payload.name.split('.').pop()?.toUpperCase() || ''

    return `<div class="file-block-container my-3 group relative" data-block="true" data-block-type="file" data-file-path="${path}" data-file-name="${name}" contenteditable="false">
      <div class="flex items-center gap-3 rounded-xl border border-gray-200 ${bgClass} px-4 py-3 transition-colors hover:border-gray-300 hover:shadow-sm">
        <!-- File icon -->
        <div class="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-gray-100 shadow-sm">
          ${iconSvg}
        </div>

        <!-- File info -->
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm text-gray-900 truncate">${name}</div>
          <div class="flex items-center gap-2 mt-0.5">
            ${ext ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-white border border-gray-200 text-gray-500">${escapeHtml(ext)}</span>` : ''}
            <span class="text-xs text-gray-400">${sizeStr}</span>
          </div>
        </div>

        <!-- Actions (show on hover) -->
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <!-- Download button -->
          <button type="button" class="file-block-download w-8 h-8 bg-white hover:bg-gray-100 text-gray-600 rounded-lg border border-gray-200 flex items-center justify-center transition-colors shadow-sm" aria-label="Download file" title="Download ${name}" contenteditable="false">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <!-- Preview button -->
          <button type="button" class="file-block-preview w-8 h-8 bg-white hover:bg-gray-100 text-gray-600 rounded-lg border border-gray-200 flex items-center justify-center transition-colors shadow-sm" aria-label="Preview file" title="Preview ${name}" contenteditable="false">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <!-- Delete button -->
          <button type="button" class="file-block-delete w-8 h-8 bg-white hover:bg-red-50 text-red-500 rounded-lg border border-gray-200 flex items-center justify-center transition-colors shadow-sm" aria-label="Remove file attachment" title="Remove from note" contenteditable="false">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    </div>`
  },

  parse: (el: HTMLElement): FileBlockPayload | undefined => {
    // First try to get from the data-block-payload attribute
    const payloadAttr = el.getAttribute('data-block-payload')
    if (payloadAttr) {
      try {
        return JSON.parse(decodeURIComponent(payloadAttr))
      } catch {
        // fall through to DOM parsing
      }
    }

    // Fallback: parse from DOM attributes
    const name = el.getAttribute('data-file-name') || ''
    const path = el.getAttribute('data-file-path') || ''
    if (!name || !path) return undefined

    // Try to extract size from the text content
    const sizeText = el.querySelector('.text-xs.text-gray-400')?.textContent || ''
    let size = 0
    const sizeMatch = sizeText.match(/([\d.]+)\s*(B|KB|MB|GB)/i)
    if (sizeMatch) {
      const val = parseFloat(sizeMatch[1])
      const unit = sizeMatch[2].toUpperCase()
      const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 }
      size = Math.round(val * (multipliers[unit] || 1))
    }

    // Try to extract type from the extension badge
    const extBadge = el.querySelector('.uppercase.tracking-wider')?.textContent?.trim() || ''
    const ext = extBadge.toLowerCase()
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
      txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
      doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      mp3: 'audio/mpeg', mp4: 'video/mp4', zip: 'application/zip',
    }
    const type = mimeMap[ext] || 'application/octet-stream'

    return { name, path, size, type }
  },
}

/* -------------------------------------------------------------------------- */
/*  Inline File Reference Block                                               */
/*  A compact inline chip (like note-link) that the user can click to open.   */
/* -------------------------------------------------------------------------- */

/**
 * Get a small emoji icon for inline display based on the file type hint.
 */
function getFileRefEmoji(mimeType: string): string {
  const hint = getFileIconHint(mimeType)
  switch (hint) {
    case 'image': return '🖼️'
    case 'pdf': return '📄'
    case 'spreadsheet': return '📊'
    case 'audio': return '🎵'
    case 'video': return '🎬'
    case 'archive': return '📦'
    case 'text': return '📝'
    default: return '📎'
  }
}

/**
 * Get accent colours for the inline chip based on file type.
 */
function getFileRefColors(mimeType: string): { bg: string; border: string; text: string } {
  const hint = getFileIconHint(mimeType)
  switch (hint) {
    case 'image': return { bg: 'bg-pink-50 hover:bg-pink-100', border: 'border-pink-200', text: 'text-pink-700' }
    case 'pdf': return { bg: 'bg-red-50 hover:bg-red-100', border: 'border-red-200', text: 'text-red-700' }
    case 'spreadsheet': return { bg: 'bg-green-50 hover:bg-green-100', border: 'border-green-200', text: 'text-green-700' }
    case 'audio': return { bg: 'bg-purple-50 hover:bg-purple-100', border: 'border-purple-200', text: 'text-purple-700' }
    case 'video': return { bg: 'bg-indigo-50 hover:bg-indigo-100', border: 'border-indigo-200', text: 'text-indigo-700' }
    case 'archive': return { bg: 'bg-yellow-50 hover:bg-yellow-100', border: 'border-yellow-200', text: 'text-yellow-700' }
    case 'text': return { bg: 'bg-blue-50 hover:bg-blue-100', border: 'border-blue-200', text: 'text-blue-700' }
    default: return { bg: 'bg-gray-50 hover:bg-gray-100', border: 'border-gray-200', text: 'text-gray-700' }
  }
}

/**
 * Custom block descriptor for an inline file reference.
 * Renders as a small chip similar to note-link that opens the file on click.
 */
export const fileRefBlock: CustomBlockDescriptor = {
  type: 'file-ref',

  render: (payload?: FileBlockPayload) => {
    if (!payload || !payload.name || !payload.path) {
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-gray-100 text-gray-400 rounded border border-gray-300">📎 Invalid file</span>'
    }

    const name = escapeHtml(payload.name)
    const path = escapeHtml(payload.path)
    const type = payload.type || 'application/octet-stream'
    const emoji = getFileRefEmoji(type)
    const { bg, border, text } = getFileRefColors(type)

    return `<span class="file-ref-chip inline-flex items-center gap-1 px-2 py-0.5 text-sm ${bg} ${text} rounded border ${border} cursor-pointer transition-colors" data-block="true" data-block-type="file-ref" data-file-path="${path}" data-file-name="${name}" contenteditable="false">${emoji} <span class="font-medium">${name}</span></span>`
  },

  parse: (el: HTMLElement): FileBlockPayload | undefined => {
    const payloadAttr = el.getAttribute('data-block-payload')
    if (payloadAttr) {
      try {
        return JSON.parse(decodeURIComponent(payloadAttr))
      } catch {
        // fall through
      }
    }

    const name = el.getAttribute('data-file-name') || ''
    const path = el.getAttribute('data-file-path') || ''
    if (!name || !path) return undefined

    // Infer type from extension
    const ext = name.split('.').pop()?.toLowerCase() || ''
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
      txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
      doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      mp3: 'audio/mpeg', mp4: 'video/mp4', zip: 'application/zip',
    }
    const type = mimeMap[ext] || 'application/octet-stream'

    return { name, path, size: 0, type }
  },
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

  // --- Download handler ---
  const handleDownload = async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const downloadBtn = target.closest('.file-block-download')
    if (!downloadBtn) return

    e.preventDefault()
    e.stopPropagation()

    const container = downloadBtn.closest('.file-block-container') as HTMLElement | null
    if (!container) return

    const filePath = container.getAttribute('data-file-path')
    if (!filePath) return

    try {
      // filePath is already relative to user root; triggerDownload prepends userId internally
      await triggerDownload(filePath)
    } catch (err) {
      console.error('[fileBlock] download failed:', err)
    }
  }

  // --- Preview handler (opens signed URL in a new tab/window) ---
  const handlePreview = async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const previewBtn = target.closest('.file-block-preview')
    if (!previewBtn) return

    e.preventDefault()
    e.stopPropagation()

    const container = previewBtn.closest('.file-block-container') as HTMLElement | null
    if (!container) return

    const filePath = container.getAttribute('data-file-path')
    if (!filePath) return

    try {
      // filePath is already relative to user root; getFileUrl prepends userId internally
      const url = await getFileUrl(filePath)
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      console.error('[fileBlock] preview failed:', err)
    }
  }

  // --- Delete handler (removes the block element from the note) ---
  const handleDelete = (e: Event) => {
    const target = e.target as HTMLElement
    const deleteBtn = target.closest('.file-block-delete')
    if (!deleteBtn) return

    e.preventDefault()
    e.stopPropagation()

    const container = deleteBtn.closest('.file-block-container') as HTMLElement | null
    if (!container) return

    const nextElement = container.nextElementSibling

    // Remove the block
    container.remove()

    // Ensure there's a paragraph after so the user can keep typing
    if (!nextElement) {
      const paragraph = document.createElement('p')
      paragraph.appendChild(document.createElement('br'))
      editorElement.appendChild(paragraph)
    }

    onContentChange()
  }

  // Attach delegated click listeners (capturing phase)
  editorElement.addEventListener('click', handleDownload, true)
  editorElement.addEventListener('click', handlePreview, true)
  editorElement.addEventListener('click', handleDelete, true)

  return () => {
    editorElement.removeEventListener('click', handleDownload, true)
    editorElement.removeEventListener('click', handlePreview, true)
    editorElement.removeEventListener('click', handleDelete, true)
  }
}
