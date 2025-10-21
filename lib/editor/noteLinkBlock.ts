/**
 * Note Link Custom Block
 * Allows users to create hyperlinks to other notes in the workspace
 */

import type { CustomBlockDescriptor } from '../../components/RichTextEditor'
import { registerSlashCommand } from './slashCommands'

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
      return '<span class="inline-flex items-center gap-1 px-2 py-1 text-sm bg-gray-100 text-gray-400 rounded border border-gray-300">📝 Invalid Note Link</span>'
    }

    const title = (payload.noteTitle || 'Untitled Note').replace(/"/g, '&quot;')
    const noteId = payload.noteId
    const folderId = payload.folderId || ''

    // Create a clickable note link with custom styling - using inline span with data-block attribute
    return `<span class="inline-flex items-center gap-1 px-2 py-1 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 cursor-pointer transition-colors" data-block="true" data-block-type="note-link" data-note-id="${noteId}" data-note-title="${title}" data-folder-id="${folderId}">📝 <span class="font-medium">${title}</span></span>`
  },
  
  parse: (el: HTMLElement): NoteLinkPayload | undefined => {
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
 * Register the note link slash command
 */
export function registerNoteLinkCommand(icon?: React.ReactNode): void {
  registerSlashCommand({
    id: 'note-link',
    label: 'Note Link',
    icon: icon || '📝',
    command: () => {}, // Will be handled by the editor component
    description: 'Link to another note',
    category: 'media',
    keywords: ['note', 'link', 'reference', 'internal', 'wiki']
  })
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
