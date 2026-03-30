import type { CustomBlockDescriptor } from '../../components/RichTextEditor'

export interface PdfAnnotationEmbedPayload {
  noteId: string
  noteTitle: string
  sourcePath: string
  sourceName: string
  occurrenceIndex: number
  createdAt: string
}

function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

export const pdfAnnotationEmbedBlock: CustomBlockDescriptor = {
  type: 'pdf-annotation-embed',

  render: (payload?: PdfAnnotationEmbedPayload) => {
    if (!payload || !payload.noteId) {
      return '<div class="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-400 rounded border border-gray-300">⚠️ Invalid PDF Annotation Block</div>'
    }

    const { noteId, noteTitle, sourcePath, sourceName, occurrenceIndex } = payload
    const title = escapeHtml(noteTitle || 'PDF Annotation')
    const source = escapeHtml(sourceName || 'Document')
    const pathAttr = escapeHtml(sourcePath || '')
    const idAttr = escapeHtml(noteId)

    return `
      <div class="pdf-annotation-embed my-2 block select-none rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5 transition-colors hover:bg-indigo-50" data-block="true" data-block-type="pdf-annotation-embed" data-pdf-note-id="${idAttr}" data-pdf-source-path="${pathAttr}" data-pdf-occurrence-index="${occurrenceIndex ?? 0}" contenteditable="false">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-indigo-100 text-indigo-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </div>
            <div class="flex flex-col min-w-0">
              <span class="truncate text-xs font-semibold text-slate-800">${title}</span>
              <span class="truncate text-[10px] text-slate-500">Annotations for ${source}</span>
            </div>
          </div>
          
          <button type="button" class="inline-flex flex-shrink-0 items-center gap-1 rounded border border-indigo-200 bg-white px-2 py-1 text-[11px] font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 hover:text-indigo-800" data-open-pdf-note-id="${idAttr}" title="Open Annotation Note">
            <span>Open</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14"/>
              <path d="m12 5 7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>
    `
  },

  parse: (element: HTMLElement): PdfAnnotationEmbedPayload | undefined => {
    const noteId = element.getAttribute('data-pdf-note-id')
    if (!noteId) return undefined

    const noteTitle = element.querySelector('.text-slate-800')?.textContent || 'PDF Annotation'
    const sourcePath = element.getAttribute('data-pdf-source-path') || ''
    const idxAttr = element.getAttribute('data-pdf-occurrence-index')
    const occurrenceIndex = idxAttr ? parseInt(idxAttr, 10) : 0
    let sourceName = 'Document'
    
    const subText = element.querySelector('.text-slate-500')?.textContent
    if (subText && subText.startsWith('Annotations for ')) {
      sourceName = subText.substring('Annotations for '.length)
    }

    return {
      noteId,
      noteTitle,
      sourcePath,
      sourceName,
      occurrenceIndex,
      createdAt: '' // Not preserved in DOM, but not currently used either
    }
  }
}
