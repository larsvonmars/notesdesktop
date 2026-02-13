import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

interface ToolbarPosition {
  top: number
  left: number
}

interface UseTableToolbarOptions {
  editorRef: RefObject<HTMLDivElement | null>
  onEmitChange: () => void
}

export function useTableToolbar({ editorRef, onEmitChange }: UseTableToolbarOptions) {
  const [tableToolbarVisible, setTableToolbarVisible] = useState(false)
  const [tableToolbarPos, setTableToolbarPos] = useState<ToolbarPosition>({ top: 0, left: 0 })
  const tableNodeRef = useRef<HTMLElement | null>(null)

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
    const table = tableNodeRef.current as HTMLTableElement | null
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
      block.setAttribute('data-block-payload', encodeURIComponent(JSON.stringify({ rows, cols })))
    } catch {
      // ignore serialization issues
    }
  }, [editorRef])

  const addTableRow = useCallback(() => {
    const table = tableNodeRef.current as HTMLTableElement | null
    if (!table) return

    const cols = table.querySelectorAll('tr')[0]?.querySelectorAll('td,th').length || 1
    const tr = document.createElement('tr')
    for (let i = 0; i < cols; i++) {
      const td = document.createElement('td')
      td.className = 'border px-2 py-1 align-top'
      td.innerHTML = '&nbsp;'
      tr.appendChild(td)
    }

    table.appendChild(tr)
    updateTablePayload()
    onEmitChange()
  }, [onEmitChange, updateTablePayload])

  const deleteTableRow = useCallback(() => {
    const table = tableNodeRef.current as HTMLTableElement | null
    if (!table) return

    const rows = table.querySelectorAll('tr')
    if (rows.length <= 1) return

    rows[rows.length - 1].remove()
    updateTablePayload()
    onEmitChange()
  }, [onEmitChange, updateTablePayload])

  const addTableCol = useCallback(() => {
    const table = tableNodeRef.current as HTMLTableElement | null
    if (!table) return

    const rows = table.querySelectorAll('tr')
    rows.forEach((row) => {
      const td = document.createElement('td')
      td.className = 'border px-2 py-1 align-top'
      td.innerHTML = '&nbsp;'
      row.appendChild(td)
    })

    updateTablePayload()
    onEmitChange()
  }, [onEmitChange, updateTablePayload])

  const deleteTableCol = useCallback(() => {
    const table = tableNodeRef.current as HTMLTableElement | null
    if (!table) return

    const rows = table.querySelectorAll('tr')
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td,th')
      if (cells.length > 1) {
        cells[cells.length - 1].remove()
      }
    })

    updateTablePayload()
    onEmitChange()
  }, [onEmitChange, updateTablePayload])

  const deleteTable = useCallback(() => {
    const table = tableNodeRef.current as HTMLElement | null
    if (!table) return

    table.remove()
    hideTableToolbar()
    onEmitChange()
  }, [hideTableToolbar, onEmitChange])

  const getTableDimensionsLabel = useCallback(() => {
    const table = tableNodeRef.current as HTMLTableElement | null
    if (!table) return '0 x 0'

    const rows = table.querySelectorAll('tr').length
    const cols = table.querySelectorAll('tr')[0]?.querySelectorAll('td,th').length || 0
    return `${rows} x ${cols}`
  }, [])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
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
  }, [findClosestTableBlock, hideTableToolbar, showTableToolbarForNode])

  return {
    tableToolbarVisible,
    tableToolbarPos,
    addTableRow,
    deleteTableRow,
    addTableCol,
    deleteTableCol,
    deleteTable,
    getTableDimensionsLabel,
    hideTableToolbar,
  }
}
