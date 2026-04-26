'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  Send,
  Sparkles,
  User,
  Loader2,
  Copy,
  Check,
  Trash2,
  FileText,
  CheckSquare,
  Calendar,
  Network,
  Lightbulb,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  Plus,
  Wand2,
  History,
  MessageSquare,
  ChevronLeft,
  PenLine,
  HelpCircle,
  Languages,
  Type,
  ArrowRight,
  MousePointerClick,
  Zap,
  AlertCircle,
  Cpu,
  BookOpen,
  Search,
  Maximize2,
  Minimize2,
  CornerDownLeft,
  StopCircle,
  Settings2,
} from 'lucide-react'
import {
  chat,
  summarizeNote,
  editText,
  suggestMindmapNodes,
  suggestTasks,
  suggestEvents,
  hasAIApiKey,
  getAIApiKeyStatus,
  cancelActiveAIRequest,
  isAIAbortError,
  AIError,
  getAIRateLimitStatus,
  stripHtmlForAI,
  textToHtml,
  type AIMessage,
  type AIContext,
  type DeepSeekModel,
  type NoteSummary,
  type MindmapSuggestion,
  type TaskSuggestion,
  type CalendarSuggestion,
  type ToolCallHandler,
} from '@/lib/ai'
import type { NoteType } from '@/lib/notes'
import {
  getAIChatsByNote,
  getAIChats,
  createAIChat,
  updateAIChat,
  deleteAIChat,
  generateChatTitle,
  type AIChat,
  type AIMessage as DBMessage,
} from '@/lib/ai-chats'
import type { Note } from './NoteEditor'
import type { Task, TaskStats } from '@/lib/tasks'
import type { CalendarEvent } from '@/lib/events'
import type { MindmapData, MindmapNode } from './MindmapEditor'

// ============================================================================
// CONSTANTS
// ============================================================================

const TEXT_TRUNCATION_SHORT = 50
const TEXT_TRUNCATION_MEDIUM = 60
const CONTEXT_LENGTH_LIMIT = 1000
const AI_NOTE_CONTEXT_CONSENT_KEY = 'ai-note-context-consent-v1'
const AI_NOTE_CONTEXT_LIMITS = {
  maxCharsPerNote: 32000,
  maxTotalInjectedChars: 320000,
  maxSelectedNotes: 12,
  readNoteToolChars: 32000,
  searchExcerptChars: 900,
  searchMaxResultsDefault: 8,
  searchMaxResultsHard: 15,
} as const

function isReasonerToolCallingEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_DEEPSEEK_REASONER_TOOLS || '').trim().toLowerCase() === 'true'
}

function truncateAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const slice = text.slice(0, maxChars)
  const paragraphBoundary = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '))
  if (paragraphBoundary >= Math.floor(maxChars * 0.65)) {
    return slice.slice(0, paragraphBoundary + 1).trimEnd()
  }
  const wordBoundary = slice.lastIndexOf(' ')
  if (wordBoundary >= Math.floor(maxChars * 0.65)) {
    return slice.slice(0, wordBoundary).trimEnd()
  }
  return slice.trimEnd()
}

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
  reasoning?: string
}

interface AIAssistantProps {
  note?: Note | null
  noteContent?: string
  selectedText?: string
  allNotes?: Note[]
  mindmapData?: MindmapData | null
  selectedMindmapNodeId?: string | null
  tasks?: Task[]
  taskStats?: TaskStats | null
  events?: CalendarEvent[]
  onInsertText?: (text: string) => void
  onReplaceText?: (text: string) => void
  onReplaceSelection?: (text: string) => void
  onInsertAtCursor?: (text: string) => void
  onCreateTask?: (title: string, options?: { description?: string; priority?: string; dueDate?: Date }) => void
  onCreateEvent?: (title: string, startTime: Date, endTime: Date, options?: { description?: string }) => void
  onAddMindmapNode?: (text: string, description?: string) => void
  onCreateMindmapNote?: (input: {
    sourceText: string
    sourceTitle?: string
    sourceType: 'selection' | 'current-note'
    targetTitle?: string
    additionalPrompt?: string
  }) => Promise<void> | void
  onUpdateMindmapNode?: (nodeId: string, text: string, description?: string) => void
  onClose?: () => void
  onToggleSize?: () => void
  isLargeWindow?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
}

type QuickAction =
  | 'summarize'
  | 'improve-writing'
  | 'fix-grammar'
  | 'make-concise'
  | 'expand'
  | 'suggest-tasks'
  | 'suggest-events'
  | 'mindmap-ideas'
  | 'create-mindmap-note'
  | 'continue-writing'
  | 'explain-selection'
  | 'improve-selection'
  | 'translate-selection'
  | 'simplify-selection'

interface ParsedAIResponse {
  type: 'structured' | 'text'
  summary?: string
  keyPoints?: string[]
  suggestedTasks?: string[]
  rawText?: string
}

function parseAIResponse(content: string): ParsedAIResponse {
  const extractBalancedJSON = (str: string, startIdx: number): string | null => {
    if (str[startIdx] !== '{') return null
    let braceCount = 0
    let inString = false
    let escape = false
    for (let i = startIdx; i < str.length; i++) {
      const char = str[i]
      if (escape) { escape = false; continue }
      if (char === '\\' && inString) { escape = true; continue }
      if (char === '"' && !escape) { inString = !inString; continue }
      if (!inString) {
        if (char === '{') braceCount++
        else if (char === '}') {
          braceCount--
          if (braceCount === 0) return str.substring(startIdx, i + 1)
        }
      }
    }
    return null
  }

  const codeBlockMatch = content.match(/```(?:json)?\s*/)
  if (codeBlockMatch) {
    const startOfJson = content.indexOf('{', codeBlockMatch.index)
    if (startOfJson !== -1) {
      const jsonStr = extractBalancedJSON(content, startOfJson)
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr)
          if (parsed.summary || parsed.keyPoints || parsed.suggestedTasks) {
            return { type: 'structured', summary: parsed.summary, keyPoints: parsed.keyPoints, suggestedTasks: parsed.suggestedTasks }
          }
        } catch { /* continue */ }
      }
    }
  }

  const firstBrace = content.indexOf('{')
  if (firstBrace !== -1) {
    const jsonStr = extractBalancedJSON(content, firstBrace)
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr)
        if (parsed.summary || parsed.keyPoints || parsed.suggestedTasks) {
          return { type: 'structured', summary: parsed.summary, keyPoints: parsed.keyPoints, suggestedTasks: parsed.suggestedTasks }
        }
      } catch { /* fall through */ }
    }
  }

  return { type: 'text', rawText: content }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

marked.setOptions({ gfm: true, breaks: true })

function renderMarkdown(content: string): string {
  try {
    return marked.parse(content, { async: false }) as string
  } catch {
    return content
  }
}

/** Theme-aware markdown renderer using CSS-variable utilities */
function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  const html = useMemo(() => {
    const raw = renderMarkdown(content)
    return typeof window !== 'undefined' ? DOMPurify.sanitize(raw) : raw
  }, [content])
  return (
    <div
      className={`text-[13px] leading-[1.7] text-foreground
        [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
        [&_strong]:font-semibold [&_em]:italic
        [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
        [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5
        [&_h3]:text-[13px] [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
        [&_li]:my-1 [&_li]:leading-relaxed
        [&_code]:bg-surface-active/60 [&_code]:text-foreground [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-xs [&_code]:font-mono
        [&_pre]:bg-surface-active/60 [&_pre]:rounded-xl [&_pre]:p-3.5 [&_pre]:overflow-auto [&_pre]:my-3 [&_pre]:border [&_pre]:border-border/50
        [&_pre>code]:bg-transparent [&_pre>code]:p-0
        [&_blockquote]:border-l-2 [&_blockquote]:border-alpine-400/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_blockquote]:my-2 [&_blockquote]:italic
        [&_a]:text-alpine-500 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-alpine-400
        [&_hr]:border-border/50 [&_hr]:my-4
        [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:my-3
        [&_th]:bg-surface-hover [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium
        [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5
        ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Collapsible reasoning chain for deepseek-v4-pro responses */
function ThinkingSection({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = useState(false)
  const wordCount = Math.round(reasoning.split(/\s+/).filter(Boolean).length)
  return (
    <div className="mb-3 rounded-lg bg-surface-hover/50 border border-border/40 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs text-muted hover:text-foreground transition-colors"
      >
        <Cpu size={12} className="text-alpine-500/70" />
        <span className="font-medium">Reasoning chain</span>
        <span className="text-[10px] opacity-50">({wordCount} words)</span>
        <ChevronDown size={12} className={`ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 text-xs text-muted/80 leading-relaxed whitespace-pre-wrap border-t border-border/30">
          {reasoning}
        </div>
      )}
    </div>
  )
}

/** Animated typing dots */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted/60"
          style={{
            animation: 'ai-typing 1.4s infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes ai-typing {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </span>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AIAssistant({
  note,
  noteContent,
  selectedText,
  allNotes,
  mindmapData,
  selectedMindmapNodeId,
  tasks,
  events,
  onInsertText,
  onReplaceText,
  onReplaceSelection,
  onInsertAtCursor,
  onCreateTask,
  onCreateEvent,
  onAddMindmapNode,
  onCreateMindmapNote,
  onClose,
  onToggleSize,
  isLargeWindow = false,
  isExpanded = true,
  onToggleExpand,
}: AIAssistantProps) {
  const [isConfigured, setIsConfigured] = useState(hasAIApiKey())

  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null)
  const [retryCooldown, setRetryCooldown] = useState(0)
  const [rateLimitSnapshot, setRateLimitSnapshot] = useState(getAIRateLimitStatus())
  const [showQuotaPopover, setShowQuotaPopover] = useState(false)
  const [suggestions, setSuggestions] = useState<{
    tasks?: TaskSuggestion[]
    events?: CalendarSuggestion[]
    mindmap?: MindmapSuggestion[]
    summary?: NoteSummary
  }>({})
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showChatHistory, setShowChatHistory] = useState(false)
  const [chatHistory, setChatHistory] = useState<AIChat[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Model and context settings
  const [model, setModel] = useState<DeepSeekModel>('deepseek-chat')
  const [includeCurrentNote, setIncludeCurrentNote] = useState(true)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
  const [showNotePicker, setShowNotePicker] = useState(false)
  const [notePickerSearch, setNotePickerSearch] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [showMindmapPromptModal, setShowMindmapPromptModal] = useState(false)
  const [mindmapPromptInput, setMindmapPromptInput] = useState('')
  const [hasNoteContextConsent, setHasNoteContextConsent] = useState(false)
  const [showNoteContextConsentModal, setShowNoteContextConsentModal] = useState(false)
  const [rememberNoteContextConsent, setRememberNoteContextConsent] = useState(true)
  const [pendingPromptForConsent, setPendingPromptForConsent] = useState<string | null>(null)
  const [pendingMindmapPayload, setPendingMindmapPayload] = useState<{
    sourceText: string
    sourceTitle?: string
    sourceType: 'selection' | 'current-note'
  } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatHistoryRef = useRef<AIMessage[]>([])
  const notePickerRef = useRef<HTMLDivElement>(null)
  const quotaPopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showChatHistory) loadChatHistory()
  }, [showChatHistory, note?.id])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AI_NOTE_CONTEXT_CONSENT_KEY)
      setHasNoteContextConsent(stored === 'accepted')
    } catch {
      setHasNoteContextConsent(false)
    }
  }, [])

  useEffect(() => {
    if (retryCooldown <= 0) return
    const timer = window.setInterval(() => {
      setRetryCooldown(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [retryCooldown])

  const refreshRateLimitSnapshot = useCallback(() => {
    setRateLimitSnapshot(getAIRateLimitStatus())
  }, [])

  useEffect(() => {
    // Keep reset-time based UI fresh even when user is idle.
    const timer = window.setInterval(() => {
      refreshRateLimitSnapshot()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [refreshRateLimitSnapshot])

  const mapAIErrorToUserMessage = useCallback((err: unknown): string => {
    if (err instanceof AIError) {
      if (err.code === 'rate_limited') {
        const suggested = err.retryAfterSeconds && err.retryAfterSeconds > 0 ? err.retryAfterSeconds : 5
        setRetryCooldown(prev => (prev > suggested ? prev : suggested))
        return 'AI rate limit reached. Please retry after a few seconds.'
      }
      if (err.code === 'timeout') return 'AI request timed out. Please retry.'
      if (err.code === 'unauthorized') return 'Your session expired. Please sign in again.'
      if (err.code === 'forbidden') return 'AI access is currently forbidden for this account.'
      if (err.code === 'network') return 'Network error while contacting AI service. Check your connection and retry.'
      if (err.code === 'upstream') return 'AI service is temporarily unavailable. Please retry.'
      return err.message
    }

    return err instanceof Error ? err.message : 'An error occurred'
  }, [])

  useEffect(() => {
    let mounted = true

    const loadKeyStatus = async () => {
      try {
        const status = await getAIApiKeyStatus()
        if (mounted) {
          setIsConfigured(status.available)
        }
      } catch {
        if (mounted) {
          setIsConfigured(hasAIApiKey())
        }
      }
    }

    loadKeyStatus()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!showNotePicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (notePickerRef.current && !notePickerRef.current.contains(e.target as Node)) {
        setShowNotePicker(false)
        setShowContextSettings(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNotePicker])

  useEffect(() => {
    if (!showQuotaPopover) return
    const handleClickOutside = (e: MouseEvent) => {
      if (quotaPopoverRef.current && !quotaPopoverRef.current.contains(e.target as Node)) {
        setShowQuotaPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showQuotaPopover])

  // Reset note context when switching notes
  useEffect(() => {
    setSelectedNoteIds([])
    setIncludeCurrentNote(true)
    setNotePickerSearch('')
  }, [note?.id])

  useEffect(() => {
    if (!showNotePicker) {
      setNotePickerSearch('')
    }
  }, [showNotePicker])

  const selectableNotes = useMemo(() => {
    if (!allNotes?.length) return []
    return allNotes
      .filter(n => n.id !== note?.id)
      .slice()
      .sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'))
  }, [allNotes, note?.id])

  const filteredSelectableNotes = useMemo(() => {
    const query = notePickerSearch.trim().toLowerCase()
    if (!query) return selectableNotes
    return selectableNotes.filter(n => (n.title || 'Untitled').toLowerCase().includes(query))
  }, [notePickerSearch, selectableNotes])

  const selectedAdditionalNotes = useMemo(() => {
    if (!allNotes?.length || selectedNoteIds.length === 0) return []
    const selectedMap = new Set(selectedNoteIds)
    return allNotes
      .filter(n => selectedMap.has(n.id) && n.id !== note?.id)
      .slice(0, AI_NOTE_CONTEXT_LIMITS.maxSelectedNotes)
  }, [allNotes, note?.id, selectedNoteIds])

  const contextDiagnostics = useMemo(() => {
    const noteCaps = AI_NOTE_CONTEXT_LIMITS
    let remaining: number = noteCaps.maxTotalInjectedChars
    let totalIncludedChars = 0
    let totalOriginalChars = 0
    let truncatedCount = 0

    const applyBudget = (content: string) => {
      const original = content.length
      totalOriginalChars += original
      const allowed = Math.max(0, Math.min(noteCaps.maxCharsPerNote, remaining))
      const included = Math.min(original, allowed)
      totalIncludedChars += included
      remaining = Math.max(0, remaining - included)
      if (included < original) truncatedCount += 1
    }

    if (includeCurrentNote && note) {
      const currentContent = noteContent
        ? stripHtmlForAI(noteContent)
        : stripHtmlForAI(note.content || '')
      applyBudget(currentContent)
    }

    for (const selected of selectedAdditionalNotes) {
      applyBudget(stripHtmlForAI(selected.content || ''))
    }

    return {
      totalIncludedChars,
      totalOriginalChars,
      truncatedCount,
      omittedSelectedCount: Math.max(0, selectedNoteIds.length - selectedAdditionalNotes.length),
      nearLimit: remaining < Math.floor(AI_NOTE_CONTEXT_LIMITS.maxTotalInjectedChars * 0.2),
      exhausted: remaining === 0,
    }
  }, [includeCurrentNote, note, noteContent, selectedAdditionalNotes, selectedNoteIds.length])

  const loadChatHistory = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const chats = note?.id ? await getAIChatsByNote(note.id) : await getAIChats()
      setChatHistory(chats)
    } catch (err) {
      console.error('Failed to load chat history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [note?.id])

  const loadChat = useCallback(async (c: AIChat) => {
    setCurrentChatId(c.id)
    setMessages(c.messages.map((msg, i) => ({
      id: `${msg.role}-${i}-${Date.now()}`,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp),
      reasoning: msg.reasoning,
    })))
    chatHistoryRef.current = c.messages.map(msg => ({ role: msg.role, content: msg.content }))
    setShowChatHistory(false)
  }, [])

  const startNewChat = useCallback(() => {
    setCurrentChatId(null)
    setMessages([])
    chatHistoryRef.current = []
    setShowChatHistory(false)
  }, [])

  const handleDeleteChat = useCallback(async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await deleteAIChat(chatId)
      setChatHistory(prev => prev.filter(c => c.id !== chatId))
      if (currentChatId === chatId) startNewChat()
    } catch (err) {
      console.error('Failed to delete chat:', err)
    }
  }, [currentChatId, startNewChat])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const aiContext = useMemo((): AIContext => {
    const context: AIContext = {}
    if (note && includeCurrentNote) {
      const plainContent = noteContent
        ? stripHtmlForAI(noteContent)
        : note.content ? stripHtmlForAI(note.content) : ''
      context.currentNote = {
        id: note.id,
        title: note.title || 'Untitled',
        content: plainContent,
        type: (note.note_type || 'rich-text') as NoteType,
      }
    }
    if (selectedText?.trim()) context.selectedText = selectedText
    if (mindmapData && selectedMindmapNodeId) {
      const selectedNode = mindmapData.nodes[selectedMindmapNodeId]
      if (selectedNode) {
        context.mindmapData = {
          rootId: mindmapData.rootId,
          selectedNodeId: selectedMindmapNodeId,
          selectedNodeText: selectedNode.text,
          selectedNodeDescription: selectedNode.description,
        }
      }
    }
    if (tasks?.length) {
      context.tasks = tasks.slice(0, 20).map(t => ({
        id: t.id, title: t.title, status: t.status,
        dueDate: t.due_date || undefined, priority: t.priority,
      }))
    }
    if (events?.length) {
      context.events = events.slice(0, 10).map(e => ({
        id: e.id, title: e.title, startTime: e.start_time, endTime: e.end_time,
      }))
    }
    if (allNotes?.length) {
      context.allNotes = allNotes.map(n => ({ id: n.id, title: n.title || 'Untitled' }))
    }
    if (selectedAdditionalNotes.length > 0) {
      context.additionalNoteContents = selectedAdditionalNotes
        .map(n => ({
          id: n.id,
          title: n.title || 'Untitled',
          content: stripHtmlForAI(n.content || ''),
        }))
    }
    return context
  }, [note, noteContent, selectedText, mindmapData, selectedMindmapNodeId, tasks, events, allNotes, includeCurrentNote, selectedAdditionalNotes])

  const handleToolCall: ToolCallHandler = useCallback(async (name, args) => {
    switch (name) {
      case 'list_notes': {
        if (!allNotes?.length) return 'No notes available.'
        const listPreview = allNotes
          .slice(0, 60)
          .map(n => `- "${n.title || 'Untitled'}" (ID: ${n.id})`)
          .join('\n')
        const remaining = allNotes.length - 60
        return `Available notes (${allNotes.length} total):\n${listPreview}${remaining > 0 ? `\n...and ${remaining} more notes.` : ''}`
      }
      case 'read_note': {
        const noteId = args.noteId as string | undefined
        const noteTitle = args.noteTitle as string | undefined
        if (!allNotes?.length) return 'No notes available.'
        let targetNote: Note | undefined
        if (noteId) targetNote = allNotes.find(n => n.id === noteId)
        else if (noteTitle) targetNote = allNotes.find(n => n.title?.toLowerCase().includes(noteTitle.toLowerCase()))
        if (!targetNote) return `Note not found. Available: ${allNotes.map(n => n.title || 'Untitled').join(', ')}`
        const fullContent = stripHtmlForAI(targetNote.content || '')
        const limited = truncateAtBoundary(fullContent, AI_NOTE_CONTEXT_LIMITS.readNoteToolChars)
        const wasTruncated = limited.length < fullContent.length
        return `Note: "${targetNote.title || 'Untitled'}"\nType: ${targetNote.note_type || 'rich-text'}\n\nContent:\n${limited}${wasTruncated ? '\n\n...[truncated for context window]' : ''}`
      }
      case 'search_notes': {
        const rawQuery = ((args.query as string) || '').trim()
        const query = rawQuery.toLowerCase()
        const requestedMax = Number(args.maxResults)
        const maxResults = Number.isFinite(requestedMax)
          ? Math.max(1, Math.min(Math.floor(requestedMax), AI_NOTE_CONTEXT_LIMITS.searchMaxResultsHard))
          : AI_NOTE_CONTEXT_LIMITS.searchMaxResultsDefault
        if (!query) return 'No search query provided.'
        if (!allNotes?.length) return 'No notes available to search.'
        const scored = allNotes
          .map(n => {
          const t = (n.title || '').toLowerCase()
          const c = stripHtmlForAI(n.content || '').toLowerCase()
          let score = 0
          if (t === query) score += 4
          else if (t.includes(query)) score += 2
          if (c.includes(query)) score += 1
          return { note: n, score }
        })
          .filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score)

        if (!scored.length) return `No notes found matching "${query}".`
        const excerpts = scored.slice(0, maxResults).map(({ note: n }) => {
          const c = stripHtmlForAI(n.content || '')
          const excerpt = truncateAtBoundary(c, AI_NOTE_CONTEXT_LIMITS.searchExcerptChars)
          return `- "${n.title || 'Untitled'}": ${excerpt}${excerpt.length < c.length ? '...' : ''}`
        })
        return `Found ${scored.length} note(s) matching "${query}". Showing top ${Math.min(maxResults, scored.length)}:\n${excerpts.join('\n\n')}`
      }
      case 'replace_note_content': {
        if (!onReplaceText) return 'Note content replacement is not available in this view.'
        if (!note) return 'No note is currently open.'
        const content = (args.content as string | undefined)?.trim()
        if (!content) return 'No content provided for replacement.'
        onReplaceText(textToHtml(content))
        return `Successfully replaced the entire content of "${note.title || 'Untitled'}".`
      }
      case 'edit_note_content': {
        if (!onReplaceText) return 'Note editing is not available in this view.'
        if (!note) return 'No note is currently open.'
        const findText = (args.findText as string | undefined)?.trim()
        const replaceWith = (args.replaceWith as string | undefined) ?? ''
        if (!findText) return 'No findText provided.'
        const currentPlain = stripHtmlForAI(noteContent || note.content || '')
        if (!currentPlain.includes(findText)) {
          return `Could not find the text "${truncateAtBoundary(findText, 80)}" in the note. Make sure you are using the exact text from the note content.`
        }
        const currentHtml = noteContent || note.content || ''
        const escapedFind = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const plainSegmentRegex = new RegExp(
          escapedFind.split('').map(ch => {
            const esc = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            return esc + '(?:<[^>]*>)*'
          }).join(''),
        )
        const replacementHtml = textToHtml(replaceWith)
        let newHtml: string
        if (plainSegmentRegex.test(currentHtml)) {
          newHtml = currentHtml.replace(plainSegmentRegex, replacementHtml)
        } else {
          const plainUpdated = currentPlain.replace(findText, replaceWith)
          newHtml = textToHtml(plainUpdated)
        }
        onReplaceText(newHtml)
        return `Successfully edited the note "${note.title || 'Untitled'}". Replaced "${truncateAtBoundary(findText, 60)}" with new content.`
      }
      case 'create_mindmap_note': {
        if (!onCreateMindmapNote) return 'Mindmap note creation is not available in this view.'

        const requestedTitle = (args.title as string | undefined)?.trim()
        const noteId = (args.noteId as string | undefined)?.trim()
        const noteTitle = (args.noteTitle as string | undefined)?.trim()
        const focusText = (args.focusText as string | undefined)?.trim()
        const additionalPrompt = (args.additionalPrompt as string | undefined)?.trim()

        let sourceType: 'selection' | 'current-note' = 'current-note'
        let sourceText = ''
        let sourceTitle: string | undefined

        if (focusText) {
          sourceType = 'selection'
          sourceText = focusText
          sourceTitle = requestedTitle || 'Selected text'
        } else {
          let targetNote: Note | undefined
          if (noteId && allNotes?.length) {
            targetNote = allNotes.find(n => n.id === noteId)
          }
          if (!targetNote && noteTitle && allNotes?.length) {
            const normalized = noteTitle.toLowerCase()
            targetNote = allNotes.find(n => (n.title || '').toLowerCase().includes(normalized))
          }
          if (!targetNote && note) {
            targetNote = note
          }

          if (!targetNote) {
            return 'No source note available. Provide noteId/noteTitle or open a note first.'
          }

          if (targetNote.note_type && targetNote.note_type !== 'rich-text') {
            return 'Only rich-text notes can be converted directly. Provide focusText or choose a text note.'
          }

          sourceText = stripHtmlForAI(targetNote.content || '')
          sourceTitle = targetNote.title || 'Untitled'
          sourceType = 'current-note'
        }

        if (!sourceText.trim()) {
          return 'No text content found to build a mindmap from.'
        }

        await onCreateMindmapNote({
          sourceText,
          sourceTitle,
          sourceType,
          targetTitle: requestedTitle,
          additionalPrompt,
        })

        return `Created a new mindmap note from ${sourceType === 'selection' ? 'selected text' : 'the current note'}.`
      }
      default:
        return `Unknown tool: ${name}`
    }
  }, [allNotes, note, noteContent, onCreateMindmapNote, onReplaceText])

  const handleSend = useCallback(async (
    overrideInput?: string,
    options?: { skipConsentCheck?: boolean },
  ) => {
    const prompt = (overrideInput ?? inputValue).trim()
    if (!prompt || isLoading) return

    const hasInjectedNoteContext = !!(
      aiContext.currentNote?.content?.trim() ||
      (aiContext.additionalNoteContents && aiContext.additionalNoteContents.length > 0)
    )

    if (hasInjectedNoteContext && !hasNoteContextConsent && !options?.skipConsentCheck) {
      setPendingPromptForConsent(prompt)
      setShowNoteContextConsentModal(true)
      return
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    if (!overrideInput) setInputValue('')
    setIsLoading(true)
    setError(null)
    setStreamingContent('')
    setStreamingReasoning('')

    chatHistoryRef.current = [...chatHistoryRef.current, { role: 'user', content: userMessage.content }]

    const assistantMessageId = `assistant-${Date.now()}`
    let fullResponse = ''
    let reasoningContent = ''

    try {
      setMessages(prev => [...prev, {
        id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true,
      }])

      await chat(
        userMessage.content,
        aiContext,
        chatHistoryRef.current.slice(0, -1),
        (token) => { fullResponse += token; setStreamingContent(fullResponse) },
        (!isReasonerToolCallingEnabled() && model === 'deepseek-v4-pro') ? undefined : (allNotes?.length ? handleToolCall : undefined),
        model,
        (token) => { reasoningContent += token; setStreamingReasoning(prev => prev + token) },
      )

      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? { ...msg, content: fullResponse, reasoning: reasoningContent || undefined, isStreaming: false }
          : msg
      ))

      chatHistoryRef.current = [...chatHistoryRef.current, { role: 'assistant', content: fullResponse }]
      setLastFailedPrompt(null)
      refreshRateLimitSnapshot()

      try {
        // Build persisted messages, preserving reasoning chain and model used
        const chatMessages: DBMessage[] = chatHistoryRef.current
          .filter(msg => msg.role === 'user' || msg.role === 'assistant')
          .map((msg, i, arr) => {
            const isLastAssistant = msg.role === 'assistant' && i === arr.length - 1
            return {
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              timestamp: new Date().toISOString(),
              reasoning: isLastAssistant && reasoningContent ? reasoningContent : undefined,
              model: isLastAssistant ? model : undefined,
            }
          })

        if (currentChatId) {
          await updateAIChat(currentChatId, { messages: chatMessages })
        } else {
          const chatTitle = generateChatTitle(chatMessages)
          const newChat = await createAIChat({ note_id: note?.id || null, title: chatTitle, messages: chatMessages })
          if (newChat) setCurrentChatId(newChat.id)
        }
      } catch (saveErr) {
        console.error('Failed to save chat:', saveErr)
      }
    } catch (err) {
      if (isAIAbortError(err)) {
        setLastFailedPrompt(null)
        if (fullResponse.trim()) {
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, content: fullResponse, reasoning: reasoningContent || undefined, isStreaming: false }
              : msg
          ))
          chatHistoryRef.current = [...chatHistoryRef.current, { role: 'assistant', content: fullResponse }]
        } else {
          setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId))
        }
      } else {
        setError(mapAIErrorToUserMessage(err))
        setLastFailedPrompt(userMessage.content)
        setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId))
      }
    } finally {
      setIsLoading(false)
      setStreamingContent('')
      setStreamingReasoning('')
      refreshRateLimitSnapshot()
    }
  }, [inputValue, isLoading, aiContext, allNotes, handleToolCall, currentChatId, note?.id, model, mapAIErrorToUserMessage, refreshRateLimitSnapshot, hasNoteContextConsent])

  const handleCancelResponse = useCallback(() => {
    cancelActiveAIRequest()
  }, [])

  const handleSendClick = useCallback(() => {
    void handleSend()
  }, [handleSend])

  const handleConfirmNoteContextConsent = useCallback(() => {
    if (rememberNoteContextConsent) {
      try {
        window.localStorage.setItem(AI_NOTE_CONTEXT_CONSENT_KEY, 'accepted')
      } catch {
        // Ignore storage failures and continue with in-memory consent.
      }
    }

    setHasNoteContextConsent(true)
    setShowNoteContextConsentModal(false)

    const promptToSend = pendingPromptForConsent
    setPendingPromptForConsent(null)
    if (promptToSend) {
      void handleSend(promptToSend, { skipConsentCheck: true })
    }
  }, [rememberNoteContextConsent, pendingPromptForConsent, handleSend])

  const handleCancelNoteContextConsent = useCallback(() => {
    setShowNoteContextConsentModal(false)
    setPendingPromptForConsent(null)
  }, [])

  const handleSubmitMindmapCreation = useCallback(async () => {
    if (!onCreateMindmapNote || !pendingMindmapPayload) return

    setIsLoading(true)
    setError(null)

    const additionalPrompt = mindmapPromptInput.trim() || undefined

    try {
      await onCreateMindmapNote({
        ...pendingMindmapPayload,
        additionalPrompt,
      })

      setMessages(prev => [...prev, {
        id: `action-${Date.now()}`,
        role: 'assistant',
        content: additionalPrompt
          ? `Created a new mindmap note from your current context using your instructions: "${additionalPrompt}".`
          : 'Created a new mindmap note from your current context.',
        timestamp: new Date(),
      }])

      setShowMindmapPromptModal(false)
      setPendingMindmapPayload(null)
      setMindmapPromptInput('')
    } catch (err) {
      setError(mapAIErrorToUserMessage(err))
    } finally {
      setIsLoading(false)
      refreshRateLimitSnapshot()
    }
  }, [onCreateMindmapNote, pendingMindmapPayload, mindmapPromptInput, mapAIErrorToUserMessage, refreshRateLimitSnapshot])

  const handleQuickAction = useCallback(async (action: QuickAction) => {
    if (action === 'create-mindmap-note') {
      if (!onCreateMindmapNote) { setError('Mindmap creation is not available here.'); return }

      if (!selectedText?.trim() && note?.note_type !== 'rich-text') {
        setError('Open a text note or select text first to create a mindmap note.')
        return
      }

      const sourceText = selectedText?.trim() || aiContext.currentNote?.content?.trim() || ''
      if (!sourceText) {
        setError('No text content available. Select text or open a text note first.')
        return
      }

      const sourceType: 'selection' | 'current-note' = selectedText?.trim() ? 'selection' : 'current-note'
      setPendingMindmapPayload({
        sourceText,
        sourceType,
        sourceTitle: sourceType === 'selection' ? 'Selected text' : aiContext.currentNote?.title,
      })
      setMindmapPromptInput('')
      setShowMindmapPromptModal(true)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      switch (action) {
        case 'summarize': {
          if (!aiContext.currentNote?.content) { setError('No note content to summarize'); break }
          const summary = await summarizeNote(aiContext.currentNote.content, aiContext.currentNote.title)
          setSuggestions(prev => ({ ...prev, summary }))
          setShowSuggestions(true)
          break
        }
        case 'improve-writing':
        case 'fix-grammar':
        case 'make-concise':
        case 'expand': {
          if (!aiContext.currentNote?.content) { setError('No note content to edit'); break }
          const instructions: Record<string, string> = {
            'improve-writing': 'Improve the writing quality, clarity, and flow',
            'fix-grammar': 'Fix any grammar, spelling, or punctuation errors',
            'make-concise': 'Make this text more concise while keeping the key information',
            'expand': 'Expand on this text with more detail and examples',
          }
          const edited = await editText(aiContext.currentNote.content, instructions[action])
          setMessages(prev => [...prev, {
            id: `action-${Date.now()}`, role: 'assistant',
            content: `**${action.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}:**\n\n${edited}`,
            timestamp: new Date(),
          }])
          break
        }
        case 'continue-writing': {
          const textToUse = selectedText?.trim() || aiContext.currentNote?.content
          if (!textToUse) { setError('No content to continue from.'); break }
          const continued = await editText(textToUse.slice(-CONTEXT_LENGTH_LIMIT), 'Continue writing from where this text ends. Maintain the same style, tone, and topic.')
          setMessages(prev => [...prev, { id: `action-${Date.now()}`, role: 'assistant', content: `**Continue Writing:**\n\n${continued}`, timestamp: new Date() }])
          break
        }
        case 'explain-selection': {
          if (!selectedText?.trim()) { setError('Please select some text to explain'); break }
          const explanation = await editText(selectedText, 'Explain this text in simple terms. Break down complex concepts and define technical terms.')
          setMessages(prev => [...prev, { id: `action-${Date.now()}`, role: 'assistant', content: `**Explanation:**\n\n${explanation}`, timestamp: new Date() }])
          break
        }
        case 'improve-selection': {
          if (!selectedText?.trim()) { setError('Please select some text to improve'); break }
          const improved = await editText(selectedText, 'Improve this text. Enhance clarity, fix errors, and make it more engaging while preserving the meaning.')
          setMessages(prev => [...prev, { id: `action-${Date.now()}`, role: 'assistant', content: `**Improved Version:**\n\n${improved}`, timestamp: new Date() }])
          break
        }
        case 'translate-selection': {
          if (!selectedText?.trim()) { setError('Please select some text to translate'); break }
          const translated = await editText(selectedText, 'Translate this text to English if it is in another language, or to Spanish if it is in English.')
          setMessages(prev => [...prev, { id: `action-${Date.now()}`, role: 'assistant', content: `**Translation:**\n\n${translated}`, timestamp: new Date() }])
          break
        }
        case 'simplify-selection': {
          if (!selectedText?.trim()) { setError('Please select some text to simplify'); break }
          const simplified = await editText(selectedText, 'Simplify this text. Use simpler words, shorter sentences, and clearer explanations.')
          setMessages(prev => [...prev, { id: `action-${Date.now()}`, role: 'assistant', content: `**Simplified:**\n\n${simplified}`, timestamp: new Date() }])
          break
        }
        case 'suggest-tasks': {
          const taskSuggestions = await suggestTasks(aiContext)
          setSuggestions(prev => ({ ...prev, tasks: taskSuggestions }))
          setShowSuggestions(true)
          break
        }
        case 'suggest-events': {
          const eventSuggestions = await suggestEvents(aiContext)
          setSuggestions(prev => ({ ...prev, events: eventSuggestions }))
          setShowSuggestions(true)
          break
        }
        case 'mindmap-ideas': {
          if (!aiContext.mindmapData?.selectedNodeText) { setError('Please select a mindmap node first'); break }
          const mindmapSuggestions = await suggestMindmapNodes(aiContext.mindmapData.selectedNodeText, aiContext.mindmapData.selectedNodeDescription)
          setSuggestions(prev => ({ ...prev, mindmap: mindmapSuggestions }))
          setShowSuggestions(true)
          break
        }
      }
    } catch (err) {
      setError(mapAIErrorToUserMessage(err))
    } finally {
      setIsLoading(false)
      refreshRateLimitSnapshot()
    }
  }, [aiContext, selectedText, note?.note_type, onCreateMindmapNote, mapAIErrorToUserMessage, refreshRateLimitSnapshot])

  const quotaInfo = useMemo(() => {
    if (!rateLimitSnapshot?.limit && rateLimitSnapshot?.limit !== 0) return null

    const limit = rateLimitSnapshot.limit ?? 0
    const remaining = rateLimitSnapshot.remaining ?? 0
    const resetAt = rateLimitSnapshot.resetAtEpochSeconds
      ? rateLimitSnapshot.resetAtEpochSeconds * 1000
      : null
    const resetInSeconds = resetAt
      ? Math.max(0, Math.ceil((resetAt - Date.now()) / 1000))
      : null

    return {
      limit,
      remaining,
      resetInSeconds,
      windowMs: rateLimitSnapshot.windowMs,
      low: remaining <= Math.max(1, Math.floor(limit * 0.1)),
    }
  }, [rateLimitSnapshot])

  const quotaWindowLabel = useMemo(() => {
    if (!quotaInfo?.windowMs) return 'n/a'
    const totalSeconds = Math.round(quotaInfo.windowMs / 1000)
    if (totalSeconds < 60) return `${totalSeconds}s`
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`
  }, [quotaInfo])

  const handleCopy = useCallback((content: string, id: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const handleClearChat = useCallback(() => {
    setMessages([])
    chatHistoryRef.current = []
    setSuggestions({})
    setShowSuggestions(false)
  }, [])

  const handleApplyTask = useCallback((task: TaskSuggestion) => {
    onCreateTask?.(task.title, { description: task.description, priority: task.priority, dueDate: task.dueDate ? new Date(task.dueDate) : undefined })
  }, [onCreateTask])

  const handleApplyEvent = useCallback((event: CalendarSuggestion) => {
    if (onCreateEvent && event.suggestedDate) {
      const startTime = new Date(event.suggestedDate)
      const endTime = new Date(startTime.getTime() + (event.duration || 60) * 60000)
      onCreateEvent(event.title, startTime, endTime, { description: event.description })
    }
  }, [onCreateEvent])

  const handleApplyMindmapNode = useCallback((suggestion: MindmapSuggestion) => {
    onAddMindmapNode?.(suggestion.nodeText, suggestion.description)
  }, [onAddMindmapNode])

  const handleInsertToNote = useCallback((content: string) => {
    onInsertText?.(textToHtml(content))
  }, [onInsertText])

  const handleInsertAtCursorPosition = useCallback((content: string) => {
    if (onInsertAtCursor) onInsertAtCursor(textToHtml(content))
    else if (onInsertText) onInsertText(textToHtml(content))
  }, [onInsertAtCursor, onInsertText])

  const handleReplaceSelectionWithResponse = useCallback((content: string) => {
    if (selectedText && onReplaceSelection) {
      const plainText = content
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
        .replace(/#{1,6}\s*/g, '')
        .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/>\s*/g, '')
        .replace(/[-*+]\s+/g, '')
        .replace(/\d+\.\s+/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      onReplaceSelection(plainText)
    }
  }, [selectedText, onReplaceSelection])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

  // ─── CHAT HISTORY PANEL ─────────────────────────────────────────────────────

  const renderChatHistory = () => (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center">
                <Loader2 size={18} className="animate-spin text-muted" />
              </div>
              <span className="text-xs text-muted">Loading conversations…</span>
            </div>
          </div>
        ) : chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-surface-hover to-surface-active/50 flex items-center justify-center mb-4">
              <MessageSquare size={24} className="text-muted/60" />
            </div>
            <p className="text-sm font-medium text-foreground/70">No conversations yet</p>
            <p className="text-xs text-muted mt-1.5 text-center leading-relaxed">
              Your AI conversations will appear here
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {chatHistory.map(c => (
              <button
                key={c.id}
                onClick={() => loadChat(c)}
                className={`w-full p-3 text-left rounded-xl transition-all duration-200 group relative ${
                  currentChatId === c.id
                    ? 'bg-alpine-600/10 ring-1 ring-alpine-500/30'
                    : 'hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    currentChatId === c.id
                      ? 'bg-alpine-500/20 text-alpine-500'
                      : 'bg-surface-hover text-muted'
                  }`}>
                    <MessageSquare size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-xs font-medium truncate ${currentChatId === c.id ? 'text-alpine-600 dark:text-alpine-400' : 'text-foreground'}`}>
                      {c.title}
                    </h4>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted">
                      <span>{c.messages.length} messages</span>
                      <span className="opacity-40">·</span>
                      <span>{new Date(c.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteChat(c.id, e)}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-muted hover:text-danger hover:bg-danger/10"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="p-3 border-t border-border/50 shrink-0">
        <button
          onClick={startNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-alpine-600 text-white text-xs font-medium rounded-xl hover:bg-alpine-700 active:scale-[0.98] transition-all shadow-sm"
        >
          <Plus size={14} />
          New Conversation
        </button>
      </div>
    </div>
  )

  // ─── QUICK ACTIONS ─────────────────────────────────────────────────────────

  const [showQuickActions, setShowQuickActions] = useState(false)

  const renderQuickActions = () => {
    const noteActions: { action: QuickAction; icon: React.ReactNode; label: string }[] = [
      { action: 'summarize', icon: <FileText size={13} />, label: 'Summarize' },
      { action: 'improve-writing', icon: <Wand2 size={13} />, label: 'Improve' },
      { action: 'fix-grammar', icon: <Check size={13} />, label: 'Grammar' },
      { action: 'make-concise', icon: <RefreshCw size={13} />, label: 'Concise' },
    ]
    const selectionActions: { action: QuickAction; icon: React.ReactNode; label: string }[] = [
      { action: 'explain-selection', icon: <HelpCircle size={13} />, label: 'Explain' },
      { action: 'improve-selection', icon: <Wand2 size={13} />, label: 'Improve' },
      { action: 'simplify-selection', icon: <Type size={13} />, label: 'Simplify' },
      { action: 'translate-selection', icon: <Languages size={13} />, label: 'Translate' },
    ]
    const writingActions: { action: QuickAction; icon: React.ReactNode; label: string; show: boolean }[] = [
      { action: 'continue-writing', icon: <PenLine size={13} />, label: 'Continue', show: !!note },
      { action: 'expand', icon: <ArrowRight size={13} />, label: 'Expand', show: !!note },
    ]
    const otherActions: { action: QuickAction; icon: React.ReactNode; label: string; show: boolean }[] = [
      { action: 'suggest-tasks', icon: <CheckSquare size={13} />, label: 'Tasks', show: true },
      { action: 'suggest-events', icon: <Calendar size={13} />, label: 'Events', show: true },
      { action: 'mindmap-ideas', icon: <Network size={13} />, label: 'Mindmap', show: !!mindmapData },
      { action: 'create-mindmap-note', icon: <Network size={13} />, label: 'To Mindmap', show: !!onCreateMindmapNote },
    ]

    const hasSelection = !!(selectedText?.trim())

    const actionPill = (action: QuickAction, icon: React.ReactNode, label: string, highlight = false) => (
      <button
        key={action}
        onClick={() => { handleQuickAction(action); setShowQuickActions(false) }}
        disabled={isLoading || !isConfigured}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
          disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap
          active:scale-95 ${
          highlight
            ? 'bg-alpine-600/10 text-alpine-600 dark:text-alpine-400 border border-alpine-500/20 hover:bg-alpine-600/20'
            : 'bg-surface-hover text-muted border border-border/50 hover:text-foreground hover:bg-surface-active hover:border-border-strong'
        }`}
      >
        {icon}
        {label}
      </button>
    )

    if (!showQuickActions) return null

    return (
      <div className="border-b border-border/50 bg-surface-hover/20 shrink-0 animate-in slide-in-from-top-2 duration-200">
        <div className="p-3 space-y-3">
          {hasSelection && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MousePointerClick size={12} className="text-alpine-500" />
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Selection</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectionActions.map(({ action, icon, label }) => actionPill(action, icon, label, true))}
              </div>
            </div>
          )}

          {(note || !!writingActions.filter(a => a.show).length) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap size={12} className="text-muted" />
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Quick Actions</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {writingActions.filter(a => a.show).map(({ action, icon, label }) => actionPill(action, icon, label))}
                {note && noteActions.map(({ action, icon, label }) => actionPill(action, icon, label))}
                {otherActions.filter(a => a.show).map(({ action, icon, label }) => actionPill(action, icon, label))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── SUGGESTIONS PANEL ─────────────────────────────────────────────────────

  const renderSuggestions = () => {
    if (!showSuggestions) return null
    return (
      <div className="border-b border-border/50 bg-surface-hover/10 shrink-0 overflow-y-auto max-h-[40%]">
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-alpine-500" />
              <span className="text-xs font-semibold text-foreground">Suggestions</span>
            </div>
            <button
              onClick={() => { setSuggestions({}); setShowSuggestions(false) }}
              className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors text-muted hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-2.5">
            {suggestions.summary && (
              <div className="bg-surface rounded-xl p-3.5 border border-border/50">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider mb-2.5">
                  <FileText size={10} /> Summary
                </div>
                <p className="text-[13px] text-foreground/80 leading-relaxed">{suggestions.summary.summary}</p>
                {suggestions.summary.keyPoints.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-border/40">
                    <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Key Points</div>
                    <ul className="space-y-2">
                      {suggestions.summary.keyPoints.map((point, i) => (
                        <li key={i} className="flex gap-2.5 text-xs text-foreground/70 leading-relaxed">
                          <span className="w-5 h-5 rounded-full bg-alpine-600/10 text-alpine-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5">{i + 1}</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {suggestions.summary.suggestedTasks && suggestions.summary.suggestedTasks.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-border/40">
                    <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Suggested Tasks</div>
                    <div className="space-y-1">
                      {suggestions.summary.suggestedTasks.map((task, i) => (
                        <button key={i} onClick={() => handleApplyTask({ title: task })} className="flex items-center gap-2 w-full text-left text-xs text-foreground/70 hover:text-foreground p-2 rounded-lg hover:bg-surface-hover transition-colors group">
                          <Plus size={12} className="text-muted group-hover:text-alpine-500 transition-colors" /> {task}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {suggestions.tasks && suggestions.tasks.length > 0 && (
              <div className="bg-surface rounded-xl p-3.5 border border-border/50">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider mb-2.5">
                  <CheckSquare size={10} /> Task Suggestions
                </div>
                <div className="space-y-2">
                  {suggestions.tasks.map((task, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 p-2.5 bg-surface-hover/40 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground">{task.title}</div>
                        {task.description && <div className="text-[11px] text-muted mt-0.5 leading-relaxed">{task.description}</div>}
                        <div className="flex items-center gap-2 mt-1.5">
                          {task.priority && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              task.priority === 'urgent' ? 'bg-danger/10 text-danger' :
                              task.priority === 'high' ? 'bg-warning/10 text-warning' :
                              task.priority === 'low' ? 'bg-surface-active text-muted' :
                              'bg-alpine-600/10 text-alpine-600'
                            }`}>{task.priority}</span>
                          )}
                          {task.dueDate && <span className="text-[10px] text-muted">{task.dueDate}</span>}
                        </div>
                      </div>
                      {onCreateTask && (
                        <button onClick={() => handleApplyTask(task)} className="px-2.5 py-1 text-[10px] font-medium bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 active:scale-95 transition-all flex-shrink-0">
                          Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {suggestions.events && suggestions.events.length > 0 && (
              <div className="bg-surface rounded-xl p-3.5 border border-border/50">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider mb-2.5">
                  <Calendar size={10} /> Event Suggestions
                </div>
                <div className="space-y-2">
                  {suggestions.events.map((event, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 p-2.5 bg-surface-hover/40 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground">{event.title}</div>
                        {event.description && <div className="text-[11px] text-muted mt-0.5 leading-relaxed">{event.description}</div>}
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted">
                          {event.suggestedDate && <span>{event.suggestedDate}</span>}
                          {event.duration && <span>({event.duration} min)</span>}
                        </div>
                      </div>
                      {onCreateEvent && event.suggestedDate && (
                        <button onClick={() => handleApplyEvent(event)} className="px-2.5 py-1 text-[10px] font-medium bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 active:scale-95 transition-all flex-shrink-0">
                          Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {suggestions.mindmap && suggestions.mindmap.length > 0 && (
              <div className="bg-surface rounded-xl p-3.5 border border-border/50">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider mb-2.5">
                  <Network size={10} /> Mindmap Ideas
                </div>
                <div className="space-y-2">
                  {suggestions.mindmap.map((suggestion, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 p-2.5 bg-surface-hover/40 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground">{suggestion.nodeText}</div>
                        {suggestion.description && <div className="text-[11px] text-muted mt-0.5 leading-relaxed">{suggestion.description}</div>}
                        {suggestion.childSuggestions && suggestion.childSuggestions.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {suggestion.childSuggestions.map((child, j) => (
                              <span key={j} className="text-[10px] px-2 py-0.5 bg-surface-active/60 text-muted rounded-full">{child}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {onAddMindmapNode && (
                        <button onClick={() => handleApplyMindmapNode(suggestion)} className="px-2.5 py-1 text-[10px] font-medium bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 active:scale-95 transition-all flex-shrink-0">
                          Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── STRUCTURED CONTENT ────────────────────────────────────────────────────

  const renderStructuredContent = (parsed: ParsedAIResponse) => {
    if (parsed.type === 'text') return <MarkdownContent content={parsed.rawText || ''} />
    return (
      <div className="space-y-4">
        {parsed.summary && (
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
              <FileText size={10} /> Summary
            </div>
            <p className="text-[13px] text-foreground/80 leading-relaxed">{parsed.summary}</p>
          </div>
        )}
        {parsed.keyPoints && parsed.keyPoints.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
              <Lightbulb size={10} /> Key Points
            </div>
            <ul className="space-y-2.5">
              {parsed.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] text-foreground/80">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-alpine-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {parsed.suggestedTasks && parsed.suggestedTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
              <CheckSquare size={10} /> Suggested Tasks
            </div>
            <ul className="space-y-1.5">
              {parsed.suggestedTasks.map((task, i) => (
                <li key={i} className="flex items-start gap-2 group">
                  <div className="flex-1 text-[13px] text-foreground/80 bg-surface-hover/50 px-3 py-2 rounded-xl border border-border/40">{task}</div>
                  {onCreateTask && (
                    <button onClick={() => handleApplyTask({ title: task })} className="flex-shrink-0 p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Add as task">
                      <Plus size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // ─── WELCOME STATE ─────────────────────────────────────────────────────────

  const renderWelcome = () => {
    const suggestions = [
      selectedText?.trim() ? 'Explain this selection' : null,
      note ? 'Summarize this note' : null,
      'Help me brainstorm ideas',
      'Create a task list',
    ].filter(Boolean) as string[]

    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="relative mb-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-alpine-500/20 to-peak-500/20 flex items-center justify-center">
            <Sparkles size={28} className="text-alpine-500" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
            <Check size={10} className="text-white" />
          </div>
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">AI Assistant</h3>
        <p className="text-xs text-muted text-center max-w-[220px] leading-relaxed mb-6">
          {isConfigured
            ? 'Ask about your notes, get writing help, or brainstorm ideas'
            : 'Set DEEPSEEK_API_KEY in .env.local to get started'}
        </p>
        {isConfigured && (
          <div className="w-full max-w-[280px] space-y-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => void handleSend(s)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-left text-muted hover:text-foreground bg-surface-hover/50 hover:bg-surface-hover border border-border/40 hover:border-border-strong rounded-xl transition-all group"
              >
                <ArrowRight size={12} className="text-muted/50 group-hover:text-alpine-500 transition-colors flex-shrink-0" />
                <span>{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── MESSAGES ──────────────────────────────────────────────────────────────

  const renderMessages = () => (
    <div className="flex-1 overflow-y-auto min-h-0">
      {messages.length === 0 ? (
        renderWelcome()
      ) : (
        <div className="p-4 space-y-5">
          {messages.map((message) => {
            const parsed = message.role === 'assistant' && !message.isStreaming
              ? parseAIResponse(message.content) : null
            const isUser = message.role === 'user'

            return (
              <div key={message.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
                  isUser
                    ? 'bg-alpine-600 text-white'
                    : 'bg-gradient-to-br from-surface-hover to-surface-active text-muted'
                }`}>
                  {isUser ? <User size={13} /> : <Sparkles size={13} />}
                </div>

                {/* Content */}
                <div className={`flex-1 min-w-0 ${isUser ? 'flex flex-col items-end' : ''}`} style={{ maxWidth: '85%' }}>
                  <div className={`rounded-2xl transition-all ${
                    isUser
                      ? 'bg-alpine-600 text-white px-4 py-2.5 rounded-tr-md'
                      : 'bg-transparent'
                  }`}>
                    {message.isStreaming ? (
                      streamingContent ? (
                        <div className={isUser ? '' : ''}>
                          {streamingReasoning && (
                            <div className="mb-3 rounded-lg bg-surface-hover/50 border border-border/40 px-3 py-2">
                              <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted mb-1">
                                <Cpu size={10} className="text-alpine-500/70" />
                                <span>Reasoning…</span>
                              </div>
                              <p className="text-[11px] text-muted/70 leading-relaxed italic line-clamp-3">
                                {streamingReasoning.slice(-300)}
                              </p>
                            </div>
                          )}
                          <MarkdownContent content={streamingContent} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5 py-1">
                          <TypingDots />
                          <span className="text-xs text-muted">
                            {streamingReasoning ? 'Thinking deeply…' : 'Thinking…'}
                          </span>
                        </div>
                      )
                    ) : parsed ? (
                      <>
                        {message.reasoning && <ThinkingSection reasoning={message.reasoning} />}
                        {renderStructuredContent(parsed)}
                      </>
                    ) : !isUser ? (
                      <>
                        {message.reasoning && <ThinkingSection reasoning={message.reasoning} />}
                        <MarkdownContent content={message.content} />
                      </>
                    ) : (
                      <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{message.content}</div>
                    )}
                  </div>

                  {/* Action bar for assistant messages */}
                  {!isUser && !message.isStreaming && (
                    <div className="flex items-center gap-0.5 mt-2 opacity-0 hover:opacity-100 transition-opacity group/actions [.group:hover_&]:opacity-100">
                      <button onClick={() => handleCopy(message.content, message.id)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all" title="Copy">
                        {copiedId === message.id ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
                      </button>
                      {onInsertText && (
                        <button onClick={() => handleInsertToNote(message.content)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all" title="Append to note">
                          <FileText size={12} />
                        </button>
                      )}
                      {onInsertAtCursor && (
                        <button onClick={() => handleInsertAtCursorPosition(message.content)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all" title="Insert at cursor">
                          <PenLine size={12} />
                        </button>
                      )}
                      {selectedText && onReplaceSelection && (
                        <button onClick={() => handleReplaceSelectionWithResponse(message.content)} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all" title="Replace selection">
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  )

  // ─── CONTEXT BAR (above input) ─────────────────────────────────────────────

  const [showContextSettings, setShowContextSettings] = useState(false)

  const renderContextBar = () => {
    const noteCount = (includeCurrentNote && note ? 1 : 0) + selectedAdditionalNotes.length
    if (noteCount === 0 && !selectedText?.trim()) return null
    return (
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {selectedText?.trim() && (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-full bg-alpine-600/10 text-alpine-600 dark:text-alpine-400 border border-alpine-500/15">
            <MousePointerClick size={10} />
            Selection
          </span>
        )}
        {includeCurrentNote && note && (
          <button
            onClick={() => setIncludeCurrentNote(false)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-full bg-surface-hover border border-border/50 text-muted hover:text-foreground hover:border-border-strong transition-all group"
            title="Remove from context"
          >
            <FileText size={10} />
            <span className="max-w-[60px] truncate">{note.title || 'Note'}</span>
            <X size={8} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
        {selectedAdditionalNotes.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-full bg-surface-hover border border-border/50 text-muted">
            <BookOpen size={10} />
            +{selectedAdditionalNotes.length} note{selectedAdditionalNotes.length !== 1 ? 's' : ''}
          </span>
        )}
        {contextDiagnostics.truncatedCount > 0 && (
          <span className="text-[10px] text-warning" title="Some note content was truncated to fit context limits">
            (truncated)
          </span>
        )}
      </div>
    )
  }

  // ─── INPUT ─────────────────────────────────────────────────────────────────

  const renderInput = () => (
    <div className="border-t border-border/50 bg-surface shrink-0">
      {/* Error & warnings */}
      {error && (
        <div className="mx-3 mt-3 px-3 py-2.5 bg-danger/5 border border-danger/15 rounded-xl text-xs flex items-start gap-2.5">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-danger" />
          <div className="flex-1 min-w-0">
            <div className="text-foreground/80">{error}</div>
            {lastFailedPrompt && !isLoading && (
              <button
                onClick={() => {
                  if (retryCooldown > 0) return
                  setError(null)
                  void handleSend(lastFailedPrompt)
                }}
                disabled={retryCooldown > 0}
                className="mt-1.5 px-2.5 py-1 rounded-lg bg-danger/10 hover:bg-danger/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[10px] font-medium text-danger"
              >
                {retryCooldown > 0 ? `Retry in ${retryCooldown}s` : 'Retry'}
              </button>
            )}
          </div>
          <button onClick={() => setError(null)} className="p-1 hover:bg-danger/10 rounded-lg transition-colors flex-shrink-0 text-muted">
            <X size={12} />
          </button>
        </div>
      )}

      {!isConfigured && (
        <div className="mx-3 mt-3 px-3 py-2.5 bg-warning/5 border border-warning/15 rounded-xl text-xs text-foreground/70 flex items-start gap-2.5">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-warning" />
          <span>Set <code className="font-mono bg-surface-active/60 px-1 py-0.5 rounded text-[10px]">DEEPSEEK_API_KEY</code> in .env.local to enable AI.</span>
        </div>
      )}

      <div className="p-3">
        {renderContextBar()}

        {/* Input container */}
        <div className="relative rounded-xl border border-border/60 bg-surface-hover/30 focus-within:border-alpine-500/40 focus-within:ring-2 focus-within:ring-alpine-500/10 transition-all">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConfigured ? (selectedText ? 'Ask about the selection…' : 'Ask anything…') : 'Configure API key to start…'}
            disabled={isLoading || !isConfigured}
            rows={1}
            className="w-full px-3.5 pt-3 pb-10 text-[13px] bg-transparent resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed text-foreground placeholder:text-muted/60"
            style={{ minHeight: '56px', maxHeight: '160px' }}
          />

          {/* Bottom toolbar inside input */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2.5 pb-2">
            <div className="flex items-center gap-1">
              {/* Model toggle */}
              <div className="flex items-center bg-surface-active/40 rounded-lg p-0.5">
                <button
                  onClick={() => setModel('deepseek-chat')}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                    model === 'deepseek-chat'
                      ? 'bg-surface text-foreground shadow-sm'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setModel('deepseek-v4-pro')}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all flex items-center gap-1 ${
                    model === 'deepseek-v4-pro'
                      ? 'bg-surface text-foreground shadow-sm'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  <Cpu size={9} />
                  V4 Pro
                </button>
              </div>

              {/* Quick actions toggle */}
              <button
                onClick={() => setShowQuickActions(v => !v)}
                className={`p-1.5 rounded-lg transition-all ${
                  showQuickActions ? 'bg-alpine-600/10 text-alpine-500' : 'text-muted hover:text-foreground hover:bg-surface-active/40'
                }`}
                title="Quick actions"
              >
                <Zap size={13} />
              </button>

              {/* Note context settings */}
              <div className="relative" ref={notePickerRef}>
                <button
                  onClick={() => setShowContextSettings(v => !v)}
                  className={`p-1.5 rounded-lg transition-all ${
                    showContextSettings ? 'bg-alpine-600/10 text-alpine-500' : 'text-muted hover:text-foreground hover:bg-surface-active/40'
                  }`}
                  title="Context settings"
                >
                  <Settings2 size={13} />
                </button>

                {showContextSettings && (
                  <div className="absolute bottom-full left-0 mb-2 w-64 bg-surface border border-border-strong rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="p-3 border-b border-border/50">
                      <div className="text-[11px] font-semibold text-foreground mb-0.5">Context Settings</div>
                      <div className="text-[10px] text-muted">Choose what the AI can see</div>
                    </div>

                    <div className="p-2">
                      {note && (
                        <button
                          onClick={() => setIncludeCurrentNote(v => !v)}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            includeCurrentNote ? 'border-alpine-600 bg-alpine-600' : 'border-border-strong'
                          }`}>
                            {includeCurrentNote && <Check size={10} className="text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-foreground truncate">{note.title || 'Untitled'}</div>
                            <div className="text-[10px] text-muted">Current note</div>
                          </div>
                        </button>
                      )}

                      {allNotes && allNotes.filter(n => n.id !== note?.id).length > 0 && (
                        <div className="mt-1 pt-1 border-t border-border/30">
                          <div className="px-2.5 py-1.5">
                            <div className="relative">
                              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
                              <input
                                value={notePickerSearch}
                                onChange={(e) => setNotePickerSearch(e.target.value)}
                                placeholder="Search notes…"
                                className="w-full h-7 rounded-lg bg-surface-hover border border-border pl-7 pr-2 text-[11px] text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-alpine-500/30"
                              />
                            </div>
                            <div className="text-[10px] text-muted mt-1">
                              {selectedNoteIds.length}/{AI_NOTE_CONTEXT_LIMITS.maxSelectedNotes} selected
                            </div>
                          </div>
                          <div className="max-h-32 overflow-y-auto">
                            {filteredSelectableNotes.length === 0 && (
                              <div className="px-2.5 py-2 text-[11px] text-muted">No notes found</div>
                            )}
                            {filteredSelectableNotes.map(n => (
                              <button
                                key={n.id}
                                onClick={() => setSelectedNoteIds(prev =>
                                  prev.includes(n.id) ? prev.filter(id => id !== n.id) : [...prev, n.id]
                                )}
                                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-surface-hover transition-colors text-left"
                              >
                                <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                  selectedNoteIds.includes(n.id) ? 'border-alpine-600 bg-alpine-600' : 'border-border-strong'
                                }`}>
                                  {selectedNoteIds.includes(n.id) && <Check size={8} className="text-white" />}
                                </div>
                                <span className="text-[11px] text-foreground truncate">{n.title || 'Untitled'}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Context diagnostics */}
                    <div className="px-3 py-2 border-t border-border/30 bg-surface-hover/30">
                      <div className="flex items-center justify-between text-[10px] text-muted">
                        <span>{contextDiagnostics.totalIncludedChars.toLocaleString()} chars in context</span>
                        {contextDiagnostics.nearLimit && <span className="text-warning">Near limit</span>}
                      </div>
                      {model === 'deepseek-v4-pro' && !isReasonerToolCallingEnabled() && (
                        <div className="text-[10px] text-muted mt-1">Thinking tools disabled by default</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Send / Stop */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted/40 hidden sm:inline-flex items-center gap-1">
                <CornerDownLeft size={9} />
              </span>
              {isLoading ? (
                <button
                  onClick={handleCancelResponse}
                  className="p-1.5 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-all active:scale-95"
                  title="Stop generating"
                >
                  <StopCircle size={16} />
                </button>
              ) : (
                <button
                  onClick={handleSendClick}
                  disabled={!inputValue.trim() || !isConfigured}
                  className="p-1.5 bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderMindmapPromptModal = () => {
    if (!showMindmapPromptModal) return null

    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40  p-4">
        <div className="w-full max-w-lg rounded-2xl border border-border-strong bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Create Mindmap</h4>
              <p className="text-xs text-muted mt-0.5">Optionally guide the AI with instructions</p>
            </div>
            <button
              onClick={() => {
                if (isLoading) return
                setShowMindmapPromptModal(false)
                setPendingMindmapPayload(null)
                setMindmapPromptInput('')
              }}
              className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3">
            <label htmlFor="mindmap-additional-prompt" className="text-xs font-medium text-foreground/80">
              Instructions (optional)
            </label>
            <textarea
              id="mindmap-additional-prompt"
              value={mindmapPromptInput}
              onChange={(e) => setMindmapPromptInput(e.target.value)}
              placeholder="e.g., Focus on implementation steps, risks, and timeline"
              rows={4}
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 text-[13px] bg-surface-hover/50 border border-border rounded-xl resize-y focus:ring-2 focus:ring-alpine-500/20 focus:border-alpine-500/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed text-foreground placeholder:text-muted/60"
            />
            <p className="text-[11px] text-muted">Leave empty to use context only.</p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/50 px-5 py-3.5">
            <button
              onClick={() => {
                if (isLoading) return
                setShowMindmapPromptModal(false)
                setPendingMindmapPayload(null)
                setMindmapPromptInput('')
              }}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-border text-muted hover:text-foreground hover:bg-surface-hover transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSubmitMindmapCreation()}
              disabled={isLoading || !pendingMindmapPayload}
              className="px-4 py-2 text-xs font-medium rounded-xl bg-alpine-600 text-white hover:bg-alpine-700 transition-all disabled:opacity-50 flex items-center gap-1.5 active:scale-[0.98] shadow-sm"
            >
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Network size={12} />}
              Create
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderNoteContextConsentModal = () => {
    if (!showNoteContextConsentModal) return null

    return (
      <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40  p-4">
        <div className="w-full max-w-md rounded-2xl border border-border-strong bg-surface shadow-2xl">
          <div className="px-5 py-3.5 border-b border-border/50">
            <h3 className="text-sm font-semibold text-foreground">Share note context with AI?</h3>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-muted leading-relaxed">
              This message includes note content from your workspace and sends it to the AI provider.
              Continue only if the content is safe to share.
            </p>
            <label className="mt-3 flex items-center gap-2.5 text-xs text-foreground/80 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberNoteContextConsent}
                onChange={(e) => setRememberNoteContextConsent(e.target.checked)}
                className="rounded border-border-strong bg-surface accent-alpine-600"
              />
              Remember my choice
            </label>
          </div>
          <div className="px-5 py-3.5 border-t border-border/50 flex items-center justify-end gap-2">
            <button
              onClick={handleCancelNoteContextConsent}
              className="px-4 py-2 text-xs rounded-xl border border-border text-muted hover:text-foreground hover:bg-surface-hover transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmNoteContextConsent}
              className="px-4 py-2 text-xs rounded-xl bg-alpine-600 text-white hover:bg-alpine-700 transition-all active:scale-[0.98] shadow-sm"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── MAIN RENDER ───────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col h-full bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          {showChatHistory ? (
            <button
              onClick={() => setShowChatHistory(false)}
              className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors"
            >
              <ChevronLeft size={16} className="text-muted" />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-alpine-500 to-alpine-700 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles size={14} className="text-white" />
            </div>
          )}
          <div>
            <h3 className="font-semibold text-sm text-foreground leading-tight">
              {showChatHistory ? 'History' : 'AI Assistant'}
            </h3>
            {!showChatHistory && (
              <p className="text-[10px] text-muted leading-tight mt-0.5">
                {model === 'deepseek-v4-pro' ? 'DeepSeek V4 Pro' : 'DeepSeek Chat'}
                {quotaInfo && (
                  <span className={`ml-1.5 ${quotaInfo.low ? 'text-warning' : ''}`}>
                    · {quotaInfo.remaining} left
                  </span>
                )}
              </p>
            )}
            {showChatHistory && (
              <p className="text-[10px] text-muted leading-tight mt-0.5">
                {chatHistory.length} conversation{chatHistory.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {!showChatHistory && (
            <>
              <button
                onClick={() => setShowChatHistory(true)}
                className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all"
                title="Chat History"
              >
                <History size={15} />
              </button>
              <button
                onClick={startNewChat}
                className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all"
                title="New Chat"
              >
                <Plus size={15} />
              </button>
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all"
                  title="Clear chat"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
          {onToggleSize && !showChatHistory && (
            <button
              onClick={onToggleSize}
              className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all"
              title={isLargeWindow ? 'Default size' : 'Expand'}
            >
              {isLargeWindow ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all"
              title="Close"
              aria-label="Close AI Assistant"
            >
              <X size={15} />
            </button>
          )}
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all"
            >
              {isExpanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <>
          {showChatHistory ? (
            renderChatHistory()
          ) : (
            <>
              {renderQuickActions()}
              {renderSuggestions()}
              {renderMessages()}
              {renderInput()}
            </>
          )}
        </>
      )}

      {renderMindmapPromptModal()}
      {renderNoteContextConsentModal()}
    </div>
  )
}
