import type { MindmapNode } from '@/lib/mindmap'
import { Search, X } from 'lucide-react'

interface MindmapSearchDropdownProps {
  query: string
  results: MindmapNode[]
  onQueryChange: (value: string) => void
  onClear: () => void
  onSelect: (nodeId: string) => void
}

export default function MindmapSearchDropdown({
  query,
  results,
  onQueryChange,
  onClear,
  onSelect,
}: MindmapSearchDropdownProps) {
  return (
    <div className="absolute top-3 left-16 z-20 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-slate-700">
        <Search size={14} className="text-slate-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Find node…"
          autoFocus
          className="flex-1 text-sm bg-transparent outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
        />
        {query && (
          <button onClick={onClear} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X size={14} />
          </button>
        )}
      </div>
      {results.length > 0 ? (
        <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700">
          {results.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: node.color }}
                />
                <span className="truncate text-slate-700 dark:text-slate-200">{node.text}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim() ? (
        <p className="px-3 py-3 text-xs text-slate-400 text-center">No nodes match&nbsp;"{query}"</p>
      ) : (
        <p className="px-3 py-3 text-xs text-slate-400 text-center">Type to search nodes</p>
      )}
    </div>
  )
}
