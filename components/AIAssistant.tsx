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

// Markdown content component
function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(content), [content])
  
  return (
    <div 
      className={`prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-gray-800 prose-pre:text-gray-100 prose-code:text-purple-600 prose-code:bg-purple-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function AIAssistant({
  note,
  noteContent,
  allNotes,
  mindmapData,
  selectedMindmapNodeId,
  tasks,
  taskStats,
  events,
  onInsertText,
  onReplaceText,
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
        type: note.note_type || 'rich-text',
      }
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
  }, [note, noteContent, mindmapData, selectedMindmapNodeId, tasks, events, allNotes])
  
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
          const title = userMessage.content.slice(0, 50) + (userMessage.content.length > 50 ? '...' : '')
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
  }, [hasKey, aiContext])
  
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
  
  // Insert AI response into note
  const handleInsertToNote = useCallback((content: string) => {
    if (onInsertText) {
      // Convert markdown-like content to HTML
      onInsertText(textToHtml(content))
    }
  }, [onInsertText])
  
  // Handle key press in input
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])
  
  // Render chat history panel
  const renderChatHistory = () => (
    <div className="flex-1 overflow-y-auto">
      {isLoadingHistory ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : chatHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
          <MessageSquare size={32} className="mb-2 opacity-50" />
          <p className="text-sm">No chat history</p>
          <p className="text-xs text-gray-400 mt-1">
            Start a conversation to save it here
          </p>
        </div>
      ) : (
        <div className="p-2 space-y-2">
          {chatHistory.map(chat => (
            <button
              key={chat.id}
              onClick={() => loadChat(chat)}
              className={`w-full p-3 text-left rounded-lg transition-colors group ${
                currentChatId === chat.id
                  ? 'bg-purple-100 border border-purple-200'
                  : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 truncate">
                    {chat.title}
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {chat.messages.length} message{chat.messages.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(chat.updated_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDeleteChat(chat.id, e)}
                  className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete chat"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </button>
          ))}
        </div>
      )}
      
      {/* New Chat Button at bottom */}
      <div className="p-3 border-t border-gray-200">
        <button
          onClick={startNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>
    </div>
  )
  
  // Render settings panel
  const renderSettings = () => (
    <div className="p-4 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Key size={16} />
          API Configuration
        </h3>
        <button
          onClick={() => setShowSettings(false)}
          className="p-1 hover:bg-gray-200 rounded transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            DeepSeek API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKeyState(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Get your API key from{' '}
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              DeepSeek Platform
            </a>
          </p>
        </div>
        
        <button
          onClick={handleSaveApiKey}
          disabled={!apiKey.trim()}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Save API Key
        </button>
      </div>
    </div>
  )
  
  // Render quick actions
  const renderQuickActions = () => {
    const noteActions: { action: QuickAction; icon: React.ReactNode; label: string }[] = [
      { action: 'summarize', icon: <FileText size={14} />, label: 'Summarize' },
      { action: 'improve-writing', icon: <Wand2 size={14} />, label: 'Improve' },
      { action: 'fix-grammar', icon: <Check size={14} />, label: 'Fix Grammar' },
      { action: 'make-concise', icon: <RefreshCw size={14} />, label: 'Concise' },
    ]
    
    const otherActions: { action: QuickAction; icon: React.ReactNode; label: string; show: boolean }[] = [
      { action: 'suggest-tasks', icon: <CheckSquare size={14} />, label: 'Suggest Tasks', show: true },
      { action: 'suggest-events', icon: <Calendar size={14} />, label: 'Suggest Events', show: true },
      { action: 'mindmap-ideas', icon: <Network size={14} />, label: 'Mindmap Ideas', show: !!mindmapData },
    ]
    
    return (
      <div className="p-3 border-b border-gray-200 bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Lightbulb size={12} />
          Quick Actions
        </div>
        
        {note && (
          <div className="mb-2">
            <div className="text-xs text-gray-500 mb-1.5">Note</div>
            <div className="flex flex-wrap gap-1.5">
              {noteActions.map(({ action, icon, label }) => (
                <button
                  key={action}
                  onClick={() => handleQuickAction(action)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex flex-wrap gap-1.5">
          {otherActions.filter(a => a.show).map(({ action, icon, label }) => (
            <button
              key={action}
              onClick={() => handleQuickAction(action)}
              disabled={isLoading}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>
    )
  }
  
  // Render suggestions panel
  const renderSuggestions = () => {
    if (!showSuggestions) return null
    
    return (
      <div className="p-3 border-b border-gray-200 bg-amber-50">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
            <Sparkles size={12} />
            AI Suggestions
          </div>
          <button
            onClick={() => {
              setSuggestions({})
              setShowSuggestions(false)
            }}
            className="p-1 hover:bg-amber-100 rounded transition-colors text-amber-600"
          >
            <X size={14} />
          </button>
        </div>
        
        {/* Summary */}
        {suggestions.summary && (
          <div className="bg-white rounded-lg p-3 mb-2 border border-amber-200">
            <div className="text-sm font-medium text-gray-800 mb-2">Summary</div>
            <p className="text-sm text-gray-700 mb-2">{suggestions.summary.summary}</p>
            {suggestions.summary.keyPoints.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-medium text-gray-600 mb-1">Key Points:</div>
                <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
                  {suggestions.summary.keyPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
            {suggestions.summary.suggestedTasks && suggestions.summary.suggestedTasks.length > 0 && (
              <div className="mt-2 pt-2 border-t border-amber-100">
                <div className="text-xs font-medium text-gray-600 mb-1">Suggested Tasks:</div>
                <div className="space-y-1">
                  {suggestions.summary.suggestedTasks.map((task, i) => (
                    <button
                      key={i}
                      onClick={() => handleApplyTask({ title: task })}
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"
                    >
                      <Plus size={12} />
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
          <div className="bg-white rounded-lg p-3 mb-2 border border-amber-200">
            <div className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-1.5">
              <CheckSquare size={14} className="text-blue-600" />
              Task Suggestions
            </div>
            <div className="space-y-2">
              {suggestions.tasks.map((task, i) => (
                <div key={i} className="flex items-start justify-between gap-2 p-2 bg-gray-50 rounded-md">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{task.title}</div>
                    {task.description && (
                      <div className="text-xs text-gray-600 mt-0.5">{task.description}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {task.priority && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                          task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                          task.priority === 'low' ? 'bg-gray-100 text-gray-600' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {task.priority}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="text-xs text-gray-500">{task.dueDate}</span>
                      )}
                    </div>
                  </div>
                  {onCreateTask && (
                    <button
                      onClick={() => handleApplyTask(task)}
                      className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex-shrink-0"
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
          <div className="bg-white rounded-lg p-3 mb-2 border border-amber-200">
            <div className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-1.5">
              <Calendar size={14} className="text-purple-600" />
              Event Suggestions
            </div>
            <div className="space-y-2">
              {suggestions.events.map((event, i) => (
                <div key={i} className="flex items-start justify-between gap-2 p-2 bg-gray-50 rounded-md">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{event.title}</div>
                    {event.description && (
                      <div className="text-xs text-gray-600 mt-0.5">{event.description}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      {event.suggestedDate && <span>{event.suggestedDate}</span>}
                      {event.duration && <span>({event.duration} min)</span>}
                    </div>
                  </div>
                  {onCreateEvent && event.suggestedDate && (
                    <button
                      onClick={() => handleApplyEvent(event)}
                      className="px-2 py-1 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex-shrink-0"
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
          <div className="bg-white rounded-lg p-3 border border-amber-200">
            <div className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-1.5">
              <Network size={14} className="text-green-600" />
              Mindmap Ideas
            </div>
            <div className="space-y-2">
              {suggestions.mindmap.map((suggestion, i) => (
                <div key={i} className="flex items-start justify-between gap-2 p-2 bg-gray-50 rounded-md">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{suggestion.nodeText}</div>
                    {suggestion.description && (
                      <div className="text-xs text-gray-600 mt-0.5">{suggestion.description}</div>
                    )}
                    {suggestion.childSuggestions && suggestion.childSuggestions.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {suggestion.childSuggestions.map((child, j) => (
                          <span key={j} className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded">
                            {child}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {onAddMindmapNode && (
                    <button
                      onClick={() => handleApplyMindmapNode(suggestion)}
                      className="px-2 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex-shrink-0"
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
  
  // Render structured content (parsed JSON response)
  const renderStructuredContent = (parsed: ParsedAIResponse) => {
    if (parsed.type === 'text') {
      // Render plain text responses as markdown
      return <MarkdownContent content={parsed.rawText || ''} />
    }
    
    return (
      <div className="space-y-3">
        {/* Summary */}
        {parsed.summary && (
          <div>
            <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              <FileText size={12} />
              Summary
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{parsed.summary}</p>
          </div>
        )}
        
        {/* Key Points */}
        {parsed.keyPoints && parsed.keyPoints.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Lightbulb size={12} />
              Key Points
            </div>
            <ul className="space-y-1.5">
              {parsed.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Suggested Tasks */}
        {parsed.suggestedTasks && parsed.suggestedTasks.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <CheckSquare size={12} />
              Suggested Tasks
            </div>
            <ul className="space-y-1">
              {parsed.suggestedTasks.map((task, i) => (
                <li key={i} className="flex items-start gap-2 group">
                  <div className="flex-1 text-sm text-gray-700 bg-green-50 px-2 py-1.5 rounded-md border border-green-100">
                    {task}
                  </div>
                  {onCreateTask && (
                    <button
                      onClick={() => handleApplyTask({ title: task })}
                      className="flex-shrink-0 p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors opacity-0 group-hover:opacity-100"
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
  
  // Render messages
  const renderMessages = () => (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {messages.length === 0 ? (
        <div className="text-center py-8">
          <Bot size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500 mb-1">AI Assistant</p>
          <p className="text-xs text-gray-400">
            Ask me anything about your notes, tasks, or ideas!
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
              className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gradient-to-br from-purple-500 to-blue-500 text-white'
              }`}>
                {message.role === 'user' ? <User size={14} /> : <Sparkles size={14} />}
              </div>
              
              <div className={`flex-1 ${message.role === 'user' ? 'text-right' : ''}`} style={{ maxWidth: isStructured ? '100%' : '85%' }}>
                <div className={`inline-block px-3 py-2 rounded-xl text-sm ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : isStructured
                      ? 'bg-gradient-to-br from-purple-50 to-blue-50 text-gray-800 rounded-bl-sm border border-purple-100 w-full'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {message.isStreaming ? (
                    streamingContent ? (
                      <MarkdownContent content={streamingContent} className="prose-invert-none" />
                    ) : (
                      <Loader2 size={14} className="animate-spin" />
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
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      onClick={() => handleCopy(message.content, message.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Copy"
                    >
                      {copiedId === message.id ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    {onInsertText && (
                      <button
                        onClick={() => handleInsertToNote(message.content)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Insert into note"
                      >
                        <FileText size={12} />
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
  
  // Render input area
  const renderInput = () => (
    <div className="p-3 border-t border-gray-200 bg-white">
      {error && (
        <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-center gap-2">
          <X size={14} className="flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto p-0.5 hover:bg-red-100 rounded"
          >
            <X size={12} />
          </button>
        </div>
      )}
      
      <div className="relative">
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasKey ? "Ask anything..." : "Configure API key to start..."}
          disabled={isLoading || !hasKey}
          rows={1}
          className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading || !hasKey}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      
      <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
        <span>Press Enter to send, Shift+Enter for new line</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearChat}
            disabled={messages.length === 0}
            className="p-1 hover:text-gray-600 disabled:opacity-50 transition-colors"
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 hover:text-gray-600 transition-colors"
            title="Settings"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
    </div>
  )
  
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            {showChatHistory ? (
              <button
                onClick={() => setShowChatHistory(false)}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
            ) : (
              <div className="p-1.5 bg-white/20 rounded-lg">
                <Sparkles size={18} />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-sm">
                {showChatHistory ? 'Chat History' : 'AI Assistant'}
              </h3>
              <p className="text-xs text-white/70">
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
                  className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
                  title="Chat History"
                >
                  <History size={16} />
                </button>
                <button
                  onClick={startNewChat}
                  className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
                  title="New Chat"
                >
                  <Plus size={16} />
                </button>
              </>
            )}
            {hasKey && !showChatHistory && (
              <span className="px-2 py-0.5 bg-green-400/20 text-green-100 text-xs rounded-full">
                Connected
              </span>
            )}
            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
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
