'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Send,
  Sparkles,
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
  StopCircle,
  Settings2,
  FolderOpen,
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
  AI_NOTE_CONTEXT_LIMITS,
  stripHtmlForAI,
  textToHtml,
  type AIMessage,
  type AIContext,
  type NoteSummary as AINoteSummary,
  type MindmapSuggestion,
  type TaskSuggestion,
  type CalendarSuggestion,
  type ToolCallHandler,
} from '@/lib/ai'
import { AI_MODEL, AI_MODEL_LABEL, AI_MODEL_SHORT_LABEL } from '@/lib/ai-model'
import {
  getNote,
  getNotesByIds,
  searchNotes,
  type Note,
  type NoteSummary,
  type NoteType,
} from '@/lib/notes'
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
import { buildFolderTree, getFolders, type Folder, type FolderNode } from '@/lib/folders'
import type { Project } from '@/lib/projects'
import type { Task, TaskStats } from '@/lib/tasks'
import type { CalendarEvent } from '@/lib/events'
import type { MindmapData, MindmapNode } from './MindmapEditor'
import { MarkdownContent, ThinkingSection, TypingDots } from './ai/AIMarkdown'
import {
  appendMapValue,
  buildContextFolderGroups,
  countNotesInFolderGroup,
  countNotesInProjectGroup,
  sortNotesByTitle,
  truncateAtBoundary,
  type ContextFolderGroup,
  type ContextProjectGroup,
} from '@/lib/ai/context-groups'
import { parseAIResponse, type ParsedAIResponse } from '@/lib/ai/parse-response'
import { formatModShortcut } from '@/lib/platform'

// ============================================================================
// CONSTANTS
// ============================================================================

const TEXT_TRUNCATION_SHORT = 50
const TEXT_TRUNCATION_MEDIUM = 60
const CONTEXT_LENGTH_LIMIT = 1000
const AI_NOTE_CONTEXT_CONSENT_KEY = 'ai-note-context-consent-v1'

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
  allNotes?: NoteSummary[]
  projects?: Project[]
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

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Accent-gradient glyph tile used as the assistant's identity mark. */
function AssistantMark({
  size = 30,
  radius,
  className = '',
}: {
  size?: number
  radius?: number
  className?: string
}) {
  const resolvedRadius = radius ?? Math.max(7, Math.round(size * 0.3))
  return (
    <span
      aria-hidden="true"
      className={'relative inline-flex shrink-0 items-center justify-center ' + className}
      style={{
        width: size,
        height: size,
        borderRadius: resolvedRadius,
        background: 'var(--accent-gradient)',
        border: '1px solid rgb(255 255 255 / 0.2)',
        boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.35), 0 8px 20px -12px var(--accent-glow)',
      }}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: resolvedRadius,
          background: 'radial-gradient(120% 90% at 30% 0%, rgb(255 255 255 / 0.32), transparent 58%)',
        }}
      />
      <Sparkles
        size={Math.round(size * 0.5)}
        strokeWidth={1.9}
        className="relative text-white"
        style={{ filter: 'drop-shadow(0 1px 1px rgb(0 0 0 / 0.18))' }}
      />
    </span>
  )
}

/** Collapsible reasoning stream shown while an assistant response is in flight. */
function LiveReasoning({ text }: { text: string }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--glass-bg-subtle)] backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-muted transition-colors duration-150 hover:text-foreground"
      >
        <Cpu size={11} className="shrink-0 animate-pulse-soft text-accent" strokeWidth={1.9} />
        <span className="text-[10px] font-medium uppercase tracking-[0.08em]">Live reasoning</span>
        <ChevronDown
          size={11}
          className={'ml-auto shrink-0 transition-transform duration-200 ' + (open ? 'rotate-180' : '')}
        />
      </button>
      <div
        className={
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out ' +
          (open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')
        }
      >
        <div className="overflow-hidden">
          <div className="max-h-40 overflow-y-auto border-t border-[var(--border)] px-2.5 py-2 text-[11px] italic leading-relaxed whitespace-pre-wrap text-muted">
            {text.slice(-360)}
          </div>
        </div>
      </div>
    </div>
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
  projects = [],
  mindmapData,
  selectedMindmapNodeId,
  tasks,
  taskStats,
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
    summary?: AINoteSummary
  }>({})
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showChatHistory, setShowChatHistory] = useState(false)
  const [chatHistory, setChatHistory] = useState<AIChat[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Context settings
  const [includeCurrentNote, setIncludeCurrentNote] = useState(true)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
  const [selectedNoteBodies, setSelectedNoteBodies] = useState<Record<string, Note>>({})
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
  const [showContextSidebar, setShowContextSidebar] = useState(isLargeWindow)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const contextLimits = AI_NOTE_CONTEXT_LIMITS

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatHistoryRef = useRef<AIMessage[]>([])
  const quotaPopoverRef = useRef<HTMLDivElement>(null)

  // Focus the composer as soon as the panel mounts so the ⌘J flow is instant.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
    let mounted = true

    const loadFolders = async () => {
      try {
        const fetchedFolders = await getFolders()
        if (mounted) {
          setFolders(fetchedFolders)
        }
      } catch (err) {
        console.error('Failed to load assistant folders:', err)
        if (mounted) {
          setFolders([])
        }
      }
    }

    loadFolders()

    return () => {
      mounted = false
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
    if (!showContextSidebar) {
      setNotePickerSearch('')
    }
  }, [showContextSidebar])

  useEffect(() => {
    if (isLargeWindow) {
      setShowContextSidebar(true)
    }
  }, [isLargeWindow])

  useEffect(() => {
    if (showChatHistory && !isLargeWindow) {
      setShowContextSidebar(false)
    }
  }, [showChatHistory, isLargeWindow])

  const selectableNotes = useMemo(() => {
    if (!allNotes?.length) return []
    return allNotes
      .filter(n => n.id !== note?.id)
      .slice()
      .sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'))
  }, [allNotes, note?.id])

  const folderTree = useMemo(() => buildFolderTree(folders), [folders])

  const folderIdSet = useMemo(() => new Set(folders.map(folder => folder.id)), [folders])

  const projectLookup = useMemo(
    () => new Map(projects.map(project => [project.id, project] as const)),
    [projects]
  )

  const folderPathLookup = useMemo(() => {
    const folderLookup = new Map(folders.map(folder => [folder.id, folder] as const))
    const cache = new Map<string, string>()

    const resolvePath = (folderId: string): string => {
      const cached = cache.get(folderId)
      if (cached !== undefined) {
        return cached
      }

      const folder = folderLookup.get(folderId)
      if (!folder) {
        cache.set(folderId, '')
        return ''
      }

      const parentPath = folder.parent_id ? resolvePath(folder.parent_id) : ''
      const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name
      cache.set(folderId, path)
      return path
    }

    folders.forEach(folder => {
      resolvePath(folder.id)
    })

    return cache
  }, [folders])

  const filteredSelectableNotes = useMemo(() => {
    const query = notePickerSearch.trim().toLowerCase()
    if (!query) return selectableNotes
    return selectableNotes.filter((availableNote) => {
      const title = (availableNote.title || 'Untitled').toLowerCase()
      if (title.includes(query)) return true

      const projectName = availableNote.project_id
        ? projectLookup.get(availableNote.project_id)?.name.toLowerCase() ?? ''
        : 'unfiled'
      if (projectName.includes(query)) return true

      const folderPath = availableNote.folder_id
        ? folderPathLookup.get(availableNote.folder_id)?.toLowerCase() ?? ''
        : ''
      return folderPath.includes(query)
    })
  }, [folderPathLookup, notePickerSearch, projectLookup, selectableNotes])

  const groupedSelectableNotes = useMemo((): ContextProjectGroup[] => {
    if (filteredSelectableNotes.length === 0) return []

    const notesByFolderId = new Map<string, NoteSummary[]>()
    const rootNotesByProjectId = new Map<string | null, NoteSummary[]>()

    for (const availableNote of filteredSelectableNotes) {
      const hasKnownFolder = !!availableNote.folder_id && folderIdSet.has(availableNote.folder_id)

      if (availableNote.folder_id && hasKnownFolder) {
        appendMapValue(notesByFolderId, availableNote.folder_id, availableNote)
        continue
      }

      appendMapValue(rootNotesByProjectId, availableNote.project_id ?? null, availableNote)
    }

    const groups: ContextProjectGroup[] = []

    const appendProjectGroup = (projectId: string | null, label: string, color?: string | null) => {
      const notes = sortNotesByTitle(rootNotesByProjectId.get(projectId) ?? [])
      const folders = buildContextFolderGroups(
        folderTree.filter(folder => folder.project_id === projectId),
        notesByFolderId
      )

      if (notes.length === 0 && folders.length === 0) {
        return
      }

      groups.push({
        key: projectId ?? '__UNFILED__',
        label,
        color: color ?? null,
        notes,
        folders,
      })
    }

    projects.forEach(project => {
      appendProjectGroup(project.id, project.name, project.color)
    })

    const unknownProjectIds = Array.from(
      new Set(
        filteredSelectableNotes
          .map(availableNote => availableNote.project_id)
          .filter((projectId): projectId is string => !!projectId && !projectLookup.has(projectId))
      )
    ).sort()

    unknownProjectIds.forEach(projectId => {
      appendProjectGroup(projectId, 'Unknown Project', null)
    })

    appendProjectGroup(null, 'Unfiled', null)

    return groups
  }, [filteredSelectableNotes, folderIdSet, folderTree, projectLookup, projects])

  // Bodies for explicitly selected context notes are fetched on demand and
  // cached in this map; the full workspace list stays metadata-only.
  useEffect(() => {
    const ids = selectedNoteIds.filter(id => id !== note?.id)
    const missing = ids.filter(id => !selectedNoteBodies[id])
    if (missing.length === 0) return

    let cancelled = false
    void getNotesByIds(missing)
      .then(notes => {
        if (cancelled || notes.length === 0) return
        setSelectedNoteBodies(prev => {
          const next = { ...prev }
          for (const loaded of notes) next[loaded.id] = loaded
          return next
        })
      })
      .catch(err => {
        console.error('Failed to load selected note context:', err)
      })

    return () => {
      cancelled = true
    }
  }, [selectedNoteIds, selectedNoteBodies, note?.id])

  const selectedAdditionalNotes = useMemo(() => {
    if (selectedNoteIds.length === 0) return []
    return selectedNoteIds
      .filter(id => id !== note?.id)
      .map(id => selectedNoteBodies[id])
      .filter((loaded): loaded is Note => !!loaded)
      .slice(0, contextLimits.maxSelectedNotes)
  }, [contextLimits.maxSelectedNotes, note?.id, selectedNoteBodies, selectedNoteIds])

  const contextDiagnostics = useMemo(() => {
    const noteCaps = contextLimits
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
      nearLimit: remaining < Math.floor(noteCaps.maxTotalInjectedChars * 0.2),
      exhausted: remaining === 0,
    }
  }, [contextLimits, includeCurrentNote, note, noteContent, selectedAdditionalNotes, selectedNoteIds.length])

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
    chatHistoryRef.current = c.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      reasoning_content: msg.reasoning,
    }))
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
        const summary = noteId
          ? allNotes.find(n => n.id === noteId)
          : noteTitle
            ? allNotes.find(n => n.title?.toLowerCase().includes(noteTitle.toLowerCase()))
            : undefined
        if (!summary) return `Note not found. Available: ${allNotes.map(n => n.title || 'Untitled').join(', ')}`

        let targetNote: Note | null
        try {
          targetNote = note?.id === summary.id ? note : await getNote(summary.id)
        } catch {
          return `Could not load "${summary.title || 'Untitled'}". The note body is not available offline.`
        }
        if (!targetNote) return `Could not load the note "${summary.title || 'Untitled'}".`

        const fullContent = stripHtmlForAI(targetNote.content || '')
        const limited = truncateAtBoundary(fullContent, contextLimits.readNoteToolChars)
        const wasTruncated = limited.length < fullContent.length
        return `Note: "${targetNote.title || 'Untitled'}"\nType: ${targetNote.note_type || 'rich-text'}\n\nContent:\n${limited}${wasTruncated ? '\n\n...[truncated for context window]' : ''}`
      }
      case 'search_notes': {
        const rawQuery = ((args.query as string) || '').trim()
        const query = rawQuery.toLowerCase()
        const requestedMax = Number(args.maxResults)
        const maxResults = Number.isFinite(requestedMax)
          ? Math.max(1, Math.min(Math.floor(requestedMax), contextLimits.searchMaxResultsHard))
          : contextLimits.searchMaxResultsDefault
        if (!query) return 'No search query provided.'
        if (!allNotes?.length) return 'No notes available to search.'

        // Search runs server-side (limited/projected) with an offline cache
        // fallback, instead of scanning every note body held in memory.
        let matches: Note[]
        try {
          matches = await searchNotes(rawQuery, { limit: maxResults })
        } catch {
          return `Search is unavailable offline and no cached notes matched "${query}".`
        }
        if (matches.length === 0) return `No notes found matching "${query}".`

        const excerpts = matches.slice(0, maxResults).map(n => {
          const c = stripHtmlForAI(n.content || '')
          const excerpt = truncateAtBoundary(c, contextLimits.searchExcerptChars)
          return `- "${n.title || 'Untitled'}": ${excerpt}${excerpt.length < c.length ? '...' : ''}`
        })
        return `Found ${matches.length} note(s) matching "${query}". Showing top ${Math.min(maxResults, matches.length)}:\n${excerpts.join('\n\n')}`
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
          const summary = noteId && allNotes?.length
            ? allNotes.find(n => n.id === noteId)
            : noteTitle && allNotes?.length
              ? allNotes.find(n => (n.title || '').toLowerCase().includes(noteTitle.toLowerCase()))
              : undefined

          let targetNote: Note | null
          try {
            targetNote = summary
              ? (note?.id === summary.id ? note : await getNote(summary.id))
              : (note ?? null)
          } catch {
            return 'That note is not available offline. Open it once while connected to cache its body.'
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
  }, [allNotes, contextLimits, note, noteContent, onCreateMindmapNote, onReplaceText])

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
    let updatedConversation: AIMessage[] | null = null

    try {
      setMessages(prev => [...prev, {
        id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true,
      }])

      await chat(
        userMessage.content,
        aiContext,
        chatHistoryRef.current.slice(0, -1),
        (token) => { fullResponse += token; setStreamingContent(fullResponse) },
        allNotes?.length ? handleToolCall : undefined,
        (token) => { reasoningContent += token; setStreamingReasoning(prev => prev + token) },
        (conversation) => { updatedConversation = conversation },
      )

      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? { ...msg, content: fullResponse, reasoning: reasoningContent || undefined, isStreaming: false }
          : msg
      ))

      chatHistoryRef.current = updatedConversation || [
        ...chatHistoryRef.current,
        { role: 'assistant', content: fullResponse, reasoning_content: reasoningContent || undefined },
      ]
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
              reasoning: msg.reasoning_content || (isLastAssistant && reasoningContent ? reasoningContent : undefined),
              model: isLastAssistant ? AI_MODEL : undefined,
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
          chatHistoryRef.current = [
            ...chatHistoryRef.current,
            { role: 'assistant', content: fullResponse, reasoning_content: reasoningContent || undefined },
          ]
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
  }, [inputValue, isLoading, aiContext, allNotes, handleToolCall, currentChatId, note?.id, mapAIErrorToUserMessage, refreshRateLimitSnapshot, hasNoteContextConsent])

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

  // Inner dialogs own Escape while open so the host's panel-level handler
  // does not close the whole assistant underneath them.
  useEffect(() => {
    if (!showMindmapPromptModal && !showNoteContextConsentModal) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()

      if (showMindmapPromptModal) {
        if (isLoading) return
        setShowMindmapPromptModal(false)
        setPendingMindmapPayload(null)
        setMindmapPromptInput('')
        return
      }

      handleCancelNoteContextConsent()
    }

    window.addEventListener('keydown', handleEscape, true)
    return () => window.removeEventListener('keydown', handleEscape, true)
  }, [
    showMindmapPromptModal,
    showNoteContextConsentModal,
    isLoading,
    handleCancelNoteContextConsent,
  ])

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

  const pendingTaskCount = useMemo(() => {
    if (taskStats) return taskStats.todo + taskStats.in_progress + taskStats.overdue
    return tasks?.filter(task => task.status !== 'completed' && task.status !== 'cancelled').length ?? 0
  }, [taskStats, tasks])

  const upcomingEventCount = events?.length ?? 0
  const workspaceNoteCount = allNotes?.length ?? (note ? 1 : 0)
  const activeContextSources = (includeCurrentNote && note ? 1 : 0) + selectedAdditionalNotes.length + (selectedText?.trim() ? 1 : 0)

  const selectedTextPreview = useMemo(() => {
    const normalized = selectedText?.replace(/\s+/g, ' ').trim()
    return normalized ? truncateAtBoundary(normalized, 84) : null
  }, [selectedText])

  const currentNotePlainText = useMemo(() => {
    if (!note) return ''
    return noteContent ? stripHtmlForAI(noteContent) : stripHtmlForAI(note.content || '')
  }, [note, noteContent])

  function renderSelectableNote(availableNote: NoteSummary, index: number) {
    const isSelected = selectedNoteIds.includes(availableNote.id)
    const selectionLimitReached = !isSelected && selectedNoteIds.length >= contextLimits.maxSelectedNotes

    return (
      <button
        key={availableNote.id}
        onClick={() => setSelectedNoteIds(prev =>
          prev.includes(availableNote.id)
            ? prev.filter(id => id !== availableNote.id)
            : prev.length >= contextLimits.maxSelectedNotes
              ? prev
              : [...prev, availableNote.id]
        )}
        disabled={selectionLimitReached}
        className={[
          'assistant-soft-pop flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left transition-colors duration-150',
          isSelected
            ? 'bg-[var(--accent-light)]'
            : selectionLimitReached
              ? 'cursor-not-allowed opacity-50'
              : 'hover:bg-[var(--surface-hover)]',
        ].join(' ')}
        style={{ animationDelay: (160 + Math.min(index, 5) * 25) + 'ms' }}
      >
        <span
          className={[
            'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150',
            isSelected
              ? 'border-transparent bg-[var(--accent)] text-accent-foreground'
              : 'border-[var(--border-strong)] text-transparent',
          ].join(' ')}
        >
          <Check size={10} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium leading-4 text-foreground">
            {availableNote.title || 'Untitled'}
          </span>
          <span className="mt-0.5 block text-[10px] text-muted">{availableNote.note_type || 'note'}</span>
        </span>
      </button>
    )
  }

  function renderContextFolderGroup(folderGroup: ContextFolderGroup, depth = 0) {
    const totalNotes = countNotesInFolderGroup(folderGroup)

    return (
      <div key={folderGroup.folder.id} className="space-y-1">
        <div
          className="flex items-center gap-1.5 text-[10px] font-medium text-muted"
          style={{ paddingLeft: (depth * 12) + 'px' }}
        >
          <FolderOpen size={11} className="shrink-0" />
          <span className="truncate">{folderGroup.folder.name}</span>
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--surface-active)] px-1 text-[9px] font-semibold text-muted">
            {totalNotes}
          </span>
        </div>

        <div
          className="space-y-0.5 border-l border-[var(--border)] pl-2"
          style={{ marginLeft: (depth * 12) + 'px' }}
        >
          {folderGroup.notes.map((availableNote, noteIndex) => renderSelectableNote(availableNote, noteIndex))}
          {folderGroup.children.map((childGroup) => renderContextFolderGroup(childGroup, depth + 1))}
        </div>
      </div>
    )
  }

  const contextUsagePercent = useMemo(() => {
    return Math.min(
      100,
      Math.round((contextDiagnostics.totalIncludedChars / Math.max(1, contextLimits.maxTotalInjectedChars)) * 100),
    )
  }, [contextDiagnostics.totalIncludedChars, contextLimits.maxTotalInjectedChars])

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {isLoadingHistory ? (
          <div className="space-y-2 p-3">
            <span className="sr-only">Loading conversations…</span>
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-sunken)] p-3"
              >
                <div className="flex items-center gap-2.5">
                  <div className="skeleton-shimmer h-7 w-7 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="skeleton-shimmer h-2.5 w-1/2 rounded-full" />
                    <div className="skeleton-shimmer h-2 w-3/4 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : chatHistory.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center px-8 py-16">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-2xl bg-[var(--accent-glow)] opacity-50 blur-xl" aria-hidden />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--accent-light)] text-accent shadow-[inset_0_1px_0_var(--glass-highlight)]">
                <MessageSquare size={20} strokeWidth={1.8} />
              </div>
            </div>
            <p className="text-[13px] font-medium text-foreground">No conversations yet</p>
            <p className="mt-1 text-center text-[11px] leading-5 text-muted">
              Your AI conversations will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-1 p-2.5">
            {chatHistory.map((c, index) => {
              const isActive = currentChatId === c.id
              return (
                <div
                  key={c.id}
                  className={[
                    'assistant-soft-pop glass-row group relative rounded-xl px-2 py-2',
                    isActive ? 'is-active' : '',
                  ].join(' ')}
                  style={{ animationDelay: (Math.min(index, 6) * 45) + 'ms' }}
                >
                  <button
                    onClick={() => loadChat(c)}
                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                    type="button"
                  >
                    <span
                      className={[
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                        isActive
                          ? 'bg-[var(--accent-light)] text-accent'
                          : 'bg-[var(--surface-sunken)] text-muted',
                      ].join(' ')}
                    >
                      <MessageSquare size={13} strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-foreground">
                        {c.title}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-5 text-muted">
                        {truncateAtBoundary(c.messages[c.messages.length - 1]?.content || 'Open this conversation to continue where you left off.', 120)}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-[10px] text-muted">
                        <span>{c.messages.length} messages</span>
                        <span aria-hidden>·</span>
                        <span>{new Date(c.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={(e) => handleDeleteChat(c.id, e)}
                    className="glass-btn-ghost ml-1 h-7 w-7 shrink-0 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100"
                    title="Delete"
                    type="button"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-[var(--border)] p-3">
        <button
          onClick={startNewChat}
          className="glass-btn-primary h-9 w-full justify-center gap-2 text-[12px]"
          type="button"
        >
          <Plus size={14} />
          New Conversation
        </button>
      </div>
    </div>
  )

  // ─── QUICK ACTIONS ─────────────────────────────────────────────────────────

  const renderQuickActions = () => {
    const noteActions: { action: QuickAction; icon: React.ReactNode; label: string; description: string }[] = [
      { action: 'summarize', icon: <FileText size={14} />, label: 'Summarize note', description: 'Pull out the key ideas, decisions, and likely next steps.' },
      { action: 'improve-writing', icon: <Wand2 size={14} />, label: 'Improve writing', description: 'Strengthen clarity, rhythm, and readability without changing intent.' },
      { action: 'fix-grammar', icon: <Check size={14} />, label: 'Fix grammar', description: 'Correct grammar, punctuation, and phrasing issues in place.' },
      { action: 'make-concise', icon: <RefreshCw size={14} />, label: 'Make concise', description: 'Compress the note while keeping the important information.' },
    ]
    const selectionActions: { action: QuickAction; icon: React.ReactNode; label: string; description: string }[] = [
      { action: 'explain-selection', icon: <HelpCircle size={14} />, label: 'Explain selection', description: 'Clarify the chosen text and unpack dense or technical ideas.' },
      { action: 'improve-selection', icon: <Wand2 size={14} />, label: 'Improve selection', description: 'Rewrite the highlighted passage with better flow and precision.' },
      { action: 'simplify-selection', icon: <Type size={14} />, label: 'Simplify selection', description: 'Reduce complexity and make the selected text easier to understand.' },
      { action: 'translate-selection', icon: <Languages size={14} />, label: 'Translate selection', description: 'Translate the current selection while preserving meaning.' },
    ]
    const writingActions: { action: QuickAction; icon: React.ReactNode; label: string; description: string; show: boolean }[] = [
      { action: 'continue-writing', icon: <PenLine size={14} />, label: 'Continue writing', description: 'Extend the current note in the same tone and direction.', show: !!note },
      { action: 'expand', icon: <ArrowRight size={14} />, label: 'Expand ideas', description: 'Add detail, examples, and missing considerations to the note.', show: !!note },
    ]
    const otherActions: { action: QuickAction; icon: React.ReactNode; label: string; description: string; show: boolean }[] = [
      { action: 'suggest-tasks', icon: <CheckSquare size={14} />, label: 'Suggest tasks', description: 'Extract action items, owners, and likely priorities from context.', show: true },
      { action: 'suggest-events', icon: <Calendar size={14} />, label: 'Suggest events', description: 'Turn planning details into candidate calendar entries.', show: true },
      { action: 'mindmap-ideas', icon: <Network size={14} />, label: 'Mindmap ideas', description: 'Branch from the selected node with related subtopics and children.', show: !!mindmapData },
      { action: 'create-mindmap-note', icon: <Network size={14} />, label: 'Create mindmap note', description: 'Generate a fresh mindmap note from the current material.', show: !!onCreateMindmapNote },
    ]

    const hasSelection = !!(selectedText?.trim())

    const sections = [
      hasSelection ? {
        title: 'Selection Actions',
        description: 'Operate directly on the highlighted text.',
        highlight: true,
        items: selectionActions,
      } : null,
      {
        title: 'Writing Actions',
        description: 'Shape the current note and continue the draft.',
        highlight: false,
        items: [...writingActions.filter(a => a.show), ...(note ? noteActions : [])],
      },
      {
        title: 'Workspace Actions',
        description: 'Convert note context into tasks, events, and maps.',
        highlight: false,
        items: otherActions.filter(a => a.show),
      },
    ].filter((section): section is { title: string; description: string; highlight: boolean; items: Array<{ action: QuickAction; icon: React.ReactNode; label: string; description: string }> } => !!section && section.items.length > 0)

    if (!showQuickActions) return null

    return (
      <div className="assistant-rise-in shrink-0 border-b border-[var(--border)] bg-[var(--surface-sunken)]">
        <div className="flex items-center justify-between gap-3 px-3.5 pb-1 pt-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            <Zap size={11} className="text-accent" strokeWidth={1.9} />
            Quick actions
          </div>
          <button
            onClick={() => setShowQuickActions(false)}
            className="glass-btn-ghost -mr-1 h-6 w-6"
            title="Hide quick actions"
            type="button"
          >
            <X size={13} />
          </button>
        </div>

        <div className="scroll-thin max-h-[38vh] space-y-2.5 overflow-y-auto px-3.5 pb-3 pt-1">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                {section.highlight ? (
                  <MousePointerClick size={10} className="text-accent" />
                ) : (
                  <Sparkles size={10} className="text-accent" />
                )}
                {section.title}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {section.items.map(({ action, icon, label, description }) => (
                  <button
                    key={action}
                    onClick={() => { handleQuickAction(action); setShowQuickActions(false) }}
                    disabled={isLoading || !isConfigured}
                    title={description}
                    className={[
                      'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-left text-[11.5px] font-medium transition-colors duration-150',
                      'disabled:cursor-not-allowed disabled:opacity-40',
                      section.highlight
                        ? 'border-transparent bg-[var(--accent-light)] text-accent hover:brightness-105'
                        : 'border-[var(--border)] bg-[var(--surface)] text-foreground hover:bg-[var(--surface-hover)]',
                    ].join(' ')}
                    type="button"
                  >
                    <span className="shrink-0">{icon}</span>
                    <span className="min-w-0 truncate">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── SUGGESTIONS PANEL ─────────────────────────────────────────────────────

  const renderSuggestions = () => {
    if (!showSuggestions) return null
    const cardClass = 'assistant-soft-pop glass rounded-2xl p-3'
    const labelClass = 'flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted'
    const rowClass = 'rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-2.5'

    return (
      <div className="scroll-thin max-h-[40%] shrink-0 overflow-y-auto border-b border-[var(--border)] bg-[var(--surface-sunken)]">
        <div className="p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-accent" strokeWidth={1.9} />
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Suggestions</span>
            </div>
            <button
              onClick={() => { setSuggestions({}); setShowSuggestions(false) }}
              className="glass-btn-ghost -mr-1 h-6 w-6"
              type="button"
            >
              <X size={13} />
            </button>
          </div>

          <div className="space-y-2">
            {suggestions.summary && (
              <div className={cardClass} style={{ animationDelay: '40ms' }}>
                <div className={labelClass + ' mb-2'}>
                  <FileText size={10} className="text-accent" /> Summary
                </div>
                <p className="text-[12.5px] leading-5 text-foreground">{suggestions.summary.summary}</p>
                {suggestions.summary.keyPoints.length > 0 && (
                  <div className="mt-2.5 border-t border-[var(--border)] pt-2.5">
                    <div className={labelClass + ' mb-2'}>Key Points</div>
                    <ul className="space-y-1.5">
                      {suggestions.summary.keyPoints.map((point, i) => (
                        <li key={i} className="flex gap-2 text-[12px] leading-5 text-foreground">
                          <span className="mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-light)] text-[10px] font-semibold text-accent">
                            {i + 1}
                          </span>
                          <span className="min-w-0">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {suggestions.summary.suggestedTasks && suggestions.summary.suggestedTasks.length > 0 && (
                  <div className="mt-2.5 border-t border-[var(--border)] pt-2.5">
                    <div className={labelClass + ' mb-1.5'}>Suggested Tasks</div>
                    <div className="space-y-0.5">
                      {suggestions.summary.suggestedTasks.map((task, i) => (
                        <button
                          key={i}
                          onClick={() => handleApplyTask({ title: task })}
                          className="glass-row flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-foreground"
                          type="button"
                        >
                          <Plus size={11} className="shrink-0 text-accent" />
                          <span className="min-w-0 flex-1 truncate">{task}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {suggestions.tasks && suggestions.tasks.length > 0 && (
              <div className={cardClass} style={{ animationDelay: '80ms' }}>
                <div className={labelClass + ' mb-2'}>
                  <CheckSquare size={10} className="text-accent" /> Task Suggestions
                </div>
                <div className="space-y-1.5">
                  {suggestions.tasks.map((task, i) => (
                    <div key={i} className={rowClass + ' flex items-start justify-between gap-2.5'}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium leading-5 text-foreground">{task.title}</div>
                        {task.description && (
                          <div className="mt-0.5 text-[11px] leading-5 text-muted">{task.description}</div>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {task.priority && (
                            <span
                              className={[
                                'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]',
                                task.priority === 'urgent'
                                  ? 'bg-[var(--danger-light)] text-danger'
                                  : task.priority === 'high'
                                    ? 'bg-[var(--warning-light)] text-warning'
                                    : task.priority === 'low'
                                      ? 'bg-[var(--surface-active)] text-muted'
                                      : 'bg-[var(--accent-light)] text-accent',
                              ].join(' ')}
                            >
                              {task.priority}
                            </span>
                          )}
                          {task.dueDate && <span className="text-[10px] text-muted">{task.dueDate}</span>}
                        </div>
                      </div>
                      {onCreateTask && (
                        <button
                          onClick={() => handleApplyTask(task)}
                          className="glass-btn-primary h-7 shrink-0 px-2.5 text-[10px]"
                          type="button"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {suggestions.events && suggestions.events.length > 0 && (
              <div className={cardClass} style={{ animationDelay: '120ms' }}>
                <div className={labelClass + ' mb-2'}>
                  <Calendar size={10} className="text-accent" /> Event Suggestions
                </div>
                <div className="space-y-1.5">
                  {suggestions.events.map((event, i) => (
                    <div key={i} className={rowClass + ' flex items-start justify-between gap-2.5'}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium leading-5 text-foreground">{event.title}</div>
                        {event.description && (
                          <div className="mt-0.5 text-[11px] leading-5 text-muted">{event.description}</div>
                        )}
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted">
                          {event.suggestedDate && <span>{event.suggestedDate}</span>}
                          {event.duration && <span>({event.duration} min)</span>}
                        </div>
                      </div>
                      {onCreateEvent && event.suggestedDate && (
                        <button
                          onClick={() => handleApplyEvent(event)}
                          className="glass-btn-primary h-7 shrink-0 px-2.5 text-[10px]"
                          type="button"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {suggestions.mindmap && suggestions.mindmap.length > 0 && (
              <div className={cardClass} style={{ animationDelay: '160ms' }}>
                <div className={labelClass + ' mb-2'}>
                  <Network size={10} className="text-accent" /> Mindmap Ideas
                </div>
                <div className="space-y-1.5">
                  {suggestions.mindmap.map((suggestion, i) => (
                    <div key={i} className={rowClass + ' flex items-start justify-between gap-2.5'}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium leading-5 text-foreground">{suggestion.nodeText}</div>
                        {suggestion.description && (
                          <div className="mt-0.5 text-[11px] leading-5 text-muted">{suggestion.description}</div>
                        )}
                        {suggestion.childSuggestions && suggestion.childSuggestions.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {suggestion.childSuggestions.map((child, j) => (
                              <span key={j} className="rounded-full bg-[var(--surface-active)] px-2 py-0.5 text-[10px] text-muted">
                                {child}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {onAddMindmapNode && (
                        <button
                          onClick={() => handleApplyMindmapNode(suggestion)}
                          className="glass-btn-primary h-7 shrink-0 px-2.5 text-[10px]"
                          type="button"
                        >
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
    const labelClass = 'mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted'
    return (
      <div className="space-y-4">
        {parsed.summary && (
          <div>
            <div className={labelClass}>
              <FileText size={10} className="text-accent" /> Summary
            </div>
            <p className="text-[12.5px] leading-5 text-foreground">{parsed.summary}</p>
          </div>
        )}
        {parsed.keyPoints && parsed.keyPoints.length > 0 && (
          <div>
            <div className={labelClass}>
              <Lightbulb size={10} className="text-accent" /> Key Points
            </div>
            <ul className="space-y-2">
              {parsed.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-[12.5px] leading-5 text-foreground">
                  <span className="mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-accent-gradient text-[10px] font-semibold text-accent-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 leading-5">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {parsed.suggestedTasks && parsed.suggestedTasks.length > 0 && (
          <div>
            <div className={labelClass}>
              <CheckSquare size={10} className="text-accent" /> Suggested Tasks
            </div>
            <ul className="space-y-1">
              {parsed.suggestedTasks.map((task, i) => (
                <li key={i} className="group flex items-start gap-1.5">
                  <div className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] px-2.5 py-2 text-[12px] leading-5 text-foreground">
                    {task}
                  </div>
                  {onCreateTask && (
                    <button
                      onClick={() => handleApplyTask({ title: task })}
                      className="glass-btn-ghost h-7 w-7 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                      title="Add as task"
                      type="button"
                    >
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
    const starterPrompts = [
      {
        prompt: selectedText?.trim() ? 'Explain this selection' : 'Summarize this note',
        title: selectedText?.trim() ? 'Explain the selected text' : 'Summarize the current note',
        icon: <HelpCircle size={14} />,
        tint: 'bg-[var(--accent-light)] text-accent',
      },
      {
        prompt: 'Help me brainstorm ideas',
        title: 'Brainstorm directions',
        icon: <Lightbulb size={14} />,
        tint: 'bg-[var(--warning-light)] text-warning',
      },
      {
        prompt: 'Create a task list',
        title: 'Turn notes into actions',
        icon: <CheckSquare size={14} />,
        tint: 'bg-[var(--accent-light)] text-accent',
      },
      {
        prompt: 'Build a mindmap from this',
        title: 'Map the structure',
        icon: <Network size={14} />,
        tint: 'bg-[var(--accent-light)] text-accent',
      },
    ]

    return (
      <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="m-auto w-full px-4 pb-6 pt-7">
          <div className="assistant-rise-in flex flex-col items-center text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-2xl bg-[var(--accent-glow)] opacity-70 blur-2xl" aria-hidden />
              <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--accent-light)] text-accent shadow-[inset_0_1px_0_var(--glass-highlight)]">
                <Sparkles size={22} strokeWidth={1.7} />
              </div>
            </div>
            <h3 className="font-display text-[21px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
              How can I help <span className="text-gradient">with this note?</span>
            </h3>
            <p className="mt-2 max-w-[34ch] text-[12px] leading-5 text-muted">
              {isConfigured
                ? AI_MODEL_SHORT_LABEL + ' with thinking is ready — it can read note context, rewrite text, create tasks, or turn ideas into a mindmap.'
                : 'Add a DeepSeek API key to your environment to unlock note search, drafting, summarization, and structured AI actions.'}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            {note && (
              <span className="glass-round inline-flex h-6 items-center gap-1.5 border border-[var(--border)] bg-[var(--surface-sunken)] px-2.5 text-[10.5px] text-muted">
                <FileText size={10} className="text-accent" />
                <span className="max-w-[130px] truncate">{note.title || 'Untitled'}</span>
              </span>
            )}
            <span className="glass-round inline-flex h-6 items-center gap-1.5 border border-[var(--border)] bg-[var(--surface-sunken)] px-2.5 text-[10.5px] text-muted">
              <BookOpen size={10} className="text-accent" />
              {workspaceNoteCount} note{workspaceNoteCount === 1 ? '' : 's'}
            </span>
            <span className="glass-round inline-flex h-6 items-center gap-1.5 border border-[var(--border)] bg-[var(--surface-sunken)] px-2.5 text-[10.5px] text-muted">
              <CheckSquare size={10} className="text-accent" />
              {pendingTaskCount} active task{pendingTaskCount === 1 ? '' : 's'}
            </span>
            <span className="glass-round inline-flex h-6 items-center gap-1.5 border border-[var(--border)] bg-[var(--surface-sunken)] px-2.5 text-[10.5px] text-muted">
              <Calendar size={10} className="text-accent" />
              {upcomingEventCount} upcoming event{upcomingEventCount === 1 ? '' : 's'}
            </span>
            {activeContextSources > 0 && (
              <span className="glass-round inline-flex h-6 items-center gap-1.5 bg-[var(--accent-light)] px-2.5 text-[10.5px] font-medium text-accent">
                <MousePointerClick size={10} />
                {activeContextSources} attached
              </span>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1">
              <kbd className="kbd">{formatModShortcut('J')}</kbd>
              toggle this panel
            </span>
            <span aria-hidden className="opacity-40">·</span>
            <span className="inline-flex items-center gap-1">
              <kbd className="kbd">{formatModShortcut('K')}</kbd>
              search everything
            </span>
          </div>

          {!isConfigured ? (
            <div className="assistant-soft-pop mt-5 rounded-2xl bg-[var(--warning-light)] p-3.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)] text-warning">
                  <AlertCircle size={15} />
                </span>
                <div className="min-w-0">
                  <h4 className="text-[12.5px] font-semibold text-foreground">AI is not configured yet</h4>
                  <p className="mt-1 text-[11px] leading-5 text-muted">
                    Set DEEPSEEK_API_KEY in your app environment, then reopen the assistant.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between px-0.5">
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Try asking</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
                {starterPrompts.map((suggestion) => (
                  <button
                    key={suggestion.prompt}
                    onClick={() => void handleSend(suggestion.prompt)}
                    className="glass-card hover-lift group flex h-full min-h-[66px] items-center gap-2 rounded-2xl p-2.5 text-left"
                    type="button"
                  >
                    <span className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ' + suggestion.tint}>
                      {suggestion.icon}
                    </span>
                    <span className="min-w-0 flex-1 text-[12px] font-medium leading-4 text-foreground">
                      {suggestion.title}
                    </span>
                    <ArrowRight
                      size={13}
                      className="shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── MESSAGES ──────────────────────────────────────────────────────────────

  const renderMessages = () => (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {messages.length === 0 ? (
        renderWelcome()
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent_0px,black_14px)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0px,black_14px)]">
          <div className="space-y-3.5 px-3.5 pb-5 pt-4">
            {messages.map((message, index) => {
              const parsed = message.role === 'assistant' && !message.isStreaming
                ? parseAIResponse(message.content) : null
              const isUser = message.role === 'user'
              const timeLabel = message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

              return (
                <div
                  key={message.id}
                  className={'assistant-rise-in group ' + (isUser ? 'flex justify-end' : 'flex items-start gap-2.5')}
                  style={{ animationDelay: (Math.min(index, 8) * 30) + 'ms' }}
                >
                  {!isUser && <AssistantMark size={24} radius={999} className="mt-0.5" />}

                  <div className={'min-w-0 ' + (isUser ? 'flex max-w-[88%] flex-col items-end' : 'flex min-w-0 flex-1 flex-col items-start')}>
                    <div className={'mb-1 flex items-center gap-1.5 px-0.5 ' + (isUser ? 'justify-end' : '')}>
                      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted opacity-60">
                        {isUser ? 'You' : 'Assistant'}
                      </span>
                      <span
                        className={
                          isUser
                            ? 'text-[10px] text-muted opacity-60'
                            : 'text-[10px] text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-60'
                        }
                      >
                        {timeLabel}
                      </span>
                    </div>

                    {isUser ? (
                      <div
                        className="rounded-3xl rounded-br-lg px-4 py-2.5 text-[13px] leading-relaxed shadow-[0_16px_32px_-18px_var(--accent-glow)]"
                        style={{ background: 'var(--accent-gradient)', color: 'var(--accent-foreground)' }}
                      >
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      </div>
                    ) : message.isStreaming ? (
                      <div className="w-full">
                        {streamingContent ? (
                          <div className="w-full rounded-2xl rounded-tl-md border border-[var(--border)] bg-[var(--glass-bg-subtle)] px-3.5 py-3 backdrop-blur-sm">
                            <MarkdownContent content={streamingContent} />
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--glass-bg-subtle)] px-3.5 py-2">
                            <TypingDots />
                            <span className="animate-pulse-soft text-[12px] font-medium text-muted">
                              {streamingReasoning ? 'Thinking deeply…' : 'Thinking…'}
                            </span>
                          </div>
                        )}
                        {streamingReasoning && (
                          <div className="mt-2 w-full">
                            <LiveReasoning text={streamingReasoning} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full rounded-2xl rounded-tl-md border border-[var(--border)] bg-[var(--glass-bg-subtle)] px-3.5 py-3 backdrop-blur-sm">
                        {parsed ? (
                          <>
                            {message.reasoning && <ThinkingSection reasoning={message.reasoning} />}
                            {renderStructuredContent(parsed)}
                          </>
                        ) : (
                          <>
                            {message.reasoning && <ThinkingSection reasoning={message.reasoning} />}
                            <MarkdownContent content={message.content} />
                          </>
                        )}
                      </div>
                    )}

                    {!isUser && !message.isStreaming && (
                      <div className="pointer-events-none mt-1.5 flex items-center gap-0.5 self-start rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5 opacity-0 shadow-[var(--glass-shadow-sm)] transition-[opacity,transform] duration-200 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
                        <button
                          onClick={() => handleCopy(message.content, message.id)}
                          className="glass-btn-ghost h-6 w-6"
                          title="Copy"
                          type="button"
                        >
                          {copiedId === message.id ? <Check size={11} className="text-accent" /> : <Copy size={11} />}
                        </button>
                        {onInsertText && (
                          <button
                            onClick={() => handleInsertToNote(message.content)}
                            className="glass-btn-ghost h-6 w-6"
                            title="Append to note"
                            type="button"
                          >
                            <FileText size={11} />
                          </button>
                        )}
                        {onInsertAtCursor && (
                          <button
                            onClick={() => handleInsertAtCursorPosition(message.content)}
                            className="glass-btn-ghost h-6 w-6"
                            title="Insert at cursor"
                            type="button"
                          >
                            <PenLine size={11} />
                          </button>
                        )}
                        {selectedText && onReplaceSelection && (
                          <button
                            onClick={() => handleReplaceSelectionWithResponse(message.content)}
                            className="glass-btn-ghost h-6 w-6"
                            title="Replace selection"
                            type="button"
                          >
                            <ArrowRight size={11} />
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
        </div>
      )}
    </div>
  )
  // ─── CONTEXT SIDEBAR ───────────────────────────────────────────────────────

  const renderContextSidebar = (mode: 'docked' | 'overlay' = 'docked') => {
    const isOverlay = mode === 'overlay'
    const diagnosticsLabel = contextDiagnostics.exhausted
      ? 'Context full'
      : contextDiagnostics.nearLimit
        ? 'Near limit'
        : 'Healthy budget'
    const usageBarClassName = contextDiagnostics.exhausted
      ? 'bg-danger'
      : contextDiagnostics.nearLimit
        ? 'bg-warning'
        : 'bg-accent'
    const insetCardClass = 'rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] px-2.5 py-2'
    const labelClass = 'flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted'

    const sidebarPanel = (
      <aside
        className={[
          'flex h-full w-[320px] max-w-[88vw] flex-col',
          isOverlay
            ? 'glass-strong rounded-l-3xl rounded-r-none shadow-glass-lg'
            : 'border-l border-[var(--border)] bg-[var(--surface-sunken)]',
        ].join(' ')}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-3.5 py-3">
          <div className="min-w-0">
            <div className="font-display text-[13px] font-semibold leading-tight text-foreground">Context</div>
            <div className="mt-0.5 text-[10.5px] leading-4 text-muted">
              {activeContextSources} source{activeContextSources === 1 ? '' : 's'} attached to the next message
            </div>
          </div>
          <button
            onClick={() => setShowContextSidebar(false)}
            className="glass-btn-ghost -mr-1 h-7 w-7"
            title="Hide context sidebar"
            type="button"
          >
            <X size={13} />
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
          {selectedTextPreview && (
            <div className={insetCardClass}>
              <div className={labelClass}>
                <MousePointerClick size={10} className="text-accent" />
                Selection
              </div>
              <p className="mt-1.5 line-clamp-3 text-[11px] leading-5 text-foreground">“{selectedTextPreview}”</p>
            </div>
          )}

          {aiContext.mindmapData?.selectedNodeText && (
            <div className={insetCardClass}>
              <div className={labelClass}>
                <Network size={10} className="text-accent" />
                Mindmap node
              </div>
              <p className="mt-1 truncate text-[11px] font-medium text-foreground">
                {aiContext.mindmapData.selectedNodeText}
              </p>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)]">
            {note ? (
              <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-2.5 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[11.5px] font-medium text-foreground">{note.title || 'Untitled'}</div>
                  <div className="mt-0.5 text-[10px] text-muted">
                    Current note · {currentNotePlainText.length.toLocaleString()} chars
                  </div>
                </div>
                <button
                  onClick={() => setIncludeCurrentNote(value => !value)}
                  className={[
                    'inline-flex h-6 flex-shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-medium transition-colors duration-150',
                    includeCurrentNote
                      ? 'bg-[var(--accent-light)] text-accent'
                      : 'border border-[var(--border)] text-muted hover:text-foreground',
                  ].join(' ')}
                  type="button"
                >
                  {includeCurrentNote ? <Check size={10} /> : <Plus size={10} />}
                  {includeCurrentNote ? 'Included' : 'Add'}
                </button>
              </div>
            ) : (
              <div className="border-b border-[var(--border)] px-2.5 py-2 text-[11px] text-muted">No note open</div>
            )}

            <div className="px-2.5 pb-2.5 pt-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Additional notes</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted">{selectedNoteIds.length}/{contextLimits.maxSelectedNotes}</span>
                  {selectedNoteIds.length > 0 && (
                    <button
                      onClick={() => setSelectedNoteIds([])}
                      className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-muted transition-colors duration-150 hover:text-foreground"
                      type="button"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="relative mt-2">
                <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={notePickerSearch}
                  onChange={(e) => setNotePickerSearch(e.target.value)}
                  placeholder="Search notes, projects, or folders…"
                  className="glass-input h-8 pl-7 pr-2.5 text-[11px]"
                />
              </div>

              {contextDiagnostics.omittedSelectedCount > 0 && (
                <div className="mt-1.5 text-[10px] text-warning">
                  {contextDiagnostics.omittedSelectedCount} omitted by limit
                </div>
              )}

              <div className="scroll-thin mt-2 max-h-[320px] space-y-1.5 overflow-y-auto pr-0.5">
                {groupedSelectableNotes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-[10.5px] text-muted">
                    No notes match this search.
                  </div>
                ) : (
                  groupedSelectableNotes.map((projectGroup) => (
                    <div
                      key={projectGroup.key}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full ring-1 ring-[var(--border)]"
                          style={{ backgroundColor: projectGroup.color || 'var(--border-strong)' }}
                        />
                        <div className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                          {projectGroup.label}
                        </div>
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--surface-sunken)] px-1 text-[9px] font-semibold text-muted">
                          {countNotesInProjectGroup(projectGroup)}
                        </span>
                      </div>

                      <div className="mt-2 space-y-2">
                        {projectGroup.notes.length > 0 && (
                          <div className="space-y-0.5">
                            {projectGroup.folders.length > 0 && (
                              <div className="px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
                                Project Notes
                              </div>
                            )}
                            {projectGroup.notes.map((availableNote, noteIndex) => renderSelectableNote(availableNote, noteIndex))}
                          </div>
                        )}

                        {projectGroup.folders.map((folderGroup) => renderContextFolderGroup(folderGroup))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--border)] px-3.5 py-3">
          <div className="flex items-center justify-between text-[10.5px] text-muted">
            <span>Injected context</span>
            <span className="font-medium text-foreground">
              {contextDiagnostics.totalIncludedChars.toLocaleString()} / {contextLimits.maxTotalInjectedChars.toLocaleString()}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className={'h-full rounded-full transition-all duration-300 ' + usageBarClassName}
              style={{ width: contextUsagePercent + '%' }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted">
            <span>{diagnosticsLabel}</span>
            {contextDiagnostics.truncatedCount > 0 && <span>{contextDiagnostics.truncatedCount} truncated</span>}
          </div>
        </div>
      </aside>
    )

    if (isOverlay) {
      return (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/25 backdrop-blur-sm">
          <button
            aria-label="Close context sidebar"
            className="flex-1 cursor-default"
            onClick={() => setShowContextSidebar(false)}
            type="button"
          />
          <div className="assistant-rise-in h-full">{sidebarPanel}</div>
        </div>
      )
    }

    return <div className="assistant-rise-in h-full shrink-0">{sidebarPanel}</div>
  }

  // ─── INPUT ─────────────────────────────────────────────────────────────────

  const renderInput = () => (
    <div className="shrink-0 px-3 pb-3 pt-1">
      {error && (
        <div className="mb-2 flex items-start gap-2 rounded-2xl bg-[var(--danger-light)] px-3 py-2.5 text-[11.5px] leading-5 text-danger">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div>{error}</div>
            {lastFailedPrompt && !isLoading && (
              <button
                onClick={() => {
                  if (retryCooldown > 0) return
                  setError(null)
                  void handleSend(lastFailedPrompt)
                }}
                disabled={retryCooldown > 0}
                className="mt-1.5 inline-flex h-6 items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 text-[10px] font-semibold text-danger transition-colors duration-150 hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
              >
                {retryCooldown > 0 ? 'Retry in ' + retryCooldown + 's' : 'Retry'}
              </button>
            )}
          </div>
          <button
            onClick={() => setError(null)}
            className="glass-btn-ghost h-6 w-6 flex-shrink-0"
            type="button"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {!isConfigured && (
        <div className="mb-2 flex items-start gap-2 rounded-2xl bg-[var(--warning-light)] px-3 py-2.5 text-[11.5px] leading-5 text-muted">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-warning" />
          <span>
            Set{' '}
            <code className="rounded bg-[var(--surface)] px-1 py-0.5 font-mono text-[10px] text-foreground">
              DEEPSEEK_API_KEY
            </code>{' '}
            in your environment to enable AI.
          </span>
        </div>
      )}

      <div className="glass rounded-3xl p-2 transition-shadow duration-200 focus-within:shadow-[0_0_0_3px_var(--accent-light)]">
        <textarea
          ref={inputRef}
          data-ai-assistant-input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isConfigured ? (selectedText ? 'Ask about the selection, rewrite it, or turn it into actions…' : 'Ask the assistant to analyze, search, write, or plan…') : 'Configure an API key to start using the assistant…'}
          disabled={isLoading || !isConfigured}
          rows={3}
          className="block w-full resize-none bg-transparent px-2 pb-1 pt-1.5 text-[13.5px] leading-6 text-foreground placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          style={{ minHeight: '72px', maxHeight: '200px' }}
        />

        {contextDiagnostics.nearLimit && (
          <div className="mx-2 mt-1 flex items-center gap-2">
            <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className={
                  'h-full rounded-full transition-all duration-300 ' +
                  (contextDiagnostics.exhausted ? 'bg-danger' : 'bg-warning')
                }
                style={{ width: contextUsagePercent + '%' }}
              />
            </div>
            <span className="shrink-0 text-[9px] text-muted">Context {contextUsagePercent}%</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              onClick={() => setShowQuickActions(v => !v)}
              className={[
                'glass-btn h-7 gap-1.5 px-2.5 text-[11px] font-medium',
                showQuickActions ? 'border-transparent bg-[var(--accent-light)] text-accent' : 'text-muted',
              ].join(' ')}
              title="Quick actions"
              type="button"
            >
              <Zap size={12} />
              {showQuickActions ? 'Hide actions' : 'Actions'}
            </button>

            <button
              onClick={() => setShowContextSidebar(v => !v)}
              className={[
                'glass-btn h-7 gap-1.5 px-2.5 text-[11px] font-medium',
                showContextSidebar ? 'border-transparent bg-[var(--accent-light)] text-accent' : 'text-muted',
              ].join(' ')}
              title="Toggle context sidebar"
              type="button"
            >
              <Settings2 size={12} />
              {showContextSidebar ? 'Hide context' : 'Context'}
              <span
                className={[
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold',
                  showContextSidebar ? 'bg-[var(--accent)] text-accent-foreground' : 'bg-[var(--surface-active)] text-foreground',
                ].join(' ')}
              >
                {activeContextSources}
              </span>
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="hidden items-center gap-1 text-[10px] text-muted sm:flex">
              <kbd className="kbd">↵</kbd>
              <span>send</span>
              <span aria-hidden className="px-0.5 opacity-40">·</span>
              <kbd className="kbd">⇧↵</kbd>
              <span>newline</span>
            </span>
            {isLoading ? (
              <button
                onClick={handleCancelResponse}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--danger-light)] px-3 text-[12px] font-medium text-danger transition-colors duration-150 hover:brightness-105 active:scale-[0.98]"
                title="Stop generating"
                type="button"
              >
                <StopCircle size={14} />
                Stop
              </button>
            ) : (
              <button
                onClick={handleSendClick}
                disabled={!inputValue.trim() || !isConfigured}
                className="glass-btn-primary h-8 gap-1.5 px-3.5 text-[12px] disabled:cursor-not-allowed"
                type="button"
              >
                <Send size={13} />
                <span>Send</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )

  const renderMindmapPromptModal = () => {
    if (!showMindmapPromptModal) return null

    return (
      <div
        className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm dark:bg-black/55"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          if (isLoading) return
          setShowMindmapPromptModal(false)
          setPendingMindmapPayload(null)
          setMindmapPromptInput('')
        }}
      >
        <div className="glass-strong w-full max-w-lg animate-rise-in overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="min-w-0">
              <h4 className="font-display text-[14px] font-semibold leading-tight text-foreground">Create Mindmap</h4>
              <p className="mt-0.5 text-[11px] leading-4 text-muted">Optionally guide the AI with instructions</p>
            </div>
            <button
              onClick={() => {
                if (isLoading) return
                setShowMindmapPromptModal(false)
                setPendingMindmapPayload(null)
                setMindmapPromptInput('')
              }}
              className="glass-btn-ghost -mr-1 h-8 w-8"
              aria-label="Close modal"
              type="button"
            >
              <X size={15} />
            </button>
          </div>

          <div className="space-y-2.5 px-4 py-4">
            <label htmlFor="mindmap-additional-prompt" className="block text-[11px] font-medium text-foreground">
              Instructions (optional)
            </label>
            <textarea
              id="mindmap-additional-prompt"
              value={mindmapPromptInput}
              onChange={(e) => setMindmapPromptInput(e.target.value)}
              placeholder="e.g., Focus on implementation steps, risks, and timeline"
              rows={4}
              disabled={isLoading}
              className="glass-input h-auto min-h-[96px] w-full resize-y px-3 py-2 text-[12.5px] leading-5"
            />
            <p className="text-[10.5px] text-muted">Leave empty to use context only.</p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
            <button
              onClick={() => {
                if (isLoading) return
                setShowMindmapPromptModal(false)
                setPendingMindmapPayload(null)
                setMindmapPromptInput('')
              }}
              disabled={isLoading}
              className="glass-btn h-8 px-3.5 text-[11px] font-medium disabled:cursor-not-allowed"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSubmitMindmapCreation()}
              disabled={isLoading || !pendingMindmapPayload}
              className="glass-btn-primary h-8 gap-1.5 px-3.5 text-[11px] disabled:cursor-not-allowed"
              type="button"
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
      <div
        className="absolute inset-0 z-[60] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm dark:bg-black/55"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          handleCancelNoteContextConsent()
        }}
      >
        <div className="glass-strong w-full max-w-md animate-rise-in overflow-hidden rounded-3xl">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="font-display text-[14px] font-semibold leading-tight text-foreground">
              Share note context with AI?
            </h3>
          </div>
          <div className="px-4 py-4">
            <p className="text-[11.5px] leading-5 text-muted">
              This message includes note content from your workspace and sends it to the AI provider.
              Continue only if the content is safe to share.
            </p>
            <label className="mt-3 flex select-none items-center gap-2.5 text-[11.5px] text-foreground">
              <input
                type="checkbox"
                checked={rememberNoteContextConsent}
                onChange={(e) => setRememberNoteContextConsent(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[var(--border-strong)] accent-[var(--accent)]"
              />
              Remember my choice
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
            <button
              onClick={handleCancelNoteContextConsent}
              className="glass-btn h-8 px-3.5 text-[11px] font-medium"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmNoteContextConsent}
              className="glass-btn-primary h-8 px-3.5 text-[11px]"
              type="button"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderHeader = () => {
    return (
      <div className="assistant-rise-in relative shrink-0 border-b border-[var(--border)]">
        <div className="flex h-14 items-center gap-2 px-3">
          {showChatHistory ? (
            <button
              onClick={() => setShowChatHistory(false)}
              className="glass-btn-ghost h-8 w-8 shrink-0"
              title="Back to chat"
              type="button"
            >
              <ChevronLeft size={15} />
            </button>
          ) : (
            <AssistantMark size={30} />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-display text-[14px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
                {showChatHistory ? 'Conversations' : 'Assistant'}
              </h3>
              {!showChatHistory && (
                <span
                  className="kbd h-5 shrink-0 gap-1 border-transparent bg-[var(--accent-light)] px-1.5 text-accent max-[430px]:hidden"
                  title={AI_MODEL_LABEL + ' — thinking enabled'}
                >
                  <Cpu size={9} strokeWidth={2} />
                  {AI_MODEL_SHORT_LABEL} · Thinking
                </span>
              )}
            </div>
            {showChatHistory && (
              <p className="mt-0.5 truncate text-[10.5px] leading-4 text-muted">
                {chatHistory.length} saved conversation{chatHistory.length === 1 ? '' : 's'} for this workspace
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!showChatHistory && (
              <>
                <button
                  onClick={startNewChat}
                  className="glass-btn-ghost h-8 w-8"
                  title="New chat"
                  type="button"
                >
                  <Plus size={15} />
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={handleClearChat}
                    className="glass-btn-ghost h-8 w-8"
                    title="Clear chat"
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            )}
            {onToggleSize && !showChatHistory && (
              <button
                onClick={onToggleSize}
                className="glass-btn-ghost h-8 w-8"
                title={isLargeWindow ? 'Default size' : 'Expand'}
                type="button"
              >
                {isLargeWindow ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="glass-btn-ghost h-8 w-8"
                title="Close"
                aria-label="Close AI Assistant"
                type="button"
              >
                <X size={15} />
              </button>
            )}
            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                className="glass-btn-ghost h-8 w-8"
                type="button"
              >
                {isExpanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>
            )}
          </div>
        </div>

        {!showChatHistory && (
          <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
            <div className="segmented" role="group" aria-label="Assistant view">
              <button
                onClick={() => setShowChatHistory(false)}
                aria-pressed={!showChatHistory}
                className="segmented-item h-7 px-3.5 text-[12px]"
                type="button"
              >
                Chat
              </button>
              <button
                onClick={() => setShowChatHistory(true)}
                aria-pressed={showChatHistory}
                className="segmented-item h-7 px-3.5 text-[12px]"
                type="button"
              >
                History
              </button>
            </div>

            {quotaInfo && (
              <div className="relative" ref={quotaPopoverRef}>
                <button
                  onClick={() => setShowQuotaPopover(value => !value)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-sunken)] px-2.5 text-[11px] font-medium text-muted transition-colors duration-150 hover:text-foreground"
                  title="Usage quota"
                  type="button"
                >
                  <Zap size={11} className={quotaInfo.low ? 'text-warning' : 'text-accent'} />
                  {quotaInfo.remaining}/{quotaInfo.limit}
                </button>

                {showQuotaPopover && (
                  <div className="glass-popover animate-rise-in absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl p-3">
                    <div className="text-[12px] font-semibold text-foreground">Usage snapshot</div>
                    <div className="mt-2 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">Remaining</span>
                        <span className="font-medium text-foreground">{quotaInfo.remaining}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">Limit</span>
                        <span className="font-medium text-foreground">{quotaInfo.limit}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted">Window</span>
                        <span className="font-medium text-foreground">{quotaWindowLabel}</span>
                      </div>
                      {quotaInfo.resetInSeconds !== null && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Resets in</span>
                          <span className="font-medium text-foreground">{quotaInfo.resetInSeconds}s</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── MAIN RENDER ───────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[radial-gradient(85%_55%_at_50%_0%,var(--accent-light),transparent_72%)] text-foreground">
      {renderHeader()}

      {isExpanded && (
        <>
          {showChatHistory ? (
            renderChatHistory()
          ) : (
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {renderQuickActions()}
                {renderSuggestions()}
                {renderMessages()}
                {renderInput()}
              </div>
              {showContextSidebar && isLargeWindow && renderContextSidebar('docked')}
              {showContextSidebar && !isLargeWindow && renderContextSidebar('overlay')}
            </div>
          )}
        </>
      )}

      {renderMindmapPromptModal()}
      {renderNoteContextConsentModal()}
    </div>
  )
}
