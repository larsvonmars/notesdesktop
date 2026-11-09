'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  MarkdownContent,
  ThinkingSection,
  TypingDots,
} from '@/components/ai/AIMarkdown'
import { useLearning } from '@/lib/learn/context'
import type { AIMessage } from '@/lib/ai'
import type { LearnAICallbacks } from '@/lib/learn/ai'
import type { Card, Deck, SessionResult } from '@/lib/learn/types'
import { cn } from '@/lib/learn/utils'
import { ActionButton } from './StudyLayout'

export type StudyChatMode = 'tutor' | 'ai-learn'

interface ChatTool {
  id: string
  name: string
  status: 'running' | 'done'
  result?: string
}

interface ChatEntry {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  tools?: ChatTool[]
  pending?: boolean
  hidden?: boolean
}

export interface StudyChatProps {
  deck: Deck
  cards: Card[]
  mode: StudyChatMode
  title: string
  subtitle: string
  icon: LucideIcon
  accent: 'indigo' | 'fuchsia'
  send: (input: {
    history: AIMessage[]
    message: string
    callbacks: LearnAICallbacks
  }) => Promise<string>
  onComplete: (result: SessionResult) => void
  onExit: () => void
}

const TOOL_LABELS: Record<string, string> = {
  lookup_card: 'Looking up card',
  mark_card_mastered: 'Marking card mastered',
  suggest_related_cards: 'Finding related cards',
  get_study_tip: 'Fetching a study tip',
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return crypto.randomUUID()
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatToolName(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ')
}

function ToolPills({ tools }: { tools: ChatTool[] }) {
  if (tools.length === 0) return null
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {tools.map((tool) => (
        <span
          key={tool.id}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium',
            tool.status === 'done'
              ? 'border-border bg-surface-hover text-muted'
              : 'border-accent/25 bg-accent-light text-accent'
          )}
        >
          {tool.status === 'done' ? (
            <CheckCircle2 size={10} />
          ) : (
            <Loader2 size={10} className="animate-spin" />
          )}
          {formatToolName(tool.name)}
        </span>
      ))}
    </div>
  )
}

export function StudyChat({
  deck,
  cards,
  mode,
  title,
  subtitle,
  icon: Icon,
  accent,
  send,
  onComplete,
  onExit,
}: StudyChatProps) {
  const { setCurrentCard, triggerAiRefresh } = useLearning()
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [summaryReady, setSummaryReady] = useState(false)
  const startedRef = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cardIndexRef = useRef(0)

  const cardContent = useMemo(
    () => cards.map((card) => `Q: ${card.front} → A: ${card.back}`),
    [cards]
  )
  const cardIds = useMemo(() => cards.map((card) => card.id), [cards])
  const visibleUserMessages = entries.filter(
    (entry) => entry.role === 'user' && !entry.hidden
  )
  const estimatedCardsCovered = Math.min(
    visibleUserMessages.length,
    cards.length
  )

  const accentClasses =
    accent === 'fuchsia'
      ? {
          icon: 'from-fuchsia-500 to-purple-600 shadow-fuchsia-500/20',
          soft: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
          bubble: 'border-fuchsia-500/20 bg-fuchsia-500/5',
        }
      : {
          icon: 'from-indigo-500 to-purple-600 shadow-indigo-500/20',
          soft: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
          bubble: 'border-indigo-500/20 bg-indigo-500/5',
        }

  useEffect(() => {
    if (cards[cardIndexRef.current]) setCurrentCard(cards[cardIndexRef.current])
    return () => setCurrentCard(null)
  }, [cards, setCurrentCard])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`
  }, [input])

  /** Convert visible chat entries into model history. */
  function buildHistory(): AIMessage[] {
    return entries
      .filter(
        (entry) => !entry.hidden && !entry.pending && entry.content.trim()
      )
      .map((entry) =>
        entry.role === 'assistant'
          ? {
              role: 'assistant' as const,
              content: entry.content,
              reasoning_content: entry.reasoning,
            }
          : { role: 'user' as const, content: entry.content }
      )
  }

  async function sendMessage(
    text: string,
    options?: { hidden?: boolean; endSession?: boolean }
  ) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    if (options?.endSession) setSessionEnded(true)

    const history = buildHistory()
    const assistantId = makeId()

    setEntries((previous) => [
      ...previous,
      ...(options?.hidden
        ? []
        : [{ id: makeId(), role: 'user' as const, content: trimmed }]),
      {
        id: assistantId,
        role: 'assistant' as const,
        content: '',
        pending: true,
        tools: [],
      },
    ])
    setInput('')
    setBusy(true)

    if (!options?.hidden && cardIndexRef.current < cards.length - 1) {
      cardIndexRef.current += 1
      setCurrentCard(cards[cardIndexRef.current])
    }

    let sawToolCall = false
    const callbacks: LearnAICallbacks = {
      onToken: (token) => {
        setEntries((previous) =>
          previous.map((entry) =>
            entry.id === assistantId
              ? { ...entry, content: `${entry.content}${token}` }
              : entry
          )
        )
      },
      onReasoning: (token) => {
        setEntries((previous) =>
          previous.map((entry) =>
            entry.id === assistantId
              ? { ...entry, reasoning: `${entry.reasoning ?? ''}${token}` }
              : entry
          )
        )
      },
      onToolCall: (call) => {
        sawToolCall = true
        setEntries((previous) =>
          previous.map((entry) =>
            entry.id === assistantId
              ? {
                  ...entry,
                  tools: [
                    ...(entry.tools ?? []),
                    { id: call.id, name: call.name, status: 'running' },
                  ],
                }
              : entry
          )
        )
      },
      onToolResult: (result) => {
        setEntries((previous) =>
          previous.map((entry) =>
            entry.id === assistantId
              ? {
                  ...entry,
                  tools: (entry.tools ?? []).map((tool) =>
                    tool.id === result.id
                      ? { ...tool, status: 'done', result: result.result }
                      : tool
                  ),
                }
              : entry
          )
        )
      },
    }

    try {
      const response = await send({ history, message: trimmed, callbacks })
      setEntries((previous) =>
        previous.map((entry) =>
          entry.id === assistantId
            ? { ...entry, content: entry.content || response, pending: false }
            : entry
        )
      )
      if (sawToolCall) triggerAiRefresh()
    } catch (error) {
      setEntries((previous) =>
        previous.map((entry) =>
          entry.id === assistantId
            ? {
                ...entry,
                pending: false,
                content:
                  error instanceof Error
                    ? `I couldn't complete that request: ${error.message}`
                    : "I couldn't complete that request. Please try again.",
              }
            : entry
        )
      )
    } finally {
      setBusy(false)
      if (options?.endSession) setSummaryReady(true)
    }
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void sendMessage(
      '(Begin tutoring session — introduce yourself and ask the first question)',
      {
        hidden: true,
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void sendMessage(input)
  }

  function handleEndSession() {
    if (sessionEnded || busy) return
    void sendMessage(
      'Please summarize our tutoring session. Tell me what I did well and what I should review later.',
      { endSession: true }
    )
  }

  function handleFinish() {
    onComplete({
      cardsReviewed: cards.length,
      correct: Math.min(cards.length, Math.max(1, visibleUserMessages.length)),
      perfect: false,
      mode,
    })
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--topbar-height,56px)-var(--mobile-bar-height,60px)-1.5rem)] max-w-2xl flex-col md:h-[calc(100dvh-var(--topbar-height,56px)-3rem)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
                accentClasses.icon
              )}
            >
              <Icon size={16} />
            </div>
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-solid)]',
                busy ? 'animate-pulse bg-warning' : 'bg-success'
              )}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {title}
            </p>
            <p className="truncate text-[11px] text-muted">
              {deck.title} · {cards.length} cards · {subtitle}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {cards.length > 0 && (
            <span className="hidden rounded-full bg-surface-hover px-2 py-1 text-[10px] font-semibold tabular-nums text-muted sm:inline-flex">
              ~{estimatedCardsCovered}/{cards.length} covered
            </span>
          )}
          <button
            type="button"
            onClick={onExit}
            className="focus-ring rounded-xl p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="Exit AI session"
            title="Exit (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scroll-thin py-4 pr-1">
        {entries.length === 0 && (
          <div className="flex h-full items-center justify-center px-4">
            <div className="max-w-sm text-center animate-rise-in">
              <div
                className={cn(
                  'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg',
                  accentClasses.icon
                )}
              >
                <Sparkles size={28} />
              </div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Preparing your session on{' '}
                <span className="font-semibold text-foreground">
                  {deck.title}
                </span>
                …
              </p>
            </div>
          </div>
        )}

        {entries
          .filter((entry) => !entry.hidden)
          .map((entry) => (
            <div
              key={entry.id}
              className={cn(
                'flex gap-2.5',
                entry.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {entry.role === 'assistant' && (
                <span
                  className={cn(
                    'mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    accentClasses.soft
                  )}
                >
                  <Bot size={14} />
                </span>
              )}
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl border px-3.5 py-2.5',
                  entry.role === 'user'
                    ? 'rounded-br-md border-accent/25 bg-accent-light text-foreground'
                    : cn(
                        'rounded-bl-md bg-surface',
                        entry.pending ? accentClasses.bubble : 'border-border'
                      )
                )}
              >
                {entry.role === 'assistant' ? (
                  <>
                    {entry.tools && <ToolPills tools={entry.tools} />}
                    {entry.reasoning && (
                      <ThinkingSection reasoning={entry.reasoning} />
                    )}
                    {entry.content ? (
                      <MarkdownContent content={entry.content} />
                    ) : entry.pending ? (
                      <TypingDots />
                    ) : null}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                    {entry.content}
                  </p>
                )}
              </div>
            </div>
          ))}

        {summaryReady && !busy && (
          <div className="animate-rise-in rounded-2xl border border-accent/20 bg-accent-light/50 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-glow-sm">
                <CheckCircle2 size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Session complete!
                </p>
                <p className="text-xs text-muted">
                  {visibleUserMessages.length} exchange
                  {visibleUserMessages.length === 1 ? '' : 's'} · Great work
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <ActionButton
                variant="primary"
                onClick={handleFinish}
                className="flex-1"
              >
                Finish & earn XP
                <ArrowRight size={14} />
              </ActionButton>
              <ActionButton variant="secondary" onClick={onExit}>
                Exit
              </ActionButton>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-border pt-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendMessage(input)
              }
              if (event.key === 'Escape') onExit()
            }}
            rows={1}
            placeholder={busy ? 'Tutor is responding…' : 'Type your answer…'}
            disabled={sessionEnded}
            className="glass-input max-h-[120px] min-h-[44px] w-full resize-none px-3.5 py-3 text-sm leading-5 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy || sessionEnded}
            className="glass-btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-accent-foreground disabled:opacity-40"
            aria-label="Send message"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted">
            <kbd className="kbd text-[9px]">Enter</kbd> send ·{' '}
            <kbd className="kbd text-[9px]">Shift</kbd>+
            <kbd className="kbd text-[9px]">Enter</kbd> newline
          </p>
          <button
            type="button"
            onClick={handleEndSession}
            disabled={busy || sessionEnded}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold text-muted transition-colors hover:border-accent/30 hover:text-foreground disabled:opacity-40"
          >
            <MessageCircle size={10} />
            End session
          </button>
        </div>
      </form>
    </div>
  )
}
