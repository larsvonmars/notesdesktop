/**
 * Data-sheet → table-block snapshots.
 *
 * A data sheet note stores its grid as JSON (`columns`, `rows`, `headerRows`).
 * Inserting it into a rich text note snapshots the *resolved* values, so the
 * table keeps showing numbers instead of formulas. Shared by the data sheet
 * picker dialog and the block inserter's inline step.
 */

import type { DataSheetData } from '../../components/DataSheetEditor'
import type { DataSheetTablePayload } from './dataSheetTableBlock'

/** Simple formula resolver for snapshots — evaluates formulas to display values. */
export function resolveCell(raw: string, rows: string[][], visited = new Set<string>()): string {
  if (!raw || !raw.startsWith('=')) return raw

  try {
    const expression = raw.slice(1).trim()
    // Very simple: resolve cell references and do basic math.
    const resolved = expression.replace(/([A-Z]+)(\d+)/gi, (_, letters: string, rowNumber: string) => {
      const columnIndex =
        letters
          .toUpperCase()
          .split('')
          .reduce((acc: number, char: string) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1
      const rowIndex = parseInt(rowNumber, 10) - 1
      const key = `${rowIndex},${columnIndex}`

      if (visited.has(key)) return '0'
      if (rowIndex < 0 || rowIndex >= rows.length) return '0'
      if (columnIndex < 0 || columnIndex >= (rows[0]?.length ?? 0)) return '0'

      const value = rows[rowIndex][columnIndex]
      if (value.startsWith('=')) {
        const next = new Set(visited)
        next.add(key)
        return resolveCell(value, rows, next)
      }
      return value || '0'
    })

    const num = Number(resolved)
    if (!isNaN(num)) return String(num)
    return raw // Cannot resolve — keep the formula visible.
  } catch {
    return raw
  }
}

/** Parse a `DataSheetData` blob into resolved display rows. */
export function resolveSheetData(sheetData: DataSheetData): {
  columns: string[]
  rows: string[][]
  headerRows?: number[]
} {
  const columns = sheetData.columns.map((column) => column.name)
  const resolvedRows = sheetData.rows.map((row) =>
    row.map((cell) => resolveCell(cell, sheetData.rows))
  )
  return { columns, rows: resolvedRows, headerRows: sheetData.headerRows }
}

export interface DataSheetSnapshotSource {
  id: string
  title?: string | null
  content?: string | null
}

/**
 * Build the table payload for a data sheet note, or null when the note does
 * not contain a parsable grid.
 */
export function buildDataSheetTablePayload(
  sheet: DataSheetSnapshotSource
): DataSheetTablePayload | null {
  let parsed: DataSheetData
  try {
    parsed = JSON.parse(sheet.content || '{}') as DataSheetData
  } catch {
    return null
  }

  if (!parsed?.columns || !parsed?.rows) return null

  const resolved = resolveSheetData(parsed)
  return {
    sourceNoteId: sheet.id,
    sourceNoteTitle: sheet.title || 'Data Sheet',
    columns: resolved.columns,
    rows: resolved.rows,
    headerRows: resolved.headerRows,
    snapshotAt: new Date().toISOString(),
  }
}
