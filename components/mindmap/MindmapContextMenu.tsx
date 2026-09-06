import { DEFAULT_COLORS, type MindmapNode } from '@/lib/mindmap'
import { FoldVertical, Info, Link2, Plus, Trash2, Type, UnfoldVertical } from 'lucide-react'

interface MindmapContextMenuProps {
  node: MindmapNode
  isRoot: boolean
  hasChildren: boolean
  x: number
  y: number
  onAddChild: () => void
  onRename: () => void
  onEditDetails: () => void
  onStartConnection: () => void
  onToggleCollapse: () => void
  onSetColor: (color: string) => void
  onDelete: () => void
}

export default function MindmapContextMenu({
  node,
  isRoot,
  hasChildren,
  x,
  y,
  onAddChild,
  onRename,
  onEditDetails,
  onStartConnection,
  onToggleCollapse,
  onSetColor,
  onDelete,
}: MindmapContextMenuProps) {
  return (
    <div
      className="absolute z-50 min-w-[180px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl py-1 text-sm text-slate-700 dark:text-slate-200 overflow-hidden"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        onClick={onAddChild}
      >
        <Plus size={15} className="text-slate-400" />
        <span className="flex-1 text-left">Add child</span>
        <kbd className="text-xs text-slate-400">+</kbd>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        onClick={onRename}
      >
        <Type size={15} className="text-slate-400" />
        <span className="flex-1 text-left">Rename</span>
        <kbd className="text-xs text-slate-400">F2</kbd>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        onClick={onEditDetails}
      >
        <Info size={15} className="text-slate-400" />
        <span className="flex-1 text-left">Edit details</span>
        <kbd className="text-xs text-slate-400">Enter</kbd>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        onClick={onStartConnection}
      >
        <Link2 size={15} className="text-slate-400" />
        <span className="flex-1 text-left">Start connection here</span>
      </button>
      {hasChildren && (
        <button
          type="button"
          className="flex w-full items-center gap-3 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          onClick={onToggleCollapse}
        >
          {node.collapsed
            ? <UnfoldVertical size={15} className="text-slate-400" />
            : <FoldVertical size={15} className="text-slate-400" />
          }
          <span className="flex-1 text-left">{node.collapsed ? 'Expand' : 'Collapse'}</span>
          <kbd className="text-xs text-slate-400">Space</kbd>
        </button>
      )}
      <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
      <div className="px-3 py-1.5">
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Color</span>
        <div className="flex gap-1.5 mt-1.5">
          {DEFAULT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                node.color === color ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              onClick={() => onSetColor(color)}
            />
          ))}
        </div>
      </div>
      {!isRoot && (
        <>
          <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
          <button
            type="button"
            className="flex w-full items-center gap-3 px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
            onClick={onDelete}
          >
            <Trash2 size={15} />
            <span className="flex-1 text-left">Delete</span>
            <kbd className="text-xs text-red-400">Del</kbd>
          </button>
        </>
      )}
    </div>
  )
}
