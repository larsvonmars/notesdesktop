import type { MindmapData, MindmapLayoutDirection } from '@/lib/mindmap'
import {
  ChevronRight,
  Download,
  LayoutTemplate,
  Link2,
  MapIcon,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

interface MindmapToolbarProps {
  readOnly: boolean
  selectedNodeId: string | null
  mindmapData: MindmapData
  connectionMode: boolean
  useCurvedEdges: boolean
  isSearchOpen: boolean
  isLayoutMenuOpen: boolean
  canSearch: boolean
  canToggleMinimap: boolean
  showMinimap: boolean
  layoutDirection: MindmapLayoutDirection
  onAddChild: () => void
  onDelete: () => void
  onToggleCollapse: () => void
  onToggleConnectionMode: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  onFitToView: () => void
  onToggleCurvedEdges: () => void
  onToggleSearch: () => void
  onAutoLayout: () => void
  onToggleLayoutMenu: () => void
  onExport: () => void
  onToggleMinimap: () => void
}

const toolButtonClass =
  'glass-btn-ghost h-9 w-9 disabled:cursor-not-allowed disabled:opacity-40'
const toolButtonActiveClass = 'bg-[var(--accent-light)] text-accent hover:bg-[var(--accent-light)] hover:text-accent'

export default function MindmapToolbar({
  readOnly,
  selectedNodeId,
  mindmapData,
  connectionMode,
  useCurvedEdges,
  isSearchOpen,
  isLayoutMenuOpen,
  canSearch,
  canToggleMinimap,
  showMinimap,
  layoutDirection,
  onAddChild,
  onDelete,
  onToggleCollapse,
  onToggleConnectionMode,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitToView,
  onToggleCurvedEdges,
  onToggleSearch,
  onAutoLayout,
  onToggleLayoutMenu,
  onExport,
  onToggleMinimap,
}: MindmapToolbarProps) {
  const selectedNode = selectedNodeId ? mindmapData.nodes[selectedNodeId] : null

  return (
    <div className="floating-pop-in glass-strong scroll-thin absolute top-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] flex-col gap-0.5 overflow-y-auto rounded-2xl p-1.5">
      {!readOnly && (
        <>
          {/* Node actions */}
          <button
            onClick={onAddChild}
            disabled={!selectedNodeId}
            className={toolButtonClass}
            title="Add child node"
            aria-label="Add child node"
          >
            <Plus size={18} />
          </button>
          <button
            onClick={onDelete}
            disabled={!selectedNodeId || selectedNodeId === mindmapData.rootId}
            className={`${toolButtonClass} text-danger hover:bg-[var(--danger-light)] hover:text-danger`}
            title="Delete selected node"
            aria-label="Delete node"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={onToggleCollapse}
            disabled={!selectedNodeId || (selectedNode?.children.length ?? 0) === 0}
            className={toolButtonClass}
            title="Collapse / expand node (Space)"
            aria-label="Toggle collapse"
          >
            {selectedNode?.collapsed ? <Plus size={18} /> : <Minus size={18} />}
          </button>
          <button
            onClick={onToggleConnectionMode}
            className={`${toolButtonClass} ${connectionMode ? toolButtonActiveClass : ''}`}
            title="Connect mode: click source node then target node"
            aria-label="Toggle connect mode"
          >
            <Link2 size={18} />
          </button>

          <div className="glass-divider my-0.5" />
        </>
      )}

      {/* View controls */}
      <button
        onClick={onZoomIn}
        className={toolButtonClass}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <ZoomIn size={18} />
      </button>
      <button
        onClick={onZoomOut}
        className={toolButtonClass}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <ZoomOut size={18} />
      </button>
      <button
        onClick={onResetView}
        className={toolButtonClass}
        title="Reset view (1:1)"
        aria-label="Reset view"
      >
        <RotateCcw size={18} />
      </button>
      <button
        onClick={onFitToView}
        className={toolButtonClass}
        title="Fit all nodes in view"
        aria-label="Fit to view"
      >
        <Maximize2 size={18} />
      </button>
      <button
        onClick={onToggleCurvedEdges}
        className={`${toolButtonClass} ${useCurvedEdges ? toolButtonActiveClass : ''}`}
        title="Toggle curved connections"
        aria-label="Toggle curved connections"
      >
        <ChevronRight size={18} className={useCurvedEdges ? 'rotate-90' : ''} />
      </button>

      {(canSearch || !readOnly) && <div className="glass-divider my-0.5" />}

      {/* Search */}
      {canSearch && (
        <button
          onClick={onToggleSearch}
          className={`${toolButtonClass} ${isSearchOpen ? toolButtonActiveClass : ''}`}
          title="Search nodes"
          aria-label="Search nodes"
        >
          <Search size={18} />
        </button>
      )}

      {!readOnly && (
        <>
          {/* Auto-layout */}
          <button
            onClick={onAutoLayout}
            className={toolButtonClass}
            title={`Auto-arrange nodes (${layoutDirection === 'lr' ? 'left-to-right' : 'radial'} layout)`}
            aria-label="Auto layout"
          >
            <LayoutTemplate size={18} />
          </button>
          <button
            onClick={onToggleLayoutMenu}
            className={`${toolButtonClass} ${isLayoutMenuOpen ? toolButtonActiveClass : ''}`}
            title="Layout options"
            aria-label="Layout options"
          >
            <Settings2 size={18} />
          </button>
        </>
      )}

      {/* Export — always visible when toolbar is shown */}
      <>
        {!readOnly && <div className="glass-divider my-0.5" />}
        <button
          onClick={onExport}
          className={toolButtonClass}
          title="Export mindmap as image"
          aria-label="Export image"
        >
          <Download size={18} />
        </button>
      </>

      {canToggleMinimap && (
        <button
          onClick={onToggleMinimap}
          className={`${toolButtonClass} ${showMinimap ? 'text-accent' : 'opacity-50'}`}
          title="Toggle minimap"
          aria-label="Toggle minimap"
        >
          <MapIcon size={18} />
        </button>
      )}
    </div>
  )
}
