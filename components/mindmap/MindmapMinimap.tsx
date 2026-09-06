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
      <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 p-3 shadow-lg ">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 shadow-sm transition-colors"
          aria-label="Close minimap"
        >
          <X size={11} />
        </button>
        <canvas
          ref={canvasRef}
          onClick={onClick}
          className="block h-32 w-48 cursor-pointer rounded-lg bg-slate-900/30"
        />
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-600 dark:text-slate-300">Mini-map</span>
          <span className="flex-1 truncate text-right">
            {selectedText || 'No selection'}
          </span>
        </div>
      </div>
    </div>
  )
}
