import { X } from 'lucide-react'

interface MindmapInfoOverlayProps {
  scale: number
  selectedText: string | null
  isMobile: boolean
  onClose: () => void
}

export default function MindmapInfoOverlay({ scale, selectedText, isMobile, onClose }: MindmapInfoOverlayProps) {
  return (
    <div className="absolute bottom-4 right-4 bg-white dark:bg-slate-900/90  rounded-lg shadow-lg p-3 border border-gray-200 dark:border-slate-700 text-sm">
      <div className="text-gray-600 dark:text-slate-400">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-slate-700 dark:text-slate-200">Zoom: {Math.round(scale * 100)}%</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            aria-label="Close info panel"
          >
            <X size={13} />
          </button>
        </div>
        {selectedText && (
          <div className="mt-1 text-alpine-600 dark:text-alpine-400 font-medium truncate max-w-[160px]">
            {selectedText}
          </div>
        )}
        {!isMobile && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-500 space-y-0.5">
            <div>Drag canvas to pan · Scroll to zoom</div>
            <div>← Parent · → Child · ↑↓ Siblings · Tab: Cycle</div>
            <div>F2: Rename · Enter: Details · +: Add child</div>
            <div>Del: Delete · Space: Collapse · Home: Root · Link: Connect mode</div>
            <div>Curve toggle: toolbar arrow button</div>
          </div>
        )}
        {isMobile && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-500 space-y-0.5">
            <div>Tap: select · Long-press: edit</div>
            <div>2 fingers: pan & pinch zoom</div>
          </div>
        )}
      </div>
    </div>
  )
}
