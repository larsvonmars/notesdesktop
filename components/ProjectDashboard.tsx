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
  ArrowUpRight,
  Type,
  Star,
  Calendar,
  TrendingUp,
  Circle,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Note, NoteType } from '@/lib/notes'
import type { Folder } from '@/lib/folders'
import {
  type Project,
  type QuickLink,
  updateProject,
  updateProjectQuickLinks,
} from '@/lib/projects'
import { getTasks, type Task } from '@/lib/tasks'
import { getNoteTypePresentation, type NoteTypeIconKey } from '@/lib/note-types'
import { sendAIRequestStream, type AIMessage, type DeepSeekModel } from '@/lib/ai'
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

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-emerald-500',
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  todo: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', ring: '#94a3b8' },
  in_progress: { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-300', ring: '#3b82f6' },
  waiting: { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-300', ring: '#f59e0b' },
  completed: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-300', ring: '#10b981' },
  cancelled: { bg: 'bg-stone-100 dark:bg-stone-800', text: 'text-stone-500 dark:text-stone-400', ring: '#a8a29e' },
}

// ────────────────────────────────────────────────────────────────────────────
// PROPS
// ────────────────────────────────────────────────────────────────────────────

export interface ProjectDashboardProps {
  project: Project
  allNotes: Note[]
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
function buildActivityHeatmap(notes: Note[]): { day: string; count: number }[] {
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
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(project.quick_links ?? [])
  const [showAddLink, setShowAddLink] = useState(false)
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? '')
  const [aiSummary, setAiSummary] = useState('')
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryModel, setSummaryModel] = useState<DeepSeekModel>('deepseek-v4-flash')
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

  const activityGroups = useMemo(() => {
    const groups: { label: string; items: Note[] }[] = []
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
    const totalWords = projectNotes.reduce((sum, n) => sum + estimateWordCount(n.content || ''), 0)
    return { noteCount, folderCount, openTasks, totalWords }
  }, [projectNotes, projectFolders, tasks])

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
    const recentWithContent = [...projectNotes]
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
        model: summaryModel,
        signal: controller.signal,
        maxTokens: summaryModel === 'deepseek-v4-pro' ? 2048 : 1024,
        temperature: 0.7,
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setSummaryError(err.message)
      }
    } finally {
      setIsGeneratingSummary(false)
      summaryAbortRef.current = null
    }
  }, [isGeneratingSummary, projectNotes, projectFolders, tasks, openTasks, completedTaskCount, stats.totalWords, project, summaryModel])

  // ── Render helpers ──────────────────────────────────────────────────────
  const NoteTypeIcon = ({ noteType, size = 14 }: { noteType: NoteType; size?: number }) => {
    const pres = getNoteTypePresentation(noteType)
    const Icon = NOTE_TYPE_ICON_MAP[pres.iconKey]
    return <Icon size={size} className={pres.iconClassName} />
  }

  const completionPct = tasks.length > 0 ? Math.round((completedTaskCount / tasks.length) * 100) : 0

  // ── Layout ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      {/* ────── Hero Banner ────── */}
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${project.color}18 0%, ${project.color}08 50%, transparent 100%)` }}>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-[0.07]" style={{ backgroundColor: project.color }} />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full opacity-[0.05]" style={{ backgroundColor: project.color }} />

        <div className="relative mx-auto max-w-7xl px-4 pt-5 pb-8 sm:px-6 lg:px-8">
          <button
            onClick={onClose}
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-hover/60 hover:text-foreground transition-colors backdrop-blur-sm"
          >
            <ArrowLeft size={14} />
            Back to notes
          </button>

          <div className="flex items-start gap-5">
            <div
              className="mt-0.5 h-14 w-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-black/10"
              style={{ backgroundColor: project.color }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-extrabold text-foreground tracking-tight truncate">{project.name}</h1>
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
                    className="w-full resize-none rounded-xl border border-border bg-surface/80 backdrop-blur-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent min-h-[80px]"
                    rows={3}
                  />
                  <p className="mt-1.5 text-[10px] text-muted">Ctrl+Enter to save · Escape to cancel</p>
                </div>
              ) : (
                <button
                  onClick={() => { setDescriptionDraft(project.description ?? ''); setEditingDescription(true) }}
                  className="group mt-1.5 flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors text-left max-w-2xl"
                >
                  <span className="truncate">{project.description || 'Add a project description…'}</span>
                  <Edit3 size={12} className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                </button>
              )}

              {/* Inline meta */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={12} />
                  Created {new Date(project.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {projectNotes.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Activity size={12} />
                    Last edit {relativeTime(recentNotes[0]?.updated_at ?? project.updated_at)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-1">

        {/* ────── Stats Strip ────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard icon={FileText} label="Notes" value={stats.noteCount} accent={project.color} />
          <StatCard icon={FolderOpen} label="Folders" value={stats.folderCount} accent="#f59e0b" />
          <StatCard icon={CheckCircle2} label="Open Tasks" value={stats.openTasks} accent="#10b981" />
          <StatCard icon={Type} label="Words" value={stats.totalWords.toLocaleString()} accent="#8b5cf6" />
        </div>

        {/* ────── AI Summary ────── */}
        <DashboardCard
          title="AI Summary"
          icon={Sparkles}
          className="mb-6"
          action={
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg bg-surface-hover/70 p-0.5">
                <button
                  onClick={() => setSummaryModel('deepseek-v4-flash')}
                  disabled={isGeneratingSummary}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                    summaryModel === 'deepseek-v4-flash'
                      ? 'bg-surface text-foreground shadow-sm'
                      : 'text-muted hover:text-foreground'
                  }`}
                  title="Use DeepSeek V4 Flash"
                >
                  Flash
                </button>
                <button
                  onClick={() => setSummaryModel('deepseek-v4-pro')}
                  disabled={isGeneratingSummary}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                    summaryModel === 'deepseek-v4-pro'
                      ? 'bg-surface text-foreground shadow-sm'
                      : 'text-muted hover:text-foreground'
                  }`}
                  title="Use DeepSeek V4 Pro"
                >
                  Pro
                </button>
              </div>
              <button
                onClick={handleGenerateSummary}
                disabled={projectNotes.length === 0 && tasks.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-surface-hover hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={isGeneratingSummary ? 'Stop generating' : 'Generate AI summary'}
              >
                {isGeneratingSummary ? (
                  <>
                    <div className="h-3 w-3 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin" />
                    Stop
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    {aiSummary ? 'Regenerate' : 'Generate'}
                  </>
                )}
              </button>
            </div>
          }
        >
          {summaryError ? (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle size={14} />
              <span>{summaryError}</span>
            </div>
          ) : aiSummary ? (
            <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {aiSummary}
              {isGeneratingSummary && <span className="inline-block w-1.5 h-4 bg-accent/70 animate-pulse ml-0.5 align-text-bottom rounded-sm" />}
            </div>
          ) : (
            <EmptyState text={projectNotes.length === 0 && tasks.length === 0 ? 'Add notes or tasks first' : 'Click Generate to create an AI-powered project summary'} icon={Sparkles} />
          )}
        </DashboardCard>

        {/* ────── 7-Day Activity Heatmap ────── */}
        <DashboardCard title="Weekly Activity" icon={TrendingUp} className="mb-6">
          <div className="flex items-end gap-2 h-20">
            {heatmap.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative group">
                  <div
                    className="w-full rounded-md transition-all duration-300 min-h-[4px]"
                    style={{
                      height: `${Math.max(6, (d.count / heatmapMax) * 64)}px`,
                      backgroundColor: d.count > 0 ? project.color : 'var(--surface-hover)',
                      opacity: d.count > 0 ? 0.25 + (d.count / heatmapMax) * 0.75 : 1,
                    }}
                  />
                  {d.count > 0 && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-medium text-foreground bg-surface border border-border rounded px-1.5 py-0.5 shadow-sm whitespace-nowrap pointer-events-none">
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">

          {/* ─── LEFT: Recent Notes + Note Types ─── */}
          <div className="lg:col-span-4 space-y-6">
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
                        onClick={() => onSelectNote(note)}
                        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:bg-surface-hover active:scale-[0.99]"
                      >
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${pres.iconBgClassName}`}>
                          <NoteTypeIcon noteType={note.note_type} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate group-hover:text-accent transition-colors">
                            {note.title || 'Untitled'}
                          </div>
                          <div className="text-[11px] text-muted truncate">{pres.label}</div>
                        </div>
                        <span className="text-[10px] text-muted flex-shrink-0 tabular-nums">
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
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${pres.iconBgClassName}`}>
                          <Icon size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-foreground">{pres.label}</span>
                            <span className="text-[10px] text-muted tabular-nums">{count}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
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
          <div className="lg:col-span-4 space-y-6">
            <DashboardCard title="Tasks" icon={CheckCircle2}>
              {isLoadingTasks ? (
                <div className="py-8 flex flex-col items-center gap-2">
                  <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-muted">Loading tasks…</span>
                </div>
              ) : tasks.length === 0 ? (
                <EmptyState text="No tasks linked to this project" icon={CheckCircle2} />
              ) : (
                <div className="space-y-4">
                  {/* Ring chart + stats */}
                  <div className="flex items-center gap-5">
                    <CompletionRing pct={completionPct} color={project.color} />
                    <div className="flex-1 space-y-1.5">
                      <div className="text-2xl font-bold text-foreground tabular-nums">{completionPct}%</div>
                      <div className="text-xs text-muted">{completedTaskCount} of {tasks.length} completed</div>
                      {/* Status pills */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(taskStatusCounts).map(([status, count]) => {
                          const sc = STATUS_COLORS[status]
                          return (
                            <span key={status} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${sc?.bg ?? ''} ${sc?.text ?? ''}`}>
                              {STATUS_LABELS[status] ?? status}
                              <span className="opacity-70">{count}</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Open tasks */}
                  {openTasks.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Open</div>
                      <div className="space-y-0.5">
                        {openTasks.slice(0, 6).map(task => (
                          <div
                            key={task.id}
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-surface-hover transition-colors"
                          >
                            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority] ?? 'bg-slate-400'}`} />
                            <span className="text-sm text-foreground truncate flex-1">{task.title}</span>
                            {task.is_starred && <Star size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
                            {task.due_date && (
                              <span className="text-[10px] text-muted tabular-nums flex-shrink-0">
                                {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        ))}
                        {openTasks.length > 6 && (
                          <p className="text-center text-[11px] text-muted py-1.5">
                            + {openTasks.length - 6} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Upcoming deadlines */}
                  {upcomingTasks.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Upcoming Deadlines</div>
                      <div className="space-y-1">
                        {upcomingTasks.map(task => {
                          const due = new Date(task.due_date!)
                          const daysLeft = Math.ceil((due.getTime() - Date.now()) / 86400000)
                          const isOverdue = daysLeft < 0
                          const isUrgent = daysLeft >= 0 && daysLeft <= 2
                          return (
                            <div key={task.id} className="flex items-center gap-2.5 rounded-lg px-3 py-1.5">
                              <Calendar size={12} className={isOverdue ? 'text-danger' : isUrgent ? 'text-warning' : 'text-muted'} />
                              <span className="text-xs text-foreground truncate flex-1">{task.title}</span>
                              <span className={`text-[10px] font-medium tabular-nums ${isOverdue ? 'text-danger' : isUrgent ? 'text-warning' : 'text-muted'}`}>
                                {isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Today' : `${daysLeft}d left`}
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
          <div className="lg:col-span-4 space-y-6">
            <DashboardCard title="Activity" icon={Activity}>
              {activityGroups.length === 0 ? (
                <EmptyState text="No activity yet" icon={Activity} />
              ) : (
                <div className="space-y-4">
                  {activityGroups.map((group, gi) => (
                    <div key={gi}>
                      <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">{group.label}</div>
                      <div className="relative pl-4 border-l-2 border-border/60 space-y-1">
                        {group.items.map(note => {
                          const pres = getNoteTypePresentation(note.note_type)
                          const Icon = NOTE_TYPE_ICON_MAP[pres.iconKey]
                          return (
                            <div
                              key={note.id}
                              className="relative flex items-center gap-2.5 group cursor-pointer rounded-lg py-1.5 px-2 -ml-2 hover:bg-surface-hover transition-colors"
                              onClick={() => onSelectNote(note)}
                            >
                              <div
                                className="absolute -left-[13px] top-1/2 -translate-y-1/2 h-2 w-2 rounded-full border-2 border-background transition-colors"
                                style={{ backgroundColor: pres.graphStroke }}
                              />
                              <Icon size={13} className={`${pres.iconClassName} flex-shrink-0`} />
                              <span className="text-xs text-foreground truncate flex-1 group-hover:text-accent transition-colors font-medium">
                                {note.title || 'Untitled'}
                              </span>
                              <span className="text-[10px] text-muted flex-shrink-0 tabular-nums">
                                {relativeTime(note.updated_at)}
                              </span>
                            </div>
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
                  onClick={() => setShowAddLink(true)}
                  className="rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
                  title="Add quick link"
                >
                  <Plus size={14} />
                </button>
              }
            >
              {quickLinks.length === 0 && !showAddLink ? (
                <EmptyState text="No quick links yet" icon={Link2} />
              ) : (
                <div className="space-y-1">
                  {quickLinks.map(link => (
                    <div
                      key={link.id}
                      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-hover transition-colors"
                    >
                      <div className="h-7 w-7 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0">
                        <ExternalLink size={13} className="text-muted" />
                      </div>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-foreground hover:text-accent truncate flex-1 transition-colors"
                      >
                        {link.label}
                      </a>
                      <button
                        onClick={() => handleDeleteQuickLink(link.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted hover:text-danger hover:bg-danger-light transition-all"
                        title="Remove link"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {showAddLink && (
                <div className="mt-2 rounded-xl border border-border bg-background p-3 space-y-2">
                  <input
                    ref={linkLabelRef}
                    type="text"
                    value={newLinkLabel}
                    onChange={e => setNewLinkLabel(e.target.value)}
                    placeholder="Label"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent text-foreground placeholder:text-muted"
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
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent text-foreground placeholder:text-muted"
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddQuickLink()
                      if (e.key === 'Escape') { setShowAddLink(false); setNewLinkLabel(''); setNewLinkUrl('') }
                    }}
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => { setShowAddLink(false); setNewLinkLabel(''); setNewLinkUrl('') }}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddQuickLink}
                      disabled={!newLinkLabel.trim() || !newLinkUrl.trim()}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-40"
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
        <DashboardCard title="Note Structure" icon={Network} className="mb-8">
          <div className="h-[320px] sm:h-[400px] rounded-xl bg-background overflow-hidden">
            <NoteGraph
              notes={projectNotes}
              folders={projectFolders}
              onSelectNote={onSelectNote}
            />
          </div>
        </DashboardCard>
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
    <section className={`rounded-2xl border border-border bg-surface shadow-sm shadow-black/[0.03] dark:shadow-none ${className ?? ''}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-muted" />
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">{title}</h2>
        </div>
        {action}
      </div>
      <div className="px-4 pb-4">
        {children}
      </div>
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
    <div className="group relative rounded-2xl border border-border bg-surface p-4 shadow-sm shadow-black/[0.03] dark:shadow-none overflow-hidden transition-all hover:border-border-strong hover:shadow-md hover:shadow-black/[0.05]">
      <div className="absolute top-0 left-0 h-1 w-full rounded-t-2xl" style={{ backgroundColor: accent }} />
      <div className="flex items-center gap-3">
        <div
          className="rounded-xl p-2.5 transition-transform group-hover:scale-105"
          style={{ backgroundColor: `${accent}15` }}
        >
          <Icon size={18} style={{ color: accent }} />
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground tabular-nums leading-none">{value}</div>
          <div className="text-[11px] text-muted mt-0.5">{label}</div>
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
    <div className="relative h-20 w-20 flex-shrink-0">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-hover)" strokeWidth="7" />
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
    <div className="py-8 flex flex-col items-center gap-2 text-center">
      {Icon && (
        <div className="h-10 w-10 rounded-xl bg-surface-hover flex items-center justify-center mb-1">
          <Icon size={18} className="text-muted/60" />
        </div>
      )}
      <p className="text-xs text-muted">{text}</p>
    </div>
  )
}
