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
import { getStroke } from 'perfect-freehand'
import {
  Upload,
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronLeft,
  ChevronRight,
  Pen,
  Highlighter,
  Eraser,
  Type,
  Square,
  Circle,
  ArrowUpRight,
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
} from 'lucide-react'
import FileExplorerModal from '@/components/FileExplorerModal'
import { uploadFile, getFileSignedUrl, downloadFile } from '@/lib/file-storage'
import { useToast } from '@/components/ToastProvider'

const PDF_ANNOTATION_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

// ============================================================================
// TYPES
// ============================================================================

type PdfTool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'rectangle' | 'circle' | 'arrow' | 'line' | 'sticky' | 'textselect'
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
const HIGHLIGHTER_OPACITY = 0.35

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ============================================================================
// FREEHAND RENDERING (reuses perfect-freehand like DrawingEditor)
// ============================================================================

function getSvgPathFromStroke(stroke: number[][]): string {
  if (stroke.length === 0) return ''
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      if (i === 0) return `M ${x0} ${y0}`
      const [x1, y1] = arr[(i + 1) % arr.length]
      return `${acc} Q ${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`
    },
    ''
  )
  return `${d} Z`
}

function renderStrokeToCtx(
  ctx: CanvasRenderingContext2D,
  stroke: PdfStroke,
  scale: number
) {
  const options = stroke.tool === 'highlighter'
    ? { size: stroke.size * scale, thinning: 0.1, smoothing: 0.5, streamline: 0.5, simulatePressure: false }
    : { size: stroke.size * scale, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: true }

  const scaledPoints = stroke.points.map(p => [p.x * scale, p.y * scale, p.pressure ?? 0.5])
  const outline = getStroke(scaledPoints, options)
  const path = getSvgPathFromStroke(outline)
  const path2D = new Path2D(path)

  ctx.save()
  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_OPACITY
    ctx.globalCompositeOperation = 'multiply'
  }
  ctx.fillStyle = stroke.color
  ctx.fill(path2D)
  ctx.restore()
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
  function PdfAnnotationEditor({ value, onChange, disabled, noteId }, ref) {
    const toast = useToast()

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

    // Undo/redo
    const [history, setHistory] = useState<PdfAnnotationPage[][]>([])
    const [historyIdx, setHistoryIdx] = useState(-1)

    // Refs
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
    const annotCanvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const textAreaRef = useRef<HTMLTextAreaElement>(null)
    const renderTaskRef = useRef<import('pdfjs-dist').RenderTask | null>(null)

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
    useEffect(() => { zoomRef.current = zoom }, [zoom])
    useEffect(() => { totalPagesRef.current = totalPages }, [totalPages])

    // Toolbar tab
    const [toolbarTab, setToolbarTab] = useState<'annotate' | 'view' | 'pages'>('annotate')

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
    const textLayerInstanceRef = useRef<{ cancel: () => void } | null>(null)

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
        const hitRadius = 12 / zoom

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
          !(pos.x >= t.x && pos.x <= t.x + t.width &&
            pos.y >= t.y && pos.y <= t.y + (t.height || t.fontSize * 1.5))
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
      [currentPage, zoom, getPageAnnotations, updatePageAnnotations, emitChange]
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
            drawShape(thumbCtx, shape, thumbScale, false)
          }
          for (const ta of pageAnnot.textAnnotations) {
            thumbCtx.save()
            thumbCtx.font = `${ta.italic ? 'italic ' : ''}${ta.bold ? 'bold ' : ''}${ta.fontSize * thumbScale}px sans-serif`
            thumbCtx.fillStyle = ta.color
            ta.text.split('\n').forEach((line, li) => {
              thumbCtx!.fillText(line, ta.x * thumbScale, (ta.y + ta.fontSize + li * ta.fontSize * 1.2) * thumbScale)
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
      if (!value?.pdfStoragePath) return
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
          ctx.strokeStyle = '#3b82f6'
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 4])
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
        drawShape(ctx, shape, scale, shape.id === selectedId)
        if (shape.id === selectedId && shape.type !== 'arrow') {
          // Draw resize handles at the 4 corners
          const handles = [
            { x: shape.x1 * scale, y: shape.y1 * scale },
            { x: shape.x2 * scale, y: shape.y1 * scale },
            { x: shape.x1 * scale, y: shape.y2 * scale },
            { x: shape.x2 * scale, y: shape.y2 * scale },
          ]
          ctx.save()
          ctx.fillStyle = '#3b82f6'
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.setLineDash([])
          for (const h of handles) {
            ctx.beginPath()
            ctx.rect(h.x - 5, h.y - 5, 10, 10)
            ctx.fill()
            ctx.stroke()
          }
          ctx.restore()
        }
      }

      // Draw shape preview
      if (shapePreview) {
        drawShape(ctx, shapePreview, scale, false)
      }

      // Draw text annotations
      for (const ta of pageAnnot.textAnnotations) {
        ctx.save()
        const fontStyle = `${ta.italic ? 'italic ' : ''}${ta.bold ? 'bold ' : ''}${ta.fontSize * scale}px ${ta.fontFamily ?? 'sans-serif'}`
        ctx.font = fontStyle
        ctx.fillStyle = ta.color
        const lines = ta.text.split('\n')
        lines.forEach((line, i) => {
          ctx.fillText(line, ta.x * scale, (ta.y + ta.fontSize + i * ta.fontSize * 1.2) * scale)
        })
        if (ta.id === selectedId) {
          ctx.strokeStyle = '#3b82f6'
          ctx.lineWidth = 1
          ctx.setLineDash([4, 4])
          ctx.strokeRect(
            ta.x * scale - 2,
            ta.y * scale - 2,
            ta.width * scale + 4,
            (ta.height || ta.fontSize * 1.5) * scale + 4
          )
        }
        ctx.restore()
      }
    }, [canvasWidth, canvasHeight, currentPage, zoom, pages, isDrawing, currentStrokePoints, tool, color, strokeSize, shapePreview, selectedId, getPageAnnotations])

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
      scale: number,
      selected: boolean
    ) {
      ctx.save()
      ctx.strokeStyle = shape.color
      ctx.lineWidth = shape.strokeWidth * scale
      if (selected) {
        ctx.setLineDash([6, 3])
      }

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
    function getPointerPos(e: ReactPointerEvent<HTMLCanvasElement>): PdfPoint {
      const rect = annotCanvasRef.current!.getBoundingClientRect()
      const vx = e.clientX - rect.left
      const vy = e.clientY - rect.top
      let cx: number, cy: number
      // Undo CSS rotation to map visual pointer coords back to canvas logical coords
      switch (viewRotation) {
        case 90:
          cx = (canvasWidth - vy) / zoom
          cy = vx / zoom
          break
        case 180:
          cx = (canvasWidth - vx) / zoom
          cy = (canvasHeight - vy) / zoom
          break
        case 270:
          cx = vy / zoom
          cy = (canvasHeight - vx) / zoom
          break
        default:
          cx = vx / zoom
          cy = vy / zoom
      }
      return { x: cx, y: cy, pressure: e.pressure }
    }

    // ────────────────────────────────────────────────────────
    // Pointer event handlers
    // ────────────────────────────────────────────────────────
    const handlePointerDown = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (disabled) return
        e.preventDefault()
        const pos = getPointerPos(e)

        if (tool === 'pen' || tool === 'highlighter') {
          setIsDrawing(true)
          setCurrentStrokePoints([pos])
        } else if (tool === 'eraser') {
          setIsDrawing(true)
          eraseAtPoint(pos)
        } else if (tool === 'text') {
          // Place a new text annotation
          const newText: TextAnnotation = {
            id: uid(),
            x: pos.x,
            y: pos.y,
            width: 200,
            height: DEFAULT_FONT_SIZE * 1.5,
            text: '',
            fontSize: DEFAULT_FONT_SIZE,
            color,
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
          const HANDLE_RADIUS = 8 / zoom

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
              if (
                pos.x >= ta.x && pos.x <= ta.x + ta.width &&
                pos.y >= ta.y && pos.y <= ta.y + (ta.height || ta.fontSize * 1.5)
              ) {
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
            const hitR = Math.max(6, strokeSize) / zoom
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
          }
          setIsDrawing(hit)
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [disabled, tool, color, currentPage, zoom, pages, selectedId, strokeSize]
    )

    const handlePointerMove = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return
        e.preventDefault()
        const pos = getPointerPos(e)

        if (tool === 'pen' || tool === 'highlighter') {
          setCurrentStrokePoints(prev => [...prev, pos])
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
      [isDrawing, tool, shapeStart, color, strokeSize, selectedId, dragOffset, currentPage, pages, eraseAtPoint, resizeHandle, getPageAnnotations, updatePageAnnotations]
    )

    const handlePointerUp = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing && tool !== 'eraser') return
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
          const pos = getPointerPos(e)
          const minDist = 5 / zoom
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
              ...(tool !== 'arrow' && tool !== 'line' && shapeFilled ? { filled: true, fillOpacity: 0.2 } : {}),
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
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isDrawing, tool, currentStrokePoints, color, strokeSize, currentPage, shapeStart, selectedId, pages, zoom, shapeFilled, doubleEndedArrow]
    )

    // ────────────────────────────────────────────────────────
    // Double-click: re-enter edit mode on a committed text annotation
    // ────────────────────────────────────────────────────────
    const handleDoubleClick = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = annotCanvasRef.current!.getBoundingClientRect()
        const vx = e.clientX - rect.left
        const vy = e.clientY - rect.top
        let cx: number, cy: number
        switch (viewRotation) {
          case 90:  cx = vy / zoom; cy = (canvasWidth - vx) / zoom; break
          case 180: cx = (canvasWidth - vx) / zoom; cy = (canvasHeight - vy) / zoom; break
          case 270: cx = (canvasHeight - vy) / zoom; cy = vx / zoom; break
          default:  cx = vx / zoom; cy = vy / zoom
        }
        const pos = { x: cx, y: cy }
        const pageAnnot = getPageAnnotations(currentPage)
        const ta = pageAnnot.textAnnotations.find(t =>
          pos.x >= t.x && pos.x <= t.x + t.width &&
          pos.y >= t.y && pos.y <= t.y + (t.height || t.fontSize * 1.5)
        )
        if (ta) {
          // Pull the annotation back out of committed state and into editing
          const newPages = updatePageAnnotations(currentPage, p => ({
            ...p,
            textAnnotations: p.textAnnotations.filter(t => t.id !== ta.id),
          }))
          setPages(newPages)
          setEditingText(ta)
          setTool('text')
        }
      },
      [currentPage, zoom, viewRotation, canvasWidth, canvasHeight, getPageAnnotations, updatePageAnnotations]
    )

    // ────────────────────────────────────────────────────────
    // Text annotation commit
    // ────────────────────────────────────────────────────────
    const commitText = useCallback(() => {
      if (!editingText || !editingText.text.trim()) {
        setEditingText(null)
        return
      }
      const newPages = updatePageAnnotations(currentPage, p => ({
        ...p,
        textAnnotations: [...p.textAnnotations, editingText],
      }))
      setPages(newPages)
      pushHistory(newPages)
      emitChange(newPages)
      setEditingText(null)
    }, [editingText, currentPage, updatePageAnnotations, pushHistory, emitChange])

    // ────────────────────────────────────────────────────────
    // Page navigation
    // ────────────────────────────────────────────────────────
    const goToPage = useCallback((pg: number) => {
      setCurrentPage(pg)
      setSelectedId(null)
      setEditingText(null)
      if (value?.pdfStoragePath) {
        onChange({
          pdfStoragePath: value.pdfStoragePath,
          pages,
          currentPage: pg,
          totalPages,
          zoom,
        })
      }
    }, [value?.pdfStoragePath, pages, totalPages, zoom, onChange])

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
        // Undo/redo keyboard shortcuts
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
          e.preventDefault()
          if (e.shiftKey) redo()
          else undo()
        }
        // Find/search shortcut (Ctrl/Cmd+F)
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
          e.preventDefault()
          setShowTextLayer(true)
          setSearchVisible(v => {
            if (!v) setSearchQuery('')
            return true
          })
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
            's': 'select', 'p': 'pen', 'h': 'highlighter', 'e': 'eraser',
            't': 'text', 'r': 'rectangle', 'c': 'circle', 'a': 'arrow',
            'l': 'line', 'n': 'sticky', 'i': 'textselect',
          }
          if (keyToTool[e.key.toLowerCase()]) {
            const target = e.target as HTMLElement
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
            if (!isInput) setTool(keyToTool[e.key.toLowerCase()])
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
    // Convert unscaled logical canvas coords → visual coords relative to the outer bounding-box div
    function logicalToVisual(lx: number, ly: number): { vx: number; vy: number } {
      const px = lx * zoom
      const py = ly * zoom
      switch (viewRotation) {
        case 90:  return { vx: py, vy: canvasWidth - px }
        case 180: return { vx: canvasWidth - px, vy: canvasHeight - py }
        case 270: return { vx: canvasHeight - py, vy: px }
        default:  return { vx: px, vy: py }
      }
    }
    // Convert a mouse-movement delta (screen pixels) → logical (unscaled) delta
    function screenDeltaToLogical(dsx: number, dsy: number): { dx: number; dy: number } {
      switch (viewRotation) {
        case 90:  return { dx: -dsy / zoom, dy: dsx / zoom }
        case 180: return { dx: -dsx / zoom, dy: -dsy / zoom }
        case 270: return { dx: dsy / zoom, dy: -dsx / zoom }
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

    // Ctrl/Cmd + scroll wheel zoom — plain scroll at 100% navigates pages
    // Uses refs to avoid stale closures
    useEffect(() => {
      const el = scrollAreaRef.current
      if (!el) return

      let scrollAccum = 0
      const SCROLL_THRESHOLD = 60 // px accumulated scroll to trigger page turn

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
          if (Math.abs(scrollAccum) >= SCROLL_THRESHOLD) {
            const pg = currentPageRef.current
            const total = totalPagesRef.current
            if (scrollingDown && pg < total - 1) {
              setCurrentPage(pg + 1)
              queueMicrotask(() => {
                // Scroll to top of new page
                el.scrollTop = 0
                emitChange(pagesRef.current, pg + 1, zoomRef.current)
              })
            } else if (scrollingUp && pg > 0) {
              setCurrentPage(pg - 1)
              queueMicrotask(() => {
                // Scroll to bottom of previous page
                el.scrollTop = el.scrollHeight
                emitChange(pagesRef.current, pg - 1, zoomRef.current)
              })
            }
            scrollAccum = 0
          }
        } else {
          // Normal scroll within page — reset accumulator
          scrollAccum = 0
        }
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      return () => el.removeEventListener('wheel', onWheel)
    }, [clampZoom, emitChange])

    // ────────────────────────────────────────────────────────
    // Text layer rendering (pdfjs TextLayer class, pdfjs-dist 4.x)
    // ────────────────────────────────────────────────────────
    useEffect(() => {
      const el = textLayerRef.current
      // Cancel any in-flight render
      if (textLayerInstanceRef.current) {
        textLayerInstanceRef.current.cancel()
        textLayerInstanceRef.current = null
      }
      if (el) el.innerHTML = ''

      if (!showTextLayer || !pdfDoc || !el) return

      let cancelled = false

      async function renderTextLayerForPage() {
        const lib = pdfjsLib
        if (!lib) return
        const pageData = pages.find(p => p.pageNumber === currentPage)
        if (!pageData?.pdfPageNumber) return

        const page = await pdfDoc!.getPage(pageData.pdfPageNumber)
        if (cancelled) return

        const viewport = page.getViewport({ scale: zoom })

        // pdfjs-dist 4.x exposes TextLayer class
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tl: { render: () => Promise<void>; cancel: () => void } = new (lib as any).TextLayer({
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
    }, [pdfDoc, currentPage, zoom, showTextLayer, pages])

    // ────────────────────────────────────────────────────────
    // Search: highlight matching spans in text layer
    // ────────────────────────────────────────────────────────
    useEffect(() => {
      const el = textLayerRef.current
      if (!el) return

      const spans = Array.from(el.querySelectorAll('span')) as HTMLElement[]
      for (const span of spans) {
        span.classList.remove('pdfannot-match', 'pdfannot-match-active')
      }

      if (!searchQuery.trim()) {
        setSearchMatchCount(0)
        setSearchCurrentIdx(0)
        return
      }

      const q = searchQuery.toLowerCase()
      const hits: HTMLElement[] = []
      for (const span of spans) {
        if ((span.textContent ?? '').toLowerCase().includes(q)) {
          span.classList.add('pdfannot-match')
          hits.push(span)
        }
      }

      setSearchMatchCount(hits.length)
      const newIdx = hits.length > 0 ? 0 : -1
      setSearchCurrentIdx(newIdx)
      if (hits.length > 0) {
        hits[0].classList.add('pdfannot-match-active')
        hits[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }, [searchQuery, textLayerVersion, showTextLayer, currentPage])

    const navigateSearch = useCallback(
      (dir: 1 | -1) => {
        const el = textLayerRef.current
        if (!el) return
        const hits = Array.from(el.querySelectorAll('.pdfannot-match')) as HTMLElement[]
        if (hits.length === 0) return
        const prev = searchCurrentIdx < 0 ? 0 : searchCurrentIdx
        hits[prev]?.classList.remove('pdfannot-match-active')
        const next = (prev + dir + hits.length) % hits.length
        hits[next].classList.add('pdfannot-match-active')
        hits[next].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        setSearchCurrentIdx(next)
      },
      [searchCurrentIdx]
    )

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
            drawShape(tempCtx, shape, exportScale, false)
          }
          // Render text annotations
          for (const ta of pageAnnot.textAnnotations) {
            tempCtx.save()
            tempCtx.font = `${ta.italic ? 'italic ' : ''}${ta.bold ? 'bold ' : ''}${ta.fontSize * exportScale}px ${ta.fontFamily ?? 'sans-serif'}`
            tempCtx.fillStyle = ta.color
            ta.text.split('\n').forEach((line, li) => {
              tempCtx.fillText(line, ta.x * exportScale, (ta.y + ta.fontSize + li * ta.fontSize * 1.2) * exportScale)
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
    // RENDER: Upload prompt (no PDF yet)
    // ────────────────────────────────────────────────────────
    if (!value?.pdfStoragePath) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <div className="rounded-xl border-2 border-dashed border-border p-12 text-center">
            <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">Add a PDF to annotate</h3>
            <p className="mb-6 text-sm text-muted-foreground">Upload a new file or pick one you've already uploaded</p>
            {pdfError && (
              <p className="mb-4 text-sm text-red-500">{pdfError}</p>
            )}
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={pdfLoading || disabled}
                className="flex items-center gap-2 rounded-lg bg-rose-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
              >
                {pdfLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Upload size={15} />
                    Upload new PDF
                  </>
                )}
              </button>
              <span className="text-xs text-muted-foreground">or</span>
              <button
                onClick={() => setShowFilePicker(true)}
                disabled={pdfLoading || disabled}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                <FolderOpen size={15} />
                Browse uploaded files
              </button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Max upload size: 50 MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
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
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading PDF...</span>
        </div>
      )
    }

    if (pdfError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <p className="text-red-500">{pdfError}</p>
          <button
            onClick={() => { setPdfError(null); setPdfLoading(false) }}
            className="rounded-lg bg-surface-hover px-4 py-2 text-sm"
          >
            Retry
          </button>
        </div>
      )
    }

    // ────────────────────────────────────────────────────────
    // RENDER: Main editor
    // ────────────────────────────────────────────────────────
    return (
      <div ref={containerRef} className="flex h-full flex-col" tabIndex={-1}>
        {/* ── Toolbar ─────────────────────────────────────────── */}
        <div className="flex flex-col border-b border-border bg-surface">

          {/* Tab bar row */}
          <div className="flex items-center gap-0.5 px-2 pt-1.5">
            {/* Tab buttons */}
            {([ 
              { id: 'annotate' as const, label: 'Annotate' },
              { id: 'view'     as const, label: 'View' },
              { id: 'pages'    as const, label: 'Pages' },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setToolbarTab(tab.id)}
                className={`rounded-t-md px-3 py-1 text-xs font-medium transition-colors ${
                  toolbarTab === tab.id
                    ? 'bg-surface-hover text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover/60'
                }`}
              >
                {tab.label}
              </button>
            ))}

            <div className="flex-1" />

            {/* Always-visible: Undo / Redo / Export */}
            <button title="Undo (Ctrl+Z)" onClick={undo} disabled={historyIdx <= 0}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30">
              <Undo2 size={15} />
            </button>
            <button title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={historyIdx >= history.length - 1}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30">
              <Redo2 size={15} />
            </button>
            <div className="mx-1 h-4 w-px bg-border" />
            <button
              title="Export annotated PDF"
              onClick={handleExportPdf}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-hover"
            >
              <Download size={14} />
              <span>Export</span>
            </button>
          </div>

          {/* Tab content row */}
          <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5 pt-0.5">

            {/* ── ANNOTATE tab ─────────────────────────────── */}
            {toolbarTab === 'annotate' && (
              <>
                {/* Drawing tools */}
                {tools.map(t => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.id}
                      title={t.label}
                      onClick={() => setTool(t.id)}
                      className={`rounded p-1.5 transition-colors ${
                        tool === t.id
                          ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                          : 'text-muted-foreground hover:bg-surface-hover'
                      }`}
                    >
                      <Icon size={16} />
                    </button>
                  )
                })}

                <div className="mx-1 h-5 w-px bg-border" />

                {/* Color picker */}
                {COLORS.map(c => (
                  <button
                    key={c}
                    title={c}
                    onClick={() => setColor(c)}
                    className={`h-5 w-5 rounded-full border transition-transform ${
                      color === c ? 'scale-125 border-foreground' : 'border-border'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}

                <div className="mx-1 h-5 w-px bg-border" />

                {/* Stroke size */}
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Size
                  <input
                    type="range" min={1} max={20} value={strokeSize}
                    onChange={e => setStrokeSize(Number(e.target.value))}
                    className="w-16"
                  />
                  <span className="w-4 text-center">{strokeSize}</span>
                </label>

                {/* Shape fill toggle — rect / circle */}
                {(tool === 'rectangle' || tool === 'circle') && (
                  <>
                    <div className="mx-1 h-5 w-px bg-border" />
                    <button
                      title={shapeFilled ? 'Filled (click to unfill)' : 'No fill (click to fill)'}
                      onClick={() => setShapeFilled(v => !v)}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        shapeFilled
                          ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                          : 'text-muted-foreground hover:bg-surface-hover'
                      }`}
                    >
                      Fill
                    </button>
                  </>
                )}

                {/* Double-ended arrow toggle */}
                {tool === 'arrow' && (
                  <>
                    <div className="mx-1 h-5 w-px bg-border" />
                    <button
                      title={doubleEndedArrow ? 'Double-headed (click for single)' : 'Single arrow (click for double)'}
                      onClick={() => setDoubleEndedArrow(v => !v)}
                      className={`rounded px-2 py-1 text-base transition-colors ${
                        doubleEndedArrow
                          ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                          : 'text-muted-foreground hover:bg-surface-hover'
                      }`}
                    >
                      ↔
                    </button>
                  </>
                )}
              </>
            )}

            {/* ── VIEW tab ─────────────────────────────────── */}
            {toolbarTab === 'view' && (
              <>
                {/* Zoom */}
                <button title="Zoom out" onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30">
                  <ZoomOut size={16} />
                </button>
                <input
                  type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.05} value={zoom}
                  onChange={handleZoomSlider} className="w-24"
                  title={`Zoom: ${Math.round(zoom * 100)}%`}
                />
                <button title="Zoom in" onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30">
                  <ZoomIn size={16} />
                </button>
                <span className="min-w-[3rem] text-center text-xs text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <button title="Fit to width" onClick={handleFitWidth}
                  className="rounded px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover">
                  W
                </button>
                <button title="Fit to page" onClick={handleFitPage}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover">
                  <Maximize size={14} />
                </button>

                <div className="mx-1 h-5 w-px bg-border" />

                {/* Rotate */}
                <button title="Rotate 90° counter-clockwise"
                  onClick={() => setViewRotation(r => ((r + 270) % 360) as 0 | 90 | 180 | 270)}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover">
                  <RotateCcw size={15} />
                </button>
                <select
                  value={viewRotation}
                  onChange={e => setViewRotation(Number(e.target.value) as 0 | 90 | 180 | 270)}
                  title="Page rotation"
                  className="rounded border border-border bg-surface px-1 py-0.5 text-xs text-muted-foreground focus:outline-none"
                >
                  <option value={0}>0°</option>
                  <option value={90}>90° CW</option>
                  <option value={180}>180°</option>
                  <option value={270}>90° CCW</option>
                </select>
                <button title="Rotate 90° clockwise"
                  onClick={() => setViewRotation(r => ((r + 90) % 360) as 0 | 90 | 180 | 270)}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover">
                  <RotateCw size={15} />
                </button>

                <div className="mx-1 h-5 w-px bg-border" />

                {/* Text layer */}
                <button
                  title={showTextLayer ? 'Hide PDF text layer' : 'Show PDF text layer (enables text selection & search)'}
                  onClick={() => {
                    setShowTextLayer(v => {
                      if (v) { setSearchVisible(false); setSearchQuery('') }
                      return !v
                    })
                  }}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                    showTextLayer
                      ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                      : 'text-muted-foreground hover:bg-surface-hover'
                  }`}
                >
                  <Layers size={14} />
                  Text layer
                </button>

                {/* Search */}
                <button
                  title="Find in PDF (Ctrl+F)"
                  onClick={() => {
                    setShowTextLayer(true)
                    setSearchVisible(v => { if (!v) setSearchQuery(''); return true })
                  }}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                    searchVisible ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400' : 'text-muted-foreground hover:bg-surface-hover'
                  }`}
                >
                  <Search size={14} />
                  Find
                </button>
              </>
            )}

            {/* ── PAGES tab ────────────────────────────────── */}
            {toolbarTab === 'pages' && (
              <>
                {/* Thumbnails */}
                <button
                  title="Toggle page thumbnails"
                  onClick={() => setShowThumbnails(v => !v)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                    showThumbnails
                      ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                      : 'text-muted-foreground hover:bg-surface-hover'
                  }`}
                >
                  <PanelLeft size={14} />
                  Thumbnails
                </button>

                <div className="mx-1 h-5 w-px bg-border" />

                {/* Insert before */}
                <button
                  title="Insert blank page before current page"
                  onClick={() => insertBlankPage(currentPage - 1)}
                  disabled={disabled}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
                >
                  <Plus size={13} />
                  Before
                </button>

                {/* Page navigation */}
                <button title="Previous page (←)"
                  onClick={() => goToPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage <= 0}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30">
                  <ChevronLeft size={16} />
                </button>
                <span className="min-w-[4rem] text-center text-xs text-muted-foreground">
                  {currentPage + 1} / {totalPages}
                </span>
                <button title="Next page (→)"
                  onClick={() => goToPage(Math.min(totalPages - 1, currentPage + 1))}
                  disabled={currentPage >= totalPages - 1}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30">
                  <ChevronRight size={16} />
                </button>

                {/* Insert after */}
                <button
                  title="Insert blank page after current page"
                  onClick={() => insertBlankPage(currentPage)}
                  disabled={disabled}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
                >
                  <Plus size={13} />
                  After
                </button>

                <div className="mx-1 h-5 w-px bg-border" />

                {/* Delete page */}
                <button
                  title={pages.length <= 1 ? 'Cannot delete the only page' : 'Delete current page'}
                  onClick={() => {
                    const pg = pages.find(p => p.pageNumber === currentPage)
                    if (pg?.isBlank) { deletePage(currentPage) } else { setDeleteConfirmIdx(currentPage) }
                  }}
                  disabled={disabled || pages.length <= 1}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30"
                >
                  <Trash2 size={13} />
                  Delete page
                </button>
              </>
            )}

          </div>
        </div>

        {/* Find/search bar */}
        {searchVisible && showTextLayer && (
          <div className="flex items-center gap-1.5 border-b border-border bg-surface px-3 py-1.5">
            <Search size={13} className="shrink-0 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              placeholder="Find in PDF…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') navigateSearch(e.shiftKey ? -1 : 1)
                if (e.key === 'Escape') { setSearchVisible(false); setSearchQuery('') }
              }}
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
            {searchQuery.trim() && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {searchMatchCount === 0
                  ? 'No results'
                  : `${searchCurrentIdx + 1} / ${searchMatchCount}`}
              </span>
            )}
            <button
              onClick={() => navigateSearch(-1)}
              disabled={searchMatchCount === 0}
              title="Previous match (Shift+Enter)"
              className="rounded p-0.5 text-muted-foreground hover:bg-surface-hover disabled:opacity-30"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => navigateSearch(1)}
              disabled={searchMatchCount === 0}
              title="Next match (Enter)"
              className="rounded p-0.5 text-muted-foreground hover:bg-surface-hover disabled:opacity-30"
            >
              <ChevronDown size={14} />
            </button>
            <button
              onClick={() => { setSearchVisible(false); setSearchQuery('') }}
              title="Close search (Escape)"
              className="rounded p-0.5 text-muted-foreground hover:bg-surface-hover"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Canvas area + optional thumbnail strip */}
        <div className="flex flex-1 overflow-hidden">
          {/* Thumbnail strip */}
          {showThumbnails && (
            <div className="flex w-28 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-border bg-surface p-1.5">
              {pages.map((pg, i) => (
                <button
                  key={i}
                  onClick={() => goToPage(pg.pageNumber)}
                  className={`flex flex-col items-center gap-0.5 rounded-md border p-1 transition-colors ${
                    pg.pageNumber === currentPage
                      ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20'
                      : 'border-border hover:bg-surface-hover'
                  }`}
                >
                  {thumbnailUrls[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnailUrls[i]}
                      alt={`Page ${i + 1}`}
                      className="w-full rounded object-contain shadow-sm"
                      style={{ maxHeight: 90 }}
                    />
                  ) : (
                    <div className="flex h-16 w-full items-center justify-center rounded bg-neutral-100 dark:bg-neutral-700">
                      <span className="text-xs text-muted-foreground">{pg.isBlank ? '\u25A1' : '\u22EF'}</span>
                    </div>
                  )}
                  <span className="text-[10px] text-muted-foreground">{i + 1}</span>
                  {pg.isBlank && (
                    <span className="text-[9px] italic text-rose-400">blank</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Canvas scroll area */}
          <div ref={scrollAreaRef} className="relative flex-1 overflow-auto bg-neutral-200 dark:bg-neutral-800">
            {/* Delete page confirmation overlay */}
            {deleteConfirmIdx !== null && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="rounded-xl bg-surface p-6 shadow-xl">
                  <p className="mb-1 text-sm font-medium text-foreground">Delete this page?</p>
                  <p className="mb-4 text-xs text-muted-foreground">The original PDF file is unchanged.</p>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setDeleteConfirmIdx(null)}
                      className="rounded-lg px-3 py-1.5 text-sm hover:bg-surface-hover"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => deletePage(deleteConfirmIdx!)}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Outer div reserves the correct bounding-box size in the scroll area */}
            <div
              className="relative mx-auto my-4"
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
                  display: showTextLayer ? 'block' : 'none',
                  pointerEvents: showTextLayer && tool === 'textselect' ? 'auto' : 'none',
                }}
              />
              {/* Annotation overlay layer */}
              <canvas
                ref={annotCanvasRef}
                className="absolute left-0 top-0"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  pointerEvents: tool === 'textselect' ? 'none' : 'auto',
                  cursor:
                    tool === 'pen' || tool === 'highlighter'
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
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onDoubleClick={handleDoubleClick}
              />
              </div>{/* end rotation wrapper */}

              {/* Text formatting toolbar — rendered at 0° outside the rotation wrapper */}
              {tool === 'select' && selectedId && (() => {
                const pageAnnot = getPageAnnotations(currentPage)
                const ta = pageAnnot.textAnnotations.find(t => t.id === selectedId)
                if (!ta) return null
                const { vx, vy } = logicalToVisual(ta.x, ta.y)
                return (
                  <div
                    className="absolute z-40 flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1.5 py-1 shadow-md"
                    style={{ left: vx, top: Math.max(0, vy - 40) }}
                  >
                    <button
                      onMouseDown={e => { e.preventDefault(); toggleTextBold(ta.id) }}
                      title="Bold"
                      className={`rounded p-1 ${
                        ta.bold
                          ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                          : 'text-muted-foreground hover:bg-surface-hover'
                      }`}
                    >
                      <Bold size={13} />
                    </button>
                    <button
                      onMouseDown={e => { e.preventDefault(); toggleTextItalic(ta.id) }}
                      title="Italic"
                      className={`rounded p-1 ${
                        ta.italic
                          ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                          : 'text-muted-foreground hover:bg-surface-hover'
                      }`}
                    >
                      <Italic size={13} />
                    </button>
                    <div className="mx-0.5 h-4 w-px bg-border" />
                    <button
                      onMouseDown={e => { e.preventDefault(); changeTextFontSize(ta.id, -2) }}
                      title="Decrease font size"
                      className="rounded px-1.5 text-sm text-muted-foreground hover:bg-surface-hover"
                    >−</button>
                    <span className="min-w-[2.5rem] text-center text-[11px] text-muted-foreground">{ta.fontSize}px</span>
                    <button
                      onMouseDown={e => { e.preventDefault(); changeTextFontSize(ta.id, 2) }}
                      title="Increase font size"
                      className="rounded px-1.5 text-sm text-muted-foreground hover:bg-surface-hover"
                    >+</button>
                    <div className="mx-0.5 h-4 w-px bg-border" />
                    {COLORS.map(c => (
                      <button
                        key={c}
                        title={`Text color: ${c}`}
                        onMouseDown={e => { e.preventDefault(); changeTextColor(ta.id, c) }}
                        className={`h-4 w-4 rounded-full border transition-transform ${
                          ta.color === c ? 'scale-125 border-foreground' : 'border-border'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <div className="mx-0.5 h-4 w-px bg-border" />
                    <select
                      value={ta.fontFamily ?? 'sans-serif'}
                      onMouseDown={e => e.stopPropagation()}
                      onChange={e => changeTextFontFamily(ta.id, e.target.value)}
                      className="rounded border border-border bg-surface py-0.5 text-[11px] text-muted-foreground focus:outline-none"
                      title="Font family"
                    >
                      <option value="sans-serif">Sans</option>
                      <option value="serif">Serif</option>
                      <option value="monospace">Mono</option>
                    </select>
                  </div>
                )
              })()}


              {/* Shape formatting toolbar — fill + double-ended arrow for selected shape */}
              {tool === 'select' && selectedId && (() => {
                const pageAnnot = getPageAnnotations(currentPage)
                const shape = pageAnnot.shapes.find(s => s.id === selectedId)
                if (!shape) return null
                const { vx, vy } = logicalToVisual(Math.min(shape.x1, shape.x2), Math.min(shape.y1, shape.y2))
                return (
                  <div
                    className="absolute z-40 flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1.5 py-1 shadow-md"
                    style={{ left: vx, top: Math.max(0, vy - 40) }}
                  >
                    {(shape.type === 'rectangle' || shape.type === 'circle') && (
                      <button
                        onMouseDown={e => {
                          e.preventDefault()
                          const newPages = updatePageAnnotations(currentPage, page => ({
                            ...page,
                            shapes: page.shapes.map(s =>
                              s.id === shape.id ? { ...s, filled: !s.filled } : s
                            ),
                          }))
                          setPages(newPages)
                          pushHistory(newPages)
                          emitChange(newPages)
                        }}
                        title={shape.filled ? 'Remove fill' : 'Add fill'}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                          shape.filled
                            ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                            : 'text-muted-foreground hover:bg-surface-hover'
                        }`}
                      >
                        Fill
                      </button>
                    )}
                    {shape.type === 'arrow' && (
                      <button
                        onMouseDown={e => {
                          e.preventDefault()
                          const newPages = updatePageAnnotations(currentPage, page => ({
                            ...page,
                            shapes: page.shapes.map(s =>
                              s.id === shape.id ? { ...s, doubleEnded: !s.doubleEnded } : s
                            ),
                          }))
                          setPages(newPages)
                          pushHistory(newPages)
                          emitChange(newPages)
                        }}
                        title={shape.doubleEnded ? 'Single arrow' : 'Double-headed arrow'}
                        className={`rounded px-1.5 py-0.5 text-base transition-colors ${
                          shape.doubleEnded
                            ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                            : 'text-muted-foreground hover:bg-surface-hover'
                        }`}
                      >
                        ↔
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* Sticky notes overlay — rendered at 0° outside the rotation wrapper */}              {getPageAnnotations(currentPage).stickyNotes?.map(sn => {
                const { vx, vy } = logicalToVisual(sn.x, sn.y)
                return (
                <div
                  key={sn.id}
                  className="absolute z-30 flex flex-col overflow-hidden rounded-md shadow-md"
                  style={{
                    left: vx,
                    top: vy,
                    width: sn.collapsed ? 32 : sn.width * zoom,
                    height: sn.collapsed ? 28 : sn.height * zoom,
                    backgroundColor: STICKY_COLORS[sn.color],
                    border: `1.5px solid ${
                      selectedId === sn.id ? '#3b82f6' : 'rgba(0,0,0,0.15)'
                    }`,
                  }}
                >
                  {/* Sticky header / drag handle */}
                  <div
                    className="flex shrink-0 cursor-move select-none items-center justify-between px-1.5"
                    style={{ backgroundColor: 'rgba(0,0,0,0.08)', minHeight: 22 }}
                    onMouseDown={e => {
                      e.stopPropagation()
                      const startX = e.clientX
                      const startY = e.clientY
                      const origX = sn.x
                      const origY = sn.y
                      const onMove = (me: MouseEvent) => {
                        const { dx, dy } = screenDeltaToLogical(me.clientX - startX, me.clientY - startY)
                        updateStickyNote(sn.id, { x: origX + dx, y: origY + dy })
                      }
                      const onUp = () => {
                        window.removeEventListener('mousemove', onMove)
                        window.removeEventListener('mouseup', onUp)
                        commitStickyMove()
                      }
                      window.addEventListener('mousemove', onMove)
                      window.addEventListener('mouseup', onUp)
                    }}
                  >
                    {/* Color swatches (visible when expanded) */}
                    {!sn.collapsed && (
                      <div className="flex gap-0.5">
                        {(Object.keys(STICKY_COLORS) as StickyColor[]).map(c => (
                          <button
                            key={c}
                            title={c}
                            onMouseDown={e => {
                              e.stopPropagation()
                              updateStickyNote(sn.id, { color: c }, true)
                            }}
                            className="h-2.5 w-2.5 rounded-full border border-black/10 transition-transform hover:scale-125"
                            style={{ backgroundColor: STICKY_COLORS[c] }}
                          />
                        ))}
                      </div>
                    )}
                    <div className="ml-auto flex gap-0.5">
                      <button
                        onMouseDown={e => {
                          e.stopPropagation()
                          updateStickyNote(sn.id, { collapsed: !sn.collapsed }, true)
                        }}
                        title={sn.collapsed ? 'Expand' : 'Collapse'}
                        className="rounded px-0.5 text-[11px] leading-none text-black/40 hover:text-black/80"
                      >{sn.collapsed ? '\u25A1' : '\u2212'}</button>
                      <button
                        onMouseDown={e => {
                          e.stopPropagation()
                          deleteStickyNote(sn.id)
                        }}
                        title="Delete sticky note"
                        className="rounded px-0.5 text-[11px] leading-none text-black/40 hover:text-red-600"
                      >\u00D7</button>
                    </div>
                  </div>
                  {/* Sticky body */}
                  {!sn.collapsed && (
                    <textarea
                      className="flex-1 resize-none bg-transparent p-1.5 text-xs text-black outline-none placeholder:text-black/40"
                      placeholder="Add a note..."
                      value={sn.text}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => setSelectedId(sn.id)}
                      onChange={e => updateStickyNote(sn.id, { text: e.target.value })}
                      onBlur={commitStickyMove}
                    />
                  )}
                  {/* Resize handle */}
                  {!sn.collapsed && (
                    <div
                      className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize"
                      style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '0 0 4px 0' }}
                      onMouseDown={e => {
                        e.stopPropagation()
                        const startX = e.clientX
                        const startY = e.clientY
                        const origW = sn.width
                        const origH = sn.height
                        const onMove = (me: MouseEvent) => {
                          updateStickyNote(sn.id, {
                            width: Math.max(100, origW + (me.clientX - startX) / zoom),
                            height: Math.max(80, origH + (me.clientY - startY) / zoom),
                          })
                        }
                        const onUp = () => {
                          window.removeEventListener('mousemove', onMove)
                          window.removeEventListener('mouseup', onUp)
                          commitStickyMove()
                        }
                        window.addEventListener('mousemove', onMove)
                        window.addEventListener('mouseup', onUp)
                      }}
                    />
                  )}
                </div>
                )
              })}

              {/* Text editing overlay — rendered at 0° outside the rotation wrapper */}
              {editingText && (() => {
                const { vx, vy } = logicalToVisual(editingText.x, editingText.y)
                return (
                  <textarea
                    ref={textAreaRef}
                    autoFocus
                    className="absolute rounded border border-blue-400 bg-white p-1 text-black outline-none dark:bg-black/80 dark:text-white"
                    style={{
                      left: vx,
                      top: vy,
                      width: editingText.width * zoom,
                      minHeight: editingText.height * zoom,
                      fontSize: editingText.fontSize * zoom,
                      color: editingText.color,
                      resize: 'both',
                    }}
                    value={editingText.text}
                    onChange={e =>
                      setEditingText(prev =>
                        prev ? { ...prev, text: e.target.value } : null
                      )
                    }
                    onBlur={commitText}
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        setEditingText(null)
                      } else if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        commitText()
                      }
                    }}
                  />
                )
              })()}
            </div>
          </div>
        </div>
      </div>
    )
  }
)

export default PdfAnnotationEditor
