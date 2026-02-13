interface TableInsertDialogProps {
  isOpen: boolean
  tableRows: number
  tableCols: number
  hoverRows: number | null
  hoverCols: number | null
  onClose: () => void
  onHoverCell: (rows: number, cols: number) => void
  onHoverLeave: () => void
  onSelectSize: (rows: number, cols: number) => void
  onInsert: () => void
}

export default function TableInsertDialog({
  isOpen,
  tableRows,
  tableCols,
  hoverRows,
  hoverCols,
  onClose,
  onHoverCell,
  onHoverLeave,
  onSelectSize,
  onInsert,
}: TableInsertDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onMouseDown={onClose} />
      <div className="relative z-10 w-80 rounded bg-white p-4 shadow-lg">
        <h3 className="text-sm font-medium mb-2">Insert table</h3>
        <div className="mb-3">
          <div className="text-xs mb-2">Pick table size</div>
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: 36 }).map((_, idx) => {
              const r = Math.floor(idx / 6)
              const c = idx % 6
              const rowsSelected = hoverRows ?? tableRows
              const colsSelected = hoverCols ?? tableCols
              const isActive = rowsSelected > r && colsSelected > c
              return (
                <button
                  key={`cell-${r}-${c}`}
                  type="button"
                  onMouseEnter={() => onHoverCell(r + 1, c + 1)}
                  onMouseLeave={onHoverLeave}
                  onClick={() => onSelectSize(r + 1, c + 1)}
                  aria-label={`${r + 1} by ${c + 1}`}
                  className={`w-6 h-6 rounded-sm border ${isActive ? 'bg-alpine-500 border-alpine-500' : 'bg-white border-gray-200'} focus:outline-none`}
                />
              )
            })}
          </div>
          <div className="mt-2 text-xs text-gray-600">
            {(hoverRows ?? tableRows)} x {(hoverCols ?? tableCols)}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1 rounded border text-sm">
            Cancel
          </button>
          <button type="button" onClick={onInsert} className="px-3 py-1 rounded bg-alpine-600 text-white text-sm">
            Insert
          </button>
        </div>
      </div>
    </div>
  )
}
