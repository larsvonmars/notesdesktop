/**
 * Note Link Custom Block
 * Allows users to create hyperlinks to other notes in the workspace
 */

import type { CustomBlockDescriptor } from '../../components/RichTextEditor'

export interface NoteLinkPayload {
  noteId: string
  noteTitle: string
  folderId?: string | null
}

/**
 * Custom block descriptor for note links
 */
export const noteLinkBlock: CustomBlockDescriptor = {
  type: 'note-link',
  
  render: (payload?: NoteLinkPayload) => {
    if (!payload || !payload.noteId) {
      return '<span class="inline-flex items-center gap-1 px-2 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 rounded border border-gray-300 dark:border-gray-600">📝 Invalid Note Link</span>'
    }

    const title = (payload.noteTitle || 'Untitled Note').replace(/"/g, '&quot;')
    const noteId = payload.noteId
    const folderId = payload.folderId || ''

    return `<span class="inline-flex items-center gap-1 px-2 py-1 text-sm bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 cursor-pointer transition-colors" data-block="true" data-block-type="note-link" data-note-id="${noteId}" data-note-title="${title}" data-folder-id="${folderId}">📝 <span class="font-medium">${title}</span></span>`
  },
  
  parse: (el: HTMLElement): NoteLinkPayload | undefined => {
    // Prefer data-block-payload (canonical), fall back to discrete attributes
    const payloadAttr = el.getAttribute('data-block-payload')
    if (payloadAttr) {
      try {
        const parsed = JSON.parse(decodeURIComponent(payloadAttr))
        if (parsed && parsed.noteId) return parsed as NoteLinkPayload
      } catch { /* fall through */ }
    }

    const noteId = el.getAttribute('data-note-id')
    const noteTitle = el.getAttribute('data-note-title')
    const folderId = el.getAttribute('data-folder-id')

    if (!noteId || !noteTitle) {
      return undefined
    }

    return {
      noteId,
      noteTitle,
      folderId: folderId || null
    }
  }
}

/**
 * Helper function to create note link HTML
 */
export function createNoteLinkHTML(noteId: string, noteTitle: string, folderId?: string | null): string {
  const payload: NoteLinkPayload = {
    noteId,
    noteTitle,
    folderId
  }
  
  return noteLinkBlock.render(payload)
}
