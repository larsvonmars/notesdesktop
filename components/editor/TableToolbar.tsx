import { Minus, Plus, Trash2 } from 'lucide-react'

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
}

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
}: TableToolbarProps) {
  if (!isVisible) return null

  return (
    <div
      className="fixed z-50 flex items-center gap-2 rounded-md bg-white border px-2 py-1 shadow max-w-[92vw] overflow-auto"
      style={{ top, left }}
    >
      <div className="px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-700 font-medium">{dimensionsLabel}</div>
      <button onClick={onAddRow} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-100">
        <Plus size={14} /> Row
      </button>
      <button onClick={onDeleteRow} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-100">
        <Minus size={14} /> Row
      </button>
      <button onClick={onAddCol} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-100">
        <Plus size={14} /> Col
      </button>
      <button onClick={onDeleteCol} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-100">
        <Minus size={14} /> Col
      </button>
      <button onClick={onDeleteTable} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded text-red-600 hover:bg-red-50">
        <Trash2 size={14} /> Delete
      </button>
    </div>
  )
}
