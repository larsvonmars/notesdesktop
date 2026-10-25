import { X } from 'lucide-react'

interface MindmapInfoOverlayProps {
  scale: number
  selectedText: string | null
  isMobile: boolean
  onClose: () => void
}

export default function MindmapInfoOverlay({ scale, selectedText, isMobile, onClose }: MindmapInfoOverlayProps) {
  return (
    <div className="animate-rise-in glass-strong absolute bottom-4 right-4 max-w-[min(280px,calc(100%-2rem))] rounded-2xl p-3 text-sm">
      <div className="text-muted">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-foreground">Zoom: {Math.round(scale * 100)}%</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="Close info panel"
          >
            <X size={13} />
          </button>
        </div>
        {selectedText && (
          <div className="mt-1 text-accent font-medium truncate max-w-[160px]">
            {selectedText}
          </div>
        )}
        {!isMobile && (
          <div className="mt-2 pt-2 border-t border-border text-xs text-muted space-y-0.5">
            <div>Drag canvas to pan · Scroll to zoom</div>
            <div>← Parent · → Child · ↑↓ Siblings · Tab: Cycle</div>
            <div>F2: Rename · Enter: Details · +: Add child</div>
            <div>Del: Delete · Space: Collapse · Home: Root · Link: Connect mode</div>
            <div>Curve toggle: toolbar arrow button</div>
          </div>
        )}
        {isMobile && (
          <div className="mt-2 pt-2 border-t border-border text-xs text-muted space-y-0.5">
            <div>Tap: select · Long-press: edit</div>
            <div>2 fingers: pan & pinch zoom</div>
          </div>
        )}
      </div>
    </div>
  )
}
