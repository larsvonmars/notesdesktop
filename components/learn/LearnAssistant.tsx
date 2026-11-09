'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  FileText,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { MarkdownContent, ThinkingSection, TypingDots } from '@/components/ai/AIMarkdown'
import BaseModal, { ModalBody, ModalHeader, ModalTitle } from '@/components/BaseModal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ToastProvider'
import { useAuth } from '@/lib/auth-context'
import type { AIMessage } from '@/lib/ai'
import { generateCardsFromDocument, runLearnAssistant, type LearnAIContext } from '@/lib/learn/ai'
import { createCards } from '@/lib/learn/cards'
import { createDeck } from '@/lib/learn/decks'
import { useLearning } from '@/lib/learn/context'
import { describeLearnError } from '@/lib/learn/db'
import {
  deleteDocument,
  getDocumentText,
  getDocumentUrl,
  getDocuments,
  updateDocument,
  uploadDocument,
} from '@/lib/learn/documents'
import type { LearnDocument } from '@/lib/learn/types'
import { cn, formatRelativeDate } from '@/lib/learn/utils'

interface ChatTool {
  id: string
  name: string
  status: 'running' | 'done'
}

interface ChatEntry {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  tools?: ChatTool[]
  pending?: boolean
}

const TOOL_LABELS: Record<string, string> = {
  list_decks: 'Listing decks',
  get_cards: 'Reading cards',
  create_deck: 'Creating deck',
  add_cards: 'Adding cards',
  update_card: 'Updating card',
  update_deck: 'Updating deck',
  delete_card: 'Deleting card',
  delete_deck: 'Deleting deck',
  get_stats: 'Reading stats',
  get_daily_progress: 'Reading daily progress',
  get_study_history: 'Reading session history',
  search_cards: 'Searching cards',
  generate_cards_parallel: 'Generating cards',
  analyze_deck_quality: 'Analyzing deck quality',
  list_documents: 'Listing documents',
  create_deck_from_document: 'Building deck from PDF',
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
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
              : 'border-accent/25 bg-accent-light text-accent',
          )}
        >
          {tool.status === 'done' ? <CheckCircle2 size={10} /> : <Loader2 size={10} className="animate-spin" />}
          {formatToolName(tool.name)}
        </span>
      ))}
    </div>
  )
}

function safeParseEntries(raw: string | null): ChatEntry[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const entries: ChatEntry[] = []
    for (const item of parsed) {
      const entry = item as Partial<ChatEntry>
      if (entry.role !== 'user' && entry.role !== 'assistant') continue
      if (typeof entry.content !== 'string') continue
      entries.push({
        id: typeof entry.id === 'string' ? entry.id : makeId(),
        role: entry.role,
        content: entry.content,
        reasoning: typeof entry.reasoning === 'string' ? entry.reasoning : undefined,
        tools: Array.isArray(entry.tools) ? (entry.tools as ChatTool[]) : [],
      })
    }
    return entries
  } catch {
    return []
  }
}

export function LearnAssistant({ initialPrompt }: { initialPrompt?: string | null }) {
  const { user } = useAuth()
  const { stats, decks, currentCard, triggerAiRefresh, refreshDecks } = useLearning()
  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [documents, setDocuments] = useState<LearnDocument[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [documentProgress, setDocumentProgress] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')
  const [showDocuments, setShowDocuments] = useState(false)
  const [selectedDeckId, setSelectedDeckId] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadedRef = useRef(false)
  const promptSentRef = useRef(false)
  const [hydrated, setHydrated] = useState(false)

  const storageKey = user?.id ? `mindviz-learn-chat:${user.id}` : null
  const selectedDeck = useMemo(() => decks.find((deck) => deck.id === selectedDeckId), [decks, selectedDeckId])

  useEffect(() => {
    if (!storageKey || loadedRef.current) return
    loadedRef.current = true
    try {
      setEntries(safeParseEntries(window.localStorage.getItem(storageKey)))
    } catch {
      // Ignore storage failures (private mode / locked-down WebView).
    } finally {
      setHydrated(true)
    }
  }, [storageKey])

  useEffect(() => {
    if (!storageKey || !loadedRef.current || !hydrated) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(entries.filter((entry) => !entry.pending)))
    } catch {
      // Ignore quota errors.
    }
  }, [entries, hydrated, storageKey])

  const loadDocuments = useCallback(async () => {
    setDocumentsLoading(true)
    try {
      setDocuments(await getDocuments())
    } catch (error) {
      console.warn('Failed to load Learn documents:', error)
    } finally {
      setDocumentsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`
  }, [input])

  const context = useMemo<LearnAIContext>(
    () => ({
      currentDeckId: selectedDeck?.id,
      currentDeckName: selectedDeck?.title,
      currentCard: currentCard ? { id: currentCard.id, front: currentCard.front, back: currentCard.back } : null,
      stats: stats
        ? {
            level: stats.level,
            xp: stats.xp,
            xpToNextLevel: stats.xpToNextLevel,
            streak: stats.streak,
            totalCardsReviewed: stats.totalCardsReviewed,
            totalDecks: stats.totalDecks,
            dailyGoal: stats.dailyGoal,
            badgeNames: stats.badges.filter((badge) => badge.earnedAt).map((badge) => badge.name),
          }
        : null,
    }),
    [currentCard, selectedDeck, stats],
  )

  function buildHistory(): AIMessage[] {
    return entries
      .filter((entry) => !entry.pending && entry.content.trim())
      .map((entry) =>
        entry.role === 'assistant'
          ? { role: 'assistant' as const, content: entry.content, reasoning_content: entry.reasoning }
          : { role: 'user' as const, content: entry.content },
      )
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return

    const history = buildHistory()
    const assistantId = makeId()
    setEntries((previous) => [
      ...previous,
      { id: makeId(), role: 'user', content: trimmed },
      { id: assistantId, role: 'assistant', content: '', pending: true, tools: [] },
    ])
    setInput('')
    setBusy(true)

    let sawToolCall = false

    try {
      const response = await runLearnAssistant({
        history,
        message: trimmed,
        context,
        timezoneOffset: new Date().getTimezoneOffset(),
        callbacks: {
          onToken: (token) => {
            setEntries((previous) =>
              previous.map((entry) =>
                entry.id === assistantId ? { ...entry, content: `${entry.content}${token}` } : entry,
              ),
            )
          },
          onReasoning: (token) => {
            setEntries((previous) =>
              previous.map((entry) =>
                entry.id === assistantId
                  ? { ...entry, reasoning: `${entry.reasoning ?? ''}${token}` }
                  : entry,
              ),
            )
          },
          onToolCall: (call) => {
            sawToolCall = true
            setEntries((previous) =>
              previous.map((entry) =>
                entry.id === assistantId
                  ? {
                      ...entry,
                      tools: [...(entry.tools ?? []), { id: call.id, name: call.name, status: 'running' }],
                    }
                  : entry,
              ),
            )
          },
          onToolResult: (result) => {
            setEntries((previous) =>
              previous.map((entry) =>
                entry.id === assistantId
                  ? {
                      ...entry,
                      tools: (entry.tools ?? []).map((tool) =>
                        tool.id === result.id ? { ...tool, status: 'done' } : tool,
                      ),
                    }
                  : entry,
              ),
            )
          },
        },
      })

      setEntries((previous) =>
        previous.map((entry) =>
          entry.id === assistantId ? { ...entry, content: entry.content || response, pending: false } : entry,
        ),
      )
      if (sawToolCall) {
        triggerAiRefresh()
        void refreshDecks()
        void loadDocuments()
      }
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
            : entry,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!hydrated || !initialPrompt || promptSentRef.current) return
    promptSentRef.current = true
    void sendMessage(initialPrompt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, initialPrompt])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void sendMessage(input)
  }

  function handleClear() {
    setEntries([])
    if (storageKey) {
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        // ignore
      }
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const document = await uploadDocument(file)
      await loadDocuments()
      toastRef.current.push({
        title: 'PDF uploaded',
        description: 'Ask the assistant to create a deck, or use “Create deck with AI”.',
        variant: 'success',
      })
      void sendMessage(
        `I uploaded a PDF called "${document.filename}" (id: ${document.id}). ${selectedDeck ? `Create flashcards from it and add them to the deck "${selectedDeck.title}" (id: ${selectedDeck.id}).` : 'Create a deck from this document.'}`,
      )
    } catch (error) {
      toastRef.current.push({ title: 'Upload failed', description: describeLearnError(error), variant: 'error' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleCreateDeckFromDocument(document: LearnDocument) {
    if (documentProgress) return
    setDocumentProgress(`Extracting text from ${document.filename}…`)
    try {
      const extracted = await getDocumentText(document.id)
      setDocumentProgress(`Generating cards from ${document.filename}…`)
      const cards = await generateCardsFromDocument(extracted.text, {
        deckTitle: document.filename.replace(/\.pdf$/i, ''),
        maxCards: 30,
        onProgress: setDocumentProgress,
      })
      const deckTitle = document.filename.replace(/\.pdf$/i, '') || 'Document deck'
      const deck = await createDeck({
        title: deckTitle,
        description: `Generated from ${document.filename} (${extracted.numPages} pages)`,
      })
      await createCards(deck.id, cards)
      await updateDocument(document.id, { status: 'processed', deckId: deck.id })
      await Promise.all([loadDocuments(), refreshDecks()])
      triggerAiRefresh()
      toastRef.current.push({
        title: `Deck created with ${cards.length} cards`,
        description: deckTitle,
        variant: 'success',
      })
      void sendMessage(
        `I created the deck "${deckTitle}" (id: ${deck.id}) with ${cards.length} cards from "${document.filename}". Suggest how I should study it.`,
      )
    } catch (error) {
      toastRef.current.push({ title: 'Could not create deck', description: describeLearnError(error), variant: 'error' })
    } finally {
      setDocumentProgress(null)
    }
  }

  async function handleDeleteDocument(document: LearnDocument) {
    try {
      await deleteDocument(document.id)
      await loadDocuments()
      toastRef.current.push({ title: 'Document deleted', description: document.filename, variant: 'success' })
    } catch (error) {
      toastRef.current.push({ title: 'Could not delete document', description: describeLearnError(error), variant: 'error' })
    }
  }

  async function handlePreview(document: LearnDocument) {
    try {
      const url = await getDocumentUrl(document.filePath)
      if (!url) throw new Error('Could not sign the document URL.')
      setPreviewName(document.filename)
      setPreviewUrl(url)
    } catch (error) {
      toastRef.current.push({ title: 'Could not open PDF', description: describeLearnError(error), variant: 'error' })
    }
  }

  const starterPrompts = useMemo(() => {
    const prompts: string[] = []
    if (selectedDeck) {
      prompts.push(`Analyze the quality of the deck "${selectedDeck.title}"`)
      prompts.push(`Suggest 5 more cards for "${selectedDeck.title}"`)
    } else if (decks[0]) {
      prompts.push(`Analyze the quality of the deck "${decks[0].title}"`)
    } else {
      prompts.push('Create a deck about the basics of machine learning with 10 cards')
    }
    prompts.push('How am I doing? Review my stats and suggest a study plan')
    prompts.push('Generate 10 flashcards about the history of the Roman Empire')
    return prompts.slice(0, 5)
  }, [decks, selectedDeck])

  const documentsPanel = (
    <div className="glass-card flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-accent-light text-accent">
            <FileText size={13} />
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">PDF documents</p>
        </div>
        <button
          type="button"
          onClick={() => setShowDocuments(false)}
          className="rounded-lg p-1.5 text-muted hover:bg-surface-hover lg:hidden"
          aria-label="Close documents"
        >
          <X size={14} />
        </button>
      </div>

      <div className="border-b border-border p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => void handleUpload(event)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={Paperclip}
          loading={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full"
        >
          Upload PDF
        </Button>
        {documentProgress && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-accent-light px-2 py-1.5 text-[10px] font-medium text-accent">
            <Loader2 size={10} className="animate-spin" />
            <span className="line-clamp-2">{documentProgress}</span>
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-2">
        {documentsLoading ? (
          <p className="flex items-center justify-center gap-2 px-2 py-8 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" /> Loading…
          </p>
        ) : documents.length === 0 ? (
          <p className="px-2 py-8 text-center text-[11px] leading-5 text-muted">
            Upload a text-based PDF to generate flashcards with AI.
          </p>
        ) : (
          <ul className="space-y-2">
            {documents.map((document) => (
              <li key={document.id} className="rounded-xl border border-border bg-surface p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-foreground">{document.filename}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {(document.fileSize / 1024).toFixed(0)} KB · {document.status} · {formatRelativeDate(document.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteDocument(document)}
                    className="rounded p-1 text-muted hover:bg-danger-light hover:text-danger"
                    aria-label={`Delete ${document.filename}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleCreateDeckFromDocument(document)}
                    disabled={documentProgress !== null}
                    className="rounded-full border border-accent/25 bg-accent-light px-2 py-0.5 text-[10px] font-semibold text-accent disabled:opacity-50"
                  >
                    Create deck with AI
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePreview(document)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted hover:text-foreground"
                  >
                    Preview
                    <ArrowUpRight size={9} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-[calc(100dvh-var(--topbar-height,56px)-var(--mobile-bar-height,60px)-1.5rem)] flex-col gap-4 md:h-[calc(100dvh-var(--topbar-height,56px)-3rem)] lg:flex-row">
      <div className="glass-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-gradient text-accent-foreground shadow-glow-sm">
              <Bot size={16} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">AI study assistant</p>
              <p className="truncate text-[11px] text-muted">Decks, cards, stats and PDF imports</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {decks.length > 0 && (
              <select
                value={selectedDeckId}
                onChange={(event) => setSelectedDeckId(event.target.value)}
                className="glass-input h-8 max-w-[150px] px-2 text-[11px]"
                aria-label="Context deck"
              >
                <option value="">No deck context</option>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.title}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setShowDocuments(true)}
              className="rounded-lg p-1.5 text-muted hover:bg-surface-hover hover:text-foreground lg:hidden"
              aria-label="Open documents"
            >
              <FileText size={15} />
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={entries.length === 0 || busy}
              className="rounded-lg p-1.5 text-muted hover:bg-danger-light hover:text-danger disabled:opacity-40"
              aria-label="Clear conversation"
              title="Clear conversation"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scroll-thin p-4">
          {entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-2 text-center animate-rise-in">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-gradient text-accent-foreground shadow-lg shadow-glow-sm">
                <Sparkles size={26} />
              </div>
              <h2 className="mt-4 font-display text-lg font-semibold text-foreground">How can I help you learn?</h2>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Ask about your decks, generate flashcards, analyze quality, or import a PDF.
              </p>
              <div className="mt-5 grid w-full max-w-md gap-2">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="glass-row rounded-xl px-3 py-2.5 text-left text-xs font-medium text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className={cn('flex gap-2.5', entry.role === 'user' ? 'justify-end' : 'justify-start')}>
                {entry.role === 'assistant' && (
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                    <Bot size={14} />
                  </span>
                )}
                <div
                  className={cn(
                    'max-w-[88%] rounded-2xl border px-3.5 py-2.5',
                    entry.role === 'user'
                      ? 'rounded-br-md border-accent/25 bg-accent-light text-foreground'
                      : 'rounded-bl-md border-border bg-surface',
                  )}
                >
                  {entry.role === 'assistant' ? (
                    <>
                      {entry.tools && <ToolPills tools={entry.tools} />}
                      {entry.reasoning && <ThinkingSection reasoning={entry.reasoning} />}
                      {entry.content ? <MarkdownContent content={entry.content} /> : entry.pending ? <TypingDots /> : null}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{entry.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={handleSubmit} className="shrink-0 border-t border-border p-3">
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
                if (event.key === 'Escape') setInput('')
              }}
              rows={1}
              placeholder={busy ? 'Assistant is working…' : 'Ask about decks, cards, stats or a topic…'}
              className="glass-input max-h-[140px] min-h-[44px] w-full resize-none px-3.5 py-3 text-sm leading-5"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="glass-btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-accent-foreground disabled:opacity-40"
              aria-label="Send message"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted">
            <kbd className="kbd text-[9px]">Enter</kbd> send · <kbd className="kbd text-[9px]">Shift</kbd>+
            <kbd className="kbd text-[9px]">Enter</kbd> newline
          </p>
        </form>
      </div>

      {showDocuments ? (
        <div
          className="fixed inset-0 z-50 bg-black/30 p-4 backdrop-blur-sm lg:hidden"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowDocuments(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setShowDocuments(false)
          }}
          role="button"
          aria-label="Close overlay"
          tabIndex={-1}
        >
          <div className="mx-auto h-full max-w-sm">
            {documentsPanel}
          </div>
        </div>
      ) : (
        <div className="hidden w-[280px] shrink-0 lg:block">{documentsPanel}</div>
      )}

      <BaseModal
        isOpen={previewUrl !== null}
        onClose={() => setPreviewUrl(null)}
        size="5xl"
        maxHeight="90vh"
        className="h-[88vh]"
        animation="zoom"
        ariaLabel="PDF preview"
      >
        <ModalHeader onClose={() => setPreviewUrl(null)} closeAriaLabel="Close PDF preview">
          <ModalTitle className="truncate">{previewName || 'PDF document'}</ModalTitle>
        </ModalHeader>
        <ModalBody className="h-full p-0">
          {previewUrl && (
            <div className="flex h-full flex-col">
              <div className="flex justify-end border-b border-border px-3 py-2">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:opacity-80"
                >
                  Open in new window
                  <ArrowUpRight size={12} />
                </a>
              </div>
              <iframe title={previewName} src={previewUrl} className="min-h-0 flex-1 bg-white" />
            </div>
          )}
        </ModalBody>
      </BaseModal>
    </div>
  )
}
