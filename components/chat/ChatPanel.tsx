'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDown,
  Bot,
  Brain,
  Check,
  ChevronRight,
  Copy,
  Cpu,
  FileText,
  History,
  Loader2,
  MessageSquare,
  Plus,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/components/shell/utils'
import { MarkdownContent } from '@/components/ai/AIMarkdown'
import ChatInput from './ChatInput'
import ChatReasoningBlock from './ChatReasoningBlock'
import ChatToolCallCard from './ChatToolCallCard'
import type { ChatStarterPrompt } from '@/lib/chat/prompts'
import type { ChatAttachment, ChatMessage, ChatStatus } from '@/lib/chat/types'

export interface ChatPanelProps {
  title: string
  modelLabel: string
  messages: ChatMessage[]
  status: ChatStatus
  error: string | null
  agentMode: boolean
  onToggleAgentMode: () => void
  input: string
  onInputChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onNewChat: () => void
  starters: ChatStarterPrompt[]
  onStarterClick: (text: string) => void
  copiedId: string | null
  onCopy: (id: string, text: string) => void
  attachments: ChatAttachment[]
  onAttachmentsChange: (attachments: ChatAttachment[]) => void
  attachmentError: string | null
  onAttachmentError: (message: string | null) => void
  forcedTool: string | null
  onForcedToolChange: (tool: string | null) => void
  onOpenHistory?: () => void
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface BubbleProps {
  message: ChatMessage
  isStreaming: boolean
  isLastInGroup: boolean
  showAvatar: boolean
  copiedId: string | null
  onCopy: (id: string, text: string) => void
}

function MessageBubble({ message, isStreaming, isLastInGroup, showAvatar, copiedId, onCopy }: BubbleProps) {
  const time = formatTime(message.createdAt)
  const toolCalls = message.toolCalls ?? []
  const attachments = message.attachments ?? []

  if (message.role === 'user') {
    return (
      <div className={cn('flex justify-end animate-rise-in', showAvatar ? 'pt-4' : 'pt-0.5')}>
        <div className="flex max-w-[85%] flex-col items-end sm:max-w-[75%]">
          <div className="rounded-2xl rounded-br-md border border-accent/15 bg-accent-light px-3 py-2">
            {attachments.length > 0 && (
              <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
                {attachments.map((attachment) =>
                  attachment.kind === 'image' && attachment.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={attachment.id}
                      src={attachment.dataUrl}
                      alt={attachment.name}
                      className="max-h-40 rounded-lg border border-border object-cover"
                    />
                  ) : attachment.kind === 'image' ? (
                    <span
                      key={attachment.id}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-muted"
                    >
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      Image
                    </span>
                  ) : (
                    <span
                      key={attachment.id}
                      className="flex max-w-[200px] items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-muted"
                    >
                      <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{attachment.name}</span>
                    </span>
                  )
                )}
              </div>
            )}
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
              {message.content}
            </p>
          </div>
          {isLastInGroup && time && <span className="mt-0.5 mr-1 text-[10px] tabular-nums text-muted">{time}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-2.5 animate-rise-in', showAvatar ? 'pt-4' : 'pt-0.5')}>
      <div className="shrink-0 pt-0.5">
        {showAvatar ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/20 bg-accent-light">
            <Bot className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          </div>
        ) : (
          <div className="h-7 w-7" />
        )}
      </div>
      <div className="group/bubble min-w-0 flex-1">
        {message.reasoning && <ChatReasoningBlock text={message.reasoning} streaming={isStreaming} />}

        {toolCalls.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {toolCalls.map((call) => (
              <ChatToolCallCard key={call.id} call={call} />
            ))}
          </div>
        )}

        {message.content ? (
          <MarkdownContent content={message.content} />
        ) : (
          isStreaming &&
          toolCalls.length === 0 && (
            <div className="flex items-center gap-1.5 py-1" aria-label="Assistant is working">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent/50"
                  style={{ animationDelay: `${index * 0.15}s` }}
                />
              ))}
            </div>
          )
        )}

        {message.error && (
          <div className="mt-1 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-light px-3 py-2 text-[12px] text-danger">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="break-words">{message.error}</span>
          </div>
        )}

        {isLastInGroup && (
          <div className="mt-1 flex items-center gap-2">
            {time && <span className="text-[10px] tabular-nums text-muted">{time}</span>}
            {message.content && !isStreaming && (
              <button
                type="button"
                onClick={() => onCopy(message.id, message.content)}
                className={cn(
                  'focus-ring rounded p-1 transition-colors',
                  copiedId === message.id
                    ? 'text-accent'
                    : 'text-muted opacity-0 hover:text-foreground group-hover/bubble:opacity-100'
                )}
                aria-label="Copy answer"
                title="Copy answer"
              >
                {copiedId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** The conversation surface: header, transcript and composer. */
export default function ChatPanel({
  title,
  modelLabel,
  messages,
  status,
  error,
  agentMode,
  onToggleAgentMode,
  input,
  onInputChange,
  onSend,
  onStop,
  onNewChat,
  starters,
  onStarterClick,
  copiedId,
  onCopy,
  attachments,
  onAttachmentsChange,
  attachmentError,
  onAttachmentError,
  forcedTool,
  onForcedToolChange,
  onOpenHistory,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const streaming = status === 'streaming' || status === 'submitted'
  const lastMessageId = messages[messages.length - 1]?.id

  const groups = useMemo(() => {
    const result: { role: 'user' | 'assistant'; messages: ChatMessage[] }[] = []
    for (const message of messages) {
      const last = result[result.length - 1]
      if (last && last.role === message.role) last.messages.push(message)
      else result.push({ role: message.role, messages: [message] })
    }
    return result
  }, [messages])

  useEffect(() => {
    if (!nearBottomRef.current) return
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    let frame = 0
    const handleScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        const distance = container.scrollHeight - container.scrollTop - container.clientHeight
        nearBottomRef.current = distance < 120
        setShowScrollButton(distance > 320)
        frame = 0
      })
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    nearBottomRef.current = true
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [])

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground xl:hidden"
              aria-label="Show chat history"
              title="Show chat history"
            >
              <History className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">
              {title}
            </h1>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full transition-colors',
                  streaming ? 'animate-pulse-soft bg-warning' : agentMode ? 'bg-accent' : 'bg-success'
                )}
                aria-hidden="true"
              />
              <span className="shrink-0">
                {streaming ? 'Replying…' : agentMode ? 'Agent mode' : 'Ready'}
              </span>
              <span className="shrink-0" aria-hidden="true">
                ·
              </span>
              <span className="flex min-w-0 items-center gap-1">
                <Cpu className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{modelLabel}</span>
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="segmented" role="group" aria-label="Conversation mode">
            <button
              type="button"
              onClick={() => {
                if (agentMode) onToggleAgentMode()
              }}
              aria-pressed={!agentMode}
              className="segmented-item"
              title="Chat mode"
            >
              <MessageSquare className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">Chat</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!agentMode) onToggleAgentMode()
              }}
              aria-pressed={agentMode}
              className="segmented-item"
              title="Agent mode plans, delegates to sub-agents and acts autonomously"
            >
              <Brain className="h-3 w-3" aria-hidden="true" />
              <span className="hidden sm:inline">Agent</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onNewChat}
            className="focus-ring flex h-8 items-center gap-1 rounded-lg px-2 text-[11.5px] font-medium text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
            title="New chat"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-5 py-8 text-center">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent-light">
              {agentMode ? (
                <Brain className="h-7 w-7 text-accent" aria-hidden="true" />
              ) : (
                <Sparkles className="h-7 w-7 text-accent" aria-hidden="true" />
              )}
            </div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              {agentMode ? 'Autonomous agent' : 'How can I help?'}
            </h2>
            <p className="mx-auto mb-7 mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-muted">
              {agentMode
                ? 'I plan, delegate to sub-agents and act across your notes, folders, projects and tasks.'
                : 'Ask about your notes, folders, projects or tasks — I will look things up and take action for you.'}
            </p>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {starters.map((starter, index) => (
                <button
                  key={starter.text}
                  type="button"
                  onClick={() => onStarterClick(starter.text)}
                  className="focus-ring inline-flex animate-rise-in items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-foreground shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <span aria-hidden="true">{starter.emoji}</span>
                  <span>{starter.text}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-3 py-3">
            {groups.map((group, groupIndex) => (
              <div key={`${group.role}-${groupIndex}`}>
                {group.messages.map((message, messageIndex) => {
                  const isLastInGroup = messageIndex === group.messages.length - 1
                  const isLastOverall = groupIndex === groups.length - 1 && isLastInGroup
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isStreaming={
                        isLastOverall && streaming && message.role === 'assistant' && message.id === lastMessageId
                      }
                      isLastInGroup={isLastInGroup}
                      showAvatar={messageIndex === 0}
                      copiedId={copiedId}
                      onCopy={onCopy}
                    />
                  )
                })}
              </div>
            ))}

            {status === 'error' && error && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger-light px-3 py-2.5">
                <Bot className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                <div className="min-w-0 text-[12.5px] text-danger">
                  <p className="font-medium">Something went wrong — no answer was generated.</p>
                  <p className="mt-0.5 break-words text-[11.5px] opacity-80">{error}</p>
                </div>
              </div>
            )}

            {status === 'submitted' && (
              <div className="flex items-center gap-2 pt-4 text-[11.5px] text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Working…
              </div>
            )}

            <div ref={endRef} className="h-1" />
          </div>
        )}
      </div>

      <div className="shrink-0 px-2.5 pb-2.5 pt-1.5">
        <div className="mx-auto w-full max-w-3xl">
          {messages.length > 0 && !input.trim() && !streaming && starters.length > 0 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 scroll-thin">
              {starters.slice(0, 4).map((starter) => (
                <button
                  key={starter.text}
                  type="button"
                  onClick={() => onStarterClick(starter.text)}
                  className="focus-ring inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-foreground"
                >
                  <span aria-hidden="true">{starter.emoji}</span>
                  <span>{starter.text.length > 30 ? `${starter.text.slice(0, 30)}…` : starter.text}</span>
                </button>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-[var(--border)] bg-surface-solid/70 shadow-sm transition-shadow focus-within:border-accent/40 focus-within:shadow-md">
            <ChatInput
              value={input}
              onChange={onInputChange}
              onSubmit={onSend}
              onStop={onStop}
              streaming={streaming}
              agentMode={agentMode}
              attachments={attachments}
              onAttachmentsChange={onAttachmentsChange}
              attachmentError={attachmentError}
              onAttachmentError={onAttachmentError}
              forcedTool={forcedTool}
              onForcedToolChange={onForcedToolChange}
            />
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted">
            MindViz {agentMode ? 'Agent' : 'Chat'} · Verify important information
          </p>
        </div>
      </div>

      {showScrollButton && messages.length > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="glass-popover focus-ring absolute bottom-24 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
          aria-label="Scroll to latest message"
          title="Scroll to latest message"
        >
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
