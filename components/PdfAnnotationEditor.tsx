'use client'

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ChangeEvent,
} from 'react'
import {
  TEXT_HIT_SLOP_TOUCH_PX,
  TEXT_LINE_HEIGHT,
  TEXT_MIN_BOX_WIDTH,
  findItemIndexAtOffset,
  measureTextAnnotationBox,
  normalizeForSearch,
  textAnnotationContains,
  textLineDrawX,
  wrapTextAnnotationLines,
} from '@/lib/editor/pdf-text-layout'
import { renderStrokeToCtx } from '@/lib/editor/pdf-stroke'
import {
  buildSearchIndexEntry,
  findSearchMatches,
  type SearchIndexPage,
  type SearchMatch,
} from '@/lib/editor/pdf-search'
import {
  Upload,
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronLeft,
  ChevronRight,
  Pen,
  Pencil,
  Copy,
  Highlighter,
  Eraser,
  Type,
  Square,
  Circle,
  ArrowUpRight,
  AlignLeft,
  AlignCenter,
  AlignRight,
  MousePointer2,
  Undo2,
  Redo2,
  Download,
  Loader2,
  Trash2,
  Plus,
  StickyNote as StickyNoteIcon,
  Bold,
  Italic,
  PanelLeft,
  RotateCw,
  RotateCcw,
  Minus,
  Search,
  X,
  Layers,
  TextCursor,
  ChevronUp,
  ChevronDown,
  FolderOpen,
  Hand,
  Check,
  GripHorizontal,
  List,
} from 'lucide-react'
import FileExplorerModal from '@/components/FileExplorerModal'
import { uploadFile, getFileSignedUrl, downloadFile } from '@/lib/file-storage'
import { useToast } from '@/components/ToastProvider'
import { useIsCompact, useTouchMode } from '@/lib/useIsMobile'
import {
  computeAnchoredScroll,
  hitSlop,
  isDoubleTap,
  isPalmTouch,
  normalizePressure,
  pinchDistance,
  pinchMidpoint,
  pinchZoom,
  toPointerKind,
  type PointerKind,
  type TapRecord,
} from '@/lib/editor/pdf-touch'

const PDF_ANNOTATION_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

// ============================================================================
// TYPES
// ============================================================================

type PdfTool = 'select' | 'pan' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'rectangle' | 'circle' | 'arrow' | 'line' | 'sticky' | 'textselect'
type StickyColor = 'yellow' | 'blue' | 'green' | 'pink'

export interface PdfPoint {
  x: number
  y: number
  pressure?: number
}

export interface PdfStroke {
  id: string
  points: PdfPoint[]
  color: string
  size: number
  tool: 'pen' | 'highlighter'
}

export interface TextAnnotation {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  fontSize: number
  color: string
  bold?: boolean
  italic?: boolean
  fontFamily?: string
  /** Horizontal alignment of the wrapped lines (default 'left'). */
  textAlign?: 'left' | 'center' | 'right'
}

export interface ShapeAnnotation {
  id: string
  type: 'rectangle' | 'circle' | 'arrow' | 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  strokeWidth: number
  filled?: boolean
  fillOpacity?: number
  doubleEnded?: boolean
}

export interface StickyNoteAnnotation {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  color: StickyColor
  collapsed: boolean
  createdAt: number
}

export interface PdfAnnotationPage {
  pageNumber: number
  /** 1-based PDF page number; undefined for blank (inserted) pages */
  pdfPageNumber?: number
  /** True for user-inserted blank pages with no backing PDF page */
  isBlank?: boolean
  strokes: PdfStroke[]
  textAnnotations: TextAnnotation[]
  shapes: ShapeAnnotation[]
  stickyNotes?: StickyNoteAnnotation[]
}

export interface PdfAnnotationData {
  pdfStoragePath: string
  pages: PdfAnnotationPage[]
  currentPage: number
  totalPages: number
  zoom: number
}

export interface PdfAnnotationEditorHandle {
  focus: () => void
  getData: () => PdfAnnotationData | null
  setData: (data: PdfAnnotationData) => void
}

interface PdfAnnotationEditorProps {
  value: PdfAnnotationData | null
  onChange: (data: PdfAnnotationData) => void
  disabled?: boolean
  noteId?: string | null
  /** Called once after a PDF loads with the full extracted plain text (all pages). */
  onTextExtracted?: (text: string) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff']
const STICKY_COLORS: Record<StickyColor, string> = {
  yellow: '#fef08a',
  blue: '#bfdbfe',
  green: '#bbf7d0',
  pink: '#fbcfe8',
}
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.1
const DEFAULT_FONT_SIZE = 16

// ── Touch gesture tuning ────────────────────────────────────────────────────
/** Ignore accidental micro-movements below this distance (px) while stroke capturing. */
const TOUCH_MOVE_DEADZONE_PX = 1.5
/** Eraser brush radius in CSS px — wide enough to catch a fingertip. */
const ERASER_RADIUS_TOUCH_PX = 22
const ERASER_RADIUS_MOUSE_PX = 12

/**
 * Short haptic tick on interaction confirmations. Silently ignored on devices
 * without vibration support (desktop, iOS WebViews).
 */
function haptic(ms = 8): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported — never fail an interaction because of haptics */
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** Live accent colour for on-canvas selection chrome (falls back to glass violet). */
function accentColor(): string {
  if (typeof window === 'undefined') return '#6757f5'
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return value || '#6757f5'
}

// ============================================================================
// PDF TEXT LAYER / SEARCH HELPERS
// ============================================================================

/** Minimal surface of pdfjs-dist's `TextLayer` instance that we use. */
interface PdfTextLayerHandle {
  render: () => Promise<void>
  cancel: () => void
  /** One span per text item, in text-content order (marked-content wrappers excluded). */
  textDivs: HTMLElement[]
}

// ============================================================================
// PDF LOADING (dynamic import of pdfjs-dist)
// ============================================================================

let pdfjsLib: typeof import('pdfjs-dist') | null = null
type PDFDocumentProxy = import('pdfjs-dist').PDFDocumentProxy

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib
  const lib = await import('pdfjs-dist')
  lib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  pdfjsLib = lib
  return lib
}

// ============================================================================
// COMPONENT
// ============================================================================

const PdfAnnotationEditor = forwardRef<PdfAnnotationEditorHandle, PdfAnnotationEditorProps>(
  function PdfAnnotationEditor(
  { value, onChange, disabled, noteId, onTextExtracted },
  ref
) {
    const toast = useToast()

    // ── Input device detection ──────────────────────────────────────────────
    // `isTouch` follows the *hardware* (coarse pointer + touch points), so it is
    // also true on a large tablet in landscape. `touchUI` additionally collapses
    // to true on narrow viewports, which need the same big-target treatment.
    const isTouch = useTouchMode()
    const isCompact = useIsCompact()
    const touchUI = isTouch || isCompact

    // PDF doc state
    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
    const [pdfLoading, setPdfLoading] = useState(false)
    const [pdfError, setPdfError] = useState<string | null>(null)

    // Annotation state
    const [currentPage, setCurrentPage] = useState(value?.currentPage ?? 0)
    const [totalPages, setTotalPages] = useState(value?.totalPages ?? 0)
    const [zoom, setZoom] = useState(value?.zoom ?? 1)
    const [pages, setPages] = useState<PdfAnnotationPage[]>(value?.pages ?? [])
    const [tool, setTool] = useState<PdfTool>('pen')
    const [color, setColor] = useState('#000000')
    const [strokeSize, setStrokeSize] = useState(3)
    const [isDrawing, setIsDrawing] = useState(false)
    const [currentStrokePoints, setCurrentStrokePoints] = useState<PdfPoint[]>([])
    const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(null)
    const [shapePreview, setShapePreview] = useState<ShapeAnnotation | null>(null)
    const [editingText, setEditingText] = useState<TextAnnotation | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
    const [resizeHandle, setResizeHandle] = useState<string | null>(null)
    const [shapeFilled, setShapeFilled] = useState(false)
    const [doubleEndedArrow, setDoubleEndedArrow] = useState(false)
    // True while the view is being dragged with the Pan tool (drives the cursor)
    const [isPanning, setIsPanning] = useState(false)

    // Undo/redo
    const [history, setHistory] = useState<PdfAnnotationPage[][]>([])
    const [historyIdx, setHistoryIdx] = useState(-1)

    // Refs
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
    const annotCanvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    // Outer page element (reserves the bounding box) — used as the zoom anchor
    const pageRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const textAreaRef = useRef<HTMLTextAreaElement>(null)
    const renderTaskRef = useRef<import('pdfjs-dist').RenderTask | null>(null)
    // Last canvas pointerdown — used for manual double-tap detection (the browser's
    // own dblclick is unreliable after preventDefault() on pointerdown)
    const lastCanvasClickRef = useRef<TapRecord | null>(null)

    // ── Multi-pointer / gesture bookkeeping ─────────────────────────────────
    /** Every currently-down pointer, keyed by pointerId (client coordinates). */
    const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
    /** Pointer currently owning the drawing gesture (all others are ignored). */
    const activePointerIdRef = useRef<number | null>(null)
    /** Kind of the pointer owning the drawing gesture (used for palm rejection). */
    const activePointerKindRef = useRef<PointerKind | null>(null)
    /** True while a two-finger navigation gesture owns the input. */
    const gestureActiveRef = useRef(false)
    /** Two-finger pinch/pan state (mutated in place — never triggers re-renders). */
    const pinchRef = useRef<{
      startDist: number
      startZoom: number
      lastMidX: number
      lastMidY: number
      lastZoom: number
    } | null>(null)
    /** Pan-tool drag state. */
    const panDragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)
    /** Last zoom applied by a gesture — scroll anchoring is computed against this. */
    const gestureZoomRef = useRef(zoom)
    /**
     * Stable handle to `emitChange`. Gesture listeners must not be torn down and
     * re-registered on every zoom/page change (which is every frame of a pinch).
     */
    const emitChangeRef = useRef<(next: PdfAnnotationPage[], pg?: number, z?: number) => void>(() => {})
    // Editing UI wrapper (textarea + formatting toolbar) — keeps the edit session alive
    // while the user interacts with its own toolbar
    const editingWrapperRef = useRef<HTMLDivElement>(null)
    // Typography remembered from the last edited text box, applied to new ones
    const lastTextStyleRef = useRef<{
      fontSize: number
      bold?: boolean
      italic?: boolean
      fontFamily?: string
      textAlign?: 'left' | 'center' | 'right'
    }>({
      fontSize: DEFAULT_FONT_SIZE,
    })

    // Canvas dimensions (set after PDF page renders)
    const [canvasWidth, setCanvasWidth] = useState(800)
    const [canvasHeight, setCanvasHeight] = useState(600)

    // Natural (unscaled) page dimensions — used for fit-to-width/page and blank page sizing
    const [naturalWidth, setNaturalWidth] = useState(0)
    const [naturalHeight, setNaturalHeight] = useState(0)

    // Rotation (view-only, 0 | 90 | 180 | 270)
    const [viewRotation, setViewRotation] = useState<0 | 90 | 180 | 270>(0)

    // UI / thumbnail state
    const [showThumbnails, setShowThumbnails] = useState(false)
    const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null)
    const [thumbnailUrls, setThumbnailUrls] = useState<string[]>([])

    // Refs for stable access inside non-reactive listeners (e.g. wheel handler)
    const pagesRef = useRef(pages)
    const currentPageRef = useRef(currentPage)
    const zoomRef = useRef(zoom)
    const totalPagesRef = useRef(totalPages)
    useEffect(() => { pagesRef.current = pages }, [pages])
    useEffect(() => { currentPageRef.current = currentPage }, [currentPage])
    useEffect(() => { zoomRef.current = zoom; gestureZoomRef.current = zoom }, [zoom])
    useEffect(() => { totalPagesRef.current = totalPages }, [totalPages])

    // ────────────────────────────────────────────────────────
    // Touch interaction helpers
    // ────────────────────────────────────────────────────────
    /**
     * Abort any in-progress drawing/selection interaction without committing it.
     * Called when a second finger lands — a two-finger gesture must never leave
     * a half-drawn stroke behind.
     */
    const abortInteraction = useCallback(() => {
      setIsDrawing(false)
      setCurrentStrokePoints([])
      setShapeStart(null)
      setShapePreview(null)
      setResizeHandle(null)
      setDragOffset(null)
      panDragRef.current = null
      setIsPanning(false)
      activePointerIdRef.current = null
      activePointerKindRef.current = null
    }, [])

    /**
     * Zoom while keeping a screen point visually anchored to the same content.
     *
     * The page surface is a single scaled element, so zooming by `k` scales its
     * content coordinates by `k`. We therefore shift the scroll offset towards
     * the anchor point proportionally, which stays correct even though the exact
     * canvas size only lands one frame later (pdf.js renders asynchronously).
     */
    const zoomAtPoint = useCallback(
      (nextZoom: number, clientX: number, clientY: number, k: number) => {
        const el = scrollAreaRef.current
        if (!el || k === 1) return
        const rect = el.getBoundingClientRect()
        const next = computeAnchoredScroll({
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
          viewportWidth: rect.width,
          viewportHeight: rect.height,
          anchorX: clientX,
          anchorY: clientY,
          viewportLeft: rect.left,
          viewportTop: rect.top,
          scaleRatio: k,
        })
        el.scrollLeft = next.scrollLeft
        el.scrollTop = next.scrollTop
        gestureZoomRef.current = nextZoom
      },
      []
    )

    // Keep the wrap width in state while the user drags the textarea's horizontal resize
    // handle, so the wrapped line count (and thus the box height) updates live.
    useEffect(() => {
      if (!editingText) return
      const el = textAreaRef.current
      if (!el || typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver(() => {
        const width = el.offsetWidth / zoom
        setEditingText(prev => (prev && Math.abs(prev.width - width) > 0.5 ? { ...prev, width } : prev))
      })
      observer.observe(el)
      return () => observer.disconnect()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingText?.id, zoom])

    // Page slide animation
    const [pageAnim, setPageAnim] = useState<'exit-up' | 'exit-down' | 'enter-from-bottom' | 'enter-from-top' | null>(null)
    const pageAnimLockRef = useRef(false)

    // Right side panel (Pages / Annotations) — `showThumbnails` owns visibility so the
    // existing thumbnail renderer keeps working unchanged.
    const [panelTab, setPanelTab] = useState<'pages' | 'annotations'>('pages')
    // Inline popover in the top bar ('color' | 'size'), click-away closes it
    const [openPopover, setOpenPopover] = useState<'color' | 'size' | 'zoom' | null>(null)
    // Page-number jump field
    const [pageInput, setPageInput] = useState('')
    // Fill opacity applied to newly created filled shapes
    const [fillOpacity, setFillOpacity] = useState(0.2)
    // Bottom-sheet style controls for the touch dock
    const [mobileStyleOpen, setMobileStyleOpen] = useState(false)

    // File picker (select existing uploaded file)
    const [showFilePicker, setShowFilePicker] = useState(false)

    // Text layer state & refs
    const [showTextLayer, setShowTextLayer] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchVisible, setSearchVisible] = useState(false)
    const [searchMatchCount, setSearchMatchCount] = useState(0)
    const [searchCurrentIdx, setSearchCurrentIdx] = useState(0)
    const [textLayerVersion, setTextLayerVersion] = useState(0)
    const textLayerRef = useRef<HTMLDivElement>(null)
    const textLayerInstanceRef = useRef<PdfTextLayerHandle | null>(null)
    // Cross-page search index (text items per page, built once per PDF)
    const [searchIndex, setSearchIndex] = useState<SearchIndexPage[]>([])
    const [searchIndexBuilding, setSearchIndexBuilding] = useState(false)
    const searchGlobalResultsRef = useRef<SearchMatch[]>([])
    const pendingHighlightIdxRef = useRef<number | null>(null)
    // Currently selected text in the text layer (drives the floating Copy button)
    const [selectedText, setSelectedText] = useState('')
    const selectedTextRef = useRef('')

    /** pdfPageNumber of the page being displayed (undefined for inserted blank pages). */
    const currentPdfPageNumber = pages.find(p => p.pageNumber === currentPage)?.pdfPageNumber

    // ────────────────────────────────────────────────────────
    // Imperative handle
    // ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      focus() {
        containerRef.current?.focus()
      },
      getData() {
        if (!value?.pdfStoragePath) return null
        return {
          pdfStoragePath: value.pdfStoragePath,
          pages,
          currentPage,
          totalPages,
          zoom,
        }
      },
      setData(data: PdfAnnotationData) {
        setPages(data.pages)
        setCurrentPage(data.currentPage)
        setTotalPages(data.totalPages)
        setZoom(data.zoom)
      },
    }))

    // ────────────────────────────────────────────────────────
    // Emit changes
    // ────────────────────────────────────────────────────────
    const emitChange = useCallback(
      (updatedPages: PdfAnnotationPage[], pg?: number, z?: number) => {
        if (!value?.pdfStoragePath) return
        onChange({
          pdfStoragePath: value.pdfStoragePath,
          pages: updatedPages,
          currentPage: pg ?? currentPage,
          totalPages,
          zoom: z ?? zoom,
        })
      },
      [value?.pdfStoragePath, currentPage, totalPages, zoom, onChange]
    )

    // Keep the stable gesture-facing handle in sync with the latest closure
    useEffect(() => {
      emitChangeRef.current = emitChange
    }, [emitChange])

    // ────────────────────────────────────────────────────────
    // Ensure page entry exists
    // ────────────────────────────────────────────────────────
    const getPageAnnotations = useCallback(
      (pageNum: number): PdfAnnotationPage => {
        return pages.find(p => p.pageNumber === pageNum) ?? {
          pageNumber: pageNum,
          strokes: [],
          textAnnotations: [],
          shapes: [],
          stickyNotes: [],
        }
      },
      [pages]
    )

    const updatePageAnnotations = useCallback(
      (pageNum: number, updater: (page: PdfAnnotationPage) => PdfAnnotationPage): PdfAnnotationPage[] => {
        const existing = pages.find(p => p.pageNumber === pageNum)
        if (existing) {
          return pages.map(p => (p.pageNumber === pageNum ? updater(p) : p))
        }
        const newPage: PdfAnnotationPage = {
          pageNumber: pageNum,
          strokes: [],
          textAnnotations: [],
          shapes: [],
          stickyNotes: [],
        }
        return [...pages, updater(newPage)]
      },
      [pages]
    )

    // ────────────────────────────────────────────────────────
    // History helpers
    // ────────────────────────────────────────────────────────
    const pushHistory = useCallback(
      (newPages: PdfAnnotationPage[]) => {
        setHistory(prev => {
          const truncated = prev.slice(0, historyIdx + 1)
          return [...truncated, newPages]
        })
        setHistoryIdx(prev => prev + 1)
      },
      [historyIdx]
    )

    const undo = useCallback(() => {
      if (historyIdx <= 0) return
      const prevIdx = historyIdx - 1
      const prevPages = history[prevIdx]
      setPages(prevPages)
      setHistoryIdx(prevIdx)
      emitChange(prevPages)
    }, [historyIdx, history, emitChange])

    const redo = useCallback(() => {
      if (historyIdx >= history.length - 1) return
      const nextIdx = historyIdx + 1
      const nextPages = history[nextIdx]
      setPages(nextPages)
      setHistoryIdx(nextIdx)
      emitChange(nextPages)
    }, [historyIdx, history, emitChange])

    // ────────────────────────────────────────────────────────
    // Text annotation editing
    // ────────────────────────────────────────────────────────
    /**
     * Re-open a committed text annotation for editing. The committed copy stays in
     * `pages` (and is hidden from the canvas while editing) until it is committed
     * again, so focus changes never lose the annotation.
     */
    const startEditingText = useCallback((ta: TextAnnotation) => {
      setEditingText({ ...ta })
      setSelectedId(null)
      setDragOffset(null)
      setResizeHandle(null)
    }, [])

    /** Update the annotation being edited (live — box size and wrapping recompute immediately). */
    const updateEditingText = useCallback((updates: Partial<TextAnnotation>) => {
      setEditingText(prev => (prev ? { ...prev, ...updates } : prev))
    }, [])

    const adjustEditingFontSize = useCallback((delta: number) => {
      setEditingText(prev =>
        prev ? { ...prev, fontSize: Math.max(8, Math.min(96, prev.fontSize + delta)) } : prev
      )
    }, [])

    /** Commit the in-progress text edit. Returns the updated pages (or null if there was nothing to commit). */
    const commitText = useCallback((): PdfAnnotationPage[] | null => {
      if (!editingText) return null
      // Remember the typography for the next new text box
      lastTextStyleRef.current = {
        fontSize: editingText.fontSize,
        bold: editingText.bold,
        italic: editingText.italic,
        fontFamily: editingText.fontFamily,
        textAlign: editingText.textAlign,
      }
      const keep = editingText.text.trim().length > 0
      const existing = pages
        .find(p => p.pageNumber === currentPage)
        ?.textAnnotations.find(t => t.id === editingText.id)
      const exists = !!existing

      // Empty, brand-new annotation → nothing to commit
      if (!keep && !exists) {
        setEditingText(null)
        return null
      }

      // Persist the same box the user saw while editing: manual width from the DOM in case
      // the resize observer has not caught up, height from the wrapped content lines
      const domWidth = textAreaRef.current ? textAreaRef.current.offsetWidth / zoom : 0
      const effectiveText: TextAnnotation =
        domWidth > 0 && Math.abs(domWidth - editingText.width) > 0.5
          ? { ...editingText, width: domWidth }
          : editingText
      const box = measureTextAnnotationBox(effectiveText)
      const finalText: TextAnnotation = { ...effectiveText, width: box.width, height: box.height }

      // Nothing was actually changed → just close (no noise in the undo history)
      if (
        existing &&
        keep &&
        existing.text === finalText.text &&
        existing.fontSize === finalText.fontSize &&
        existing.color === finalText.color &&
        !!existing.bold === !!finalText.bold &&
        !!existing.italic === !!finalText.italic &&
        (existing.fontFamily ?? 'sans-serif') === (finalText.fontFamily ?? 'sans-serif') &&
        (existing.textAlign ?? 'left') === (finalText.textAlign ?? 'left') &&
        Math.abs(existing.width - finalText.width) < 0.01 &&
        Math.abs(existing.height - finalText.height) < 0.01
      ) {
        setEditingText(null)
        return null
      }

      const newPages = updatePageAnnotations(currentPage, p => ({
        ...p,
        textAnnotations: keep
          ? exists
            ? p.textAnnotations.map(t => (t.id === editingText.id ? finalText : t))
            : [...p.textAnnotations, finalText]
          : p.textAnnotations.filter(t => t.id !== editingText.id),
      }))
      setPages(newPages)
      pushHistory(newPages)
      emitChange(newPages)
      setEditingText(null)
      return newPages
    }, [editingText, currentPage, pages, zoom, updatePageAnnotations, pushHistory, emitChange])

    // ────────────────────────────────────────────────────────
    // Insert / delete blank pages
    // ────────────────────────────────────────────────────────
    const insertBlankPage = useCallback(
      (afterIndex: number) => {
        const insertAt = afterIndex + 1
        const blankPage: PdfAnnotationPage = {
          pageNumber: insertAt,
          isBlank: true,
          strokes: [],
          textAnnotations: [],
          shapes: [],
          stickyNotes: [],
        }
        const newPages = [
          ...pages.slice(0, insertAt),
          blankPage,
          ...pages.slice(insertAt).map(p => ({ ...p, pageNumber: p.pageNumber + 1 })),
        ]
        const newTotal = newPages.length
        setPages(newPages)
        setTotalPages(newTotal)
        setCurrentPage(insertAt)
        pushHistory(newPages)
        if (value?.pdfStoragePath) {
          onChange({
            pdfStoragePath: value.pdfStoragePath,
            pages: newPages,
            currentPage: insertAt,
            totalPages: newTotal,
            zoom,
          })
        }
      },
      [pages, pushHistory, onChange, value, zoom]
    )

    const deletePage = useCallback(
      (index: number) => {
        if (pages.length <= 1) return
        const newPages = pages
          .filter(p => p.pageNumber !== index)
          .map(p => (p.pageNumber > index ? { ...p, pageNumber: p.pageNumber - 1 } : p))
        const newTotal = newPages.length
        const newCurrent = Math.min(currentPage, newTotal - 1)
        setPages(newPages)
        setTotalPages(newTotal)
        setCurrentPage(newCurrent)
        setDeleteConfirmIdx(null)
        pushHistory(newPages)
        if (value?.pdfStoragePath) {
          onChange({
            pdfStoragePath: value.pdfStoragePath,
            pages: newPages,
            currentPage: newCurrent,
            totalPages: newTotal,
            zoom,
          })
        }
      },
      [pages, currentPage, pushHistory, onChange, value, zoom]
    )

    // ────────────────────────────────────────────────────────
    // Text formatting helpers
    // ────────────────────────────────────────────────────────
    const toggleTextBold = useCallback(
      (id: string) => {
        const newPages = updatePageAnnotations(currentPage, page => ({
          ...page,
          textAnnotations: page.textAnnotations.map(t =>
            t.id === id ? { ...t, bold: !t.bold } : t
          ),
        }))
        setPages(newPages)
        pushHistory(newPages)
        emitChange(newPages)
      },
      [currentPage, updatePageAnnotations, pushHistory, emitChange]
    )

    const toggleTextItalic = useCallback(
      (id: string) => {
        const newPages = updatePageAnnotations(currentPage, page => ({
          ...page,
          textAnnotations: page.textAnnotations.map(t =>
            t.id === id ? { ...t, italic: !t.italic } : t
          ),
        }))
        setPages(newPages)
        pushHistory(newPages)
        emitChange(newPages)
      },
      [currentPage, updatePageAnnotations, pushHistory, emitChange]
    )

    const changeTextAlign = useCallback(
      (id: string, align: 'left' | 'center' | 'right') => {
        const newPages = updatePageAnnotations(currentPage, page => ({
          ...page,
          textAnnotations: page.textAnnotations.map(t =>
            t.id === id ? { ...t, textAlign: align } : t
          ),
        }))
        setPages(newPages)
        pushHistory(newPages)
        emitChange(newPages)
      },
      [currentPage, updatePageAnnotations, pushHistory, emitChange]
    )

    const changeTextFontSize = useCallback(
      (id: string, delta: number) => {
        const newPages = updatePageAnnotations(currentPage, page => ({
          ...page,
          textAnnotations: page.textAnnotations.map(t =>
            t.id === id
              ? { ...t, fontSize: Math.max(8, Math.min(96, t.fontSize + delta)) }
              : t
          ),
        }))
        setPages(newPages)
        pushHistory(newPages)
        emitChange(newPages)
      },
      [currentPage, updatePageAnnotations, pushHistory, emitChange]
    )

    // ────────────────────────────────────────────────────────
    // Sticky note helpers
    // ────────────────────────────────────────────────────────
    const updateStickyNote = useCallback(
      (id: string, updates: Partial<StickyNoteAnnotation>, commit = false) => {
        const newPages = updatePageAnnotations(currentPage, page => ({
          ...page,
          stickyNotes: (page.stickyNotes ?? []).map(sn =>
            sn.id === id ? { ...sn, ...updates } : sn
          ),
        }))
        setPages(newPages)
        if (commit) {
          pushHistory(newPages)
        }
        emitChange(newPages)
      },
      [currentPage, updatePageAnnotations, pushHistory, emitChange]
    )

    const commitStickyMove = useCallback(() => {
      pushHistory(pages)
    }, [pushHistory, pages])

    // ────────────────────────────────────────────────────────
    // Eraser helper — erases all annotation types at a point
    // ────────────────────────────────────────────────────────
    const eraseAtPoint = useCallback(
      (pos: PdfPoint) => {
        const pageAnnot = getPageAnnotations(currentPage)
        // Erasing is drag-driven, so the radius has to cover a fingertip
        const hitRadius = (touchUI ? ERASER_RADIUS_TOUCH_PX : ERASER_RADIUS_MOUSE_PX) / zoom

        const newStrokes = pageAnnot.strokes.filter(s =>
          !s.points.some(p =>
            Math.abs(p.x - pos.x) < hitRadius && Math.abs(p.y - pos.y) < hitRadius
          )
        )
        const newShapes = pageAnnot.shapes.filter(s => {
          const minX = Math.min(s.x1, s.x2) - hitRadius
          const maxX = Math.max(s.x1, s.x2) + hitRadius
          const minY = Math.min(s.y1, s.y2) - hitRadius
          const maxY = Math.max(s.y1, s.y2) + hitRadius
          return !(pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY)
        })
        const newTexts = pageAnnot.textAnnotations.filter(t =>
          !textAnnotationContains(t, pos.x, pos.y, hitRadius)
        )
        const newStickies = (pageAnnot.stickyNotes ?? []).filter(sn =>
          !(pos.x >= sn.x && pos.x <= sn.x + sn.width &&
            pos.y >= sn.y && pos.y <= sn.y + sn.height)
        )

        const changed =
          newStrokes.length !== pageAnnot.strokes.length ||
          newShapes.length !== pageAnnot.shapes.length ||
          newTexts.length !== pageAnnot.textAnnotations.length ||
          newStickies.length !== (pageAnnot.stickyNotes ?? []).length

        if (changed) {
          const newPages = updatePageAnnotations(currentPage, p => ({
            ...p,
            strokes: newStrokes,
            shapes: newShapes,
            textAnnotations: newTexts,
            stickyNotes: newStickies,
          }))
          setPages(newPages)
          emitChange(newPages)
        }
      },
      [currentPage, zoom, getPageAnnotations, updatePageAnnotations, emitChange, touchUI]
    )

    // ────────────────────────────────────────────────────────
    // Text color helper
    // ────────────────────────────────────────────────────────
    const changeTextColor = useCallback(
      (id: string, newColor: string) => {
        const newPages = updatePageAnnotations(currentPage, page => ({
          ...page,
          textAnnotations: page.textAnnotations.map(t =>
            t.id === id ? { ...t, color: newColor } : t
          ),
        }))
        setPages(newPages)
        pushHistory(newPages)
        emitChange(newPages)
      },
      [currentPage, updatePageAnnotations, pushHistory, emitChange]
    )

    const changeTextFontFamily = useCallback(
      (id: string, family: string) => {
        const newPages = updatePageAnnotations(currentPage, page => ({
          ...page,
          textAnnotations: page.textAnnotations.map(t =>
            t.id === id ? { ...t, fontFamily: family } : t
          ),
        }))
        setPages(newPages)
        pushHistory(newPages)
        emitChange(newPages)
      },
      [currentPage, updatePageAnnotations, pushHistory, emitChange]
    )

    /** Remove a text annotation entirely (used by the touch trash button). */
    const deleteTextAnnotation = useCallback(
      (id: string) => {
        const newPages = updatePageAnnotations(currentPage, page => ({
          ...page,
          textAnnotations: page.textAnnotations.filter(t => t.id !== id),
        }))
        setPages(newPages)
        pushHistory(newPages)
        emitChange(newPages)
        setEditingText(null)
        setSelectedId(null)
      },
      [currentPage, updatePageAnnotations, pushHistory, emitChange]
    )

    const deleteStickyNote = useCallback(
      (id: string) => {
        const newPages = updatePageAnnotations(currentPage, page => ({
          ...page,
          stickyNotes: (page.stickyNotes ?? []).filter(sn => sn.id !== id),
        }))
        setPages(newPages)
        pushHistory(newPages)
        emitChange(newPages)
      },
      [currentPage, updatePageAnnotations, pushHistory, emitChange]
    )

    // ────────────────────────────────────────────────────────
    // Thumbnail rendering
    // ────────────────────────────────────────────────────────
    const renderThumbnails = useCallback(async () => {
      const urls: string[] = []
      const thumbScale = 0.18
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        const thumbCanvas = document.createElement('canvas')
        let thumbCtx: CanvasRenderingContext2D | null = null
        let renderedW = 0
        let renderedH = 0
        if (page.isBlank) {
          const w = naturalWidth > 0 ? Math.round(naturalWidth * thumbScale) : 112
          const h = naturalHeight > 0 ? Math.round(naturalHeight * thumbScale) : 155
          thumbCanvas.width = w
          thumbCanvas.height = h
          thumbCtx = thumbCanvas.getContext('2d')!
          thumbCtx.fillStyle = '#ffffff'
          thumbCtx.fillRect(0, 0, w, h)
          thumbCtx.strokeStyle = '#e5e7eb'
          thumbCtx.strokeRect(0.5, 0.5, w - 1, h - 1)
          renderedW = w
          renderedH = h
          urls.push(thumbCanvas.toDataURL())
        } else if (pdfDoc && page.pdfPageNumber) {
          try {
            const pdfPage = await pdfDoc.getPage(page.pdfPageNumber)
            const vp = pdfPage.getViewport({ scale: thumbScale })
            thumbCanvas.width = vp.width
            thumbCanvas.height = vp.height
            thumbCtx = thumbCanvas.getContext('2d')!
            await pdfPage.render({ canvasContext: thumbCtx, viewport: vp }).promise
            renderedW = vp.width
            renderedH = vp.height
          } catch {
            urls.push('')
            thumbCanvas.remove()
            continue
          }
        } else {
          urls.push('')
          thumbCanvas.remove()
          continue
        }

        // Composite annotations onto the thumbnail
        if (thumbCtx && renderedW > 0) {
          const pageAnnot = pages.find(p => p.pageNumber === i) ?? {
            pageNumber: i, strokes: [], textAnnotations: [], shapes: [], stickyNotes: [],
          }
          for (const stroke of pageAnnot.strokes) {
            renderStrokeToCtx(thumbCtx, stroke, thumbScale)
          }
          for (const shape of pageAnnot.shapes) {
            drawShape(thumbCtx, shape, thumbScale)
          }
          for (const ta of pageAnnot.textAnnotations) {
            thumbCtx.save()
            thumbCtx.font = `${ta.italic ? 'italic ' : ''}${ta.bold ? 'bold ' : ''}${ta.fontSize * thumbScale}px ${ta.fontFamily ?? 'sans-serif'}`
            thumbCtx.fillStyle = ta.color
            wrapTextAnnotationLines(ta, ta.width).forEach((line, li) => {
              thumbCtx!.fillText(line, textLineDrawX(thumbCtx!, ta, line, thumbScale), (ta.y + ta.fontSize + li * ta.fontSize * TEXT_LINE_HEIGHT) * thumbScale)
            })
            thumbCtx.restore()
          }
          urls.push(thumbCanvas.toDataURL())
        }

        thumbCanvas.remove()
      }
      setThumbnailUrls(urls)
    }, [pdfDoc, pages, naturalWidth, naturalHeight])

    useEffect(() => {
      if (showThumbnails) {
        renderThumbnails()
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showThumbnails, pdfDoc, pages.length])

    // ────────────────────────────────────────────────────────
    // Load PDF from storage
    // ────────────────────────────────────────────────────────
    useEffect(() => {
      if (!value?.pdfStoragePath) {
        // No document (e.g. a brand-new note): a previously started load must not
        // leave the empty state stuck showing "Loading…".
        setPdfLoading(false)
        setPdfError(null)
        setPdfDoc(null)
        return
      }
      let cancelled = false

      async function loadPdf() {
        setPdfLoading(true)
        setPdfError(null)
        try {
          const lib = await loadPdfJs()
          const blob = await downloadFile(value!.pdfStoragePath)
          const arrayBuf = await blob.arrayBuffer()
          const doc = await lib.getDocument({ data: arrayBuf }).promise
          if (cancelled) return
          setPdfDoc(doc)
          setTotalPages(doc.numPages)

          // Extract full plain text from all PDF pages for AI context
          if (onTextExtracted) {
            ;(async () => {
              const parts: string[] = []
              for (let i = 1; i <= doc.numPages; i++) {
                try {
                  const pg = await doc.getPage(i)
                  const tc = await pg.getTextContent()
                  const pageText = tc.items
                    .map((item: any) => item.str ?? '')
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                  if (pageText) parts.push(`[Page ${i}]\n${pageText}`)
                } catch {
                  // skip unreadable page
                }
              }
              onTextExtracted(parts.join('\n\n'))
            })()
          }

          // Initialize page annotations if empty OR migrate existing notes (add pdfPageNumber)
          if (pages.length === 0) {
            const initialPages: PdfAnnotationPage[] = []
            for (let i = 0; i < doc.numPages; i++) {
              initialPages.push({
                pageNumber: i,
                pdfPageNumber: i + 1,
                strokes: [],
                textAnnotations: [],
                shapes: [],
                stickyNotes: [],
              })
            }
            setPages(initialPages)
            pushHistory(initialPages)
          } else if (pages.some(p => p.pdfPageNumber === undefined && !p.isBlank)) {
            // Migrate: assign pdfPageNumber to pages that are missing it
            const migrated = pages.map(p =>
              p.pdfPageNumber === undefined && !p.isBlank
                ? { ...p, pdfPageNumber: p.pageNumber + 1, stickyNotes: p.stickyNotes ?? [] }
                : { ...p, stickyNotes: p.stickyNotes ?? [] }
            )
            setPages(migrated)
          }
        } catch (err) {
          if (!cancelled) {
            setPdfError(err instanceof Error ? err.message : 'Failed to load PDF')
          }
        } finally {
          if (!cancelled) setPdfLoading(false)
        }
      }

      loadPdf()
      return () => { cancelled = true }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value?.pdfStoragePath])

    // ────────────────────────────────────────────────────────
    // Render PDF page to canvas
    // ────────────────────────────────────────────────────────
    useEffect(() => {
      if (!pdfCanvasRef.current) return

      const currentPageData = pages.find(p => p.pageNumber === currentPage)

      // Handle blank (user-inserted) pages
      if (currentPageData?.isBlank) {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel()
          renderTaskRef.current = null
        }
        const dpr = window.devicePixelRatio || 1
        const w = naturalWidth > 0 ? naturalWidth * zoom : 595 * zoom  // ~A4 width
        const h = naturalHeight > 0 ? naturalHeight * zoom : 842 * zoom // ~A4 height
        const canvas = pdfCanvasRef.current!
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
        setCanvasWidth(w)
        setCanvasHeight(h)
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        return
      }

      if (!pdfDoc) return
      let cancelled = false

      // Cancel any in-flight render before starting a new one
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
        renderTaskRef.current = null
      }

      async function renderPage() {
        const pdfPageNum = currentPageData?.pdfPageNumber ?? (currentPage + 1)
        const page = await pdfDoc!.getPage(pdfPageNum)
        if (cancelled) return

        const viewport = page.getViewport({ scale: zoom * (window.devicePixelRatio || 1) })
        const displayViewport = page.getViewport({ scale: zoom })

        const canvas = pdfCanvasRef.current!
        const ctx = canvas.getContext('2d')!
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = `${displayViewport.width}px`
        canvas.style.height = `${displayViewport.height}px`

        setCanvasWidth(displayViewport.width)
        setCanvasHeight(displayViewport.height)

        // Store natural (unscaled) dimensions for fit-to-width/page
        const naturalVp = page.getViewport({ scale: 1 })
        setNaturalWidth(naturalVp.width)
        setNaturalHeight(naturalVp.height)

        const task = page.render({ canvasContext: ctx, viewport })
        renderTaskRef.current = task
        try {
          await task.promise
        } catch (err: unknown) {
          // Swallow cancellation errors — they are expected when zoom/page changes fast
          if (err instanceof Error && err.message?.includes('Rendering cancelled')) return
          throw err
        } finally {
          if (renderTaskRef.current === task) renderTaskRef.current = null
        }
      }

      renderPage()
      return () => {
        cancelled = true
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel()
          renderTaskRef.current = null
        }
      }
    }, [pdfDoc, currentPage, zoom, pages])

    // ────────────────────────────────────────────────────────
    // Render annotations overlay
    // ────────────────────────────────────────────────────────
    const renderAnnotations = useCallback(() => {
      const canvas = annotCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvasWidth * dpr
      canvas.height = canvasHeight * dpr
      canvas.style.width = `${canvasWidth}px`
      canvas.style.height = `${canvasHeight}px`
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, canvasWidth, canvasHeight)

      const pageAnnot = getPageAnnotations(currentPage)
      const scale = zoom
      const selectionColor = accentColor()

      // Draw strokes
      for (const stroke of pageAnnot.strokes) {
        renderStrokeToCtx(ctx, stroke, scale)
        if (stroke.id === selectedId) {
          const xs = stroke.points.map(p => p.x * scale)
          const ys = stroke.points.map(p => p.y * scale)
          const minX = Math.min(...xs) - stroke.size * scale / 2
          const minY = Math.min(...ys) - stroke.size * scale / 2
          const maxX = Math.max(...xs) + stroke.size * scale / 2
          const maxY = Math.max(...ys) + stroke.size * scale / 2
          ctx.save()
          ctx.strokeStyle = selectionColor
          ctx.lineWidth = 1.5
          ctx.setLineDash([5, 4])
          ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8)
          ctx.restore()
        }
      }

      // Draw in-progress stroke
      if (isDrawing && currentStrokePoints.length > 1 && (tool === 'pen' || tool === 'highlighter')) {
        const tempStroke: PdfStroke = {
          id: 'temp',
          points: currentStrokePoints,
          color,
          size: strokeSize,
          tool: tool as 'pen' | 'highlighter',
        }
        renderStrokeToCtx(ctx, tempStroke, scale)
      }

      // Draw shapes
      for (const shape of pageAnnot.shapes) {
        drawShape(ctx, shape, scale)
        if (shape.id === selectedId) {
          // Accent dashed selection box around the shape bounds
          const minX = Math.min(shape.x1, shape.x2) * scale
          const minY = Math.min(shape.y1, shape.y2) * scale
          const maxX = Math.max(shape.x1, shape.x2) * scale
          const maxY = Math.max(shape.y1, shape.y2) * scale
          ctx.save()
          ctx.strokeStyle = selectionColor
          ctx.lineWidth = 1.5
          ctx.setLineDash([5, 4])
          ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8)
          ctx.restore()
          if (shape.type !== 'arrow') {
            // Round grab handles at the 4 corners
            const handles = [
              { x: shape.x1 * scale, y: shape.y1 * scale },
              { x: shape.x2 * scale, y: shape.y1 * scale },
              { x: shape.x1 * scale, y: shape.y2 * scale },
              { x: shape.x2 * scale, y: shape.y2 * scale },
            ]
            ctx.save()
            ctx.fillStyle = selectionColor
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.5
            ctx.setLineDash([])
            // Fat-finger friendly grab handles on touch devices
            const hs = touchUI ? 7 : 4.5
            for (const h of handles) {
              ctx.beginPath()
              ctx.arc(h.x, h.y, hs, 0, Math.PI * 2)
              ctx.fill()
              ctx.stroke()
            }
            ctx.restore()
          }
        }
      }

      // Draw shape preview
      if (shapePreview) {
        drawShape(ctx, shapePreview, scale)
      }

      // Draw text annotations (the one being edited is shown by the textarea overlay instead)
      for (const ta of pageAnnot.textAnnotations) {
        if (editingText && ta.id === editingText.id) continue
        ctx.save()
        const fontStyle = `${ta.italic ? 'italic ' : ''}${ta.bold ? 'bold ' : ''}${ta.fontSize * scale}px ${ta.fontFamily ?? 'sans-serif'}`
        ctx.font = fontStyle
        ctx.fillStyle = ta.color
        const lines = wrapTextAnnotationLines(ta, ta.width)
        lines.forEach((line, i) => {
          ctx.fillText(line, textLineDrawX(ctx, ta, line, scale), (ta.y + ta.fontSize + i * ta.fontSize * TEXT_LINE_HEIGHT) * scale)
        })
        if (ta.id === selectedId) {
          ctx.strokeStyle = selectionColor
          ctx.lineWidth = 1.5
          ctx.setLineDash([5, 4])
          ctx.strokeRect(
            ta.x * scale - 2,
            ta.y * scale - 2,
            ta.width * scale + 4,
            (ta.height || ta.fontSize * 1.5) * scale + 4
          )
        }
        ctx.restore()
      }
    }, [canvasWidth, canvasHeight, currentPage, zoom, pages, isDrawing, currentStrokePoints, tool, color, strokeSize, shapePreview, selectedId, editingText, getPageAnnotations, touchUI])

    useEffect(() => {
      renderAnnotations()
    }, [renderAnnotations])

    // ────────────────────────────────────────────────────────
    // Shape drawing helper
    // ────────────────────────────────────────────────────────
    function distToSegment(p: PdfPoint, a: PdfPoint, b: PdfPoint): number {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lenSq = dx * dx + dy * dy
      if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }

    function drawShape(
      ctx: CanvasRenderingContext2D,
      shape: ShapeAnnotation,
      scale: number
    ) {
      ctx.save()
      ctx.strokeStyle = shape.color
      ctx.lineWidth = shape.strokeWidth * scale

      const x1 = shape.x1 * scale
      const y1 = shape.y1 * scale
      const x2 = shape.x2 * scale
      const y2 = shape.y2 * scale

      if (shape.type === 'rectangle') {
        if (shape.filled) {
          ctx.save()
          ctx.globalAlpha = shape.fillOpacity ?? 0.2
          ctx.fillStyle = shape.color
          ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
          ctx.restore()
        }
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      } else if (shape.type === 'circle') {
        const rx = Math.abs(x2 - x1) / 2
        const ry = Math.abs(y2 - y1) / 2
        const cx = (x1 + x2) / 2
        const cy = (y1 + y2) / 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        if (shape.filled) {
          ctx.save()
          ctx.globalAlpha = shape.fillOpacity ?? 0.2
          ctx.fillStyle = shape.color
          ctx.fill()
          ctx.restore()
        }
        ctx.stroke()
      } else if (shape.type === 'line') {
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      } else if (shape.type === 'arrow') {
        // Line
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        // Arrowhead at end
        const angle = Math.atan2(y2 - y1, x2 - x1)
        const headLen = 12 * scale
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
        ctx.stroke()
        // Arrowhead at start (double-ended)
        if (shape.doubleEnded) {
          const startAngle = Math.atan2(y1 - y2, x1 - x2)
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x1 - headLen * Math.cos(startAngle - Math.PI / 6), y1 - headLen * Math.sin(startAngle - Math.PI / 6))
          ctx.moveTo(x1, y1)
          ctx.lineTo(x1 - headLen * Math.cos(startAngle + Math.PI / 6), y1 - headLen * Math.sin(startAngle + Math.PI / 6))
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    // ────────────────────────────────────────────────────────
    // Pointer helpers (convert to unscaled coords)
    // ────────────────────────────────────────────────────────

    /**
     * Maps a client-space point onto unscaled page coordinates.
     *
     * `pointerType`/`pressure` are used for stylus support: touchscreens report
     * 0 (or a flat 1) for every touch, and perfect-freehand renders a
     * zero-pressure point as an invisible dot, so non-stylus input is pinned to
     * the neutral 0.5 and only real pens contribute pressure data.
     */
    function getPointerPos(
      clientX: number,
      clientY: number,
      pointerType?: string,
      pressure?: number,
    ): PdfPoint {
      const rect = annotCanvasRef.current!.getBoundingClientRect()
      const vx = clientX - rect.left
      const vy = clientY - rect.top
      let cx: number, cy: number
      // Undo CSS rotation to map visual pointer coords back to canvas logical coords
      switch (viewRotation) {
        case 90:
          cx = vy / zoom
          cy = (canvasHeight - vx) / zoom
          break
        case 180:
          cx = (canvasWidth - vx) / zoom
          cy = (canvasHeight - vy) / zoom
          break
        case 270:
          cx = (canvasWidth - vy) / zoom
          cy = vx / zoom
          break
        default:
          cx = vx / zoom
          cy = vy / zoom
      }
      return { x: cx, y: cy, pressure: normalizePressure(pointerType, pressure) }
    }

    // ────────────────────────────────────────────────────────
    // Pointer event handlers
    // ────────────────────────────────────────────────────────
    const handlePointerDown = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (disabled) return
        // Secondary mouse buttons are never drawing actions
        if (e.pointerType === 'mouse' && e.button !== 0) return

        const kind = toPointerKind(e.pointerType)

        // ── Palm rejection (checked before tracking — a resting hand must not be
        //    mistaken for the second finger of a gesture) ─────────────────────
        if (isPalmTouch({
          pointerType: e.pointerType,
          width: e.width,
          height: e.height,
          activePointerKind: activePointerKindRef.current,
        })) return

        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

        // ── Second finger ⇒ this is a navigation gesture, not a drawing one ──
        if (pointersRef.current.size >= 2) {
          gestureActiveRef.current = true
          abortInteraction()
          return
        }

        e.preventDefault()

        // Manual double-tap / double-click detection. `preventDefault()` above
        // suppresses the browser's own dblclick, and fingers need far more slop
        // than a mouse cursor.
        const tapRecord: TapRecord = { time: Date.now(), x: e.clientX, y: e.clientY }
        const isDoubleClick = isDoubleTap(lastCanvasClickRef.current, tapRecord, kind)
        lastCanvasClickRef.current = tapRecord

        const pos = getPointerPos(e.clientX, e.clientY, e.pointerType, e.pressure)

        // ── Pan tool: single-finger view navigation ─────────────────────────
        if (tool === 'pan') {
          panDragRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY }
          setIsPanning(true)
          try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
          return
        }

        // Finish any in-progress text edit first — this tap only commits it
        if (editingText) {
          commitText()
          return
        }

        // Take ownership of the gesture so stray pointers can't corrupt it, and
        // keep receiving moves even when the finger leaves the page bounds.
        activePointerIdRef.current = e.pointerId
        activePointerKindRef.current = kind
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not capturable */ }

        // Text annotations get a wider tap target than their visual box
        const textSlop = touchUI ? TEXT_HIT_SLOP_TOUCH_PX / zoom : 0

        // Double-tap a committed text annotation to re-open it for editing
        if (isDoubleClick && tool !== 'eraser') {
          const hitText = getPageAnnotations(currentPage).textAnnotations.find(ta =>
            textAnnotationContains(ta, pos.x, pos.y, textSlop)
          )
          if (hitText) {
            startEditingText(hitText)
            return
          }
        }

        if (tool === 'pen' || tool === 'highlighter') {
          setIsDrawing(true)
          setCurrentStrokePoints([pos])
        } else if (tool === 'eraser') {
          setIsDrawing(true)
          eraseAtPoint(pos)
        } else if (tool === 'text') {
          // Clicking an existing annotation edits it instead of stacking a new one on top
          const existingText = getPageAnnotations(currentPage).textAnnotations.find(ta =>
            textAnnotationContains(ta, pos.x, pos.y, textSlop)
          )
          if (existingText) {
            startEditingText(existingText)
            return
          }
          // Place a new text annotation (reusing the last used typography)
          const style = lastTextStyleRef.current
          const newText: TextAnnotation = {
            id: uid(),
            x: pos.x,
            y: pos.y,
            width: 200,
            height: style.fontSize * 1.5,
            text: '',
            fontSize: style.fontSize,
            color,
            ...(style.bold ? { bold: true } : {}),
            ...(style.italic ? { italic: true } : {}),
            ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
            ...(style.textAlign && style.textAlign !== 'left' ? { textAlign: style.textAlign } : {}),
          }
          setEditingText(newText)
        } else if (tool === 'rectangle' || tool === 'circle' || tool === 'arrow' || tool === 'line') {
          setIsDrawing(true)
          setShapeStart({ x: pos.x, y: pos.y })
        } else if (tool === 'sticky') {
          const newSticky: StickyNoteAnnotation = {
            id: uid(),
            x: pos.x,
            y: pos.y,
            width: 200,
            height: 150,
            text: '',
            color: 'yellow',
            collapsed: false,
            createdAt: Date.now(),
          }
          const newPages = updatePageAnnotations(currentPage, p => ({
            ...p,
            stickyNotes: [...(p.stickyNotes ?? []), newSticky],
          }))
          setPages(newPages)
          pushHistory(newPages)
          emitChange(newPages)
        } else if (tool === 'select') {
          // Hit-test shapes and text
          const pageAnnot = getPageAnnotations(currentPage)
          let hit = false
          // Fingers need a much larger grab radius than a mouse cursor
          const HANDLE_RADIUS = (touchUI ? 18 : 8) / zoom

          // Check resize handles on the currently selected shape first
          if (selectedId && !hit) {
            const selShape = pageAnnot.shapes.find(s => s.id === selectedId)
            if (selShape && selShape.type !== 'arrow') {
              const handles: [string, number, number][] = [
                ['x1y1', selShape.x1, selShape.y1],
                ['x2y1', selShape.x2, selShape.y1],
                ['x1y2', selShape.x1, selShape.y2],
                ['x2y2', selShape.x2, selShape.y2],
              ]
              for (const [hKey, hx, hy] of handles) {
                if (Math.hypot(pos.x - hx, pos.y - hy) < HANDLE_RADIUS) {
                  setResizeHandle(hKey)
                  hit = true
                  break
                }
              }
            }
          }

          // Check text annotations
          if (!hit) {
            for (const ta of pageAnnot.textAnnotations) {
              if (textAnnotationContains(ta, pos.x, pos.y, touchUI ? TEXT_HIT_SLOP_TOUCH_PX / zoom : 0)) {
                setSelectedId(ta.id)
                setDragOffset({ x: pos.x - ta.x, y: pos.y - ta.y })
                hit = true
                break
              }
            }
          }

          if (!hit) {
            // Check shapes
            for (const shape of pageAnnot.shapes) {
              const minX = Math.min(shape.x1, shape.x2)
              const maxX = Math.max(shape.x1, shape.x2)
              const minY = Math.min(shape.y1, shape.y2)
              const maxY = Math.max(shape.y1, shape.y2)
              if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
                setSelectedId(shape.id)
                setDragOffset({ x: pos.x - minX, y: pos.y - minY })
                hit = true
                break
              }
            }
          }

          // Check strokes (distance-to-path)
          if (!hit) {
            const hitR = hitSlop(strokeSize, touchUI) / zoom
            for (let si = pageAnnot.strokes.length - 1; si >= 0; si--) {
              const stroke = pageAnnot.strokes[si]
              const pts = stroke.points
              let minDist = Infinity
              for (let i = 1; i < pts.length; i++) {
                const d = distToSegment(pos, pts[i - 1], pts[i])
                if (d < minDist) minDist = d
              }
              if (minDist < hitR + stroke.size / 2) {
                setSelectedId(stroke.id)
                setDragOffset({ x: pos.x, y: pos.y })
                hit = true
                break
              }
            }
          }

          if (!hit) {
            setSelectedId(null)
            setDragOffset(null)
            setResizeHandle(null)
            // Dragging empty space is how tablets navigate: a finger drag pans
            // the page, a plain tap just clears the selection. Mouse users keep
            // the click-to-deselect behaviour they are used to.
            if (kind !== 'mouse') {
              panDragRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY }
              setIsPanning(true)
              return
            }
          }
          setIsDrawing(hit)
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [disabled, tool, color, currentPage, zoom, pages, selectedId, strokeSize, editingText, commitText, startEditingText, getPageAnnotations, abortInteraction, touchUI]
    )

    const handlePointerMove = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        // Keep the pointer map fresh so gesture detection stays accurate
        if (pointersRef.current.has(e.pointerId)) {
          pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        }

        // ── Pan-tool drag (single finger on touch, click-drag with a mouse) ──
        const pan = panDragRef.current
        if (pan && pan.pointerId === e.pointerId) {
          const el = scrollAreaRef.current
          if (el) {
            el.scrollLeft -= e.clientX - pan.lastX
            el.scrollTop -= e.clientY - pan.lastY
          }
          pan.lastX = e.clientX
          pan.lastY = e.clientY
          e.preventDefault()
          return
        }

        // A two-finger gesture owns the input stream — never draw under it
        if (gestureActiveRef.current || pinchRef.current) return
        if (!isDrawing) return
        // Ignore any pointer that doesn't own the current drawing gesture
        if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return

        e.preventDefault()

        // Stylus input arrives in bursts — replay every coalesced sample so the
        // stroke keeps its full fidelity instead of being resampled at frame rate.
        const strokePoints: PdfPoint[] = []
        if (e.pointerType === 'pen') {
          const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? []
          for (const ce of coalesced) {
            strokePoints.push(getPointerPos(ce.clientX, ce.clientY, 'pen', ce.pressure))
          }
        }
        const pos = getPointerPos(e.clientX, e.clientY, e.pointerType, e.pressure)

        if (tool === 'pen' || tool === 'highlighter') {
          const batch = strokePoints.length > 0 ? strokePoints : [pos]
          setCurrentStrokePoints(prev => {
            // Drop samples that carry no movement (jitter on touch screens)
            const last = prev[prev.length - 1]
            const minStep = TOUCH_MOVE_DEADZONE_PX / zoom
            const filtered = batch.filter(
              p => !last || Math.hypot(p.x - last.x, p.y - last.y) > minStep
            )
            return filtered.length > 0 ? [...prev, ...filtered] : prev
          })
        } else if (tool === 'eraser') {
          eraseAtPoint(pos)
        } else if ((tool === 'rectangle' || tool === 'circle' || tool === 'arrow' || tool === 'line') && shapeStart) {
          setShapePreview({
            id: 'preview',
            type: tool as ShapeAnnotation['type'],
            x1: shapeStart.x,
            y1: shapeStart.y,
            x2: pos.x,
            y2: pos.y,
            color,
            strokeWidth: strokeSize,
          })
        } else if (tool === 'select' && selectedId && resizeHandle) {
          // Resize selected shape via drag handle
          const newPages = updatePageAnnotations(currentPage, page => {
            const shapeIdx = page.shapes.findIndex(s => s.id === selectedId)
            if (shapeIdx < 0) return page
            const s = { ...page.shapes[shapeIdx] }
            if (resizeHandle.includes('x1')) s.x1 = pos.x
            if (resizeHandle.includes('x2')) s.x2 = pos.x
            if (resizeHandle.includes('y1')) s.y1 = pos.y
            if (resizeHandle.includes('y2')) s.y2 = pos.y
            const updated = [...page.shapes]
            updated[shapeIdx] = s
            return { ...page, shapes: updated }
          })
          setPages(newPages)
        } else if (tool === 'select' && selectedId && dragOffset) {
          // Move selected annotation
          const pageAnnot = getPageAnnotations(currentPage)
          const isStroke = pageAnnot.strokes.some(s => s.id === selectedId)
          if (isStroke) {
            const dx = pos.x - dragOffset.x
            const dy = pos.y - dragOffset.y
            const newPages = updatePageAnnotations(currentPage, page => ({
              ...page,
              strokes: page.strokes.map(s =>
                s.id === selectedId
                  ? { ...s, points: s.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) }
                  : s
              ),
            }))
            setPages(newPages)
            setDragOffset({ x: pos.x, y: pos.y })
          } else {
            const dx = pos.x - dragOffset.x
            const dy = pos.y - dragOffset.y
            const newPages = updatePageAnnotations(currentPage, page => {
              const textIdx = page.textAnnotations.findIndex(t => t.id === selectedId)
              if (textIdx >= 0) {
                const updated = [...page.textAnnotations]
                updated[textIdx] = { ...updated[textIdx], x: dx, y: dy }
                return { ...page, textAnnotations: updated }
              }
              const shapeIdx = page.shapes.findIndex(s => s.id === selectedId)
              if (shapeIdx >= 0) {
                const s = page.shapes[shapeIdx]
                const w = s.x2 - s.x1
                const h = s.y2 - s.y1
                const updated = [...page.shapes]
                updated[shapeIdx] = { ...updated[shapeIdx], x1: dx, y1: dy, x2: dx + w, y2: dy + h }
                return { ...page, shapes: updated }
              }
              return page
            })
            setPages(newPages)
          }
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isDrawing, tool, shapeStart, color, strokeSize, selectedId, dragOffset, currentPage, pages, eraseAtPoint, resizeHandle, getPageAnnotations, updatePageAnnotations, zoom]
    )

    const handlePointerUp = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        pointersRef.current.delete(e.pointerId)

        // Safety net: the touch listeners own gesture teardown, but a gesture
        // that started from pointer events alone (no touch events, e.g. two
        // styluses) must not leave drawing permanently disabled.
        if (pointersRef.current.size < 2 && !pinchRef.current) {
          gestureActiveRef.current = false
        }

        // ── End a pan-tool drag ─────────────────────────────────────────────
        const pan = panDragRef.current
        if (pan && pan.pointerId === e.pointerId) {
          panDragRef.current = null
          setIsPanning(false)
          activePointerIdRef.current = null
          activePointerKindRef.current = null
          // A drag is not a tap — forget any pending tap so the next one can't
          // be mistaken for a double-tap.
          lastCanvasClickRef.current = null
          try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
          return
        }

        if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return
        if (!isDrawing && tool !== 'eraser') {
          activePointerIdRef.current = null
          activePointerKindRef.current = null
          return
        }
        e.preventDefault()

        if (tool === 'pen' || tool === 'highlighter') {
          if (currentStrokePoints.length > 1) {
            const newStroke: PdfStroke = {
              id: uid(),
              points: currentStrokePoints,
              color,
              size: strokeSize,
              tool,
            }
            const newPages = updatePageAnnotations(currentPage, p => ({
              ...p,
              strokes: [...p.strokes, newStroke],
            }))
            setPages(newPages)
            pushHistory(newPages)
            emitChange(newPages)
          }
          setCurrentStrokePoints([])
        } else if ((tool === 'rectangle' || tool === 'circle' || tool === 'arrow' || tool === 'line') && shapeStart) {
          const pos = getPointerPos(e.clientX, e.clientY, e.pointerType, e.pressure)
          // Fingers wobble — require a slightly larger pull before a shape commits
          const minDist = (touchUI ? 10 : 5) / zoom
          if (Math.abs(pos.x - shapeStart.x) > minDist || Math.abs(pos.y - shapeStart.y) > minDist) {
            const newShape: ShapeAnnotation = {
              id: uid(),
              type: tool as ShapeAnnotation['type'],
              x1: shapeStart.x,
              y1: shapeStart.y,
              x2: pos.x,
              y2: pos.y,
              color,
              strokeWidth: strokeSize,
              ...(tool !== 'arrow' && tool !== 'line' && shapeFilled ? { filled: true, fillOpacity } : {}),
              ...(tool === 'arrow' && doubleEndedArrow ? { doubleEnded: true } : {}),
            }
            const newPages = updatePageAnnotations(currentPage, p => ({
              ...p,
              shapes: [...p.shapes, newShape],
            }))
            setPages(newPages)
            pushHistory(newPages)
            emitChange(newPages)
          }
          setShapeStart(null)
          setShapePreview(null)
        } else if (tool === 'select' && selectedId) {
          pushHistory(pages)
          emitChange(pages)
        } else if (tool === 'eraser') {
          // Commit the erased state to history
          pushHistory(pages)
        }

        setIsDrawing(false)
        setResizeHandle(null)
        activePointerIdRef.current = null
        activePointerKindRef.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isDrawing, tool, currentStrokePoints, color, strokeSize, currentPage, shapeStart, selectedId, pages, zoom, shapeFilled, fillOpacity, doubleEndedArrow, touchUI]
    )

    /**
     * Pointer cancelled (system gesture, palm rejection, app switch…).
     * Discard the in-flight interaction instead of committing a partial stroke.
     */
    const handlePointerCancel = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        pointersRef.current.delete(e.pointerId)
        panDragRef.current = null
        setIsPanning(false)
        abortInteraction()
      },
      [abortInteraction]
    )

    // ────────────────────────────────────────────────────────
    // Page navigation
    // ────────────────────────────────────────────────────────
    const goToPage = useCallback((pg: number) => {
      // Commit any in-progress text edit before leaving the page
      const latestPages = commitText() ?? pages
      setCurrentPage(pg)
      setSelectedId(null)
      if (value?.pdfStoragePath) {
        onChange({
          pdfStoragePath: value.pdfStoragePath,
          pages: latestPages,
          currentPage: pg,
          totalPages,
          zoom,
        })
      }
    }, [commitText, value?.pdfStoragePath, pages, totalPages, zoom, onChange])

    // ────────────────────────────────────────────────────────
    // Keyboard shortcuts: delete, undo/redo, tool switching, page nav
    // ────────────────────────────────────────────────────────
    useEffect(() => {
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedId && tool === 'select' && !editingText) {
            const newPages = updatePageAnnotations(currentPage, page => ({
              ...page,
              textAnnotations: page.textAnnotations.filter(t => t.id !== selectedId),
              shapes: page.shapes.filter(s => s.id !== selectedId),
              strokes: page.strokes.filter(s => s.id !== selectedId),
            }))
            setPages(newPages)
            pushHistory(newPages)
            emitChange(newPages)
            setSelectedId(null)
          }
        }
        // Undo/redo keyboard shortcuts (leave native undo to focused text inputs while editing)
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
          const target = e.target as HTMLElement
          const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
          if (!editingText && !isInput) {
            e.preventDefault()
            if (e.shiftKey) redo()
            else undo()
          }
        }
        // Find/search shortcut (Ctrl/Cmd+F)
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
          e.preventDefault()
          setSearchVisible(v => {
            if (!v) setSearchQuery('')
            return true
          })
        }
        // Select all page text while the text-selection tool is active
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && tool === 'textselect' && !editingText) {
          const target = e.target as HTMLElement
          const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
          const layerEl = textLayerRef.current
          if (!isInput && layerEl) {
            e.preventDefault()
            const range = document.createRange()
            range.selectNodeContents(layerEl)
            const sel = window.getSelection()
            sel?.removeAllRanges()
            sel?.addRange(range)
          }
        }
        // Close search on Escape
        if (e.key === 'Escape') {
          if (searchVisible) {
            setSearchVisible(false)
            setSearchQuery('')
          }
        }
        // Tool switching shortcuts (only when not editing text/textarea)
        if (!editingText && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const keyToTool: Record<string, PdfTool> = {
            's': 'select', 'g': 'pan', 'p': 'pen', 'h': 'highlighter', 'e': 'eraser',
            't': 'text', 'r': 'rectangle', 'c': 'circle', 'a': 'arrow',
            'l': 'line', 'n': 'sticky', 'i': 'textselect',
          }
          const nextTool = keyToTool[e.key.toLowerCase()]
          if (nextTool) {
            const target = e.target as HTMLElement
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
            if (!isInput) {
              setTool(nextTool)
              // The text-selection tool implies the text layer is enabled
              if (nextTool === 'textselect') setShowTextLayer(true)
            }
          }
          // Page navigation
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            const target = e.target as HTMLElement
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
            if (!isInput && currentPage < totalPages - 1) {
              e.preventDefault()
              goToPage(currentPage + 1)
            }
          }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            const target = e.target as HTMLElement
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
            if (!isInput && currentPage > 0) {
              e.preventDefault()
              goToPage(currentPage - 1)
            }
          }
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedId, tool, editingText, currentPage, totalPages, updatePageAnnotations, pushHistory, emitChange, undo, redo, goToPage, searchVisible])

    // ────────────────────────────────────────────────────────
    // Zoom
    // ────────────────────────────────────────────────────────
    const clampZoom = useCallback((z: number) => Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)) * 100) / 100, [])

    const handleZoomIn = useCallback(() => {
      const newZoom = clampZoom(zoom + ZOOM_STEP)
      setZoom(newZoom)
      emitChange(pages, currentPage, newZoom)
    }, [zoom, pages, currentPage, emitChange, clampZoom])

    const handleZoomOut = useCallback(() => {
      const newZoom = clampZoom(zoom - ZOOM_STEP)
      setZoom(newZoom)
      emitChange(pages, currentPage, newZoom)
    }, [zoom, pages, currentPage, emitChange, clampZoom])

    const handleZoomSlider = useCallback((e: ChangeEvent<HTMLInputElement>) => {
      const newZoom = Number(e.target.value)
      setZoom(newZoom)
      emitChange(pages, currentPage, newZoom)
    }, [pages, currentPage, emitChange])

    // ────────────────────────────────────────────────────────
    // Rotation coordinate helpers
    // ────────────────────────────────────────────────────────
    // Convert unscaled logical canvas coords → visual coords relative to the outer bounding-box div.
    // Mirrors the wrapper's `translate(-50%,-50%) rotate(θ)`: at 90° the logical origin
    // lands at the top-right of the outer box (canvasHeight, 0), at 270° at its bottom-left.
    function logicalToVisual(lx: number, ly: number): { vx: number; vy: number } {
      const px = lx * zoom
      const py = ly * zoom
      switch (viewRotation) {
        case 90:  return { vx: canvasHeight - py, vy: px }
        case 180: return { vx: canvasWidth - px, vy: canvasHeight - py }
        case 270: return { vx: py, vy: canvasWidth - px }
        default:  return { vx: px, vy: py }
      }
    }
    // Convert a mouse-movement delta (screen pixels) → logical (unscaled) delta
    function screenDeltaToLogical(dsx: number, dsy: number): { dx: number; dy: number } {
      switch (viewRotation) {
        case 90:  return { dx: dsy / zoom, dy: -dsx / zoom }
        case 180: return { dx: -dsx / zoom, dy: -dsy / zoom }
        case 270: return { dx: -dsy / zoom, dy: dsx / zoom }
        default:  return { dx: dsx / zoom, dy: dsy / zoom }
      }
    }

    const handleFitWidth = useCallback(() => {
      if (!naturalWidth || !scrollAreaRef.current) return
      const available = scrollAreaRef.current.getBoundingClientRect().width - 48 // minus padding
      const newZoom = clampZoom(available / naturalWidth)
      setZoom(newZoom)
      emitChange(pages, currentPage, newZoom)
    }, [naturalWidth, pages, currentPage, emitChange, clampZoom])

    const handleFitPage = useCallback(() => {
      if (!naturalWidth || !naturalHeight || !scrollAreaRef.current) return
      const rect = scrollAreaRef.current.getBoundingClientRect()
      const availW = rect.width - 48
      const availH = rect.height - 48
      const newZoom = clampZoom(Math.min(availW / naturalWidth, availH / naturalHeight))
      setZoom(newZoom)
      emitChange(pages, currentPage, newZoom)
    }, [naturalWidth, naturalHeight, pages, currentPage, emitChange, clampZoom])

    // ────────────────────────────────────────────────────────
    // Fit the page to the viewport once a document has rendered
    // ────────────────────────────────────────────────────────
    const fittedDocRef = useRef<PDFDocumentProxy | null>(null)
    useEffect(() => {
      if (!pdfDoc || !naturalWidth || !naturalHeight || pdfError) return
      if (fittedDocRef.current === pdfDoc) return
      fittedDocRef.current = pdfDoc
      // Wait one frame so the scroll viewport has its final size before measuring
      const raf = requestAnimationFrame(() => {
        // Narrow/touch viewports prioritise width; wide screens show the whole page
        if (isCompact) handleFitWidth()
        else handleFitPage()
      })
      return () => cancelAnimationFrame(raf)
    }, [pdfDoc, naturalWidth, naturalHeight, pdfError, touchUI, isCompact, handleFitPage, handleFitWidth])

    // Keep the page-number jump field in sync with navigation
    useEffect(() => {
      setPageInput(totalPages > 0 ? String(currentPage + 1) : '')
    }, [currentPage, totalPages])

    /** Reset zoom to 100% (the `100%` button in the zoom cluster). */
    const handleZoomReset = useCallback(() => {
      setZoom(1)
      emitChange(pages, currentPage, 1)
    }, [pages, currentPage, emitChange])

    /** Apply a fixed zoom preset from the zoom popover. */
    const applyZoomPreset = (value: number) => {
      const next = clampZoom(value)
      setZoom(next)
      emitChange(pages, currentPage, next)
    }

    /** Commit the page-number field (Enter / blur). */
    const commitPageInput = useCallback(() => {
      const parsed = parseInt(pageInput, 10)
      if (!Number.isFinite(parsed)) {
        setPageInput(totalPages > 0 ? String(currentPage + 1) : '')
        return
      }
      const clamped = Math.min(Math.max(parsed, 1), Math.max(totalPages, 1)) - 1
      setPageInput(String(clamped + 1))
      if (clamped !== currentPage) goToPage(clamped)
    }, [pageInput, totalPages, currentPage, goToPage])

    // Close the colour/size popover when clicking anywhere outside it
    useEffect(() => {
      if (!openPopover) return
      const close = () => setOpenPopover(null)
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPopover(null) }
      window.addEventListener('pointerdown', close)
      window.addEventListener('keydown', onKey)
      return () => {
        window.removeEventListener('pointerdown', close)
        window.removeEventListener('keydown', onKey)
      }
    }, [openPopover])

    // Ctrl/Cmd + scroll wheel zoom — plain scroll at 100% navigates pages
    // Uses refs to avoid stale closures
    useEffect(() => {
      const el = scrollAreaRef.current
      if (!el) return

      let scrollAccum = 0
      const SCROLL_THRESHOLD = 150 // px accumulated over-scroll needed to trigger page turn

      function onWheel(e: WheelEvent) {
        if (e.ctrlKey || e.metaKey) {
          // Zoom in/out
          e.preventDefault()
          const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
          setZoom(prev => {
            const newZoom = clampZoom(prev + delta)
            queueMicrotask(() => emitChange(pagesRef.current, currentPageRef.current, newZoom))
            return newZoom
          })
          return
        }

        // Page navigation by scroll — only at 100% zoom
        if (Math.abs(zoomRef.current - 1) > 0.01) return
        if (!el) return

        const atTop = el.scrollTop === 0
        const atBottom = Math.abs(el.scrollTop + el.clientHeight - el.scrollHeight) < 2

        const scrollingDown = e.deltaY > 0
        const scrollingUp = e.deltaY < 0

        if ((scrollingDown && atBottom) || (scrollingUp && atTop)) {
          e.preventDefault()
          scrollAccum += e.deltaY
          if (Math.abs(scrollAccum) >= SCROLL_THRESHOLD && !pageAnimLockRef.current) {
            const pg = currentPageRef.current
            const total = totalPagesRef.current
            const canGo = scrollingDown ? pg < total - 1 : pg > 0
            if (canGo) {
              pageAnimLockRef.current = true
              scrollAccum = 0
              // Start exit animation then switch page
              setPageAnim(scrollingDown ? 'exit-up' : 'exit-down')
              setTimeout(() => {
                const newPg = scrollingDown ? pg + 1 : pg - 1
                setCurrentPage(newPg)
                el.scrollTop = scrollingDown ? 0 : 99999
                emitChange(pagesRef.current, newPg, zoomRef.current)
                setPageAnim(scrollingDown ? 'enter-from-bottom' : 'enter-from-top')
                setTimeout(() => {
                  setPageAnim(null)
                  pageAnimLockRef.current = false
                }, 300)
              }, 220)
            } else {
              scrollAccum = 0
            }
          }
        } else {
          // Normal scroll within page — reset accumulator
          scrollAccum = 0
        }
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      return () => el.removeEventListener('wheel', onWheel)
      // The scroll viewport only exists once a PDF is loaded (and not while the
      // loading/error states are rendered), so re-attach whenever it appears.
    }, [clampZoom, emitChange, value?.pdfStoragePath, pdfLoading, pdfError])

    // ────────────────────────────────────────────────────────
    // Two-finger pan & pinch-to-zoom
    //
    // Pointer Events cannot suppress the WebView's native pinch-zoom, so the
    // gesture is driven from raw (non-passive) touch events on the scroll
    // container — which also means it works over the PDF text layer.
    // A single finger is left entirely alone: the browser keeps scrolling and
    // selecting text exactly as it normally would.
    // ────────────────────────────────────────────────────────
    useEffect(() => {
      const el = scrollAreaRef.current
      if (!el) return

      const beginPinch = (touches: TouchList) => {
        const a = touches[0]
        const b = touches[1]
        const mid = pinchMidpoint(a, b)
        pinchRef.current = {
          startDist: Math.max(1, pinchDistance(a, b)),
          startZoom: zoomRef.current,
          lastMidX: mid.x,
          lastMidY: mid.y,
          lastZoom: zoomRef.current,
        }
        gestureActiveRef.current = true
        // A second finger always means "navigate" — never leave a partial stroke
        abortInteraction()
      }

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length >= 2) {
          e.preventDefault()
          beginPinch(e.touches)
        }
      }

      const onTouchMove = (e: TouchEvent) => {
        const pinch = pinchRef.current
        if (!pinch || e.touches.length < 2) return
        e.preventDefault()

        const a = e.touches[0]
        const b = e.touches[1]
        const dist = pinchDistance(a, b)
        const mid = pinchMidpoint(a, b)
        const { x: midX, y: midY } = mid

        // Two-finger drag pans the page, independent of any zoom change
        el.scrollLeft += pinch.lastMidX - midX
        el.scrollTop += pinch.lastMidY - midY
        pinch.lastMidX = midX
        pinch.lastMidY = midY

        // Pinch distance ratio → zoom. Anchored at the fingers so the content
        // between them stays under them while scaling.
        const nextZoom = pinchZoom(pinch.startZoom, pinch.startDist, dist, MIN_ZOOM, MAX_ZOOM)
        gestureZoomRef.current = nextZoom
        const k = nextZoom / pinch.lastZoom
        if (Math.abs(k - 1) > 0.002) {
          zoomAtPoint(nextZoom, midX, midY, k)
          pinch.lastZoom = nextZoom
          setZoom(nextZoom)
        }
      }

      const endGesture = () => {
        const wasGesturing = gestureActiveRef.current
        pinchRef.current = null
        gestureActiveRef.current = false
        // Persist the new zoom once per gesture instead of on every frame
        if (wasGesturing) {
          emitChangeRef.current(pagesRef.current, currentPageRef.current, gestureZoomRef.current)
        }
      }

      const onTouchEnd = (e: TouchEvent) => {
        if (e.touches.length < 2) endGesture()
      }

      el.addEventListener('touchstart', onTouchStart, { passive: false })
      el.addEventListener('touchmove', onTouchMove, { passive: false })
      el.addEventListener('touchend', onTouchEnd)
      el.addEventListener('touchcancel', onTouchEnd)
      return () => {
        el.removeEventListener('touchstart', onTouchStart)
        el.removeEventListener('touchmove', onTouchMove)
        el.removeEventListener('touchend', onTouchEnd)
        el.removeEventListener('touchcancel', onTouchEnd)
        endGesture()
      }
      // `emitChange` is deliberately read through a ref — see emitChangeRef.
      // The PDF-dependent deps re-attach the listeners to the scroll viewport
      // once it is actually mounted.
    }, [clampZoom, zoomAtPoint, abortInteraction, value?.pdfStoragePath, pdfLoading, pdfError])

    // ────────────────────────────────────────────────────────
    // Text layer rendering (pdfjs TextLayer class, pdfjs-dist 4.x)
    // Always rendered in the background so search highlights and text selection
    // are instantly available. Visibility/pointer-events are controlled separately.
    // NOTE: must NOT depend on `pages` — re-rendering would drop the user's text
    // selection whenever an annotation changes.
    // ────────────────────────────────────────────────────────
    useEffect(() => {
      const el = textLayerRef.current
      // Cancel any in-flight render
      if (textLayerInstanceRef.current) {
        textLayerInstanceRef.current.cancel()
        textLayerInstanceRef.current = null
      }
      if (el) el.innerHTML = ''

      if (!pdfDoc || !el || !currentPdfPageNumber) return

      let cancelled = false

      async function renderTextLayerForPage() {
        const lib = pdfjsLib
        if (!lib) return

        const page = await pdfDoc!.getPage(currentPdfPageNumber!)
        if (cancelled) return

        const viewport = page.getViewport({ scale: zoom })
        // pdfjs 4.x sizes/positions the spans with `calc(... * var(--scale-factor))`
        el!.style.setProperty('--scale-factor', String(viewport.scale))

        const tl: PdfTextLayerHandle = new (lib as any).TextLayer({
          textContentSource: page.streamTextContent(),
          container: el!,
          viewport,
        })
        textLayerInstanceRef.current = tl

        try {
          await tl.render()
          if (!cancelled) setTextLayerVersion(v => v + 1)
        } catch {
          // cancelled or error — ignore
        }
      }

      renderTextLayerForPage()

      return () => {
        cancelled = true
        textLayerInstanceRef.current?.cancel()
        textLayerInstanceRef.current = null
        if (el) el.innerHTML = ''
      }
    }, [pdfDoc, currentPage, zoom, currentPdfPageNumber])

    // ────────────────────────────────────────────────────────
    // Build cross-page search index (text items per page)
    // Runs once when the PDF doc loads or page count changes
    // ────────────────────────────────────────────────────────
    useEffect(() => {
      if (!pdfDoc) { setSearchIndex([]); return }
      let cancelled = false
      // Show loading indicator only after 400ms (hides flicker for fast PDFs)
      const loadingTimer = setTimeout(() => { if (!cancelled) setSearchIndexBuilding(true) }, 400)

      ;(async () => {
        const idx: SearchIndexPage[] = []
        for (const pg of pagesRef.current) {
          if (cancelled) break
          if (pg.isBlank || !pg.pdfPageNumber) {
            idx.push({ pageNumber: pg.pageNumber, normalized: '', itemOffsets: [] })
            continue
          }
          try {
            const page = await pdfDoc.getPage(pg.pdfPageNumber)
            const tc = await page.getTextContent()
            // Only items with `str` produce text-layer spans, so indexes stay aligned
            const items = (tc.items as any[]).filter(item => typeof item.str === 'string')
            idx.push(buildSearchIndexEntry(pg.pageNumber, items))
          } catch {
            idx.push({ pageNumber: pg.pageNumber, normalized: '', itemOffsets: [] })
          }
        }
        if (!cancelled) {
          clearTimeout(loadingTimer)
          setSearchIndex(idx)
          setSearchIndexBuilding(false)
        }
      })()

      return () => {
        cancelled = true
        clearTimeout(loadingTimer)
        setSearchIndexBuilding(false)
      }
    }, [pdfDoc, totalPages])

    // ────────────────────────────────────────────────────────
    // Search: build cross-page results when query or index changes
    // ────────────────────────────────────────────────────────

    /** Apply per-page DOM highlights for the current page. `activeGlobalIdx`
     *  is the index into searchGlobalResultsRef.current to mark as active. */
    const applyPageHighlights = useCallback((activeGlobalIdx: number) => {
      const divs = textLayerInstanceRef.current?.textDivs ?? []
      for (const d of divs) {
        d.classList.remove('pdfannot-match', 'pdfannot-match-active')
        d.style.backgroundColor = ''
        d.style.boxShadow = ''
        d.style.borderRadius = ''
      }
      if (divs.length === 0) return

      const results = searchGlobalResultsRef.current
      const pg = currentPageRef.current
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        if (r.pageNumber !== pg) continue
        const isActive = i === activeGlobalIdx
        const cls = isActive ? 'pdfannot-match-active' : 'pdfannot-match'
        const from = Math.max(0, r.itemStart)
        const to = Math.min(divs.length - 1, r.itemEnd)
        for (let k = from; k <= to; k++) {
          const el = divs[k]
          el.classList.add(cls)
          // Current match: accent wash + accent underline. Other matches: soft amber.
          el.style.backgroundColor = isActive ? 'var(--accent-light)' : 'var(--warning-light)'
          el.style.boxShadow = isActive ? 'inset 0 0 0 1px var(--accent), inset 0 -1.5px 0 0 var(--accent)' : 'none'
          el.style.borderRadius = '2px'
        }
      }

      // Scroll the active match into view if it's on this page
      const active = results[activeGlobalIdx]
      if (active && active.pageNumber === pg) {
        divs[Math.max(0, Math.min(divs.length - 1, active.itemStart))]
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      }
    }, [])

    useEffect(() => {
      // Clear DOM highlights whenever the query changes
      const divs = textLayerInstanceRef.current?.textDivs ?? []
      for (const d of divs) {
        d.classList.remove('pdfannot-match', 'pdfannot-match-active')
        d.style.backgroundColor = ''
        d.style.boxShadow = ''
        d.style.borderRadius = ''
      }

      const q = searchQuery.trim()
      if (!q || searchIndex.length === 0) {
        searchGlobalResultsRef.current = []
        setSearchMatchCount(0)
        setSearchCurrentIdx(-1)
        return
      }

      // Match against the joined page text so phrases work across text items
      const allMatches: SearchMatch[] = findSearchMatches(searchIndex, q)

      searchGlobalResultsRef.current = allMatches
      setSearchMatchCount(allMatches.length)

      if (allMatches.length === 0) {
        setSearchCurrentIdx(-1)
        return
      }

      // Start from the first match on or after the current page
      let startIdx = allMatches.findIndex(m => m.pageNumber >= currentPageRef.current)
      if (startIdx === -1) startIdx = 0
      setSearchCurrentIdx(startIdx)

      const target = allMatches[startIdx]
      if (target.pageNumber !== currentPageRef.current) {
        pendingHighlightIdxRef.current = startIdx
        goToPage(target.pageNumber)
      } else {
        // Apply highlights after state flushes (textLayerVersion will bump if needed)
        queueMicrotask(() => applyPageHighlights(startIdx))
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, searchIndex])

    // After the text layer re-renders (page change, zoom, …), restore highlights
    useEffect(() => {
      const results = searchGlobalResultsRef.current
      if (results.length === 0) return
      const idx = pendingHighlightIdxRef.current
      pendingHighlightIdxRef.current = null
      const targetIdx = idx !== null && results[idx]?.pageNumber === currentPageRef.current
        ? idx
        : results.findIndex(r => r.pageNumber === currentPageRef.current)
      if (targetIdx !== -1) applyPageHighlights(targetIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [textLayerVersion])

    const navigateSearch = useCallback(
      (dir: 1 | -1) => {
        const results = searchGlobalResultsRef.current
        if (results.length === 0) return
        const prev = searchCurrentIdx < 0 ? 0 : searchCurrentIdx
        const next = (prev + dir + results.length) % results.length
        setSearchCurrentIdx(next)
        const target = results[next]
        if (target.pageNumber !== currentPageRef.current) {
          pendingHighlightIdxRef.current = next
          goToPage(target.pageNumber)
        } else {
          applyPageHighlights(next)
        }
      },
      [searchCurrentIdx, goToPage, applyPageHighlights]
    )

    // ────────────────────────────────────────────────────────
    // Text layer selection → floating Copy button
    // ────────────────────────────────────────────────────────
    useEffect(() => {
      if (tool !== 'textselect') {
        if (selectedTextRef.current) {
          selectedTextRef.current = ''
          setSelectedText('')
        }
        return
      }
      const update = () => {
        const sel = window.getSelection()
        const el = textLayerRef.current
        let text = ''
        if (sel && !sel.isCollapsed && sel.rangeCount > 0 && el) {
          const range = sel.getRangeAt(0)
          if (el.contains(range.commonAncestorContainer)) text = sel.toString()
        }
        if (text !== selectedTextRef.current) {
          selectedTextRef.current = text
          setSelectedText(text)
        }
      }
      // Clear stale state (a re-rendered layer drops the previous selection)
      update()
      let timer: ReturnType<typeof setTimeout> | null = null
      const onSelectionChange = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(update, 120)
      }
      document.addEventListener('selectionchange', onSelectionChange)
      return () => {
        document.removeEventListener('selectionchange', onSelectionChange)
        if (timer) clearTimeout(timer)
      }
    }, [tool, textLayerVersion])

    const handleCopySelectedText = useCallback(async () => {
      const text = selectedTextRef.current || selectedText
      if (!text) return
      let ok = false
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
          ok = true
        }
      } catch {
        ok = false
      }
      if (!ok) {
        // Fallback for webviews that block the async clipboard API
        try {
          const textarea = document.createElement('textarea')
          textarea.value = text
          textarea.style.position = 'fixed'
          textarea.style.top = '-1000px'
          textarea.style.opacity = '0'
          document.body.appendChild(textarea)
          textarea.select()
          ok = document.execCommand('copy')
          textarea.remove()
        } catch {
          ok = false
        }
      }
      if (ok) {
        toast.push({
          title: 'Copied',
          description: `${text.length} character${text.length === 1 ? '' : 's'} copied to clipboard.`,
        })
      } else {
        toast.push({ title: 'Copy failed', description: 'The clipboard could not be accessed.' })
      }
    }, [selectedText, toast])

    // ────────────────────────────────────────────────────────
    // Select an already-uploaded PDF from storage
    // ────────────────────────────────────────────────────────
    const handleSelectExistingFile = useCallback(
      async (files: Array<{ name: string; path: string; size: number; type: string }>) => {
        const file = files[0]
        if (!file) return

        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        if (!isPdf) {
          setPdfError('Please select a PDF file')
          return
        }

        setShowFilePicker(false)
        setPdfLoading(true)
        setPdfError(null)

        try {
          const lib = await loadPdfJs()
          const blob = await downloadFile(file.path)
          const arrayBuf = await blob.arrayBuffer()
          const doc = await lib.getDocument({ data: arrayBuf }).promise
          setPdfDoc(doc)
          setTotalPages(doc.numPages)

          const initialPages: PdfAnnotationPage[] = []
          for (let i = 0; i < doc.numPages; i++) {
            initialPages.push({
              pageNumber: i,
              pdfPageNumber: i + 1,
              strokes: [],
              textAnnotations: [],
              shapes: [],
              stickyNotes: [],
            })
          }
          setPages(initialPages)
          setCurrentPage(0)
          pushHistory(initialPages)

          onChange({
            pdfStoragePath: file.path,
            pages: initialPages,
            currentPage: 0,
            totalPages: doc.numPages,
            zoom: 1,
          })
        } catch (err) {
          setPdfError(err instanceof Error ? err.message : 'Failed to load PDF')
        } finally {
          setPdfLoading(false)
        }
      },
      [onChange, pushHistory]
    )

    // ────────────────────────────────────────────────────────
    // File upload
    // ────────────────────────────────────────────────────────
    const handleFileSelect = useCallback(
      async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.type !== 'application/pdf') {
          setPdfError('Please select a PDF file')
          return
        }
        if (file.size > PDF_ANNOTATION_MAX_FILE_SIZE_BYTES) {
          setPdfError('PDF must be under 50 MB')
          return
        }

        setPdfLoading(true)
        setPdfError(null)
        try {
          const folderPath = 'pdf-annotations'
          const result = await uploadFile(file, folderPath, {
            maxFileSizeBytes: PDF_ANNOTATION_MAX_FILE_SIZE_BYTES,
          })
          if (result.file.name !== file.name) {
            toast.push({
              title: 'Filename adjusted',
              description: `Stored as "${result.file.name}" for compatibility.`,
            })
          }
          const storagePath = result.path

          // Initialize annotation data
          const lib = await loadPdfJs()
          const arrayBuf = await file.arrayBuffer()
          const doc = await lib.getDocument({ data: arrayBuf }).promise
          setPdfDoc(doc)
          setTotalPages(doc.numPages)

          const initialPages: PdfAnnotationPage[] = []
          for (let i = 0; i < doc.numPages; i++) {
            initialPages.push({
              pageNumber: i,
              pdfPageNumber: i + 1,
              strokes: [],
              textAnnotations: [],
              shapes: [],
              stickyNotes: [],
            })
          }
          setPages(initialPages)
          setCurrentPage(0)
          pushHistory(initialPages)

          onChange({
            pdfStoragePath: storagePath,
            pages: initialPages,
            currentPage: 0,
            totalPages: doc.numPages,
            zoom: 1,
          })
        } catch (err) {
          setPdfError(err instanceof Error ? err.message : 'Upload failed')
        } finally {
          setPdfLoading(false)
        }
      },
      [onChange, pushHistory, toast]
    )

    // ────────────────────────────────────────────────────────
    // Export annotated PDF
    // ────────────────────────────────────────────────────────
    const handleExportPdf = useCallback(async () => {
      if (!pdfDoc && !pages.some(p => p.isBlank)) return
      try {
        const { jsPDF } = await import('jspdf')
        const exportScale = 2

        // Determine page dimensions from the first non-blank page or use A4 defaults
        const firstRealPage = pages.find(p => !p.isBlank && p.pdfPageNumber)
        let defaultW = 595 * exportScale
        let defaultH = 842 * exportScale
        if (firstRealPage && pdfDoc) {
          const fp = await pdfDoc.getPage(firstRealPage.pdfPageNumber!)
          const fvp = fp.getViewport({ scale: exportScale })
          defaultW = fvp.width
          defaultH = fvp.height
        }

        const firstPageW = (viewRotation === 90 || viewRotation === 270) ? defaultH : defaultW
        const firstPageH = (viewRotation === 90 || viewRotation === 270) ? defaultW : defaultH
        const pdf = new jsPDF({
          orientation: firstPageW > firstPageH ? 'landscape' : 'portrait',
          unit: 'px',
          format: [firstPageW, firstPageH],
        })

        for (let i = 0; i < pages.length; i++) {
          const pageData = pages[i]
          const pageAnnot = getPageAnnotations(i)

          let canvasW = defaultW
          let canvasH = defaultH
          const tempCanvas = document.createElement('canvas')
          const tempCtx = tempCanvas.getContext('2d')!

          if (pageData.isBlank) {
            canvasW = naturalWidth > 0 ? Math.round(naturalWidth * exportScale) : defaultW
            canvasH = naturalHeight > 0 ? Math.round(naturalHeight * exportScale) : defaultH
            tempCanvas.width = canvasW
            tempCanvas.height = canvasH
            tempCtx.fillStyle = '#ffffff'
            tempCtx.fillRect(0, 0, canvasW, canvasH)
          } else if (pdfDoc && pageData.pdfPageNumber) {
            const page = await pdfDoc.getPage(pageData.pdfPageNumber)
            const viewport = page.getViewport({ scale: exportScale })
            canvasW = viewport.width
            canvasH = viewport.height
            tempCanvas.width = canvasW
            tempCanvas.height = canvasH
            await page.render({ canvasContext: tempCtx, viewport }).promise
          } else {
            tempCanvas.width = canvasW
            tempCanvas.height = canvasH
          }

          if (i > 0) {
            const pageW = (viewRotation === 90 || viewRotation === 270) ? canvasH : canvasW
            const pageH = (viewRotation === 90 || viewRotation === 270) ? canvasW : canvasH
            pdf.addPage([pageW, pageH], pageW > pageH ? 'landscape' : 'portrait')
          }

          // Render strokes
          for (const stroke of pageAnnot.strokes) {
            renderStrokeToCtx(tempCtx, stroke, exportScale)
          }
          // Render shapes
          for (const shape of pageAnnot.shapes) {
            drawShape(tempCtx, shape, exportScale)
          }
          // Render text annotations
          for (const ta of pageAnnot.textAnnotations) {
            tempCtx.save()
            tempCtx.font = `${ta.italic ? 'italic ' : ''}${ta.bold ? 'bold ' : ''}${ta.fontSize * exportScale}px ${ta.fontFamily ?? 'sans-serif'}`
            tempCtx.fillStyle = ta.color
            wrapTextAnnotationLines(ta, ta.width).forEach((line, li) => {
              tempCtx.fillText(line, textLineDrawX(tempCtx, ta, line, exportScale), (ta.y + ta.fontSize + li * ta.fontSize * TEXT_LINE_HEIGHT) * exportScale)
            })
            tempCtx.restore()
          }
          // Render sticky notes (non-collapsed)
          for (const sn of (pageAnnot.stickyNotes ?? [])) {
            if (sn.collapsed) continue
            tempCtx.save()
            const sx = sn.x * exportScale
            const sy = sn.y * exportScale
            const sw = sn.width * exportScale
            const sh = sn.height * exportScale
            tempCtx.fillStyle = STICKY_COLORS[sn.color]
            tempCtx.fillRect(sx, sy, sw, sh)
            tempCtx.strokeStyle = 'rgba(0,0,0,0.15)'
            tempCtx.lineWidth = 1
            tempCtx.strokeRect(sx, sy, sw, sh)
            // Header bar
            tempCtx.fillStyle = 'rgba(0,0,0,0.1)'
            tempCtx.fillRect(sx, sy, sw, 18 * exportScale / 2)
            // Text
            tempCtx.fillStyle = '#1a1a1a'
            tempCtx.font = `${11 * exportScale / 2}px sans-serif`
            sn.text.split('\n').slice(0, 6).forEach((line, li) => {
              tempCtx.fillText(line, sx + 6, sy + 24 + li * 15 * exportScale / 2, sw - 12)
            })
            tempCtx.restore()
          }

          // Apply viewRotation if needed: composite tempCanvas into a rotated finalCanvas
          let exportCanvas = tempCanvas
          let exportW = canvasW
          let exportH = canvasH
          if (viewRotation !== 0) {
            const rotated = document.createElement('canvas')
            if (viewRotation === 90 || viewRotation === 270) {
              rotated.width = canvasH
              rotated.height = canvasW
              exportW = canvasH
              exportH = canvasW
            } else {
              rotated.width = canvasW
              rotated.height = canvasH
            }
            const rCtx = rotated.getContext('2d')!
            rCtx.save()
            switch (viewRotation) {
              case 90:
                rCtx.translate(canvasH, 0)
                rCtx.rotate(Math.PI / 2)
                break
              case 180:
                rCtx.translate(canvasW, canvasH)
                rCtx.rotate(Math.PI)
                break
              case 270:
                rCtx.translate(0, canvasW)
                rCtx.rotate(-Math.PI / 2)
                break
            }
            rCtx.drawImage(tempCanvas, 0, 0)
            rCtx.restore()
            exportCanvas = rotated
          }

          const imgData = exportCanvas.toDataURL('image/png')
          pdf.addImage(imgData, 'PNG', 0, 0, exportW, exportH)
          tempCanvas.remove()
          if (exportCanvas !== tempCanvas) exportCanvas.remove()
        }

        pdf.save('annotated.pdf')
      } catch (err) {
        console.error('PDF export failed:', err)
      }
    }, [pdfDoc, pages, getPageAnnotations, naturalWidth, naturalHeight, viewRotation])

    // ────────────────────────────────────────────────────────
    // Tool buttons
    // ────────────────────────────────────────────────────────
    const tools: { id: PdfTool; icon: typeof Pen; label: string }[] = [
      { id: 'select', icon: MousePointer2, label: 'Select (S)' },
      { id: 'pan', icon: Hand, label: 'Pan / move view — or drag with two fingers (G)' },
      { id: 'pen', icon: Pen, label: 'Pen (P)' },
      { id: 'highlighter', icon: Highlighter, label: 'Highlighter (H)' },
      { id: 'eraser', icon: Eraser, label: 'Eraser (E)' },
      { id: 'text', icon: Type, label: 'Text (T)' },
      { id: 'rectangle', icon: Square, label: 'Rectangle (R)' },
      { id: 'circle', icon: Circle, label: 'Circle (C)' },
      { id: 'arrow', icon: ArrowUpRight, label: 'Arrow (A)' },
      { id: 'line', icon: Minus, label: 'Line (L)' },
      { id: 'sticky', icon: StickyNoteIcon, label: 'Sticky Note (N)' },
      { id: 'textselect', icon: TextCursor, label: 'Select PDF Text (I)' },
    ]

    // ────────────────────────────────────────────────────────
    // Touch-adaptive control styling
    // ────────────────────────────────────────────────────────
    /** Icons are drawn larger when fingers, not cursors, do the tapping. */
    const toolIconSize = touchUI ? 20 : 16

    /** Icon-only toggle (tools, undo/redo, zoom…). 44px targets on touch. */
    const iconButtonClass = (active: boolean) =>
      `flex shrink-0 items-center justify-center rounded-lg transition-colors touch-manipulation focus-ring ${
        touchUI ? 'h-10 w-10' : 'h-8 w-8'
      } ${
        active
          ? 'bg-[var(--accent-light)] text-accent shadow-[inset_0_0_0_1px_var(--accent-light)]'
          : 'text-muted hover:bg-surface-hover hover:text-foreground'
      }`

    /** Labelled toggle (Export, Find, Fill…). */
    const chipButtonClass = (active: boolean) =>
      `flex shrink-0 items-center gap-1.5 rounded-lg transition-colors touch-manipulation focus-ring ${
        touchUI ? 'h-10 px-3 text-sm' : 'h-8 px-2.5 text-xs'
      } ${
        active
          ? 'bg-[var(--accent-light)] text-accent shadow-[inset_0_0_0_1px_var(--accent-light)]'
          : 'text-muted hover:bg-surface-hover hover:text-foreground'
      }`

    /** Divider between control groups. */
    const divider = (
      <div className={`mx-0.5 shrink-0 bg-border ${touchUI ? 'h-7 w-px' : 'h-5 w-px'}`} />
    )

    const handleToolSelect = (next: PdfTool) => {
      if (next !== tool) haptic(next === 'eraser' ? 12 : 6)
      setTool(next)
      // The text-selection tool implies the text layer is enabled
      if (next === 'textselect') setShowTextLayer(true)
      // Leaving the text-selection tool restores drawing input on the canvas
      if (next !== 'textselect' && showTextLayer) setSelectedId(null)
    }

    /** Contextual toggles that only make sense for the active tool. */
    const toolOptions = (
      <>
        {(tool === 'rectangle' || tool === 'circle') && (
          <button
            title={shapeFilled ? 'Filled (tap to unfill)' : 'No fill (tap to fill)'}
            onClick={() => setShapeFilled(v => !v)}
            className={chipButtonClass(shapeFilled)}
          >
            Fill
          </button>
        )}
        {tool === 'arrow' && (
          <button
            title={doubleEndedArrow ? 'Double-headed (tap for single)' : 'Single arrow (tap for double)'}
            onClick={() => setDoubleEndedArrow(v => !v)}
            className={`${chipButtonClass(doubleEndedArrow)} text-base`}
          >
            ↔
          </button>
        )}
      </>
    )

    const drawingToolButtons = (
      <>
        {tools.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              title={t.label}
              aria-label={t.label}
              aria-pressed={tool === t.id}
              onClick={() => handleToolSelect(t.id)}
              className={iconButtonClass(tool === t.id)}
            >
              <Icon size={toolIconSize} />
            </button>
          )
        })}
      </>
    )

    /**
     * Compact square button used by the text/shape formatting bars.
     *
     * Every one of these uses `onPointerDown` + `preventDefault()`: a finger tap
     * would otherwise move focus out of the textarea and end the edit session
     * before the click was ever registered.
     */
    const formatButtonClass = (active: boolean) =>
      `flex shrink-0 items-center justify-center rounded-lg transition-colors touch-manipulation focus-ring ${
        touchUI ? 'h-10 w-10' : 'h-7 w-7'
      } ${
        active
          ? 'bg-[var(--accent-light)] text-accent'
          : 'text-muted hover:bg-surface-hover hover:text-foreground'
      }`

    /** `onPointerDown` handler that keeps focus (and the edit session) in place. */
    const tap = (action: () => void) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      action()
    }

    const fontFamilyOptions: Array<{ value: string; label: string }> = [
      { value: 'sans-serif', label: 'Sans' },
      { value: 'serif', label: 'Serif' },
      { value: 'monospace', label: 'Mono' },
    ]

    /** Fully-featured formatting controls for the text box being edited. */
    const editingTextControls = editingText ? (
      <>
        <button
          type="button"
          onPointerDown={tap(() => updateEditingText({ bold: !editingText.bold }))}
          title="Bold (Ctrl/Cmd+B)"
          aria-label="Bold"
          className={formatButtonClass(!!editingText.bold)}
        >
          <Bold size={touchUI ? 18 : 13} />
        </button>
        <button
          type="button"
          onPointerDown={tap(() => updateEditingText({ italic: !editingText.italic }))}
          title="Italic (Ctrl/Cmd+I)"
          aria-label="Italic"
          className={formatButtonClass(!!editingText.italic)}
        >
          <Italic size={touchUI ? 18 : 13} />
        </button>
        {divider}
        {(['left', 'center', 'right'] as const).map(align => {
          const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight
          return (
            <button
              key={align}
              type="button"
              onPointerDown={tap(() => updateEditingText({ textAlign: align }))}
              title={`Align ${align}`}
              aria-label={`Align ${align}`}
              className={formatButtonClass((editingText.textAlign ?? 'left') === align)}
            >
              <Icon size={touchUI ? 18 : 13} />
            </button>
          )
        })}
        {divider}
        <button
          type="button"
          onPointerDown={tap(() => adjustEditingFontSize(-2))}
          title="Decrease font size"
          aria-label="Decrease font size"
          className={`${formatButtonClass(false)} ${touchUI ? 'text-xl' : 'px-1.5 text-sm'}`}
        >−</button>
        <span className={`shrink-0 text-center text-muted ${touchUI ? 'min-w-[3rem] text-sm' : 'min-w-[2.5rem] text-[11px]'}`}>
          {editingText.fontSize}px
        </span>
        <button
          type="button"
          onPointerDown={tap(() => adjustEditingFontSize(2))}
          title="Increase font size"
          aria-label="Increase font size"
          className={`${formatButtonClass(false)} ${touchUI ? 'text-xl' : 'px-1.5 text-sm'}`}
        >+</button>
        {divider}
        {COLORS.map(c => (
          <button
            key={c}
            type="button"
            title={`Text colour: ${c}`}
            aria-label={`Text colour ${c}`}
            onPointerDown={tap(() => updateEditingText({ color: c }))}
            className={`shrink-0 rounded-full border-2 transition-transform touch-manipulation ${
              touchUI ? 'h-8 w-8' : 'h-4 w-4'
            } ${editingText.color === c ? 'scale-110 border-foreground' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
        {divider}
        {fontFamilyOptions.map(f => (
          <button
            key={f.value}
            type="button"
            onPointerDown={tap(() => updateEditingText({ fontFamily: f.value }))}
            title={`Font: ${f.label}`}
            className={`${formatButtonClass((editingText.fontFamily ?? 'sans-serif') === f.value)} ${
              touchUI ? 'px-3 text-sm' : 'px-1.5 text-[11px]'
            }`}
          >
            {f.label}
          </button>
        ))}
        {divider}
        <button
          type="button"
          onPointerDown={tap(() => deleteTextAnnotation(editingText.id))}
          title="Delete text box"
          aria-label="Delete text box"
          className={`${formatButtonClass(false)} shrink-0 text-danger hover:bg-[var(--danger-light)]`}
        >
          <Trash2 size={touchUI ? 18 : 13} />
        </button>
        {/* Explicit commit — on touch there is no reliable blur to fall back on */}
        <button
          type="button"
          onPointerDown={tap(() => commitText())}
          title="Done (Esc)"
          aria-label="Done editing text"
          className={`flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent)] font-medium text-[var(--accent-foreground)] shadow-glow-sm transition-all hover:brightness-110 touch-manipulation ${
            touchUI ? 'h-10 px-4 text-sm' : 'h-7 px-2.5 text-xs'
          }`}
        >
          <Check size={touchUI ? 18 : 13} />
          Done
        </button>
      </>
    ) : null

    /** Formatting controls for the text annotation selected with the Select tool. */
    const selectedTextControls = (ta: TextAnnotation) => (
      <>
        <button
          type="button"
          onPointerDown={tap(() => startEditingText(ta))}
          title="Edit text"
          aria-label="Edit text"
          className={formatButtonClass(false)}
        >
          <Pencil size={touchUI ? 18 : 13} />
        </button>
        {divider}
        <button
          type="button"
          onPointerDown={tap(() => toggleTextBold(ta.id))}
          title="Bold"
          aria-label="Bold"
          className={formatButtonClass(!!ta.bold)}
        >
          <Bold size={touchUI ? 18 : 13} />
        </button>
        <button
          type="button"
          onPointerDown={tap(() => toggleTextItalic(ta.id))}
          title="Italic"
          aria-label="Italic"
          className={formatButtonClass(!!ta.italic)}
        >
          <Italic size={touchUI ? 18 : 13} />
        </button>
        {divider}
        {(['left', 'center', 'right'] as const).map(align => {
          const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight
          return (
            <button
              key={align}
              type="button"
              onPointerDown={tap(() => changeTextAlign(ta.id, align))}
              title={`Align ${align}`}
              aria-label={`Align ${align}`}
              className={formatButtonClass((ta.textAlign ?? 'left') === align)}
            >
              <Icon size={touchUI ? 18 : 13} />
            </button>
          )
        })}
        {divider}
        <button
          type="button"
          onPointerDown={tap(() => changeTextFontSize(ta.id, -2))}
          title="Decrease font size"
          aria-label="Decrease font size"
          className={`${formatButtonClass(false)} ${touchUI ? 'text-xl' : 'px-1.5 text-sm'}`}
        >−</button>
        <span className={`shrink-0 text-center text-muted ${touchUI ? 'min-w-[3rem] text-sm' : 'min-w-[2.5rem] text-[11px]'}`}>
          {ta.fontSize}px
        </span>
        <button
          type="button"
          onPointerDown={tap(() => changeTextFontSize(ta.id, 2))}
          title="Increase font size"
          aria-label="Increase font size"
          className={`${formatButtonClass(false)} ${touchUI ? 'text-xl' : 'px-1.5 text-sm'}`}
        >+</button>
        {divider}
        {COLORS.map(c => (
          <button
            key={c}
            type="button"
            title={`Text colour: ${c}`}
            aria-label={`Text colour ${c}`}
            onPointerDown={tap(() => changeTextColor(ta.id, c))}
            className={`shrink-0 rounded-full border-2 transition-transform touch-manipulation ${
              touchUI ? 'h-8 w-8' : 'h-4 w-4'
            } ${ta.color === c ? 'scale-110 border-foreground' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
        {divider}
        {fontFamilyOptions.map(f => (
          <button
            key={f.value}
            type="button"
            onPointerDown={tap(() => changeTextFontFamily(ta.id, f.value))}
            title={`Font: ${f.label}`}
            className={`${formatButtonClass((ta.fontFamily ?? 'sans-serif') === f.value)} ${
              touchUI ? 'px-3 text-sm' : 'px-1.5 text-[11px]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </>
    )

    /** Formatting controls for the shape selected with the Select tool. */
    const selectedShapeControls = (shape: ShapeAnnotation) => (
      <>
        {(shape.type === 'rectangle' || shape.type === 'circle') && (
          <button
            type="button"
            onPointerDown={tap(() => {
              const newPages = updatePageAnnotations(currentPage, page => ({
                ...page,
                shapes: page.shapes.map(s => (s.id === shape.id ? { ...s, filled: !s.filled } : s)),
              }))
              setPages(newPages)
              pushHistory(newPages)
              emitChange(newPages)
            })}
            title={shape.filled ? 'Remove fill' : 'Add fill'}
            className={chipButtonClass(!!shape.filled)}
          >
            Fill
          </button>
        )}
        {shape.type === 'arrow' && (
          <button
            type="button"
            onPointerDown={tap(() => {
              const newPages = updatePageAnnotations(currentPage, page => ({
                ...page,
                shapes: page.shapes.map(s => (s.id === shape.id ? { ...s, doubleEnded: !s.doubleEnded } : s)),
              }))
              setPages(newPages)
              pushHistory(newPages)
              emitChange(newPages)
            })}
            title={shape.doubleEnded ? 'Single arrow' : 'Double-headed arrow'}
            className={`${chipButtonClass(!!shape.doubleEnded)} text-base`}
          >
            ↔
          </button>
        )}
        <button
          type="button"
          onPointerDown={tap(() => {
            const newPages = updatePageAnnotations(currentPage, page => ({
              ...page,
              shapes: page.shapes.filter(s => s.id !== shape.id),
            }))
            setPages(newPages)
            pushHistory(newPages)
            emitChange(newPages)
            setSelectedId(null)
          })}
          title="Delete shape"
          aria-label="Delete shape"
          className={formatButtonClass(false) + ' text-danger hover:bg-[var(--danger-light)]'}>
          <Trash2 size={touchUI ? 18 : 13} />
        </button>
      </>
    )

    /**
     * Content of the contextual touch dock, resolved from the current mode so it
     * always shows exactly the controls that apply right now:
     * text editing → selection formatting → drawing tools.
     */
    const touchDockContent = (() => {
      const row = (children: React.ReactNode) => (
        <div className="toolbar-scroll scrollbar-hide flex h-full items-center gap-1.5 px-2.5">
          {children}
        </div>
      )

      if (editingText) return row(editingTextControls)

      if (tool === 'select' && selectedId) {
        const pageAnnot = getPageAnnotations(currentPage)
        const ta = pageAnnot.textAnnotations.find(t => t.id === selectedId)
        if (ta) return row(selectedTextControls(ta))
        const shape = pageAnnot.shapes.find(s => s.id === selectedId)
        if (shape) return row(selectedShapeControls(shape))
      }

      return (
        <div className="flex h-full items-center">
          {/* Tool row scrolls under a fade; the Style chip stays pinned at the end */}
          <div className="relative min-w-0 flex-1">
            <div className="toolbar-scroll scrollbar-hide flex h-full items-center gap-1.5 pl-2 pr-6">
              {drawingToolButtons}
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-[var(--glass-bg-strong)] to-transparent"
              aria-hidden
            />
          </div>
          {(tool === 'rectangle' || tool === 'circle' || tool === 'arrow') && (
            <div className="flex shrink-0 items-center gap-1">{toolOptions}</div>
          )}
          <div className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => setMobileStyleOpen(v => !v)}
            aria-expanded={mobileStyleOpen}
            aria-haspopup="dialog"
            title="Colour and size"
            className={chipButtonClass(mobileStyleOpen) + ' mr-2 shrink-0 gap-1.5 px-2.5'}
          >
            <span className="h-4 w-4 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: color }} />
            <span className="tabular-nums">{strokeSize}</span>
            <span>Style</span>
            <ChevronUp size={13} className={mobileStyleOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        </div>
      )
    })()

    // ────────────────────────────────────────────────────────
    // Chrome: grouped tool palette, style popovers, side panel, property bar
    // ────────────────────────────────────────────────────────
    /** Compact top-bar controls (the touch dock keeps the 44px variants). */
    const barIconButtonClass = (active: boolean) =>
      [
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-ring max-sm:h-7 max-sm:w-7',
        active
          ? 'bg-[var(--accent-light)] text-accent'
          : 'text-muted hover:bg-surface-hover hover:text-foreground',
      ].join(' ')

    const barChipClass = (active: boolean) =>
      [
        'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors focus-ring',
        active
          ? 'bg-[var(--accent-light)] text-accent'
          : 'text-muted hover:bg-surface-hover hover:text-foreground',
      ].join(' ')

    const metaLabel = 'text-[11px] font-medium uppercase tracking-[0.08em] text-muted'
    const barDivider = <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />

    /** Tool palette groups: navigate · ink · mark-up · PDF text. */
    const toolGroupIds: PdfTool[][] = [
      ['select', 'pan'],
      ['pen', 'highlighter', 'eraser'],
      ['text', 'rectangle', 'circle', 'arrow', 'line', 'sticky'],
      ['textselect'],
    ]

    const renderBarToolButton = (t: { id: PdfTool; icon: typeof Pen; label: string }) => {
      const Icon = t.icon
      return (
        <button
          key={t.id}
          type="button"
          title={t.label}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          onClick={() => handleToolSelect(t.id)}
          className={barIconButtonClass(tool === t.id)}
        >
          <Icon size={16} />
        </button>
      )
    }

    const groupedToolButtons = toolGroupIds.map((group, gi) => (
      <React.Fragment key={gi}>
        {gi > 0 && <div className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />}
        <div className="flex items-center gap-0.5">
          {group.map(id => renderBarToolButton(tools.find(t => t.id === id)!))}
        </div>
      </React.Fragment>
    ))

    const toolLabel = (tools.find(t => t.id === tool)?.label ?? tool).replace(/\s*\(.*\)$/, '')

    type SelectedAnnotation =
      | { kind: 'text'; text: TextAnnotation }
      | { kind: 'shape'; shape: ShapeAnnotation }
      | { kind: 'sticky'; sticky: StickyNoteAnnotation }
      | { kind: 'stroke'; stroke: PdfStroke }

    const selectedAnnotation: SelectedAnnotation | null = (() => {
      if (!selectedId) return null
      const pageAnnot = getPageAnnotations(currentPage)
      const text = pageAnnot.textAnnotations.find(t => t.id === selectedId)
      if (text) return { kind: 'text', text }
      const shape = pageAnnot.shapes.find(s => s.id === selectedId)
      if (shape) return { kind: 'shape', shape }
      const sticky = (pageAnnot.stickyNotes ?? []).find(sn => sn.id === selectedId)
      if (sticky) return { kind: 'sticky', sticky }
      const stroke = pageAnnot.strokes.find(s => s.id === selectedId)
      if (stroke) return { kind: 'stroke', stroke }
      return null
    })()

    type AnnotationListKind = 'stroke' | 'text' | 'shape' | 'sticky'
    type AnnotationListItem = {
      id: string
      kind: AnnotationListKind
      label: string
      meta: string
      icon: typeof Pen
    }

    /** Every annotation across all pages, grouped by page, for the side panel. */
    const annotationGroups = pages
      .map(pg => {
        const items: AnnotationListItem[] = [
          ...pg.strokes.map(stroke => ({
            id: stroke.id,
            kind: 'stroke' as const,
            label: (stroke.tool === 'pen' ? 'Pen' : 'Highlighter') + ' stroke',
            meta: Math.round(stroke.size) + ' px',
            icon: stroke.tool === 'pen' ? Pen : Highlighter,
          })),
          ...pg.textAnnotations.map(ta => ({
            id: ta.id,
            kind: 'text' as const,
            label: (ta.text || 'Empty text box').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Empty text box',
            meta: ta.fontSize + 'px',
            icon: Type,
          })),
          ...pg.shapes.map(shape => ({
            id: shape.id,
            kind: 'shape' as const,
            label: shape.type.charAt(0).toUpperCase() + shape.type.slice(1),
            meta:
              shape.strokeWidth.toFixed(1) +
              'px' +
              (shape.filled ? ' · ' + Math.round((shape.fillOpacity ?? 0.2) * 100) + '% fill' : ''),
            icon:
              shape.type === 'circle'
                ? Circle
                : shape.type === 'arrow'
                ? ArrowUpRight
                : shape.type === 'line'
                ? Minus
                : Square,
          })),
          ...(pg.stickyNotes ?? []).map(note => ({
            id: note.id,
            kind: 'sticky' as const,
            label: (note.text || 'Sticky note').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Sticky note',
            meta: note.color,
            icon: StickyNoteIcon,
          })),
        ]
        return { page: pg, items }
      })
      .filter(group => group.items.length > 0)

    const annotationCount = annotationGroups.reduce((total, group) => total + group.items.length, 0)

    /** Jump to an annotation from the panel and select it. */
    const jumpToAnnotation = (pageNumber: number, item: AnnotationListItem) => {
      if (pageNumber !== currentPage) goToPage(pageNumber)
      if (item.kind !== 'stroke') setTool('select')
      setSelectedId(item.id)
    }

    /** Delete one annotation from any page (used by the panel and the status bar). */
    const deleteAnnotationOnPage = (pageNumber: number, kind: AnnotationListKind, id: string) => {
      const newPages = updatePageAnnotations(pageNumber, page => {
        switch (kind) {
          case 'text':
            return { ...page, textAnnotations: page.textAnnotations.filter(t => t.id !== id) }
          case 'shape':
            return { ...page, shapes: page.shapes.filter(s => s.id !== id) }
          case 'sticky':
            return { ...page, stickyNotes: (page.stickyNotes ?? []).filter(sn => sn.id !== id) }
          default:
            return { ...page, strokes: page.strokes.filter(s => s.id !== id) }
        }
      })
      setPages(newPages)
      pushHistory(newPages)
      emitChange(newPages)
      if (selectedId === id) setSelectedId(null)
    }

    /** Live shape updates from the property bar (commit pushes one history entry). */
    const updateShapeAnnotation = (id: string, updates: Partial<ShapeAnnotation>, commit = false) => {
      const newPages = updatePageAnnotations(currentPage, page => ({
        ...page,
        shapes: page.shapes.map(s => (s.id === id ? { ...s, ...updates } : s)),
      }))
      setPages(newPages)
      if (commit) pushHistory(newPages)
      emitChange(newPages)
    }

    /** Live stroke updates (colour / width) from the property bar. */
    const updateStrokeAnnotation = (id: string, updates: Partial<PdfStroke>, commit = false) => {
      const newPages = updatePageAnnotations(currentPage, page => ({
        ...page,
        strokes: page.strokes.map(s => (s.id === id ? { ...s, ...updates } : s)),
      }))
      setPages(newPages)
      if (commit) pushHistory(newPages)
      emitChange(newPages)
    }

    const toolHints: Partial<Record<PdfTool, string>> = {
      select: 'Select an annotation to edit it · drag to move · Delete to remove',
      pan: 'Drag to pan the page · two fingers to pan & pinch',
      text: 'Click the page to place a text box',
      sticky: 'Click the page to drop a sticky note',
      textselect: 'Drag across PDF text to select and copy it',
    }

    /** Second toolbar row: only the contextual extras the popovers don't cover. */
    const propertyBar = (() => {
      const selection = selectedAnnotation

      if (editingText) {
        return (
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-[var(--surface-sunken)] px-3 py-1.5">
            <span className={metaLabel + ' shrink-0'}>Text box</span>
            <span className="text-xs text-muted">Editing — Esc to finish</span>
            <span className="flex-1" />
            <button
              type="button"
              onPointerDown={tap(() => commitText())}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 text-xs font-medium text-[var(--accent-foreground)] transition-all hover:brightness-110"
            >
              <Check size={13} />
              Done
            </button>
          </div>
        )
      }

      if (selection?.kind === 'text') {
        const ta = selection.text
        return (
          <div className="toolbar-scroll scrollbar-hide flex items-center gap-1 border-t border-border bg-[var(--surface-sunken)] px-3 py-1.5">
            <button type="button" title="Edit text" aria-label="Edit text" onPointerDown={tap(() => startEditingText(ta))} className={formatButtonClass(false)}>
              <Pencil size={14} />
            </button>
            {divider}
            {(['left', 'center', 'right'] as const).map(align => {
              const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight
              return (
                <button key={align} type="button" title={'Align ' + align} aria-label={'Align ' + align} onPointerDown={tap(() => changeTextAlign(ta.id, align))} className={formatButtonClass((ta.textAlign ?? 'left') === align)}>
                  <Icon size={14} />
                </button>
              )
            })}
            {divider}
            <button type="button" title="Decrease font size" aria-label="Decrease font size" onPointerDown={tap(() => changeTextFontSize(ta.id, -2))} className={formatButtonClass(false) + ' text-base'}>−</button>
            <span className="w-10 shrink-0 text-center text-xs tabular-nums text-foreground">{ta.fontSize}px</span>
            <button type="button" title="Increase font size" aria-label="Increase font size" onPointerDown={tap(() => changeTextFontSize(ta.id, 2))} className={formatButtonClass(false) + ' text-base'}>+</button>
            {divider}
            <button type="button" title="Delete text box" aria-label="Delete text box" onPointerDown={tap(() => deleteTextAnnotation(ta.id))} className={formatButtonClass(false) + ' text-danger hover:bg-[var(--danger-light)]'}>
              <Trash2 size={14} />
            </button>
          </div>
        )
      }

      if (selection?.kind === 'shape') {
        const shape = selection.shape
        const supportsFill = shape.type === 'rectangle' || shape.type === 'circle'
        return (
          <div className="toolbar-scroll scrollbar-hide flex items-center gap-1 border-t border-border bg-[var(--surface-sunken)] px-3 py-1.5">
            {supportsFill && (
              <button type="button" title={shape.filled ? 'Remove fill' : 'Add fill'} onPointerDown={tap(() => updateShapeAnnotation(shape.id, { filled: !shape.filled, fillOpacity: shape.fillOpacity ?? fillOpacity }, true))} className={chipButtonClass(!!shape.filled)}>
                Fill
              </button>
            )}
            {supportsFill && shape.filled && (
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                <span>Opacity</span>
                <input type="range" min={0.05} max={1} step={0.05} value={shape.fillOpacity ?? fillOpacity} onChange={e => updateShapeAnnotation(shape.id, { fillOpacity: Number(e.target.value) })} onPointerUp={() => updateShapeAnnotation(shape.id, {}, true)} className="h-1.5 w-24 accent-[var(--accent)]" aria-label="Fill opacity" />
                <span className="w-9 text-center tabular-nums text-foreground">{Math.round((shape.fillOpacity ?? fillOpacity) * 100)}%</span>
              </label>
            )}
            {shape.type === 'arrow' && (
              <button type="button" title={shape.doubleEnded ? 'Single arrow' : 'Double-headed arrow'} onPointerDown={tap(() => updateShapeAnnotation(shape.id, { doubleEnded: !shape.doubleEnded }, true))} className={chipButtonClass(!!shape.doubleEnded) + ' text-base'}>
                ↔
              </button>
            )}
            {divider}
            <button type="button" title="Delete shape" aria-label="Delete shape" onPointerDown={tap(() => deleteAnnotationOnPage(currentPage, 'shape', shape.id))} className={formatButtonClass(false) + ' text-danger hover:bg-[var(--danger-light)]'}>
              <Trash2 size={14} />
            </button>
          </div>
        )
      }

      if (selection?.kind === 'sticky') {
        const note = selection.sticky
        return (
          <div className="toolbar-scroll scrollbar-hide flex items-center gap-1 border-t border-border bg-[var(--surface-sunken)] px-3 py-1.5">
            <span className={metaLabel + ' shrink-0'}>Sticky colour</span>
            {(Object.keys(STICKY_COLORS) as StickyColor[]).map(c => (
              <button key={c} type="button" title={'Sticky colour: ' + c} aria-label={'Sticky colour ' + c} onPointerDown={tap(() => updateStickyNote(note.id, { color: c }, true))} className={['h-6 w-6 shrink-0 rounded-full border-2 transition-transform hover:scale-110', note.color === c ? 'scale-110 border-foreground' : 'border-transparent'].join(' ')} style={{ backgroundColor: STICKY_COLORS[c] }} />
            ))}
            {divider}
            <button type="button" title="Delete sticky note" aria-label="Delete sticky note" onPointerDown={tap(() => deleteStickyNote(note.id))} className={formatButtonClass(false) + ' text-danger hover:bg-[var(--danger-light)]'}>
              <Trash2 size={14} />
            </button>
          </div>
        )
      }

      if (selection?.kind === 'stroke') {
        return (
          <div className="flex items-center gap-1 border-t border-border bg-[var(--surface-sunken)] px-3 py-1.5">
            <span className={metaLabel + ' shrink-0'}>{selection.stroke.tool} stroke</span>
            <span className="text-xs tabular-nums text-muted">{Math.round(selection.stroke.size)} px</span>
            <div className="flex-1" />
            <button type="button" title="Delete stroke" aria-label="Delete stroke" onPointerDown={tap(() => deleteAnnotationOnPage(currentPage, 'stroke', selection.stroke.id))} className={formatButtonClass(false) + ' text-danger hover:bg-[var(--danger-light)]'}>
              <Trash2 size={14} />
            </button>
          </div>
        )
      }

      // Active shape tools expose their own extras (Fill / arrow heads)
      if (tool === 'rectangle' || tool === 'circle') {
        return (
          <div className="flex items-center gap-2 border-t border-border bg-[var(--surface-sunken)] px-3 py-1.5">
            <button type="button" title={shapeFilled ? 'Filled (tap to unfill)' : 'No fill (tap to fill)'} onClick={() => setShapeFilled(v => !v)} className={chipButtonClass(shapeFilled)}>
              Fill
            </button>
            {shapeFilled && (
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                <span>Opacity</span>
                <input type="range" min={0.05} max={1} step={0.05} value={fillOpacity} onChange={e => setFillOpacity(Number(e.target.value))} className="h-1.5 w-24 accent-[var(--accent)]" aria-label="Fill opacity" />
                <span className="w-9 text-center tabular-nums text-foreground">{Math.round(fillOpacity * 100)}%</span>
              </label>
            )}
          </div>
        )
      }

      if (tool === 'arrow') {
        return (
          <div className="flex items-center gap-2 border-t border-border bg-[var(--surface-sunken)] px-3 py-1.5">
            <button type="button" title={doubleEndedArrow ? 'Double-headed (tap for single)' : 'Single arrow (tap for double)'} onClick={() => setDoubleEndedArrow(v => !v)} className={chipButtonClass(doubleEndedArrow) + ' text-base'}>
              ↔ Heads
            </button>
          </div>
        )
      }

      // Pen / highlighter / eraser / text / select / pan: the popovers and the
      // status bar carry everything, so the contextual row stays out of the way.
      return null
    })()

    // ────────────────────────────────────────────────────────
    // RENDER: Upload prompt (no PDF yet)
    // ────────────────────────────────────────────────────────
    if (!value?.pdfStoragePath) {
      return (
        <div className="flex h-full items-center justify-center overflow-y-auto p-4 sm:p-8">
          <div className="glass-card animate-rise-in w-full max-w-xl p-3 sm:p-4">
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-[var(--glass-bg-subtle)] px-6 py-10 text-center sm:py-12">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-light)] text-accent">
                <Upload className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-semibold tracking-[-0.02em] text-foreground">
                Drop a PDF here to annotate
              </h3>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-muted">
                Upload a new file or pick one you&apos;ve already uploaded, then mark it up with
                ink, shapes, text and sticky notes.
              </p>

              {pdfError && (
                <p className="mt-4 w-full rounded-xl border border-[color:var(--danger)] bg-[var(--danger-light)] px-3 py-2 text-sm text-danger">
                  {pdfError}
                </p>
              )}

              <div className="mt-6 flex w-full flex-col items-stretch gap-2.5 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pdfLoading || disabled}
                  className="glass-btn-primary h-11 justify-center gap-2 px-6 text-sm disabled:opacity-50"
                >
                  {pdfLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      Choose a PDF
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowFilePicker(true)}
                  disabled={pdfLoading || disabled}
                  className="glass-btn h-11 justify-center gap-2 px-6 text-sm disabled:opacity-50"
                >
                  <FolderOpen size={16} />
                  Browse uploaded files
                </button>
              </div>

              <p className="mt-5 text-xs text-muted">PDF up to 50 MB · your files stay in your workspace</p>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </div>

          {/* File picker modal */}
          <FileExplorerModal
            isOpen={showFilePicker}
            onClose={() => setShowFilePicker(false)}
            title="Select a PDF"
            onSelectFiles={handleSelectExistingFile}
          />
        </div>
      )
    }

    // ────────────────────────────────────────────────────────
    // RENDER: Loading state
    // ────────────────────────────────────────────────────────
    if (pdfLoading) {
      return (
        <div className="flex h-full flex-col gap-4 p-4 sm:p-6" aria-busy="true" aria-live="polite">
          <div className="glass-card animate-rise-in flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Preparing your PDF…</p>
              <p className="text-xs text-muted">Rendering pages and building the text layer</p>
              <div
                className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
                role="progressbar"
                aria-label="Loading PDF"
                aria-valuetext="Loading"
              >
                <div className="h-full w-1/3 animate-pulse-soft rounded-full bg-[var(--accent)]" />
              </div>
            </div>
          </div>
          <div className="glass-card flex flex-1 items-start justify-center p-4">
            <div className="skeleton-shimmer h-full max-h-[620px] w-full max-w-[440px] rounded-xl" />
          </div>
        </div>
      )
    }

    if (pdfError) {
      return (
        <div className="flex h-full items-center justify-center p-4 sm:p-8">
          <div className="glass-card animate-rise-in w-full max-w-md p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--danger-light)] text-danger">
              <X className="h-5 w-5" />
            </div>
            <h3 className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
              Couldn&apos;t open this PDF
            </h3>
            <p className="mt-1.5 text-sm leading-6 text-muted">{pdfError}</p>
            <button
              onClick={() => { setPdfError(null); setPdfLoading(false) }}
              className="glass-btn-primary mx-auto mt-5 h-10 gap-2 px-5 text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }

    // ────────────────────────────────────────────────────────
    // RENDER: Main editor
    // ────────────────────────────────────────────────────────
    return (
      <div ref={containerRef} className="relative flex h-full min-h-0 flex-col bg-transparent text-foreground" tabIndex={-1}>
        {/* ── Single glass top bar ─────────────────────────────── */}
        <div className="shrink-0 border-b border-border bg-[var(--glass-bg)] backdrop-blur-2xl">
          <div className="toolbar-scroll scrollbar-hide flex items-center gap-0.5 px-2 py-1.5 sm:gap-1">
            {/* Grouped tool palette (narrow screens keep it in the bottom dock) */}
            <div className="hidden shrink-0 items-center gap-0.5 rounded-xl border border-border bg-surface px-1 py-0.5 sm:flex">
              {groupedToolButtons}
            </div>

            {/* Colour popover */}
            <div className="relative hidden shrink-0 sm:block" onPointerDown={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenPopover(p => (p === 'color' ? null : 'color'))}
                aria-label="Stroke and text colour"
                aria-expanded={openPopover === 'color'}
                aria-haspopup="dialog"
                title="Colour"
                className={barChipClass(openPopover === 'color')}
              >
                <span className="h-4 w-4 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: color }} />
                <span className="hidden 2xl:inline">Colour</span>
              </button>
              {openPopover === 'color' && (
                <div className="floating-pop-in glass-strong absolute left-0 top-full z-50 mt-2 w-max rounded-2xl p-2.5">
                  <p className={metaLabel}>Colour</p>
                  <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                    {COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        title={c}
                        aria-label={'Colour ' + c}
                        onClick={() => { setColor(c); setOpenPopover(null) }}
                        className={['h-7 w-7 rounded-full border-2 transition-transform hover:scale-110', color === c ? 'scale-110 border-foreground' : 'border-transparent'].join(' ')}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Size popover */}
            <div className="relative hidden shrink-0 sm:block" onPointerDown={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenPopover(p => (p === 'size' ? null : 'size'))}
                aria-label="Stroke size"
                aria-expanded={openPopover === 'size'}
                aria-haspopup="dialog"
                title="Stroke size"
                className={barChipClass(openPopover === 'size')}
              >
                <span className="text-[11px] tabular-nums">{strokeSize}px</span>
              </button>
              {openPopover === 'size' && (
                <div className="floating-pop-in glass-strong absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <p className={metaLabel}>Stroke size</p>
                    <span className="text-xs tabular-nums text-foreground">{strokeSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={strokeSize}
                    onChange={e => setStrokeSize(Number(e.target.value))}
                    className="mt-2 w-full accent-[var(--accent)]"
                    aria-label="Stroke size"
                  />
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {[1, 3, 6, 12].map(size => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setStrokeSize(size)}
                        className={['rounded-lg border px-1 py-1 text-[11px] tabular-nums transition-colors', strokeSize === size ? 'border-[color:var(--accent)] bg-[var(--accent-light)] text-accent' : 'border-border text-muted hover:bg-surface-hover hover:text-foreground'].join(' ')}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden sm:block">{barDivider}</div>

            {/* Undo / redo */}
            <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo} disabled={historyIdx <= 0} className={barIconButtonClass(false) + ' hidden disabled:opacity-30 sm:flex'}>
              <Undo2 size={16} />
            </button>
            <button type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redo} disabled={historyIdx >= history.length - 1} className={barIconButtonClass(false) + ' hidden disabled:opacity-30 sm:flex'}>
              <Redo2 size={16} />
            </button>

            <div className="min-w-2 flex-1" />

            {/* Page navigation — always visible */}
            <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-border bg-surface px-1 py-0.5" role="group" aria-label="Page navigation">
              <button type="button" title="Previous page (←)" aria-label="Previous page" onClick={() => goToPage(Math.max(0, currentPage - 1))} disabled={currentPage <= 0} className={barIconButtonClass(false) + ' disabled:opacity-30'}>
                <ChevronLeft size={16} />
              </button>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Page number"
                title="Jump to page"
                value={pageInput}
                onChange={e => setPageInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitPageInput(); e.currentTarget.blur() }
                  if (e.key === 'Escape') { setPageInput(String(currentPage + 1)); e.currentTarget.blur() }
                }}
                onBlur={commitPageInput}
                onFocus={e => e.currentTarget.select()}
                className="h-7 w-7 rounded-md border border-border bg-[var(--surface-sunken)] text-center text-xs tabular-nums text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-[color:var(--accent-light)] sm:w-9"
              />
              <span className="hidden px-0.5 text-xs tabular-nums text-muted sm:inline">/ {totalPages}</span>
              <button type="button" title="Next page (→)" aria-label="Next page" onClick={() => goToPage(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1} className={barIconButtonClass(false) + ' disabled:opacity-30'}>
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Zoom cluster — always visible */}
            <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-border bg-surface px-1 py-0.5" role="group" aria-label="Zoom" onPointerDown={e => e.stopPropagation()}>
              <button type="button" title="Zoom out" aria-label="Zoom out" onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM} className={barIconButtonClass(false) + ' disabled:opacity-30'}>
                <ZoomOut size={16} />
              </button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.05}
                value={zoom}
                onChange={handleZoomSlider}
                aria-label="Zoom level"
                title={'Zoom: ' + Math.round(zoom * 100) + '%'}
                className="hidden h-1.5 w-20 accent-[var(--accent)] xl:block"
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenPopover(p => (p === 'zoom' ? null : 'zoom'))}
                  aria-label="Zoom level"
                  aria-expanded={openPopover === 'zoom'}
                  aria-haspopup="dialog"
                  title="Zoom"
                  className="min-w-[2.5rem] rounded-md px-0.5 py-1 text-center text-xs tabular-nums text-foreground transition-colors hover:bg-surface-hover focus-ring sm:min-w-[3rem] sm:px-1"
                >
                  {Math.round(zoom * 100)}%
                </button>
                {openPopover === 'zoom' && (
                  <div className="floating-pop-in glass-strong absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-2xl p-3 shadow-glass-lg">
                    <div className="flex items-center justify-between">
                      <p className={metaLabel}>Zoom</p>
                      <span className="text-xs tabular-nums text-foreground">{Math.round(zoom * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={MIN_ZOOM}
                      max={MAX_ZOOM}
                      step={0.05}
                      value={zoom}
                      onChange={handleZoomSlider}
                      aria-label="Zoom level"
                      className="mt-2 w-full accent-[var(--accent)]"
                    />
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {[0.5, 1, 1.5, 2].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => applyZoomPreset(preset)}
                          className={['rounded-lg border px-1 py-1 text-[11px] tabular-nums transition-colors', Math.abs(zoom - preset) < 0.01 ? 'border-[color:var(--accent)] bg-[var(--accent-light)] text-accent' : 'border-border text-muted hover:bg-surface-hover hover:text-foreground'].join(' ')}
                        >
                          {preset * 100}%
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <button type="button" onClick={() => { handleFitPage(); setOpenPopover(null) }} className="glass-btn h-8 text-[11px]">
                        Fit page
                      </button>
                      <button type="button" onClick={() => { handleFitWidth(); setOpenPopover(null) }} className="glass-btn h-8 text-[11px]">
                        Fit width
                      </button>
                    </div>
                    <button type="button" onClick={() => { handleZoomReset(); setOpenPopover(null) }} className="glass-btn mt-1.5 h-8 w-full text-[11px]">
                      Actual size (100%)
                    </button>
                  </div>
                )}
              </div>
              <button type="button" title="Zoom in" aria-label="Zoom in" onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM} className={barIconButtonClass(false) + ' disabled:opacity-30'}>
                <ZoomIn size={16} />
              </button>
              <button type="button" title="Fit to page" aria-label="Fit to page" onClick={handleFitPage} className={barIconButtonClass(false) + ' hidden sm:flex'}>
                <Maximize size={15} />
              </button>
            </div>

            <div className="hidden sm:block">{barDivider}</div>

            {/* Search */}
            <button type="button" title="Find in PDF (Ctrl+F)" aria-label="Find in PDF" aria-pressed={searchVisible} onClick={() => { setSearchVisible(v => { if (!v) setSearchQuery(''); return true }) }} className={barIconButtonClass(searchVisible)}>
              <Search size={16} />
            </button>

            {/* PDF text layer */}
            <button
              type="button"
              title={showTextLayer ? 'Hide PDF text layer' : 'Select & copy PDF text'}
              aria-label="PDF text layer"
              aria-pressed={showTextLayer}
              onClick={() => {
                if (showTextLayer) {
                  setShowTextLayer(false)
                  setTool(t => (t === 'textselect' ? 'select' : t))
                  setSearchVisible(false)
                  setSearchQuery('')
                  if (selectedTextRef.current) {
                    selectedTextRef.current = ''
                    setSelectedText('')
                  }
                } else {
                  // Showing the layer implies the text-selection tool, otherwise it is not usable
                  setShowTextLayer(true)
                  setTool('textselect')
                  setSelectedId(null)
                }
              }}
              className={barIconButtonClass(showTextLayer) + ' hidden sm:flex'}
            >
              <Layers size={16} />
            </button>

            {/* Side panel toggles */}
            <button
              type="button"
              title="Page thumbnails"
              aria-label="Toggle page thumbnails"
              aria-pressed={showThumbnails && panelTab === 'pages'}
              onClick={() => {
                setPanelTab('pages')
                setShowThumbnails(v => (panelTab === 'pages' ? !v : true))
              }}
              className={barIconButtonClass(showThumbnails && panelTab === 'pages')}
            >
              <PanelLeft size={16} />
            </button>
            <button
              type="button"
              title="Annotations list"
              aria-label="Toggle annotations panel"
              aria-pressed={showThumbnails && panelTab === 'annotations'}
              onClick={() => {
                setPanelTab('annotations')
                setShowThumbnails(v => (panelTab === 'annotations' ? !v : true))
              }}
              className={barIconButtonClass(showThumbnails && panelTab === 'annotations')}
            >
              <List size={16} />
            </button>

            {/* Export */}
            <button type="button" title="Export annotated PDF" onClick={handleExportPdf} className="glass-btn-primary ml-0.5 h-8 shrink-0 gap-1.5 px-3 text-xs">
              <Download size={14} />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>

          <div className="hidden sm:block">{propertyBar}</div>
        </div>

        {/* Find/search bar */}
        {searchVisible && (
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-[var(--surface-sunken)] px-2.5 py-1.5">
            {searchIndexBuilding ? (
              <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
            ) : (
              <Search size={14} className="shrink-0 text-muted" />
            )}
            <input
              autoFocus
              type="text"
              enterKeyHint="search"
              placeholder="Find in PDF…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') navigateSearch(e.shiftKey ? -1 : 1)
                if (e.key === 'Escape') { setSearchVisible(false); setSearchQuery('') }
              }}
              aria-label="Find in PDF"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            />
            {searchQuery.trim() && (
              <span className="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[11px] tabular-nums text-muted">
                {searchIndexBuilding
                  ? 'Indexing…'
                  : searchMatchCount === 0
                  ? 'No results'
                  : (searchCurrentIdx + 1) + ' / ' + searchMatchCount}
              </span>
            )}
            <button type="button" onClick={() => navigateSearch(-1)} disabled={searchMatchCount === 0} title="Previous match (Shift+Enter)" aria-label="Previous match" className={barIconButtonClass(false) + ' disabled:opacity-30'}>
              <ChevronUp size={15} />
            </button>
            <button type="button" onClick={() => navigateSearch(1)} disabled={searchMatchCount === 0} title="Next match (Enter)" aria-label="Next match" className={barIconButtonClass(false) + ' disabled:opacity-30'}>
              <ChevronDown size={15} />
            </button>
            <button type="button" onClick={() => { setSearchVisible(false); setSearchQuery('') }} title="Close search (Escape)" aria-label="Close search" className={barIconButtonClass(false)}>
              <X size={15} />
            </button>
          </div>
        )}

        {/* Canvas area + right side panel */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {/* Scrim for the touch drawer */}
          {showThumbnails && touchUI && (
            <button
              aria-label="Close panel"
              onClick={() => setShowThumbnails(false)}
              className="absolute inset-0 z-30 cursor-default bg-black/30 backdrop-blur-sm lg:hidden"
            />
          )}

          {/* Canvas scroll area */}
          <div ref={scrollAreaRef} className="scroll-thin relative min-w-0 flex-1 overflow-auto bg-[var(--background-deep)] dark:bg-[rgb(0_0_0_/_0.3)]">
{/* Outer div reserves the correct bounding-box size in the scroll area */}
            <div
              ref={pageRef}
              className={`relative mx-auto my-4 shadow-glass${
                pageAnim === 'exit-up'           ? ' pdf-page-exit-up'
                : pageAnim === 'exit-down'       ? ' pdf-page-exit-down'
                : pageAnim === 'enter-from-bottom' ? ' pdf-page-enter-from-bottom'
                : pageAnim === 'enter-from-top'  ? ' pdf-page-enter-from-top'
                : ''
              }`}
              style={{
                width:  (viewRotation === 90 || viewRotation === 270) ? canvasHeight : canvasWidth,
                height: (viewRotation === 90 || viewRotation === 270) ? canvasWidth  : canvasHeight,
              }}
            >
              {/* Inner wrapper applies the visual rotation around its own center */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: canvasWidth,
                  height: canvasHeight,
                  transform: `translate(-50%, -50%) rotate(${viewRotation}deg)`,
                  transformOrigin: 'center center',
                }}
              >
              {/* PDF render layer */}
              <canvas
                ref={pdfCanvasRef}
                className="absolute left-0 top-0"
                style={{ width: canvasWidth, height: canvasHeight }}
              />
              {/* Text layer (pdfjs TextLayer) — between PDF and annotation canvas */}
              <div
                ref={textLayerRef}
                className="pdf-text-layer absolute left-0 top-0"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  // Visible while the text layer mode is on or a search is active (highlights)
                  display: showTextLayer || searchVisible ? 'block' : 'none',
                  pointerEvents: showTextLayer && tool === 'textselect' ? 'auto' : 'none',
                }}
              />
              {/* Annotation overlay layer.
                  `touch-action: none` hands every single-finger gesture to our
                  own handlers (drawing, panning, erasing) and lets us recognise
                  two-finger pan/pinch without the WebView stealing the input. */}
              <canvas
                ref={annotCanvasRef}
                className="pdf-touch-surface absolute left-0 top-0"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  touchAction: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  WebkitTouchCallout: 'none',
                  pointerEvents: tool === 'textselect' ? 'none' : 'auto',
                  cursor:
                    tool === 'pan'
                      ? isPanning
                        ? 'grabbing'
                        : 'grab'
                      : tool === 'pen' || tool === 'highlighter'
                      ? 'crosshair'
                      : tool === 'eraser'
                      ? 'not-allowed'
                      : tool === 'text'
                      ? 'text'
                      : tool === 'sticky'
                      ? 'cell'
                      : tool === 'select'
                      ? 'default'
                      : tool === 'textselect'
                      ? 'text'
                      : 'crosshair',
                }}
                onContextMenu={e => e.preventDefault()}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onLostPointerCapture={handlePointerCancel}
              />
              </div>{/* end rotation wrapper */}

              {/* Floating formatting bars — desktop only. Touch devices get the
                  same controls in the thumb-reachable bottom dock instead, so
                  they can never end up off-screen or under the on-screen keyboard. */}
              {!touchUI && tool === 'select' && selectedId && (() => {
                const pageAnnot = getPageAnnotations(currentPage)
                const ta = pageAnnot.textAnnotations.find(t => t.id === selectedId)
                if (!ta) return null
                const { vx, vy } = logicalToVisual(ta.x, ta.y)
                return (
                  <div
                    className="floating-pop-in glass-strong absolute z-40 flex items-center gap-0.5 rounded-2xl px-1.5 py-1"
                    style={{ left: Math.max(0, vx), top: Math.max(0, vy - 40) }}
                  >
                    {selectedTextControls(ta)}
                  </div>
                )
              })()}

              {!touchUI && tool === 'select' && selectedId && (() => {
                const pageAnnot = getPageAnnotations(currentPage)
                const shape = pageAnnot.shapes.find(s => s.id === selectedId)
                if (!shape) return null
                const { vx, vy } = logicalToVisual(Math.min(shape.x1, shape.x2), Math.min(shape.y1, shape.y2))
                return (
                  <div
                    className="absolute z-40 flex items-center gap-0.5 rounded-lg border border-border floating-pop-in glass-strong absolute z-40 flex items-center gap-0.5 rounded-2xl px-1.5 py-1"
                    style={{ left: Math.max(0, vx), top: Math.max(0, vy - 40) }}
                  >
                    {selectedShapeControls(shape)}
                  </div>
                )
              })()}

              {/* Sticky notes overlay — rendered at 0° outside the rotation wrapper.
                  All interaction is Pointer Events based, so a finger, stylus and
                  mouse all drive the same code path (setPointerCapture keeps the
                  drag alive when the finger leaves the note). */}
              {getPageAnnotations(currentPage).stickyNotes?.map(sn => {
                const { vx, vy } = logicalToVisual(sn.x, sn.y)
                /** Start a pointer drag on the sticky note (move or resize). */
                const beginStickyDrag = (
                  e: ReactPointerEvent<HTMLDivElement>,
                  mode: 'move' | 'resize',
                ) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const target = e.currentTarget
                  try { target.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
                  const startX = e.clientX
                  const startY = e.clientY
                  const origX = sn.x
                  const origY = sn.y
                  const origW = sn.width
                  const origH = sn.height
                  const onMove = (ev: PointerEvent) => {
                    if (ev.pointerId !== e.pointerId) return
                    ev.preventDefault()
                    if (mode === 'move') {
                      const { dx, dy } = screenDeltaToLogical(ev.clientX - startX, ev.clientY - startY)
                      updateStickyNote(sn.id, { x: origX + dx, y: origY + dy })
                    } else {
                      const { dx, dy } = screenDeltaToLogical(ev.clientX - startX, ev.clientY - startY)
                      updateStickyNote(sn.id, {
                        width: Math.max(100, origW + dx),
                        height: Math.max(80, origH + dy),
                      })
                    }
                  }
                  const onUp = (ev: PointerEvent) => {
                    if (ev.pointerId !== e.pointerId) return
                    target.removeEventListener('pointermove', onMove)
                    target.removeEventListener('pointerup', onUp)
                    target.removeEventListener('pointercancel', onUp)
                    commitStickyMove()
                  }
                  target.addEventListener('pointermove', onMove)
                  target.addEventListener('pointerup', onUp)
                  target.addEventListener('pointercancel', onUp)
                }

                return (
                <div
                  key={sn.id}
                  className="absolute z-30 flex flex-col overflow-hidden rounded-md shadow-md"
                  style={{
                    left: vx,
                    top: vy,
                    width: sn.collapsed ? (touchUI ? 44 : 32) : sn.width * zoom,
                    height: sn.collapsed ? (touchUI ? 40 : 28) : sn.height * zoom,
                    backgroundColor: STICKY_COLORS[sn.color],
                    border: `1.5px solid ${
                      selectedId === sn.id ? 'var(--accent)' : 'rgba(0,0,0,0.15)'
                    }`,
                    boxShadow:
                      selectedId === sn.id
                        ? '0 0 0 3px var(--accent-light), 0 10px 24px -16px rgb(0 0 0 / 0.5)'
                        : undefined,
                  }}
                >
                  {/* Sticky header / drag handle */}
                  <div
                    className="flex shrink-0 cursor-move select-none items-center justify-between gap-1 px-1.5"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.08)',
                      minHeight: touchUI ? 34 : 22,
                      touchAction: 'none',
                    }}
                    onPointerDown={e => beginStickyDrag(e, 'move')}
                  >
                    {/* Colour swatches (visible when expanded) */}
                    {!sn.collapsed && (
                      <div className="flex gap-0.5">
                        {(Object.keys(STICKY_COLORS) as StickyColor[]).map(c => (
                          <button
                            key={c}
                            title={c}
                            aria-label={`Colour ${c}`}
                            onPointerDown={e => {
                              e.stopPropagation()
                              e.preventDefault()
                              updateStickyNote(sn.id, { color: c }, true)
                            }}
                            className={`rounded-full border border-black/10 transition-transform touch-manipulation ${
                              touchUI ? 'h-6 w-6' : 'h-2.5 w-2.5'
                            }`}
                            style={{ backgroundColor: STICKY_COLORS[c] }}
                          />
                        ))}
                      </div>
                    )}
                    <div className="ml-auto flex items-center gap-0.5">
                      <button
                        onPointerDown={e => {
                          e.stopPropagation()
                          e.preventDefault()
                          updateStickyNote(sn.id, { collapsed: !sn.collapsed }, true)
                        }}
                        title={sn.collapsed ? 'Expand' : 'Collapse'}
                        aria-label={sn.collapsed ? 'Expand note' : 'Collapse note'}
                        className={`flex items-center justify-center rounded text-black/50 hover:bg-black/5 hover:text-black/80 touch-manipulation ${
                          touchUI ? 'h-7 w-7 text-sm' : 'px-0.5 text-[11px] leading-none'
                        }`}
                      >{sn.collapsed ? '\u25A1' : '\u2212'}</button>
                      <button
                        onPointerDown={e => {
                          e.stopPropagation()
                          e.preventDefault()
                          deleteStickyNote(sn.id)
                          haptic(15)
                        }}
                        title="Delete sticky note"
                        aria-label="Delete sticky note"
                        className={`flex items-center justify-center rounded text-black/50 hover:bg-black/5 hover:text-[var(--danger)] touch-manipulation ${
                          touchUI ? 'h-7 w-7 text-base' : 'px-0.5 text-[11px] leading-none'
                        }`}
                      >{'\u00D7'}</button>
                    </div>
                  </div>
                  {/* Sticky body */}
                  {!sn.collapsed && (
                    <textarea
                      className={`flex-1 resize-none bg-transparent text-black outline-none placeholder:text-black/40 ${
                        touchUI ? 'p-2 text-sm' : 'p-1.5 text-xs'
                      }`}
                      placeholder="Add a note..."
                      value={sn.text}
                      onPointerDown={e => e.stopPropagation()}
                      onFocus={() => setSelectedId(sn.id)}
                      onChange={e => updateStickyNote(sn.id, { text: e.target.value })}
                      onBlur={commitStickyMove}
                    />
                  )}
                  {/* Resize handle — a real 24/44px grab area for fingers */}
                  {!sn.collapsed && (
                    <div
                      className="absolute bottom-0 right-0 cursor-se-resize"
                      style={{
                        width: touchUI ? 28 : 12,
                        height: touchUI ? 28 : 12,
                        background: 'rgba(0,0,0,0.15)',
                        borderRadius: '0 0 4px 0',
                        touchAction: 'none',
                      }}
                      onPointerDown={e => beginStickyDrag(e, 'resize')}
                      title="Drag to resize"
                    />
                  )}
                </div>
                )
              })}

              {/* Text editing overlay — formatting toolbar + textarea styled to match the
                  committed text exactly (font, wrapping, box, position and rotation) */}
              {editingText && (() => {
                const { vx, vy } = logicalToVisual(editingText.x, editingText.y)
                const box = measureTextAnnotationBox(editingText)
                // Keep the floating toolbar on-screen on desktop; touch devices use
                // the bottom dock instead (see below).
                const toolbarTop = vy - 34 >= 0 ? vy - 34 : vy + box.height * zoom + 6
                return (
                  <div
                    ref={editingWrapperRef}
                    style={{ display: 'contents' }}
                    onBlur={e => {
                      // Interacting with the editing toolbar must not end the edit session
                      const next = e.relatedTarget as HTMLElement | null
                      if (next && editingWrapperRef.current?.contains(next)) return
                      // On touch the dock's buttons never take focus, so only an
                      // intentional tap elsewhere should end the session.
                      if (touchUI) return
                      commitText()
                    }}
                  >
                    {!touchUI && (
                      <div
                        className="absolute z-40 flex items-center gap-0.5 rounded-lg border border-border floating-pop-in glass-strong absolute z-40 flex items-center gap-0.5 rounded-2xl px-1.5 py-1"
                        style={{ left: Math.max(0, vx), top: toolbarTop }}
                      >
                        {editingTextControls}
                      </div>
                    )}
                    <textarea
                      ref={textAreaRef}
                      autoFocus
                      spellCheck={false}
                      placeholder="Type text…"
                      enterKeyHint="enter"
                      className="absolute border-0 bg-transparent"
                      style={{
                        left: vx,
                        top: vy,
                        width: box.width * zoom,
                        height: box.height * zoom,
                        // Aligns the first baseline with the canvas renderer (which draws
                        // it exactly `fontSize` below the box top)
                        paddingTop: box.paddingTop * zoom,
                        paddingRight: 0,
                        paddingBottom: 0,
                        paddingLeft: 0,
                        margin: 0,
                        boxSizing: 'border-box',
                        fontSize: editingText.fontSize * zoom,
                        fontFamily: editingText.fontFamily ?? 'sans-serif',
                        fontWeight: editingText.bold ? 'bold' : 'normal',
                        fontStyle: editingText.italic ? 'italic' : 'normal',
                        lineHeight: TEXT_LINE_HEIGHT,
                        color: editingText.color,
                        textAlign: editingText.textAlign ?? 'left',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'break-word',
                        overflow: 'hidden',
                        // The native grip is a ~7px hotspot — unusable with a finger.
                        // Touch devices get an explicit resize grip below instead.
                        resize: touchUI ? 'none' : 'horizontal',
                        transform: `rotate(${viewRotation}deg)`,
                        transformOrigin: 'top left',
                        outline: '1.5px solid var(--accent)',
                        outlineOffset: 2,
                        touchAction: 'manipulation',
                      }}
                      value={editingText.text}
                      onChange={e =>
                        setEditingText(prev =>
                          prev ? { ...prev, text: e.target.value } : null
                        )
                      }
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          setEditingText(null)
                        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault()
                          commitText()
                        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
                          e.preventDefault()
                          updateEditingText({ bold: !editingText.bold })
                        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
                          e.preventDefault()
                          updateEditingText({ italic: !editingText.italic })
                        }
                        // Plain Enter inserts a line break (multi-line text box)
                      }}
                    />
                    {/* Touch-only resize grip — a real 40px target that resizes the
                        box width without relying on the native textarea corner. */}
                    {touchUI && (
                      <div
                        className="absolute z-40 flex items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] shadow-glass"
                        style={{
                          // Sits diagonally outside the bottom-right corner so it
                          // never covers the text being typed.
                          left: Math.min(
                            vx + box.width * zoom + 6,
                            Math.max(0, canvasWidth - 44),
                          ),
                          top: vy + box.height * zoom + 6,
                          width: 40,
                          height: 40,
                          touchAction: 'none',
                        }}
                        title="Drag to resize the text box"
                        onPointerDown={e => {
                          e.preventDefault()
                          e.stopPropagation()
                          const target = e.currentTarget
                          try { target.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
                          const startX = e.clientX
                          const startWidth = editingText.width
                          const onMove = (ev: PointerEvent) => {
                            if (ev.pointerId !== e.pointerId) return
                            ev.preventDefault()
                            const { dx } = screenDeltaToLogical(ev.clientX - startX, 0)
                            setEditingText(prev =>
                              prev
                                ? { ...prev, width: Math.max(TEXT_MIN_BOX_WIDTH, startWidth + dx) }
                                : prev
                            )
                          }
                          const onUp = (ev: PointerEvent) => {
                            if (ev.pointerId !== e.pointerId) return
                            target.removeEventListener('pointermove', onMove)
                            target.removeEventListener('pointerup', onUp)
                            target.removeEventListener('pointercancel', onUp)
                          }
                          target.addEventListener('pointermove', onMove)
                          target.addEventListener('pointerup', onUp)
                          target.addEventListener('pointercancel', onUp)
                        }}
                      >
                        <GripHorizontal size={18} />
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Floating copy button — appears when text is selected in the text layer */}
              {selectedText && (
                <button
                  onPointerDown={e => e.preventDefault()}
                  onClick={handleCopySelectedText}
                  title="Copy selected text"
                  className={`absolute right-2 top-2 z-40 glass-strong flex items-center gap-1.5 rounded-full text-foreground shadow-glass-lg transition-colors hover:bg-surface-hover touch-manipulation ${
                    touchUI ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs'
                  }`}
                >
                  <Copy size={touchUI ? 16 : 13} />
                  Copy
                </button>
              )}
            </div>
          </div>

          {/* Right glass panel: Pages / Annotations */}
          {showThumbnails && (
            <aside
              className={[
                'flex flex-col border-l border-border bg-[var(--glass-bg-strong)] backdrop-blur-2xl',
                touchUI ? 'absolute inset-y-0 right-0 z-40 w-[84vw] max-w-[330px] shadow-glass-lg' : 'relative w-[300px] shrink-0',
              ].join(' ')}
              aria-label="PDF side panel"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2">
                <div className="segmented min-w-0" role="tablist" aria-label="PDF panel">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={panelTab === 'pages'}
                    data-active={panelTab === 'pages'}
                    onClick={() => setPanelTab('pages')}
                    className="segmented-item gap-1.5 px-2.5"
                  >
                    <PanelLeft size={13} />
                    Pages
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={panelTab === 'annotations'}
                    data-active={panelTab === 'annotations'}
                    onClick={() => setPanelTab('annotations')}
                    className="segmented-item gap-1.5 px-2.5"
                  >
                    <List size={13} />
                    Annotations
                    {annotationCount > 0 && (
                      <span className="rounded-full bg-[var(--accent-light)] px-1.5 text-[10px] tabular-nums text-accent">{annotationCount}</span>
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowThumbnails(false)}
                  aria-label="Close panel"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>

              {panelTab === 'pages' ? (
                <div className="scroll-thin flex-1 overflow-y-auto p-2">
                  <div className="grid grid-cols-2 gap-2">
                    {pages.map((pg, i) => {
                      const active = pg.pageNumber === currentPage
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            goToPage(pg.pageNumber)
                            // The drawer covers the page — get out of the way after picking
                            if (touchUI) setShowThumbnails(false)
                          }}
                          aria-current={active ? 'page' : undefined}
                          aria-label={'Go to page ' + (i + 1)}
                          className={[
                            'group flex flex-col gap-1 rounded-xl border p-1.5 text-left transition-colors focus-ring',
                            active
                              ? 'border-[color:var(--accent)] bg-[var(--accent-light)]'
                              : 'border-border bg-surface hover:bg-surface-hover',
                          ].join(' ')}
                        >
                          {thumbnailUrls[i] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumbnailUrls[i]}
                              alt={'Page ' + (i + 1)}
                              className="w-full rounded-lg object-contain shadow-sm"
                              style={{ maxHeight: 132 }}
                            />
                          ) : (
                            <div className="skeleton-shimmer h-24 w-full rounded-lg" />
                          )}
                          <div className="flex items-center justify-between gap-1 px-0.5">
                            <span className={['text-[11px] font-semibold tabular-nums', active ? 'text-accent' : 'text-foreground'].join(' ')}>
                              {i + 1}
                            </span>
                            {pg.isBlank && (
                              <span className="rounded bg-surface px-1 text-[9px] uppercase tracking-wide text-muted">blank</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Page operations */}
                  <div className="mt-3 space-y-2 border-t border-border pt-2.5">
                    <div className="flex items-center gap-1">
                      <span className={metaLabel + ' shrink-0 pr-0.5'}>Rotate</span>
                      <button
                        type="button"
                        title="Rotate 90° counter-clockwise"
                        aria-label="Rotate counter-clockwise"
                        onClick={() => setViewRotation(r => ((r + 270) % 360) as 0 | 90 | 180 | 270)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                      >
                        <RotateCcw size={15} />
                      </button>
                      <select
                        value={viewRotation}
                        onChange={e => setViewRotation(Number(e.target.value) as 0 | 90 | 180 | 270)}
                        title="Page rotation"
                        aria-label="Page rotation"
                        className="glass-input h-8 min-w-0 flex-1 px-1.5 text-xs"
                      >
                        <option value={0}>0°</option>
                        <option value={90}>90° CW</option>
                        <option value={180}>180°</option>
                        <option value={270}>90° CCW</option>
                      </select>
                      <button
                        type="button"
                        title="Rotate 90° clockwise"
                        aria-label="Rotate clockwise"
                        onClick={() => setViewRotation(r => ((r + 90) % 360) as 0 | 90 | 180 | 270)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                      >
                        <RotateCw size={15} />
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        title="Insert blank page before current page"
                        onClick={() => insertBlankPage(currentPage - 1)}
                        disabled={disabled}
                        className="glass-btn h-8 flex-1 gap-1 px-2 text-[11px] disabled:opacity-40"
                      >
                        <Plus size={12} />
                        Page before
                      </button>
                      <button
                        type="button"
                        title="Insert blank page after current page"
                        onClick={() => insertBlankPage(currentPage)}
                        disabled={disabled}
                        className="glass-btn h-8 flex-1 gap-1 px-2 text-[11px] disabled:opacity-40"
                      >
                        <Plus size={12} />
                        Page after
                      </button>
                    </div>
                    <button
                      type="button"
                      title={pages.length <= 1 ? 'Cannot delete the only page' : 'Delete current page'}
                      onClick={() => {
                        const pg = pages.find(p => p.pageNumber === currentPage)
                        if (pg?.isBlank) { deletePage(currentPage) } else { setDeleteConfirmIdx(currentPage) }
                      }}
                      disabled={disabled || pages.length <= 1}
                      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-[var(--danger-light)] text-[11px] font-medium text-danger transition-colors hover:border-[color:var(--danger)] disabled:opacity-40"
                    >
                      <Trash2 size={12} />
                      Delete page
                    </button>
                    <p className="px-0.5 text-[11px] leading-4 text-muted">
                      Blank pages and annotations live in this note. The original PDF is unchanged.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="scroll-thin flex-1 overflow-y-auto p-2">
                  {annotationGroups.length === 0 ? (
                    <div className="mt-6 rounded-xl border border-dashed border-border px-4 py-8 text-center">
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent">
                        <Pen size={16} />
                      </div>
                      <p className="text-sm font-medium text-foreground">No annotations yet</p>
                      <p className="mt-1 text-xs leading-5 text-muted">
                        Use the pen, shapes, text or sticky notes to mark up this PDF.
                      </p>
                    </div>
                  ) : (
                    annotationGroups.map(group => (
                      <div key={group.page.pageNumber} className="mb-3">
                        <button
                          type="button"
                          onClick={() => goToPage(group.page.pageNumber)}
                          className="sticky top-0 z-10 -mx-2 mb-1 flex w-[calc(100%+1rem)] items-center justify-between border-b border-border bg-[var(--glass-bg-strong)] px-3 py-1 text-left backdrop-blur-md transition-colors hover:text-foreground"
                          title={'Go to page ' + (group.page.pageNumber + 1)}
                        >
                          <span className={metaLabel + ' shrink-0'}>Page {group.page.pageNumber + 1}</span>
                          <span className="text-[10px] tabular-nums text-muted">{group.items.length}</span>
                        </button>
                        <div className="space-y-0.5">
                          {group.items.map(item => {
                            const Icon = item.icon
                            const active = selectedId === item.id && group.page.pageNumber === currentPage
                            return (
                              <div
                                key={item.id}
                                className={['group flex items-center gap-0.5 rounded-lg pr-0.5 transition-colors', active ? 'bg-[var(--accent-light)]' : ''].join(' ')}
                              >
                                <button
                                  type="button"
                                  onClick={() => jumpToAnnotation(group.page.pageNumber, item)}
                                  aria-current={active ? 'true' : undefined}
                                  className={['glass-row min-w-0 flex-1 gap-2 px-2 py-1.5', active ? 'text-accent' : ''].join(' ')}
                                >
                                  <Icon size={13} className={['shrink-0', active ? 'text-accent' : 'text-muted'].join(' ')} />
                                  <span className="min-w-0 flex-1">
                                    <span className={['block truncate text-xs font-medium', active ? 'text-accent' : 'text-foreground'].join(' ')}>
                                      {item.label}
                                    </span>
                                    <span className="block truncate text-[10px] text-muted">
                                      {item.meta}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteAnnotationOnPage(group.page.pageNumber, item.kind, item.id)}
                                  aria-label={'Delete ' + item.kind + ' annotation'}
                                  title="Delete annotation"
                                  className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--danger-light)] hover:text-danger focus-visible:opacity-100', touchUI ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'].join(' ')}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </aside>
          )}

          {/* Delete page confirmation */}
          {deleteConfirmIdx !== null && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
              <button
                type="button"
                aria-label="Cancel page deletion"
                onClick={() => setDeleteConfirmIdx(null)}
                className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm dark:bg-black/60"
              />
              <div className="glass-strong animate-rise-in relative w-full max-w-sm rounded-2xl p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--danger-light)] text-danger">
                    <Trash2 size={15} />
                  </span>
                  Delete this page?
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Any annotations on this page are removed from the note. The original PDF file is unchanged.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setDeleteConfirmIdx(null)} className="glass-btn h-9 px-4 text-xs">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePage(deleteConfirmIdx!)}
                    className="flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--danger)] bg-[var(--danger-light)] px-4 text-xs font-semibold text-danger transition-colors hover:bg-[var(--danger)] hover:text-white"
                  >
                    <Trash2 size={13} />
                    Delete page
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Status bar ──────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-3 py-1 text-[11px] text-muted">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 tabular-nums">Page {currentPage + 1} of {totalPages || '—'}</span>
            <span className="h-3 w-px shrink-0 bg-border" aria-hidden />
            <span className="shrink-0 tabular-nums">{Math.round(zoom * 100)}%</span>
            <span className="h-3 w-px shrink-0 bg-border" aria-hidden />
            <span className="truncate" title={toolHints[tool]}>
              {toolLabel}
              {editingText ? ' · editing text' : selectedAnnotation ? ' · ' + selectedAnnotation.kind + ' selected' : ''}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {selectedId && selectedAnnotation ? (
              <button
                type="button"
                onClick={() => deleteAnnotationOnPage(currentPage, selectedAnnotation.kind, selectedId)}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-danger transition-colors hover:bg-[var(--danger-light)]"
              >
                <Trash2 size={11} />
                Delete
              </button>
            ) : (
              <span className="hidden md:inline">
                {annotationCount > 0
                  ? annotationCount + (annotationCount === 1 ? ' annotation' : ' annotations')
                  : 'No annotations yet'}
              </span>
            )}
          </div>
        </div>

        {/* ── Contextual bottom dock (touch / compact) ──────────────
            Puts the active controls within thumb reach while the page stays
            full-bleed. Its content follows the current mode: text editing →
            selection formatting → drawing tools. */}
        {touchUI && (
          <div
            className="relative shrink-0 border-t border-border bg-[var(--glass-bg-strong)] backdrop-blur-xl lg:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {mobileStyleOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close style panel"
                  onClick={() => setMobileStyleOpen(false)}
                  className="absolute inset-x-0 bottom-full top-[calc(-100vh+56px)] z-40 cursor-default bg-black/30 backdrop-blur-sm"
                />
                <div className="floating-pop-in glass-strong absolute inset-x-2 bottom-full z-50 mb-2 rounded-2xl p-3 shadow-glass-lg">
                  <div className="flex items-center justify-between">
                    <span className={metaLabel}>Style</span>
                    <button
                      type="button"
                      onClick={() => setMobileStyleOpen(false)}
                      aria-label="Close style panel"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={metaLabel}>Colour</span>
                    <span className="font-mono text-[10px] text-muted">{color}</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-8 gap-1.5">
                    {COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        title={c}
                        aria-label={'Colour ' + c}
                        onClick={() => setColor(c)}
                        className={['h-8 w-8 rounded-full border-2 transition-transform', color === c ? 'scale-110 border-foreground' : 'border-transparent'].join(' ')}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <label className="mt-3 flex items-center gap-2">
                    <span className={metaLabel + ' shrink-0'}>Size</span>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={strokeSize}
                      onChange={e => setStrokeSize(Number(e.target.value))}
                      className="h-1.5 flex-1 accent-[var(--accent)]"
                      aria-label="Stroke size"
                    />
                    <span className="w-6 text-center text-xs tabular-nums text-foreground">{strokeSize}</span>
                  </label>
                  {(tool === 'rectangle' || tool === 'circle' || tool === 'arrow') && (
                    <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
                      <span className={metaLabel + ' shrink-0'}>Options</span>
                      {toolOptions}
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="h-14">{touchDockContent}</div>
          </div>
        )}
      </div>
    )
  }
)

export default PdfAnnotationEditor
