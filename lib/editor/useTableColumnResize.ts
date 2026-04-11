'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'

/** Pixels from the right edge of a cell that trigger the resize cursor/drag. */
const RESIZE_HANDLE_WIDTH = 6
/** Minimum column width in pixels. */
const MIN_COL_WIDTH = 40

interface ResizeState {
  startX: number
  colIndex: number
  table: HTMLTableElement
  initialWidths: number[]
}

interface UseTableColumnResizeOptions {
  editorRef: RefObject<HTMLDivElement | null>
  onEmitChange: () => void
  disabled?: boolean
}

/**
 * Ensure a <colgroup> with one <col> per column exists in the table.
 * Returns the children of the colgroup.
 */
function ensureColGroup(table: HTMLTableElement): HTMLCollection {
  let colgroup = table.querySelector('colgroup')
  if (!colgroup) {
    colgroup = document.createElement('colgroup')
    const firstRow = table.querySelector('tr')
    const cellCount = firstRow ? firstRow.querySelectorAll('td, th').length : 0
    for (let i = 0; i < cellCount; i++) {
      colgroup.appendChild(document.createElement('col'))
    }
    table.insertBefore(colgroup, table.firstChild)
  }
  return colgroup.children
}

/**
 * Measure current column widths — prefer existing `width` attribute,
 * fall back to the cell's rendered offsetWidth.
 */
function measureWidths(table: HTMLTableElement, cols: HTMLCollection): number[] {
  const firstRow = table.querySelector('tr')
  const cells = firstRow ? Array.from(firstRow.querySelectorAll('td, th')) as HTMLElement[] : []
  const widths: number[] = []
  for (let i = 0; i < cols.length; i++) {
    const attrVal = parseInt((cols[i] as HTMLElement).getAttribute('width') || '', 10)
    widths.push(!isNaN(attrVal) && attrVal > 0 ? attrVal : (cells[i]?.offsetWidth ?? 100))
  }
  return widths
}

/**
 * Given a mousemove/mousedown event inside the editor, determine if the
 * pointer is within RESIZE_HANDLE_WIDTH px of the right border of a cell.
 * Returns the { colIndex, table } if so, otherwise null.
 */
function findResizeTarget(
  e: MouseEvent,
  editorEl: HTMLDivElement
): { colIndex: number; table: HTMLTableElement } | null {
  const target = e.target as HTMLElement
  const cell = target.closest('td, th') as HTMLTableCellElement | null
  if (!cell) return null

  const table = cell.closest('table') as HTMLTableElement | null
  if (!table || !editorEl.contains(table)) return null

  const rect = cell.getBoundingClientRect()
  if (e.clientX < rect.right - RESIZE_HANDLE_WIDTH) return null

  const row = cell.parentElement as HTMLTableRowElement
  const siblings = Array.from(row.querySelectorAll('td, th'))
  const colIndex = siblings.indexOf(cell)

  return { colIndex, table }
}

export function useTableColumnResize({
  editorRef,
  onEmitChange,
  disabled,
}: UseTableColumnResizeOptions): void {
  const resizeRef = useRef<ResizeState | null>(null)
  const isResizingRef = useRef(false)

  const startResize = useCallback(
    (e: MouseEvent, colIndex: number, table: HTMLTableElement) => {
      const cols = ensureColGroup(table)
      const initialWidths = measureWidths(table, cols)

      // Stamp current widths onto col elements so table-layout: fixed honours them
      for (let i = 0; i < cols.length; i++) {
        ;(cols[i] as HTMLElement).setAttribute('width', String(initialWidths[i]))
      }

      resizeRef.current = { startX: e.clientX, colIndex, table, initialWidths }
      isResizingRef.current = true

      // Suppress text-selection cursor globally during drag
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      ;(document.body.style as any).webkitUserSelect = 'none'

      const handleMove = (mv: MouseEvent) => {
        const state = resizeRef.current
        if (!state) return
        const delta = mv.clientX - state.startX
        const newWidth = Math.max(MIN_COL_WIDTH, state.initialWidths[state.colIndex] + delta)
        const liveCols = state.table.querySelector('colgroup')?.children
        if (liveCols?.[state.colIndex]) {
          ;(liveCols[state.colIndex] as HTMLElement).setAttribute('width', String(Math.round(newWidth)))
        }
      }

      const handleUp = () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        ;(document.body.style as any).webkitUserSelect = ''
        isResizingRef.current = false
        resizeRef.current = null
        document.removeEventListener('mousemove', handleMove)
        onEmitChange()
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp, { once: true })
    },
    [onEmitChange]
  )

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || disabled) return

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingRef.current) return
      const hit = findResizeTarget(e, editor)
      editor.style.cursor = hit ? 'col-resize' : ''
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (isResizingRef.current) return
      const hit = findResizeTarget(e, editor)
      if (!hit) return
      // Prevent browser text-selection drag from starting
      e.preventDefault()
      e.stopPropagation()
      startResize(e, hit.colIndex, hit.table)
    }

    editor.addEventListener('mousemove', handleMouseMove)
    // Use capture so we intercept before the editor's contenteditable logic
    editor.addEventListener('mousedown', handleMouseDown, true)

    return () => {
      editor.removeEventListener('mousemove', handleMouseMove)
      editor.removeEventListener('mousedown', handleMouseDown, true)
    }
  }, [editorRef, disabled, startResize])
}
