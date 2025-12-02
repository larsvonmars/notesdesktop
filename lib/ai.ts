/**
 * AI Assistant API - DeepSeek Integration
 * 
 * This module provides AI capabilities for the Notes Desktop app, including:
 * - Note summarization
 * - Text generation and editing
 * - Mindmap node generation
 * - Task suggestions
 * - Calendar event suggestions
 */

// ============================================================================
// TYPES
// ============================================================================

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIStreamCallbacks {
  onToken?: (token: string) => void
  onComplete?: (fullResponse: string) => void
  onError?: (error: Error) => void
}

export interface AIRequestOptions {
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface NoteSummary {
  summary: string
  keyPoints: string[]
  suggestedTasks?: string[]
}

export interface MindmapSuggestion {
  nodeText: string
  description?: string
  childSuggestions?: string[]
}

export interface TaskSuggestion {
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string
}

export interface CalendarSuggestion {
  title: string
  description?: string
  suggestedDate?: string
  duration?: number // in minutes
}

export interface AIContext {
  currentNote?: {
    id: string
    title: string
    content: string
    type: 'rich-text' | 'drawing' | 'mindmap'
  }
  tasks?: Array<{
    id: string
    title: string
    status: string
    dueDate?: string
    priority: string
  }>
  events?: Array<{
    id: string
    title: string
    startTime: string
    endTime: string
  }>
  mindmapData?: {
    rootId: string
    selectedNodeId?: string
    selectedNodeText?: string
    selectedNodeDescription?: string
  }
  // All available notes for tool calling
  allNotes?: Array<{
    id: string
    title: string
  }>
}

// Tool definitions for DeepSeek function calling
export interface AITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

export interface AIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// Tool call handler type
export type ToolCallHandler = (name: string, args: Record<string, unknown>) => Promise<string>

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-chat'
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 2048

// Storage key for API key persistence
const API_KEY_STORAGE_KEY = 'notesdesktop_deepseek_api_key'

// API key with localStorage persistence
let apiKey: string | null = null

// Initialize from localStorage on module load (client-side only)
if (typeof window !== 'undefined') {
  try {
    apiKey = localStorage.getItem(API_KEY_STORAGE_KEY)
  } catch {
    // localStorage not available
  }
}

export function setAIApiKey(key: string) {
  apiKey = key
  // Persist to localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, key)
    } catch {
      // localStorage not available
    }
  }
}

export function getAIApiKey(): string | null {
  return apiKey
}

export function hasAIApiKey(): boolean {
  return !!apiKey && apiKey.length > 0
}

export function clearAIApiKey(): void {
  apiKey = null
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY)
    } catch {
      // localStorage not available
    }
  }
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const SYSTEM_PROMPTS = {
  general: `You are an intelligent AI assistant integrated into a note-taking desktop application called Notes Desktop. You help users with:
- Summarizing and analyzing their notes
- Suggesting improvements to their text
- Helping organize thoughts and ideas
- Managing tasks and calendar events
- Creating and expanding mindmap nodes

Be concise, helpful, and context-aware. When editing content, preserve the user's voice and style.`,

  summarize: `You are a note summarization expert. Your task is to:
1. Create a concise summary of the note content
2. Extract key points and main ideas
3. Suggest potential action items or tasks if relevant

Format your response as JSON with the following structure:
{
  "summary": "Brief overview of the note",
  "keyPoints": ["Point 1", "Point 2", ...],
  "suggestedTasks": ["Task 1", "Task 2", ...] // optional
}`,

  editText: `You are a writing assistant. Help the user improve or modify their text.
- Preserve the original meaning and voice
- Make changes based on the user's specific request
- Return only the modified text, no explanations unless asked`,

  mindmap: `You are a brainstorming assistant for mindmaps. Help users expand their ideas by:
- Suggesting related concepts for new nodes
- Providing descriptions for nodes
- Generating child node ideas
Format suggestions clearly and concisely.`,

  tasks: `You are a productivity assistant. Based on the context provided:
- Suggest relevant tasks
- Help prioritize existing tasks
- Identify deadlines and important dates
Be practical and action-oriented.`,

  calendar: `You are a scheduling assistant. Help users:
- Identify events that should be scheduled
- Suggest appropriate times and durations
- Create event descriptions
Be considerate of time constraints.`,
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const AI_TOOLS: AITool[] = [
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description: 'List all available notes with their titles and IDs. Use this to see what notes exist before reading a specific note.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_note',
      description: 'Read the full content of a specific note by its ID or title. Use this to access note content when the user asks about a specific note.',
      parameters: {
        type: 'object',
        properties: {
          noteId: {
            type: 'string',
            description: 'The ID of the note to read',
          },
          noteTitle: {
            type: 'string',
            description: 'The title of the note to read (alternative to noteId)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: 'Search through all notes for specific content or keywords. Returns matching notes with excerpts.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find in notes',
          },
        },
        required: ['query'],
      },
    },
  },
]

// ============================================================================
// CORE API FUNCTIONS
// ============================================================================

/**
 * Send a request to the DeepSeek API
 */
export async function sendAIRequest(
  messages: AIMessage[],
  options: AIRequestOptions = {}
): Promise<string> {
  if (!apiKey) {
    throw new Error('AI API key not configured. Please set your DeepSeek API key in settings.')
  }

  const {
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    stream = false,
  } = options

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      errorData.error?.message || `AI request failed: ${response.status} ${response.statusText}`
    )
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

/**
 * Send a streaming request to the DeepSeek API
 */
export async function sendAIRequestStream(
  messages: AIMessage[],
  callbacks: AIStreamCallbacks,
  options: AIRequestOptions = {}
): Promise<void> {
  if (!apiKey) {
    callbacks.onError?.(new Error('AI API key not configured. Please set your DeepSeek API key in settings.'))
    return
  }

  const {
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = options

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        errorData.error?.message || `AI request failed: ${response.status} ${response.statusText}`
      )
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    const decoder = new TextDecoder()
    let fullResponse = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter(line => line.trim() !== '')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const token = parsed.choices?.[0]?.delta?.content || ''
            if (token) {
              fullResponse += token
              callbacks.onToken?.(token)
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    }

    callbacks.onComplete?.(fullResponse)
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)))
  }
}

// ============================================================================
// HIGH-LEVEL AI FUNCTIONS
// ============================================================================

/**
 * Chat with the AI assistant (with optional tool calling)
 */
export async function chat(
  userMessage: string,
  context?: AIContext,
  history: AIMessage[] = [],
  onStream?: (token: string) => void,
  toolHandler?: ToolCallHandler
): Promise<string> {
  const systemMessage = buildSystemMessage(context)
  const messages: AIMessage[] = [
    { role: 'system', content: systemMessage },
    ...history,
    { role: 'user', content: userMessage },
  ]

  // If we have tools and a handler, use tool-enabled chat
  if (toolHandler && context?.allNotes) {
    return chatWithTools(messages, toolHandler, onStream)
  }

  if (onStream) {
    let response = ''
    await sendAIRequestStream(messages, {
      onToken: (token) => {
        response += token
        onStream(token)
      },
      onError: (error) => {
        throw error
      },
    })
    return response
  }

  return sendAIRequest(messages)
}

/**
 * Chat with tool calling support
 */
async function chatWithTools(
  messages: AIMessage[],
  toolHandler: ToolCallHandler,
  onStream?: (token: string) => void,
  maxIterations: number = 5
): Promise<string> {
  if (!apiKey) {
    throw new Error('AI API key not configured.')
  }

  let currentMessages = [...messages]
  
  for (let i = 0; i < maxIterations; i++) {
    // Make request with tools
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: currentMessages,
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: DEFAULT_TEMPERATURE,
        max_tokens: DEFAULT_MAX_TOKENS,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        errorData.error?.message || `AI request failed: ${response.status}`
      )
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    const assistantMessage = choice?.message

    if (!assistantMessage) {
      throw new Error('No response from AI')
    }

    // Check if there are tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Add assistant message with tool calls
      currentMessages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
      })

      // Process each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name
        let functionArgs: Record<string, unknown> = {}
        
        try {
          functionArgs = JSON.parse(toolCall.function.arguments || '{}')
        } catch {
          functionArgs = {}
        }

        // Call the tool handler
        const toolResult = await toolHandler(functionName, functionArgs)

        // Add tool result to messages
        currentMessages.push({
          role: 'user',
          content: `[Tool Result for ${functionName}]: ${toolResult}`,
        } as AIMessage)
      }

      // Continue to next iteration
      continue
    }

    // No tool calls, return the final response
    const finalContent = assistantMessage.content || ''
    
    // Stream the final response if streaming is enabled
    if (onStream && finalContent) {
      // Simulate streaming for tool-call responses
      const words = finalContent.split(' ')
      for (const word of words) {
        onStream(word + ' ')
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }

    return finalContent
  }

  throw new Error('Max tool iterations reached')
}

/**
 * Summarize a note
 */
export async function summarizeNote(
  noteContent: string,
  noteTitle?: string
): Promise<NoteSummary> {
  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPTS.summarize },
    {
      role: 'user',
      content: `Please summarize the following note${noteTitle ? ` titled "${noteTitle}"` : ''}:\n\n${noteContent}`,
    },
  ]

  const response = await sendAIRequest(messages, { temperature: 0.5 })

  try {
    // Try to parse as JSON
    const parsed = JSON.parse(response)
    return {
      summary: parsed.summary || response,
      keyPoints: parsed.keyPoints || [],
      suggestedTasks: parsed.suggestedTasks,
    }
  } catch {
    // If not valid JSON, return the response as summary
    return {
      summary: response,
      keyPoints: [],
    }
  }
}

/**
 * Edit or improve text
 */
export async function editText(
  originalText: string,
  instruction: string,
  onStream?: (token: string) => void
): Promise<string> {
  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPTS.editText },
    {
      role: 'user',
      content: `Original text:\n${originalText}\n\nInstruction: ${instruction}`,
    },
  ]

  if (onStream) {
    let response = ''
    await sendAIRequestStream(messages, {
      onToken: (token) => {
        response += token
        onStream(token)
      },
    })
    return response
  }

  return sendAIRequest(messages)
}

/**
 * Generate mindmap node suggestions
 */
export async function suggestMindmapNodes(
  currentNodeText: string,
  currentNodeDescription?: string,
  parentContext?: string
): Promise<MindmapSuggestion[]> {
  const contextParts: string[] = []
  if (parentContext) {
    contextParts.push(`Parent context: ${parentContext}`)
  }
  contextParts.push(`Current node: ${currentNodeText}`)
  if (currentNodeDescription) {
    contextParts.push(`Description: ${currentNodeDescription}`)
  }

  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPTS.mindmap },
    {
      role: 'user',
      content: `${contextParts.join('\n')}\n\nSuggest 3-5 related child nodes for this mindmap. Format as a JSON array:
[{"nodeText": "...", "description": "...", "childSuggestions": ["..."]}]`,
    },
  ]

  const response = await sendAIRequest(messages, { temperature: 0.8 })

  try {
    return JSON.parse(response)
  } catch {
    // Parse as plain text suggestions
    const lines = response.split('\n').filter(line => line.trim())
    return lines.slice(0, 5).map(line => ({
      nodeText: line.replace(/^[-*•\d.]+\s*/, '').trim(),
    }))
  }
}

/**
 * Suggest tasks based on context
 */
export async function suggestTasks(
  context: AIContext
): Promise<TaskSuggestion[]> {
  const contextParts: string[] = []

  if (context.currentNote) {
    contextParts.push(`Current note: "${context.currentNote.title}"`)
    contextParts.push(`Content: ${context.currentNote.content.slice(0, 1000)}`)
  }

  if (context.tasks && context.tasks.length > 0) {
    contextParts.push(`\nExisting tasks:`)
    context.tasks.slice(0, 10).forEach(task => {
      contextParts.push(`- ${task.title} (${task.status}, ${task.priority})`)
    })
  }

  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPTS.tasks },
    {
      role: 'user',
      content: `${contextParts.join('\n')}\n\nBased on this context, suggest 2-4 relevant tasks. Format as JSON:
[{"title": "...", "description": "...", "priority": "medium", "dueDate": "YYYY-MM-DD"}]`,
    },
  ]

  const response = await sendAIRequest(messages, { temperature: 0.6 })

  try {
    return JSON.parse(response)
  } catch {
    const lines = response.split('\n').filter(line => line.trim())
    return lines.slice(0, 4).map(line => ({
      title: line.replace(/^[-*•\d.]+\s*/, '').trim(),
      priority: 'medium' as const,
    }))
  }
}

/**
 * Suggest calendar events based on context
 */
export async function suggestEvents(
  context: AIContext
): Promise<CalendarSuggestion[]> {
  const contextParts: string[] = []

  if (context.currentNote) {
    contextParts.push(`Current note: "${context.currentNote.title}"`)
    contextParts.push(`Content: ${context.currentNote.content.slice(0, 1000)}`)
  }

  if (context.tasks && context.tasks.length > 0) {
    contextParts.push(`\nTasks with due dates:`)
    context.tasks
      .filter(task => task.dueDate)
      .slice(0, 5)
      .forEach(task => {
        contextParts.push(`- ${task.title} (due: ${task.dueDate})`)
      })
  }

  if (context.events && context.events.length > 0) {
    contextParts.push(`\nUpcoming events:`)
    context.events.slice(0, 5).forEach(event => {
      contextParts.push(`- ${event.title} (${event.startTime})`)
    })
  }

  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPTS.calendar },
    {
      role: 'user',
      content: `${contextParts.join('\n')}\n\nBased on this context, suggest 1-3 events that should be scheduled. Format as JSON:
[{"title": "...", "description": "...", "suggestedDate": "YYYY-MM-DD", "duration": 60}]`,
    },
  ]

  const response = await sendAIRequest(messages, { temperature: 0.6 })

  try {
    return JSON.parse(response)
  } catch {
    return []
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build a system message with context
 */
function buildSystemMessage(context?: AIContext): string {
  let message = SYSTEM_PROMPTS.general

  if (context) {
    const contextParts: string[] = ['\n\nCurrent context:']

    if (context.currentNote) {
      contextParts.push(`- Working on note: "${context.currentNote.title}" (${context.currentNote.type})`)
    }

    if (context.mindmapData) {
      contextParts.push(`- In mindmap mode, selected node: "${context.mindmapData.selectedNodeText || 'root'}"`)
    }

    if (context.tasks && context.tasks.length > 0) {
      const pendingTasks = context.tasks.filter(t => t.status !== 'completed')
      contextParts.push(`- ${pendingTasks.length} pending tasks`)
    }

    if (context.events && context.events.length > 0) {
      contextParts.push(`- ${context.events.length} upcoming events`)
    }

    if (contextParts.length > 1) {
      message += contextParts.join('\n')
    }
  }

  return message
}

/**
 * Strip HTML tags for AI processing
 */
export function stripHtmlForAI(html: string): string {
  // Simple HTML tag removal - preserves text content
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Convert plain text to basic HTML for note content
 */
export function textToHtml(text: string): string {
  return text
    .split('\n\n')
    .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('')
}
