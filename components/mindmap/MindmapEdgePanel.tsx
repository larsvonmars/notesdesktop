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

export default function MindmapEdgePanel({
  edge,
  readOnly,
  onClose,
  onUpdateMeta,
  onResetStyle,
  onDelete,
}: MindmapEdgePanelProps) {
  return (
    <div className="absolute right-3 top-3 z-20 w-[320px] max-w-[calc(100%-1.5rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/95 shadow-xl ">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {edge.type === 'custom' ? 'Custom connection' : 'Parent connection'}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <span className="truncate max-w-[115px]">{edge.fromNode.text}</span>
            <ArrowRight size={14} className="text-slate-400" />
            <span className="truncate max-w-[115px]">{edge.toNode.text}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close connection panel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Title</label>
          {readOnly ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
              {edge.title.trim() || 'No title'}
            </div>
          ) : (
            <input
              type="text"
              value={edge.title}
              onChange={(event) => onUpdateMeta({ title: event.target.value.slice(0, 80) })}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
              placeholder="Relationship title"
            />
          )}
        </div>

        {readOnly ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 text-slate-700 dark:text-slate-200">
              <div className="text-slate-500 dark:text-slate-400">Line type</div>
              <div className="mt-0.5 font-medium capitalize">{edge.style.lineType}</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 text-slate-700 dark:text-slate-200">
              <div className="text-slate-500 dark:text-slate-400">Arrow</div>
              <div className="mt-0.5 font-medium capitalize">{edge.style.arrowType}</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 text-slate-700 dark:text-slate-200">
              <div className="text-slate-500 dark:text-slate-400">Width</div>
              <div className="mt-0.5 font-medium">{edge.style.width.toFixed(1)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 text-slate-700 dark:text-slate-200">
              <div className="text-slate-500 dark:text-slate-400">Opacity</div>
              <div className="mt-0.5 font-medium">{Math.round(edge.style.opacity * 100)}%</div>
            </div>
            <div className="col-span-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 text-slate-700 dark:text-slate-200">
              <div className="text-slate-500 dark:text-slate-400">Color</div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="inline-block h-4 w-4 rounded-full border border-slate-300 dark:border-slate-600"
                  style={{ backgroundColor: edge.style.color || '#64748b' }}
                />
                <span className="font-medium">{edge.style.color || 'Theme default'}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_COLORS.map((color) => {
                  const active = edge.style.color === color
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => onUpdateMeta({ style: { color } })}
                      className={`h-7 w-7 rounded-full border-2 ${active ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                      aria-label={`Set connection color ${color}`}
                    />
                  )
                })}
                <button
                  type="button"
                  onClick={() => onUpdateMeta({ style: { color: '' } })}
                  className="h-7 rounded-full border border-slate-300 dark:border-slate-600 px-2 text-xs text-slate-600 dark:text-slate-300"
                >
                  Theme
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Line type</span>
                <select
                  value={edge.style.lineType}
                  onChange={(event) =>
                    onUpdateMeta({ style: { lineType: event.target.value as MindmapLineType } })
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-sm text-slate-800 dark:text-slate-100"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Arrow</span>
                <select
                  value={edge.style.arrowType}
                  onChange={(event) =>
                    onUpdateMeta({ style: { arrowType: event.target.value as MindmapArrowType } })
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-sm text-slate-800 dark:text-slate-100"
                >
                  <option value="none">None</option>
                  <option value="standard">Open</option>
                  <option value="filled">Filled</option>
                </select>
              </label>
            </div>

            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Width: {edge.style.width.toFixed(1)}</span>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={0.5}
                  value={edge.style.width}
                  onChange={(event) => onUpdateMeta({ style: { width: Number(event.target.value) } })}
                  className="w-full"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Opacity: {Math.round(edge.style.opacity * 100)}%</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={edge.style.opacity}
                  onChange={(event) => onUpdateMeta({ style: { opacity: Number(event.target.value) } })}
                  className="w-full"
                />
              </label>
            </div>
          </>
        )}
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 px-4 py-3">
          <button
            type="button"
            onClick={onResetStyle}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Reset style
          </button>
          {edge.type === 'custom' && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
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
