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
    <div className="floating-pop-in glass-strong absolute top-3 left-16 z-20 w-64 max-w-[calc(100vw-5rem)] overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search size={14} className="text-muted shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Find node…"
          autoFocus
          className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted"
        />
        {query && (
          <button onClick={onClear} className="text-muted transition-colors hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>
      {results.length > 0 ? (
        <ul className="scroll-thin max-h-56 overflow-y-auto py-1">
          {results.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                className="glass-row gap-2 px-3 py-2 text-sm"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: node.color }}
                />
                <span className="truncate text-foreground">{node.text}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim() ? (
        <p className="px-3 py-3 text-xs text-muted text-center">No nodes match&nbsp;&quot;{query}&quot;</p>
      ) : (
        <p className="px-3 py-3 text-xs text-muted text-center">Type to search nodes</p>
      )}
    </div>
  )
}
