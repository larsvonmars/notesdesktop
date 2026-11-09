'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useIsMobile } from '@/lib/useIsMobile'
import { AI_MODEL_LABEL } from '@/lib/ai-model'
import { cn } from '@/components/shell/utils'
import { runChatTurn } from '@/lib/chat/engine'
import { validateForcedTool } from '@/lib/chat/tool-menu'
import { AGENT_STARTERS, CHAT_STARTERS } from '@/lib/chat/prompts'
import {
  createConversation,
  deleteConversation,
  generateConversationTitle,
  listConversations,
  loadConversationMessages,
  renameConversation,
  saveMessage,
} from '@/lib/chat/conversations'
import ChatConversationList from './ChatConversationList'
import ChatPanel from './ChatPanel'
import type { ChatAttachment, ChatConversationSummary, ChatMessage, ChatStatus } from '@/lib/chat/types'

const STORAGE_PREFIX = 'mindviz-notes-chat-'
const MAX_CACHED_MESSAGES = 50
const DEFAULT_TITLE = 'New conversation'

function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Content stored in Supabase — attachments become compact labels. */
function persistedContent(message: ChatMessage): string {
  const attachments = message.attachments ?? []
  const labels = attachments
    .map((attachment) =>
      attachment.kind === 'image'
        ? '[📎 image]'
        : `[📎 document: ${attachment.name}]`
    )
    .join('\n')
  return [message.content, labels].filter((part) => part.trim()).join('\n\n')
}

/** Cache-safe copy: base64 image payloads would blow the quota. */
function cacheableMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_CACHED_MESSAGES).map((message) => ({
    ...message,
    attachments: message.attachments?.map((attachment) => ({
      ...attachment,
      dataUrl: undefined,
    })),
  }))
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && /abort/i.test(error.message))
  )
}

/** Full-page AI chat: conversation history, streaming answers, tools and agent mode. */
export default function ChatView() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const userId = user?.id ?? null

  const [conversations, setConversations] = useState<ChatConversationSummary[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(true)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('ready')
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [agentMode, setAgentMode] = useState(false)
  const [forcedTool, setForcedTool] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [restored, setRestored] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const storageKey = userId ? `${STORAGE_PREFIX}${userId}` : null

  const starters = agentMode ? AGENT_STARTERS : CHAT_STARTERS
  const currentConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === currentConversationId) ?? null,
    [conversations, currentConversationId]
  )
  const title = currentConversation?.title || DEFAULT_TITLE

  const refreshConversations = useCallback(async () => {
    if (!userId) return
    try {
      const next = await listConversations()
      setConversations(next)
    } catch (refreshError) {
      console.error('Could not load conversations:', refreshError)
    } finally {
      setConversationsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refreshConversations()
  }, [refreshConversations])

  // Restore the last unsaved transcript so a reload never loses context.
  useEffect(() => {
    if (restored || !storageKey) return
    setRestored(true)
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMessages(parsed as ChatMessage[])
      }
    } catch {
      // Corrupted cache — start fresh.
    }
  }, [restored, storageKey])

  // Persist the transcript (debounced) so partial answers survive a reload.
  useEffect(() => {
    if (!storageKey || messages.length === 0) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(cacheableMessages(messages)))
      } catch {
        // Quota exceeded — the Supabase copy is the source of truth.
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [messages, storageKey])

  useEffect(() => () => abortRef.current?.abort(), [])

  const clearLocalCache = useCallback(() => {
    if (!storageKey) return
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }, [storageKey])

  const resetConversation = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setCurrentConversationId(null)
    setStatus('ready')
    setError(null)
    setInput('')
    setAttachments([])
    setAttachmentError(null)
    setForcedTool(null)
    clearLocalCache()
  }, [clearLocalCache])

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (id === currentConversationId) {
        setHistoryOpen(false)
        return
      }
      abortRef.current?.abort()
      setHistoryOpen(false)
      setCurrentConversationId(id)
      setStatus('ready')
      setError(null)
      try {
        const stored = await loadConversationMessages(id)
        setMessages(stored)
      } catch (loadError) {
        console.error('Could not load conversation:', loadError)
        setMessages([])
        setError('This conversation could not be loaded.')
      }
    },
    [currentConversationId]
  )

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await deleteConversation(id)
      } catch (deleteError) {
        console.error('Could not delete conversation:', deleteError)
        return
      }
      if (id === currentConversationId) resetConversation()
      await refreshConversations()
    },
    [currentConversationId, refreshConversations, resetConversation]
  )

  const handleCopy = useCallback((id: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }, [])

  const handleStarterClick = useCallback((text: string) => {
    setInput(text)
  }, [])

  const handleSend = useCallback(async () => {
    if (!userId) {
      setAttachmentError('Your account is still loading. Please try again in a moment.')
      return
    }
    const text = input.trim()
    if ((!text && attachments.length === 0) || status === 'streaming' || status === 'submitted') return

    setAttachmentError(null)
    setError(null)
    setForcedTool(validateForcedTool(forcedTool))

    const userMessage: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: new Date().toISOString(),
    }
    const history = messages
    const assistantId = createMessageId('assistant')

    setInput('')
    setAttachments([])
    setStatus('submitted')
    setMessages([
      ...history,
      userMessage,
      { id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString() },
    ])

    // Resolve the conversation before streaming so failures never leave an
    // orphaned chat behind.
    let conversationId = currentConversationId
    let createdNow = false
    if (!conversationId) {
      const seedTitle =
        text.slice(0, 60) ||
        (attachments.some((attachment) => attachment.kind === 'document')
          ? 'Document chat'
          : 'Image chat')
      const conversation = await createConversation(userId, seedTitle)
      if (!conversation) {
        setMessages((previous) => previous.filter((message) => message.id !== assistantId))
        setStatus('error')
        setError('Could not start a conversation. Check your connection and try again.')
        return
      }
      conversationId = conversation.id
      createdNow = true
      setCurrentConversationId(conversation.id)
    }

    await saveMessage(conversationId, 'user', persistedContent(userMessage))

    const controller = new AbortController()
    abortRef.current = controller

    const patchAssistant = (updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((previous) =>
        previous.map((message) => (message.id === assistantId ? updater(message) : message))
      )
    }

    try {
      const result = await runChatTurn({
        messages: [...history, userMessage],
        userId,
        agentMode,
        forcedTool,
        signal: controller.signal,
        callbacks: {
          onText: (delta) => {
            setStatus('streaming')
            patchAssistant((message) => ({ ...message, content: message.content + delta }))
          },
          onReasoning: (delta) => {
            setStatus('streaming')
            patchAssistant((message) => ({ ...message, reasoning: `${message.reasoning ?? ''}${delta}` }))
          },
          onToolStart: (call) => {
            setStatus('streaming')
            patchAssistant((message) => ({
              ...message,
              toolCalls: [
                ...(message.toolCalls ?? []),
                { id: call.id, name: call.name, arguments: call.arguments, status: 'running' },
              ],
            }))
          },
          onToolFinish: ({ id, result: output, error: toolError }) => {
            patchAssistant((message) => ({
              ...message,
              toolCalls: (message.toolCalls ?? []).map((call) =>
                call.id === id
                  ? { ...call, status: toolError ? 'error' : 'done', result: output, error: toolError }
                  : call
              ),
            }))
          },
        },
      })

      patchAssistant((message) => ({
        ...message,
        content: result.text,
        reasoning: result.reasoning || message.reasoning,
        toolCalls: result.toolCalls,
      }))

      if (result.text.trim()) {
        await saveMessage(conversationId, 'assistant', result.text)
      }

      setStatus('ready')
      await refreshConversations()

      if (createdNow && result.text.trim()) {
        const generated = await generateConversationTitle(text || persistedContent(userMessage))
        if (generated) {
          await renameConversation(conversationId, generated)
          await refreshConversations()
        }
      }
    } catch (turnError) {
      if (isAbortError(turnError)) {
        setStatus('ready')
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId && !message.content
              ? { ...message, content: '', reasoning: message.reasoning }
              : message
          )
        )
        return
      }

      const message = turnError instanceof Error ? turnError.message : String(turnError)
      patchAssistant((current) => ({ ...current, error: message }))
      setError(message)
      setStatus('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [
    agentMode,
    attachments,
    currentConversationId,
    forcedTool,
    input,
    messages,
    refreshConversations,
    status,
    userId,
  ])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('ready')
  }, [])

  const historyPane = (
    <ChatConversationList
      conversations={conversations}
      currentId={currentConversationId}
      loading={conversationsLoading}
      onSelect={handleSelectConversation}
      onNew={() => {
        resetConversation()
        setHistoryOpen(false)
      }}
      onDelete={handleDeleteConversation}
    />
  )

  return (
    <div className="flex h-full min-h-0 gap-2 p-2 sm:gap-3 sm:p-3">
      <aside className="glass-card hidden w-[248px] shrink-0 flex-col overflow-hidden md:flex">
        {historyPane}
      </aside>

      {isMobile && historyOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setHistoryOpen(false)}
            aria-hidden="true"
          />
          <div className="glass-strong relative z-10 flex h-full w-[280px] max-w-[85vw] flex-col overflow-hidden">
            <div className="flex items-center justify-end px-2 pt-2">
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="focus-ring rounded-lg p-1.5 text-muted hover:text-foreground"
                aria-label="Close conversations"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{historyPane}</div>
          </div>
        </div>
      )}

      <div className={cn('glass-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden')}>
        <ChatPanel
          title={title}
          modelLabel={AI_MODEL_LABEL}
          messages={messages}
          status={status}
          error={error}
          agentMode={agentMode}
          onToggleAgentMode={() => setAgentMode((previous) => !previous)}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onStop={handleStop}
          onNewChat={resetConversation}
          starters={starters}
          onStarterClick={handleStarterClick}
          copiedId={copiedId}
          onCopy={handleCopy}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          attachmentError={attachmentError}
          onAttachmentError={setAttachmentError}
          forcedTool={forcedTool}
          onForcedToolChange={setForcedTool}
          onOpenHistory={isMobile ? () => setHistoryOpen(true) : undefined}
        />
      </div>
    </div>
  )
}
