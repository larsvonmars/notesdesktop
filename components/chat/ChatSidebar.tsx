'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  MessageSquare,
  MessagesSquare,
  Plus,
  X,
} from 'lucide-react'
import { cn } from '@/components/shell/utils'
import ChatConversationList from './ChatConversationList'
import type { ChatConversationSummary } from '@/lib/chat/types'

export interface ChatSidebarProps {
  conversations: ChatConversationSummary[]
  currentId: string | null
  loading?: boolean
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  className?: string
}

interface ChatSidebarContentProps extends Omit<ChatSidebarProps, 'className'> {
  /** Renders a close control instead of the collapse toggle (drawer mode). */
  onClose?: () => void
}

const RAIL_LIMIT = 8

/**
 * Right-hand chat history sidebar, mirroring the Planner and Learn sidebars:
 * collapsible on desktop, a slide-over drawer on smaller screens.
 */
export default function ChatSidebar({
  collapsed = false,
  className = '',
  ...contentProps
}: ChatSidebarProps) {
  return (
    <aside
      aria-label="Chat history"
      className={cn(
        'glass-subtle relative flex h-full shrink-0 flex-col overflow-hidden border-l border-[var(--border)] transition-[width] duration-300 ease-out',
        collapsed ? 'w-[68px]' : 'w-[280px]',
        className
      )}
    >
      <ChatSidebarContent {...contentProps} collapsed={collapsed} />
    </aside>
  )
}

function ChatSidebarContent({
  conversations,
  currentId,
  loading = false,
  collapsed = false,
  onToggleCollapsed,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: ChatSidebarContentProps) {
  const isCollapsed = collapsed && !onClose

  return (
    <>
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-[var(--border)] px-2.5',
          isCollapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {!isCollapsed && (
          <span className="flex min-w-0 items-center gap-2 px-1">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-accent-foreground shadow-[0_8px_18px_-8px_var(--accent-glow)]"
              style={{ background: 'var(--accent-gradient)' }}
            >
              <MessagesSquare size={14} strokeWidth={2} />
            </span>
            <span className="font-display text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              Chats
            </span>
            {conversations.length > 0 && (
              <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
                {conversations.length}
              </span>
            )}
          </span>
        )}

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat history"
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
          >
            <X size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand chat history' : 'Collapse chat history'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand chat history' : 'Collapse chat history'}
            className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
          >
            {collapsed ? <ChevronsLeft size={15} /> : <ChevronsRight size={15} />}
          </button>
        )}
      </div>

      {isCollapsed ? (
        <CollapsedRail
          conversations={conversations}
          currentId={currentId}
          loading={loading}
          onSelect={onSelect}
          onNew={onNew}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-2.5 pb-1 pt-2.5">
            <button
              type="button"
              onClick={onNew}
              className="focus-ring flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-accent text-[12px] font-semibold text-accent-foreground shadow-[0_10px_22px_-12px_var(--accent-glow)] transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
            >
              <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
              New chat
            </button>
          </div>

          <ChatConversationList
            conversations={conversations}
            currentId={currentId}
            loading={loading}
            onSelect={onSelect}
            onDelete={onDelete}
            className="min-h-0 flex-1"
          />
        </div>
      )}
    </>
  )
}

function CollapsedRail({
  conversations,
  currentId,
  loading,
  onSelect,
  onNew,
}: {
  conversations: ChatConversationSummary[]
  currentId: string | null
  loading: boolean
  onSelect: (id: string) => void
  onNew: () => void
}) {
  return (
    <>
      <nav
        aria-label="Recent chats"
        className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 py-2 scroll-thin"
      >
        {loading && conversations.length === 0 && (
          <span className="py-1 text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          </span>
        )}

        {conversations.slice(0, RAIL_LIMIT).map((conversation) => {
          const active = conversation.id === currentId
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              aria-current={active ? 'true' : undefined}
              title={conversation.title || 'New conversation'}
              aria-label={conversation.title || 'New conversation'}
              className={cn(
                'focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                active
                  ? 'bg-accent-light text-accent'
                  : 'text-muted hover:bg-[var(--surface-hover)] hover:text-foreground'
              )}
            >
              <MessageSquare size={15} aria-hidden="true" />
            </button>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-[var(--border)] p-2">
        <button
          type="button"
          onClick={onNew}
          aria-label="New chat"
          title="New chat"
          className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-[0_10px_22px_-12px_var(--accent-glow)] transition-[filter,transform] hover:brightness-105 active:scale-95"
        >
          <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
    </>
  )
}

/** Right-hand slide-over used below the desktop sidebar breakpoint. */
export function ChatSidebarDrawer({
  open,
  onClose,
  usePortal = true,
  ...contentProps
}: ChatSidebarContentProps & {
  open: boolean
  onClose: () => void
  /** Set to false when embedding the drawer in a non-portal context. */
  usePortal?: boolean
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    panelRef.current?.focus({ preventScroll: true })
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const drawer = (
    <div className="fixed inset-0 z-50 xl:hidden">
      <button
        type="button"
        aria-label="Close chat history"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-[rgb(9_8_18_/_0.45)] backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Chat history"
        tabIndex={-1}
        style={{
          paddingTop: 'max(var(--sat), 0.5rem)',
          paddingBottom: 'max(var(--sab), 0.5rem)',
        }}
        className="glass-strong animate-rise-in absolute inset-y-0 right-0 flex w-[min(85vw,300px)] flex-col overflow-hidden border-l border-[var(--border)] shadow-glass-lg outline-none"
      >
        <ChatSidebarContent {...contentProps} onClose={onClose} collapsed={false} />
      </div>
    </div>
  )

  if (!usePortal || typeof document === 'undefined') return drawer
  return createPortal(drawer, document.body)
}
