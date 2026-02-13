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
  Settings,
  Key,
  Eye,
  EyeOff,
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
  BookOpen,
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
  MoreHorizontal,
} from 'lucide-react'
import {
  chat,
  summarizeNote,
  editText,
  suggestMindmapNodes,
  suggestTasks,
  suggestEvents,
  setAIApiKey,
  getAIApiKey,
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

// Text truncation lengths for display
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
  // Current note context
  note?: Note | null
  noteContent?: string
  
  // Selected text from the editor - key for deep integration
  selectedText?: string
  
  // All notes for tool calling
  allNotes?: Note[]
  
  // Mindmap context (if editing a mindmap)
  mindmapData?: MindmapData | null
  selectedMindmapNodeId?: string | null
  
  // Tasks and calendar data
  tasks?: Task[]
  taskStats?: TaskStats | null
  events?: CalendarEvent[]
  
  // Callbacks for actions
  onInsertText?: (text: string) => void
  onReplaceText?: (text: string) => void
  onReplaceSelection?: (text: string) => void // Replace selected text specifically
  onInsertAtCursor?: (text: string) => void // Insert at cursor position
  onCreateTask?: (title: string, options?: { description?: string; priority?: string; dueDate?: Date }) => void
  onCreateEvent?: (title: string, startTime: Date, endTime: Date, options?: { description?: string }) => void
  onAddMindmapNode?: (text: string, description?: string) => void
  onUpdateMindmapNode?: (nodeId: string, text: string, description?: string) => void
  
  // UI state
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
  // New selection-based actions for deep editor integration
  | 'continue-writing'
  | 'explain-selection'
  | 'improve-selection'
  | 'translate-selection'
  | 'simplify-selection'

// Parsed structured response from AI
interface ParsedAIResponse {
  type: 'structured' | 'text'
  summary?: string
  keyPoints?: string[]
  suggestedTasks?: string[]
  rawText?: string
}

// Try to parse structured JSON from AI response
function parseAIResponse(content: string): ParsedAIResponse {
  // Helper to extract balanced JSON from a starting position
  const extractBalancedJSON = (str: string, startIdx: number): string | null => {
    if (str[startIdx] !== '{') return null
    let braceCount = 0
    let inString = false
    let escape = false
    
    for (let i = startIdx; i < str.length; i++) {
      const char = str[i]
      
      if (escape) {
        escape = false
        continue
      }
      
      if (char === '\\' && inString) {
        escape = true
        continue
      }
      
      if (char === '"' && !escape) {
        inString = !inString
        continue
      }
      
      if (!inString) {
        if (char === '{') braceCount++
        else if (char === '}') {
          braceCount--
          if (braceCount === 0) {
            return str.substring(startIdx, i + 1)
          }
        }
      }
    }
    return null
  }
  
  // Try to extract JSON from markdown code block
  const codeBlockMatch = content.match(/```(?:json)?\s*/)
  if (codeBlockMatch) {
    const startOfJson = content.indexOf('{', codeBlockMatch.index)
    if (startOfJson !== -1) {
      const jsonStr = extractBalancedJSON(content, startOfJson)
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr)
          if (parsed.summary || parsed.keyPoints || parsed.suggestedTasks) {
            return {
              type: 'structured',
              summary: parsed.summary,
              keyPoints: parsed.keyPoints,
              suggestedTasks: parsed.suggestedTasks,
            }
          }
        } catch {
          // Continue to other methods
        }
      }
    }
  }
  
  // Try to find any JSON object in the content
  const firstBrace = content.indexOf('{')
  if (firstBrace !== -1) {
    const jsonStr = extractBalancedJSON(content, firstBrace)
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr)
        if (parsed.summary || parsed.keyPoints || parsed.suggestedTasks) {
          return {
            type: 'structured',
            summary: parsed.summary,
            keyPoints: parsed.keyPoints,
            suggestedTasks: parsed.suggestedTasks,
          }
        }
      } catch {
        // Fall through to text
      }
    }
  }
  
  return { type: 'text', rawText: content }
}

// ============================================================================
// COMPONENT
// ============================================================================

// Configure marked for chat messages
marked.setOptions({
  gfm: true,
  breaks: true,
})

// Render markdown to HTML safely
function renderMarkdown(content: string): string {
  try {
    // Use marked.parse synchronously
    const html = marked.parse(content, { async: false }) as string
    return html
  } catch {
    return content
  }
}

// Markdown content component with liquid glass styling
function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(content), [content])
  
  return (
    <div 
      className={`prose prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-black/90 prose-pre:text-gray-100 prose-pre:border prose-pre:border-white/10 prose-code:text-black prose-code:bg-black/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-medium prose-code:before:content-none prose-code:after:content-none prose-a:text-black prose-a:underline prose-a:decoration-black/30 hover:prose-a:decoration-black/60 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function AIAssistant({
  note,
  noteContent,
  selectedText,
  allNotes,
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
  onUpdateMindmapNode,
  isExpanded = true,
  onToggleExpand,
}: AIAssistantProps) {
  // State
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKeyState] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<{
    tasks?: TaskSuggestion[]
    events?: CalendarSuggestion[]
    mindmap?: MindmapSuggestion[]
    summary?: NoteSummary
  }>({})
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  // Chat history state
  const [showChatHistory, setShowChatHistory] = useState(false)
  const [chatHistory, setChatHistory] = useState<AIChat[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatHistoryRef = useRef<AIMessage[]>([])
  
  // Check for API key on mount
  useEffect(() => {
    const key = getAIApiKey()
    setHasKey(!!key)
    if (key) {
      setApiKeyState(key)
    }
  }, [])
  
  // Load chat history when note changes or history panel opens
  useEffect(() => {
    if (showChatHistory) {
      loadChatHistory()
    }
  }, [showChatHistory, note?.id])
  
  const loadChatHistory = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const chats = note?.id 
        ? await getAIChatsByNote(note.id)
        : await getAIChats()
      setChatHistory(chats)
    } catch (err) {
      console.error('Failed to load chat history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [note?.id])
  
  // Load a specific chat from history
  const loadChat = useCallback(async (chat: AIChat) => {
    setCurrentChatId(chat.id)
    setMessages(chat.messages.map((msg, i) => ({
      id: `${msg.role}-${i}-${Date.now()}`,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp),
    })))
    chatHistoryRef.current = chat.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }))
    setShowChatHistory(false)
  }, [])
  
  // Start a new chat
  const startNewChat = useCallback(() => {
    setCurrentChatId(null)
    setMessages([])
    chatHistoryRef.current = []
    setShowChatHistory(false)
  }, [])
  
  // Delete a chat from history
  const handleDeleteChat = useCallback(async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await deleteAIChat(chatId)
      setChatHistory(prev => prev.filter(c => c.id !== chatId))
      if (currentChatId === chatId) {
        startNewChat()
      }
    } catch (err) {
      console.error('Failed to delete chat:', err)
    }
  }, [currentChatId, startNewChat])
  
  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])
  
  // Build context for AI
  const aiContext = useMemo((): AIContext => {
    const context: AIContext = {}
    
    if (note) {
      const plainContent = noteContent 
        ? stripHtmlForAI(noteContent)
        : note.content 
          ? stripHtmlForAI(note.content)
          : ''
      
      context.currentNote = {
        id: note.id,
        title: note.title || 'Untitled',
        content: plainContent,
        type: (note.note_type || 'rich-text') as 'rich-text' | 'drawing' | 'mindmap' | 'bullet-journal',
      }
    }
    
    // Include selected text for context-aware AI interactions
    if (selectedText && selectedText.trim()) {
      context.selectedText = selectedText
    }
    
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
    
    if (tasks && tasks.length > 0) {
      context.tasks = tasks.slice(0, 20).map(task => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.due_date || undefined,
        priority: task.priority,
      }))
    }
    
    if (events && events.length > 0) {
      context.events = events.slice(0, 10).map(event => ({
        id: event.id,
        title: event.title,
        startTime: event.start_time,
        endTime: event.end_time,
      }))
    }
    
    // Add all notes for tool calling
    if (allNotes && allNotes.length > 0) {
      context.allNotes = allNotes.map(n => ({
        id: n.id,
        title: n.title || 'Untitled',
      }))
    }
    
    return context
  }, [note, noteContent, selectedText, mindmapData, selectedMindmapNodeId, tasks, events, allNotes])
  
  // Tool call handler for AI to access notes
  const handleToolCall: ToolCallHandler = useCallback(async (name, args) => {
    switch (name) {
      case 'list_notes': {
        if (!allNotes || allNotes.length === 0) {
          return 'No notes available.'
        }
        const noteList = allNotes.map(n => `- "${n.title || 'Untitled'}" (ID: ${n.id})`).join('\n')
        return `Available notes:\n${noteList}`
      }
      
      case 'read_note': {
        const noteId = args.noteId as string | undefined
        const noteTitle = args.noteTitle as string | undefined
        
        if (!allNotes || allNotes.length === 0) {
          return 'No notes available.'
        }
        
        let targetNote: Note | undefined
        if (noteId) {
          targetNote = allNotes.find(n => n.id === noteId)
        } else if (noteTitle) {
          targetNote = allNotes.find(n => 
            n.title?.toLowerCase().includes(noteTitle.toLowerCase())
          )
        }
        
        if (!targetNote) {
          return `Note not found. Available notes: ${allNotes.map(n => n.title || 'Untitled').join(', ')}`
        }
        
        const content = stripHtmlForAI(targetNote.content || '')
        return `Note: "${targetNote.title || 'Untitled'}"\nType: ${targetNote.note_type || 'rich-text'}\n\nContent:\n${content}`
      }
      
      case 'search_notes': {
        const query = (args.query as string || '').toLowerCase()
        if (!query) {
          return 'No search query provided.'
        }
        
        if (!allNotes || allNotes.length === 0) {
          return 'No notes available to search.'
        }
        
        const results = allNotes.filter(n => {
          const title = (n.title || '').toLowerCase()
          const content = stripHtmlForAI(n.content || '').toLowerCase()
          return title.includes(query) || content.includes(query)
        })
        
        if (results.length === 0) {
          return `No notes found matching "${query}".`
        }
        
        const excerpts = results.slice(0, 5).map(n => {
          const content = stripHtmlForAI(n.content || '')
          const excerpt = content.slice(0, 200) + (content.length > 200 ? '...' : '')
          return `- "${n.title || 'Untitled'}": ${excerpt}`
        })
        
        return `Found ${results.length} note(s) matching "${query}":\n${excerpts.join('\n\n')}`
      }
      
      default:
        return `Unknown tool: ${name}`
    }
  }, [allNotes])
  
  // Handle saving API key
  const handleSaveApiKey = useCallback(() => {
    if (apiKey.trim()) {
      setAIApiKey(apiKey.trim())
      setHasKey(true)
      setShowSettings(false)
      setError(null)
    }
  }, [apiKey])
  
  // Handle sending a message
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return
    
    if (!hasKey) {
      setError('Please configure your DeepSeek API key first.')
      setShowSettings(true)
      return
    }
    
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
    
    // Add to chat history
    chatHistoryRef.current = [
      ...chatHistoryRef.current,
      { role: 'user', content: userMessage.content },
    ]
    
    const assistantMessageId = `assistant-${Date.now()}`
    
    try {
      let fullResponse = ''
      
      // Add placeholder for streaming response
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      }])
      
      await chat(
        userMessage.content,
        aiContext,
        chatHistoryRef.current.slice(0, -1), // Exclude the latest user message as it's passed separately
        (token) => {
          fullResponse += token
          setStreamingContent(fullResponse)
        },
        allNotes && allNotes.length > 0 ? handleToolCall : undefined
      )
      
      // Update message with complete response
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? { ...msg, content: fullResponse, isStreaming: false }
          : msg
      ))
      
      // Add to chat history
      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        { role: 'assistant', content: fullResponse },
      ]
      
      // Save to database
      try {
        const chatMessages: DBMessage[] = chatHistoryRef.current
          .filter(msg => msg.role === 'user' || msg.role === 'assistant')
          .map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date().toISOString(),
          }))
        
        if (currentChatId) {
          // Update existing chat
          await updateAIChat(currentChatId, {
            messages: chatMessages,
          })
        } else {
          // Create new chat
          const title = userMessage.content.slice(0, TEXT_TRUNCATION_SHORT) + (userMessage.content.length > TEXT_TRUNCATION_SHORT ? '...' : '')
          const newChat = await createAIChat({
            note_id: note?.id || null,
            title,
            messages: chatMessages,
          })
          if (newChat) {
            setCurrentChatId(newChat.id)
          }
        }
      } catch (saveErr) {
        console.error('Failed to save chat:', saveErr)
        // Don't show error to user, chat saving is non-critical
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      
      // Remove the streaming placeholder
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId))
    } finally {
      setIsLoading(false)
      setStreamingContent('')
    }
  }, [inputValue, isLoading, hasKey, aiContext, allNotes, handleToolCall, currentChatId, note?.id])
  
  // Handle quick actions
  const handleQuickAction = useCallback(async (action: QuickAction) => {
    if (!hasKey) {
      setError('Please configure your DeepSeek API key first.')
      setShowSettings(true)
      return
    }
    
    setIsLoading(true)
    setError(null)
    
    try {
      switch (action) {
        case 'summarize': {
          if (!aiContext.currentNote?.content) {
            setError('No note content to summarize')
            break
          }
          const summary = await summarizeNote(
            aiContext.currentNote.content,
            aiContext.currentNote.title
          )
          setSuggestions(prev => ({ ...prev, summary }))
          setShowSuggestions(true)
          break
        }
        
        case 'improve-writing':
        case 'fix-grammar':
        case 'make-concise':
        case 'expand': {
          if (!aiContext.currentNote?.content) {
            setError('No note content to edit')
            break
          }
          const instructions = {
            'improve-writing': 'Improve the writing quality, clarity, and flow',
            'fix-grammar': 'Fix any grammar, spelling, or punctuation errors',
            'make-concise': 'Make this text more concise while keeping the key information',
            'expand': 'Expand on this text with more detail and examples',
          }
          const edited = await editText(
            aiContext.currentNote.content,
            instructions[action]
          )
          // Show as a message
          setMessages(prev => [...prev, {
            id: `action-${Date.now()}`,
            role: 'assistant',
            content: `**${action.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}:**\n\n${edited}`,
            timestamp: new Date(),
          }])
          break
        }
        
        // New selection-based actions for deep editor integration
        case 'continue-writing': {
          const textToUse = selectedText?.trim() || aiContext.currentNote?.content
          if (!textToUse) {
            setError('No content to continue from. Select text or have content in the note.')
            break
          }
          const continued = await editText(
            textToUse.slice(-CONTEXT_LENGTH_LIMIT), // Use last 1000 chars for context
            'Continue writing from where this text ends. Maintain the same style, tone, and topic. Provide a natural continuation that flows seamlessly.'
          )
          // Show as a message with insert option
          const messageId = `action-${Date.now()}`
          setMessages(prev => [...prev, {
            id: messageId,
            role: 'assistant',
            content: `**Continue Writing:**\n\n${continued}`,
            timestamp: new Date(),
          }])
          break
        }
        
        case 'explain-selection': {
          if (!selectedText?.trim()) {
            setError('Please select some text to explain')
            break
          }
          const explanation = await editText(
            selectedText,
            'Explain this text in simple terms. Break down any complex concepts, define technical terms, and provide helpful context.'
          )
          setMessages(prev => [...prev, {
            id: `action-${Date.now()}`,
            role: 'assistant',
            content: `**Explanation:**\n\n${explanation}`,
            timestamp: new Date(),
          }])
          break
        }
        
        case 'improve-selection': {
          if (!selectedText?.trim()) {
            setError('Please select some text to improve')
            break
          }
          const improved = await editText(
            selectedText,
            'Improve this text. Enhance clarity, fix any errors, improve flow, and make it more engaging while preserving the original meaning.'
          )
          setMessages(prev => [...prev, {
            id: `action-${Date.now()}`,
            role: 'assistant',
            content: `**Improved Version:**\n\n${improved}`,
            timestamp: new Date(),
          }])
          break
        }
        
        case 'translate-selection': {
          if (!selectedText?.trim()) {
            setError('Please select some text to translate')
            break
          }
          const translated = await editText(
            selectedText,
            'Translate this text to English if it is in another language, or to Spanish if it is in English. Provide a natural, fluent translation.'
          )
          setMessages(prev => [...prev, {
            id: `action-${Date.now()}`,
            role: 'assistant',
            content: `**Translation:**\n\n${translated}`,
            timestamp: new Date(),
          }])
          break
        }
        
        case 'simplify-selection': {
          if (!selectedText?.trim()) {
            setError('Please select some text to simplify')
            break
          }
          const simplified = await editText(
            selectedText,
            'Simplify this text. Use simpler words, shorter sentences, and clearer explanations. Make it accessible to a general audience while keeping the essential meaning.'
          )
          setMessages(prev => [...prev, {
            id: `action-${Date.now()}`,
            role: 'assistant',
            content: `**Simplified:**\n\n${simplified}`,
            timestamp: new Date(),
          }])
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
          if (!aiContext.mindmapData?.selectedNodeText) {
            setError('Please select a mindmap node first')
            break
          }
          const mindmapSuggestions = await suggestMindmapNodes(
            aiContext.mindmapData.selectedNodeText,
            aiContext.mindmapData.selectedNodeDescription
          )
          setSuggestions(prev => ({ ...prev, mindmap: mindmapSuggestions }))
          setShowSuggestions(true)
          break
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [hasKey, aiContext, selectedText])
  
  // Copy message content
  const handleCopy = useCallback((content: string, id: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])
  
  // Clear chat history
  const handleClearChat = useCallback(() => {
    setMessages([])
    chatHistoryRef.current = []
    setSuggestions({})
    setShowSuggestions(false)
  }, [])
  
  // Apply a task suggestion
  const handleApplyTask = useCallback((task: TaskSuggestion) => {
    if (onCreateTask) {
      onCreateTask(task.title, {
        description: task.description,
        priority: task.priority,
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
      })
    }
  }, [onCreateTask])
  
  // Apply an event suggestion
  const handleApplyEvent = useCallback((event: CalendarSuggestion) => {
    if (onCreateEvent && event.suggestedDate) {
      const startTime = new Date(event.suggestedDate)
      const endTime = new Date(startTime.getTime() + (event.duration || 60) * 60000)
      onCreateEvent(event.title, startTime, endTime, {
        description: event.description,
      })
    }
  }, [onCreateEvent])
  
  // Apply a mindmap suggestion
  const handleApplyMindmapNode = useCallback((suggestion: MindmapSuggestion) => {
    if (onAddMindmapNode) {
      onAddMindmapNode(suggestion.nodeText, suggestion.description)
    }
  }, [onAddMindmapNode])
  
  // Insert AI response into note (at end)
  const handleInsertToNote = useCallback((content: string) => {
    if (onInsertText) {
      // Convert markdown-like content to HTML
      onInsertText(textToHtml(content))
    }
  }, [onInsertText])
  
  // Insert AI response at cursor position
  const handleInsertAtCursorPosition = useCallback((content: string) => {
    if (onInsertAtCursor) {
      // Convert markdown-like content to HTML
      onInsertAtCursor(textToHtml(content))
    } else if (onInsertText) {
      // Fallback to append at end
      onInsertText(textToHtml(content))
    }
  }, [onInsertAtCursor, onInsertText])
  
  // Replace selected text with AI response
  const handleReplaceSelectionWithResponse = useCallback((content: string) => {
    if (selectedText && onReplaceSelection) {
      // Strip markdown formatting for clean text replacement
      // This handles: bold (**text**, __text__), italic (*text*, _text_), 
      // headers (#...), code (`text`, ```text```), links [text](url), and more
      const plainText = content
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`([^`]+)`/g, '$1') // Remove inline code, keep content
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to just text
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
        .replace(/#{1,6}\s*/g, '') // Remove headers
        .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // Remove bold/italic markers, keep content
        .replace(/~~([^~]+)~~/g, '$1') // Remove strikethrough, keep content
        .replace(/>\s*/g, '') // Remove blockquote markers
        .replace(/[-*+]\s+/g, '') // Remove list markers
        .replace(/\d+\.\s+/g, '') // Remove numbered list markers
        .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
        .trim()
      onReplaceSelection(plainText)
    }
  }, [selectedText, onReplaceSelection])
  
  // Handle key press in input
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])
  
  // Render chat history panel with liquid glass theme
  const renderChatHistory = () => (
    <div className="flex-1 overflow-y-auto">
      {isLoadingHistory ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black/5 backdrop-blur-sm flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-black/40" />
            </div>
            <span className="text-xs text-black/40">Loading history...</span>
          </div>
        </div>
      ) : chatHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-black/5 to-black/10 backdrop-blur-md flex items-center justify-center mb-4">
            <MessageSquare size={28} className="text-black/30" />
          </div>
          <p className="text-sm font-medium text-black/60">No conversations yet</p>
          <p className="text-xs text-black/40 mt-1 text-center">
            Start a conversation to see it saved here
          </p>
        </div>
      ) : (
        <div className="p-3 space-y-2">
          {chatHistory.map(chat => (
            <button
              key={chat.id}
              onClick={() => loadChat(chat)}
              className={`w-full p-3 text-left rounded-xl transition-all duration-200 group ${
                currentChatId === chat.id
                  ? 'bg-black text-white shadow-lg'
                  : 'bg-white/60 backdrop-blur-sm hover:bg-white/80 border border-black/5 hover:border-black/10'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className={`text-sm font-medium truncate ${
                    currentChatId === chat.id ? 'text-white' : 'text-black/80'
                  }`}>
                    {chat.title}
                  </h4>
                  <div className={`flex items-center gap-2 mt-1 text-xs ${
                    currentChatId === chat.id ? 'text-white/60' : 'text-black/40'
                  }`}>
                    <span>{chat.messages.length} messages</span>
                    <span>·</span>
                    <span>
                      {new Date(chat.updated_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteChat(chat.id, e)}
                  className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${
                    currentChatId === chat.id
                      ? 'hover:bg-white/20 text-white/70 hover:text-white'
                      : 'hover:bg-black/5 text-black/30 hover:text-red-500'
                  }`}
                  title="Delete chat"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </button>
          ))}
        </div>
      )}
      
      {/* New Chat Button */}
      <div className="p-3 border-t border-black/5">
        <button
          onClick={startNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-black text-white text-sm font-medium rounded-xl hover:bg-black/90 transition-all duration-200 shadow-lg hover:shadow-xl"
        >
          <Plus size={16} />
          New Conversation
        </button>
      </div>
    </div>
  )
  
  // Render settings panel with liquid glass theme
  const renderSettings = () => (
    <div className="p-4 bg-gradient-to-b from-white/80 to-white/60 backdrop-blur-xl border-b border-black/5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-black flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-black/5 flex items-center justify-center">
            <Key size={14} className="text-black/60" />
          </div>
          API Configuration
        </h3>
        <button
          onClick={() => setShowSettings(false)}
          className="p-1.5 hover:bg-black/5 rounded-lg transition-colors"
        >
          <X size={16} className="text-black/40" />
        </button>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-black/60 mb-2">
            DeepSeek API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKeyState(e.target.value)}
              placeholder="sk-..."
              className="w-full px-4 py-2.5 pr-10 text-sm bg-white/80 backdrop-blur-sm border border-black/10 rounded-xl focus:ring-2 focus:ring-black/20 focus:border-black/20 focus:outline-none transition-all placeholder:text-black/30"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-black/30 hover:text-black/60 transition-colors"
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="mt-2 text-xs text-black/40">
            Get your API key from{' '}
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-black/60 underline hover:text-black transition-colors"
            >
              DeepSeek Platform
            </a>
          </p>
        </div>
        
        <button
          onClick={handleSaveApiKey}
          disabled={!apiKey.trim()}
          className="w-full px-4 py-2.5 bg-black text-white text-sm font-medium rounded-xl hover:bg-black/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
        >
          Save API Key
        </button>
      </div>
    </div>
  )
  
  // Render quick actions with liquid glass theme
  const renderQuickActions = () => {
    const noteActions: { action: QuickAction; icon: React.ReactNode; label: string }[] = [
      { action: 'summarize', icon: <FileText size={14} />, label: 'Summarize' },
      { action: 'improve-writing', icon: <Wand2 size={14} />, label: 'Improve' },
      { action: 'fix-grammar', icon: <Check size={14} />, label: 'Fix Grammar' },
      { action: 'make-concise', icon: <RefreshCw size={14} />, label: 'Concise' },
    ]
    
    // Selection-based actions - shown when text is selected
    const selectionActions: { action: QuickAction; icon: React.ReactNode; label: string }[] = [
      { action: 'explain-selection', icon: <HelpCircle size={14} />, label: 'Explain' },
      { action: 'improve-selection', icon: <Wand2 size={14} />, label: 'Improve' },
      { action: 'simplify-selection', icon: <Type size={14} />, label: 'Simplify' },
      { action: 'translate-selection', icon: <Languages size={14} />, label: 'Translate' },
    ]
    
    // Writing assistance actions
    const writingActions: { action: QuickAction; icon: React.ReactNode; label: string; show: boolean }[] = [
      { action: 'continue-writing', icon: <PenLine size={14} />, label: 'Continue Writing', show: !!note },
      { action: 'expand', icon: <ArrowRight size={14} />, label: 'Expand', show: !!note },
    ]
    
    const otherActions: { action: QuickAction; icon: React.ReactNode; label: string; show: boolean }[] = [
      { action: 'suggest-tasks', icon: <CheckSquare size={14} />, label: 'Tasks', show: true },
      { action: 'suggest-events', icon: <Calendar size={14} />, label: 'Events', show: true },
      { action: 'mindmap-ideas', icon: <Network size={14} />, label: 'Mindmap', show: !!mindmapData },
    ]
    
    const hasSelection = selectedText && selectedText.trim().length > 0
    
    return (
      <div className="p-4 border-b border-black/5 bg-gradient-to-b from-black/[0.02] to-transparent">
        {/* Selection Actions - Primary when text is selected */}
        {hasSelection && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-black flex items-center justify-center">
                <MousePointerClick size={12} className="text-white" />
              </div>
              <span className="text-xs font-medium text-black/80">Selection</span>
              <span className="text-xs text-black/40 truncate max-w-[140px]">
                &quot;{selectedText.slice(0, 30)}{selectedText.length > 30 ? '...' : ''}&quot;
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {selectionActions.map(({ action, icon, label }) => (
                <button
                  key={action}
                  onClick={() => handleQuickAction(action)}
                  disabled={isLoading}
                  className="flex flex-col items-center gap-1.5 p-2.5 bg-black text-white rounded-xl hover:bg-black/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
                >
                  {icon}
                  <span className="text-[10px] font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Quick Actions Grid */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-black/5 flex items-center justify-center">
            <Zap size={12} className="text-black/60" />
          </div>
          <span className="text-xs font-medium text-black/60">Quick Actions</span>
        </div>
        
        <div className="grid grid-cols-4 gap-2">
          {/* Writing Actions */}
          {writingActions.filter(a => a.show).map(({ action, icon, label }) => (
            <button
              key={action}
              onClick={() => handleQuickAction(action)}
              disabled={isLoading}
              className="flex flex-col items-center gap-1.5 p-2.5 bg-white/80 backdrop-blur-sm border border-black/5 rounded-xl hover:bg-white hover:border-black/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all group"
            >
              <div className="text-black/50 group-hover:text-black/70 transition-colors">
                {icon}
              </div>
              <span className="text-[10px] font-medium text-black/60 group-hover:text-black/80">{label}</span>
            </button>
          ))}
          
          {/* Note Actions */}
          {note && noteActions.map(({ action, icon, label }) => (
            <button
              key={action}
              onClick={() => handleQuickAction(action)}
              disabled={isLoading}
              className="flex flex-col items-center gap-1.5 p-2.5 bg-white/80 backdrop-blur-sm border border-black/5 rounded-xl hover:bg-white hover:border-black/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all group"
            >
              <div className="text-black/50 group-hover:text-black/70 transition-colors">
                {icon}
              </div>
              <span className="text-[10px] font-medium text-black/60 group-hover:text-black/80">{label}</span>
            </button>
          ))}
          
          {/* Other Actions */}
          {otherActions.filter(a => a.show).map(({ action, icon, label }) => (
            <button
              key={action}
              onClick={() => handleQuickAction(action)}
              disabled={isLoading}
              className="flex flex-col items-center gap-1.5 p-2.5 bg-white/80 backdrop-blur-sm border border-black/5 rounded-xl hover:bg-white hover:border-black/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all group"
            >
              <div className="text-black/50 group-hover:text-black/70 transition-colors">
                {icon}
              </div>
              <span className="text-[10px] font-medium text-black/60 group-hover:text-black/80">{label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }
  
  // Render suggestions panel with liquid glass theme
  const renderSuggestions = () => {
    if (!showSuggestions) return null
    
    return (
      <div className="p-4 border-b border-black/5 bg-gradient-to-b from-black/[0.03] to-transparent">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-black flex items-center justify-center">
              <Sparkles size={12} className="text-white" />
            </div>
            <span className="text-xs font-semibold text-black/80">AI Suggestions</span>
          </div>
          <button
            onClick={() => {
              setSuggestions({})
              setShowSuggestions(false)
            }}
            className="p-1.5 hover:bg-black/5 rounded-lg transition-colors"
          >
            <X size={14} className="text-black/40" />
          </button>
        </div>
        
        {/* Summary */}
        {suggestions.summary && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 mb-3 border border-black/5 shadow-sm">
            <div className="text-xs font-semibold text-black/70 mb-2 flex items-center gap-1.5">
              <FileText size={12} />
              Summary
            </div>
            <p className="text-sm text-black/70 leading-relaxed">{suggestions.summary.summary}</p>
            {suggestions.summary.keyPoints.length > 0 && (
              <div className="mt-3 pt-3 border-t border-black/5">
                <div className="text-xs font-medium text-black/50 mb-2">Key Points</div>
                <ul className="space-y-1.5">
                  {suggestions.summary.keyPoints.map((point, i) => (
                    <li key={i} className="flex gap-2 text-xs text-black/60">
                      <span className="w-4 h-4 rounded-full bg-black/5 flex items-center justify-center flex-shrink-0 text-[10px] font-medium">
                        {i + 1}
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {suggestions.summary.suggestedTasks && suggestions.summary.suggestedTasks.length > 0 && (
              <div className="mt-3 pt-3 border-t border-black/5">
                <div className="text-xs font-medium text-black/50 mb-2">Suggested Tasks</div>
                <div className="space-y-1.5">
                  {suggestions.summary.suggestedTasks.map((task, i) => (
                    <button
                      key={i}
                      onClick={() => handleApplyTask({ title: task })}
                      className="flex items-center gap-2 w-full text-left text-xs text-black/60 hover:text-black transition-colors p-2 rounded-lg hover:bg-black/5"
                    >
                      <Plus size={12} className="text-black/40" />
                      {task}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Task Suggestions */}
        {suggestions.tasks && suggestions.tasks.length > 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 mb-3 border border-black/5 shadow-sm">
            <div className="text-xs font-semibold text-black/70 mb-3 flex items-center gap-1.5">
              <CheckSquare size={12} />
              Task Suggestions
            </div>
            <div className="space-y-2">
              {suggestions.tasks.map((task, i) => (
                <div key={i} className="flex items-start justify-between gap-3 p-3 bg-black/[0.02] rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-black/80">{task.title}</div>
                    {task.description && (
                      <div className="text-xs text-black/50 mt-1">{task.description}</div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {task.priority && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          task.priority === 'urgent' ? 'bg-black text-white' :
                          task.priority === 'high' ? 'bg-black/80 text-white' :
                          task.priority === 'low' ? 'bg-black/10 text-black/60' :
                          'bg-black/20 text-black/70'
                        }`}>
                          {task.priority}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="text-[10px] text-black/40">{task.dueDate}</span>
                      )}
                    </div>
                  </div>
                  {onCreateTask && (
                    <button
                      onClick={() => handleApplyTask(task)}
                      className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-black/90 transition-colors flex-shrink-0"
                    >
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Event Suggestions */}
        {suggestions.events && suggestions.events.length > 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 mb-3 border border-black/5 shadow-sm">
            <div className="text-xs font-semibold text-black/70 mb-3 flex items-center gap-1.5">
              <Calendar size={12} />
              Event Suggestions
            </div>
            <div className="space-y-2">
              {suggestions.events.map((event, i) => (
                <div key={i} className="flex items-start justify-between gap-3 p-3 bg-black/[0.02] rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-black/80">{event.title}</div>
                    {event.description && (
                      <div className="text-xs text-black/50 mt-1">{event.description}</div>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-black/40">
                      {event.suggestedDate && <span>{event.suggestedDate}</span>}
                      {event.duration && <span>({event.duration} min)</span>}
                    </div>
                  </div>
                  {onCreateEvent && event.suggestedDate && (
                    <button
                      onClick={() => handleApplyEvent(event)}
                      className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-black/90 transition-colors flex-shrink-0"
                    >
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Mindmap Suggestions */}
        {suggestions.mindmap && suggestions.mindmap.length > 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-black/5 shadow-sm">
            <div className="text-xs font-semibold text-black/70 mb-3 flex items-center gap-1.5">
              <Network size={12} />
              Mindmap Ideas
            </div>
            <div className="space-y-2">
              {suggestions.mindmap.map((suggestion, i) => (
                <div key={i} className="flex items-start justify-between gap-3 p-3 bg-black/[0.02] rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-black/80">{suggestion.nodeText}</div>
                    {suggestion.description && (
                      <div className="text-xs text-black/50 mt-1">{suggestion.description}</div>
                    )}
                    {suggestion.childSuggestions && suggestion.childSuggestions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {suggestion.childSuggestions.map((child, j) => (
                          <span key={j} className="text-[10px] px-2 py-0.5 bg-black/5 text-black/60 rounded-full">
                            {child}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {onAddMindmapNode && (
                    <button
                      onClick={() => handleApplyMindmapNode(suggestion)}
                      className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-black/90 transition-colors flex-shrink-0"
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
    )
  }
  
  // Render structured content with liquid glass theme
  const renderStructuredContent = (parsed: ParsedAIResponse) => {
    if (parsed.type === 'text') {
      // Render plain text responses as markdown
      return <MarkdownContent content={parsed.rawText || ''} />
    }
    
    return (
      <div className="space-y-4">
        {/* Summary */}
        {parsed.summary && (
          <div>
            <div className="text-[10px] font-semibold text-black/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FileText size={10} />
              Summary
            </div>
            <p className="text-sm text-black/80 leading-relaxed">{parsed.summary}</p>
          </div>
        )}
        
        {/* Key Points */}
        {parsed.keyPoints && parsed.keyPoints.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-black/50 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Lightbulb size={10} />
              Key Points
            </div>
            <ul className="space-y-2">
              {parsed.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-black/70">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-black text-white text-[10px] font-medium flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed pt-0.5">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Suggested Tasks */}
        {parsed.suggestedTasks && parsed.suggestedTasks.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-black/50 uppercase tracking-wider mb-2 flex items-center gap-1">
              <CheckSquare size={10} />
              Suggested Tasks
            </div>
            <ul className="space-y-1.5">
              {parsed.suggestedTasks.map((task, i) => (
                <li key={i} className="flex items-start gap-2 group">
                  <div className="flex-1 text-sm text-black/70 bg-black/[0.03] px-3 py-2 rounded-lg border border-black/5">
                    {task}
                  </div>
                  {onCreateTask && (
                    <button
                      onClick={() => handleApplyTask({ title: task })}
                      className="flex-shrink-0 p-2 text-black/30 hover:text-black hover:bg-black/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      title="Add as task"
                    >
                      <Plus size={14} />
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
  
  // Render messages with liquid glass theme
  const renderMessages = () => (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-black/5 to-black/10 backdrop-blur-md flex items-center justify-center mb-4">
            <Bot size={36} className="text-black/30" />
          </div>
          <p className="text-sm font-medium text-black/60">AI Assistant</p>
          <p className="text-xs text-black/40 mt-1 text-center max-w-[200px]">
            Ask me anything about your notes, tasks, or ideas
          </p>
        </div>
      ) : (
        messages.map((message) => {
          const parsed = message.role === 'assistant' && !message.isStreaming 
            ? parseAIResponse(message.content) 
            : null
          const isStructured = parsed?.type === 'structured'
          
          return (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ${
                message.role === 'user'
                  ? 'bg-black text-white'
                  : 'bg-white/80 backdrop-blur-sm border border-black/5 text-black/60'
              }`}>
                {message.role === 'user' ? <User size={14} /> : <Sparkles size={14} />}
              </div>
              
              <div className={`flex-1 ${message.role === 'user' ? 'text-right' : ''}`} style={{ maxWidth: isStructured ? '100%' : '85%' }}>
                <div className={`inline-block px-4 py-3 rounded-2xl text-sm shadow-sm ${
                  message.role === 'user'
                    ? 'bg-black text-white rounded-tr-md'
                    : isStructured
                      ? 'bg-white/80 backdrop-blur-sm text-black/80 rounded-tl-md border border-black/5 w-full'
                      : 'bg-white/80 backdrop-blur-sm text-black/80 rounded-tl-md border border-black/5'
                }`}>
                  {message.isStreaming ? (
                    streamingContent ? (
                      <MarkdownContent content={streamingContent} className="prose-invert-none" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-xs text-black/40">Thinking...</span>
                      </div>
                    )
                  ) : parsed ? (
                    renderStructuredContent(parsed)
                  ) : message.role === 'assistant' ? (
                    <MarkdownContent content={message.content} />
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}
                </div>
                
                {message.role === 'assistant' && !message.isStreaming && (
                  <div className="flex items-center gap-0.5 mt-2 flex-wrap">
                    <button
                      onClick={() => handleCopy(message.content, message.id)}
                      className="p-1.5 text-black/30 hover:text-black hover:bg-black/5 rounded-lg transition-all"
                      title="Copy"
                    >
                      {copiedId === message.id ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    {onInsertText && (
                      <button
                        onClick={() => handleInsertToNote(message.content)}
                        className="p-1.5 text-black/30 hover:text-black hover:bg-black/5 rounded-lg transition-all"
                        title="Append to note"
                      >
                        <FileText size={12} />
                      </button>
                    )}
                    {onInsertAtCursor && (
                      <button
                        onClick={() => handleInsertAtCursorPosition(message.content)}
                        className="p-1.5 text-black/30 hover:text-black hover:bg-black/5 rounded-lg transition-all"
                        title="Insert at cursor"
                      >
                        <PenLine size={12} />
                      </button>
                    )}
                    {selectedText && onReplaceSelection && (
                      <button
                        onClick={() => handleReplaceSelectionWithResponse(message.content)}
                        className="p-1.5 text-black/30 hover:text-black hover:bg-black/5 rounded-lg transition-all"
                        title="Replace selection"
                      >
                        <ArrowRight size={12} />
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
  
  // Render input area with liquid glass theme
  const renderInput = () => (
    <div className="p-4 border-t border-black/5 bg-gradient-to-t from-white to-white/80 backdrop-blur-xl">
      {error && (
        <div className="mb-3 px-4 py-2.5 bg-black/5 border border-black/10 rounded-xl text-xs text-black/70 flex items-center gap-2">
          <X size={14} className="flex-shrink-0 text-black/40" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="p-1 hover:bg-black/10 rounded-lg transition-colors"
          >
            <X size={12} className="text-black/40" />
          </button>
        </div>
      )}
      
      {/* Selected text indicator */}
      {selectedText && selectedText.trim() && (
        <div className="mb-3 px-4 py-2.5 bg-black/[0.03] border border-black/5 rounded-xl text-xs flex items-start gap-2">
          <MousePointerClick size={14} className="flex-shrink-0 mt-0.5 text-black/40" />
          <div className="flex-1 min-w-0">
            <span className="font-medium text-black/60">Selected:</span>
            <span className="ml-1 text-black/50 italic">
              &quot;{selectedText.length > TEXT_TRUNCATION_MEDIUM ? selectedText.slice(0, TEXT_TRUNCATION_MEDIUM) + '...' : selectedText}&quot;
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
          placeholder={hasKey 
            ? selectedText 
              ? "Ask about the selection..." 
              : "Ask anything..." 
            : "Configure API key to start..."}
          disabled={isLoading || !hasKey}
          rows={1}
          className="w-full px-4 py-3 pr-12 text-sm bg-white/80 backdrop-blur-sm border border-black/10 rounded-xl resize-none focus:ring-2 focus:ring-black/10 focus:border-black/20 focus:outline-none disabled:bg-black/5 disabled:cursor-not-allowed transition-all placeholder:text-black/30"
          style={{ minHeight: '48px', maxHeight: '120px' }}
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading || !hasKey}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black text-white rounded-lg hover:bg-black/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      
      <div className="flex items-center justify-between mt-3 text-[10px] text-black/40">
        <span>Enter to send · Shift+Enter for new line</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearChat}
            disabled={messages.length === 0}
            className="p-1.5 hover:bg-black/5 hover:text-black/60 disabled:opacity-30 rounded-lg transition-all"
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 hover:bg-black/5 hover:text-black/60 rounded-lg transition-all"
            title="Settings"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
    </div>
  )
  
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-white/95 to-white/90 backdrop-blur-2xl">
      {/* Header with liquid glass effect */}
      <div className="p-4 border-b border-black/5 bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showChatHistory ? (
              <button
                onClick={() => setShowChatHistory(false)}
                className="p-2 hover:bg-black/5 rounded-xl transition-colors"
              >
                <ChevronLeft size={18} className="text-black/60" />
              </button>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shadow-lg">
                <Sparkles size={18} className="text-white" />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-sm text-black">
                {showChatHistory ? 'History' : 'AI Assistant'}
              </h3>
              <p className="text-[10px] text-black/40">
                {showChatHistory 
                  ? `${chatHistory.length} conversation${chatHistory.length !== 1 ? 's' : ''}`
                  : 'Powered by DeepSeek'
                }
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {!showChatHistory && (
              <>
                <button
                  onClick={() => setShowChatHistory(true)}
                  className="p-2 text-black/40 hover:text-black/70 hover:bg-black/5 rounded-xl transition-all"
                  title="Chat History"
                >
                  <History size={16} />
                </button>
                <button
                  onClick={startNewChat}
                  className="p-2 text-black/40 hover:text-black/70 hover:bg-black/5 rounded-xl transition-all"
                  title="New Chat"
                >
                  <Plus size={16} />
                </button>
              </>
            )}
            {hasKey && !showChatHistory && (
              <span className="px-2 py-1 bg-black/5 text-black/50 text-[10px] font-medium rounded-full ml-1">
                Connected
              </span>
            )}
            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                className="p-2 text-black/40 hover:text-black/70 hover:bg-black/5 rounded-xl transition-all"
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            )}
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <>
          {showChatHistory ? (
            renderChatHistory()
          ) : (
            <>
              {showSettings && renderSettings()}
              {!showSettings && renderQuickActions()}
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
