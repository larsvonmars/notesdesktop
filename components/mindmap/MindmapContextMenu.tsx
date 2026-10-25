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

const menuItemClass = 'glass-row w-full gap-3 px-3 py-2 text-sm'

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
      className="floating-pop-in glass-strong absolute z-50 min-w-[180px] overflow-hidden rounded-2xl p-1 text-sm text-foreground"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={menuItemClass}
        onClick={onAddChild}
      >
        <Plus size={15} className="text-muted" />
        <span className="flex-1 text-left">Add child</span>
        <kbd className="kbd">+</kbd>
      </button>
      <button
        type="button"
        className={menuItemClass}
        onClick={onRename}
      >
        <Type size={15} className="text-muted" />
        <span className="flex-1 text-left">Rename</span>
        <kbd className="kbd">F2</kbd>
      </button>
      <button
        type="button"
        className={menuItemClass}
        onClick={onEditDetails}
      >
        <Info size={15} className="text-muted" />
        <span className="flex-1 text-left">Edit details</span>
        <kbd className="kbd">Enter</kbd>
      </button>
      <button
        type="button"
        className={menuItemClass}
        onClick={onStartConnection}
      >
        <Link2 size={15} className="text-muted" />
        <span className="flex-1 text-left">Start connection here</span>
      </button>
      {hasChildren && (
        <button
          type="button"
          className={menuItemClass}
          onClick={onToggleCollapse}
        >
          {node.collapsed
            ? <UnfoldVertical size={15} className="text-muted" />
            : <FoldVertical size={15} className="text-muted" />
          }
          <span className="flex-1 text-left">{node.collapsed ? 'Expand' : 'Collapse'}</span>
          <kbd className="kbd">Space</kbd>
        </button>
      )}
      <div className="glass-divider my-1" />
      <div className="px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Color</span>
        <div className="flex gap-1.5 mt-1.5">
          {DEFAULT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                node.color === color ? 'border-foreground scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              onClick={() => onSetColor(color)}
            />
          ))}
        </div>
      </div>
      {!isRoot && (
        <>
          <div className="glass-divider my-1" />
          <button
            type="button"
            className="glass-row w-full gap-3 px-3 py-2 text-sm text-danger hover:bg-[var(--danger-light)]"
            onClick={onDelete}
          >
            <Trash2 size={15} />
            <span className="flex-1 text-left">Delete</span>
            <kbd className="kbd text-danger">Del</kbd>
          </button>
        </>
      )}
    </div>
  )
}
