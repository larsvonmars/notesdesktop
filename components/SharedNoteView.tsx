'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { getStroke } from 'perfect-freehand'
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FilePenLine,
  FileText,
  Globe,
  Network,
  PenTool,
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
    doc.querySelectorAll('.file-block-preview, .file-block-download, .file-block-delete')
  )) {
    el.remove()
  }

  // 2. Clean up "• Click to open" text in the file info row
  for (const fileBlock of Array.from(doc.querySelectorAll('[data-block-type="file"]'))) {
    const infoRow = fileBlock.querySelector('.text-xs')
    if (infoRow) {
      for (const span of Array.from(infoRow.querySelectorAll('span'))) {
        const text = (span as HTMLElement).textContent?.trim()
        if (text === '•' || text === 'Click to open') span.remove()
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
    <aside className="hidden xl:block fixed right-6 top-1/2 z-20 w-52 -translate-y-1/2">
      <div className="flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_8px_30px_-8px_rgba(15,23,42,0.18)] backdrop-blur-md">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full shrink-0 items-center justify-between gap-2 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 transition hover:text-slate-800"
        >
          <span>On this page</span>
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
              collapsed ? '' : 'rotate-90'
            }`}
          />
        </button>

        {!collapsed && (
          <nav className="scrollbar-hide overflow-y-auto border-t border-slate-100 px-2 pb-2 pt-1">
            {headings.map((heading) => {
              const isActive = activeId === heading.id
              return (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  className={`flex min-w-0 items-center gap-1.5 rounded-lg py-1.5 text-[13px] leading-snug transition-colors ${
                    isActive
                      ? 'font-medium text-teal-700'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                  style={{ paddingLeft: `${(heading.level - 1) * 10 + 10}px` }}
                >
                  {isActive && (
                    <span className="block h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
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
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">This drawing is empty.</div>
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Drawing</div>
          <div className="text-sm text-slate-600">Read-only preview</div>
        </div>
        {data.pages.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              disabled={pageIndex === 0}
              className="rounded-full border border-slate-300 bg-white p-2 text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous drawing page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium text-slate-700">Page {pageIndex + 1} / {data.pages.length}</div>
            <button
              type="button"
              onClick={() => setPageIndex((current) => Math.min(data.pages.length - 1, current + 1))}
              disabled={pageIndex >= data.pages.length - 1}
              className="rounded-full border border-slate-300 bg-white p-2 text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next drawing page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_25px_80px_-50px_rgba(15,23,42,0.45)]">
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

function MindmapShareView({ data }: { data: MindmapData }) {
  const editorRef = useRef<MindmapEditorHandle>(null)

  // Fit the whole graph into view once the canvas has mounted and sized itself
  useEffect(() => {
    const timer = setTimeout(() => {
      editorRef.current?.fitToView()
    }, 120) // wait for ResizeObserver/canvas sizing in MindmapEditor
    return () => clearTimeout(timer)
  }, [])

  if (!data.nodes[data.rootId]) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">
        This mind map could not be rendered.
      </div>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mind Map</div>
          <div className="text-sm text-slate-600">Pan · Scroll to zoom · Click nodes to collapse/expand</div>
        </div>
      </div>
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_25px_80px_-50px_rgba(15,23,42,0.45)]" style={{ height: '70vh', minHeight: '400px' }}>
        <MindmapEditor ref={editorRef} initialData={data} readOnly />
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
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">This journal is empty.</div>
  }

  return (
    <section className="space-y-6">
      {orderedDates.map((dateKey) => (
        <div key={dateKey} className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Calendar className="h-4 w-4 text-slate-500" />
            <span>{dateKey === 'Undated' ? dateKey : new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date(dateKey))}</span>
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
                    className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3"
                    style={{ marginLeft: `${entry.indent_level * 18}px` }}
                  >
                    <div className="mt-0.5 text-lg leading-none text-slate-700">{SIGNIFIER_SYMBOLS[signifier] || '•'}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{entry.content || 'Empty entry'}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">{SIGNIFIER_LABELS[signifier] || 'Entry'}</span>
                      </div>
                      {(entry.is_starred || entry.is_priority || entry.is_inspiration) && (
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
                          {entry.is_starred && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Starred</span>}
                          {entry.is_priority && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Priority</span>}
                          {entry.is_inspiration && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Inspiration</span>}
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
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">This sheet is empty.</div>
  }

  return (
    <section className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Data Sheet</div>
        <div className="text-sm text-slate-600">Read-only table preview</div>
      </div>
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                {columns.map((column, index) => (
                  <th key={`${column.name}-${index}`} className="border-b border-slate-200 px-4 py-3 font-semibold">
                    {column.name || `Column ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className="odd:bg-white even:bg-slate-50/60">
                  {columns.map((column, colIndex) => (
                    <td key={`${rowIndex}-${colIndex}`} className="border-b border-slate-100 px-4 py-3 align-top text-slate-700">
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

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pages</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{data.totalPages}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Annotations</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{annotationCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Zoom</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{Math.round((data.zoom || 1) * 100)}%</div>
        </div>
      </div>

      {pdfUrl ? (
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <iframe src={pdfUrl} title="Shared PDF note" className="h-[70vh] w-full bg-slate-50" />
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">
          The PDF file itself is not available in this published view, but the annotation summary is preserved.
        </div>
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
          className="share-note-content prose prose-slate max-w-none
            prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-slate-900
            prose-p:text-slate-700 prose-p:leading-relaxed
            prose-a:text-teal-700 prose-a:no-underline hover:prose-a:underline
            prose-blockquote:border-l-teal-400 prose-blockquote:text-slate-600 prose-blockquote:not-italic
            prose-pre:bg-slate-950 prose-pre:text-slate-100 prose-pre:rounded-2xl
            prose-code:rounded prose-code:bg-slate-100 prose-code:text-teal-800 prose-code:before:content-none prose-code:after:content-none
            prose-img:rounded-2xl prose-img:shadow-md
            prose-table:rounded-xl prose-th:bg-slate-100 prose-th:text-slate-700
            prose-hr:border-slate-200
            prose-strong:text-slate-900 prose-li:text-slate-700"
          dangerouslySetInnerHTML={{ __html: processed }}
        />
      )
    }
    case 'drawing': {
      const drawingData = safeParseJson<DrawingData>(share.content)
      return drawingData ? <DrawingShareView data={drawingData} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">This drawing could not be loaded.</div>
    }
    case 'mindmap': {
      const mindmapData = safeParseJson<MindmapData>(share.content)
      return mindmapData ? <MindmapShareView data={mindmapData} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">This mind map could not be loaded.</div>
    }
    case 'bullet-journal': {
      const bulletJournalData = safeParseJson<BulletJournalData>(share.content)
      return bulletJournalData ? <BulletJournalShareView data={bulletJournalData} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">This journal could not be loaded.</div>
    }
    case 'data-sheet': {
      const dataSheetData = safeParseJson<DataSheetData>(share.content)
      return dataSheetData ? <DataSheetShareView data={dataSheetData} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">This data sheet could not be loaded.</div>
    }
    case 'pdf-annotation': {
      const pdfAnnotationData = safeParseJson<PdfAnnotationData>(share.content)
      return pdfAnnotationData ? <PdfAnnotationShareView data={pdfAnnotationData} pdfUrl={share.metadata?.pdfUrl} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">This PDF note could not be loaded.</div>
    }
    default:
      return (
        <pre className="overflow-x-auto rounded-[24px] border border-slate-200 bg-slate-950 p-6 text-sm text-slate-100 shadow-sm">
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#ccfbf1_0%,#f8fafc_40%,#e2e8f0_100%)] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 overflow-hidden rounded-[32px] border border-white/70 bg-white/75 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.5)] backdrop-blur">
          <div className="grid gap-6 px-6 py-8 sm:px-8 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">
                <Globe className="h-3.5 w-3.5" />
                <span>Published Note</span>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{share.title || 'Untitled note'}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  This is a read-only published view of a MindViz note. Editing stays private in the app.
                </p>
              </div>
            </div>

            <div className="grid gap-3 rounded-[28px] border border-slate-200 bg-slate-950/95 p-5 text-slate-50 shadow-inner">
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${typePresentation.iconClassName.replace('text-', 'bg-').replace('500', '100')} bg-white/10 text-white`}>
                  <TypeIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Type</div>
                  <div className="text-sm font-medium text-white">{typePresentation.label}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Published</div>
                  <div className="text-sm font-medium text-white">{publishedLabel}</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {share.note_type === 'rich-text' && <FloatingTOC headings={tocHeadings} />}

        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/85 px-6 py-8 shadow-[0_30px_100px_-60px_rgba(15,23,42,0.45)] backdrop-blur sm:px-8">
          {share.note_type === 'rich-text' ? (
            <article
              className="share-note-content prose prose-slate max-w-none
                prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-slate-900
                prose-p:text-slate-700 prose-p:leading-relaxed
                prose-a:text-teal-700 prose-a:no-underline hover:prose-a:underline
                prose-blockquote:border-l-teal-400 prose-blockquote:text-slate-600 prose-blockquote:not-italic
                prose-pre:bg-slate-950 prose-pre:text-slate-100 prose-pre:rounded-2xl
                prose-code:rounded prose-code:bg-slate-100 prose-code:text-teal-800 prose-code:before:content-none prose-code:after:content-none
                prose-img:rounded-2xl prose-img:shadow-md
                prose-table:rounded-xl prose-th:bg-slate-100 prose-th:text-slate-700
                prose-hr:border-slate-200
                prose-strong:text-slate-900 prose-li:text-slate-700"
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
          ) : (
            renderNoteBody(share)
          )}
        </section>
      </div>
    </main>
  )
}