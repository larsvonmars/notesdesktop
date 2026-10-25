import { Minus, Plus, Trash2, Type } from 'lucide-react'

interface TableToolbarProps {
  isVisible: boolean
  top: number
  left: number
  dimensionsLabel: string
  onAddRow: () => void
  onDeleteRow: () => void
  onAddCol: () => void
  onDeleteCol: () => void
  onDeleteTable: () => void
  onToggleHeaderRow?: () => void
  outlinesVisible?: boolean
  onToggleOutlines?: () => void
}

const ACTION_CLASS =
  'focus-ring inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover hover:text-foreground'

/**
 * Floating table actions. Purely presentational: the owner keeps the anchor
 * coordinates and every callback, this file only paints them — a glass-strong
 * pill that reads as part of the same floating family as the selection toolbar
 * and the slash menu.
 */
export default function TableToolbar({
  isVisible,
  top,
  left,
  dimensionsLabel,
  onAddRow,
  onDeleteRow,
  onAddCol,
  onDeleteCol,
  onDeleteTable,
  onToggleHeaderRow,
  outlinesVisible,
  onToggleOutlines,
}: TableToolbarProps) {
  if (!isVisible) return null

  return (
    <div
      className="floating-pop-in glass-strong fixed z-50 flex max-w-[92vw] items-center gap-1 overflow-auto rounded-full py-1 pl-1.5 pr-1.5"
      style={{ top, left }}
    >
      <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
        {dimensionsLabel}
      </span>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
      <button type="button" onClick={onAddRow} className={ACTION_CLASS}>
        <Plus size={13} /> Row
      </button>
      <button type="button" onClick={onDeleteRow} className={ACTION_CLASS}>
        <Minus size={13} /> Row
      </button>
      <button type="button" onClick={onAddCol} className={ACTION_CLASS}>
        <Plus size={13} /> Col
      </button>
      <button type="button" onClick={onDeleteCol} className={ACTION_CLASS}>
        <Minus size={13} /> Col
      </button>
      {onToggleHeaderRow && (
        <button type="button" onClick={onToggleHeaderRow} className={ACTION_CLASS}>
          <Type size={13} /> Header
        </button>
      )}
      <button
        type="button"
        onClick={onDeleteTable}
        className="focus-ring inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger-light"
      >
        <Trash2 size={13} /> Delete
      </button>
      <button type="button" onClick={onToggleOutlines} className={ACTION_CLASS}>
        {outlinesVisible ? 'Hide outlines' : 'Show outlines'}
      </button>
    </div>
  )
}
