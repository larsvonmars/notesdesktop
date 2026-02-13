/**
 * Data Sheet Table Custom Block
 * Allows users to embed a snapshot of a data sheet as an HTML table in rich-text notes.
 */

import type { CustomBlockDescriptor } from '../../components/RichTextEditor'

export interface DataSheetTablePayload {
  /** The source note ID the table came from */
  sourceNoteId: string
  /** Title of the source data sheet note */
  sourceNoteTitle: string
  /** Column headers */
  columns: string[]
  /** Row data – each row is an array of cell display values */
  rows: string[][]
  /** Which row indices in the source sheet are header rows */
  headerRows?: number[]
  /** Timestamp when the snapshot was taken */
  snapshotAt: string
}

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Custom block descriptor for data sheet tables
 */
export const dataSheetTableBlock: CustomBlockDescriptor = {
  type: 'data-sheet-table',

  render: (payload?: DataSheetTablePayload) => {
    if (!payload || !payload.columns || !payload.rows) {
      return '<div class="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-400 rounded border border-gray-300">📊 Invalid Data Sheet Table</div>'
    }

    const title = escapeHtml(payload.sourceNoteTitle || 'Data Sheet')
    const snapshotDate = payload.snapshotAt
      ? new Date(payload.snapshotAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''
    const headerRowsSet = new Set(payload.headerRows ?? [])

    // Build the HTML table
    let html = ''
    html += `<div class="data-sheet-table-block my-4 rounded-lg border border-gray-200 overflow-hidden" data-block="true" data-block-type="data-sheet-table" contenteditable="false">`

    // Title bar
    html += `<div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">`
    html += `  <div class="flex items-center gap-2 text-sm font-medium text-gray-700">`
    html += `    <span>📊</span>`
    html += `    <span>${title}</span>`
    html += `  </div>`
    if (snapshotDate) {
      html += `  <span class="text-xs text-gray-400">Snapshot: ${escapeHtml(snapshotDate)}</span>`
    }
    html += `</div>`

    // Table
    html += `<div class="overflow-x-auto">`
    html += `<table class="min-w-full border-collapse text-sm">`

    // Column header row
    html += `<thead><tr class="bg-gray-50 border-b border-gray-200">`
    for (const col of payload.columns) {
      html += `<th class="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-100 last:border-r-0">${escapeHtml(col)}</th>`
    }
    html += `</tr></thead>`

    // Data rows
    html += `<tbody>`
    payload.rows.forEach((row, rowIdx) => {
      const isHeader = headerRowsSet.has(rowIdx)
      const rowBg = isHeader ? ' bg-blue-50 font-semibold' : (rowIdx % 2 === 0 ? ' bg-white' : ' bg-gray-50/50')
      html += `<tr class="border-b border-gray-100 last:border-b-0${rowBg}">`
      for (let ci = 0; ci < payload.columns.length; ci++) {
        const val = row[ci] ?? ''
        html += `<td class="px-3 py-1.5 text-gray-700 border-r border-gray-100 last:border-r-0 whitespace-nowrap">${escapeHtml(val)}</td>`
      }
      html += `</tr>`
    })
    html += `</tbody></table></div></div>`

    return html
  },

  parse: (el: HTMLElement): DataSheetTablePayload | undefined => {
    // Try to extract the payload from the data-block-payload attribute first
    const payloadAttr = el.getAttribute('data-block-payload')
    if (payloadAttr) {
      try {
        return JSON.parse(decodeURIComponent(payloadAttr))
      } catch {
        // fall through to DOM parsing
      }
    }

    // Fallback: parse from table DOM
    const table = el.querySelector('table')
    if (!table) return undefined

    const columns: string[] = []
    const headerCells = table.querySelectorAll('thead th')
    headerCells.forEach(th => columns.push(th.textContent || ''))

    const rows: string[][] = []
    const bodyRows = table.querySelectorAll('tbody tr')
    bodyRows.forEach(tr => {
      const cells: string[] = []
      tr.querySelectorAll('td').forEach(td => cells.push(td.textContent || ''))
      rows.push(cells)
    })

    // Extract title from the title bar
    const titleEl = el.querySelector('.data-sheet-table-block > div:first-child span:nth-child(2)')
    const sourceNoteTitle = titleEl?.textContent || 'Data Sheet'

    return {
      sourceNoteId: '',
      sourceNoteTitle,
      columns,
      rows,
      snapshotAt: new Date().toISOString(),
    }
  },
}
