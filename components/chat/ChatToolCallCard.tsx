'use client'

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  ExternalLink,
  FilePenLine,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  FolderTree,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  Loader2,
  Plus,
  Search,
  StickyNote,
  Table2,
  Trash2,
  Waypoints,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/components/shell/utils'
import type { ChatToolCall } from '@/lib/chat/types'

export interface ChatToolTarget {
  kind: 'note' | 'task' | 'deck' | 'event'
  id: string
}

const OPENABLE_ID_ARGS: Record<string, { kind: ChatToolTarget['kind']; keys: string[] }> = {
  create_note: { kind: 'note', keys: ['noteId', 'note_id'] },
  update_note: { kind: 'note', keys: ['noteId', 'note_id'] },
  read_note: { kind: 'note', keys: ['noteId', 'note_id'] },
  create_mindmap_note: { kind: 'note', keys: ['noteId', 'note_id'] },
  create_data_sheet_note: { kind: 'note', keys: ['noteId', 'note_id'] },
  create_bullet_journal_note: { kind: 'note', keys: ['noteId', 'note_id'] },
  create_task: { kind: 'task', keys: ['taskId', 'task_id'] },
  update_task: { kind: 'task', keys: ['taskId', 'task_id'] },
  complete_task: { kind: 'task', keys: ['taskId', 'task_id'] },
  create_deck: { kind: 'deck', keys: ['deckId', 'deck_id'] },
  update_deck: { kind: 'deck', keys: ['deckId', 'deck_id'] },
  add_cards: { kind: 'deck', keys: ['deckId', 'deck_id'] },
  create_event: { kind: 'event', keys: ['eventId', 'event_id'] },
  update_event: { kind: 'event', keys: ['eventId', 'event_id'] },
}

function extractOpenTarget(
  call: ChatToolCall,
  args: Record<string, unknown> | null
): ChatToolTarget | null {
  const spec = OPENABLE_ID_ARGS[call.name]
  if (!spec || call.status !== 'done' || !call.result) return null
  for (const key of spec.keys) {
    const value = args?.[key]
    if (typeof value === 'string' && value.trim()) return { kind: spec.kind, id: value.trim() }
  }
  const match = call.result.match(/\[id:\s*([A-Za-z0-9_-]+)\]/)
  return match ? { kind: spec.kind, id: match[1] } : null
}

const TARGET_LABELS: Record<ChatToolTarget['kind'], string> = {
  note: 'Open note',
  task: 'Open task',
  deck: 'Open deck',
  event: 'Open in calendar',
}

type ToolCategory =
  | 'notes'
  | 'pdf'
  | 'mindmaps'
  | 'web'
  | 'workspace'
  | 'tasks'
  | 'calendar'
  | 'learning'
  | 'data'
  | 'agents'
  | 'system'

interface ToolMeta {
  label: string
  category: ToolCategory
  icon: LucideIcon
}

const CATEGORY_META: Record<ToolCategory, { label: string; className: string }> = {
  notes: { label: 'Notes', className: 'border-accent/20 bg-accent-light/70 text-accent' },
  pdf: { label: 'PDF & OCR', className: 'border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  mindmaps: { label: 'Mind maps', className: 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  web: { label: 'Web', className: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  workspace: { label: 'Workspace', className: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  tasks: { label: 'Tasks', className: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  calendar: { label: 'Calendar', className: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  learning: { label: 'Learn', className: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
  data: { label: 'Structured notes', className: 'border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-300' },
  agents: { label: 'Agent', className: 'border-accent/20 bg-accent-light/70 text-accent' },
  system: { label: 'System', className: 'border-border bg-surface-hover text-muted' },
}

const TOOL_META: Record<string, ToolMeta> = {
  get_current_date: { label: 'Get current date', category: 'system', icon: Clock },
  list_notes: { label: 'List notes', category: 'notes', icon: StickyNote },
  search_notes: { label: 'Search notes', category: 'notes', icon: Search },
  read_note: { label: 'Read note', category: 'notes', icon: FileText },
  create_note: { label: 'Create note', category: 'notes', icon: FilePlus2 },
  append_to_note: { label: 'Append to note', category: 'notes', icon: FilePenLine },
  update_note: { label: 'Update note', category: 'notes', icon: FilePenLine },
  delete_note: { label: 'Delete note', category: 'notes', icon: Trash2 },
  read_pdf_note: { label: 'Read PDF & extract text', category: 'pdf', icon: FileText },
  search_web: { label: 'Search the web', category: 'web', icon: Search },
  fetch_web_page: { label: 'Fetch web page', category: 'web', icon: ExternalLink },
  create_mindmap_note: { label: 'Create mind map', category: 'mindmaps', icon: Waypoints },
  update_mindmap_note: { label: 'Update mind map', category: 'mindmaps', icon: Waypoints },
  list_folders: { label: 'List folders', category: 'workspace', icon: FolderTree },
  list_projects: { label: 'List projects', category: 'workspace', icon: FolderOpen },
  create_folder: { label: 'Create folder', category: 'workspace', icon: FolderPlus },
  create_project: { label: 'Create project', category: 'workspace', icon: Plus },
  update_project: { label: 'Update project', category: 'workspace', icon: FilePenLine },
  get_workspace_overview: { label: 'Workspace overview', category: 'workspace', icon: LayoutDashboard },
  list_tasks: { label: 'List tasks', category: 'tasks', icon: ListTodo },
  create_task: { label: 'Create task', category: 'tasks', icon: Plus },
  complete_task: { label: 'Complete task', category: 'tasks', icon: CheckCircle2 },
  update_task: { label: 'Update task', category: 'tasks', icon: FilePenLine },
  delete_task: { label: 'Delete task', category: 'tasks', icon: Trash2 },
  get_task_stats: { label: 'Task statistics', category: 'tasks', icon: BarChart3 },
  list_events: { label: 'List calendar events', category: 'calendar', icon: Calendar },
  list_timetable_entries: { label: 'List recurring timetable', category: 'calendar', icon: Calendar },
  create_event: { label: 'Create calendar event', category: 'calendar', icon: Calendar },
  update_event: { label: 'Update calendar event', category: 'calendar', icon: Calendar },
  delete_event: { label: 'Delete calendar event', category: 'calendar', icon: Calendar },
  list_decks: { label: 'List study decks', category: 'learning', icon: GraduationCap },
  create_deck: { label: 'Create study deck', category: 'learning', icon: Plus },
  add_cards: { label: 'Add study cards', category: 'learning', icon: FilePlus2 },
  get_stats: { label: 'Learning statistics', category: 'learning', icon: BarChart3 },
  search_cards: { label: 'Search study cards', category: 'learning', icon: Search },
  get_cards: { label: 'Get study cards', category: 'learning', icon: GraduationCap },
  update_card: { label: 'Update study card', category: 'learning', icon: FilePenLine },
  delete_card: { label: 'Delete study card', category: 'learning', icon: Trash2 },
  update_deck: { label: 'Update study deck', category: 'learning', icon: FilePenLine },
  delete_deck: { label: 'Delete study deck', category: 'learning', icon: Trash2 },
  create_data_sheet_note: { label: 'Create data sheet', category: 'data', icon: Table2 },
  create_bullet_journal_note: { label: 'Create bullet journal', category: 'data', icon: FilePlus2 },
  delegate_subtask: { label: 'Delegate subtask', category: 'agents', icon: Cpu },
}

const SUMMARY_KEYS = ['query', 'title', 'name', 'url', 'folder_name', 'project_name', 'note_id', 'task_id', 'date']

function parseArguments(raw: string): { values: Record<string, unknown> | null; malformed: boolean } {
  if (!raw.trim()) return { values: {}, malformed: false }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { values: parsed as Record<string, unknown>, malformed: false }
    }
    return { values: null, malformed: true }
  } catch {
    return { values: null, malformed: true }
  }
}

function getArgumentSummary(args: Record<string, unknown>): string {
  for (const key of SUMMARY_KEYS) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      return value.length > 100 ? `${value.slice(0, 100)}…` : value
    }
  }
  return ''
}

function getOutputPreview(output: string): { text: string; isJson: boolean } {
  try {
    return { text: JSON.stringify(JSON.parse(output), null, 2) ?? output, isJson: true }
  } catch {
    return { text: output, isJson: false }
  }
}

/** A categorized, expandable presentation for a single tool invocation. */
export default function ChatToolCallCard({
  call,
  onOpenTarget,
}: {
  call: ChatToolCall
  onOpenTarget?: (target: ChatToolTarget) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { values: args, malformed: malformedArguments } = useMemo(
    () => parseArguments(call.arguments),
    [call.arguments]
  )
  const knownMeta = TOOL_META[call.name]
  const meta = knownMeta ?? {
    label: call.name.replace(/_/g, ' '),
    category: 'system' as const,
    icon: Wrench,
  }
  const category = CATEGORY_META[meta.category]
  const Icon = meta.icon
  const running = call.status === 'running'
  const failed = call.status === 'error'
  const output = call.result ?? call.error ?? ''
  const hasArguments = Boolean(call.arguments.trim() && (malformedArguments || Object.keys(args ?? {}).length > 0))
  const expandable = Boolean(output.trim()) || hasArguments
  const statusLabel = running ? 'In progress' : failed ? 'Failed' : 'Complete'
  const argumentSummary = args ? getArgumentSummary(args) : ''
  const subAgentTools = Array.isArray(args?.tools)
    ? args.tools.filter((value): value is string => typeof value === 'string')
    : []
  const subAgentPrompt = typeof args?.prompt === 'string' ? args.prompt : ''
  const renderedOutput = output ? getOutputPreview(output) : null
  const openTarget = onOpenTarget ? extractOpenTarget(call, args) : null

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border shadow-sm animate-rise-in',
        failed ? 'border-danger/25 bg-danger-light/50' : 'border-border bg-surface/75',
        meta.category === 'agents' && 'border-accent/20 bg-accent-light/35'
      )}
      aria-label={`${category.label} tool call: ${meta.label}`}
    >
      <button
        type="button"
        onClick={() => expandable && setExpanded((previous) => !previous)}
        className={cn(
          'focus-ring flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
          expandable && 'hover:bg-surface-hover/70'
        )}
        aria-expanded={expandable ? expanded : undefined}
        aria-label={`${meta.label}, ${statusLabel}${argumentSummary ? `: ${argumentSummary}` : ''}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-solid text-accent">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[12px] font-semibold capitalize text-foreground">{meta.label}</span>
            <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none', category.className)}>
              {category.label}
            </span>
          </span>
          {argumentSummary ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted">{argumentSummary}</span>
          ) : meta.category === 'agents' && subAgentPrompt ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted">{subAgentPrompt}</span>
          ) : null}
        </span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 text-[10px] font-medium',
            running ? 'text-warning' : failed ? 'text-danger' : 'text-success'
          )}
          aria-live={running ? 'polite' : undefined}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : failed ? (
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{statusLabel}</span>
        </span>
        {expandable && (
          <span className="shrink-0 text-muted" aria-hidden="true">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        )}
      </button>

      {openTarget && (
        <div className="flex justify-end px-3 pb-1.5">
          <button
            type="button"
            onClick={() => onOpenTarget?.(openTarget)}
            className="focus-ring inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent-light px-2 py-0.5 text-[10px] font-semibold text-accent transition-colors hover:border-accent/50"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            {TARGET_LABELS[openTarget.kind]}
          </button>
        </div>
      )}

      {meta.category === 'agents' && subAgentTools.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2 pl-[3.15rem]" aria-label="Agent tool access">
          {subAgentTools.map((tool) => (
            <span key={tool} className="rounded-md border border-accent/15 bg-surface/60 px-1.5 py-0.5 text-[9px] font-medium text-accent">
              {tool.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {expanded && expandable && (
        <div className="space-y-3 border-t border-border px-3 py-2.5">
          {hasArguments && (
            <div>
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">Input</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-sunken/70 p-2 font-mono text-[10.5px] leading-relaxed text-foreground">
                {malformedArguments ? call.arguments : JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {renderedOutput && (
            <div>
              <p className={cn('mb-1 text-[9px] font-semibold uppercase tracking-[0.1em]', failed ? 'text-danger' : 'text-muted')}>
                {failed ? 'Error details' : 'Result'}
              </p>
              {renderedOutput.isJson ? (
                <pre
                  className={cn(
                    'max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-sunken/70 p-2 font-mono text-[10.5px] leading-relaxed',
                    failed ? 'text-danger' : 'text-foreground'
                  )}
                >
                  {renderedOutput.text}
                </pre>
              ) : (
                <div
                  className={cn(
                    'max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-sunken/50 px-2.5 py-2 text-[11.5px] leading-relaxed text-foreground',
                    failed && 'text-danger'
                  )}
                >
                  {renderedOutput.text}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
