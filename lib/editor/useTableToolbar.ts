import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

interface ToolbarPosition {
  top: number
  left: number
}

interface UseTableToolbarOptions {
  editorRef: RefObject<HTMLDivElement | null>
  onEmitChange: () => void
}

/**
 * Get the currently focused cell's row and column index within the table.
 * Returns null if the selection is not inside a table cell.
 */
function getActiveCellPosition(table: HTMLTableElement): { rowIndex: number; colIndex: number } | null {
  const selection = window.getSelection()
  if (!selection || !selection.anchorNode) return null

  const cell = (selection.anchorNode.nodeType === Node.TEXT_NODE
    ? selection.anchorNode.parentElement
    : selection.anchorNode as Element
  )?.closest('td, th')

  if (!cell || !table.contains(cell)) return null

  const row = cell.parentElement as HTMLTableRowElement | null
  if (!row) return null

  const rowIndex = Array.from(table.querySelectorAll('tr')).indexOf(row)
  const colIndex = Array.from(row.querySelectorAll('td, th')).indexOf(cell as HTMLTableCellElement)

  return { rowIndex, colIndex }
}

export function useTableToolbar({ editorRef, onEmitChange }: UseTableToolbarOptions) {
  const [tableToolbarVisible, setTableToolbarVisible] = useState(false)
  const [tableToolbarPos, setTableToolbarPos] = useState<ToolbarPosition>({ top: 0, left: 0 })
  const tableNodeRef = useRef<HTMLElement | null>(null)

  /**
   * Re-query the table DOM node to avoid operating on stale/detached references.
   */
  const getTable = useCallback((): HTMLTableElement | null => {
    const ref = tableNodeRef.current
    if (!ref || !ref.isConnected) {
      tableNodeRef.current = null
      return null
    }
    // If the ref is the block wrapper, find the table inside; otherwise use it directly
    const table = ref.tagName === 'TABLE' ? ref : ref.querySelector('table')
    return table as HTMLTableElement | null
  }, [])

  const findClosestTableBlock = useCallback(
    (el: Node | null) => {
      if (!el || !editorRef.current) return null

      let node: Node | null = el
      while (node && node !== editorRef.current) {
        if (node instanceof HTMLElement) {
          const isBlock = node.getAttribute('data-block') === 'true' || node.hasAttribute('data-block')
          const type = node.getAttribute('data-block-type')
          if (isBlock && type === 'table') return node

          const table = node.closest('table')
          if (table) return table as HTMLElement
        }
        node = node.parentNode
      }

      return null
    },
    [editorRef]
  )

  const hideTableToolbar = useCallback(() => {
    setTableToolbarVisible(false)
    tableNodeRef.current = null
  }, [])

  const showTableToolbarForNode = useCallback((node: HTMLElement | null) => {
    if (!node) {
      hideTableToolbar()
      return
    }

    tableNodeRef.current = node
    const rect = node.getBoundingClientRect()

    const TOOLBAR_HEIGHT = 40
    const MARGIN = 8

    let top = rect.top - TOOLBAR_HEIGHT - MARGIN
    if (top < MARGIN) {
      top = rect.bottom + MARGIN
    }

    let left = rect.left
    const toolbarWidthEstimate = 360
    const maxLeft = window.innerWidth - toolbarWidthEstimate - MARGIN
    if (left > maxLeft) left = Math.max(MARGIN, maxLeft)
    if (left < MARGIN) left = MARGIN

    setTableToolbarPos({ top, left })
    setTableToolbarVisible(true)
  }, [hideTableToolbar])

  const updateTablePayload = useCallback(() => {
    const table = getTable()
    if (!table) return

    let block: HTMLElement | null = table
    let p: HTMLElement | null = table

    while (p && p !== editorRef.current) {
      if (p.getAttribute && (p.getAttribute('data-block') === 'true' || p.hasAttribute('data-block'))) {
        block = p
        break
      }
      p = p.parentElement
    }

    const rows = table.querySelectorAll('tr').length
    const cols = table.querySelectorAll('tr')[0]?.querySelectorAll('td,th').length || 0

    try {
      block?.setAttribute('data-block-payload', encodeURIComponent(JSON.stringify({ rows, cols })))
    } catch {
      // ignore serialization issues
    }
  }, [editorRef, getTable])

  /**
   * Add a row. If the cursor is inside a cell, insert after that row;
   * otherwise append to the end.
   */
  const addTableRow = useCallback(() => {
    const table = getTable()
    if (!table) return

    const cols = table.querySelectorAll('tr')[0]?.querySelectorAll('td,th').length || 1
    const tr = document.createElement('tr')
    for (let i = 0; i < cols; i++) {
      const td = document.createElement('td')
      td.className = 'border px-2 py-1 align-top'
      td.innerHTML = '&nbsp;'
      tr.appendChild(td)
    }

    const pos = getActiveCellPosition(table)
    if (pos) {
      const rows = table.querySelectorAll('tr')
      const currentRow = rows[pos.rowIndex]
      if (currentRow && currentRow.nextSibling) {
        currentRow.parentNode?.insertBefore(tr, currentRow.nextSibling)
      } else {
        (currentRow?.parentNode || table).appendChild(tr)
      }
    } else {
      table.appendChild(tr)
    }

    updateTablePayload()
    onEmitChange()
  }, [onEmitChange, updateTablePayload, getTable])

  /**
   * Delete a row. If the cursor is inside a cell, delete that row;
   * otherwise delete the last row.
   */
  const deleteTableRow = useCallback(() => {
    const table = getTable()
    if (!table) return

    const rows = table.querySelectorAll('tr')
    if (rows.length <= 1) return

    const pos = getActiveCellPosition(table)
    if (pos) {
      rows[pos.rowIndex]?.remove()
    } else {
      rows[rows.length - 1].remove()
    }
    updateTablePayload()
    onEmitChange()
  }, [onEmitChange, updateTablePayload, getTable])

  /**
   * Add a column. If the cursor is inside a cell, insert after that column;
   * otherwise append to the end.
   */
  const addTableCol = useCallback(() => {
    const table = getTable()
    if (!table) return

    const pos = getActiveCellPosition(table)
    const rows = table.querySelectorAll('tr')
    rows.forEach((row) => {
      const td = document.createElement('td')
      td.className = 'border px-2 py-1 align-top'
      td.innerHTML = '&nbsp;'

      if (pos) {
        const cells = row.querySelectorAll('td,th')
        const refCell = cells[pos.colIndex]
        if (refCell && refCell.nextSibling) {
          row.insertBefore(td, refCell.nextSibling)
        } else {
          row.appendChild(td)
        }
      } else {
        row.appendChild(td)
      }
    })

    updateTablePayload()
    onEmitChange()
  }, [onEmitChange, updateTablePayload, getTable])

  /**
   * Delete a column. If the cursor is inside a cell, delete that column;
   * otherwise delete the last column.
   */
  const deleteTableCol = useCallback(() => {
    const table = getTable()
    if (!table) return

    const rows = table.querySelectorAll('tr')
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td,th')
      if (cells.length > 1) {
        const pos = getActiveCellPosition(table)
        if (pos && cells[pos.colIndex]) {
          cells[pos.colIndex].remove()
        } else {
          cells[cells.length - 1].remove()
        }
      }
    })

    updateTablePayload()
    onEmitChange()
  }, [onEmitChange, updateTablePayload, getTable])

  /**
   * Toggle header row: convert first row cells between <td> and <th>
   */
  const toggleHeaderRow = useCallback(() => {
    const table = getTable()
    if (!table) return

    const firstRow = table.querySelector('tr')
    if (!firstRow) return

    const cells = firstRow.querySelectorAll('td, th')
    const isCurrentlyHeader = cells[0]?.tagName === 'TH'

    cells.forEach((cell) => {
      const newCell = document.createElement(isCurrentlyHeader ? 'td' : 'th')
      newCell.className = cell.className
      newCell.innerHTML = cell.innerHTML
      if (!isCurrentlyHeader) {
        newCell.classList.add('font-semibold', 'bg-gray-50')
      }
      cell.replaceWith(newCell)
    })

    updateTablePayload()
    onEmitChange()
  }, [onEmitChange, updateTablePayload, getTable])

  const deleteTable = useCallback(() => {
    const ref = tableNodeRef.current
    if (!ref) return

    ref.remove()
    hideTableToolbar()
    onEmitChange()
  }, [hideTableToolbar, onEmitChange])

  const getTableDimensionsLabel = useCallback(() => {
    const table = getTable()
    if (!table) return '0 x 0'

    const rows = table.querySelectorAll('tr').length
    const cols = table.querySelectorAll('tr')[0]?.querySelectorAll('td,th').length || 0
    return `${rows} x ${cols}`
  }, [getTable])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      // Scope click listener to editor root to avoid reacting to every click in the app
      if (!editorRef.current?.contains(event.target as Node)) {
        if (tableToolbarVisible) hideTableToolbar()
        return
      }

      const target = event.target as HTMLElement | null
      const tableNode = findClosestTableBlock(target)
      if (tableNode) {
        showTableToolbarForNode(tableNode)
      } else {
        hideTableToolbar()
      }
    }

    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [editorRef, findClosestTableBlock, hideTableToolbar, showTableToolbarForNode, tableToolbarVisible])

  return {
    tableToolbarVisible,
    tableToolbarPos,
    addTableRow,
    deleteTableRow,
    addTableCol,
    deleteTableCol,
    deleteTable,
    toggleHeaderRow,
    getTableDimensionsLabel,
    hideTableToolbar,
  }
}
