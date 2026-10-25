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

/**
 * Table size picker. Same props/hover behaviour as before — only the surface
 * language changed so it matches the table toolbar and the other editor
 * popovers (glass-strong, accent selection, pill buttons).
 */
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
      <div
        className="absolute inset-0 bg-[rgb(14_12_32_/_0.42)] backdrop-blur-[2px]"
        onMouseDown={onClose}
      />
      <div className="floating-pop-in glass-strong relative z-10 w-80 rounded-3xl p-4">
        <h3 className="mb-3 text-sm font-semibold tracking-[-0.01em] text-foreground">Insert table</h3>
        <div className="mb-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Pick table size
          </div>
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
                  className={`h-6 w-6 rounded-[5px] border transition-colors focus-ring ${
                    isActive
                      ? 'border-accent bg-accent-light'
                      : 'border-border bg-surface hover:bg-surface-hover'
                  }`}
                />
              )
            })}
          </div>
          <div className="mt-2 text-[11px] font-medium tabular-nums text-muted">
            {(hoverRows ?? tableRows)} x {(hoverCols ?? tableCols)}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="glass-btn focus-ring rounded-xl px-3.5 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onInsert}
            className="glass-btn-primary focus-ring rounded-xl px-3.5 text-xs font-semibold"
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  )
}
