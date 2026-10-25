import {
  DEFAULT_COLORS,
  type MindmapArrowType,
  type MindmapEdgeMeta,
  type MindmapEdgeStyle,
  type MindmapLineType,
  type MindmapNode,
} from '@/lib/mindmap'
import { ArrowRight, Trash2, X } from 'lucide-react'

export interface ResolvedMindmapEdge {
  type: 'custom' | 'parent'
  edgeId: string
  selectionId: string
  fromNode: MindmapNode
  toNode: MindmapNode
  title: string
  style: Required<MindmapEdgeStyle>
}

interface MindmapEdgePanelProps {
  edge: ResolvedMindmapEdge
  readOnly: boolean
  onClose: () => void
  onUpdateMeta: (updates: Partial<MindmapEdgeMeta>) => void
  onResetStyle: () => void
  onDelete: () => void
}

const fieldLabelClass =
  'text-[11px] font-medium uppercase tracking-[0.08em] text-muted'
const readOnlyValueClass =
  'rounded-xl border border-border bg-[var(--surface-sunken)] px-3 py-2 text-sm text-foreground'

export default function MindmapEdgePanel({
  edge,
  readOnly,
  onClose,
  onUpdateMeta,
  onResetStyle,
  onDelete,
}: MindmapEdgePanelProps) {
  return (
    <div className="floating-pop-in glass-strong absolute right-3 top-3 z-20 w-[320px] max-w-[calc(100%-1.5rem)] rounded-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className={fieldLabelClass}>
            {edge.type === 'custom' ? 'Custom connection' : 'Parent connection'}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span className="truncate max-w-[115px]">{edge.fromNode.text}</span>
            <ArrowRight size={14} className="text-muted" />
            <span className="truncate max-w-[115px]">{edge.toNode.text}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="Close connection panel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="space-y-1.5">
          <div className={fieldLabelClass}>Title</div>
          {readOnly ? (
            <div className={readOnlyValueClass}>
              {edge.title.trim() || 'No title'}
            </div>
          ) : (
            <input
              type="text"
              aria-label="Connection title"
              value={edge.title}
              onChange={(event) => onUpdateMeta({ title: event.target.value.slice(0, 80) })}
              className="glass-input px-3 text-sm"
              placeholder="Relationship title"
            />
          )}
        </div>

        {readOnly ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className={readOnlyValueClass}>
              <div className="text-muted">Line type</div>
              <div className="mt-0.5 font-medium capitalize">{edge.style.lineType}</div>
            </div>
            <div className={readOnlyValueClass}>
              <div className="text-muted">Arrow</div>
              <div className="mt-0.5 font-medium capitalize">{edge.style.arrowType}</div>
            </div>
            <div className={readOnlyValueClass}>
              <div className="text-muted">Width</div>
              <div className="mt-0.5 font-medium">{edge.style.width.toFixed(1)}</div>
            </div>
            <div className={readOnlyValueClass}>
              <div className="text-muted">Opacity</div>
              <div className="mt-0.5 font-medium">{Math.round(edge.style.opacity * 100)}%</div>
            </div>
            <div className={`col-span-2 ${readOnlyValueClass}`}>
              <div className="text-muted">Color</div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="inline-block h-4 w-4 rounded-full border border-border-strong"
                  style={{ backgroundColor: edge.style.color || '#64748b' }}
                />
                <span className="font-medium">{edge.style.color || 'Theme default'}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className={fieldLabelClass}>Color</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {DEFAULT_COLORS.map((color) => {
                  const active = edge.style.color === color
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => onUpdateMeta({ style: { color } })}
                      className={`h-7 w-7 rounded-full border-2 ${active ? 'border-foreground' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                      aria-label={`Set connection color ${color}`}
                    />
                  )
                })}
                <button
                  type="button"
                  onClick={() => onUpdateMeta({ style: { color: '' } })}
                  className="glass-btn h-7 rounded-full px-2 text-xs"
                >
                  Theme
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className={fieldLabelClass}>Line type</span>
                <select
                  value={edge.style.lineType}
                  onChange={(event) =>
                    onUpdateMeta({ style: { lineType: event.target.value as MindmapLineType } })
                  }
                  className="glass-input px-2.5 text-sm"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className={fieldLabelClass}>Arrow</span>
                <select
                  value={edge.style.arrowType}
                  onChange={(event) =>
                    onUpdateMeta({ style: { arrowType: event.target.value as MindmapArrowType } })
                  }
                  className="glass-input px-2.5 text-sm"
                >
                  <option value="none">None</option>
                  <option value="standard">Open</option>
                  <option value="filled">Filled</option>
                </select>
              </label>
            </div>

            <div className="space-y-3">
              <label className="block space-y-1">
                <span className={fieldLabelClass}>Width: {edge.style.width.toFixed(1)}</span>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={0.5}
                  value={edge.style.width}
                  onChange={(event) => onUpdateMeta({ style: { width: Number(event.target.value) } })}
                  className="w-full accent-[var(--accent)]"
                />
              </label>
              <label className="block space-y-1">
                <span className={fieldLabelClass}>Opacity: {Math.round(edge.style.opacity * 100)}%</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={edge.style.opacity}
                  onChange={(event) => onUpdateMeta({ style: { opacity: Number(event.target.value) } })}
                  className="w-full accent-[var(--accent)]"
                />
              </label>
            </div>
          </>
        )}
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onResetStyle}
            className="text-xs font-medium text-muted transition-colors hover:text-foreground"
          >
            Reset style
          </button>
          {edge.type === 'custom' && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-[var(--danger-light)] px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:border-[color:var(--danger)]"
            >
              <Trash2 size={13} />
              Delete connection
            </button>
          )}
        </div>
      )}
    </div>
  )
}
