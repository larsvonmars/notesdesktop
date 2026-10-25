import { X } from 'lucide-react'
import type { RefObject } from 'react'

interface MindmapMinimapProps {
  canvasRef: RefObject<HTMLCanvasElement>
  selectedText: string | null
  onClick: (event: React.MouseEvent<HTMLCanvasElement>) => void
  onClose: () => void
}

export default function MindmapMinimap({ canvasRef, selectedText, onClick, onClose }: MindmapMinimapProps) {
  return (
    <div className="absolute bottom-4 left-4 z-10">
      <div className="animate-rise-in glass-strong relative rounded-2xl p-3">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-solid text-muted shadow-glass-sm transition-colors hover:text-foreground"
          aria-label="Close minimap"
        >
          <X size={11} />
        </button>
        <canvas
          ref={canvasRef}
          onClick={onClick}
          className="block h-32 w-48 cursor-pointer rounded-lg border border-border bg-[var(--surface-sunken)]"
        />
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          <span className="font-medium text-foreground">Mini-map</span>
          <span className="flex-1 truncate text-right">
            {selectedText || 'No selection'}
          </span>
        </div>
      </div>
    </div>
  )
}
