'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  ArrowLeft,
  FileText,
  FolderOpen,
  CheckCircle2,
  Clock,
  Link2,
  Plus,
  Trash2,
  ExternalLink,
  Activity,
  BarChart3,
  BookOpen,
  PenTool,
  Network,
  Table2,
  FilePenLine,
  Edit3,
  AlertCircle,
  Type,
  Star,
  Calendar,
  TrendingUp,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getNote, getNotesWithContentByProject, type Note, type NoteSummary, type NoteType } from '@/lib/notes'
import type { Folder } from '@/lib/folders'
import {
  type Project,
  type QuickLink,
  updateProject,
  updateProjectQuickLinks,
} from '@/lib/projects'
import { getTasks, type Task } from '@/lib/tasks'
import {
  getNoteTypePresentation,
  type NoteTypeIconKey,
  type NoteTypePresentation,
} from '@/lib/note-types'
import { sendAIRequestStream, type AIMessage } from '@/lib/ai'
import NoteGraph from '@/components/NoteGraph'

// ────────────────────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

const NOTE_TYPE_ICON_MAP: Record<NoteTypeIconKey, LucideIcon> = {
  'file-text': FileText,
  'pen-tool': PenTool,
  network: Network,
  'book-open': BookOpen,
  'table-2': Table2,
  'file-pen-line': FilePenLine,
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-danger',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-muted',
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_PILL: Record<string, string> = {
  todo: 'bg-surface-hover text-muted',
  in_progress: 'bg-accent-light text-accent',
  waiting: 'bg-warning-light text-warning',
  completed: 'bg-success-light text-success',
  cancelled: 'bg-surface-hover text-muted',
}

/** Theme-aware tint for note-type accents. */
function typeTint(presentation: NoteTypePresentation): string {
  return `color-mix(in srgb, ${presentation.graphStroke} 16%, transparent)`
}

function typeInk(presentation: NoteTypePresentation): string {
  return `color-mix(in srgb, ${presentation.graphStroke} 72%, var(--foreground))`
}

/** Pick a readable foreground for a project colour chip. */
function readableOn(color: string): string {
  const hex = color.replace('#', '')
  if (hex.length !== 6) return '#ffffff'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  if ([r, g, b].some((value) => Number.isNaN(value))) return '#ffffff'
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#17162b' : '#ffffff'
}

// ────────────────────────────────────────────────────────────────────────────
// PROPS
// ────────────────────────────────────────────────────────────────────────────

export interface ProjectDashboardProps {
  project: Project
  allNotes: NoteSummary[]
  folders: Folder[]
  onSelectNote: (note: Note) => void
  onUpdateProject: (id: string, updates: Partial<Project>) => void
  onClose: () => void
}

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const d = new Date(dateStr).getTime()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`
  return new Date(dateStr).toLocaleDateString()
}

function dayLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = today.getTime() - target.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function estimateWordCount(content: string): number {
  try {
    const parsed = JSON.parse(content)
    const text = JSON.stringify(parsed)
      .replace(/"type":"[^"]+"/g, '')
      .replace(/[{}[\]":,]/g, ' ')
    return text.split(/\s+/).filter(Boolean).length
  } catch {
    return content.split(/\s+/).filter(Boolean).length
  }
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Build a 7-day heatmap of note edits */
function buildActivityHeatmap(notes: NoteSummary[]): { day: string; count: number }[] {
  const now = new Date()
  const days: { day: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const label = d.toLocaleDateString(undefined, { weekday: 'short' })
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const end = start + 86400000
    const count = notes.filter(n => {
      const t = new Date(n.updated_at).getTime()
      return t >= start && t < end
    }).length
    days.push({ day: label, count })
  }
  return days
}

// ────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ────────────────────────────────────────────────────────────────────────────

export default function ProjectDashboard({
  project,
  allNotes,
  folders,
  onSelectNote,
  onUpdateProject,
  onClose,
}: ProjectDashboardProps) {
  // ── State ───────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  // Bodies for word counts and AI summaries are loaded only while this
  // dashboard is open, not during normal workspace startup.
  const [contentNotes, setContentNotes] = useState<Note[]>([])
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(project.quick_links ?? [])
  const [showAddLink, setShowAddLink] = useState(false)
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? '')
  const [aiSummary, setAiSummary] = useState('')
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const summaryAbortRef = useRef<AbortController | null>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const linkLabelRef = useRef<HTMLInputElement>(null)

  // ── Derived data ────────────────────────────────────────────────────────
  const projectNotes = useMemo(
    () => allNotes.filter(n => n.project_id === project.id),
    [allNotes, project.id]
  )

  const projectFolders = useMemo(
    () => folders.filter(f => f.project_id === project.id),
    [folders, project.id]
  )

  const recentNotes = useMemo(
    () => [...projectNotes].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 8),
    [projectNotes]
  )

  const activityFeed = useMemo(
    () => [...projectNotes].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 20),
    [projectNotes]
  )

  useEffect(() => {
    let cancelled = false
    setContentNotes([])
    void getNotesWithContentByProject(project.id).then(notes => {
      if (!cancelled) setContentNotes(notes)
    })
    return () => {
      cancelled = true
    }
  }, [project.id])

  const notesWithContent: Note[] =
    contentNotes.length > 0
      ? contentNotes
      : projectNotes.map(note => ({ ...note, content: '' }))

  const openNote = useCallback(async (note: NoteSummary) => {
    try {
      const full =
        'content' in note && typeof (note as Note).content === 'string'
          ? (note as Note)
          : await getNote(note.id)
      if (full) onSelectNote(full)
    } catch (error) {
      console.error('Failed to open note from project dashboard:', error)
    }
  }, [onSelectNote])

  const activityGroups = useMemo(() => {
    const groups: { label: string; items: NoteSummary[] }[] = []
    let currentLabel = ''
    for (const note of activityFeed) {
      const label = dayLabel(note.updated_at)
      if (label !== currentLabel) {
        currentLabel = label
        groups.push({ label, items: [] })
      }
      groups[groups.length - 1].items.push(note)
    }
    return groups
  }, [activityFeed])

  const stats = useMemo(() => {
    const noteCount = projectNotes.length
    const folderCount = projectFolders.length
    const openTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length
    const totalWords = notesWithContent.reduce((sum, n) => sum + estimateWordCount(n.content || ''), 0)
    return { noteCount, folderCount, openTasks, totalWords }
  }, [projectNotes, projectFolders, tasks, notesWithContent])

  const openTasks = useMemo(
    () => tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled'),
    [tasks]
  )

  const completedTaskCount = useMemo(
    () => tasks.filter(t => t.status === 'completed').length,
    [tasks]
  )

  const taskStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] ?? 0) + 1
    }
    return counts
  }, [tasks])

  const noteTypeDistribution = useMemo(() => {
    const dist = new Map<NoteType, number>()
    for (const n of projectNotes) {
      dist.set(n.note_type, (dist.get(n.note_type) ?? 0) + 1)
    }
    return Array.from(dist.entries())
      .sort((a, b) => b[1] - a[1])
  }, [projectNotes])

  const heatmap = useMemo(() => buildActivityHeatmap(projectNotes), [projectNotes])
  const heatmapMax = useMemo(() => Math.max(1, ...heatmap.map(d => d.count)), [heatmap])

  const upcomingTasks = useMemo(
    () => openTasks
      .filter(t => t.due_date)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .slice(0, 5),
    [openTasks]
  )

  // ── Load tasks ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setIsLoadingTasks(true)
    getTasks({ projectId: project.id, includeCompleted: true })
      .then(data => {
        if (!cancelled) setTasks(data)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsLoadingTasks(false)
      })
    return () => { cancelled = true }
  }, [project.id])

  // ── Sync quick links from prop ──────────────────────────────────────────
  useEffect(() => {
    setQuickLinks(project.quick_links ?? [])
  }, [project.quick_links])

  // ── Focus refs on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (editingDescription) descriptionRef.current?.focus()
  }, [editingDescription])

  useEffect(() => {
    if (showAddLink) linkLabelRef.current?.focus()
  }, [showAddLink])

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSaveDescription = useCallback(async () => {
    setEditingDescription(false)
    try {
      await updateProject(project.id, { description: descriptionDraft || null })
      onUpdateProject(project.id, { description: descriptionDraft || null })
    } catch (err) {
      console.error('Failed to save description:', err)
    }
  }, [project.id, descriptionDraft, onUpdateProject])

  const handleAddQuickLink = useCallback(async () => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return
    const updated = [...quickLinks, { id: generateId(), label: newLinkLabel.trim(), url: newLinkUrl.trim() }]
    setQuickLinks(updated)
    setNewLinkLabel('')
    setNewLinkUrl('')
    setShowAddLink(false)
    try {
      await updateProjectQuickLinks(project.id, updated)
      onUpdateProject(project.id, { quick_links: updated })
    } catch (err) {
      console.error('Failed to save quick link:', err)
    }
  }, [quickLinks, newLinkLabel, newLinkUrl, project.id, onUpdateProject])

  const handleDeleteQuickLink = useCallback(async (linkId: string) => {
    const updated = quickLinks.filter(l => l.id !== linkId)
    setQuickLinks(updated)
    try {
      await updateProjectQuickLinks(project.id, updated)
      onUpdateProject(project.id, { quick_links: updated })
    } catch (err) {
      console.error('Failed to delete quick link:', err)
    }
  }, [quickLinks, project.id, onUpdateProject])

  // ── AI Summary handler ─────────────────────────────────────────────────
  const handleGenerateSummary = useCallback(async () => {
    if (isGeneratingSummary) {
      summaryAbortRef.current?.abort()
      return
    }

    setIsGeneratingSummary(true)
    setSummaryError(null)
    setAiSummary('')

    const controller = new AbortController()
    summaryAbortRef.current = controller

    // Extract readable text from note JSON content
    const extractText = (content: string, maxLen: number = 500): string => {
      try {
        const parsed = JSON.parse(content)
        const text = JSON.stringify(parsed)
          .replace(/"type":"[^"]+"/g, '')
          .replace(/[{}[\]":,]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
      } catch {
        const text = content.replace(/\s+/g, ' ').trim()
        return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
      }
    }

    // Build context about the project for the AI
    const recentWithContent = [...notesWithContent]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 10)
      .map(n => {
        const pres = getNoteTypePresentation(n.note_type)
        const content = n.content ? extractText(n.content) : '(empty)'
        return `- "${n.title || 'Untitled'}" (${pres.label}, updated ${relativeTime(n.updated_at)})\n  Content: ${content}`
      }).join('\n')

    const taskSummaries = tasks.slice(0, 30).map(t => {
      const status = STATUS_LABELS[t.status] ?? t.status
      const due = t.due_date ? `, due ${new Date(t.due_date).toLocaleDateString()}` : ', no due date'
      return `- [${status}] "${t.title}" (${t.priority} priority${due})`
    }).join('\n')

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: 'You are a concise project analyst. Generate a brief, high-level project summary in 3-5 short paragraphs. Cover: overall status, key areas of focus based on note content, task progress with specific deadlines worth noting, and any notable patterns. Use plain text, no markdown headers or bullet lists. Be direct and insightful.',
      },
      {
        role: 'user',
        content: `Summarize this project:\n\nProject: ${project.name}\nDescription: ${project.description || 'No description'}\nCreated: ${new Date(project.created_at).toLocaleDateString()}\nNotes: ${projectNotes.length} total, ${projectFolders.length} folders, ~${stats.totalWords.toLocaleString()} words\nTasks: ${tasks.length} total (${completedTaskCount} completed, ${openTasks.length} open)\n\nRecent Notes (with content excerpts):\n${recentWithContent || 'None yet'}\n\nTasks:\n${taskSummaries || 'None yet'}`,
      },
    ]

    try {
      await sendAIRequestStream(messages, {
        onToken: (token) => setAiSummary(prev => prev + token),
        onError: (error) => setSummaryError(error.message),
      }, {
        signal: controller.signal,
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setSummaryError(err.message)
      }
    } finally {
      setIsGeneratingSummary(false)
      summaryAbortRef.current = null
    }
  }, [isGeneratingSummary, notesWithContent, projectNotes, projectFolders, tasks, openTasks, completedTaskCount, stats.totalWords, project])

  // ── Render helpers ──────────────────────────────────────────────────────
  const NoteTypeIcon = ({ noteType, size = 14 }: { noteType: NoteType; size?: number }) => {
    const pres = getNoteTypePresentation(noteType)
    const Icon = NOTE_TYPE_ICON_MAP[pres.iconKey]
    return <Icon size={size} style={{ color: typeInk(pres) }} />
  }

  const completionPct = tasks.length > 0 ? Math.round((completedTaskCount / tasks.length) * 100) : 0

  // ── Layout ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full w-full overflow-y-auto scroll-thin">
      <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-12">
        {/* ────── Hero Banner ────── */}
        <div className="glass animate-rise-in relative overflow-hidden rounded-3xl">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${project.color}26 0%, ${project.color}0d 48%, transparent 100%)`,
            }}
          />
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-20 blur-3xl"
            style={{ backgroundColor: project.color }}
          />
          <div
            className="pointer-events-none absolute -bottom-16 -left-20 h-48 w-48 rounded-full opacity-10 blur-3xl"
            style={{ backgroundColor: project.color }}
          />

          <div className="relative px-5 pb-6 pt-4 sm:px-7 sm:pb-7 sm:pt-5">
            <button
              type="button"
              onClick={onClose}
              className="glass-btn-ghost mb-4 w-auto gap-1.5 px-2.5 text-[11px]"
            >
              <ArrowLeft size={13} />
              Back to notes
            </button>

            <div className="flex items-start gap-4 sm:gap-5">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-display text-2xl font-bold shadow-glass sm:h-16 sm:w-16"
                style={{ backgroundColor: project.color, color: readableOn(project.color) }}
              >
                {project.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
                  {project.name}
                </h1>
                {editingDescription ? (
                  <div className="mt-2 max-w-2xl">
                    <textarea
                      ref={descriptionRef}
                      value={descriptionDraft}
                      onChange={e => setDescriptionDraft(e.target.value)}
                      onBlur={handleSaveDescription}
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          setEditingDescription(false)
                          setDescriptionDraft(project.description ?? '')
                        }
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveDescription()
                      }}
                      placeholder="Add a project description…"
                      className="glass-input h-auto min-h-[84px] w-full resize-none px-4 py-3 text-sm leading-6"
                      rows={3}
                    />
                    <p className="mt-1.5 text-[10px] text-muted">
                      Ctrl+Enter to save · Escape to cancel
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setDescriptionDraft(project.description ?? ''); setEditingDescription(true) }}
                    className="focus-ring group mt-1.5 flex max-w-2xl items-center gap-1.5 rounded-md text-left text-sm text-muted transition-colors hover:text-foreground"
                  >
                    <span className="truncate">
                      {project.description || 'Add a project description…'}
                    </span>
                    <Edit3
                      size={12}
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
                    />
                  </button>
                )}

                {/* Inline meta */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar size={12} />
                    Created{' '}
                    {new Date(project.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {projectNotes.length > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <Activity size={12} />
                      Last edit {relativeTime(recentNotes[0]?.updated_at ?? project.updated_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {/* ────── Stats Strip ────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={FileText} label="Notes" value={stats.noteCount} accent={project.color} />
            <StatCard icon={FolderOpen} label="Folders" value={stats.folderCount} accent="var(--hue-amber)" />
            <StatCard icon={CheckCircle2} label="Open tasks" value={stats.openTasks} accent="var(--hue-mint)" />
            <StatCard icon={Type} label="Words" value={stats.totalWords.toLocaleString()} accent="var(--hue-violet)" />
          </div>

          {/* ────── AI Summary ────── */}
          <DashboardCard
            title="AI Summary"
            icon={Sparkles}
            action={
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={projectNotes.length === 0 && tasks.length === 0}
                className="glass-btn-ghost w-auto gap-1.5 px-2.5 text-[11px]"
                title={isGeneratingSummary ? 'Stop generating' : 'Generate AI summary'}
              >
                {isGeneratingSummary ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-accent border-t-transparent" />
                    Stop
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    {aiSummary ? 'Regenerate' : 'Generate'}
                  </>
                )}
              </button>
            }
          >
            {summaryError ? (
              <div className="flex items-center gap-2 rounded-xl bg-danger-light px-3 py-2 text-xs text-danger">
                <AlertCircle size={14} />
                <span>{summaryError}</span>
              </div>
            ) : aiSummary ? (
              <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {aiSummary}
                {isGeneratingSummary && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent align-text-bottom opacity-70" />
                )}
              </div>
            ) : (
              <EmptyState
                text={
                  projectNotes.length === 0 && tasks.length === 0
                    ? 'Add notes or tasks first'
                    : 'Click Generate to create an AI-powered project summary'
                }
                icon={Sparkles}
              />
            )}
          </DashboardCard>

          {/* ────── 7-Day Activity Heatmap ────── */}
          <DashboardCard title="Weekly Activity" icon={TrendingUp}>
            <div className="flex h-20 items-end gap-2">
              {heatmap.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="group relative w-full">
                    <div
                      className="min-h-[4px] w-full rounded-md transition-all duration-300"
                      style={{
                        height: `${Math.max(6, (d.count / heatmapMax) * 64)}px`,
                        backgroundColor: d.count > 0 ? project.color : 'var(--surface-hover)',
                        opacity: d.count > 0 ? 0.25 + (d.count / heatmapMax) * 0.75 : 1,
                      }}
                    />
                    {d.count > 0 && (
                      <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-foreground opacity-0 shadow-glass-sm transition-opacity group-hover:opacity-100">
                        {d.count} edit{d.count !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-muted">{d.day}</span>
                </div>
              ))}
            </div>
          </DashboardCard>

          {/* ────── Main 3-Column Grid ────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* ─── LEFT: Recent Notes + Note Types ─── */}
            <div className="min-w-0 space-y-5 lg:col-span-4">
              <DashboardCard title="Recent Notes" icon={Clock}>
                {recentNotes.length === 0 ? (
                  <EmptyState text="No notes yet" icon={FileText} />
                ) : (
                  <div className="space-y-0.5">
                    {recentNotes.map(note => {
                      const pres = getNoteTypePresentation(note.note_type)
                      return (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => void openNote(note)}
                          className="glass-row group gap-3 px-2 py-2.5"
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                            style={{ backgroundColor: typeTint(pres) }}
                          >
                            <NoteTypeIcon noteType={note.note_type} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-foreground transition-colors group-hover:text-accent">
                              {note.title || 'Untitled'}
                            </span>
                            <span className="block truncate text-[11px] text-muted">
                              {pres.label}
                            </span>
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted">
                            {relativeTime(note.updated_at)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </DashboardCard>

              {/* Note Type Distribution */}
              {noteTypeDistribution.length > 0 && (
                <DashboardCard title="Note Types" icon={BarChart3}>
                  <div className="space-y-2.5">
                    {noteTypeDistribution.map(([type, count]) => {
                      const pres = getNoteTypePresentation(type)
                      const Icon = NOTE_TYPE_ICON_MAP[pres.iconKey]
                      const pct = projectNotes.length > 0 ? (count / projectNotes.length) * 100 : 0
                      return (
                        <div key={type} className="flex items-center gap-3">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                            style={{ backgroundColor: typeTint(pres) }}
                          >
                            <Icon size={13} style={{ color: typeInk(pres) }} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-xs font-medium text-foreground">{pres.label}</span>
                              <span className="text-[10px] tabular-nums text-muted">{count}</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, backgroundColor: pres.graphStroke }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </DashboardCard>
              )}
            </div>

            {/* ─── CENTER: Tasks ─── */}
            <div className="min-w-0 space-y-5 lg:col-span-4">
              <DashboardCard title="Tasks" icon={CheckCircle2}>
                {isLoadingTasks ? (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    <span className="text-xs text-muted">Loading tasks…</span>
                  </div>
                ) : tasks.length === 0 ? (
                  <EmptyState text="No tasks linked to this project" icon={CheckCircle2} />
                ) : (
                  <div className="space-y-4">
                    {/* Ring chart + stats */}
                    <div className="flex items-center gap-5">
                      <CompletionRing pct={completionPct} color={project.color} />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="font-display text-2xl font-semibold tabular-nums leading-none text-foreground">
                          {completionPct}%
                        </div>
                        <div className="text-xs text-muted">
                          {completedTaskCount} of {tasks.length} completed
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(taskStatusCounts).map(([status, count]) => (
                            <span
                              key={status}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_PILL[status] ?? 'bg-surface-hover text-muted'}`}
                            >
                              {STATUS_LABELS[status] ?? status}
                              <span className="opacity-70">{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Open tasks */}
                    {openTasks.length > 0 && (
                      <div>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                          Open
                        </div>
                        <div className="space-y-0.5">
                          {openTasks.slice(0, 6).map(task => (
                            <div
                              key={task.id}
                              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface-hover"
                            >
                              <div
                                className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority] ?? 'bg-muted'}`}
                              />
                              <span className="flex-1 truncate text-[13px] text-foreground">
                                {task.title}
                              </span>
                              {task.is_starred && (
                                <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" />
                              )}
                              {task.due_date && (
                                <span className="shrink-0 text-[10px] tabular-nums text-muted">
                                  {new Date(task.due_date).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              )}
                            </div>
                          ))}
                          {openTasks.length > 6 && (
                            <p className="py-1.5 text-center text-[11px] text-muted">
                              + {openTasks.length - 6} more
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Upcoming deadlines */}
                    {upcomingTasks.length > 0 && (
                      <div>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                          Upcoming Deadlines
                        </div>
                        <div className="space-y-1">
                          {upcomingTasks.map(task => {
                            const due = new Date(task.due_date!)
                            const daysLeft = Math.ceil((due.getTime() - Date.now()) / 86400000)
                            const isOverdue = daysLeft < 0
                            const isUrgent = daysLeft >= 0 && daysLeft <= 2
                            return (
                              <div key={task.id} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
                                <Calendar
                                  size={12}
                                  className={isOverdue ? 'text-danger' : isUrgent ? 'text-warning' : 'text-muted'}
                                />
                                <span className="flex-1 truncate text-xs text-foreground">
                                  {task.title}
                                </span>
                                <span
                                  className={`text-[10px] font-medium tabular-nums ${
                                    isOverdue ? 'text-danger' : isUrgent ? 'text-warning' : 'text-muted'
                                  }`}
                                >
                                  {isOverdue
                                    ? `${Math.abs(daysLeft)}d overdue`
                                    : daysLeft === 0
                                      ? 'Today'
                                      : `${daysLeft}d left`}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </DashboardCard>
            </div>

            {/* ─── RIGHT: Activity + Quick Links ─── */}
            <div className="min-w-0 space-y-5 lg:col-span-4">
              <DashboardCard title="Activity" icon={Activity}>
                {activityGroups.length === 0 ? (
                  <EmptyState text="No activity yet" icon={Activity} />
                ) : (
                  <div className="space-y-4">
                    {activityGroups.map((group, gi) => (
                      <div key={gi}>
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                          {group.label}
                        </div>
                        <div className="relative space-y-1 border-l-2 border-border pl-4">
                          {group.items.map(note => {
                            const pres = getNoteTypePresentation(note.note_type)
                            const Icon = NOTE_TYPE_ICON_MAP[pres.iconKey]
                            return (
                              <button
                                key={note.id}
                                type="button"
                                onClick={() => void openNote(note)}
                                className="focus-ring group relative -ml-2 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
                              >
                                <span
                                  className="absolute -left-[13px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-background"
                                  style={{ backgroundColor: pres.graphStroke }}
                                />
                                <Icon size={13} style={{ color: typeInk(pres) }} className="shrink-0" />
                                <span className="flex-1 truncate text-xs font-medium text-foreground transition-colors group-hover:text-accent">
                                  {note.title || 'Untitled'}
                                </span>
                                <span className="shrink-0 text-[10px] tabular-nums text-muted">
                                  {relativeTime(note.updated_at)}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardCard>

              {/* Quick Links */}
              <DashboardCard
                title="Quick Links"
                icon={Link2}
                action={
                  <button
                    type="button"
                    onClick={() => setShowAddLink(true)}
                    aria-label="Add quick link"
                    className="glass-btn-ghost"
                    title="Add quick link"
                  >
                    <Plus size={14} />
                  </button>
                }
              >
                {quickLinks.length === 0 && !showAddLink ? (
                  <EmptyState text="No quick links yet" icon={Link2} />
                ) : (
                  <div className="space-y-0.5">
                    {quickLinks.map(link => (
                      <div
                        key={link.id}
                        className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-hover"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-hover">
                          <ExternalLink size={13} className="text-muted" />
                        </div>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="focus-ring flex-1 truncate rounded-md text-[13px] text-foreground transition-colors hover:text-accent"
                        >
                          {link.label}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuickLink(link.id)}
                          aria-label={`Remove ${link.label}`}
                          className="focus-ring rounded-md p-1 text-muted opacity-0 transition-all hover:bg-danger-light hover:text-danger group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
                          title="Remove link"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {showAddLink && (
                  <div className="glass-subtle mt-2 space-y-2 rounded-2xl p-3">
                    <input
                      ref={linkLabelRef}
                      type="text"
                      value={newLinkLabel}
                      onChange={e => setNewLinkLabel(e.target.value)}
                      placeholder="Label"
                      aria-label="Link label"
                      className="glass-input px-3 text-sm"
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddQuickLink()
                        if (e.key === 'Escape') { setShowAddLink(false); setNewLinkLabel(''); setNewLinkUrl('') }
                      }}
                    />
                    <input
                      type="url"
                      value={newLinkUrl}
                      onChange={e => setNewLinkUrl(e.target.value)}
                      placeholder="https://…"
                      aria-label="Link URL"
                      className="glass-input px-3 text-sm"
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddQuickLink()
                        if (e.key === 'Escape') { setShowAddLink(false); setNewLinkLabel(''); setNewLinkUrl('') }
                      }}
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => { setShowAddLink(false); setNewLinkLabel(''); setNewLinkUrl('') }}
                        className="focus-ring rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddQuickLink}
                        disabled={!newLinkLabel.trim() || !newLinkUrl.trim()}
                        className="glass-btn-primary h-8 px-3 text-xs"
                      >
                        Add Link
                      </button>
                    </div>
                  </div>
                )}
              </DashboardCard>
            </div>
          </div>

          {/* ────── Note Structure Graph (full width) ────── */}
          <DashboardCard title="Note Structure" icon={Network}>
            <div className="h-[320px] overflow-hidden rounded-2xl bg-background sm:h-[400px]">
              <NoteGraph
                notes={projectNotes}
                folders={projectFolders}
                onSelectNote={(note) => void openNote(note)}
              />
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function DashboardCard({
  title,
  icon: Icon,
  children,
  className,
  action,
}: {
  title: string
  icon: LucideIcon
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  return (
    <section className={`glass-card overflow-hidden ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-2 px-4 pb-2.5 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-muted">
            <Icon size={13} />
          </span>
          <h2 className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon
  label: string
  value: number | string
  accent: string
}) {
  return (
    <div className="glass-card group relative overflow-hidden p-4 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`,
            color: accent,
          }}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 text-right">
          <div className="truncate font-display text-2xl font-semibold leading-none tabular-nums text-foreground">
            {value}
          </div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
            {label}
          </div>
        </div>
      </div>
    </div>
  )
}

function CompletionRing({ pct, color }: { pct: number; color: string }) {
  const r = 32
  const circumference = 2 * Math.PI * r
  const offset = circumference - (pct / 100) * circumference
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border-strong)" strokeWidth="7" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <CheckCircle2 size={18} className="text-muted" />
      </div>
    </div>
  )
}

function EmptyState({ text, icon: Icon }: { text: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      {Icon && (
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-hover text-muted">
          <Icon size={18} />
        </div>
      )}
      <p className="text-xs text-muted">{text}</p>
    </div>
  )
}