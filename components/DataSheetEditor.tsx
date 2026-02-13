'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useMemo,
  KeyboardEvent,
  ClipboardEvent,
  ChangeEvent,
} from 'react'
import {
  Plus,
  Trash2,
  Download,
  Upload,
  Table2,
  ArrowDown,
  ArrowRight,
  ArrowUpDown,
  GripVertical,
  Calculator,
  X,
  Type,
} from 'lucide-react'
import Papa from 'papaparse'

// ============================================================================
// TYPES
// ============================================================================

export interface DataSheetEditorHandle {
  getData: () => DataSheetData
  setData: (data: DataSheetData) => void
}

export interface DataSheetData {
  /** Column definitions */
  columns: ColumnDef[]
  /** Row data – each row is an array of cell values (raw strings/formulas) */
  rows: string[][]
  /** Optional: column widths in px keyed by column index */
  columnWidths?: Record<number, number>
  /** Optional: row heights in px keyed by row index */
  rowHeights?: Record<number, number>
  /** Number of frozen rows at top */
  frozenRows?: number
  /** Number of frozen columns on the left (excluding row number column) */
  frozenCols?: number
  /** Per-column filter text */
  filters?: Record<number, string>
  /** Active sort definition */
  sort?: {
    col: number
    direction: 'asc' | 'desc'
  } | null
  /** Row indices marked as header rows (bold, colored background) */
  headerRows?: number[]
}

interface ColumnDef {
  /** Display header */
  name: string
  /** Column type hint (for future formatting) */
  type: 'text' | 'number'
}

interface CellAddress {
  row: number
  col: number
}

interface DataSheetEditorProps {
  initialData?: DataSheetData | null
  onChange?: (data: DataSheetData) => void
  disabled?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

const DEFAULT_COLS = 6
const DEFAULT_ROWS = 20
const MIN_COL_WIDTH = 60
const DEFAULT_COL_WIDTH = 120
const MIN_ROW_HEIGHT = 20
const DEFAULT_ROW_HEIGHT = 24
const HEADER_ROW_HEIGHT = 28
const FILTER_ROW_HEIGHT = 28
const BODY_ROW_HEIGHT = 24
const ROW_INDEX_COL_WIDTH = 44

/** Generate a default empty sheet */
function createEmptySheet(cols = DEFAULT_COLS, rows = DEFAULT_ROWS): DataSheetData {
  const columns: ColumnDef[] = Array.from({ length: cols }, (_, i) => ({
    name: columnIndexToLetter(i),
    type: 'text' as const,
  }))
  const rowData: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''))
  return { columns, rows: rowData }
}

/** Convert 0-based column index to spreadsheet letter (0→A, 1→B, … 25→Z, 26→AA) */
function columnIndexToLetter(index: number): string {
  let result = ''
  let n = index
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

/** Parse a cell reference like "A1" into { col, row } (0-based) */
function parseCellRef(ref: string): CellAddress | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/i)
  if (!match) return null
  const letters = match[1].toUpperCase()
  const rowNum = parseInt(match[2], 10) - 1
  let colNum = 0
  for (let i = 0; i < letters.length; i++) {
    colNum = colNum * 26 + (letters.charCodeAt(i) - 64)
  }
  colNum -= 1 // 0-based
  return { row: rowNum, col: colNum }
}

/** Parse a range like "A1:B3" into an array of cell addresses */
function parseRange(range: string): CellAddress[] | null {
  const parts = range.split(':')
  if (parts.length !== 2) return null
  const start = parseCellRef(parts[0])
  const end = parseCellRef(parts[1])
  if (!start || !end) return null
  const addresses: CellAddress[] = []
  for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
    for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
      addresses.push({ row: r, col: c })
    }
  }
  return addresses
}

function getSelectionBounds(selection: { start: CellAddress; end: CellAddress }) {
  return {
    top: Math.min(selection.start.row, selection.end.row),
    bottom: Math.max(selection.start.row, selection.end.row),
    left: Math.min(selection.start.col, selection.end.col),
    right: Math.max(selection.start.col, selection.end.col),
  }
}

function isCellInSelection(selection: { start: CellAddress; end: CellAddress } | null, row: number, col: number): boolean {
  if (!selection) return false
  const bounds = getSelectionBounds(selection)
  return row >= bounds.top && row <= bounds.bottom && col >= bounds.left && col <= bounds.right
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

/** Get the numeric value of a cell (returns NaN if not a number) */
function numericValue(val: string): number {
  if (val === '' || val === null || val === undefined) return 0
  const n = Number(val)
  return n
}

// ============================================================================
// FORMULA ENGINE
// ============================================================================

/**
 * Evaluate a formula string (starting with '=').
 * Supports: SUM, AVG/AVERAGE, MIN, MAX, COUNT, IF, ROUND, ABS, CONCAT,
 * basic arithmetic (+, -, *, /), and cell references (A1, B2:C5).
 */
function evaluateFormula(formula: string, rows: string[][], visited: Set<string> = new Set()): string {
  try {
    // Remove leading '='
    let expr = formula.slice(1).trim()

    // Resolve cell references and ranges inside function arguments
    const resolveValue = (ref: string): string => {
      ref = ref.trim()
      // Check for range (e.g., A1:B3)
      if (ref.includes(':')) {
        // Ranges should be expanded before reaching here
        return ref
      }
      const addr = parseCellRef(ref)
      if (!addr) return ref // Not a cell ref, return as-is (it's a literal)
      const key = `${addr.row},${addr.col}`
      if (visited.has(key)) return '#CIRC!' // Circular reference detection
      if (addr.row < 0 || addr.row >= rows.length) return '0'
      if (addr.col < 0 || addr.col >= (rows[0]?.length || 0)) return '0'
      const cellVal = rows[addr.row][addr.col]
      if (cellVal.startsWith('=')) {
        const newVisited = new Set(visited)
        newVisited.add(key)
        return evaluateFormula(cellVal, rows, newVisited)
      }
      return cellVal
    }

    /** Expand a range into an array of resolved numeric values */
    const expandRange = (rangeStr: string): number[] => {
      const addresses = parseRange(rangeStr)
      if (!addresses) return []
      return addresses.map(addr => {
        const key = `${addr.row},${addr.col}`
        if (visited.has(key)) return NaN
        if (addr.row < 0 || addr.row >= rows.length) return 0
        if (addr.col < 0 || addr.col >= (rows[0]?.length || 0)) return 0
        const cellVal = rows[addr.row][addr.col]
        if (cellVal.startsWith('=')) {
          const newVisited = new Set(visited)
          newVisited.add(key)
          return numericValue(evaluateFormula(cellVal, rows, newVisited))
        }
        return numericValue(cellVal)
      })
    }

    /** Expand a range into resolved string values */
    const expandRangeStrings = (rangeStr: string): string[] => {
      const addresses = parseRange(rangeStr)
      if (!addresses) return []
      return addresses.map(addr => {
        if (addr.row < 0 || addr.row >= rows.length) return ''
        if (addr.col < 0 || addr.col >= (rows[0]?.length || 0)) return ''
        const cellVal = rows[addr.row][addr.col]
        if (cellVal.startsWith('=')) {
          return evaluateFormula(cellVal, rows, new Set(visited))
        }
        return cellVal
      })
    }

    // ---- FUNCTION MATCHING ----
    const funcMatch = expr.match(/^([A-Z]+)\((.+)\)$/i)
    if (funcMatch) {
      const funcName = funcMatch[1].toUpperCase()
      const argsStr = funcMatch[2]

      // Parse function arguments (respecting nested parentheses)
      const parseArgs = (s: string): string[] => {
        const args: string[] = []
        let depth = 0
        let current = ''
        for (const ch of s) {
          if (ch === '(') depth++
          if (ch === ')') depth--
          if (ch === ',' && depth === 0) {
            args.push(current.trim())
            current = ''
          } else {
            current += ch
          }
        }
        if (current.trim()) args.push(current.trim())
        return args
      }

      const args = parseArgs(argsStr)

      /** Gather all numeric values from args (expanding ranges) */
      const gatherNumbers = (): number[] => {
        const nums: number[] = []
        for (const arg of args) {
          if (arg.includes(':')) {
            nums.push(...expandRange(arg))
          } else {
            nums.push(numericValue(resolveValue(arg)))
          }
        }
        return nums.filter(n => !isNaN(n))
      }

      switch (funcName) {
        case 'SUM': {
          const nums = gatherNumbers()
          return String(nums.reduce((a, b) => a + b, 0))
        }
        case 'AVG':
        case 'AVERAGE': {
          const nums = gatherNumbers()
          if (nums.length === 0) return '0'
          return String(nums.reduce((a, b) => a + b, 0) / nums.length)
        }
        case 'MIN': {
          const nums = gatherNumbers()
          if (nums.length === 0) return '0'
          return String(Math.min(...nums))
        }
        case 'MAX': {
          const nums = gatherNumbers()
          if (nums.length === 0) return '0'
          return String(Math.max(...nums))
        }
        case 'COUNT': {
          const nums = gatherNumbers()
          return String(nums.length)
        }
        case 'ROUND': {
          if (args.length < 1) return '#ARG!'
          const val = numericValue(resolveValue(args[0]))
          const decimals = args.length > 1 ? numericValue(resolveValue(args[1])) : 0
          return String(Number(val.toFixed(decimals)))
        }
        case 'ABS': {
          if (args.length < 1) return '#ARG!'
          return String(Math.abs(numericValue(resolveValue(args[0]))))
        }
        case 'IF': {
          if (args.length < 2) return '#ARG!'
          // Evaluate condition
          const condStr = args[0]
          let condResult = false
          // Support comparison operators
          const compMatch = condStr.match(/^(.+?)\s*(>=|<=|!=|<>|=|>|<)\s*(.+)$/)
          if (compMatch) {
            const lhs = numericValue(resolveValue(compMatch[1]))
            const rhs = numericValue(resolveValue(compMatch[3]))
            switch (compMatch[2]) {
              case '>': condResult = lhs > rhs; break
              case '<': condResult = lhs < rhs; break
              case '>=': condResult = lhs >= rhs; break
              case '<=': condResult = lhs <= rhs; break
              case '=': condResult = lhs === rhs; break
              case '!=': case '<>': condResult = lhs !== rhs; break
            }
          } else {
            condResult = numericValue(resolveValue(condStr)) !== 0
          }
          if (condResult) {
            return resolveValue(args[1])
          } else {
            return args.length > 2 ? resolveValue(args[2]) : ''
          }
        }
        case 'CONCAT': {
          const strs: string[] = []
          for (const arg of args) {
            if (arg.includes(':')) {
              strs.push(...expandRangeStrings(arg))
            } else {
              // Check if it's a quoted string
              const stripped = arg.replace(/^["']|["']$/g, '')
              const addr = parseCellRef(stripped)
              if (addr) {
                strs.push(resolveValue(stripped))
              } else {
                strs.push(stripped)
              }
            }
          }
          return strs.join('')
        }
        default:
          return `#NAME? (${funcName})`
      }
    }

    // ---- ARITHMETIC EXPRESSION ----
    // Replace cell references with their values
    const replaced = expr.replace(/[A-Z]+\d+/gi, (match) => {
      const val = resolveValue(match)
      const n = Number(val)
      return isNaN(n) ? '0' : String(n)
    })

    // Evaluate simple arithmetic (safe subset — no eval)
    const result = safeEvalArithmetic(replaced)
    return result
  } catch (e) {
    return '#ERR!'
  }
}

/**
 * Safe arithmetic evaluator — supports +, -, *, /, parentheses, and numbers.
 * No eval() — hand-rolled recursive descent parser.
 */
function safeEvalArithmetic(expr: string): string {
  let pos = 0
  const s = expr.replace(/\s/g, '')

  function parseExpr(): number {
    let result = parseTerm()
    while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos++]
      const term = parseTerm()
      result = op === '+' ? result + term : result - term
    }
    return result
  }

  function parseTerm(): number {
    let result = parseFactor()
    while (pos < s.length && (s[pos] === '*' || s[pos] === '/')) {
      const op = s[pos++]
      const factor = parseFactor()
      if (op === '/') {
        if (factor === 0) throw new Error('#DIV/0!')
        result = result / factor
      } else {
        result = result * factor
      }
    }
    return result
  }

  function parseFactor(): number {
    if (s[pos] === '(') {
      pos++ // skip '('
      const result = parseExpr()
      pos++ // skip ')'
      return result
    }
    // Unary minus
    if (s[pos] === '-') {
      pos++
      return -parseFactor()
    }
    // Number
    const start = pos
    while (pos < s.length && (s[pos] >= '0' && s[pos] <= '9' || s[pos] === '.')) {
      pos++
    }
    if (start === pos) return 0
    return Number(s.slice(start, pos))
  }

  try {
    const result = parseExpr()
    // Format: remove trailing zeros
    if (Number.isInteger(result)) return String(result)
    // Limit decimal places to avoid floating point noise
    return String(Math.round(result * 1e10) / 1e10)
  } catch (e: any) {
    return e.message || '#ERR!'
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

const SIZE_PRESETS = [
  { label: '4 × 10', cols: 4, rows: 10 },
  { label: '6 × 20', cols: 6, rows: 20 },
  { label: '10 × 30', cols: 10, rows: 30 },
  { label: '26 × 100', cols: 26, rows: 100 },
]

const DataSheetEditor = forwardRef<DataSheetEditorHandle, DataSheetEditorProps>(
  ({ initialData, onChange, disabled = false }, ref) => {
    // Show size picker when creating a brand-new sheet (no initialData)
    const [showSizePicker, setShowSizePicker] = useState(!initialData)
    const [sizeColsInput, setSizeColsInput] = useState('6')
    const [sizeRowsInput, setSizeRowsInput] = useState('20')

    const [data, setData] = useState<DataSheetData>(() => initialData || createEmptySheet())
    const [activeCell, setActiveCell] = useState<CellAddress | null>(null)
    const [editingCell, setEditingCell] = useState<CellAddress | null>(null)
    const [editValue, setEditValue] = useState('')
    const [selection, setSelection] = useState<{ start: CellAddress; end: CellAddress } | null>(null)
    const [isMouseSelecting, setIsMouseSelecting] = useState(false)
    const mouseSelectionAnchorRef = useRef<CellAddress | null>(null)
    const [isFillDragging, setIsFillDragging] = useState(false)
    const fillSourceBoundsRef = useRef<{ top: number; bottom: number; left: number; right: number } | null>(null)
    const fillSourceSelectionRef = useRef<{ start: CellAddress; end: CellAddress } | null>(null)
    const fillTargetCellRef = useRef<CellAddress | null>(null)
    const [resizingCol, setResizingCol] = useState<number | null>(null)
    const [resizeStartX, setResizeStartX] = useState(0)
    const [resizeStartWidth, setResizeStartWidth] = useState(0)
    const [resizingRow, setResizingRow] = useState<number | null>(null)
    const [resizeStartY, setResizeStartY] = useState(0)
    const [resizeStartHeight, setResizeStartHeight] = useState(0)
    const [formulaBarValue, setFormulaBarValue] = useState('')
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'row' | 'col' | 'cell'; index: number } | null>(null)

    const tableRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const colsInputRef = useRef<HTMLInputElement>(null)
    const [showResizePopover, setShowResizePopover] = useState(false)
    const [resizeColsInput, setResizeColsInput] = useState('')
    const [resizeRowsInput, setResizeRowsInput] = useState('')
    const resizePopoverRef = useRef<HTMLDivElement>(null)
    const resizeColsInputRef = useRef<HTMLInputElement>(null)

    // Auto-focus the columns input when size picker shows
    useEffect(() => {
      if (showSizePicker) {
        requestAnimationFrame(() => colsInputRef.current?.focus())
      }
    }, [showSizePicker])

    const handleCreateSheet = useCallback((cols: number, rows: number) => {
      const clampedCols = Math.max(1, Math.min(cols, 702)) // A–ZZ
      const clampedRows = Math.max(1, Math.min(rows, 10000))
      const newData = createEmptySheet(clampedCols, clampedRows)
      setData(newData)
      onChange?.(newData)
      setShowSizePicker(false)
    }, [onChange])

    const handleSizePickerSubmit = useCallback(() => {
      const cols = parseInt(sizeColsInput, 10)
      const rows = parseInt(sizeRowsInput, 10)
      if (isNaN(cols) || isNaN(rows) || cols < 1 || rows < 1) return
      handleCreateSheet(cols, rows)
    }, [sizeColsInput, sizeRowsInput, handleCreateSheet])

    // Keep data ref for latest access
    const dataRef = useRef(data)
    dataRef.current = data

    // ---- IMPERATIVE HANDLE ----
    useImperativeHandle(ref, () => ({
      getData: () => dataRef.current,
      setData: (newData: DataSheetData) => {
        setData(newData)
        setActiveCell(null)
        setEditingCell(null)
        setSelection(null)
      },
    }))

    // ---- NOTIFY PARENT ON CHANGE ----
    const notifyChange = useCallback((newData: DataSheetData) => {
      setData(newData)
      onChange?.(newData)
    }, [onChange])

    const formulaCacheRef = useRef<Map<string, { raw: string; value: string }>>(new Map())
    useEffect(() => {
      formulaCacheRef.current.clear()
    }, [data.rows])

    const frozenRows = data.frozenRows ?? 0
    const frozenCols = data.frozenCols ?? 0
    const filters = data.filters ?? {}
    const sort = data.sort ?? null
    const headerRowsSet = useMemo(() => new Set(data.headerRows ?? []), [data.headerRows])

    const visibleRowIndices = useMemo(() => {
      const indices = data.rows.map((_, idx) => idx)

      const filtered = indices.filter((rowIndex) => {
        for (let col = 0; col < data.columns.length; col++) {
          const filterTextRaw = filters[col] ?? ''
          const filterText = String(filterTextRaw).trim().toLowerCase()
          if (!filterText) continue

          const raw = data.rows[rowIndex]?.[col] ?? ''
          const display = raw.startsWith('=') ? evaluateFormula(raw, data.rows) : raw
          if (!String(display).toLowerCase().includes(filterText)) {
            return false
          }
        }
        return true
      })

      if (!sort) return filtered

      const { col, direction } = sort
      const sorted = [...filtered].sort((a, b) => {
        const av = data.rows[a]?.[col] ?? ''
        const bv = data.rows[b]?.[col] ?? ''
        const ad = av.startsWith('=') ? evaluateFormula(av, data.rows) : av
        const bd = bv.startsWith('=') ? evaluateFormula(bv, data.rows) : bv

        const an = Number(ad)
        const bn = Number(bd)
        let cmp = 0
        if (!isNaN(an) && !isNaN(bn)) {
          cmp = an - bn
        } else {
          cmp = String(ad).localeCompare(String(bd), undefined, { numeric: true, sensitivity: 'base' })
        }

        return direction === 'asc' ? cmp : -cmp
      })

      return sorted
    }, [data.rows, data.columns.length, filters, sort])

    const getFrozenLeft = useCallback((colIndex: number): number => {
      let left = ROW_INDEX_COL_WIDTH
      for (let c = 0; c < colIndex; c++) {
        left += data.columnWidths?.[c] ?? DEFAULT_COL_WIDTH
      }
      return left
    }, [data.columnWidths])

    /** Compute the CSS top offset for a frozen row (sum of header + filter + all previous row heights) */
    const getFrozenTop = useCallback((rowIndex: number): number => {
      let top = HEADER_ROW_HEIGHT + FILTER_ROW_HEIGHT
      for (let r = 0; r < rowIndex; r++) {
        top += data.rowHeights?.[r] ?? DEFAULT_ROW_HEIGHT
      }
      return top
    }, [data.rowHeights])

    // ---- RESIZE GRID (preserves existing data) ----
    const openResizePopover = useCallback(() => {
      setResizeColsInput(String(data.columns.length))
      setResizeRowsInput(String(data.rows.length))
      setShowResizePopover(true)
      requestAnimationFrame(() => resizeColsInputRef.current?.select())
    }, [data.columns.length, data.rows.length])

    const handleResizeGrid = useCallback((newCols: number, newRows: number) => {
      const clampedCols = Math.max(1, Math.min(newCols, 702))
      const clampedRows = Math.max(1, Math.min(newRows, 10000))

      const newColumns: ColumnDef[] = Array.from({ length: clampedCols }, (_, i) => ({
        name: columnIndexToLetter(i),
        type: (data.columns[i]?.type ?? 'text') as 'text' | 'number',
      }))

      const newRowsData: string[][] = Array.from({ length: clampedRows }, (_, ri) => {
        const existingRow = data.rows[ri]
        return Array.from({ length: clampedCols }, (_, ci) => existingRow?.[ci] ?? '')
      })

      const newWidths: Record<number, number> = {}
      if (data.columnWidths) {
        for (let i = 0; i < clampedCols; i++) {
          if (data.columnWidths[i] !== undefined) newWidths[i] = data.columnWidths[i]
        }
      }

      const newHeights: Record<number, number> = {}
      if (data.rowHeights) {
        for (let i = 0; i < clampedRows; i++) {
          if (data.rowHeights[i] !== undefined) newHeights[i] = data.rowHeights[i]
        }
      }

      const nextFilters: Record<number, string> = {}
      for (const [key, value] of Object.entries(data.filters ?? {})) {
        const col = Number(key)
        if (!isNaN(col) && col < clampedCols) {
          nextFilters[col] = value
        }
      }

      const nextSort = data.sort && data.sort.col < clampedCols ? data.sort : null
      const nextHeaderRows = (data.headerRows ?? []).filter(r => r < clampedRows)

      notifyChange({
        ...data,
        columns: newColumns,
        rows: newRowsData,
        columnWidths: Object.keys(newWidths).length ? newWidths : undefined,
        rowHeights: Object.keys(newHeights).length ? newHeights : undefined,
        filters: nextFilters,
        sort: nextSort,
        headerRows: nextHeaderRows.length ? nextHeaderRows : undefined,
        frozenRows: Math.min(data.frozenRows ?? 0, Math.max(clampedRows - 1, 0)),
        frozenCols: Math.min(data.frozenCols ?? 0, Math.max(clampedCols - 1, 0)),
      })

      if (activeCell && (activeCell.row >= clampedRows || activeCell.col >= clampedCols)) {
        setActiveCell(null)
      }

      setShowResizePopover(false)
    }, [data, notifyChange, activeCell])

    const handleResizeSubmit = useCallback(() => {
      const cols = parseInt(resizeColsInput, 10)
      const rows = parseInt(resizeRowsInput, 10)
      if (isNaN(cols) || isNaN(rows) || cols < 1 || rows < 1) return
      handleResizeGrid(cols, rows)
    }, [resizeColsInput, resizeRowsInput, handleResizeGrid])

    // Close resize popover on outside click
    useEffect(() => {
      if (!showResizePopover) return
      const handler = (e: MouseEvent) => {
        if (resizePopoverRef.current && !resizePopoverRef.current.contains(e.target as Node)) {
          setShowResizePopover(false)
        }
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [showResizePopover])

    // ---- CELL VALUE RESOLUTION (formula evaluation) ----
    const getCellDisplay = useCallback((row: number, col: number): string => {
      if (row < 0 || row >= data.rows.length) return ''
      if (col < 0 || col >= (data.rows[0]?.length || 0)) return ''
      const raw = data.rows[row][col]
      if (raw.startsWith('=')) {
        const key = `${row},${col}`
        const cached = formulaCacheRef.current.get(key)
        if (cached && cached.raw === raw) {
          return cached.value
        }

        const value = evaluateFormula(raw, data.rows)
        formulaCacheRef.current.set(key, { raw, value })
        return value
      }
      return raw
    }, [data.rows])

    // ---- CELL EDITING ----
    const startEditing = useCallback((row: number, col: number) => {
      if (disabled) return
      setEditingCell({ row, col })
      const raw = data.rows[row]?.[col] ?? ''
      setEditValue(raw)
      setFormulaBarValue(raw)
      // Focus the input after render
      requestAnimationFrame(() => inputRef.current?.focus())
    }, [disabled, data.rows])

    const commitEdit = useCallback(() => {
      if (!editingCell) return
      const { row, col } = editingCell
      const newRows = data.rows.map(r => [...r])
      if (row < newRows.length && col < (newRows[0]?.length || 0)) {
        newRows[row][col] = editValue
      }
      notifyChange({ ...data, rows: newRows })
      setEditingCell(null)
    }, [editingCell, editValue, data, notifyChange])

    const cancelEdit = useCallback(() => {
      setEditingCell(null)
      setEditValue('')
    }, [])

    const handleCellDoubleClick = useCallback((row: number, col: number) => {
      startEditing(row, col)
    }, [startEditing])

    const handleCellMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
      if (disabled || e.button !== 0 || isFillDragging) return
      if (editingCell) commitEdit()

      const anchor = e.shiftKey && activeCell ? activeCell : { row, col }
      mouseSelectionAnchorRef.current = anchor
      setActiveCell({ row, col })
      setSelection({ start: anchor, end: { row, col } })
      const raw = data.rows[row]?.[col] ?? ''
      setFormulaBarValue(raw)
      setIsMouseSelecting(true)
    }, [disabled, isFillDragging, editingCell, commitEdit, activeCell, data.rows])

    const handleCellMouseEnter = useCallback((row: number, col: number) => {
      if (isFillDragging) {
        fillTargetCellRef.current = { row, col }
        const sourceBounds = fillSourceBoundsRef.current
        if (sourceBounds) {
          setSelection({
            start: { row: Math.min(sourceBounds.top, row), col: Math.min(sourceBounds.left, col) },
            end: { row: Math.max(sourceBounds.bottom, row), col: Math.max(sourceBounds.right, col) },
          })
        }
        return
      }

      if (!isMouseSelecting || !mouseSelectionAnchorRef.current) return
      setSelection({ start: mouseSelectionAnchorRef.current, end: { row, col } })
      setActiveCell({ row, col })
      const raw = data.rows[row]?.[col] ?? ''
      setFormulaBarValue(raw)
    }, [isFillDragging, isMouseSelecting, data.rows])

    const beginFillDrag = useCallback((e: React.MouseEvent, row: number, col: number) => {
      if (disabled || e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const sourceSelection = selection ?? { start: { row, col }, end: { row, col } }
      fillSourceSelectionRef.current = sourceSelection
      fillSourceBoundsRef.current = getSelectionBounds(sourceSelection)
      fillTargetCellRef.current = { row, col }
      setIsFillDragging(true)
    }, [disabled, selection])

    useEffect(() => {
      if (!isMouseSelecting && !isFillDragging) return

      const handleMouseUp = () => {
        setIsMouseSelecting(false)
        mouseSelectionAnchorRef.current = null

        if (isFillDragging) {
          const sourceSelection = fillSourceSelectionRef.current
          const sourceBounds = fillSourceBoundsRef.current
          const target = fillTargetCellRef.current

          if (sourceSelection && sourceBounds && target) {
            const overall = {
              top: Math.min(sourceBounds.top, target.row),
              bottom: Math.max(sourceBounds.bottom, target.row),
              left: Math.min(sourceBounds.left, target.col),
              right: Math.max(sourceBounds.right, target.col),
            }

            const expanded =
              overall.top !== sourceBounds.top ||
              overall.bottom !== sourceBounds.bottom ||
              overall.left !== sourceBounds.left ||
              overall.right !== sourceBounds.right

            if (expanded) {
              const sourceHeight = sourceBounds.bottom - sourceBounds.top + 1
              const sourceWidth = sourceBounds.right - sourceBounds.left + 1
              const newRows = data.rows.map(r => [...r])

              for (let r = overall.top; r <= overall.bottom; r++) {
                for (let c = overall.left; c <= overall.right; c++) {
                  const inSource = r >= sourceBounds.top && r <= sourceBounds.bottom && c >= sourceBounds.left && c <= sourceBounds.right
                  if (inSource) continue

                  const sourceRow = sourceBounds.top + positiveModulo(r - sourceBounds.top, sourceHeight)
                  const sourceCol = sourceBounds.left + positiveModulo(c - sourceBounds.left, sourceWidth)

                  if (r < newRows.length && c < (newRows[0]?.length || 0)) {
                    newRows[r][c] = newRows[sourceRow]?.[sourceCol] ?? ''
                  }
                }
              }

              notifyChange({ ...data, rows: newRows })
              setSelection({
                start: { row: overall.top, col: overall.left },
                end: { row: overall.bottom, col: overall.right },
              })
            } else {
              setSelection(sourceSelection)
            }
          }
        }

        setIsFillDragging(false)
        fillSourceSelectionRef.current = null
        fillSourceBoundsRef.current = null
        fillTargetCellRef.current = null
      }

      window.addEventListener('mouseup', handleMouseUp)
      return () => window.removeEventListener('mouseup', handleMouseUp)
    }, [isMouseSelecting, isFillDragging, data, notifyChange])

    // ---- KEYBOARD NAVIGATION ----
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target) {
        const tagName = target.tagName.toLowerCase()
        const isTypingElement = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
        if (isTypingElement) {
          return
        }
      }

      if (disabled) return

      // Close context menu on Escape
      if (e.key === 'Escape' && contextMenu) {
        setContextMenu(null)
        e.preventDefault()
        return
      }

      if (editingCell) {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitEdit()
          // Move down
          setActiveCell(prev => prev ? { row: Math.min(prev.row + 1, data.rows.length - 1), col: prev.col } : null)
        } else if (e.key === 'Tab') {
          e.preventDefault()
          commitEdit()
          // Move right
          setActiveCell(prev => prev ? { row: prev.row, col: Math.min(prev.col + 1, (data.rows[0]?.length || 1) - 1) } : null)
        } else if (e.key === 'Escape') {
          cancelEdit()
        }
        return
      }

      if (!activeCell) return

      const { row, col } = activeCell
      const maxRow = data.rows.length - 1
      const maxCol = (data.rows[0]?.length || 1) - 1

      const moveActiveCell = (nextRow: number, nextCol: number) => {
        const next = { row: nextRow, col: nextCol }
        if (e.shiftKey) {
          setSelection(prev => ({
            start: prev?.start ?? activeCell,
            end: next,
          }))
        } else {
          setSelection(null)
        }
        setActiveCell(next)
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          moveActiveCell(Math.max(0, row - 1), col)
          break
        case 'ArrowDown':
          e.preventDefault()
          moveActiveCell(Math.min(maxRow, row + 1), col)
          break
        case 'ArrowLeft':
          e.preventDefault()
          moveActiveCell(row, Math.max(0, col - 1))
          break
        case 'ArrowRight':
          e.preventDefault()
          moveActiveCell(row, Math.min(maxCol, col + 1))
          break
        case 'Tab':
          e.preventDefault()
          if (e.shiftKey) {
            moveActiveCell(row, Math.max(0, col - 1))
          } else {
            moveActiveCell(row, Math.min(maxCol, col + 1))
          }
          break
        case 'Enter':
          e.preventDefault()
          startEditing(row, col)
          break
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          {
            const newRows = data.rows.map(r => [...r])
            if (selection) {
              const bounds = getSelectionBounds(selection)
              for (let r = bounds.top; r <= bounds.bottom; r++) {
                for (let c = bounds.left; c <= bounds.right; c++) {
                  if (r < newRows.length && c < (newRows[0]?.length || 0)) {
                    newRows[r][c] = ''
                  }
                }
              }
            } else {
              newRows[row][col] = ''
            }
            notifyChange({ ...data, rows: newRows })
            setFormulaBarValue('')
          }
          break
        case 'd':
        case 'D':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            const targetSelection = selection ?? { start: activeCell, end: activeCell }
            const bounds = getSelectionBounds(targetSelection)
            const sourceValue = data.rows[bounds.top]?.[bounds.left] ?? ''
            const newRows = data.rows.map(r => [...r])
            for (let r = bounds.top; r <= bounds.bottom; r++) {
              for (let c = bounds.left; c <= bounds.right; c++) {
                if (r === bounds.top && c === bounds.left) continue
                newRows[r][c] = sourceValue
              }
            }
            notifyChange({ ...data, rows: newRows })
          }
          break
        default:
          // Start typing to begin editing
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            setEditingCell({ row, col })
            setEditValue(e.key)
            setFormulaBarValue(e.key)
            setSelection(null)
            requestAnimationFrame(() => inputRef.current?.focus())
          }
          break
      }
    }, [disabled, editingCell, activeCell, data, commitEdit, cancelEdit, startEditing, notifyChange, contextMenu, selection])

    // Update formula bar when active cell changes
    useEffect(() => {
      if (activeCell && !editingCell) {
        const raw = data.rows[activeCell.row]?.[activeCell.col] ?? ''
        setFormulaBarValue(raw)
      }
    }, [activeCell, editingCell, data.rows])

    // ---- ROW / COLUMN OPERATIONS ----
    const addRow = useCallback((atIndex?: number) => {
      const colCount = data.columns.length
      const newRow = Array(colCount).fill('')
      const insertAt = atIndex ?? data.rows.length
      const newRows = [...data.rows]
      newRows.splice(insertAt, 0, newRow)
      // Shift header row indices at or after the insertion point
      const shiftedHeaders = (data.headerRows ?? []).map(r => r >= insertAt ? r + 1 : r)
      notifyChange({ ...data, rows: newRows, headerRows: shiftedHeaders.length ? shiftedHeaders : undefined })
    }, [data, notifyChange])

    const addColumn = useCallback((atIndex?: number) => {
      const insertAt = atIndex ?? data.columns.length
      const newCol: ColumnDef = { name: columnIndexToLetter(insertAt), type: 'text' }
      const newColumns = [...data.columns]
      newColumns.splice(insertAt, 0, newCol)
      // Re-letter columns
      const reletteredColumns = newColumns.map((c, i) => ({ ...c, name: columnIndexToLetter(i) }))
      const newRows = data.rows.map(r => {
        const nr = [...r]
        nr.splice(insertAt, 0, '')
        return nr
      })
      notifyChange({ ...data, columns: reletteredColumns, rows: newRows })
    }, [data, notifyChange])

    const deleteRow = useCallback((index: number) => {
      if (data.rows.length <= 1) return
      const newRows = data.rows.filter((_, i) => i !== index)
      // Remove deleted index from headers and shift indices above it down by 1
      const shiftedHeaders = (data.headerRows ?? [])
        .filter(r => r !== index)
        .map(r => r > index ? r - 1 : r)
      notifyChange({ ...data, rows: newRows, headerRows: shiftedHeaders.length ? shiftedHeaders : undefined })
      if (activeCell && activeCell.row === index) {
        setActiveCell(null)
      }
    }, [data, notifyChange, activeCell])

    const deleteColumn = useCallback((index: number) => {
      if (data.columns.length <= 1) return
      const newColumns = data.columns.filter((_, i) => i !== index)
      const reletteredColumns = newColumns.map((c, i) => ({ ...c, name: columnIndexToLetter(i) }))
      const newRows = data.rows.map(r => r.filter((_, i) => i !== index))
      notifyChange({ ...data, columns: reletteredColumns, rows: newRows })
      if (activeCell && activeCell.col === index) {
        setActiveCell(null)
      }
    }, [data, notifyChange, activeCell])

    // ---- COLUMN RESIZE ----
    const getColWidth = useCallback((colIndex: number): number => {
      return data.columnWidths?.[colIndex] ?? DEFAULT_COL_WIDTH
    }, [data.columnWidths])

    const getRowHeight = useCallback((rowIndex: number): number => {
      return data.rowHeights?.[rowIndex] ?? DEFAULT_ROW_HEIGHT
    }, [data.rowHeights])

    const handleResizeStart = useCallback((e: React.MouseEvent, colIndex: number) => {
      e.preventDefault()
      e.stopPropagation()
      setResizingCol(colIndex)
      setResizeStartX(e.clientX)
      setResizeStartWidth(getColWidth(colIndex))
    }, [getColWidth])

    useEffect(() => {
      if (resizingCol === null) return

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - resizeStartX
        const newWidth = Math.max(MIN_COL_WIDTH, resizeStartWidth + delta)
        setData(prev => ({
          ...prev,
          columnWidths: { ...prev.columnWidths, [resizingCol]: newWidth },
        }))
      }

      const handleMouseUp = () => {
        setResizingCol(null)
        onChange?.(dataRef.current)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }, [resizingCol, resizeStartX, resizeStartWidth, onChange])

    // ---- ROW RESIZE ----
    const handleRowResizeStart = useCallback((e: React.MouseEvent, rowIndex: number) => {
      e.preventDefault()
      e.stopPropagation()
      setResizingRow(rowIndex)
      setResizeStartY(e.clientY)
      setResizeStartHeight(getRowHeight(rowIndex))
    }, [getRowHeight])

    useEffect(() => {
      if (resizingRow === null) return

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientY - resizeStartY
        const newHeight = Math.max(MIN_ROW_HEIGHT, resizeStartHeight + delta)
        setData(prev => ({
          ...prev,
          rowHeights: { ...prev.rowHeights, [resizingRow]: newHeight },
        }))
      }

      const handleMouseUp = () => {
        setResizingRow(null)
        onChange?.(dataRef.current)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }, [resizingRow, resizeStartY, resizeStartHeight, onChange])

    // ---- CONTEXT MENU ----
    const handleContextMenu = useCallback((e: React.MouseEvent, type: 'row' | 'col' | 'cell', index: number) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, type, index })
    }, [])

    // Close context menu on click outside
    useEffect(() => {
      if (!contextMenu) return
      const handler = () => setContextMenu(null)
      document.addEventListener('click', handler)
      return () => document.removeEventListener('click', handler)
    }, [contextMenu])

    // ---- CSV IMPORT ----
    const handleImportCSV = useCallback(() => {
      fileInputRef.current?.click()
    }, [])

    const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        if (!text) return

        const result = Papa.parse(text, {
          skipEmptyLines: true,
        })

        const parsedRows = result.data as string[][]
        if (parsedRows.length === 0) return

        // Use first row as headers or generate column letters
        const maxCols = Math.max(...parsedRows.map(r => r.length))
        const columns: ColumnDef[] = Array.from({ length: maxCols }, (_, i) => ({
          name: columnIndexToLetter(i),
          type: 'text' as const,
        }))

        // Pad rows to maxCols
        const normalizedRows = parsedRows.map(r => {
          const padded = [...r]
          while (padded.length < maxCols) padded.push('')
          return padded
        })

        notifyChange({
          ...data,
          columns,
          rows: normalizedRows,
          sort: null,
          filters: {},
          frozenRows: Math.min(data.frozenRows ?? 0, Math.max(normalizedRows.length - 1, 0)),
          frozenCols: Math.min(data.frozenCols ?? 0, Math.max(columns.length - 1, 0)),
        })
        setActiveCell(null)
        setEditingCell(null)
      }
      reader.readAsText(file)

      // Reset file input
      e.target.value = ''
    }, [notifyChange, data])

    // ---- CSV EXPORT ----
    const handleExportCSV = useCallback(() => {
      // Resolve formulas for export
      const resolvedRows = data.rows.map((row, ri) =>
        row.map((_, ci) => getCellDisplay(ri, ci))
      )
      const csv = Papa.unparse(resolvedRows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'data-sheet.csv'
      a.click()
      URL.revokeObjectURL(url)
    }, [data.rows, getCellDisplay])

    // ---- CLIPBOARD PASTE ----
    const handlePaste = useCallback((e: ClipboardEvent) => {
      if (!activeCell || editingCell) return

      const text = e.clipboardData.getData('text/plain')
      if (!text) return

      e.preventDefault()

      const pastedRows = text.split('\n').map(line => line.split('\t'))
      const { row: startRow, col: startCol } = activeCell
      const newRows = data.rows.map(r => [...r])

      // Extend rows/cols if needed
      const neededRows = startRow + pastedRows.length
      const neededCols = startCol + Math.max(...pastedRows.map(r => r.length))

      while (newRows.length < neededRows) {
        newRows.push(Array(data.columns.length).fill(''))
      }

      let newColumns = [...data.columns]
      if (neededCols > newColumns.length) {
        const diff = neededCols - newColumns.length
        for (let i = 0; i < diff; i++) {
          newColumns.push({ name: columnIndexToLetter(newColumns.length), type: 'text' })
        }
        // Extend existing rows
        for (const row of newRows) {
          while (row.length < newColumns.length) row.push('')
        }
      }

      for (let r = 0; r < pastedRows.length; r++) {
        for (let c = 0; c < pastedRows[r].length; c++) {
          const targetRow = startRow + r
          const targetCol = startCol + c
          if (targetRow < newRows.length && targetCol < newColumns.length) {
            newRows[targetRow][targetCol] = pastedRows[r][c]
          }
        }
      }

      notifyChange({ ...data, columns: newColumns, rows: newRows })
    }, [activeCell, editingCell, data, notifyChange])

    // ---- CLIPBOARD COPY ----
    const handleCopy = useCallback((e: ClipboardEvent) => {
      if (!activeCell || editingCell) return
      e.preventDefault()
      if (selection) {
        const bounds = getSelectionBounds(selection)
        const lines: string[] = []
        for (let r = bounds.top; r <= bounds.bottom; r++) {
          const cols: string[] = []
          for (let c = bounds.left; c <= bounds.right; c++) {
            cols.push(getCellDisplay(r, c))
          }
          lines.push(cols.join('\t'))
        }
        e.clipboardData.setData('text/plain', lines.join('\n'))
        return
      }

      const display = getCellDisplay(activeCell.row, activeCell.col)
      e.clipboardData.setData('text/plain', display)
    }, [activeCell, editingCell, getCellDisplay, selection])

    // ---- FORMULA BAR ----
    const handleFormulaBarChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
      setFormulaBarValue(e.target.value)
      if (editingCell) {
        setEditValue(e.target.value)
      }
    }, [editingCell])

    const handleFormulaBarKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (activeCell) {
          const newRows = data.rows.map(r => [...r])
          newRows[activeCell.row][activeCell.col] = formulaBarValue
          notifyChange({ ...data, rows: newRows })
          setEditingCell(null)
          // Move down
          setActiveCell(prev => prev ? { row: Math.min(prev.row + 1, data.rows.length - 1), col: prev.col } : null)
        }
      } else if (e.key === 'Escape') {
        if (activeCell) {
          setFormulaBarValue(data.rows[activeCell.row]?.[activeCell.col] ?? '')
        }
        cancelEdit()
      }
    }, [activeCell, formulaBarValue, data, notifyChange, cancelEdit])

    const handleFormulaBarFocus = useCallback(() => {
      if (activeCell && !editingCell) {
        setEditingCell(activeCell)
        setEditValue(formulaBarValue)
      }
    }, [activeCell, editingCell, formulaBarValue])

    const updateFrozenRows = useCallback((value: number) => {
      const maxFrozen = Math.max(data.rows.length - 1, 0)
      notifyChange({ ...data, frozenRows: Math.max(0, Math.min(value, maxFrozen)) })
    }, [data, notifyChange])

    const updateFrozenCols = useCallback((value: number) => {
      const maxFrozen = Math.max(data.columns.length - 1, 0)
      notifyChange({ ...data, frozenCols: Math.max(0, Math.min(value, maxFrozen)) })
    }, [data, notifyChange])

    const updateFilterForColumn = useCallback((col: number, value: string) => {
      const next = { ...(data.filters ?? {}) }
      if (value.trim()) {
        next[col] = value
      } else {
        delete next[col]
      }
      notifyChange({ ...data, filters: next })
    }, [data, notifyChange])

    const clearAllFilters = useCallback(() => {
      notifyChange({ ...data, filters: {} })
    }, [data, notifyChange])

    const toggleSortForColumn = useCallback((col: number) => {
      const current = data.sort
      if (!current || current.col !== col) {
        notifyChange({ ...data, sort: { col, direction: 'asc' } })
      } else if (current.direction === 'asc') {
        notifyChange({ ...data, sort: { col, direction: 'desc' } })
      } else {
        notifyChange({ ...data, sort: null })
      }
    }, [data, notifyChange])

    const toggleHeaderRow = useCallback((rowIndex: number) => {
      const current = new Set(data.headerRows ?? [])
      if (current.has(rowIndex)) {
        current.delete(rowIndex)
      } else {
        current.add(rowIndex)
      }
      const arr = Array.from(current).sort((a, b) => a - b)
      notifyChange({ ...data, headerRows: arr.length ? arr : undefined })
    }, [data, notifyChange])

    // ---- RENDER ----
    const colCount = data.columns.length
    const rowCount = data.rows.length

    // ---- SIZE PICKER (shown for new sheets) ----
    if (showSizePicker) {
      const parsedCols = parseInt(sizeColsInput, 10)
      const parsedRows = parseInt(sizeRowsInput, 10)
      const isValid = !isNaN(parsedCols) && !isNaN(parsedRows) && parsedCols >= 1 && parsedRows >= 1

      return (
        <div className="flex flex-col items-center justify-center h-full bg-white">
          <div className="max-w-md w-full px-6">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-cyan-100 flex items-center justify-center">
                <Table2 size={24} className="text-cyan-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">New Data Sheet</h2>
                <p className="text-sm text-gray-500">Choose your grid size to get started</p>
              </div>
            </div>

            {/* Custom size input */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Grid size</label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    ref={colsInputRef}
                    type="number"
                    min={1}
                    max={702}
                    value={sizeColsInput}
                    onChange={(e) => setSizeColsInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSizePickerSubmit() }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none"
                    placeholder="Columns"
                  />
                  <div className="text-[10px] text-gray-400 text-center mt-1">Columns</div>
                </div>
                <span className="text-gray-400 font-medium text-lg pb-4">×</span>
                <div className="flex-1">
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={sizeRowsInput}
                    onChange={(e) => setSizeRowsInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSizePickerSubmit() }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 outline-none"
                    placeholder="Rows"
                  />
                  <div className="text-[10px] text-gray-400 text-center mt-1">Rows</div>
                </div>
                <button
                  onClick={handleSizePickerSubmit}
                  disabled={!isValid}
                  className="px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-4"
                >
                  Create
                </button>
              </div>
            </div>

            {/* Presets */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Quick presets</label>
              <div className="grid grid-cols-4 gap-2">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handleCreateSheet(preset.cols, preset.rows)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-cyan-300 hover:bg-cyan-50 transition-colors text-center"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center mt-5">
              You can always add or remove rows and columns later.
            </p>
          </div>
        </div>
      )
    }

    return (
      <div
        className={`flex flex-col h-full bg-white select-none ${resizingCol !== null ? 'cursor-col-resize' : ''} ${resizingRow !== null ? 'cursor-row-resize' : ''}`}
        onKeyDown={handleKeyDown as any}
        onPaste={handlePaste as any}
        onCopy={handleCopy as any}
        tabIndex={0}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <button
            onClick={() => addRow()}
            disabled={disabled}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
            title="Add row"
          >
            <ArrowDown size={12} />
            <span>Row</span>
          </button>
          <button
            onClick={() => addColumn()}
            disabled={disabled}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
            title="Add column"
          >
            <ArrowRight size={12} />
            <span>Column</span>
          </button>

          {/* Resize grid */}
          <div className="relative">
            <button
              onClick={openResizePopover}
              disabled={disabled}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
              title="Resize grid"
            >
              <Table2 size={12} />
              <span>Resize</span>
            </button>
            {showResizePopover && (
              <div
                ref={resizePopoverRef}
                className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-64"
              >
                <div className="text-xs font-medium text-gray-600 mb-2">Resize grid (data preserved)</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <input
                      ref={resizeColsInputRef}
                      type="number"
                      min={1}
                      max={702}
                      value={resizeColsInput}
                      onChange={(e) => setResizeColsInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleResizeSubmit(); if (e.key === 'Escape') setShowResizePopover(false) }}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-center text-xs focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100 outline-none"
                    />
                    <div className="text-[9px] text-gray-400 text-center mt-0.5">Cols</div>
                  </div>
                  <span className="text-gray-400 text-sm pb-3">×</span>
                  <div className="flex-1">
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={resizeRowsInput}
                      onChange={(e) => setResizeRowsInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleResizeSubmit(); if (e.key === 'Escape') setShowResizePopover(false) }}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-center text-xs focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100 outline-none"
                    />
                    <div className="text-[9px] text-gray-400 text-center mt-0.5">Rows</div>
                  </div>
                  <button
                    onClick={handleResizeSubmit}
                    className="px-3 py-1.5 bg-cyan-600 text-white text-xs font-medium rounded hover:bg-cyan-700 transition-colors mb-3"
                  >
                    Apply
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Shrinking will trim data from removed rows/columns.</p>
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          <div className="flex items-center gap-1 text-[11px] text-gray-600">
            <span>Freeze</span>
            <input
              type="number"
              min={0}
              max={Math.max(rowCount - 1, 0)}
              value={frozenRows}
              onChange={(e) => updateFrozenRows(parseInt(e.target.value || '0', 10))}
              className="w-12 px-1 py-0.5 border border-gray-300 rounded text-center"
              title="Frozen rows"
            />
            <span>R</span>
            <input
              type="number"
              min={0}
              max={Math.max(colCount - 1, 0)}
              value={frozenCols}
              onChange={(e) => updateFrozenCols(parseInt(e.target.value || '0', 10))}
              className="w-12 px-1 py-0.5 border border-gray-300 rounded text-center"
              title="Frozen columns"
            />
            <span>C</span>
          </div>

          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded transition-colors"
            title="Clear all filters"
          >
            <X size={12} />
            <span>Clear Filters</span>
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          <button
            onClick={handleImportCSV}
            disabled={disabled}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
            title="Import CSV"
          >
            <Upload size={12} />
            <span>Import</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded transition-colors"
            title="Export CSV"
          >
            <Download size={12} />
            <span>Export</span>
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Formula indicator */}
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Calculator size={12} />
            <span>Formulas: =SUM, AVG, MIN, MAX, COUNT, IF, ROUND, ABS, CONCAT</span>
          </div>
        </div>

        {/* Formula Bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex-shrink-0 w-16 text-center text-xs font-mono font-medium text-gray-600 bg-gray-100 rounded px-2 py-1">
            {activeCell ? `${columnIndexToLetter(activeCell.col)}${activeCell.row + 1}` : '—'}
          </div>
          <div className="text-gray-300 text-sm">ƒ</div>
          <input
            type="text"
            value={formulaBarValue}
            onChange={handleFormulaBarChange}
            onKeyDown={handleFormulaBarKeyDown as any}
            onFocus={handleFormulaBarFocus}
            disabled={disabled || !activeCell}
            className="flex-1 text-sm font-mono px-2 py-1 border border-gray-200 rounded focus:border-alpine-400 focus:ring-1 focus:ring-alpine-200 outline-none disabled:bg-gray-50 disabled:text-gray-400"
            placeholder={activeCell ? 'Enter value or formula (e.g., =SUM(A1:A10))' : 'Select a cell'}
          />
        </div>

        {/* Hidden file input for CSV import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Grid */}
        <div ref={tableRef} className="flex-1 overflow-auto relative">
          <table className="border-collapse min-w-full" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              {/* Row number column */}
              <col style={{ width: ROW_INDEX_COL_WIDTH }} />
              {data.columns.map((_, ci) => (
                <col key={ci} style={{ width: getColWidth(ci) }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                {/* Corner cell */}
                <th className="bg-gray-100 border border-gray-300 w-11 min-w-[2.75rem] text-center text-xs text-gray-400 font-normal sticky left-0 z-20" />
                {/* Column headers */}
                {data.columns.map((col, ci) => (
                  <th
                    key={ci}
                    className={`relative bg-gray-100 border border-gray-300 text-center text-xs font-medium text-gray-600 px-1 py-1 cursor-default select-none ${
                      activeCell?.col === ci ? 'bg-alpine-100 text-alpine-700' : ''
                    } ${selection && (() => {
                      const bounds = getSelectionBounds(selection)
                      return ci >= bounds.left && ci <= bounds.right
                    })() ? 'bg-cyan-100 text-cyan-700' : ''
                    }`}
                    style={ci < frozenCols ? { position: 'sticky', left: getFrozenLeft(ci), zIndex: 22 } : undefined}
                    onClick={() => {
                      // Select entire column — for now just set active to first cell in column
                      setSelection(null)
                      setActiveCell({ row: 0, col: ci })
                    }}
                    onContextMenu={(e) => handleContextMenu(e, 'col', ci)}
                  >
                    <div className="flex items-center justify-center gap-1 pr-2">
                      <span>{col.name}</span>
                      <button
                        type="button"
                        className={`rounded p-0.5 ${sort?.col === ci ? 'text-cyan-700 bg-cyan-100' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}
                        title={sort?.col === ci ? `Sorted ${sort.direction}` : 'Sort column'}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSortForColumn(ci)
                        }}
                      >
                        <ArrowUpDown size={11} />
                      </button>
                    </div>
                    {/* Resize handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-alpine-400 transition-colors"
                      onMouseDown={(e) => handleResizeStart(e, ci)}
                    />
                  </th>
                ))}
              </tr>
              <tr>
                <th className="bg-gray-50 border border-gray-300 sticky left-0 z-20 text-[10px] text-gray-400">Filter</th>
                {data.columns.map((_, ci) => (
                  <th
                    key={`filter-${ci}`}
                    className="bg-gray-50 border border-gray-300 px-1 py-0.5"
                    style={ci < frozenCols ? { position: 'sticky', left: getFrozenLeft(ci), zIndex: 21 } : undefined}
                  >
                    <input
                      type="text"
                      value={filters[ci] ?? ''}
                      onChange={(e) => updateFilterForColumn(ci, e.target.value)}
                      className="w-full px-1 py-0.5 text-[11px] font-normal border border-gray-200 rounded focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100 outline-none"
                      placeholder="Filter"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRowIndices.map((ri) => {
                const row = data.rows[ri]
                const isFrozenRow = ri < frozenRows
                const isHeaderRow = headerRowsSet.has(ri)

                return (
                <tr key={ri} style={{ height: getRowHeight(ri) }}>
                  {/* Row number */}
                  <td
                    className={`relative border border-gray-300 text-center text-xs font-normal sticky left-0 z-[5] cursor-default select-none ${
                      isHeaderRow
                        ? 'bg-slate-200 text-slate-700 font-semibold'
                        : activeCell?.row === ri ? 'bg-alpine-100 text-alpine-700 font-medium'
                        : 'bg-gray-100 text-gray-500'
                    } ${selection && (() => {
                      const bounds = getSelectionBounds(selection)
                      return ri >= bounds.top && ri <= bounds.bottom
                    })() ? 'bg-cyan-100 text-cyan-700 font-medium' : ''
                    }`}
                    style={isFrozenRow ? { top: getFrozenTop(ri), zIndex: 16 } : undefined}
                    onClick={() => setActiveCell({ row: ri, col: 0 })}
                    onMouseDown={() => setSelection(null)}
                    onContextMenu={(e) => handleContextMenu(e, 'row', ri)}
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      {isHeaderRow && <Type size={9} className="text-slate-500 flex-shrink-0" />}
                      <span>{ri + 1}</span>
                    </div>
                    {/* Row resize handle */}
                    <div
                      className="absolute left-0 right-0 bottom-0 h-1.5 cursor-row-resize hover:bg-alpine-400 transition-colors"
                      onMouseDown={(e) => handleRowResizeStart(e, ri)}
                    />
                  </td>
                  {/* Data cells */}
                  {row.map((cell, ci) => {
                    const isActive = activeCell?.row === ri && activeCell?.col === ci
                    const isEditing = editingCell?.row === ri && editingCell?.col === ci
                    const isInSelection = isCellInSelection(selection, ri, ci)
                    const displayValue = getCellDisplay(ri, ci)
                    const isFormula = cell.startsWith('=')
                    const isError = isFormula && displayValue.startsWith('#')

                    return (
                      <td
                        key={ci}
                        className={`relative border px-1.5 py-0.5 text-sm cursor-cell overflow-hidden whitespace-nowrap ${
                          isHeaderRow
                            ? 'border-slate-300 border-b-slate-400'
                            : 'border-gray-200'
                        } ${
                          isActive
                            ? 'outline outline-2 outline-alpine-500 outline-offset-[-1px] bg-alpine-50/30 z-[2]'
                            : isInSelection
                            ? 'bg-cyan-50/80'
                            : isHeaderRow
                            ? 'bg-slate-100'
                            : 'hover:bg-gray-50'
                        } ${
                          isHeaderRow ? 'font-semibold text-slate-800' : ''
                        } ${isError ? 'text-red-600' : isFormula && !isHeaderRow ? 'text-gray-800' : !isHeaderRow ? 'text-gray-800' : ''}`}
                        onMouseDown={(e) => handleCellMouseDown(ri, ci, e)}
                        onMouseEnter={() => handleCellMouseEnter(ri, ci)}
                        onDoubleClick={() => handleCellDoubleClick(ri, ci)}
                        onContextMenu={(e) => handleContextMenu(e, 'cell', ri * colCount + ci)}
                        style={{
                          maxWidth: getColWidth(ci),
                          height: getRowHeight(ri),
                          ...(ci < frozenCols ? { position: 'sticky', left: getFrozenLeft(ci), zIndex: isActive ? 18 : 12, backgroundColor: isInSelection ? '#ecfeff' : isHeaderRow ? '#e2e8f0' : undefined } : {}),
                          ...(isFrozenRow ? { top: getFrozenTop(ri), zIndex: ci < frozenCols ? 19 : (isActive ? 15 : 11) } : {}),
                        }}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => {
                              setEditValue(e.target.value)
                              setFormulaBarValue(e.target.value)
                            }}
                            onBlur={commitEdit}
                            className="absolute inset-0 w-full h-full px-1.5 text-sm font-mono border-none outline-none bg-white z-10"
                            autoFocus
                          />
                        ) : (
                          <span className={`block truncate ${isFormula && !isError ? 'font-normal' : ''}`}>
                            {displayValue}
                          </span>
                        )}
                        {isActive && !isEditing && (
                          <button
                            type="button"
                            aria-label="Fill handle"
                            title="Drag to fill"
                            onMouseDown={(e) => beginFillDrag(e, ri, ci)}
                            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-sm bg-alpine-600 border border-white shadow cursor-crosshair"
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            {contextMenu.type === 'row' && (
              <>
                <button
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 flex items-center gap-2 ${
                    headerRowsSet.has(contextMenu.index) ? 'text-slate-700 font-medium' : ''
                  }`}
                  onClick={() => { toggleHeaderRow(contextMenu.index); setContextMenu(null) }}
                >
                  <Type size={14} /> {headerRowsSet.has(contextMenu.index) ? 'Remove header style' : 'Mark as header row'}
                </button>
                <hr className="my-1 border-gray-100" />
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => { addRow(contextMenu.index); setContextMenu(null) }}
                >
                  <Plus size={14} /> Insert row above
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => { addRow(contextMenu.index + 1); setContextMenu(null) }}
                >
                  <Plus size={14} /> Insert row below
                </button>
                <hr className="my-1 border-gray-100" />
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  onClick={() => { deleteRow(contextMenu.index); setContextMenu(null) }}
                  disabled={data.rows.length <= 1}
                >
                  <Trash2 size={14} /> Delete row
                </button>
              </>
            )}
            {contextMenu.type === 'col' && (
              <>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => { addColumn(contextMenu.index); setContextMenu(null) }}
                >
                  <Plus size={14} /> Insert column left
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => { addColumn(contextMenu.index + 1); setContextMenu(null) }}
                >
                  <Plus size={14} /> Insert column right
                </button>
                <hr className="my-1 border-gray-100" />
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  onClick={() => { deleteColumn(contextMenu.index); setContextMenu(null) }}
                  disabled={data.columns.length <= 1}
                >
                  <Trash2 size={14} /> Delete column
                </button>
              </>
            )}
            {contextMenu.type === 'cell' && (
              <>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => {
                    const ri = Math.floor(contextMenu.index / colCount)
                    const ci = contextMenu.index % colCount
                    const newRows = data.rows.map(r => [...r])
                    newRows[ri][ci] = ''
                    notifyChange({ ...data, rows: newRows })
                    setContextMenu(null)
                  }}
                >
                  <X size={14} /> Clear cell
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => {
                    const ri = Math.floor(contextMenu.index / colCount)
                    addRow(ri + 1)
                    setContextMenu(null)
                  }}
                >
                  <Plus size={14} /> Insert row below
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => {
                    const ci = contextMenu.index % colCount
                    addColumn(ci + 1)
                    setContextMenu(null)
                  }}
                >
                  <Plus size={14} /> Insert column right
                </button>
              </>
            )}
          </div>
        )}

        {/* Status Bar */}
        <div className="flex items-center justify-between px-3 py-1 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span>{rowCount} rows × {colCount} columns</span>
            {visibleRowIndices.length !== rowCount && (
              <span className="text-cyan-700">Visible: {visibleRowIndices.length}</span>
            )}
            {selection && (() => {
              const bounds = getSelectionBounds(selection)
              const width = bounds.right - bounds.left + 1
              const height = bounds.bottom - bounds.top + 1
              const values: number[] = []
              for (let r = bounds.top; r <= bounds.bottom; r++) {
                for (let c = bounds.left; c <= bounds.right; c++) {
                  const value = Number(getCellDisplay(r, c))
                  if (!isNaN(value)) values.push(value)
                }
              }

              return (
                <>
                  <span className="text-cyan-700">Selection: {height}×{width}</span>
                  {values.length > 0 && (
                    <span className="text-cyan-700">
                      Sum: {Math.round(values.reduce((a, b) => a + b, 0) * 1e6) / 1e6} · Avg: {Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1e6) / 1e6}
                    </span>
                  )}
                </>
              )
            })()}
            {activeCell && data.rows[activeCell.row]?.[activeCell.col]?.startsWith('=') && (
              <span className="text-alpine-600 flex items-center gap-1">
                <Calculator size={10} />
                Formula: {data.rows[activeCell.row][activeCell.col]}
              </span>
            )}
          </div>
          {activeCell && (
            <div className="flex items-center gap-2">
              {/* Quick stats for selection */}
              {(() => {
                const raw = data.rows[activeCell.row]?.[activeCell.col] ?? ''
                const display = getCellDisplay(activeCell.row, activeCell.col)
                const num = Number(display)
                if (raw && !isNaN(num)) {
                  return <span className="text-gray-400">Value: {display}</span>
                }
                return null
              })()}
            </div>
          )}
        </div>
      </div>
    )
  }
)

DataSheetEditor.displayName = 'DataSheetEditor'
export default DataSheetEditor
