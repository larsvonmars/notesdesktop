'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { cn } from '@/components/shell/utils'
import type { ChatConversationSummary } from '@/lib/chat/types'

export interface ChatConversationListProps {
  conversations: ChatConversationSummary[]
  currentId: string | null
  loading?: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  /** How many of the most recent conversations stay visible before "load all". */
  initialLimit?: number
  className?: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_LIMIT = 10

function bucketFor(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return 'Earlier'
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const diff = startOfToday.getTime() - time
  if (diff <= 0) return 'Today'
  if (diff <= DAY_MS) return 'Yesterday'
  if (diff <= DAY_MS * 7) return 'Previous 7 days'
  return 'Earlier'
}

/** Conversation history list for the Chat sidebar. */
export default function ChatConversationList({
  conversations,
  currentId,
  loading = false,
  onSelect,
  onDelete,
  initialLimit = DEFAULT_LIMIT,
  className = '',
}: ChatConversationListProps) {
  const [expanded, setExpanded] = useState(false)

  // Keep the active conversation reachable even when it sits below the limit.
  const activeIndex = conversations.findIndex((conversation) => conversation.id === currentId)
  const showAll = expanded || activeIndex >= initialLimit
  const visible = showAll ? conversations : conversations.slice(0, initialLimit)
  const hiddenCount = Math.max(0, conversations.length - initialLimit)

  const groups = useMemo(() => {
    const order = ['Today', 'Yesterday', 'Previous 7 days', 'Earlier']
    const map = new Map<string, ChatConversationSummary[]>()
    for (const conversation of visible) {
      const bucket = bucketFor(conversation.updated_at || conversation.created_at)
      const list = map.get(bucket) ?? []
      list.push(conversation)
      map.set(bucket, list)
    }
    return order
      .filter((label) => map.has(label))
      .map((label) => ({ label, items: map.get(label) as ChatConversationSummary[] }))
  }, [visible])

  if (loading && conversations.length === 0) {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-3 text-xs text-muted', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Loading chats…
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <p className={cn('px-3 py-3 text-[11.5px] leading-relaxed text-muted', className)}>
        No chats yet. Your conversations are saved here automatically.
      </p>
    )
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-1 scroll-thin">
        {groups.map((group) => (
          <section key={group.label} className="mb-1.5">
            <h3 className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              {group.label}
            </h3>
            <ul className="space-y-0.5">
              {group.items.map((conversation) => {
                const active = conversation.id === currentId
                return (
                  <li key={conversation.id} className="group/row relative">
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      aria-current={active ? 'true' : undefined}
                      title={conversation.title || 'New conversation'}
                      className={cn(
                        'focus-ring flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 pr-8 text-left text-[12.5px] transition-colors',
                        active
                          ? 'bg-accent-light font-medium text-accent'
                          : 'text-muted hover:bg-[var(--surface-hover)] hover:text-foreground'
                      )}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{conversation.title || 'New conversation'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDelete(conversation.id)
                      }}
                      className="focus-ring absolute right-1 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:text-danger group-hover/row:flex"
                      title="Delete conversation"
                      aria-label={`Delete conversation ${conversation.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {hiddenCount > 0 && (
        <div className="shrink-0 border-t border-[var(--border)] p-1.5">
          <button
            type="button"
            onClick={() => setExpanded((previous) => !previous)}
            className="focus-ring flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-medium text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                Show recent
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                Load all {conversations.length} chats
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
