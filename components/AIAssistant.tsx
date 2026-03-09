'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { marked } from 'marked'
import {
  Send,
  Sparkles,
  Bot,
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
} from 'lucide-react'
import {
  chat,
  summarizeNote,
  editText,
  suggestMindmapNodes,
  suggestTasks,
  suggestEvents,
  hasAIApiKey,
  stripHtmlForAI,
  textToHtml,
  type AIMessage,
  type AIContext,
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

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
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
  onUpdateMindmapNode?: (nodeId: string, text: string, description?: string) => void
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
  const html = useMemo(() => renderMarkdown(content), [content])
  return (
    <div
      className={`text-sm leading-relaxed text-foreground
        [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
        [&_strong]:font-semibold [&_em]:italic
        [&_h1]:text-base [&_h1]:font-bold [&_h1]:my-2
        [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:my-1.5
        [&_h3]:text-sm [&_h3]:font-medium [&_h3]:my-1
        [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1.5
        [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1.5
        [&_li]:my-0.5
        [&_code]:bg-surface-active [&_code]:text-foreground [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono
        [&_pre]:bg-surface-active [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-auto [&_pre]:my-2
        [&_pre>code]:bg-transparent [&_pre>code]:p-0
        [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_blockquote]:my-1.5
        [&_a]:text-alpine-600 [&_a]:underline hover:[&_a]:text-alpine-700
        [&_hr]:border-border [&_hr]:my-3
        ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
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
  onReplaceSelection,
  onInsertAtCursor,
  onCreateTask,
  onCreateEvent,
  onAddMindmapNode,
  isExpanded = true,
  onToggleExpand,
}: AIAssistantProps) {
  // Key is configured via NEXT_PUBLIC_DEEPSEEK_API_KEY in .env.local
  const isConfigured = hasAIApiKey()

  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatHistoryRef = useRef<AIMessage[]>([])

  useEffect(() => {
    if (showChatHistory) loadChatHistory()
  }, [showChatHistory, note?.id])

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
    if (note) {
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
    return context
  }, [note, noteContent, selectedText, mindmapData, selectedMindmapNodeId, tasks, events, allNotes])

  const handleToolCall: ToolCallHandler = useCallback(async (name, args) => {
    switch (name) {
      case 'list_notes': {
        if (!allNotes?.length) return 'No notes available.'
        return `Available notes:\n${allNotes.map(n => `- "${n.title || 'Untitled'}" (ID: ${n.id})`).join('\n')}`
      }
      case 'read_note': {
        const noteId = args.noteId as string | undefined
        const noteTitle = args.noteTitle as string | undefined
        if (!allNotes?.length) return 'No notes available.'
        let targetNote: Note | undefined
        if (noteId) targetNote = allNotes.find(n => n.id === noteId)
        else if (noteTitle) targetNote = allNotes.find(n => n.title?.toLowerCase().includes(noteTitle.toLowerCase()))
        if (!targetNote) return `Note not found. Available: ${allNotes.map(n => n.title || 'Untitled').join(', ')}`
        return `Note: "${targetNote.title || 'Untitled'}"\nType: ${targetNote.note_type || 'rich-text'}\n\nContent:\n${stripHtmlForAI(targetNote.content || '')}`
      }
      case 'search_notes': {
        const query = ((args.query as string) || '').toLowerCase()
        if (!query) return 'No search query provided.'
        if (!allNotes?.length) return 'No notes available to search.'
        const results = allNotes.filter(n => {
          const t = (n.title || '').toLowerCase()
          const c = stripHtmlForAI(n.content || '').toLowerCase()
          return t.includes(query) || c.includes(query)
        })
        if (!results.length) return `No notes found matching "${query}".`
        const excerpts = results.slice(0, 5).map(n => {
          const c = stripHtmlForAI(n.content || '')
          return `- "${n.title || 'Untitled'}": ${c.slice(0, 200)}${c.length > 200 ? '...' : ''}`
        })
        return `Found ${results.length} note(s) matching "${query}":\n${excerpts.join('\n\n')}`
      }
      default:
        return `Unknown tool: ${name}`
    }
  }, [allNotes])

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)
    setError(null)
    setStreamingContent('')

    chatHistoryRef.current = [...chatHistoryRef.current, { role: 'user', content: userMessage.content }]

    const assistantMessageId = `assistant-${Date.now()}`

    try {
      let fullResponse = ''

      setMessages(prev => [...prev, {
        id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true,
      }])

      await chat(
        userMessage.content,
        aiContext,
        chatHistoryRef.current.slice(0, -1),
        (token) => { fullResponse += token; setStreamingContent(fullResponse) },
        allNotes?.length ? handleToolCall : undefined
      )

      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId ? { ...msg, content: fullResponse, isStreaming: false } : msg
      ))

      chatHistoryRef.current = [...chatHistoryRef.current, { role: 'assistant', content: fullResponse }]

      try {
        const chatMessages: DBMessage[] = chatHistoryRef.current
          .filter(msg => msg.role === 'user' || msg.role === 'assistant')
          .map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content, timestamp: new Date().toISOString() }))

        if (currentChatId) {
          await updateAIChat(currentChatId, { messages: chatMessages })
        } else {
          const chatTitle = userMessage.content.slice(0, TEXT_TRUNCATION_SHORT) + (userMessage.content.length > TEXT_TRUNCATION_SHORT ? '...' : '')
          const newChat = await createAIChat({ note_id: note?.id || null, title: chatTitle, messages: chatMessages })
          if (newChat) setCurrentChatId(newChat.id)
        }
      } catch (saveErr) {
        console.error('Failed to save chat:', saveErr)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId))
    } finally {
      setIsLoading(false)
      setStreamingContent('')
    }
  }, [inputValue, isLoading, aiContext, allNotes, handleToolCall, currentChatId, note?.id])

  const handleQuickAction = useCallback(async (action: QuickAction) => {
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
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [aiContext, selectedText])

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
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="flex-1 overflow-y-auto">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={20} className="animate-spin text-muted" />
              <span className="text-xs text-muted">Loading history…</span>
            </div>
          </div>
        ) : chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6">
            <div className="w-14 h-14 rounded-2xl bg-surface-hover flex items-center justify-center mb-4">
              <MessageSquare size={24} className="text-muted" />
            </div>
            <p className="text-sm font-medium text-foreground/80">No conversations yet</p>
            <p className="text-xs text-muted mt-1 text-center">Start a conversation to see it saved here</p>
          </div>
        ) : (
          <div className="p-3 space-y-1.5">
            {chatHistory.map(c => (
              <button
                key={c.id}
                onClick={() => loadChat(c)}
                className={`w-full p-3 text-left rounded-xl transition-all duration-150 group border ${
                  currentChatId === c.id
                    ? 'bg-alpine-600 border-alpine-600 text-white shadow-sm'
                    : 'bg-surface border-border hover:bg-surface-hover hover:border-border-strong'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-xs font-medium truncate ${currentChatId === c.id ? 'text-white' : 'text-foreground'}`}>
                      {c.title}
                    </h4>
                    <div className={`flex items-center gap-1.5 mt-0.5 text-[10px] ${currentChatId === c.id ? 'text-white/60' : 'text-muted'}`}>
                      <span>{c.messages.length} msgs</span>
                      <span>·</span>
                      <span>{new Date(c.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteChat(c.id, e)}
                    className={`p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${
                      currentChatId === c.id
                        ? 'hover:bg-white/20 text-white/60 hover:text-white'
                        : 'hover:bg-surface-active text-muted hover:text-danger'
                    }`}
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="p-3 border-t border-border shrink-0">
        <button
          onClick={startNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-alpine-600 text-white text-sm font-medium rounded-xl hover:bg-alpine-700 transition-colors"
        >
          <Plus size={14} />
          New Conversation
        </button>
      </div>
    </div>
  )

  // ─── QUICK ACTIONS ─────────────────────────────────────────────────────────

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
    ]

    const hasSelection = !!(selectedText?.trim())
    const actionBtn = (action: QuickAction, icon: React.ReactNode, label: string, variant: 'primary' | 'default' = 'default') => (
      <button
        key={action}
        onClick={() => handleQuickAction(action)}
        disabled={isLoading || !isConfigured}
        className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-center ${
          variant === 'primary'
            ? 'bg-alpine-600 text-white hover:bg-alpine-700'
            : 'bg-surface border border-border text-muted hover:bg-surface-hover hover:border-border-strong hover:text-foreground group'
        }`}
      >
        {icon}
        <span className="text-[10px] font-medium leading-tight">{label}</span>
      </button>
    )

    return (
      <div className="p-3 border-b border-border bg-surface-hover/30 shrink-0">
        {hasSelection && (
          <div className="mb-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <MousePointerClick size={11} className="text-alpine-500" />
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Selection</span>
              <span className="text-[10px] text-muted italic truncate max-w-[120px]">
                &ldquo;{selectedText!.slice(0, 24)}{selectedText!.length > 24 ? '…' : ''}&rdquo;
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {selectionActions.map(({ action, icon, label }) => actionBtn(action, icon, label, 'primary'))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 mb-1.5">
          <Zap size={11} className="text-muted" />
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Quick Actions</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {writingActions.filter(a => a.show).map(({ action, icon, label }) => actionBtn(action, icon, label))}
          {note && noteActions.map(({ action, icon, label }) => actionBtn(action, icon, label))}
          {otherActions.filter(a => a.show).map(({ action, icon, label }) => actionBtn(action, icon, label))}
        </div>
      </div>
    )
  }

  // ─── SUGGESTIONS PANEL ─────────────────────────────────────────────────────

  const renderSuggestions = () => {
    if (!showSuggestions) return null
    return (
      <div className="p-3 border-b border-border bg-surface-hover/20 shrink-0 overflow-y-auto max-h-[40%]">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-alpine-500" />
            <span className="text-xs font-semibold text-foreground">AI Suggestions</span>
          </div>
          <button
            onClick={() => { setSuggestions({}); setShowSuggestions(false) }}
            className="p-1 hover:bg-surface-hover rounded-lg transition-colors"
          >
            <X size={12} className="text-muted" />
          </button>
        </div>

        {suggestions.summary && (
          <div className="bg-surface border border-border rounded-xl p-3 mb-2">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileText size={10} /> Summary
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">{suggestions.summary.summary}</p>
            {suggestions.summary.keyPoints.length > 0 && (
              <div className="mt-3 pt-2 border-t border-border">
                <div className="text-[10px] font-medium text-muted mb-1.5">Key Points</div>
                <ul className="space-y-1.5">
                  {suggestions.summary.keyPoints.map((point, i) => (
                    <li key={i} className="flex gap-2 text-xs text-foreground/70">
                      <span className="w-4 h-4 rounded-full bg-alpine-600/10 text-alpine-600 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold">{i + 1}</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {suggestions.summary.suggestedTasks && suggestions.summary.suggestedTasks.length > 0 && (
              <div className="mt-3 pt-2 border-t border-border">
                <div className="text-[10px] font-medium text-muted mb-1.5">Suggested Tasks</div>
                <div className="space-y-1">
                  {suggestions.summary.suggestedTasks.map((task, i) => (
                    <button key={i} onClick={() => handleApplyTask({ title: task })} className="flex items-center gap-2 w-full text-left text-xs text-foreground/70 hover:text-foreground p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
                      <Plus size={10} className="text-muted" /> {task}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {suggestions.tasks && suggestions.tasks.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-3 mb-2">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <CheckSquare size={10} /> Task Suggestions
            </div>
            <div className="space-y-1.5">
              {suggestions.tasks.map((task, i) => (
                <div key={i} className="flex items-start justify-between gap-2 p-2 bg-surface-hover/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">{task.title}</div>
                    {task.description && <div className="text-[10px] text-muted mt-0.5">{task.description}</div>}
                    <div className="flex items-center gap-1.5 mt-1">
                      {task.priority && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          task.priority === 'urgent' ? 'bg-danger text-white' :
                          task.priority === 'high' ? 'bg-warning-light text-warning' :
                          task.priority === 'low' ? 'bg-surface-active text-muted' :
                          'bg-alpine-600/10 text-alpine-600'
                        }`}>{task.priority}</span>
                      )}
                      {task.dueDate && <span className="text-[10px] text-muted">{task.dueDate}</span>}
                    </div>
                  </div>
                  {onCreateTask && (
                    <button onClick={() => handleApplyTask(task)} className="px-2 py-1 text-[10px] font-medium bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 transition-colors flex-shrink-0">
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {suggestions.events && suggestions.events.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-3 mb-2">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calendar size={10} /> Event Suggestions
            </div>
            <div className="space-y-1.5">
              {suggestions.events.map((event, i) => (
                <div key={i} className="flex items-start justify-between gap-2 p-2 bg-surface-hover/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">{event.title}</div>
                    {event.description && <div className="text-[10px] text-muted mt-0.5">{event.description}</div>}
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted">
                      {event.suggestedDate && <span>{event.suggestedDate}</span>}
                      {event.duration && <span>({event.duration} min)</span>}
                    </div>
                  </div>
                  {onCreateEvent && event.suggestedDate && (
                    <button onClick={() => handleApplyEvent(event)} className="px-2 py-1 text-[10px] font-medium bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 transition-colors flex-shrink-0">
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {suggestions.mindmap && suggestions.mindmap.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-3">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Network size={10} /> Mindmap Ideas
            </div>
            <div className="space-y-1.5">
              {suggestions.mindmap.map((suggestion, i) => (
                <div key={i} className="flex items-start justify-between gap-2 p-2 bg-surface-hover/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">{suggestion.nodeText}</div>
                    {suggestion.description && <div className="text-[10px] text-muted mt-0.5">{suggestion.description}</div>}
                    {suggestion.childSuggestions && suggestion.childSuggestions.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {suggestion.childSuggestions.map((child, j) => (
                          <span key={j} className="text-[10px] px-1.5 py-0.5 bg-surface-active text-muted rounded-full">{child}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {onAddMindmapNode && (
                    <button onClick={() => handleApplyMindmapNode(suggestion)} className="px-2 py-1 text-[10px] font-medium bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 transition-colors flex-shrink-0">
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── STRUCTURED CONTENT ────────────────────────────────────────────────────

  const renderStructuredContent = (parsed: ParsedAIResponse) => {
    if (parsed.type === 'text') return <MarkdownContent content={parsed.rawText || ''} />
    return (
      <div className="space-y-3">
        {parsed.summary && (
          <div>
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FileText size={10} /> Summary
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">{parsed.summary}</p>
          </div>
        )}
        {parsed.keyPoints && parsed.keyPoints.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
              <Lightbulb size={10} /> Key Points
            </div>
            <ul className="space-y-2">
              {parsed.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground/80">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-alpine-600 text-white text-[10px] font-semibold flex items-center justify-center">{i + 1}</span>
                  <span className="leading-relaxed pt-0.5">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {parsed.suggestedTasks && parsed.suggestedTasks.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <CheckSquare size={10} /> Suggested Tasks
            </div>
            <ul className="space-y-1.5">
              {parsed.suggestedTasks.map((task, i) => (
                <li key={i} className="flex items-start gap-2 group">
                  <div className="flex-1 text-sm text-foreground/80 bg-surface-hover px-3 py-2 rounded-lg border border-border">{task}</div>
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

  // ─── MESSAGES ──────────────────────────────────────────────────────────────

  const renderMessages = () => (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full py-8">
          <div className="w-14 h-14 rounded-2xl bg-alpine-600/10 flex items-center justify-center mb-3">
            <Bot size={26} className="text-alpine-500" />
          </div>
          <p className="text-sm font-medium text-foreground/70">AI Assistant</p>
          <p className="text-xs text-muted mt-1 text-center max-w-[200px] leading-relaxed">
            {isConfigured
              ? 'Ask me anything about your notes, tasks, or ideas'
              : 'Set NEXT_PUBLIC_DEEPSEEK_API_KEY in .env.local to enable AI'}
          </p>
        </div>
      ) : (
        messages.map((message) => {
          const parsed = message.role === 'assistant' && !message.isStreaming
            ? parseAIResponse(message.content) : null
          const isStructured = parsed?.type === 'structured'

          return (
            <div key={message.id} className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
                message.role === 'user'
                  ? 'bg-alpine-600 text-white'
                  : 'bg-surface-hover border border-border text-muted'
              }`}>
                {message.role === 'user' ? <User size={13} /> : <Sparkles size={13} />}
              </div>

              <div
                className={`flex-1 min-w-0 ${message.role === 'user' ? 'text-right' : ''}`}
                style={{ maxWidth: isStructured ? '100%' : '88%' }}
              >
                <div className={`inline-block px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-alpine-600 text-white rounded-tr-sm max-w-full'
                    : isStructured
                      ? 'bg-surface border border-border text-foreground rounded-tl-sm w-full'
                      : 'bg-surface border border-border text-foreground rounded-tl-sm'
                }`}>
                  {message.isStreaming ? (
                    streamingContent ? (
                      <MarkdownContent content={streamingContent} />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Loader2 size={12} className="animate-spin text-muted" />
                        <span className="text-xs text-muted">Thinking…</span>
                      </div>
                    )
                  ) : parsed ? (
                    renderStructuredContent(parsed)
                  ) : message.role === 'assistant' ? (
                    <MarkdownContent content={message.content} />
                  ) : (
                    <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                  )}
                </div>

                {message.role === 'assistant' && !message.isStreaming && (
                  <div className="flex items-center gap-0.5 mt-1 flex-wrap">
                    <button onClick={() => handleCopy(message.content, message.id)} className="p-1 text-muted hover:text-foreground hover:bg-surface-hover rounded-md transition-all" title="Copy">
                      {copiedId === message.id ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                    </button>
                    {onInsertText && (
                      <button onClick={() => handleInsertToNote(message.content)} className="p-1 text-muted hover:text-foreground hover:bg-surface-hover rounded-md transition-all" title="Append to note">
                        <FileText size={11} />
                      </button>
                    )}
                    {onInsertAtCursor && (
                      <button onClick={() => handleInsertAtCursorPosition(message.content)} className="p-1 text-muted hover:text-foreground hover:bg-surface-hover rounded-md transition-all" title="Insert at cursor">
                        <PenLine size={11} />
                      </button>
                    )}
                    {selectedText && onReplaceSelection && (
                      <button onClick={() => handleReplaceSelectionWithResponse(message.content)} className="p-1 text-muted hover:text-foreground hover:bg-surface-hover rounded-md transition-all" title="Replace selection">
                        <ArrowRight size={11} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}
      <div ref={messagesEndRef} />
    </div>
  )

  // ─── INPUT ─────────────────────────────────────────────────────────────────

  const renderInput = () => (
    <div className="p-3 border-t border-border bg-surface shrink-0">
      {error && (
        <div className="mb-2 px-3 py-2 bg-danger-light border border-danger/20 rounded-xl text-xs text-danger flex items-start gap-2">
          <X size={12} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="p-0.5 hover:bg-danger/10 rounded transition-colors">
            <X size={10} />
          </button>
        </div>
      )}

      {!isConfigured && (
        <div className="mb-2 px-3 py-2 bg-warning-light border border-warning/20 rounded-xl text-xs text-foreground/70 flex items-start gap-2">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5 text-warning" />
          <span>Set <code className="font-mono bg-surface-active px-1 rounded text-[10px]">NEXT_PUBLIC_DEEPSEEK_API_KEY</code> in .env.local to enable AI.</span>
        </div>
      )}

      {selectedText?.trim() && (
        <div className="mb-2 px-3 py-2 bg-alpine-600/5 border border-alpine-600/15 rounded-xl text-xs flex items-start gap-2">
          <MousePointerClick size={11} className="flex-shrink-0 mt-0.5 text-alpine-500" />
          <div className="flex-1 min-w-0">
            <span className="font-medium text-foreground/70">Selected: </span>
            <span className="text-muted italic">
              &ldquo;{selectedText.length > TEXT_TRUNCATION_MEDIUM ? selectedText.slice(0, TEXT_TRUNCATION_MEDIUM) + '…' : selectedText}&rdquo;
            </span>
          </div>
        </div>
      )}

      <div className="relative">
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isConfigured ? (selectedText ? 'Ask about the selection…' : 'Ask anything…') : 'Configure API key to start…'}
          disabled={isLoading || !isConfigured}
          rows={1}
          className="w-full px-3 py-2.5 pr-11 text-sm bg-surface-hover border border-border rounded-xl resize-none focus:ring-2 focus:ring-alpine-500/30 focus:border-alpine-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all text-foreground placeholder:text-muted"
          style={{ minHeight: '44px', maxHeight: '120px' }}
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading || !isConfigured}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-alpine-600 text-white rounded-lg hover:bg-alpine-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>

      <div className="flex items-center justify-between mt-2 text-[10px] text-muted">
        <span>Enter to send · Shift+Enter for new line</span>
        <button
          onClick={handleClearChat}
          disabled={messages.length === 0}
          className="p-1 hover:bg-surface-hover hover:text-foreground disabled:opacity-30 rounded-lg transition-all"
          title="Clear chat"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )

  // ─── MAIN RENDER ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          {showChatHistory ? (
            <button
              onClick={() => setShowChatHistory(false)}
              className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors"
            >
              <ChevronLeft size={16} className="text-muted" />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-alpine-600 flex items-center justify-center flex-shrink-0">
              <Sparkles size={15} className="text-white" />
            </div>
          )}
          <div>
            <h3 className="font-semibold text-sm text-foreground leading-tight">
              {showChatHistory ? 'History' : 'AI Assistant'}
            </h3>
            <p className="text-[10px] text-muted leading-tight">
              {showChatHistory
                ? `${chatHistory.length} conversation${chatHistory.length !== 1 ? 's' : ''}`
                : 'Powered by DeepSeek'}
            </p>
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
            </>
          )}
          {isConfigured && !showChatHistory && (
            <span className="px-2 py-0.5 bg-accent-light text-accent text-[10px] font-medium rounded-full ml-1">
              Connected
            </span>
          )}
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all ml-0.5"
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
    </div>
  )
}
