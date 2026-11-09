'use client'

import { useMemo } from 'react'
import { Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/components/shell/utils'
import type { ChatConversationSummary } from '@/lib/chat/types'

export interface ChatConversationListProps {
  conversations: ChatConversationSummary[]
  currentId: string | null
  loading?: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  className?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

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

/** Conversation history pane for the Chat view. */
export default function ChatConversationList({
  conversations,
  currentId,
  loading = false,
  onSelect,
  onNew,
  onDelete,
  className = '',
}: ChatConversationListProps) {
  const groups = useMemo(() => {
    const order = ['Today', 'Yesterday', 'Previous 7 days', 'Earlier']
    const map = new Map<string, ChatConversationSummary[]>()
    for (const conversation of conversations) {
      const bucket = bucketFor(conversation.updated_at || conversation.created_at)
      const list = map.get(bucket) ?? []
      list.push(conversation)
      map.set(bucket, list)
    }
    return order
      .filter((label) => map.has(label))
      .map((label) => ({ label, items: map.get(label) as ChatConversationSummary[] }))
  }, [conversations])

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Conversations
        </span>
        <button
          type="button"
          onClick={onNew}
          className="glass-btn glass-btn-ghost focus-ring flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-medium"
          title="New chat"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading && conversations.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Loading conversations…
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-relaxed text-muted">
            No conversations yet. Your chats are saved here automatically.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mb-2">
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
                        className={cn(
                          'focus-ring flex w-full items-center gap-2 rounded-xl px-2 py-1.5 pr-8 text-left text-[12.5px] transition-colors',
                          active
                            ? 'bg-accent-light font-medium text-foreground'
                            : 'text-muted hover:bg-surface-hover hover:text-foreground'
                        )}
                      >
                        <MessageSquare
                          className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-accent' : 'text-muted')}
                          aria-hidden="true"
                        />
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
          ))
        )}
      </div>
    </div>
  )
}
