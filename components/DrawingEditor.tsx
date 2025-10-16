'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useMemo,
  PointerEvent as ReactPointerEvent
} from 'react'
import { getStroke } from 'perfect-freehand'

export interface DrawingEditorHandle {
  focus: () => void
  getDrawingData: () => DrawingData
  setDrawingData: (data: DrawingData) => void
  clear: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

export interface Point {
  x: number
  y: number
  pressure?: number
}

export interface Stroke {
  points: Point[]
  color: string
  size: number
  tool: 'pen' | 'highlighter' | 'eraser'
}

export interface DrawingPage {
  strokes: Stroke[]
  background?: 'none' | 'grid' | 'lines' | 'dots'
}

export interface DrawingData {
  pages: DrawingPage[]
  width: number
  height: number
  currentPage?: number
}

interface DrawingEditorProps {
  value: DrawingData | null
  onChange: (data: DrawingData) => void
  disabled?: boolean
}

const DEFAULT_DRAWING_DATA: DrawingData = {
  pages: [{ strokes: [], background: 'none' }],
  width: 800,
  height: 600,
  currentPage: 0
}

// Drawing tool configurations
const TOOL_CONFIG = {
  pen: {
    size: 2,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true
  },
  highlighter: {
    size: 12,
    thinning: 0.1,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false
  },
  eraser: {
    size: 20,
    thinning: 0,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false
  }
}

const COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Purple', value: '#9333ea' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Yellow', value: '#fbbf24' },
  { name: 'Pink', value: '#ec4899' }
]

const SIZES = [
  { name: 'Thin', value: 1 },
  { name: 'Medium', value: 2 },
  { name: 'Thick', value: 4 },
  { name: 'Very Thick', value: 6 }
]

const MAX_CANVAS_DISPLAY_WIDTH = 1200

const DrawingEditor = forwardRef<DrawingEditorHandle, DrawingEditorProps>(
  ({ value, onChange, disabled = false }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const backgroundCanvasRef = useRef<HTMLCanvasElement>(null)
    const [drawingData, setDrawingData] = useState<DrawingData>(
      value || DEFAULT_DRAWING_DATA
    )
    const [currentStroke, setCurrentStroke] = useState<Point[]>([])
    const [isDrawing, setIsDrawing] = useState(false)
    const [history, setHistory] = useState<DrawingData[]>([drawingData])
    const [historyIndex, setHistoryIndex] = useState(0)
    const [showExportMenu, setShowExportMenu] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [currentPageIndex, setCurrentPageIndex] = useState(value?.currentPage || 0)
    
    // Tool settings
    const [currentTool, setCurrentTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen')
    const [currentColor, setCurrentColor] = useState('#000000')
    const [currentSize, setCurrentSize] = useState(2)
    const [backgroundType, setBackgroundType] = useState<'none' | 'grid' | 'lines' | 'dots'>(
      value?.pages[value?.currentPage || 0]?.background || 'none'
    )

    // Draw background pattern
    const drawBackground = useCallback(() => {
      const canvas = backgroundCanvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Clear background
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (backgroundType === 'none') return

      ctx.strokeStyle = '#e5e7eb'
      ctx.lineWidth = 1

      if (backgroundType === 'grid') {
        // Draw grid - 20px spacing
        const spacing = 20
        for (let x = 0; x <= canvas.width; x += spacing) {
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, canvas.height)
          ctx.stroke()
        }
        for (let y = 0; y <= canvas.height; y += spacing) {
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(canvas.width, y)
          ctx.stroke()
        }
      } else if (backgroundType === 'lines') {
        // Draw horizontal lines - 30px spacing (like lined paper)
        const spacing = 30
        for (let y = spacing; y <= canvas.height; y += spacing) {
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(canvas.width, y)
          ctx.stroke()
        }
      } else if (backgroundType === 'dots') {
        // Draw dots - 20px spacing
        const spacing = 20
        ctx.fillStyle = '#d1d5db'
        for (let x = spacing; x <= canvas.width; x += spacing) {
          for (let y = spacing; y <= canvas.height; y += spacing) {
            ctx.beginPath()
            ctx.arc(x, y, 1.5, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }, [backgroundType])

    // Convert points to SVG path using perfect-freehand
    const getSvgPathFromStroke = useCallback((points: number[][]): string => {
      if (!points.length) return ''

      const d = points.reduce(
        (acc, [x0, y0], i, arr) => {
          const [x1, y1] = arr[(i + 1) % arr.length]
          acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
          return acc
        },
        ['M', ...points[0], 'Q']
      )

      d.push('Z')
      return d.join(' ')
    }, [])

    // Get current page
    const currentPage = useMemo(() => {
      return drawingData.pages[currentPageIndex] || { strokes: [], background: 'none' }
    }, [drawingData, currentPageIndex])

    const canvasAspectPercentage = useMemo(() => {
      if (!drawingData.width) return 75
      return (drawingData.height / drawingData.width) * 100
    }, [drawingData.height, drawingData.width])

    // Render the canvas
    const render = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw all strokes from current page
      currentPage.strokes.forEach((stroke) => {
        const config = TOOL_CONFIG[stroke.tool]
        const outlinePoints = getStroke(stroke.points, {
          size: stroke.size * 8,
          thinning: config.thinning,
          smoothing: config.smoothing,
          streamline: config.streamline,
          simulatePressure: config.simulatePressure
        })

        const pathData = getSvgPathFromStroke(outlinePoints)
        const path = new Path2D(pathData)

        if (stroke.tool === 'highlighter') {
          ctx.globalAlpha = 0.3
        } else if (stroke.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out'
        } else {
          ctx.globalAlpha = 1
          ctx.globalCompositeOperation = 'source-over'
        }

        ctx.fillStyle = stroke.color
        ctx.fill(path)

        // Reset
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
      })

      // Draw current stroke if drawing
      if (isDrawing && currentStroke.length > 0) {
        const config = TOOL_CONFIG[currentTool]
        const outlinePoints = getStroke(currentStroke, {
          size: currentSize * 8,
          thinning: config.thinning,
          smoothing: config.smoothing,
          streamline: config.streamline,
          simulatePressure: config.simulatePressure
        })

        const pathData = getSvgPathFromStroke(outlinePoints)
        const path = new Path2D(pathData)

        if (currentTool === 'highlighter') {
          ctx.globalAlpha = 0.3
        } else if (currentTool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out'
        }

        ctx.fillStyle = currentColor
        ctx.fill(path)

        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
      }
    }, [currentPage, currentStroke, isDrawing, currentTool, currentColor, currentSize, getSvgPathFromStroke])

    // Update canvas when data changes
    useEffect(() => {
      render()
    }, [render])

    // Update background when type changes
    useEffect(() => {
      drawBackground()
    }, [drawBackground])

    // Sync with external value
    useEffect(() => {
      if (value && value !== drawingData) {
        setDrawingData(value)
        const pageIndex = value.currentPage || 0
        setCurrentPageIndex(pageIndex)
        setBackgroundType(value.pages[pageIndex]?.background || 'none')
      }
    }, [value])

    // Get point from pointer event
    const getPoint = useCallback((e: ReactPointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0, pressure: 0.5 }

      const rect = canvas.getBoundingClientRect()
      const scaleX = rect.width ? canvas.width / rect.width : 1
      const scaleY = rect.height ? canvas.height / rect.height : 1

      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        pressure: e.pressure || 0.5
      }
    }, [])

    // Handle pointer down
    const handlePointerDown = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (disabled) return

        // Palm rejection: Ignore touch events if pointerType is not pen
        // This helps prevent accidental palm touches while using a stylus
        if (e.pointerType === 'touch' && e.width > 10) {
          // Likely a palm touch (large contact area)
          return
        }

        e.preventDefault()
        const point = getPoint(e)
        setCurrentStroke([point])
        setIsDrawing(true)

        // Capture pointer
        const canvas = canvasRef.current
        if (canvas) {
          canvas.setPointerCapture(e.pointerId)
        }
      },
      [disabled, getPoint]
    )

    // Handle pointer move
    const handlePointerMove = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing || disabled) return

        e.preventDefault()
        const point = getPoint(e)
        setCurrentStroke((prev) => [...prev, point])
      },
      [isDrawing, disabled, getPoint]
    )

    // Handle pointer up
    const handlePointerUp = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing || disabled) return

        e.preventDefault()

        if (currentStroke.length > 0) {
          const newStroke: Stroke = {
            points: currentStroke,
            color: currentColor,
            size: currentSize,
            tool: currentTool
          }

          // Update current page with new stroke
          const updatedPages = [...drawingData.pages]
          updatedPages[currentPageIndex] = {
            ...updatedPages[currentPageIndex],
            strokes: [...updatedPages[currentPageIndex].strokes, newStroke],
            background: backgroundType
          }

          const newData: DrawingData = {
            ...drawingData,
            pages: updatedPages,
            currentPage: currentPageIndex
          }

          setDrawingData(newData)
          onChange(newData)

          // Add to history
          const newHistory = history.slice(0, historyIndex + 1)
          newHistory.push(newData)
          setHistory(newHistory)
          setHistoryIndex(newHistory.length - 1)
        }

        setCurrentStroke([])
        setIsDrawing(false)

        // Release pointer
        const canvas = canvasRef.current
        if (canvas) {
          canvas.releasePointerCapture(e.pointerId)
        }
      },
      [
        isDrawing,
        disabled,
        currentStroke,
        currentColor,
        currentSize,
        currentTool,
        drawingData,
        onChange,
        history,
        historyIndex
      ]
    )

    // Undo
    const undo = useCallback(() => {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        const newData = history[newIndex]
        setHistoryIndex(newIndex)
        setDrawingData(newData)
        onChange(newData)
      }
    }, [historyIndex, history, onChange])

    // Redo
    const redo = useCallback(() => {
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1
        const newData = history[newIndex]
        setHistoryIndex(newIndex)
        setDrawingData(newData)
        onChange(newData)
      }
    }, [historyIndex, history, onChange])

    // Clear current page
    const clear = useCallback(() => {
      const updatedPages = [...drawingData.pages]
      updatedPages[currentPageIndex] = {
        strokes: [],
        background: backgroundType
      }

      const newData: DrawingData = {
        ...drawingData,
        pages: updatedPages,
        currentPage: currentPageIndex
      }
      setDrawingData(newData)
      onChange(newData)

      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(newData)
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
    }, [drawingData, onChange, history, historyIndex, backgroundType, currentPageIndex])

    // Change background type for current page
    const changeBackground = useCallback((type: 'none' | 'grid' | 'lines' | 'dots') => {
      setBackgroundType(type)
      
      const updatedPages = [...drawingData.pages]
      updatedPages[currentPageIndex] = {
        ...updatedPages[currentPageIndex],
        background: type
      }

      const newData: DrawingData = {
        ...drawingData,
        pages: updatedPages,
        currentPage: currentPageIndex
      }
      setDrawingData(newData)
      onChange(newData)
    }, [drawingData, onChange, currentPageIndex])

    // Add new page
    const addPage = useCallback(() => {
      const newPage: DrawingPage = {
        strokes: [],
        background: 'none'
      }

      const newData: DrawingData = {
        ...drawingData,
        pages: [...drawingData.pages, newPage],
        currentPage: drawingData.pages.length
      }

      setDrawingData(newData)
      onChange(newData)
      setCurrentPageIndex(drawingData.pages.length)
      setBackgroundType('none')

      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(newData)
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
    }, [drawingData, onChange, history, historyIndex])

    // Delete current page
    const deletePage = useCallback(() => {
      setShowDeleteModal(true)
    }, [])

    // Delete only the current page
    const deleteCurrentPageOnly = useCallback(() => {
      if (drawingData.pages.length <= 1) return // Don't delete the last page

      const updatedPages = drawingData.pages.filter((_, index) => index !== currentPageIndex)
      const newPageIndex = Math.min(currentPageIndex, updatedPages.length - 1)

      const newData: DrawingData = {
        ...drawingData,
        pages: updatedPages,
        currentPage: newPageIndex
      }

      setDrawingData(newData)
      onChange(newData)
      setCurrentPageIndex(newPageIndex)
      setBackgroundType(updatedPages[newPageIndex]?.background || 'none')

      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(newData)
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
      
      setShowDeleteModal(false)
    }, [drawingData, onChange, history, historyIndex, currentPageIndex])

    // Delete all pages (entire note)
    const deleteAllPages = useCallback(() => {
      // Reset to a single blank page
      const newData: DrawingData = {
        ...DEFAULT_DRAWING_DATA,
        currentPage: 0
      }

      setDrawingData(newData)
      onChange(newData)
      setCurrentPageIndex(0)
      setBackgroundType('none')

      const newHistory = [newData]
      setHistory(newHistory)
      setHistoryIndex(0)
      
      setShowDeleteModal(false)
    }, [onChange])

    // Navigate to specific page
    const goToPage = useCallback((pageIndex: number) => {
      if (pageIndex < 0 || pageIndex >= drawingData.pages.length) return

      setCurrentPageIndex(pageIndex)
      setBackgroundType(drawingData.pages[pageIndex]?.background || 'none')

      const newData: DrawingData = {
        ...drawingData,
        currentPage: pageIndex
      }
      onChange(newData)
    }, [drawingData, onChange])

    // Navigate to previous page
    const previousPage = useCallback(() => {
      if (currentPageIndex > 0) {
        goToPage(currentPageIndex - 1)
      }
    }, [currentPageIndex, goToPage])

    // Navigate to next page
    const nextPage = useCallback(() => {
      if (currentPageIndex < drawingData.pages.length - 1) {
        goToPage(currentPageIndex + 1)
      }
    }, [currentPageIndex, drawingData.pages.length, goToPage])

    // Export current page to PNG
    const exportToPNG = useCallback(() => {
      const canvas = canvasRef.current
      const bgCanvas = backgroundCanvasRef.current
      if (!canvas || !bgCanvas) return

      // Create a temporary canvas to combine background and drawing
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      const ctx = tempCanvas.getContext('2d')
      if (!ctx) return

      // Fill with white background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)

      // Draw background pattern
      ctx.drawImage(bgCanvas, 0, 0)

      // Draw the drawing
      ctx.drawImage(canvas, 0, 0)

      // Convert to blob and download
      tempCanvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `drawing-page-${currentPageIndex + 1}-${Date.now()}.png`
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')

      setShowExportMenu(false)
    }, [currentPageIndex])

    // Export current page to SVG
    const exportToSVG = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Create SVG content
      let svgContent = `<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">`
      
      // Add white background
      svgContent += `<rect width="${canvas.width}" height="${canvas.height}" fill="white"/>`

      // Add background pattern if present
      if (backgroundType === 'grid') {
        const spacing = 20
        for (let x = 0; x <= canvas.width; x += spacing) {
          svgContent += `<line x1="${x}" y1="0" x2="${x}" y2="${canvas.height}" stroke="#e5e7eb" stroke-width="1"/>`
        }
        for (let y = 0; y <= canvas.height; y += spacing) {
          svgContent += `<line x1="0" y1="${y}" x2="${canvas.width}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`
        }
      } else if (backgroundType === 'lines') {
        const spacing = 30
        for (let y = spacing; y <= canvas.height; y += spacing) {
          svgContent += `<line x1="0" y1="${y}" x2="${canvas.width}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`
        }
      } else if (backgroundType === 'dots') {
        const spacing = 20
        for (let x = spacing; x <= canvas.width; x += spacing) {
          for (let y = spacing; y <= canvas.height; y += spacing) {
            svgContent += `<circle cx="${x}" cy="${y}" r="1.5" fill="#d1d5db"/>`
          }
        }
      }

      // Add strokes from current page
      currentPage.strokes.forEach((stroke) => {
        const config = TOOL_CONFIG[stroke.tool]
        const outlinePoints = getStroke(stroke.points, {
          size: stroke.size * 8,
          thinning: config.thinning,
          smoothing: config.smoothing,
          streamline: config.streamline,
          simulatePressure: config.simulatePressure
        })

        const pathData = getSvgPathFromStroke(outlinePoints)
        const opacity = stroke.tool === 'highlighter' ? '0.3' : '1'
        svgContent += `<path d="${pathData}" fill="${stroke.color}" opacity="${opacity}"/>`
      })

      svgContent += '</svg>'

      // Download SVG
      const blob = new Blob([svgContent], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `drawing-page-${currentPageIndex + 1}-${Date.now()}.svg`
      a.click()
      URL.revokeObjectURL(url)

      setShowExportMenu(false)
    }, [currentPage, backgroundType, getSvgPathFromStroke, currentPageIndex])

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focus: () => canvasRef.current?.focus(),
      getDrawingData: () => drawingData,
      setDrawingData: (data: DrawingData) => {
        setDrawingData(data)
        const newHistory = [data]
        setHistory(newHistory)
        setHistoryIndex(0)
      },
      clear,
      undo,
      redo,
      canUndo: () => historyIndex > 0,
      canRedo: () => historyIndex < history.length - 1
    }))

    return (
      <div className="flex flex-col h-full bg-white">
        {/* Compact Toolbar */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-gray-200 bg-gray-50">
          {/* Tools */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setCurrentTool('pen')}
              className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
                currentTool === 'pen' ? 'bg-blue-100 text-blue-600' : 'text-gray-700'
              }`}
              title="Pen"
              disabled={disabled}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m12 19 7-7 3 3-7 7-3-3z" />
                <path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="m2 2 7.586 7.586" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentTool('highlighter')}
              className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
                currentTool === 'highlighter' ? 'bg-blue-100 text-blue-600' : 'text-gray-700'
              }`}
              title="Highlighter"
              disabled={disabled}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 11-6 6v3h9l3-3" />
                <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentTool('eraser')}
              className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
                currentTool === 'eraser' ? 'bg-blue-100 text-blue-600' : 'text-gray-700'
              }`}
              title="Eraser"
              disabled={disabled}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                <path d="M22 21H7" />
                <path d="m5 11 9 9" />
              </svg>
            </button>
          </div>

          <div className="w-px h-5 bg-gray-300" />

          {/* Colors */}
          {currentTool !== 'eraser' && (
            <div className="flex items-center gap-0.5">
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setCurrentColor(color.value)}
                  className={`w-5 h-5 rounded border transition-all ${
                    currentColor === color.value
                      ? 'border-blue-500 ring-1 ring-blue-300'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                  disabled={disabled}
                />
              ))}
            </div>
          )}

          <div className="w-px h-5 bg-gray-300" />

          {/* Size - Icons instead of text */}
          <div className="flex items-center gap-0.5">
            {SIZES.map((size, idx) => (
              <button
                key={size.value}
                onClick={() => setCurrentSize(size.value)}
                className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
                  currentSize === size.value
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-700'
                }`}
                title={size.name}
                disabled={disabled}
              >
                <div className={`rounded-full bg-currentColor`} style={{ 
                  width: `${4 + idx * 2}px`, 
                  height: `${4 + idx * 2}px` 
                }} />
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-gray-300" />

          {/* Background - Icons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => changeBackground('none')}
              className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
                backgroundType === 'none' ? 'bg-blue-100 text-blue-600' : 'text-gray-700'
              }`}
              title="No Background"
              disabled={disabled}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            </button>
            <button
              onClick={() => changeBackground('grid')}
              className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
                backgroundType === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-700'
              }`}
              title="Grid"
              disabled={disabled}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              onClick={() => changeBackground('lines')}
              className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
                backgroundType === 'lines' ? 'bg-blue-100 text-blue-600' : 'text-gray-700'
              }`}
              title="Lines"
              disabled={disabled}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <button
              onClick={() => changeBackground('dots')}
              className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
                backgroundType === 'dots' ? 'bg-blue-100 text-blue-600' : 'text-gray-700'
              }`}
              title="Dots"
              disabled={disabled}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="6" r="1" fill="currentColor" />
                <circle cx="12" cy="6" r="1" fill="currentColor" />
                <circle cx="18" cy="6" r="1" fill="currentColor" />
                <circle cx="6" cy="12" r="1" fill="currentColor" />
                <circle cx="12" cy="12" r="1" fill="currentColor" />
                <circle cx="18" cy="12" r="1" fill="currentColor" />
                <circle cx="6" cy="18" r="1" fill="currentColor" />
                <circle cx="12" cy="18" r="1" fill="currentColor" />
                <circle cx="18" cy="18" r="1" fill="currentColor" />
              </svg>
            </button>
          </div>

          <div className="flex-1" />

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={undo}
              disabled={disabled || historyIndex === 0}
              className="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
              title="Undo"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={disabled || historyIndex === history.length - 1}
              className="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
              title="Redo"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 7v6h-6" />
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
              </svg>
            </button>
            <button
              onClick={clear}
              disabled={disabled || currentPage.strokes.length === 0}
              className="p-1.5 rounded hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
              title="Clear Page"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          </div>

          <div className="w-px h-5 bg-gray-300" />

          {/* Page Navigation */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={previousPage}
              disabled={disabled || currentPageIndex === 0}
              className="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
              title="Previous Page"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            
            <div className="px-1.5 text-xs text-gray-700 font-medium min-w-[45px] text-center">
              {currentPageIndex + 1}/{drawingData.pages.length}
            </div>

            <button
              onClick={nextPage}
              disabled={disabled || currentPageIndex === drawingData.pages.length - 1}
              className="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
              title="Next Page"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            <button
              onClick={addPage}
              disabled={disabled}
              className="p-1.5 rounded hover:bg-green-100 hover:text-green-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
              title="Add New Page"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <button
              onClick={deletePage}
              disabled={disabled || drawingData.pages.length <= 1}
              className="p-1.5 rounded hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
              title="Delete Page"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          </div>

          <div className="w-px h-5 bg-gray-300" />

          {/* Export Button */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={disabled || currentPage.strokes.length === 0}
              className="p-1.5 rounded hover:bg-green-100 hover:text-green-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
              title="Export"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>

            {/* Export Menu */}
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[120px]">
                <button
                  onClick={exportToPNG}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-100 transition-colors text-gray-700"
                >
                  PNG
                </button>
                <button
                  onClick={exportToSVG}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-100 transition-colors text-gray-700"
                >
                  SVG
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-gray-100 px-3 py-4 sm:px-6">
          <div className="flex h-full w-full items-center justify-center">
            <div
              className="relative w-full max-w-full rounded-lg shadow-lg bg-white overflow-hidden"
              style={{ maxWidth: MAX_CANVAS_DISPLAY_WIDTH }}
            >
              <div
                className="relative w-full"
                style={{ paddingBottom: `${canvasAspectPercentage}%` }}
              >
                {/* Background Canvas (for grid/lines/dots) */}
                <canvas
                  ref={backgroundCanvasRef}
                  width={drawingData.width}
                  height={drawingData.height}
                  className="absolute inset-0 rounded-lg bg-white pointer-events-none"
                  style={{ width: '100%', height: '100%' }}
                />
                {/* Drawing Canvas */}
                <canvas
                  ref={canvasRef}
                  width={drawingData.width}
                  height={drawingData.height}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="absolute inset-0 rounded-lg cursor-crosshair touch-none"
                  style={{ width: '100%', height: '100%', touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Delete Page?
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                What would you like to delete?
              </p>
              
              <div className="space-y-3">
                {/* Delete Current Page Only */}
                {drawingData.pages.length > 1 && (
                  <button
                    onClick={deleteCurrentPageOnly}
                    className="w-full px-4 py-3 text-left rounded-lg border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50 transition-colors"
                  >
                    <div className="font-medium text-gray-900">Delete Current Page Only</div>
                    <div className="text-xs text-gray-600 mt-1">
                      Remove page {currentPageIndex + 1} of {drawingData.pages.length}
                    </div>
                  </button>
                )}
                
                {/* Delete All Pages (Clear Everything) */}
                <button
                  onClick={deleteAllPages}
                  className="w-full px-4 py-3 text-left rounded-lg border-2 border-red-200 hover:border-red-400 hover:bg-red-50 transition-colors"
                >
                  <div className="font-medium text-gray-900">Delete All Pages</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Clear entire drawing ({drawingData.pages.length} {drawingData.pages.length === 1 ? 'page' : 'pages'})
                  </div>
                </button>

                {/* Cancel */}
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="w-full px-4 py-2 text-center rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
)

DrawingEditor.displayName = 'DrawingEditor'

export default DrawingEditor
