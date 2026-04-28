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
  getAIContextLimits,
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
import { buildFolderTree, getFolders, type Folder, type FolderNode } from '@/lib/folders'
import type { Project } from '@/lib/projects'
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
    model?: DeepSeekModel
  }) => Promise<void> | void
  onUpdateMindmapNode?: (nodeId: string, text: string, description?: string) => void
  onClose?: () => void
  onToggleSize?: () => void
  isLargeWindow?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
}

interface ContextFolderGroup {
  folder: FolderNode
  notes: Note[]
  children: ContextFolderGroup[]
}

interface ContextProjectGroup {
  key: string
  label: string
  color?: string | null
  notes: Note[]
  folders: ContextFolderGroup[]
}

function sortNotesByTitle(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'))
}

function appendMapValue<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const existing = map.get(key)
  if (existing) {
    existing.push(value)
    return
  }

  map.set(key, [value])
}

function buildContextFolderGroups(
  nodes: FolderNode[],
  notesByFolderId: Map<string, Note[]>
): ContextFolderGroup[] {
  return nodes.flatMap((node) => {
    const children = buildContextFolderGroups(node.children, notesByFolderId)
    const notes = sortNotesByTitle(notesByFolderId.get(node.id) ?? [])
    if (notes.length === 0 && children.length === 0) {
      return []
    }

    return [{ folder: node, notes, children }]
  })
}

function countNotesInFolderGroup(folderGroup: ContextFolderGroup): number {
  return folderGroup.notes.length + folderGroup.children.reduce((total, child) => total + countNotesInFolderGroup(child), 0)
}

function countNotesInProjectGroup(projectGroup: ContextProjectGroup): number {
  return projectGroup.notes.length + projectGroup.folders.reduce((total, folder) => total + countNotesInFolderGroup(folder), 0)
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
    <div className="assistant-soft-pop mb-3 overflow-hidden rounded-2xl border border-border/40 bg-surface-hover/50" style={{ animationDelay: '60ms' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted transition-colors hover:text-foreground"
      >
        <Cpu size={12} className={`text-alpine-500/70 transition-transform duration-300 ${open ? 'scale-110' : ''}`} />
        <span className="font-medium">Reasoning chain</span>
        <span className="text-[10px] opacity-50">({wordCount} words)</span>
        <ChevronDown size={12} className={`ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="border-t border-border/30 px-3 pb-3 pt-0 text-xs leading-relaxed whitespace-pre-wrap text-muted/80">
            <div className="pt-3">{reasoning}</div>
          </div>
        </div>
      </div>
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
          className="assistant-typing-dot w-1.5 h-1.5 rounded-full bg-muted/60"
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

        @media (prefers-reduced-motion: reduce) {
          .assistant-typing-dot {
            animation: none !important;
            opacity: 0.7;
            transform: none !important;
          }
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
    summary?: NoteSummary
  }>({})
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showChatHistory, setShowChatHistory] = useState(false)
  const [chatHistory, setChatHistory] = useState<AIChat[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Model and context settings
  const [model, setModel] = useState<DeepSeekModel>('deepseek-v4-flash')
  const [includeCurrentNote, setIncludeCurrentNote] = useState(true)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
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
  const contextLimits = useMemo(() => getAIContextLimits(model), [model])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatHistoryRef = useRef<AIMessage[]>([])
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

    const notesByFolderId = new Map<string, Note[]>()
    const rootNotesByProjectId = new Map<string | null, Note[]>()

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

  const selectedAdditionalNotes = useMemo(() => {
    if (!allNotes?.length || selectedNoteIds.length === 0) return []
    const selectedMap = new Set(selectedNoteIds)
    return allNotes
      .filter(n => selectedMap.has(n.id) && n.id !== note?.id)
      .slice(0, contextLimits.maxSelectedNotes)
  }, [allNotes, contextLimits.maxSelectedNotes, note?.id, selectedNoteIds])

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
        let targetNote: Note | undefined
        if (noteId) targetNote = allNotes.find(n => n.id === noteId)
        else if (noteTitle) targetNote = allNotes.find(n => n.title?.toLowerCase().includes(noteTitle.toLowerCase()))
        if (!targetNote) return `Note not found. Available: ${allNotes.map(n => n.title || 'Untitled').join(', ')}`
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
          const excerpt = truncateAtBoundary(c, contextLimits.searchExcerptChars)
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
          model,
        })

        return `Created a new mindmap note from ${sourceType === 'selection' ? 'selected text' : 'the current note'}.`
      }
      default:
        return `Unknown tool: ${name}`
    }
  }, [allNotes, contextLimits, model, note, noteContent, onCreateMindmapNote, onReplaceText])

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
        model,
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
        model,
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
          const summary = await summarizeNote(aiContext.currentNote.content, aiContext.currentNote.title, model)
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
          const edited = await editText(aiContext.currentNote.content, instructions[action], undefined, model)
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
          const continued = await editText(textToUse.slice(-CONTEXT_LENGTH_LIMIT), 'Continue writing from where this text ends. Maintain the same style, tone, and topic.', undefined, model)
          setMessages(prev => [...prev, { id: `action-${Date.now()}`, role: 'assistant', content: `**Continue Writing:**\n\n${continued}`, timestamp: new Date() }])
          break
        }
        case 'explain-selection': {
          if (!selectedText?.trim()) { setError('Please select some text to explain'); break }
          const explanation = await editText(selectedText, 'Explain this text in simple terms. Break down complex concepts and define technical terms.', undefined, model)
          setMessages(prev => [...prev, { id: `action-${Date.now()}`, role: 'assistant', content: `**Explanation:**\n\n${explanation}`, timestamp: new Date() }])
          break
        }
        case 'improve-selection': {
          if (!selectedText?.trim()) { setError('Please select some text to improve'); break }
          const improved = await editText(selectedText, 'Improve this text. Enhance clarity, fix errors, and make it more engaging while preserving the meaning.', undefined, model)
          setMessages(prev => [...prev, { id: `action-${Date.now()}`, role: 'assistant', content: `**Improved Version:**\n\n${improved}`, timestamp: new Date() }])
          break
        }
        case 'translate-selection': {
          if (!selectedText?.trim()) { setError('Please select some text to translate'); break }
          const translated = await editText(selectedText, 'Translate this text to English if it is in another language, or to Spanish if it is in English.', undefined, model)
          setMessages(prev => [...prev, { id: `action-${Date.now()}`, role: 'assistant', content: `**Translation:**\n\n${translated}`, timestamp: new Date() }])
          break
        }
        case 'simplify-selection': {
          if (!selectedText?.trim()) { setError('Please select some text to simplify'); break }
          const simplified = await editText(selectedText, 'Simplify this text. Use simpler words, shorter sentences, and clearer explanations.', undefined, model)
          setMessages(prev => [...prev, { id: `action-${Date.now()}`, role: 'assistant', content: `**Simplified:**\n\n${simplified}`, timestamp: new Date() }])
          break
        }
        case 'suggest-tasks': {
          const taskSuggestions = await suggestTasks(aiContext, model)
          setSuggestions(prev => ({ ...prev, tasks: taskSuggestions }))
          setShowSuggestions(true)
          break
        }
        case 'suggest-events': {
          const eventSuggestions = await suggestEvents(aiContext, model)
          setSuggestions(prev => ({ ...prev, events: eventSuggestions }))
          setShowSuggestions(true)
          break
        }
        case 'mindmap-ideas': {
          if (!aiContext.mindmapData?.selectedNodeText) { setError('Please select a mindmap node first'); break }
          const mindmapSuggestions = await suggestMindmapNodes(aiContext.mindmapData.selectedNodeText, aiContext.mindmapData.selectedNodeDescription, undefined, model)
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
  }, [aiContext, selectedText, note?.note_type, onCreateMindmapNote, mapAIErrorToUserMessage, refreshRateLimitSnapshot, model])

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

  const modelMeta = useMemo(() => {
    if (model === 'deepseek-v4-pro') {
      return {
        label: 'DeepSeek V4 Pro',
        shortLabel: 'V4 Pro',
        description: 'Best for deep reasoning, larger context, and multi-step tool work.',
        badgeClassName: 'bg-alpine-600 text-white shadow-sm shadow-alpine-900/20',
      }
    }

    return {
      label: 'DeepSeek V4 Flash',
      shortLabel: 'V4 Flash',
      description: 'Best for fast drafting, lightweight rewrites, and quick note operations.',
      badgeClassName: 'bg-surface text-foreground border border-border/60',
    }
  }, [model])

  const pendingTaskCount = useMemo(() => {
    if (taskStats) return taskStats.todo + taskStats.in_progress + taskStats.overdue
    return tasks?.filter(task => task.status !== 'completed' && task.status !== 'cancelled').length ?? 0
  }, [taskStats, tasks])

  const upcomingEventCount = events?.length ?? 0
  const workspaceNoteCount = allNotes?.length ?? (note ? 1 : 0)
  const attachedNoteSourceCount = (includeCurrentNote && note ? 1 : 0) + selectedAdditionalNotes.length
  const activeContextSources = (includeCurrentNote && note ? 1 : 0) + selectedAdditionalNotes.length + (selectedText?.trim() ? 1 : 0)

  const selectedTextPreview = useMemo(() => {
    const normalized = selectedText?.replace(/\s+/g, ' ').trim()
    return normalized ? truncateAtBoundary(normalized, 84) : null
  }, [selectedText])

  const currentNotePlainText = useMemo(() => {
    if (!note) return ''
    return noteContent ? stripHtmlForAI(noteContent) : stripHtmlForAI(note.content || '')
  }, [note, noteContent])

  function renderSelectableNote(availableNote: Note, index: number) {
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
        className={`assistant-soft-pop assistant-hover-lift flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${
          isSelected
            ? 'border-alpine-500/30 bg-alpine-600/10 shadow-sm'
            : selectionLimitReached
              ? 'cursor-not-allowed border-border/50 bg-surface opacity-50'
              : 'border-border/60 bg-surface hover:border-border-strong hover:bg-surface-hover/40'
        }`}
        style={{ animationDelay: `${160 + Math.min(index, 5) * 25}ms` }}
      >
        <div className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-all ${
          isSelected ? 'border-alpine-600 bg-alpine-600 text-white' : 'border-border-strong'
        }`}>
          {isSelected && <Check size={10} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{availableNote.title || 'Untitled'}</div>
          <div className="mt-1 text-[11px] text-muted">{availableNote.note_type || 'note'}</div>
        </div>
      </button>
    )
  }

  function renderContextFolderGroup(folderGroup: ContextFolderGroup, depth = 0) {
    const totalNotes = countNotesInFolderGroup(folderGroup)

    return (
      <div key={folderGroup.folder.id} className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-[11px] font-semibold text-foreground/70" style={{ paddingLeft: `${depth * 12}px` }}>
          <FolderOpen size={12} className="text-muted" />
          <span className="truncate">{folderGroup.folder.name}</span>
          <span className="inline-flex items-center rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] font-medium text-muted">
            {totalNotes}
          </span>
        </div>

        <div className="space-y-1.5 border-l border-border/50 pl-3" style={{ marginLeft: `${depth * 12}px` }}>
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
          <div className="p-3 space-y-2">
            {chatHistory.map((c, index) => (
              <button
                key={c.id}
                onClick={() => loadChat(c)}
                className={`assistant-soft-pop assistant-hover-lift w-full p-3.5 text-left rounded-2xl transition-all duration-200 group relative border ${
                  currentChatId === c.id
                    ? 'bg-alpine-600/10 border-alpine-500/30 shadow-[0_16px_30px_rgba(37,112,235,0.12)]'
                    : 'bg-surface border-border/60 hover:border-border-strong hover:bg-surface-hover/60 shadow-sm'
                }`}
                style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
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
                    <p className="mt-1 text-[11px] leading-relaxed text-foreground/60 line-clamp-2">
                      {truncateAtBoundary(c.messages[c.messages.length - 1]?.content || 'Open this conversation to continue where you left off.', 120)}
                    </p>
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

    const actionCard = (action: QuickAction, icon: React.ReactNode, label: string, description: string, highlight = false) => (
      <button
        key={action}
        onClick={() => { handleQuickAction(action); setShowQuickActions(false) }}
        disabled={isLoading || !isConfigured}
        className={`group rounded-2xl border px-3.5 py-3 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] ${
          highlight
            ? 'border-alpine-500/20 bg-[linear-gradient(135deg,rgba(37,112,235,0.10),rgba(20,184,166,0.06))] hover:border-alpine-500/35 hover:shadow-[0_14px_28px_rgba(37,112,235,0.10)]'
            : 'border-border/60 bg-surface hover:border-border-strong hover:bg-surface-hover/60 hover:shadow-sm'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-xl p-2 ${highlight ? 'bg-white/70 text-alpine-700 dark:bg-white/5 dark:text-alpine-300' : 'bg-surface-hover text-alpine-600'}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-foreground">{label}</div>
              <ArrowRight size={14} className="text-muted transition-all group-hover:translate-x-0.5 group-hover:text-alpine-600" />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-foreground/65">{description}</p>
          </div>
        </div>
      </button>
    )

    if (!showQuickActions) return null

    return (
      <div className="assistant-rise-in border-b border-border/50 bg-[linear-gradient(180deg,rgba(37,112,235,0.06),transparent)] shrink-0">
        <div className="p-3.5 space-y-4 max-h-[42vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Action Deck</div>
              <p className="mt-1 text-sm text-foreground/65">Use one-tap actions for common note operations, or keep chatting normally.</p>
            </div>
            <button
              onClick={() => setShowQuickActions(false)}
              className="p-1.5 hover:bg-surface-hover rounded-xl transition-colors text-muted hover:text-foreground"
              title="Hide quick actions"
            >
              <X size={14} />
            </button>
          </div>

          {sections.map((section) => (
            <div key={section.title} className="space-y-2.5">
              <div className="flex items-center gap-2">
                {section.highlight ? <MousePointerClick size={12} className="text-peak-600" /> : <Zap size={12} className="text-alpine-600" />}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{section.title}</div>
                  <div className="text-[11px] text-foreground/55">{section.description}</div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {section.items.map(({ action, icon, label, description }, index) => (
                  <div key={action} className="assistant-soft-pop" style={{ animationDelay: `${Math.min(index, 4) * 45}ms` }}>
                    {actionCard(action, icon, label, description, section.highlight)}
                  </div>
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
    return (
      <div className="assistant-rise-in border-b border-border/50 bg-surface-hover/10 shrink-0 overflow-y-auto max-h-[40%]">
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
              <div className="assistant-soft-pop assistant-hover-lift bg-surface rounded-xl p-3.5 border border-border/50" style={{ animationDelay: '40ms' }}>
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
              <div className="assistant-soft-pop assistant-hover-lift bg-surface rounded-xl p-3.5 border border-border/50" style={{ animationDelay: '80ms' }}>
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
              <div className="assistant-soft-pop assistant-hover-lift bg-surface rounded-xl p-3.5 border border-border/50" style={{ animationDelay: '120ms' }}>
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
              <div className="assistant-soft-pop assistant-hover-lift bg-surface rounded-xl p-3.5 border border-border/50" style={{ animationDelay: '160ms' }}>
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
      {
        prompt: selectedText?.trim() ? 'Explain this selection' : 'Summarize this note',
        title: selectedText?.trim() ? 'Explain the selected text' : 'Summarize the current note',
        description: selectedText?.trim()
          ? 'Break down the highlighted passage and clarify the key idea.'
          : 'Get a concise brief with the main points and likely follow-ups.',
        icon: selectedText?.trim() ? <HelpCircle size={16} className="text-peak-600" /> : <FileText size={16} className="text-alpine-600" />,
      },
      {
        prompt: 'Help me brainstorm ideas',
        title: 'Brainstorm directions',
        description: 'Generate options, angles, and next steps from the note context.',
        icon: <Lightbulb size={16} className="text-warning" />,
      },
      {
        prompt: 'Create a task list',
        title: 'Turn notes into actions',
        description: 'Extract concrete tasks, deadlines, and likely priorities.',
        icon: <CheckSquare size={16} className="text-accent" />,
      },
      {
        prompt: 'Build a mindmap from this',
        title: 'Map the structure',
        description: 'Convert the current material into branches, themes, and clusters.',
        icon: <Network size={16} className="text-alpine-600" />,
      },
    ]

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          <div className="assistant-rise-in relative overflow-hidden rounded-[28px] border border-alpine-500/15 bg-[linear-gradient(135deg,rgba(37,112,235,0.14),rgba(20,184,166,0.08)_55%,rgba(255,255,255,0.78))] dark:bg-[linear-gradient(135deg,rgba(37,112,235,0.18),rgba(20,184,166,0.10)_55%,rgba(28,25,23,0.94))] px-5 py-5 shadow-[0_18px_50px_rgba(37,112,235,0.12)]">
            <div className="absolute inset-y-0 right-0 w-40 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.55),transparent_70%)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.10),transparent_70%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-alpine-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-alpine-200">
                <Sparkles size={12} className="assistant-idle-float" />
                Assistant Workspace
              </div>
              <h3 className="mt-4 text-xl font-semibold text-foreground">Ask, edit, search, and act across your notes.</h3>
              <p className="mt-2 max-w-[36rem] text-sm leading-relaxed text-foreground/70">
                {isConfigured
                  ? `You are in ${modelMeta.shortLabel}. Use it to inspect note context, rewrite text, create tasks, or turn ideas into a mindmap.`
                  : 'Add a DeepSeek API key to your environment to unlock note search, drafting, summarization, and structured AI actions.'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`assistant-soft-pop inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium ${modelMeta.badgeClassName}`} style={{ animationDelay: '70ms' }}>
                  <Cpu size={12} />
                  {modelMeta.shortLabel}
                </span>
                <span className="assistant-soft-pop inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/70 px-3 py-1.5 text-[11px] text-foreground/75 backdrop-blur" style={{ animationDelay: '110ms' }}>
                  <BookOpen size={12} className="text-peak-600" />
                  {workspaceNoteCount} note{workspaceNoteCount === 1 ? '' : 's'} available
                </span>
                <span className="assistant-soft-pop inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/70 px-3 py-1.5 text-[11px] text-foreground/75 backdrop-blur" style={{ animationDelay: '150ms' }}>
                  <CheckSquare size={12} className="text-accent" />
                  {pendingTaskCount} active task{pendingTaskCount === 1 ? '' : 's'}
                </span>
                <span className="assistant-soft-pop inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/70 px-3 py-1.5 text-[11px] text-foreground/75 backdrop-blur" style={{ animationDelay: '190ms' }}>
                  <Calendar size={12} className="text-alpine-600" />
                  {upcomingEventCount} upcoming event{upcomingEventCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>

          {!isConfigured ? (
            <div className="assistant-soft-pop rounded-2xl border border-warning/20 bg-warning/5 px-4 py-4 shadow-sm" style={{ animationDelay: '110ms' }}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-warning/10 p-2 text-warning">
                  <AlertCircle size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">AI is not configured yet</h4>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/70">
                    Set DEEPSEEK_API_KEY in your app environment, then reopen the assistant to enable note-aware chat, quick actions, and structured outputs.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="assistant-soft-pop" style={{ animationDelay: '90ms' }}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Starter Prompts</div>
                    <p className="mt-1 text-sm text-foreground/65">Launch a strong first turn instead of typing from scratch.</p>
                  </div>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.prompt}
                      onClick={() => void handleSend(suggestion.prompt)}
                      className="assistant-soft-pop assistant-hover-lift group rounded-2xl border border-border/60 bg-surface px-4 py-3.5 text-left shadow-sm transition-all hover:border-alpine-500/35 hover:shadow-[0_16px_30px_rgba(37,112,235,0.10)]"
                      style={{ animationDelay: `${120 + Math.min(index, 5) * 45}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-xl bg-surface-hover p-2 transition-colors group-hover:bg-alpine-600/10">
                          {suggestion.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-foreground">{suggestion.title}</h4>
                            <ArrowRight size={14} className="text-muted transition-all group-hover:translate-x-0.5 group-hover:text-alpine-600" />
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-foreground/65">{suggestion.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="assistant-soft-pop rounded-2xl border border-border/60 bg-surface/90 px-4 py-4 shadow-sm" style={{ animationDelay: '160ms' }}>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  <Zap size={12} className="text-alpine-600" />
                  What The Assistant Can Do Right Now
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[
                    {
                      title: 'Read workspace context',
                      description: `${activeContextSources} source${activeContextSources === 1 ? '' : 's'} currently attached to the next message.`,
                    },
                    {
                      title: 'Search and inspect notes',
                      description: 'Use note search, read full note content, and answer with exact source context.',
                    },
                    {
                      title: 'Edit or extend text',
                      description: 'Rewrite passages, improve clarity, continue writing, or replace selected text.',
                    },
                    {
                      title: 'Create actions and maps',
                      description: 'Extract tasks, suggest calendar events, or build mindmaps from note material.',
                    },
                  ].map((item, index) => (
                    <div key={item.title} className="assistant-soft-pop rounded-2xl border border-border/50 bg-surface-hover/40 px-3.5 py-3" style={{ animationDelay: `${210 + Math.min(index, 5) * 35}ms` }}>
                      <div className="text-sm font-semibold text-foreground">{item.title}</div>
                      <p className="mt-1.5 text-xs leading-relaxed text-foreground/65">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ─── MESSAGES ──────────────────────────────────────────────────────────────

  const renderMessages = () => (
    <div className="flex-1 overflow-y-auto min-h-0">
      {messages.length === 0 ? (
        renderWelcome()
      ) : (
        <div className="p-4 space-y-4">
          {messages.map((message, index) => {
            const parsed = message.role === 'assistant' && !message.isStreaming
              ? parseAIResponse(message.content) : null
            const isUser = message.role === 'user'
            const timeLabel = message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

            return (
              <div key={message.id} className={`assistant-rise-in group flex ${isUser ? 'justify-end' : 'justify-start'}`} style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
                <div className={`w-full max-w-[88%] ${isUser ? 'flex justify-end' : ''}`}>
                  <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <div className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl ${
                      isUser
                        ? 'bg-alpine-600 text-white shadow-sm shadow-alpine-900/20'
                        : 'bg-[linear-gradient(145deg,rgba(37,112,235,0.14),rgba(20,184,166,0.10))] text-alpine-700 dark:text-alpine-200 border border-alpine-500/15'
                    }`}>
                      {isUser ? <User size={14} /> : <Sparkles size={14} />}
                    </div>

                    <div className={`min-w-0 flex-1 ${isUser ? 'flex flex-col items-end' : ''}`}>
                      <div className={`mb-1 flex items-center gap-2 ${isUser ? 'justify-end' : ''}`}>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{isUser ? 'You' : 'Assistant'}</span>
                        <span className="text-[10px] text-muted/70">{timeLabel}</span>
                      </div>

                      <div className={`overflow-hidden rounded-[24px] border transition-all ${
                        isUser
                          ? 'border-alpine-500/30 bg-[linear-gradient(145deg,#2570eb,#1d5bd8)] px-4 py-3 text-white shadow-[0_18px_35px_rgba(37,112,235,0.18)]'
                          : 'assistant-hover-lift border-border/60 bg-surface px-4 py-3.5 shadow-[0_18px_35px_rgba(15,23,42,0.06)]'
                      }`}>
                        {message.isStreaming ? (
                          streamingContent ? (
                            <div>
                              {streamingReasoning && (
                                <div className="mb-3 rounded-2xl border border-border/50 bg-surface-hover/50 px-3.5 py-3">
                                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted mb-1.5">
                                    <Cpu size={10} className="text-alpine-500/70" />
                                    Live reasoning
                                  </div>
                                  <p className="text-[11px] text-muted/75 leading-relaxed italic line-clamp-4">
                                    {streamingReasoning.slice(-360)}
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

                      {!isUser && !message.isStreaming && (
                        <div className="mt-2 flex translate-y-1 items-center gap-1 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                          <button onClick={() => handleCopy(message.content, message.id)} className="rounded-xl p-1.5 text-muted transition-all hover:bg-surface-hover hover:text-foreground" title="Copy">
                            {copiedId === message.id ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
                          </button>
                          {onInsertText && (
                            <button onClick={() => handleInsertToNote(message.content)} className="rounded-xl p-1.5 text-muted transition-all hover:bg-surface-hover hover:text-foreground" title="Append to note">
                              <FileText size={12} />
                            </button>
                          )}
                          {onInsertAtCursor && (
                            <button onClick={() => handleInsertAtCursorPosition(message.content)} className="rounded-xl p-1.5 text-muted transition-all hover:bg-surface-hover hover:text-foreground" title="Insert at cursor">
                              <PenLine size={12} />
                            </button>
                          )}
                          {selectedText && onReplaceSelection && (
                            <button onClick={() => handleReplaceSelectionWithResponse(message.content)} className="rounded-xl p-1.5 text-muted transition-all hover:bg-surface-hover hover:text-foreground" title="Replace selection">
                              <ArrowRight size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  )

  // ─── CONTEXT SIDEBAR ───────────────────────────────────────────────────────

  const renderContextSidebar = (mode: 'docked' | 'overlay' = 'docked') => {
    const isOverlay = mode === 'overlay'
    const diagnosticsTone = contextDiagnostics.exhausted
      ? 'border-danger/20 bg-danger/10 text-danger'
      : contextDiagnostics.nearLimit
        ? 'border-warning/20 bg-warning/10 text-warning'
        : 'border-accent/20 bg-accent/10 text-accent'
    const diagnosticsLabel = contextDiagnostics.exhausted
      ? 'Context full'
      : contextDiagnostics.nearLimit
        ? 'Near limit'
        : 'Healthy budget'
    const usageBarClassName = contextDiagnostics.exhausted
      ? 'bg-danger'
      : contextDiagnostics.nearLimit
        ? 'bg-warning'
        : 'bg-alpine-600'

    const sidebarPanel = (
      <aside className={`flex h-full w-[320px] max-w-[88vw] flex-col border-l border-border/50 bg-surface/95 backdrop-blur ${isOverlay ? 'shadow-2xl' : 'shadow-[-14px_0_40px_rgba(15,23,42,0.05)]'}`}>
        <div className="border-b border-border/50 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Context Sidebar</div>
              <h4 className="mt-1 text-sm font-semibold text-foreground">{activeContextSources} source{activeContextSources === 1 ? '' : 's'} attached</h4>
              <p className="mt-1 text-xs leading-relaxed text-foreground/65">
                {selectedTextPreview
                  ? 'Selection context will be prioritized alongside any attached notes.'
                  : attachedNoteSourceCount > 0
                    ? 'Manage which notes are injected directly into the next assistant reply.'
                    : 'No note content is attached yet. The assistant can still use workspace tools if needed.'}
              </p>
            </div>
            <button
              onClick={() => setShowContextSidebar(false)}
              className="assistant-hover-lift rounded-xl border border-border/60 bg-surface p-2 text-muted transition-all hover:border-border-strong hover:text-foreground"
              title="Hide context sidebar"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface-hover/50 px-2.5 py-1 text-[10px] font-medium text-foreground/75">
              <BookOpen size={10} className="text-peak-600" />
              {attachedNoteSourceCount} note source{attachedNoteSourceCount === 1 ? '' : 's'}
            </span>
            {selectedTextPreview && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-peak-500/20 bg-peak-500/10 px-2.5 py-1 text-[10px] font-medium text-peak-700 dark:text-peak-300">
                <MousePointerClick size={10} />
                Selection attached
              </span>
            )}
            {aiContext.mindmapData?.selectedNodeText && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-alpine-500/20 bg-alpine-600/10 px-2.5 py-1 text-[10px] font-medium text-alpine-700 dark:text-alpine-300">
                <Network size={10} />
                Mindmap node active
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selectedTextPreview && (
            <div className="assistant-soft-pop rounded-2xl border border-border/60 bg-surface px-4 py-3 shadow-sm" style={{ animationDelay: '40ms' }}>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                <MousePointerClick size={12} className="text-peak-600" />
                Editor Selection
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75">“{selectedTextPreview}”</p>
              <p className="mt-2 text-[11px] leading-relaxed text-foreground/60">
                Selection is controlled from the editor. Change or clear it there when you want the assistant to stop prioritizing it.
              </p>
            </div>
          )}

          {aiContext.mindmapData?.selectedNodeText && (
            <div className="assistant-soft-pop rounded-2xl border border-border/60 bg-surface px-4 py-3 shadow-sm" style={{ animationDelay: '70ms' }}>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                <Network size={12} className="text-alpine-600" />
                Mindmap Focus
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">{aiContext.mindmapData.selectedNodeText}</div>
              {aiContext.mindmapData.selectedNodeDescription && (
                <p className="mt-1 text-[11px] leading-relaxed text-foreground/65">{truncateAtBoundary(aiContext.mindmapData.selectedNodeDescription, 160)}</p>
              )}
            </div>
          )}

          {note && (
            <div className="assistant-soft-pop rounded-2xl border border-border/60 bg-surface px-4 py-3 shadow-sm" style={{ animationDelay: '100ms' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Current Note</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/60">
                    Include the open note directly in the next request, or rely on tool-based lookup only.
                  </p>
                </div>
                <button
                  onClick={() => setIncludeCurrentNote(value => !value)}
                  className={`assistant-hover-lift inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
                    includeCurrentNote
                      ? 'bg-alpine-600 text-white shadow-sm shadow-alpine-900/20'
                      : 'border border-border/60 bg-surface-hover text-muted hover:text-foreground'
                  }`}
                >
                  {includeCurrentNote ? <Check size={10} /> : <Plus size={10} />}
                  {includeCurrentNote ? 'Included' : 'Add note'}
                </button>
              </div>

              <div className="mt-3 rounded-2xl border border-border/50 bg-surface-hover/35 px-3.5 py-3">
                <div className="text-sm font-semibold text-foreground">{note.title || 'Untitled'}</div>
                <div className="mt-1 text-[11px] text-muted">
                  {(note.note_type || 'rich-text')} • {currentNotePlainText.length.toLocaleString()} chars available
                </div>
              </div>
            </div>
          )}

          <div className="assistant-soft-pop rounded-2xl border border-border/60 bg-surface px-4 py-3 shadow-sm" style={{ animationDelay: '130ms' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Additional Notes</div>
                <p className="mt-1 text-[11px] leading-relaxed text-foreground/60">
                  Select up to {contextLimits.maxSelectedNotes} notes to inject directly into the next reply.
                </p>
              </div>
              {selectedNoteIds.length > 0 && (
                <button
                  onClick={() => setSelectedNoteIds([])}
                  className="assistant-hover-lift rounded-full border border-border/60 px-2.5 py-1 text-[10px] font-medium text-muted transition-all hover:border-border-strong hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="mt-3 relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={notePickerSearch}
                onChange={(e) => setNotePickerSearch(e.target.value)}
                placeholder="Search notes, projects, or folders…"
                className="h-10 w-full rounded-2xl border border-border bg-surface-hover/50 pl-9 pr-3 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-alpine-500/15 focus:border-alpine-500/35"
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
              <span>{selectedNoteIds.length}/{contextLimits.maxSelectedNotes} selected</span>
              {contextDiagnostics.omittedSelectedCount > 0 && (
                <span className="text-warning">{contextDiagnostics.omittedSelectedCount} omitted by limit</span>
              )}
            </div>

            <div className="mt-3 max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
              {groupedSelectableNotes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 px-3 py-4 text-center text-[11px] text-muted">
                  No notes match this search.
                </div>
              ) : (
                groupedSelectableNotes.map((projectGroup) => (
                  <div key={projectGroup.key} className="rounded-2xl border border-border/60 bg-surface-hover/25 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-white/60 shadow-sm"
                        style={{ backgroundColor: projectGroup.color || 'var(--color-border-strong)' }}
                      />
                      <div className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                        {projectGroup.label}
                      </div>
                      <span className="inline-flex items-center rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        {countNotesInProjectGroup(projectGroup)}
                      </span>
                    </div>

                    <div className="mt-3 space-y-3">
                      {projectGroup.notes.length > 0 && (
                        <div className="space-y-1.5">
                          {projectGroup.folders.length > 0 && (
                            <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
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

          <div className="assistant-soft-pop rounded-2xl border border-border/60 bg-surface px-4 py-3 shadow-sm" style={{ animationDelay: '160ms' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Diagnostics</div>
                <p className="mt-1 text-[11px] leading-relaxed text-foreground/60">
                  Track how much context is being injected for the active model profile.
                </p>
              </div>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium ${diagnosticsTone}`}>
                {diagnosticsLabel}
              </span>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-foreground/70">
                <span>Injected chars</span>
                <span>{contextDiagnostics.totalIncludedChars.toLocaleString()} / {contextLimits.maxTotalInjectedChars.toLocaleString()}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-active/60">
                <div className={`h-full rounded-full transition-all duration-300 ${usageBarClassName}`} style={{ width: `${contextUsagePercent}%` }} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                {
                  label: 'Original chars',
                  value: contextDiagnostics.totalOriginalChars.toLocaleString(),
                },
                {
                  label: 'Truncated',
                  value: String(contextDiagnostics.truncatedCount),
                },
                {
                  label: 'Omitted notes',
                  value: String(contextDiagnostics.omittedSelectedCount),
                },
                {
                  label: 'Per note cap',
                  value: contextLimits.maxCharsPerNote.toLocaleString(),
                },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border/50 bg-surface-hover/35 px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{stat.label}</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border/50 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Model-aware limits</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-border/50 bg-surface-hover/35 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Model</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{modelMeta.shortLabel}</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-surface-hover/35 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Max notes</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{contextLimits.maxSelectedNotes}</div>
            </div>
          </div>
        </div>
      </aside>
    )

    if (isOverlay) {
      return (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/20 backdrop-blur-[1px]">
          <button
            aria-label="Close context sidebar"
            className="flex-1 cursor-default"
            onClick={() => setShowContextSidebar(false)}
          />
          <div className="assistant-rise-in h-full">{sidebarPanel}</div>
        </div>
      )
    }

    return <div className="assistant-rise-in h-full shrink-0">{sidebarPanel}</div>
  }

  // ─── INPUT ─────────────────────────────────────────────────────────────────

  const renderInput = () => (
    <div className="border-t border-border/50 bg-[linear-gradient(180deg,transparent,rgba(37,112,235,0.04))] shrink-0">
      {/* Error & warnings */}
      {error && (
        <div className="mx-4 mt-4 px-3.5 py-3 bg-danger/5 border border-danger/15 rounded-2xl text-xs flex items-start gap-2.5 shadow-sm">
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
        <div className="mx-4 mt-4 px-3.5 py-3 bg-warning/5 border border-warning/15 rounded-2xl text-xs text-foreground/70 flex items-start gap-2.5 shadow-sm">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-warning" />
          <span>Set <code className="font-mono bg-surface-active/60 px-1 py-0.5 rounded text-[10px]">DEEPSEEK_API_KEY</code> in your environment to enable AI.</span>
        </div>
      )}

      <div className="p-4 pt-3">
        <div className="overflow-hidden rounded-[26px] border border-border/70 bg-surface shadow-[0_-8px_30px_rgba(15,23,42,0.05)] transition-all focus-within:border-alpine-500/35 focus-within:ring-2 focus-within:ring-alpine-500/10">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConfigured ? (selectedText ? 'Ask about the selection, rewrite it, or turn it into actions…' : 'Ask the assistant to analyze, search, write, or plan…') : 'Configure an API key to start using the assistant…'}
            disabled={isLoading || !isConfigured}
            rows={3}
            className="w-full px-4 pt-4 pb-3 text-[14px] leading-relaxed bg-transparent resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed text-foreground placeholder:text-muted/60"
            style={{ minHeight: '96px', maxHeight: '220px' }}
          />

          <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-surface-hover/35 px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowQuickActions(v => !v)}
                className={`assistant-hover-lift inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  showQuickActions
                    ? 'border-alpine-500/20 bg-alpine-600/10 text-alpine-600 dark:text-alpine-300'
                    : 'border-border/60 bg-surface text-muted hover:border-border-strong hover:text-foreground'
                }`}
                title="Quick actions"
              >
                <Zap size={13} />
                {showQuickActions ? 'Hide actions' : 'Actions'}
              </button>

                <button
                onClick={() => setShowContextSidebar(v => !v)}
                className={`assistant-hover-lift inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  showContextSidebar
                    ? 'border-alpine-500/20 bg-alpine-600/10 text-alpine-600 dark:text-alpine-300'
                    : 'border-border/60 bg-surface text-muted hover:border-border-strong hover:text-foreground'
                }`}
                title="Toggle context sidebar"
              >
                <Settings2 size={13} />
                {showContextSidebar ? 'Hide context' : 'Show context'}
                <span className="rounded-full bg-surface-active/70 px-1.5 py-0.5 text-[10px] text-foreground/70">
                  {activeContextSources}
                </span>
              </button>

              <span className="hidden sm:inline text-[11px] text-muted">
                {selectedText?.trim()
                  ? 'Selection and note sources are managed from the context sidebar.'
                  : attachedNoteSourceCount > 0
                    ? 'Attached note sources are managed from the context sidebar.'
                    : 'Open the context sidebar to attach note sources.'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted/50 hidden lg:inline-flex items-center gap-1.5">
                <CornerDownLeft size={9} />
                Enter sends · Shift+Enter adds a new line
              </span>
              {isLoading ? (
                <button
                  onClick={handleCancelResponse}
                  className="assistant-hover-lift inline-flex items-center gap-1.5 rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger transition-all hover:bg-danger/20 active:scale-[0.98]"
                  title="Stop generating"
                >
                  <StopCircle size={15} />
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleSendClick}
                  disabled={!inputValue.trim() || !isConfigured}
                  className="assistant-hover-lift group inline-flex items-center gap-1.5 rounded-xl bg-alpine-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm shadow-alpine-900/20 transition-all hover:bg-alpine-700 disabled:opacity-20 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  <Send size={15} />
                  <span>Send</span>
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

  const renderHeader = () => {
    const headerActionButtonClassName = 'assistant-hover-lift p-2 text-muted hover:text-foreground hover:bg-surface/70 rounded-xl transition-all'

    return (
      <div className="assistant-rise-in shrink-0 border-b border-border/50 bg-[linear-gradient(180deg,rgba(37,112,235,0.12),rgba(20,184,166,0.05)_55%,transparent)]">
        <div className="px-4 pb-4 pt-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {showChatHistory ? (
                <button
                  onClick={() => setShowChatHistory(false)}
                  className="assistant-hover-lift mt-0.5 rounded-xl border border-border/60 bg-surface/80 p-2 text-muted transition-all hover:border-border-strong hover:text-foreground"
                >
                  <ChevronLeft size={16} />
                </button>
              ) : (
                <div className="assistant-idle-float flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#2570eb,#14b8a6)] shadow-[0_16px_35px_rgba(37,112,235,0.28)]">
                  <Sparkles size={18} className="text-white" />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-foreground leading-tight">
                    {showChatHistory ? 'Conversation History' : 'AI Assistant'}
                  </h3>
                  {!showChatHistory && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${modelMeta.badgeClassName}`}>
                      <Cpu size={10} />
                      {modelMeta.shortLabel}
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs leading-relaxed text-foreground/65 max-w-[32rem]">
                  {showChatHistory
                    ? `${chatHistory.length} saved conversation${chatHistory.length === 1 ? '' : 's'} available for this workspace.`
                    : modelMeta.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {!showChatHistory && (
                <>
                  <button
                    onClick={startNewChat}
                    className={headerActionButtonClassName}
                    title="New chat"
                  >
                    <Plus size={15} />
                  </button>
                  {messages.length > 0 && (
                    <button
                      onClick={handleClearChat}
                      className={headerActionButtonClassName}
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
                  className={headerActionButtonClassName}
                  title={isLargeWindow ? 'Default size' : 'Expand'}
                >
                  {isLargeWindow ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className={headerActionButtonClassName}
                  title="Close"
                  aria-label="Close AI Assistant"
                >
                  <X size={15} />
                </button>
              )}
              {onToggleExpand && (
                <button
                  onClick={onToggleExpand}
                  className={headerActionButtonClassName}
                >
                  {isExpanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="assistant-soft-pop inline-flex items-center rounded-2xl border border-border/60 bg-surface/80 p-1 shadow-sm backdrop-blur" style={{ animationDelay: '80ms' }}>
              <button
                onClick={() => setShowChatHistory(false)}
                className={`assistant-hover-lift px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  !showChatHistory ? 'bg-foreground text-background shadow-sm' : 'text-muted hover:text-foreground'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setShowChatHistory(true)}
                className={`assistant-hover-lift px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  showChatHistory ? 'bg-foreground text-background shadow-sm' : 'text-muted hover:text-foreground'
                }`}
              >
                History
              </button>
            </div>

            {!showChatHistory && (
              <div className="flex items-center gap-2">
                <div className="assistant-soft-pop inline-flex items-center rounded-2xl border border-border/60 bg-surface/80 p-1 shadow-sm backdrop-blur" style={{ animationDelay: '120ms' }}>
                  <button
                    onClick={() => setModel('deepseek-v4-flash')}
                    className={`assistant-hover-lift px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      model === 'deepseek-v4-flash'
                        ? 'bg-surface text-foreground shadow-sm'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    V4 Flash
                  </button>
                  <button
                    onClick={() => setModel('deepseek-v4-pro')}
                    className={`assistant-hover-lift px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                      model === 'deepseek-v4-pro'
                        ? 'bg-alpine-600 text-white shadow-sm shadow-alpine-900/20'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    <Cpu size={11} />
                    V4 Pro
                  </button>
                </div>

                <button
                  onClick={() => setShowContextSidebar(v => !v)}
                  className={`assistant-soft-pop assistant-hover-lift inline-flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-medium shadow-sm backdrop-blur transition-all ${
                    showContextSidebar
                      ? 'border-alpine-500/20 bg-alpine-600/10 text-alpine-600 dark:text-alpine-300'
                      : 'border-border/60 bg-surface/80 text-muted hover:border-border-strong hover:text-foreground'
                  }`}
                  style={{ animationDelay: '150ms' }}
                >
                  <BookOpen size={11} />
                  Context
                  <span className="rounded-full bg-surface-active/70 px-1.5 py-0.5 text-[10px] text-foreground/70">
                    {activeContextSources}
                  </span>
                </button>
              </div>
            )}
          </div>

          {!showChatHistory && (
            <div className="toolbar-scroll -mx-1 px-1">
              <div className="flex min-w-max gap-2 pb-1">
                <div className="assistant-soft-pop assistant-hover-lift min-w-[168px] rounded-2xl border border-border/60 bg-surface/85 px-3.5 py-3 shadow-sm backdrop-blur" style={{ animationDelay: '150ms' }}>
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    <Cpu size={12} className="text-alpine-600" />
                    Model
                  </div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{modelMeta.shortLabel}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/65">{model === 'deepseek-v4-pro' ? 'Longer context and deep tool work.' : 'Fast turns and lightweight drafting.'}</p>
                </div>

                <div className="assistant-soft-pop assistant-hover-lift min-w-[168px] rounded-2xl border border-border/60 bg-surface/85 px-3.5 py-3 shadow-sm backdrop-blur" style={{ animationDelay: '230ms' }}>
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    <CheckSquare size={12} className="text-accent" />
                    Workspace
                  </div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{pendingTaskCount} active tasks</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/65">{workspaceNoteCount} notes and {upcomingEventCount} upcoming events available to reference.</p>
                </div>

                {quotaInfo && (
                  <div className="relative" ref={quotaPopoverRef}>
                    <button
                      onClick={() => setShowQuotaPopover(value => !value)}
                      className="assistant-soft-pop assistant-hover-lift min-w-[170px] rounded-2xl border border-border/60 bg-surface/85 px-3.5 py-3 text-left shadow-sm backdrop-blur transition-all hover:border-border-strong"
                      style={{ animationDelay: '270ms' }}
                    >
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                        <Zap size={12} className={quotaInfo.low ? 'text-warning' : 'text-alpine-600'} />
                        Quota
                      </div>
                      <div className="mt-2 text-sm font-semibold text-foreground">{quotaInfo.remaining} / {quotaInfo.limit} remaining</div>
                      <p className="mt-1 text-[11px] leading-relaxed text-foreground/65">Refresh window: {quotaWindowLabel}{quotaInfo.low ? ' • running low' : ''}</p>
                    </button>

                    {showQuotaPopover && (
                      <div className="assistant-rise-in absolute right-0 top-full z-20 mt-2 w-60 rounded-2xl border border-border-strong bg-surface p-3 shadow-2xl">
                        <div className="text-xs font-semibold text-foreground">Usage snapshot</div>
                        <div className="mt-2 space-y-2 text-xs text-foreground/75">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted">Remaining</span>
                            <span>{quotaInfo.remaining}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted">Limit</span>
                            <span>{quotaInfo.limit}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted">Window</span>
                            <span>{quotaWindowLabel}</span>
                          </div>
                          {quotaInfo.resetInSeconds !== null && (
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted">Resets in</span>
                              <span>{quotaInfo.resetInSeconds}s</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── MAIN RENDER ───────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(37,112,235,0.08),transparent_34%)] bg-surface">
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
