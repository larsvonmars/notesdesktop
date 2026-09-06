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
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 bg-white dark:bg-slate-800 rounded-xl shadow-lg p-1.5 border border-gray-200 dark:border-slate-700">
      {!readOnly && (
        <>
          {/* Node actions */}
          <button
            onClick={onAddChild}
            disabled={!selectedNodeId}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Add child node"
            aria-label="Add child node"
          >
            <Plus size={18} />
          </button>
          <button
            onClick={onDelete}
            disabled={!selectedNodeId || selectedNodeId === mindmapData.rootId}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-red-500 dark:text-red-400"
            title="Delete selected node"
            aria-label="Delete node"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={onToggleCollapse}
            disabled={!selectedNodeId || (selectedNode?.children.length ?? 0) === 0}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Collapse / expand node (Space)"
            aria-label="Toggle collapse"
          >
            {selectedNode?.collapsed ? <Plus size={18} /> : <Minus size={18} />}
          </button>
          <button
            onClick={onToggleConnectionMode}
            className={`p-2 rounded-lg transition-colors ${
              connectionMode
                ? 'bg-alpine-50 text-alpine-600 dark:bg-alpine-900/30 dark:text-alpine-300'
                : 'hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
            title="Connect mode: click source node then target node"
            aria-label="Toggle connect mode"
          >
            <Link2 size={18} />
          </button>

          <div className="h-px bg-gray-200 dark:bg-slate-700 my-0.5" />
        </>
      )}

      {/* View controls */}
      <button
        onClick={onZoomIn}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        title="Zoom in"
        aria-label="Zoom in"
      >
        <ZoomIn size={18} />
      </button>
      <button
        onClick={onZoomOut}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        title="Zoom out"
        aria-label="Zoom out"
      >
        <ZoomOut size={18} />
      </button>
      <button
        onClick={onResetView}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        title="Reset view (1:1)"
        aria-label="Reset view"
      >
        <RotateCcw size={18} />
      </button>
      <button
        onClick={onFitToView}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        title="Fit all nodes in view"
        aria-label="Fit to view"
      >
        <Maximize2 size={18} />
      </button>
      <button
        onClick={onToggleCurvedEdges}
        className={`p-2 rounded-lg transition-colors ${
          useCurvedEdges
            ? 'bg-alpine-50 text-alpine-600 dark:bg-alpine-900/30 dark:text-alpine-300'
            : 'hover:bg-gray-100 dark:hover:bg-slate-700'
        }`}
        title="Toggle curved connections"
        aria-label="Toggle curved connections"
      >
        <ChevronRight size={18} className={useCurvedEdges ? 'rotate-90' : ''} />
      </button>

      {(canSearch || !readOnly) && <div className="h-px bg-gray-200 dark:bg-slate-700 my-0.5" />}

      {/* Search */}
      {canSearch && (
        <button
          onClick={onToggleSearch}
          className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${isSearchOpen ? 'bg-alpine-50 dark:bg-alpine-900/30 text-alpine-600' : ''}`}
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
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            title={`Auto-arrange nodes (${layoutDirection === 'lr' ? 'left-to-right' : 'radial'} layout)`}
            aria-label="Auto layout"
          >
            <LayoutTemplate size={18} />
          </button>
          <button
            onClick={onToggleLayoutMenu}
            className={`p-2 rounded-lg transition-colors ${isLayoutMenuOpen ? 'bg-alpine-50 text-alpine-600 dark:bg-alpine-900/30 dark:text-alpine-300' : 'hover:bg-gray-100 dark:hover:bg-slate-700'}`}
            title="Layout options"
            aria-label="Layout options"
          >
            <Settings2 size={18} />
          </button>
        </>
      )}

      {/* Export — always visible when toolbar is shown */}
      <>
        {!readOnly && <div className="h-px bg-gray-200 dark:bg-slate-700 my-0.5" />}
        <button
          onClick={onExport}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          title="Export mindmap as image"
          aria-label="Export image"
        >
          <Download size={18} />
        </button>
      </>

      {canToggleMinimap && (
        <button
          onClick={onToggleMinimap}
          className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${showMinimap ? 'text-alpine-600' : 'opacity-50'}`}
          title="Toggle minimap"
          aria-label="Toggle minimap"
        >
          <MapIcon size={18} />
        </button>
      )}
    </div>
  )
}
