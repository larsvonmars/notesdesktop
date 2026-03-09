'use client'

import {
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
} from 'lucide-react'
import { uploadFile, getFileSignedUrl, downloadFile } from '@/lib/file-storage'

// ============================================================================
// TYPES
// ============================================================================

type PdfTool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'rectangle' | 'circle' | 'arrow' | 'sticky'
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
}

export interface ShapeAnnotation {
  id: string
  type: 'rectangle' | 'circle' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  strokeWidth: number
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
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        const thumbCanvas = document.createElement('canvas')
        if (page.isBlank) {
          const w = naturalWidth > 0 ? Math.round(naturalWidth * 0.18) : 112
          const h = naturalHeight > 0 ? Math.round(naturalHeight * 0.18) : 155
          thumbCanvas.width = w
          thumbCanvas.height = h
          const ctx = thumbCanvas.getContext('2d')!
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.strokeStyle = '#e5e7eb'
          ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
          urls.push(thumbCanvas.toDataURL())
        } else if (pdfDoc && page.pdfPageNumber) {
          try {
            const pdfPage = await pdfDoc.getPage(page.pdfPageNumber)
            const vp = pdfPage.getViewport({ scale: 0.18 })
            thumbCanvas.width = vp.width
            thumbCanvas.height = vp.height
            const ctx = thumbCanvas.getContext('2d')!
            await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise
            urls.push(thumbCanvas.toDataURL())
          } catch {
            urls.push('')
          }
        } else {
          urls.push('')
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
      }

      // Draw shape preview
      if (shapePreview) {
        drawShape(ctx, shapePreview, scale, false)
      }

      // Draw text annotations
      for (const ta of pageAnnot.textAnnotations) {
        ctx.save()
        const fontStyle = `${ta.italic ? 'italic ' : ''}${ta.bold ? 'bold ' : ''}${ta.fontSize * scale}px sans-serif`
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
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      } else if (shape.type === 'circle') {
        const rx = Math.abs(x2 - x1) / 2
        const ry = Math.abs(y2 - y1) / 2
        const cx = (x1 + x2) / 2
        const cy = (y1 + y2) / 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (shape.type === 'arrow') {
        // Line
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        // Arrowhead
        const angle = Math.atan2(y2 - y1, x2 - x1)
        const headLen = 12 * scale
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
        ctx.stroke()
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
          // Remove stroke under pointer
          const pageAnnot = getPageAnnotations(currentPage)
          const hitRadius = 10 / zoom
          const remaining = pageAnnot.strokes.filter(s => {
            return !s.points.some(p =>
              Math.abs(p.x - pos.x) < hitRadius && Math.abs(p.y - pos.y) < hitRadius
            )
          })
          if (remaining.length !== pageAnnot.strokes.length) {
            const newPages = updatePageAnnotations(currentPage, p => ({ ...p, strokes: remaining }))
            setPages(newPages)
            pushHistory(newPages)
            emitChange(newPages)
          }
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
        } else if (tool === 'rectangle' || tool === 'circle' || tool === 'arrow') {
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

          // Check text annotations
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

          if (!hit) {
            setSelectedId(null)
            setDragOffset(null)
          }
          setIsDrawing(hit)
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [disabled, tool, color, currentPage, zoom, pages]
    )

    const handlePointerMove = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return
        e.preventDefault()
        const pos = getPointerPos(e)

        if (tool === 'pen' || tool === 'highlighter') {
          setCurrentStrokePoints(prev => [...prev, pos])
        } else if ((tool === 'rectangle' || tool === 'circle' || tool === 'arrow') && shapeStart) {
          setShapePreview({
            id: 'preview',
            type: tool,
            x1: shapeStart.x,
            y1: shapeStart.y,
            x2: pos.x,
            y2: pos.y,
            color,
            strokeWidth: strokeSize,
          })
        } else if (tool === 'select' && selectedId && dragOffset) {
          // Move selected annotation
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
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isDrawing, tool, shapeStart, color, strokeSize, selectedId, dragOffset, currentPage, pages]
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
        } else if ((tool === 'rectangle' || tool === 'circle' || tool === 'arrow') && shapeStart) {
          const pos = getPointerPos(e)
          const minDist = 5 / zoom
          if (Math.abs(pos.x - shapeStart.x) > minDist || Math.abs(pos.y - shapeStart.y) > minDist) {
            const newShape: ShapeAnnotation = {
              id: uid(),
              type: tool,
              x1: shapeStart.x,
              y1: shapeStart.y,
              x2: pos.x,
              y2: pos.y,
              color,
              strokeWidth: strokeSize,
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
        }

        setIsDrawing(false)
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isDrawing, tool, currentStrokePoints, color, strokeSize, currentPage, shapeStart, selectedId, pages, zoom]
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
    // Delete selected annotation
    // ────────────────────────────────────────────────────────
    useEffect(() => {
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedId && tool === 'select' && !editingText) {
            const newPages = updatePageAnnotations(currentPage, page => ({
              ...page,
              textAnnotations: page.textAnnotations.filter(t => t.id !== selectedId),
              shapes: page.shapes.filter(s => s.id !== selectedId),
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
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedId, tool, editingText, currentPage, updatePageAnnotations, pushHistory, emitChange, undo, redo])

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

    // Ctrl/Cmd + scroll wheel zoom
    useEffect(() => {
      const el = scrollAreaRef.current
      if (!el) return
      function onWheel(e: WheelEvent) {
        if (!(e.ctrlKey || e.metaKey)) return
        e.preventDefault()
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
        setZoom(prev => {
          const newZoom = clampZoom(prev + delta)
          // We push emitChange via a microtask so state is in sync
          queueMicrotask(() => emitChange(pages, currentPage, newZoom))
          return newZoom
        })
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      return () => el.removeEventListener('wheel', onWheel)
    }, [clampZoom, emitChange, pages, currentPage])

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
        if (file.size > 10 * 1024 * 1024) {
          setPdfError('PDF must be under 10 MB')
          return
        }

        setPdfLoading(true)
        setPdfError(null)
        try {
          const folderPath = 'pdf-annotations'
          const result = await uploadFile(file, folderPath)
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
      [onChange, pushHistory]
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

        const pdf = new jsPDF({
          orientation: defaultW > defaultH ? 'landscape' : 'portrait',
          unit: 'px',
          format: [defaultW, defaultH],
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
            pdf.addPage([canvasW, canvasH], canvasW > canvasH ? 'landscape' : 'portrait')
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
            tempCtx.font = `${ta.italic ? 'italic ' : ''}${ta.bold ? 'bold ' : ''}${ta.fontSize * exportScale}px sans-serif`
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

          const imgData = tempCanvas.toDataURL('image/png')
          pdf.addImage(imgData, 'PNG', 0, 0, canvasW, canvasH)
          tempCanvas.remove()
        }

        pdf.save('annotated.pdf')
      } catch (err) {
        console.error('PDF export failed:', err)
      }
    }, [pdfDoc, pages, getPageAnnotations, naturalWidth, naturalHeight])

    // ────────────────────────────────────────────────────────
    // Tool buttons
    // ────────────────────────────────────────────────────────
    const tools: { id: PdfTool; icon: typeof Pen; label: string }[] = [
      { id: 'select', icon: MousePointer2, label: 'Select' },
      { id: 'pen', icon: Pen, label: 'Pen' },
      { id: 'highlighter', icon: Highlighter, label: 'Highlighter' },
      { id: 'eraser', icon: Eraser, label: 'Eraser' },
      { id: 'text', icon: Type, label: 'Text' },
      { id: 'rectangle', icon: Square, label: 'Rectangle' },
      { id: 'circle', icon: Circle, label: 'Circle' },
      { id: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
      { id: 'sticky', icon: StickyNoteIcon, label: 'Sticky Note' },
    ]

    // ────────────────────────────────────────────────────────
    // RENDER: Upload prompt (no PDF yet)
    // ────────────────────────────────────────────────────────
    if (!value?.pdfStoragePath) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <div className="rounded-xl border-2 border-dashed border-border p-12 text-center">
            <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">Upload a PDF to annotate</h3>
            <p className="mb-4 text-sm text-muted-foreground">Max file size: 10 MB</p>
            {pdfError && (
              <p className="mb-4 text-sm text-red-500">{pdfError}</p>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={pdfLoading || disabled}
              className="rounded-lg bg-rose-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
            >
              {pdfLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </span>
              ) : (
                'Choose PDF File'
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
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
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-2 py-1.5">
          {/* Tool buttons */}
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
              type="range"
              min={1}
              max={20}
              value={strokeSize}
              onChange={e => setStrokeSize(Number(e.target.value))}
              className="w-16"
            />
            <span className="w-4 text-center">{strokeSize}</span>
          </label>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Undo/Redo */}
          <button
            title="Undo (Ctrl+Z)"
            onClick={undo}
            disabled={historyIdx <= 0}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            <Undo2 size={16} />
          </button>
          <button
            title="Redo (Ctrl+Shift+Z)"
            onClick={redo}
            disabled={historyIdx >= history.length - 1}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            <Redo2 size={16} />
          </button>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Zoom */}
          <button
            title="Zoom out"
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={zoom}
            onChange={handleZoomSlider}
            className="w-20"
            title={`Zoom: ${Math.round(zoom * 100)}%`}
          />
          <button
            title="Zoom in"
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            <ZoomIn size={16} />
          </button>
          <span className="min-w-[3rem] text-center text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            title="Fit to width"
            onClick={handleFitWidth}
            className="rounded px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover"
          >
            W
          </button>
          <button
            title="Fit to page"
            onClick={handleFitPage}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover"
          >
            <Maximize size={14} />
          </button>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Rotate */}
          <button
            title="Rotate 90° counter-clockwise"
            onClick={() => setViewRotation(r => ((r + 270) % 360) as 0 | 90 | 180 | 270)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover"
          >
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
          <button
            title="Rotate 90° clockwise"
            onClick={() => setViewRotation(r => ((r + 90) % 360) as 0 | 90 | 180 | 270)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover"
          >
            <RotateCw size={15} />
          </button>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Page navigation */}
          <button
            title="Toggle page thumbnails"
            onClick={() => setShowThumbnails(v => !v)}
            className={`rounded p-1.5 transition-colors ${
              showThumbnails
                ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                : 'text-muted-foreground hover:bg-surface-hover'
            }`}
          >
            <PanelLeft size={16} />
          </button>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button
            title="Insert blank page before current page"
            onClick={() => insertBlankPage(currentPage - 1)}
            disabled={disabled}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            <Plus size={13} />
          </button>
          <button
            title="Previous page"
            onClick={() => goToPage(Math.max(0, currentPage - 1))}
            disabled={currentPage <= 0}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[4rem] text-center text-xs text-muted-foreground">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            title="Next page"
            onClick={() => goToPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage >= totalPages - 1}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
          <button
            title="Insert blank page after current page"
            onClick={() => insertBlankPage(currentPage)}
            disabled={disabled}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            <Plus size={13} />
          </button>
          <button
            title={pages.length <= 1 ? 'Cannot delete the only page' : 'Delete current page'}
            onClick={() => {
              const pg = pages.find(p => p.pageNumber === currentPage)
              if (pg?.isBlank) {
                deletePage(currentPage)
              } else {
                setDeleteConfirmIdx(currentPage)
              }
            }}
            disabled={disabled || pages.length <= 1}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            <Trash2 size={14} />
          </button>

          <div className="flex-1" />

          {/* Export */}
          <button
            title="Export annotated PDF"
            onClick={handleExportPdf}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-hover"
          >
            <Download size={14} />
            Export PDF
          </button>
        </div>

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
              {/* Annotation overlay layer */}
              <canvas
                ref={annotCanvasRef}
                className="absolute left-0 top-0"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
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
                      : 'crosshair',
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
              {/* Text formatting toolbar — shown when a text annotation is selected */}
              {tool === 'select' && selectedId && (() => {
                const pageAnnot = getPageAnnotations(currentPage)
                const ta = pageAnnot.textAnnotations.find(t => t.id === selectedId)
                if (!ta) return null
                return (
                  <div
                    className="absolute z-40 flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1.5 py-1 shadow-md"
                    style={{ left: ta.x * zoom, top: Math.max(0, ta.y * zoom - 40) }}
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
                  </div>
                )
              })()}
              {/* Sticky notes overlay */}
              {getPageAnnotations(currentPage).stickyNotes?.map(sn => (
                <div
                  key={sn.id}
                  className="absolute z-30 flex flex-col overflow-hidden rounded-md shadow-md"
                  style={{
                    left: sn.x * zoom,
                    top: sn.y * zoom,
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
                        const dx = (me.clientX - startX) / zoom
                        const dy = (me.clientY - startY) / zoom
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
                </div>
              ))}
              {/* Text editing overlay */}
              {editingText && (
                <textarea
                  ref={textAreaRef}
                  autoFocus
                  className="absolute rounded border border-blue-400 bg-white/80 p-1 text-black outline-none dark:bg-black/80 dark:text-white"
                  style={{
                    left: editingText.x * zoom,
                    top: editingText.y * zoom,
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
              )}
              </div>{/* end rotation wrapper */}
            </div>
          </div>
        </div>
      </div>
    )
  }
)

export default PdfAnnotationEditor
