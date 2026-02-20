/**
 * File Attachment Custom Block
 * Unified file element used for both previous "file" and "file-ref" blocks.
 * Renders a compact in-editor card with open/download/remove actions.
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

  return { name, path, size, type }
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
    const escapedType = escapeHtml(type)

    const ext = payload.name.split('.').pop()?.toUpperCase() || ''

    return `<div class="file-block-container my-3 group relative" data-block="true" data-block-type="file" data-file-path="${path}" data-file-name="${name}" contenteditable="false">
      <div class="flex items-center gap-3 rounded-xl border border-gray-200 ${bgClass} px-3.5 py-2.5 transition-colors hover:border-gray-300 hover:shadow-sm" data-file-path="${path}" data-file-name="${name}" data-file-size="${size}" data-file-type="${escapedType}">
        <div class="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-gray-100 shadow-sm text-gray-600">
          ${iconSvg}
        </div>

        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm text-gray-900 truncate" title="${name}">${name}</div>
          <div class="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
            ${ext ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-white border border-gray-200 text-gray-500">${escapeHtml(ext)}</span>` : ''}
            <span data-file-size-label="true">${sizeStr}</span>
            <span class="text-gray-300">•</span>
            <span>Click to open</span>
          </div>
        </div>

        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button type="button" class="file-block-preview w-8 h-8 bg-white hover:bg-gray-100 text-gray-600 rounded-lg border border-gray-200 flex items-center justify-center transition-colors shadow-sm" aria-label="Open file" title="Open ${name}" contenteditable="false">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button type="button" class="file-block-download w-8 h-8 bg-white hover:bg-gray-100 text-gray-600 rounded-lg border border-gray-200 flex items-center justify-center transition-colors shadow-sm" aria-label="Download file" title="Download ${name}" contenteditable="false">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
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

  const getContainer = (target: HTMLElement | null): HTMLElement | null => {
    if (!target) return null
    return target.closest('.file-block-container, [data-block-type="file-ref"]') as HTMLElement | null
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

  const handleDownload = async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const downloadBtn = target.closest('.file-block-download')
    if (!downloadBtn) return

    e.preventDefault()
    e.stopPropagation()

    const container = getContainer(downloadBtn)
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

  const handlePreview = async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const previewBtn = target.closest('.file-block-preview')
    if (!previewBtn) return

    e.preventDefault()
    e.stopPropagation()

    const container = getContainer(previewBtn)
    if (!container) return

    await openFileInNewTab(container)
  }

  const handleContainerOpen = async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('.file-block-download, .file-block-preview, .file-block-delete')) {
      return
    }

    const container = getContainer(target)
    if (!container) return

    e.preventDefault()
    e.stopPropagation()
    await openFileInNewTab(container)
  }

  const handleDelete = (e: Event) => {
    const target = e.target as HTMLElement
    const deleteBtn = target.closest('.file-block-delete')
    if (!deleteBtn) return

    e.preventDefault()
    e.stopPropagation()

    const container = getContainer(deleteBtn)
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

  editorElement.addEventListener('click', handleDownload, true)
  editorElement.addEventListener('click', handlePreview, true)
  editorElement.addEventListener('click', handleContainerOpen, true)
  editorElement.addEventListener('click', handleDelete, true)

  return () => {
    editorElement.removeEventListener('click', handleDownload, true)
    editorElement.removeEventListener('click', handlePreview, true)
    editorElement.removeEventListener('click', handleContainerOpen, true)
    editorElement.removeEventListener('click', handleDelete, true)
  }
}
