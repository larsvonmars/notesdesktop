'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import DOMPurify from 'dompurify'
import { getStroke } from 'perfect-freehand'
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  FilePenLine,
  FileText,
  Globe,
  Map,
  Maximize2,
  Moon,
  Network,
  PenTool,
  RotateCcw,
  Search,
  Sun,
  Table2,
} from 'lucide-react'
import type { PublishedNoteShare } from '@/lib/note-shares'
import type { NoteType } from '@/lib/notes'
import type { DrawingData, Stroke } from '@/components/DrawingEditor'
import MindmapEditor from '@/components/MindmapEditor'
import type { MindmapEditorHandle, MindmapData } from '@/components/MindmapEditor'
import type { BulletJournalData } from '@/components/BulletJournalEditor'
import type { DataSheetData } from '@/components/DataSheetEditor'
import type { PdfAnnotationData } from '@/components/PdfAnnotationEditor'
import { SIGNIFIER_LABELS, SIGNIFIER_SYMBOLS, type BulletSignifier } from '@/lib/bullet-journal'
import { getNoteTypePresentation } from '@/lib/note-types'
import { useTheme } from '@/lib/theme-context'

interface SharedNoteViewProps {
  share: PublishedNoteShare
}

interface TocHeading {
  id: string
  text: string
  level: number
}

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/**
 * After DOMPurify sanitization, make interactive editor elements
 * suitable for a static public read-only view:
 *   - Remove action buttons from file blocks
 *   - Mark file blocks as `not-prose` so the typography plugin skips them
 *   - Disable checkboxes
 *   - Remove pointer-events from note-link chips
 */
function postProcessNoteHtml(html: string): string {
  if (typeof window === 'undefined') return html

  const doc = new DOMParser().parseFromString(html, 'text/html')

  // 1. Remove interactive action buttons from file blocks
  for (const el of Array.from(
    doc.querySelectorAll('[data-file-action], .file-block-preview, .file-block-download, .file-block-delete')
  )) {
    el.remove()
  }

  // 2. File blocks are display-only in public notes
  for (const fileBlock of Array.from(doc.querySelectorAll('[data-block-type="file"]'))) {
    const surface = fileBlock.querySelector('.file-block-surface') as HTMLElement | null
    if (surface) {
      surface.style.pointerEvents = 'none'
      surface.style.cursor = 'default'
      if (surface instanceof HTMLButtonElement) {
        surface.setAttribute('disabled', '')
      }
    }

    // Prevent @tailwindcss/typography from restyling the file block internals
    ;(fileBlock as HTMLElement).classList.add('not-prose')
  }

  // 3. Disable all checkboxes (read-only in share view)
  for (const cb of Array.from(doc.querySelectorAll('input[type="checkbox"]'))) {
    cb.setAttribute('disabled', '')
  }

  // 4. Note-link chips: non-interactive, display-only
  for (const noteLink of Array.from(doc.querySelectorAll('[data-block-type="note-link"]'))) {
    const el = noteLink as HTMLElement
    el.style.pointerEvents = 'none'
    el.style.cursor = 'default'
    el.className = el.className.replace(/\bcursor-pointer\b/g, '').trim()
  }

  // 5. Ensure all h1–h4 headings have stable anchor IDs for the TOC
  const usedIds = new Set<string>(
    Array.from(doc.querySelectorAll('[id]')).map((el) => (el as HTMLElement).id)
  )
  for (const el of Array.from(doc.querySelectorAll('h1, h2, h3, h4'))) {
    if ((el as HTMLElement).id) continue
    let slug = (el.textContent || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'heading'
    let final = slug
    let n = 1
    while (usedIds.has(final)) final = `${slug}-${n++}`
    usedIds.add(final)
    ;(el as HTMLElement).id = final
  }

  return doc.body.innerHTML
}

function extractHeadings(html: string): TocHeading[] {
  if (typeof window === 'undefined') return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.querySelectorAll('h1, h2, h3, h4'))
    .map((el) => ({
      id: (el as HTMLElement).id,
      text: el.textContent?.trim() || '',
      level: parseInt(el.tagName[1], 10),
    }))
    .filter((h) => h.id && h.text)
}

function ShareEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-strong bg-surface-sunken px-6 py-8 text-[13px] leading-6 text-muted">
      {children}
    </div>
  )
}

function FloatingTOC({ headings }: { headings: TocHeading[] }) {
  const [activeId, setActiveId] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!headings.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        // Pick heading closest to the top of the viewport
        const topmost = visible.reduce((best, e) =>
          e.boundingClientRect.top < best.boundingClientRect.top ? e : best
        )
        setActiveId(topmost.target.id)
      },
      { rootMargin: '-72px 0px -60% 0px', threshold: 0 }
    )

    for (const h of headings) {
      const el = document.getElementById(h.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [headings])

  if (headings.length < 2) return null

  return (
    <aside
      aria-label="On this page"
      className="fixed right-5 top-1/2 z-20 hidden w-56 -translate-y-1/2 xl:block"
    >
      <div className="glass-strong overflow-hidden rounded-2xl">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="focus-ring flex w-full shrink-0 items-center justify-between gap-2 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:text-foreground"
        >
          <span>On this page</span>
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
              collapsed ? '' : 'rotate-90'
            }`}
          />
        </button>

        {!collapsed && (
          <nav
            aria-label="Table of contents"
            className="scroll-thin max-h-[60vh] overflow-y-auto border-t border-border p-2"
          >
            {headings.map((heading) => {
              const isActive = activeId === heading.id
              return (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  aria-current={isActive ? 'location' : undefined}
                  className={`focus-ring flex min-w-0 items-center gap-1.5 rounded-lg py-1.5 pr-2 text-[13px] leading-snug transition-colors ${
                    isActive
                      ? 'bg-accent-light font-medium text-accent'
                      : 'text-muted hover:bg-surface-hover hover:text-foreground'
                  }`}
                  style={{ paddingLeft: `${(heading.level - 1) * 10 + 10}px` }}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    />
                  )}
                  <span className="truncate">{heading.text}</span>
                </a>
              )
            })}
          </nav>
        )}
      </div>
    </aside>
  )
}

function formatPublishedDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getSvgPathFromStroke(points: number[][]): string {
  if (!points.length) return ''

  const d = points.reduce<(string | number)[]>(
    (acc, [x0, y0], index, allPoints) => {
      const [x1, y1] = allPoints[(index + 1) % allPoints.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ['M', ...points[0], 'Q']
  )

  d.push('Z')
  return d.join(' ')
}

function renderStrokePath(stroke: Stroke): { d: string; opacity: number } | null {
  const outlinePoints = getStroke(
    stroke.points.map((point) => [point.x, point.y, point.pressure ?? 0.5]),
    {
      size: stroke.size * 8,
      thinning: stroke.tool === 'pen' ? 0.5 : 0.1,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: stroke.tool === 'pen',
    }
  )

  const d = getSvgPathFromStroke(outlinePoints)
  if (!d) return null

  return {
    d,
    opacity: stroke.tool === 'highlighter' ? 0.3 : 1,
  }
}

function DrawingShareView({ data }: { data: DrawingData }) {
  const [pageIndex, setPageIndex] = useState(data.currentPage ?? 0)
  const page = data.pages[pageIndex] ?? data.pages[0]

  if (!page) {
    return <ShareEmptyState>This drawing is empty.</ShareEmptyState>
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Drawing
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Read-only preview</p>
        </div>
        {data.pages.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              disabled={pageIndex === 0}
              className="glass-btn focus-ring h-9 w-9 !px-0 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous drawing page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-xs font-medium text-muted">
              Page {pageIndex + 1} / {data.pages.length}
            </div>
            <button
              type="button"
              onClick={() => setPageIndex((current) => Math.min(data.pages.length - 1, current + 1))}
              disabled={pageIndex >= data.pages.length - 1}
              className="glass-btn focus-ring h-9 w-9 !px-0 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next drawing page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-sunken shadow-glass">
        <div className="relative w-full" style={{ paddingTop: `${(data.height / data.width) * 100}%` }}>
          <svg
            viewBox={`0 0 ${data.width} ${data.height}`}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label="Shared drawing preview"
          >
            <rect width={data.width} height={data.height} fill="#ffffff" />
            {page.strokes.map((stroke, index) => {
              const renderedStroke = renderStrokePath(stroke)
              if (!renderedStroke) return null

              return (
                <path
                  key={`${index}-${stroke.color}-${stroke.size}`}
                  d={renderedStroke.d}
                  fill={stroke.tool === 'eraser' ? '#ffffff' : stroke.color}
                  opacity={renderedStroke.opacity}
                />
              )
            })}
          </svg>
        </div>
      </div>
    </section>
  )
}

function getMindmapStats(data: MindmapData): {
  nodeCount: number
  leafCount: number
  maxDepth: number
  parentConnectionCount: number
  customConnectionCount: number
  totalConnectionCount: number
} {
  const root = data.nodes[data.rootId]
  if (!root) {
    return {
      nodeCount: 0,
      leafCount: 0,
      maxDepth: 0,
      parentConnectionCount: 0,
      customConnectionCount: 0,
      totalConnectionCount: 0,
    }
  }

  const nodeCount = Object.keys(data.nodes).length
  const leafCount = Object.values(data.nodes).filter((node) => node.children.length === 0).length
  const parentConnectionCount = Object.values(data.nodes).filter((node) => Boolean(node.parentId)).length
  const customConnectionCount = data.customEdges?.length ?? 0

  let maxDepth = 1
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: data.rootId, depth: 1 }]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || visited.has(current.nodeId)) continue
    visited.add(current.nodeId)
    maxDepth = Math.max(maxDepth, current.depth)

    const node = data.nodes[current.nodeId]
    if (!node) continue
    for (const childId of node.children) {
      if (data.nodes[childId] && !visited.has(childId)) {
        queue.push({ nodeId: childId, depth: current.depth + 1 })
      }
    }
  }

  return {
    nodeCount,
    leafCount,
    maxDepth,
    parentConnectionCount,
    customConnectionCount,
    totalConnectionCount: parentConnectionCount + customConnectionCount,
  }
}

function MindmapShareView({ data }: { data: MindmapData }) {
  const editorRef = useRef<MindmapEditorHandle>(null)
  const [isFramingView, setIsFramingView] = useState(true)
  const stats = useMemo(() => getMindmapStats(data), [data])

  // Fit the whole graph into view once the canvas has mounted and sized itself
  useEffect(() => {
    const fitOnce = () => {
      editorRef.current?.fitToView()
    }

    setIsFramingView(true)

    const raf1 = requestAnimationFrame(() => {
      fitOnce()
      requestAnimationFrame(fitOnce)
    })
    const timer = setTimeout(fitOnce, 350)
    const settleTimer = setTimeout(() => setIsFramingView(false), 450)

    return () => {
      cancelAnimationFrame(raf1)
      clearTimeout(timer)
      clearTimeout(settleTimer)
    }
  }, [])

  if (!data.nodes[data.rootId]) {
    return <ShareEmptyState>This mind map could not be rendered.</ShareEmptyState>
  }

  const statTiles = [
    { label: 'Nodes', value: stats.nodeCount },
    { label: 'Leaves', value: stats.leafCount },
    { label: 'Depth', value: stats.maxDepth },
    { label: 'Tree links', value: stats.parentConnectionCount },
    { label: 'Custom links', value: stats.customConnectionCount },
  ]

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface-sunken p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Mind map
            </p>
            <p className="mt-1 text-[13px] text-foreground">
              Explore connections with shared search and focus tools.
            </p>
            <p className="mt-1 text-xs text-muted">
              Pan to move · Scroll or pinch to zoom · Click nodes or connections to inspect details
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-center text-[11px] sm:min-w-[330px] sm:grid-cols-5">
            {statTiles.map((tile) => (
              <div
                key={tile.label}
                className="rounded-xl border border-border bg-surface px-2.5 py-1.5"
              >
                <div className="text-sm font-semibold text-foreground">{tile.value}</div>
                <div className="text-[10px] text-muted">{tile.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => editorRef.current?.fitToView()}
            className="glass-btn focus-ring h-8 px-3 text-[11px]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Fit view
          </button>
          <button
            type="button"
            onClick={() => editorRef.current?.resetView()}
            className="glass-btn focus-ring h-8 px-3 text-[11px]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            1:1 zoom
          </button>
          <button
            type="button"
            onClick={() => editorRef.current?.openSearch()}
            className="glass-btn focus-ring h-8 px-3 text-[11px]"
          >
            <Search className="h-3.5 w-3.5" />
            Search nodes
          </button>
          <button
            type="button"
            onClick={() => editorRef.current?.toggleMinimap()}
            className="glass-btn focus-ring h-8 px-3 text-[11px]"
          >
            <Map className="h-3.5 w-3.5" />
            Mini-map
          </button>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-light px-3 py-1.5 text-[11px] font-medium text-accent">
            <Crosshair className="h-3.5 w-3.5" />
            Click a connection line to inspect title and style metadata
          </div>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-border shadow-glass"
        style={{ height: '70vh', minHeight: '400px' }}
      >
        {isFramingView && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface-solid">
            <div className="glass-strong rounded-full px-4 py-2 text-xs font-medium text-muted">
              Framing map view…
            </div>
          </div>
        )}
        <MindmapEditor
          ref={editorRef}
          initialData={data}
          readOnly
          allowViewerControls
          allowViewerSearch
          defaultShowMinimap={false}
        />
      </div>
    </section>
  )
}

function BulletJournalShareView({ data }: { data: BulletJournalData }) {
  const groupedEntries = data.entries.reduce<Record<string, typeof data.entries>>((groups, entry) => {
    const key = entry.entry_date || 'Undated'
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(entry)
    return groups
  }, {})

  const orderedDates = Object.keys(groupedEntries).sort((left, right) => left.localeCompare(right))

  if (orderedDates.length === 0) {
    return <ShareEmptyState>This journal is empty.</ShareEmptyState>
  }

  return (
    <section className="space-y-5">
      {orderedDates.map((dateKey) => (
        <div key={dateKey} className="glass-subtle rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Calendar className="h-4 w-4 text-muted" />
            <span>
              {dateKey === 'Undated'
                ? dateKey
                : new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date(dateKey))}
            </span>
          </div>
          <div className="space-y-2">
            {groupedEntries[dateKey]
              .slice()
              .sort((left, right) => left.sort_order - right.sort_order)
              .map((entry) => {
                const signifier = entry.signifier as BulletSignifier
                return (
                  <div
                    key={entry._key}
                    className="flex items-start gap-3 rounded-xl bg-surface-sunken px-3.5 py-2.5"
                    style={{ marginLeft: `${entry.indent_level * 18}px` }}
                  >
                    <div className="mt-0.5 text-base leading-none text-muted">
                      {SIGNIFIER_SYMBOLS[signifier] || '•'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-foreground">
                          {entry.content || 'Empty entry'}
                        </span>
                        <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">
                          {SIGNIFIER_LABELS[signifier] || 'Entry'}
                        </span>
                      </div>
                      {(entry.is_starred || entry.is_priority || entry.is_inspiration) && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-medium">
                          {entry.is_starred && (
                            <span className="rounded-full bg-warning-light px-2 py-0.5 text-warning">
                              Starred
                            </span>
                          )}
                          {entry.is_priority && (
                            <span className="rounded-full bg-danger-light px-2 py-0.5 text-danger">
                              Priority
                            </span>
                          )}
                          {entry.is_inspiration && (
                            <span className="rounded-full bg-success-light px-2 py-0.5 text-success">
                              Inspiration
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      ))}
    </section>
  )
}

function DataSheetShareView({ data }: { data: DataSheetData }) {
  const columns = data.columns || []
  const rows = data.rows || []

  if (columns.length === 0 && rows.length === 0) {
    return <ShareEmptyState>This sheet is empty.</ShareEmptyState>
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Data sheet
        </p>
        <p className="mt-0.5 text-[13px] text-muted">Read-only table preview</p>
      </div>
      <div className="scroll-thin overflow-hidden rounded-2xl border border-border">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-surface-sunken">
              <tr>
                {columns.map((column, index) => (
                  <th
                    key={`${column.name}-${index}`}
                    className="border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
                  >
                    {column.name || `Column ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className="even:bg-surface-sunken">
                  {columns.map((column, colIndex) => (
                    <td
                      key={`${rowIndex}-${colIndex}`}
                      className="border-b border-border px-4 py-2.5 align-top text-[13px] text-foreground"
                    >
                      {row[colIndex] || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function PdfAnnotationShareView({ data, pdfUrl }: { data: PdfAnnotationData; pdfUrl?: string | null }) {
  const annotationCount = data.pages.reduce((total, page) => {
    return total + page.strokes.length + page.textAnnotations.length + page.shapes.length + (page.stickyNotes?.length || 0)
  }, 0)

  const stats = [
    { label: 'Pages', value: data.totalPages },
    { label: 'Annotations', value: annotationCount },
    { label: 'Zoom', value: `${Math.round((data.zoom || 1) * 100)}%` },
  ]

  return (
    <section className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-subtle rounded-2xl px-4 py-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              {stat.label}
            </p>
            <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {pdfUrl ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-sunken shadow-glass">
          <iframe
            src={pdfUrl}
            title="Shared PDF note"
            className="h-[70vh] w-full"
          />
        </div>
      ) : (
        <ShareEmptyState>
          The PDF file itself is not available in this published view, but the annotation summary is
          preserved.
        </ShareEmptyState>
      )}
    </section>
  )
}

function renderNoteBody(share: PublishedNoteShare) {
  switch (share.note_type) {
    case 'rich-text': {
      const sanitized = DOMPurify.sanitize(share.content, {
        USE_PROFILES: { html: true },
        ALLOW_DATA_ATTR: true,
        ADD_ATTR: ['class', 'style', 'colspan', 'rowspan', 'disabled', 'checked'],
      })
      const processed = postProcessNoteHtml(sanitized)

      return (
        <article
          className="share-note-content max-w-none"
          dangerouslySetInnerHTML={{ __html: processed }}
        />
      )
    }
    case 'drawing': {
      const drawingData = safeParseJson<DrawingData>(share.content)
      return drawingData ? (
        <DrawingShareView data={drawingData} />
      ) : (
        <ShareEmptyState>This drawing could not be loaded.</ShareEmptyState>
      )
    }
    case 'mindmap': {
      const mindmapData = safeParseJson<MindmapData>(share.content)
      return mindmapData ? (
        <MindmapShareView data={mindmapData} />
      ) : (
        <ShareEmptyState>This mind map could not be loaded.</ShareEmptyState>
      )
    }
    case 'bullet-journal': {
      const bulletJournalData = safeParseJson<BulletJournalData>(share.content)
      return bulletJournalData ? (
        <BulletJournalShareView data={bulletJournalData} />
      ) : (
        <ShareEmptyState>This journal could not be loaded.</ShareEmptyState>
      )
    }
    case 'data-sheet': {
      const dataSheetData = safeParseJson<DataSheetData>(share.content)
      return dataSheetData ? (
        <DataSheetShareView data={dataSheetData} />
      ) : (
        <ShareEmptyState>This data sheet could not be loaded.</ShareEmptyState>
      )
    }
    case 'pdf-annotation': {
      const pdfAnnotationData = safeParseJson<PdfAnnotationData>(share.content)
      return pdfAnnotationData ? (
        <PdfAnnotationShareView data={pdfAnnotationData} pdfUrl={share.metadata?.pdfUrl} />
      ) : (
        <ShareEmptyState>This PDF note could not be loaded.</ShareEmptyState>
      )
    }
    default:
      return (
        <pre className="overflow-x-auto rounded-2xl border border-border bg-surface-solid p-5 text-sm leading-6 text-foreground">
          {share.content}
        </pre>
      )
  }
}

function getTypeIcon(noteType: NoteType) {
  switch (noteType) {
    case 'drawing':
      return PenTool
    case 'mindmap':
      return Network
    case 'bullet-journal':
      return BookOpen
    case 'data-sheet':
      return Table2
    case 'pdf-annotation':
      return FilePenLine
    default:
      return FileText
  }
}

export default function SharedNoteView({ share }: SharedNoteViewProps) {
  const typePresentation = getNoteTypePresentation(share.note_type)
  const TypeIcon = getTypeIcon(share.note_type)
  const publishedLabel = useMemo(() => formatPublishedDate(share.published_at), [share.published_at])
  const { resolvedTheme, toggleTheme } = useTheme()
  const [readingProgress, setReadingProgress] = useState(0)

  const { processedHtml, tocHeadings } = useMemo(() => {
    if (share.note_type !== 'rich-text') return { processedHtml: '', tocHeadings: [] as TocHeading[] }
    const sanitized = DOMPurify.sanitize(share.content, {
      USE_PROFILES: { html: true },
      ALLOW_DATA_ATTR: true,
      ADD_ATTR: ['class', 'style', 'colspan', 'rowspan', 'disabled', 'checked'],
    })
    const html = postProcessNoteHtml(sanitized)
    return { processedHtml: html, tocHeadings: extractHeadings(html) }
  }, [share.note_type, share.content])

  // Reading progress bar
  useEffect(() => {
    if (share.note_type !== 'rich-text') return

    const handleScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight <= 0) {
        setReadingProgress(100)
        return
      }
      setReadingProgress(Math.min(100, Math.round((scrollTop / docHeight) * 100)))
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [share.note_type])

  // Compute estimated reading time for rich-text
  const readingTime = useMemo(() => {
    if (share.note_type !== 'rich-text') return null
    const text = share.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const wordCount = text.split(/\s+/).filter(Boolean).length
    const minutes = Math.max(1, Math.round(wordCount / 200))
    return { minutes, wordCount }
  }, [share.note_type, share.content])

  return (
    <main className="page-aurora relative min-h-screen scroll-smooth px-4 pb-10 pt-5 text-foreground sm:px-6 lg:px-8">
      {/* Reading progress bar */}
      {share.note_type === 'rich-text' && (
        <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[3px]">
          <div
            className="h-full transition-[width] duration-150 ease-out"
            style={{
              width: `${readingProgress}%`,
              background: 'var(--accent-gradient)',
              boxShadow: '0 0 14px var(--accent-glow)',
            }}
          />
        </div>
      )}

      <div className="mx-auto w-full max-w-5xl">
        {/* Top bar: brand + theme toggle */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="focus-ring inline-flex items-center gap-2 rounded-full px-1 py-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
          >
            <img src="/icon-192.png" alt="" className="h-6 w-6 rounded-md object-contain ring-1 ring-black/5 dark:ring-white/10" />
            <span className="font-semibold text-foreground">MindViz Notes</span>
            <span className="hidden sm:inline">· Published note</span>
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            className="glass-btn focus-ring"
            aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {resolvedTheme === 'dark' ? (
              <>
                <Sun className="h-4 w-4" />
                <span className="hidden sm:inline">Light mode</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4" />
                <span className="hidden sm:inline">Dark mode</span>
              </>
            )}
          </button>
        </div>

        <header className="glass-card mb-6 overflow-hidden">
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)] lg:items-end lg:p-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-light px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
                  <Globe className="h-3 w-3" />
                  Published
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-muted">
                  <TypeIcon className="h-3 w-3" />
                  {typePresentation.label}
                </span>
                {readingTime && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-muted">
                    <Clock className="h-3 w-3" />
                    {readingTime.minutes} min read · {readingTime.wordCount.toLocaleString()} words
                  </span>
                )}
              </div>

              <h1 className="mt-4 text-balance font-display text-3xl font-semibold leading-[1.12] tracking-[-0.03em] text-foreground sm:text-4xl lg:text-[2.6rem]">
                {share.title || 'Untitled note'}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
                A read-only published copy. Editing stays private in the workspace — share the
                thinking, not the drafts.
              </p>
            </div>

            <div className="grid gap-1 rounded-2xl border border-border bg-surface-sunken p-2">
              <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-hover text-muted">
                  <TypeIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Format
                  </p>
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {typePresentation.label}
                  </p>
                </div>
              </div>
              <div className="glass-divider" />
              <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-hover text-muted">
                  <Calendar className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Published
                  </p>
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {publishedLabel}
                  </p>
                </div>
              </div>
              {readingTime && (
                <>
                  <div className="glass-divider" />
                  <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-hover text-muted">
                      <Clock className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                        Reading time
                      </p>
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {readingTime.minutes} min · {readingTime.wordCount.toLocaleString()} words
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {share.note_type === 'rich-text' && <FloatingTOC headings={tocHeadings} />}

        <section className="glass-card overflow-hidden">
          <div
            className={
              share.note_type === 'rich-text'
                ? 'px-5 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12'
                : 'p-4 sm:p-6 lg:p-8'
            }
          >
            {share.note_type === 'rich-text' ? (
              <div className="mx-auto max-w-reading">
                <article
                  className="share-note-content max-w-none"
                  dangerouslySetInnerHTML={{ __html: processedHtml }}
                />
              </div>
            ) : (
              renderNoteBody(share)
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-8 flex flex-col items-center gap-3 pb-4 text-center">
          <div
            aria-hidden
            className="h-px w-40"
            style={{
              background:
                'linear-gradient(90deg, transparent, var(--border-strong), transparent)',
            }}
          />
          <p className="flex items-center justify-center gap-2 text-xs text-muted">
            <img src="/icon-192.png" alt="" className="h-4 w-4 rounded object-contain ring-1 ring-black/5 dark:ring-white/10" />
            Published with
            <span className="font-semibold text-foreground">MindViz Notes</span>
          </p>
          <p className="text-xs text-muted">A calm home for notes, mind maps, and projects.</p>
          <Link href="/signup" className="glass-btn focus-ring mt-1 h-9 px-4 text-xs">
            Create your own workspace
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </footer>
      </div>
    </main>
  )
}
