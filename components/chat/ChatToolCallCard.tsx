'use client'

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  FilePenLine,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderTree,
  ListTodo,
  Loader2,
  Plus,
  Search,
  StickyNote,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/components/shell/utils'
import type { ChatToolCall } from '@/lib/chat/types'

interface ToolMeta {
  label: string
  icon: LucideIcon
}

const TOOL_META: Record<string, ToolMeta> = {
  list_notes: { label: 'Listing notes', icon: StickyNote },
  search_notes: { label: 'Searching notes', icon: Search },
  read_note: { label: 'Reading note', icon: FileText },
  create_note: { label: 'Writing note', icon: FilePlus2 },
  append_to_note: { label: 'Updating note', icon: FilePenLine },
  list_folders: { label: 'Listing folders', icon: FolderTree },
  list_projects: { label: 'Listing projects', icon: FolderOpen },
  list_tasks: { label: 'Scanning tasks', icon: ListTodo },
  create_task: { label: 'Creating task', icon: Plus },
  complete_task: { label: 'Completing task', icon: CheckCircle2 },
  get_task_stats: { label: 'Task overview', icon: BarChart3 },
  get_current_date: { label: 'Getting date & time', icon: Clock },
  delegate_subtask: { label: 'Sub-agent', icon: Cpu },
}

function parseArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Status pill for a single tool invocation, or a sub-agent card when delegating. */
export default function ChatToolCallCard({ call }: { call: ChatToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const args = useMemo(() => parseArguments(call.arguments), [call.arguments])
  const isSubAgent = call.name === 'delegate_subtask'
  const meta: ToolMeta = TOOL_META[call.name] ?? {
    label: call.name.replace(/_/g, ' '),
    icon: Zap,
  }
  const Icon = meta.icon
  const running = call.status === 'running'
  const failed = call.status === 'error'
  const output = call.result ?? call.error ?? ''
  const expandable = output.length > 0

  const subAgentTools = Array.isArray(args.tools)
    ? args.tools.filter((value): value is string => typeof value === 'string')
    : []
  const subAgentPrompt = typeof args.prompt === 'string' ? args.prompt : ''

  if (isSubAgent) {
    const preview = subAgentPrompt.length > 96 ? `${subAgentPrompt.slice(0, 96)}…` : subAgentPrompt
    return (
      <div
        className={cn(
          'rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed animate-rise-in',
          failed ? 'border-danger/25 bg-danger-light' : 'border-accent/20 bg-accent-light/60'
        )}
      >
        <button
          type="button"
          onClick={() => expandable && setExpanded((prev) => !prev)}
          className="focus-ring flex w-full items-start gap-2.5 rounded-lg text-left"
        >
          <span className="mt-0.5 shrink-0">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
            ) : failed ? (
              <AlertCircle className="h-4 w-4 text-danger" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-semibold text-accent">
              <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {running ? 'Agent working…' : failed ? 'Agent error' : 'Agent finished'}
            </span>
            {preview && <span className="mt-0.5 block text-muted">{preview}</span>}
            {subAgentTools.length > 0 && (
              <span className="mt-1.5 flex flex-wrap items-center gap-1">
                {subAgentTools.map((group) => (
                  <span
                    key={group}
                    className="rounded border border-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                  >
                    {group}
                  </span>
                ))}
              </span>
            )}
          </span>
          {expandable && (
            <span className="mt-0.5 shrink-0 text-muted">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
          )}
        </button>
        {expanded && expandable && (
          <pre className="mt-2.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-solid/60 p-2.5 text-[11.5px] leading-relaxed text-muted">
            {output}
          </pre>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl border text-[12px] leading-relaxed animate-rise-in',
        failed ? 'border-danger/25 bg-danger-light' : 'border-border bg-surface/70'
      )}
    >
      <button
        type="button"
        onClick={() => expandable && setExpanded((prev) => !prev)}
        className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left"
        aria-expanded={expandable ? expanded : undefined}
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted" aria-hidden="true" />
        ) : failed ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        )}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-surface-solid/70 text-accent">
          <Icon className="h-3 w-3" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{meta.label}</span>
        {expandable && (
          <span className="shrink-0 text-muted">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>
      {expanded && expandable && (
        <pre
          className={cn(
            'max-h-60 overflow-auto whitespace-pre-wrap border-t border-border px-3 py-2 text-[11.5px] leading-relaxed',
            failed ? 'text-danger' : 'text-muted'
          )}
        >
          {output}
        </pre>
      )}
    </div>
  )
}
