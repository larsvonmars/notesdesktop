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
} from 'react'
import {
  Plus,
  Star,
  AlertTriangle,
  Lightbulb,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  BookOpen,
  ListTodo,
  GripVertical,
} from 'lucide-react'
import {
  type BulletJournalEntry,
  type BulletSignifier,
  type CreateBulletEntryInput,
  SIGNIFIER_SYMBOLS,
  SIGNIFIER_LABELS,
  nextSignifier,
  cycleTaskSignifier,
  getEntriesForNote,
  getEntriesByDate,
  createEntry,
  updateEntry,
  deleteEntry,
  bulkUpdateSortOrder,
} from '../lib/bullet-journal'

// ============================================================================
// TYPES
// ============================================================================

export interface BulletJournalEditorHandle {
  /** Serialize all local entries to JSON (used by NoteEditor for saving to notes.content) */
  getData: () => BulletJournalData
  /** Load serialized data back into the editor */
  setData: (data: BulletJournalData) => void
  /** Save all pending entries to Supabase */
  saveToDb: () => Promise<void>
  /** Load entries from Supabase for the current note */
  loadFromDb: (noteId: string) => Promise<void>
}

export interface BulletJournalData {
  entries: LocalEntry[]
  /** ISO date string of the active day view */
  activeDate: string
  view: SpreadView
}

type SpreadView = 'daily' | 'monthly' | 'index'

interface LocalEntry {
  // If `id` is present the entry already exists in DB
  id?: string
  signifier: BulletSignifier
  content: string
  indent_level: number
  sort_order: number
  entry_date: string | null
  is_starred: boolean
  is_priority: boolean
  is_inspiration: boolean
  linked_task_id: string | null
  /** Client-only: marks a fresh row that has never been persisted */
  _isNew?: boolean
  /** Client-only: stable key for React rendering */
  _key: string
}

interface BulletJournalEditorProps {
  noteId: string | null
  initialData?: BulletJournalData | null
  onChange?: (data: BulletJournalData) => void
  disabled?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

let _keyCounter = 0
function makeKey() {
  return `bj_${Date.now()}_${_keyCounter++}`
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function emptyEntry(date: string | null, sortOrder: number): LocalEntry {
  return {
    signifier: 'task',
    content: '',
    indent_level: 0,
    sort_order: sortOrder,
    entry_date: date,
    is_starred: false,
    is_priority: false,
    is_inspiration: false,
    linked_task_id: null,
    _isNew: true,
    _key: makeKey(),
  }
}

function dbToLocal(e: BulletJournalEntry): LocalEntry {
  return {
    id: e.id,
    signifier: e.signifier,
    content: e.content,
    indent_level: e.indent_level,
    sort_order: e.sort_order,
    entry_date: e.entry_date,
    is_starred: e.is_starred,
    is_priority: e.is_priority,
    is_inspiration: e.is_inspiration,
    linked_task_id: e.linked_task_id,
    _key: makeKey(),
  }
}

const SIGNIFIER_COLORS: Record<BulletSignifier, string> = {
  task: 'text-foreground',
  event: 'text-[color:var(--hue-sky)]',
  note: 'text-muted',
  completed: 'text-success',
  migrated: 'text-warning',
  scheduled: 'text-[color:var(--hue-violet)]',
  irrelevant: 'text-muted line-through',
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ============================================================================
// COMPONENT
// ============================================================================

const BulletJournalEditor = forwardRef<BulletJournalEditorHandle, BulletJournalEditorProps>(
  function BulletJournalEditor({ noteId, initialData, onChange, disabled = false }, ref) {
    const today = toISODate(new Date())
    const [entries, setEntries] = useState<LocalEntry[]>(() => initialData?.entries ?? [emptyEntry(today, 0)])
    const [activeDate, setActiveDate] = useState<string>(initialData?.activeDate ?? today)
    const [view, setView] = useState<SpreadView>(initialData?.view ?? 'daily')
    const [isLoading, setIsLoading] = useState(false)
    const entryRefs = useRef<Map<string, HTMLInputElement>>(new Map())

    // Build the data object used for serializing & notifying parent
    const buildData = useCallback((): BulletJournalData => ({
      entries,
      activeDate,
      view,
    }), [entries, activeDate, view])

    // Notify parent of changes
    useEffect(() => {
      onChange?.(buildData())
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries, activeDate, view])

    // ── Imperative handle ─────────────────────────────────────
    useImperativeHandle(ref, () => ({
      getData: () => buildData(),
      setData: (data: BulletJournalData) => {
        setEntries(data.entries.map(e => ({ ...e, _key: e._key || makeKey() })))
        setActiveDate(data.activeDate)
        setView(data.view)
      },
      saveToDb: async () => {
        if (!noteId) return
        // Persist each entry: update existing, create new, preserve order
        const sorted = [...entries].sort((a, b) => a.sort_order - b.sort_order)
        for (let i = 0; i < sorted.length; i++) {
          const e = sorted[i]
          if (e.content.trim() === '' && e._isNew) continue // skip empty new rows
          if (e.id) {
            await updateEntry(e.id, {
              signifier: e.signifier,
              content: e.content,
              indent_level: e.indent_level,
              sort_order: i,
              entry_date: e.entry_date,
              is_starred: e.is_starred,
              is_priority: e.is_priority,
              is_inspiration: e.is_inspiration,
            })
          } else {
            const created = await createEntry({
              note_id: noteId,
              signifier: e.signifier,
              content: e.content,
              indent_level: e.indent_level,
              sort_order: i,
              entry_date: e.entry_date,
              is_starred: e.is_starred,
              is_priority: e.is_priority,
              is_inspiration: e.is_inspiration,
            })
            e.id = created.id
            e._isNew = false
          }
        }
      },
      loadFromDb: async (nId: string) => {
        setIsLoading(true)
        try {
          const dbEntries = await getEntriesForNote(nId)
          if (dbEntries.length > 0) {
            setEntries(dbEntries.map(dbToLocal))
          } else {
            setEntries([emptyEntry(today, 0)])
          }
        } finally {
          setIsLoading(false)
        }
      },
    }))

    // ── Filtered entries for current view ──────────────────────
    const visibleEntries = useMemo(() => {
      if (view === 'daily') {
        return entries
          .filter(e => e.entry_date === activeDate)
          .sort((a, b) => a.sort_order - b.sort_order)
      }
      if (view === 'monthly') {
        const ym = activeDate.slice(0, 7) // "YYYY-MM"
        return entries
          .filter(e => e.entry_date && e.entry_date.startsWith(ym))
          .sort((a, b) => (a.entry_date ?? '').localeCompare(b.entry_date ?? '') || a.sort_order - b.sort_order)
      }
      // index — show everything, grouped by date
      return [...entries].sort(
        (a, b) => (a.entry_date ?? '').localeCompare(b.entry_date ?? '') || a.sort_order - b.sort_order
      )
    }, [entries, activeDate, view])

    // ── Date navigation ───────────────────────────────────────
    const navigate = useCallback((delta: number) => {
      const d = new Date(activeDate)
      if (view === 'monthly') {
        d.setMonth(d.getMonth() + delta)
      } else {
        d.setDate(d.getDate() + delta)
      }
      setActiveDate(toISODate(d))
    }, [activeDate, view])

    const goToToday = useCallback(() => setActiveDate(today), [today])

    // ── Entry mutations ───────────────────────────────────────
    const updateLocalEntry = useCallback((key: string, patch: Partial<LocalEntry>) => {
      setEntries(prev => prev.map(e => e._key === key ? { ...e, ...patch } : e))
    }, [])

    const addEntryAfter = useCallback((afterKey: string) => {
      setEntries(prev => {
        const idx = prev.findIndex(e => e._key === afterKey)
        const afterEntry = prev[idx]
        const newE = emptyEntry(afterEntry?.entry_date ?? activeDate, (afterEntry?.sort_order ?? 0) + 1)
        const next = [...prev]
        next.splice(idx + 1, 0, newE)
        // re-index sort_order
        next.forEach((e, i) => { e.sort_order = i })
        // Focus the new row after render
        requestAnimationFrame(() => {
          entryRefs.current.get(newE._key)?.focus()
        })
        return next
      })
    }, [activeDate])

    const removeEntry = useCallback(async (key: string) => {
      const entry = entries.find(e => e._key === key)
      if (entry?.id) {
        try { await deleteEntry(entry.id) } catch { /* best-effort */ }
      }
      setEntries(prev => {
        const next = prev.filter(e => e._key !== key)
        if (next.length === 0) return [emptyEntry(activeDate, 0)]
        next.forEach((e, i) => { e.sort_order = i })
        return next
      })
    }, [entries, activeDate])

    const addNewEntry = useCallback(() => {
      const maxOrder = visibleEntries.length > 0
        ? Math.max(...visibleEntries.map(e => e.sort_order))
        : -1
      const newE = emptyEntry(activeDate, maxOrder + 1)
      setEntries(prev => [...prev, newE])
      requestAnimationFrame(() => {
        entryRefs.current.get(newE._key)?.focus()
      })
    }, [visibleEntries, activeDate])

    // ── Keyboard handler for rapid logging ────────────────────
    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>, entry: LocalEntry) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        addEntryAfter(entry._key)
      }
      if (e.key === 'Backspace' && entry.content === '') {
        e.preventDefault()
        removeEntry(entry._key)
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const newIndent = e.shiftKey
          ? Math.max(0, entry.indent_level - 1)
          : Math.min(4, entry.indent_level + 1)
        updateLocalEntry(entry._key, { indent_level: newIndent })
      }
      // Cycle signifier with Alt+S
      if (e.key === 's' && e.altKey) {
        e.preventDefault()
        updateLocalEntry(entry._key, { signifier: nextSignifier(entry.signifier) })
      }
      // Quick complete with Alt+X
      if (e.key === 'x' && e.altKey) {
        e.preventDefault()
        updateLocalEntry(entry._key, {
          signifier: entry.signifier === 'completed' ? 'task' : 'completed',
        })
      }
      // Move up / down with Alt+Arrow
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
        e.preventDefault()
        setEntries(prev => {
          const idx = prev.findIndex(x => x._key === entry._key)
          const swapIdx = e.key === 'ArrowUp' ? idx - 1 : idx + 1
          if (swapIdx < 0 || swapIdx >= prev.length) return prev
          const next = [...prev]
          ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
          next.forEach((x, i) => { x.sort_order = i })
          return next
        })
      }
    }, [addEntryAfter, removeEntry, updateLocalEntry])

    // ── Date header label ─────────────────────────────────────
    const dateLabel = useMemo(() => {
      const d = new Date(activeDate + 'T00:00:00')
      if (view === 'monthly') {
        return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      }
      const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
      const month = d.toLocaleDateString('en-US', { month: 'short' })
      const day = d.getDate()
      const year = d.getFullYear()
      return `${weekday}, ${month} ${day}, ${year}`
    }, [activeDate, view])

    // ── Group entries by date for index view ──────────────────
    const groupedByDate = useMemo(() => {
      if (view !== 'index') return null
      const groups: Record<string, LocalEntry[]> = {}
      for (const e of visibleEntries) {
        const key = e.entry_date || 'No date'
        ;(groups[key] ||= []).push(e)
      }
      return groups
    }, [view, visibleEntries])

    // ── Signifier counts for monthly overview ─────────────────
    const monthlySummary = useMemo(() => {
      if (view !== 'monthly') return null
      const counts = { task: 0, completed: 0, event: 0, note: 0, migrated: 0, scheduled: 0, irrelevant: 0 }
      for (const e of visibleEntries) {
        counts[e.signifier]++
      }
      return counts
    }, [view, visibleEntries])

    // ── Render a single entry row ─────────────────────────────
    const renderEntry = (entry: LocalEntry) => (
      <div
        key={entry._key}
        className={`group flex items-start gap-1.5 py-1 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
        style={{ paddingLeft: `${entry.indent_level * 24}px` }}
      >
        {/* Drag handle (visual only for now) */}
        <span className="mt-1.5 cursor-grab text-muted opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={14} />
        </span>

        {/* Signifier bullet */}
        <button
          type="button"
          className={`mt-1 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-hover font-mono text-base leading-none ${SIGNIFIER_COLORS[entry.signifier]}`}
          title={`${SIGNIFIER_LABELS[entry.signifier]} — Alt+S to cycle`}
          onClick={() => {
            if (entry.signifier === 'task' || entry.signifier === 'completed' || entry.signifier === 'migrated' || entry.signifier === 'scheduled') {
              updateLocalEntry(entry._key, { signifier: cycleTaskSignifier(entry.signifier) })
            } else {
              updateLocalEntry(entry._key, { signifier: nextSignifier(entry.signifier) })
            }
          }}
        >
          {SIGNIFIER_SYMBOLS[entry.signifier]}
        </button>

        {/* Content input */}
        <input
          ref={el => {
            if (el) entryRefs.current.set(entry._key, el)
            else entryRefs.current.delete(entry._key)
          }}
          type="text"
          value={entry.content}
          onChange={e => updateLocalEntry(entry._key, { content: e.target.value })}
          onKeyDown={e => handleKeyDown(e, entry)}
          placeholder="Rapid log..."
          className={`flex-1 bg-transparent outline-none text-sm py-1 placeholder:text-muted ${
            entry.signifier === 'completed' ? 'line-through text-muted' : ''
          } ${entry.signifier === 'irrelevant' ? 'line-through text-muted' : ''}`}
          disabled={disabled}
        />

        {/* Quick flags */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className={`rounded p-1 hover:bg-[var(--warning-light)] ${entry.is_starred ? 'text-warning' : 'text-muted'}`}
            title="Star"
            onClick={() => updateLocalEntry(entry._key, { is_starred: !entry.is_starred })}
          >
            <Star size={14} fill={entry.is_starred ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className={`rounded p-1 hover:bg-[var(--danger-light)] ${entry.is_priority ? 'text-danger' : 'text-muted'}`}
            title="Priority"
            onClick={() => updateLocalEntry(entry._key, { is_priority: !entry.is_priority })}
          >
            <AlertTriangle size={14} />
          </button>
          <button
            type="button"
            className={`rounded p-1 hover:bg-[var(--accent-light)] ${entry.is_inspiration ? 'text-accent' : 'text-muted'}`}
            title="Inspiration"
            onClick={() => updateLocalEntry(entry._key, { is_inspiration: !entry.is_inspiration })}
          >
            <Lightbulb size={14} />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted transition-colors hover:bg-[var(--danger-light)] hover:text-danger"
            title="Remove"
            onClick={() => removeEntry(entry._key)}
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Persistent flags shown when active */}
        <div className="flex items-center gap-0.5 group-hover:hidden">
          {entry.is_starred && <Star size={12} className="text-warning" fill="currentColor" />}
          {entry.is_priority && <AlertTriangle size={12} className="text-danger" />}
          {entry.is_inspiration && <Lightbulb size={12} className="text-accent" />}
        </div>
      </div>
    )

    // ── Loading state ─────────────────────────────────────────
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full text-muted">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
            <span className="text-sm">Loading journal…</span>
          </div>
        </div>
      )
    }

    // ── Main render ───────────────────────────────────────────
    return (
      <div className="flex flex-col h-full bg-transparent text-foreground">
        {/* ─── Toolbar / Header ─────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-[var(--surface-sunken)] px-4 py-2">
          {/* View tabs */}
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5">
            {(['daily', 'monthly', 'index'] as SpreadView[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors focus-ring ${
                  view === v ? 'bg-surface-active text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                }`}
              >
                {v === 'daily' && <span className="inline-flex items-center gap-1"><Calendar size={12} /> Daily</span>}
                {v === 'monthly' && <span className="inline-flex items-center gap-1"><BookOpen size={12} /> Monthly</span>}
                {v === 'index' && <span className="inline-flex items-center gap-1"><ListTodo size={12} /> Index</span>}
              </button>
            ))}
          </div>

          {/* Date nav (daily / monthly) */}
          {view !== 'index' && (
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(-1)} className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                <ChevronLeft size={16} />
              </button>
              <button onClick={goToToday} className="focus-ring rounded-lg px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-[var(--accent-light)]">
                Today
              </button>
              <button onClick={() => navigate(1)} className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* ─── Date label ───────────────────────────────────── */}
        {view !== 'index' && (
          <div className="px-4 pt-4 pb-2">
            <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">{dateLabel}</h2>
            {view === 'monthly' && monthlySummary && (
              <div className="mt-1.5 flex gap-3 text-xs text-muted">
                <span>{monthlySummary.task} tasks</span>
                <span className="text-success">{monthlySummary.completed} done</span>
                <span className="text-[color:var(--hue-sky)]">{monthlySummary.event} events</span>
                <span>{monthlySummary.note} notes</span>
              </div>
            )}
          </div>
        )}

        {/* ─── Entries ──────────────────────────────────────── */}
        <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-20">
          {view === 'index' && groupedByDate ? (
            Object.entries(groupedByDate).map(([date, group]) => (
              <div key={date} className="mb-4">
                <h3 className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                  {date === 'No date' ? date : new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </h3>
                {group.map(renderEntry)}
              </div>
            ))
          ) : (
            <>
              {visibleEntries.map(renderEntry)}
              {visibleEntries.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">
                  No entries yet. Click the button below or press <kbd className="kbd">Enter</kbd> to start logging.
                </p>
              )}
            </>
          )}
        </div>

        {/* ─── Add Entry FAB ────────────────────────────────── */}
        {view !== 'index' && (
          <div className="sticky bottom-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-[var(--surface-sunken)] px-4 py-3">
            <button
              onClick={addNewEntry}
              disabled={disabled}
              className="glass-btn-primary gap-2 px-4"
            >
              <Plus size={16} />
              Add entry
            </button>
            <span className="text-xs text-muted">
              Enter = new line · Tab = indent · Alt+S = cycle bullet · Alt+X = complete
            </span>
          </div>
        )}

        {/* ─── Key / Legend (collapsible) ───────────────────── */}
        <details className="border-t border-border px-4 py-2 text-xs text-muted">
          <summary className="cursor-pointer font-medium transition-colors hover:text-foreground">Key</summary>
          <div className="grid grid-cols-4 gap-x-4 gap-y-1 mt-1.5">
            {(Object.entries(SIGNIFIER_SYMBOLS) as [BulletSignifier, string][]).map(([sig, sym]) => (
              <span key={sig} className={SIGNIFIER_COLORS[sig]}>
                <span className="font-mono mr-1">{sym}</span> {SIGNIFIER_LABELS[sig]}
              </span>
            ))}
          </div>
        </details>
      </div>
    )
  }
)

export default BulletJournalEditor
