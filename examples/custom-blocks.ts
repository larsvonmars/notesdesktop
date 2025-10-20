import { registerSlashCommand } from '../lib/editor/slashCommands'
import type { CustomBlockDescriptor } from '../components/RichTextEditor'

// Example callout descriptor
export const calloutBlock: CustomBlockDescriptor = {
  type: 'callout',
  render: (payload?: any) => {
    const text = (payload && payload.text) || 'Callout'
    return `<div class="p-3 border-l-4 border-blue-400 bg-blue-50 rounded">${text}</div>`
  },
  parse: (el: HTMLElement) => ({ text: el.textContent })
}

// Example table descriptor
export const tableBlock: CustomBlockDescriptor = {
  type: 'table',
  render: (payload?: any) => {
    const rows = (payload && payload.rows) || 3
    const cols = (payload && payload.cols) || 3
    let html = '<div class="overflow-auto my-2"><table class="min-w-full table-fixed border-collapse">'
    for (let r = 0; r < rows; r++) {
      html += '<tr>'
      for (let c = 0; c < cols; c++) {
        html += '<td class="border px-2 py-1 align-top">' + (r === 0 ? '<strong>Header</strong>' : '&nbsp;') + '</td>'
      }
      html += '</tr>'
    }
    html += '</table></div>'
    return html
  },
  parse: (el: HTMLElement) => {
    const table = el.querySelector('table')
    if (!table) return { rows: 0, cols: 0 }
    const rows = table.querySelectorAll('tr').length
    const firstRow = table.querySelector('tr')
    const cols = firstRow ? firstRow.querySelectorAll('td,th').length : 0
    return { rows, cols }
  }
}

// Helper to register both as slash commands (so they appear in the editor menu)
export function registerExampleBlocks() {
  registerSlashCommand({
    id: 'callout',
    label: 'Callout',
    icon: undefined as any,
    command: () => {},
    description: 'Insert a callout block',
    category: 'blocks',
    keywords: ['callout', 'note', 'highlight']
  })

  registerSlashCommand({
    id: 'table',
    label: 'Table',
    icon: undefined as any,
    command: () => {},
    description: 'Insert a table block',
    category: 'blocks',
    keywords: ['table', 'grid']
  })
}
