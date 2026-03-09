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

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  completed: 'Completed',
  cancelled: 'Cancelled',
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

function estimateWordCount(content: string): number {
  // Content may be JSON (editor blocks) or plain text — estimate from text
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

  // Note type distribution for stats
  const noteTypeDistribution = useMemo(() => {
    const dist = new Map<NoteType, number>()
    for (const n of projectNotes) {
      dist.set(n.note_type, (dist.get(n.note_type) ?? 0) + 1)
    }
    return Array.from(dist.entries())
      .sort((a, b) => b[1] - a[1])
  }, [projectNotes])

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

  // ── Render helpers ──────────────────────────────────────────────────────
  const NoteTypeIcon = ({ noteType }: { noteType: NoteType }) => {
    const pres = getNoteTypePresentation(noteType)
    const Icon = NOTE_TYPE_ICON_MAP[pres.iconKey]
    return <Icon size={14} className={pres.iconClassName} />
  }

  // ── Layout ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">

        {/* ────── Header ────── */}
        <div className="mb-6">
          <button
            onClick={onClose}
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            Back to notes
          </button>

          <div className="flex items-start gap-4">
            <div
              className="mt-1 h-10 w-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: project.color }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-foreground truncate">{project.name}</h1>
              {/* Description / readme */}
              {editingDescription ? (
                <div className="mt-2">
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
                      if (e.key === 'Enter' && e.metaKey) handleSaveDescription()
                    }}
                    placeholder="Add a project description or readme…"
                    className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent min-h-[80px]"
                    rows={4}
                  />
                  <p className="mt-1 text-[10px] text-muted">Press ⌘+Enter to save · Escape to cancel</p>
                </div>
              ) : (
                <button
                  onClick={() => { setDescriptionDraft(project.description ?? ''); setEditingDescription(true) }}
                  className="mt-1 text-sm text-muted hover:text-foreground transition-colors text-left w-full"
                >
                  {project.description || 'Add a project description…'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ────── Stats Row ────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard icon={FileText} label="Notes" value={stats.noteCount} color="text-alpine-500" />
          <StatCard icon={FolderOpen} label="Folders" value={stats.folderCount} color="text-amber-500" />
          <StatCard icon={CheckCircle2} label="Open Tasks" value={stats.openTasks} color="text-emerald-500" />
          <StatCard icon={Type} label="Words" value={stats.totalWords.toLocaleString()} color="text-purple-500" />
        </div>

        {/* ────── Note Structure Graph ────── */}
        <DashboardSection title="Note Structure" icon={Network} className="mb-6">
          <div className="h-[350px] sm:h-[420px] rounded-xl border border-border bg-surface overflow-hidden">
            <NoteGraph
              notes={projectNotes}
              folders={projectFolders}
              onSelectNote={onSelectNote}
            />
          </div>
          {/* Note type breakdown */}
          {noteTypeDistribution.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {noteTypeDistribution.map(([type, count]) => {
                const pres = getNoteTypePresentation(type)
                const Icon = NOTE_TYPE_ICON_MAP[pres.iconKey]
                return (
                  <span key={type} className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-xs text-foreground">
                    <Icon size={12} className={pres.iconClassName} />
                    {pres.label}
                    <span className="text-muted font-medium">{count}</span>
                  </span>
                )
              })}
            </div>
          )}
        </DashboardSection>

        {/* ────── Two-Column Lower Section ────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* LEFT COLUMN */}
          <div className="space-y-6">
            {/* Recent Notes */}
            <DashboardSection title="Recent Notes" icon={Clock}>
              {recentNotes.length === 0 ? (
                <EmptyState text="No notes yet" />
              ) : (
                <div className="space-y-1">
                  {recentNotes.map(note => (
                    <button
                      key={note.id}
                      onClick={() => onSelectNote(note)}
                      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
                    >
                      <NoteTypeIcon noteType={note.note_type} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate group-hover:text-accent-foreground">
                          {note.title || 'Untitled'}
                        </div>
                      </div>
                      <span className="text-[11px] text-muted flex-shrink-0">
                        {relativeTime(note.updated_at)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </DashboardSection>

            {/* Activity Feed */}
            <DashboardSection title="Activity" icon={Activity}>
              {activityFeed.length === 0 ? (
                <EmptyState text="No activity yet" />
              ) : (
                <div className="relative pl-4 border-l-2 border-border space-y-3">
                  {activityFeed.map(note => (
                    <div
                      key={note.id}
                      className="relative flex items-start gap-3 group cursor-pointer"
                      onClick={() => onSelectNote(note)}
                    >
                      {/* Timeline dot */}
                      <div className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-border bg-surface group-hover:border-accent" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground truncate group-hover:text-accent-foreground">
                          <span className="font-medium">{note.title || 'Untitled'}</span>
                          {' '}
                          <span className="text-muted">edited</span>
                        </p>
                        <p className="text-[10px] text-muted">{relativeTime(note.updated_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashboardSection>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            {/* Task Summary */}
            <DashboardSection title="Tasks" icon={CheckCircle2}>
              {isLoadingTasks ? (
                <div className="py-6 text-center text-xs text-muted">Loading tasks…</div>
              ) : tasks.length === 0 ? (
                <EmptyState text="No tasks linked to this project" />
              ) : (
                <div>
                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-muted mb-1">
                      <span>{completedTaskCount} of {tasks.length} completed</span>
                      <span>{tasks.length > 0 ? Math.round((completedTaskCount / tasks.length) * 100) : 0}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${tasks.length > 0 ? (completedTaskCount / tasks.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Open tasks list */}
                  {openTasks.length > 0 && (
                    <div className="space-y-1">
                      {openTasks.slice(0, 8).map(task => (
                        <div
                          key={task.id}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-surface-hover transition-colors"
                        >
                          <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                            task.priority === 'urgent' ? 'bg-red-500' :
                            task.priority === 'high' ? 'bg-orange-500' :
                            task.priority === 'medium' ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`} />
                          <span className="text-sm text-foreground truncate flex-1">{task.title}</span>
                          <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium ${PRIORITY_COLORS[task.priority] ?? ''}`}>
                            {task.priority}
                          </span>
                          {task.is_starred && <Star size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
                        </div>
                      ))}
                      {openTasks.length > 8 && (
                        <p className="text-center text-[11px] text-muted py-1">
                          + {openTasks.length - 8} more tasks
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </DashboardSection>

            {/* Quick Links */}
            <DashboardSection
              title="Quick Links"
              icon={Link2}
              action={
                <button
                  onClick={() => setShowAddLink(true)}
                  className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
                  title="Add quick link"
                >
                  <Plus size={14} />
                </button>
              }
            >
              {quickLinks.length === 0 && !showAddLink ? (
                <EmptyState text="No quick links yet" />
              ) : (
                <div className="space-y-1">
                  {quickLinks.map(link => (
                    <div
                      key={link.id}
                      className="group flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-surface-hover transition-colors"
                    >
                      <ExternalLink size={14} className="text-muted flex-shrink-0" />
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-foreground hover:text-accent-foreground truncate flex-1"
                      >
                        {link.label}
                      </a>
                      <button
                        onClick={() => handleDeleteQuickLink(link.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted hover:text-danger transition-all"
                        title="Remove link"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add link form */}
              {showAddLink && (
                <div className="mt-2 rounded-lg border border-border bg-surface p-3 space-y-2">
                  <input
                    ref={linkLabelRef}
                    type="text"
                    value={newLinkLabel}
                    onChange={e => setNewLinkLabel(e.target.value)}
                    placeholder="Label"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent text-foreground placeholder:text-muted"
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
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent text-foreground placeholder:text-muted"
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddQuickLink()
                      if (e.key === 'Escape') { setShowAddLink(false); setNewLinkLabel(''); setNewLinkUrl('') }
                    }}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setShowAddLink(false); setNewLinkLabel(''); setNewLinkUrl('') }}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddQuickLink}
                      disabled={!newLinkLabel.trim() || !newLinkUrl.trim()}
                      className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </DashboardSection>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function DashboardSection({
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
    <section className={`rounded-xl border border-border bg-surface ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-muted" />
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      <div className="px-4 py-3">
        {children}
      </div>
    </section>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex items-center gap-3">
      <div className={`rounded-lg bg-surface-hover p-2 ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-6 text-center text-xs text-muted">{text}</div>
  )
}
