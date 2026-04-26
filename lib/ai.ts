/**
 * AI Assistant API - DeepSeek Integration
 * 
 * This module provides AI capabilities for the Saentis Notes app, including:
 * - Note summarization
 * - Text generation and editing
 * - Mindmap node generation
 * - Task suggestions
 * - Calendar event suggestions
 */

import type { NoteType } from './notes'

// ============================================================================
// TYPES
// ============================================================================

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type DeepSeekModel = 'deepseek-chat' | 'deepseek-v3.2-thinking'

export interface AIStreamCallbacks {
  onToken?: (token: string) => void
  onReasoning?: (token: string) => void
  onComplete?: (fullResponse: string) => void
  onError?: (error: Error) => void
}

export interface AIRequestOptions {
  model?: DeepSeekModel
  temperature?: number
  maxTokens?: number
  stream?: boolean
  signal?: AbortSignal
  retryCount?: number
}

export type AIErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'not_configured'
  | 'upstream'
  | 'aborted'
  | 'unknown'

export class AIError extends Error {
  code: AIErrorCode
  status?: number
  retryable: boolean
  retryAfterSeconds?: number

  constructor(
    message: string,
    code: AIErrorCode,
    status?: number,
    retryable: boolean = false,
    retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'AIError'
    this.code = code
    this.status = status
    this.retryable = retryable
    this.retryAfterSeconds = retryAfterSeconds
  }
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

export interface MindmapOutlineNode {
  text: string
  description?: string
  children?: MindmapOutlineNode[]
}

export interface MindmapOutline {
  rootText?: string
  rootDescription?: string
  children: MindmapOutlineNode[]
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
    type: NoteType
  }
  // Selected text from the editor - for context-aware AI interactions
  selectedText?: string
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
  // Notes whose full content is injected directly into the system prompt
  additionalNoteContents?: Array<{
    id: string
    title: string
    content: string
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

const DEFAULT_MODEL = 'deepseek-chat'
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_RETRY_COUNT = 2
const RETRY_BASE_DELAY_MS = 500
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504])

export const AI_NOTE_CONTEXT_LIMITS = {
  maxCharsPerNote: 32000,
  maxTotalInjectedChars: 320000,
  maxSelectedNotes: 12,
  selectedTextContextChars: 4000,
  readNoteToolChars: 32000,
  searchExcerptChars: 900,
  searchMaxResultsDefault: 8,
  searchMaxResultsHard: 15,
} as const

type AIKeyStatus = {
  available: boolean
  source: 'keychain' | 'env' | 'none' | string
}

export type AIRateLimitStatus = {
  limit?: number
  remaining?: number
  resetAtEpochSeconds?: number
  retryAfterSeconds?: number
  windowMs?: number
}

// Runtime override key (for advanced/dev usage only)
let runtimeApiKey: string | null = null
let activeStreamAbortController: AbortController | null = null
let latestRateLimitStatus: AIRateLimitStatus | null = null

/**
 * Returns the active API key.
 * Priority: runtime override → DEEPSEEK_API_KEY build-time env var (forwarded via next.config.js).
 * The key is embedded at build time via the env file and never requested from the user.
 */
function getApiKey(): string | null {
  if (runtimeApiKey) return runtimeApiKey
  const envKey = process.env.DEEPSEEK_API_KEY
  return envKey && envKey.length > 0 ? envKey : null
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function getWebAIEndpoint(path: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_AI_API_BASE_URL || '').trim()
  if (!baseUrl) {
    return path
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

export function isReasonerToolCallingEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_DEEPSEEK_REASONER_TOOLS || '').trim().toLowerCase() === 'true'
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const tauriCore = await import('@tauri-apps/api/core')
  return tauriCore.invoke<T>(command, args)
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof AIError && error.code === 'aborted') return true
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (!(error instanceof Error)) return false

  const msg = error.message.toLowerCase()
  return msg.includes('abort') || msg.includes('cancel')
}

function statusToCode(status?: number): AIErrorCode {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 429) return 'rate_limited'
  if (status === 408 || status === 504) return 'timeout'
  if (status && status >= 500) return 'upstream'
  return 'unknown'
}

function toAIErrorWithStatus(message: string, status?: number, retryAfterSeconds?: number): AIError {
  if (status === 401) return new AIError('You need to sign in again to use AI features.', 'unauthorized', status, false)
  if (status === 403) return new AIError('AI access is forbidden for this request.', 'forbidden', status, false)
  if (status === 429) return new AIError('AI service is rate-limiting requests. Please try again shortly.', 'rate_limited', status, true, retryAfterSeconds)
  if (status === 408 || status === 504) return new AIError('AI request timed out. Please try again.', 'timeout', status, true)
  if (status === 503) return new AIError('AI service is temporarily unavailable. Please try again.', 'upstream', status, true)
  if (status && status >= 500) return new AIError('AI service returned a server error. Please retry.', 'upstream', status, true)
  if (status === 400) return new AIError('AI request payload is invalid.', 'unknown', status, false)
  return new AIError(
    message || 'AI request failed.',
    statusToCode(status),
    status,
    !!(status && RETRYABLE_STATUS_CODES.has(status)),
    retryAfterSeconds,
  )
}

function toAIError(error: unknown): AIError {
  if (error instanceof AIError) return error
  if (isAbortLikeError(error)) return new AIError('Response canceled.', 'aborted', undefined, false)

  if (error instanceof TypeError) {
    return new AIError('Network error while contacting AI service.', 'network', undefined, true)
  }

  if (error instanceof Error) {
    const match = error.message.match(/AI request failed:\s*(\d{3})/)
    if (match) {
      const status = Number(match[1])
      return toAIErrorWithStatus(error.message, status)
    }

    if (error.message.toLowerCase().includes('not configured')) {
      return new AIError('AI API key is not configured.', 'not_configured', undefined, false)
    }

    return new AIError(error.message, 'unknown', undefined, false)
  }

  return new AIError('Unexpected AI error.', 'unknown', undefined, false)
}

function parseRetryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get('Retry-After')
  if (!raw) return undefined

  const asNumber = Number(raw)
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.ceil(asNumber)
  }

  const asDate = Date.parse(raw)
  if (Number.isFinite(asDate)) {
    const seconds = Math.ceil((asDate - Date.now()) / 1000)
    return seconds > 0 ? seconds : undefined
  }

  return undefined
}

function parseHeaderNumber(headers: Headers, key: string): number | undefined {
  const raw = headers.get(key)
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function updateRateLimitStatusFromResponse(response: Response): void {
  latestRateLimitStatus = {
    limit: parseHeaderNumber(response.headers, 'X-RateLimit-Limit'),
    remaining: parseHeaderNumber(response.headers, 'X-RateLimit-Remaining'),
    resetAtEpochSeconds: parseHeaderNumber(response.headers, 'X-RateLimit-Reset'),
    retryAfterSeconds: parseRetryAfterSeconds(response),
    windowMs: parseHeaderNumber(response.headers, 'X-RateLimit-Window-Ms'),
  }
}

export function getAIRateLimitStatus(): AIRateLimitStatus | null {
  return latestRateLimitStatus
}

export function isAIAbortError(error: unknown): boolean {
  return toAIError(error).code === 'aborted'
}

export function cancelActiveAIRequest(): void {
  if (activeStreamAbortController) {
    activeStreamAbortController.abort()
    activeStreamAbortController = null
  }
}

async function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise(resolve => setTimeout(resolve, ms))
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(new AIError('Response canceled.', 'aborted', undefined, false))
    }

    signal.addEventListener('abort', onAbort)
  })
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retryCount: number,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: AIError | null = null

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    if (signal?.aborted) {
      throw new AIError('Response canceled.', 'aborted', undefined, false)
    }

    try {
      return await operation()
    } catch (error) {
      const aiError = toAIError(error)
      lastError = aiError
      const canRetry = aiError.retryable && attempt < retryCount
      if (!canRetry) throw aiError

      const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
      await delayWithAbort(backoff, signal)
    }
  }

  throw lastError || new AIError('AI request failed.', 'unknown')
}

async function getWebAuthHeader(): Promise<Record<string, string>> {
  try {
    const { supabase } = await import('./supabase')
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` }
    }
  } catch {
    // Auth-less requests are handled by server auth checks.
  }

  return {}
}

async function sendAIRequestPayload(payload: Record<string, unknown>): Promise<any> {
  if (isTauriRuntime()) {
    try {
      return await tauriInvoke('ai_chat_json', { payload })
    } catch (error) {
      throw toAIError(error)
    }
  }

  const authHeaders = await getWebAuthHeader()

  const response = await fetch(getWebAIEndpoint('/api/ai/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  })

  updateRateLimitStatusFromResponse(response)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const message =
      errorData.error?.message || `AI request failed: ${response.status} ${response.statusText}`
    throw toAIErrorWithStatus(message, response.status, parseRetryAfterSeconds(response))
  }

  return response.json()
}

/** @deprecated Key is now managed via DEEPSEEK_API_KEY in .env.local */
export function setAIApiKey(key: string) {
  runtimeApiKey = key
}

/** Returns the active API key (env-based). */
export function getAIApiKey(): string | null {
  return getApiKey()
}

/** Returns true when an API key is available (from env or runtime override). */
export function hasAIApiKey(): boolean {
  if (isTauriRuntime()) {
    // Desktop key status is async via ai_key_status command; return true to avoid false warning banner.
    return true
  }
  // Web key status is server-managed; fetch via getAIApiKeyStatus.
  return true
}

export async function getAIApiKeyStatus(): Promise<AIKeyStatus> {
  if (isTauriRuntime()) {
    return tauriInvoke<AIKeyStatus>('ai_key_status')
  }

  const response = await fetch(getWebAIEndpoint('/api/ai/key-status'), { method: 'POST' })
  if (!response.ok) {
    return { available: false, source: 'none' }
  }

  const data = await response.json()
  return {
    available: !!data.available,
    source: typeof data.source === 'string' ? data.source : 'none',
  }
}

/** Clears runtime override key. Env key is always available if set. */
export function clearAIApiKey(): void {
  runtimeApiKey = null
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const SYSTEM_PROMPTS = {
  general: `You are an intelligent AI assistant integrated into a note-taking desktop application called Saentis Notes. You help users with:
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
          maxResults: {
            type: 'number',
            description: `Optional number of search results to return (1-${AI_NOTE_CONTEXT_LIMITS.searchMaxResultsHard})`,
            minimum: 1,
            maximum: AI_NOTE_CONTEXT_LIMITS.searchMaxResultsHard,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_mindmap_note',
      description: 'Create a new mindmap note from selected text or from an existing text note.',
      parameters: {
        type: 'object',
        properties: {
          noteId: {
            type: 'string',
            description: 'Optional source note ID to convert into a mindmap note',
          },
          noteTitle: {
            type: 'string',
            description: 'Optional source note title (alternative to noteId)',
          },
          focusText: {
            type: 'string',
            description: 'Optional selected text to use instead of full note content',
          },
          title: {
            type: 'string',
            description: 'Optional title for the new mindmap note',
          },
          additionalPrompt: {
            type: 'string',
            description: 'Optional extra instructions for how the mindmap should be structured or focused',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_note_content',
      description: 'Replace the entire content of the currently open note with new content. Use this when the user asks you to rewrite, restructure, or completely replace the note. The content should be provided as plain text or markdown — it will be converted to the note format automatically.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The new content to replace the entire note with (plain text or markdown)',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_note_content',
      description: 'Edit the currently open note by finding and replacing specific text. Use this for targeted edits like fixing a paragraph, updating a section, or correcting specific text. The search is case-sensitive and matches the first occurrence.',
      parameters: {
        type: 'object',
        properties: {
          findText: {
            type: 'string',
            description: 'The exact text to find in the note (plain text, matched against the note\'s text content)',
          },
          replaceWith: {
            type: 'string',
            description: 'The text to replace the found text with (plain text or markdown)',
          },
        },
        required: ['findText', 'replaceWith'],
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
  const {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    stream = false,
    retryCount = DEFAULT_RETRY_COUNT,
    signal,
  } = options

  const data = await withRetry(
    () => sendAIRequestPayload({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream,
    }),
    retryCount,
    signal,
  )
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
  const {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    signal,
  } = options

  if (signal?.aborted) {
    callbacks.onError?.(new AIError('Response canceled.', 'aborted'))
    return
  }

  if (isTauriRuntime()) {
    try {
      const data = await sendAIRequestPayload({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      })

      const reasoning = data.choices?.[0]?.message?.reasoning_content || ''
      const content = data.choices?.[0]?.message?.content || ''

      if (reasoning) callbacks.onReasoning?.(reasoning)
      if (content) callbacks.onToken?.(content)
      callbacks.onComplete?.(content)
    } catch (error) {
      callbacks.onError?.(toAIError(error))
    }
    return
  }

  const controller = new AbortController()
  activeStreamAbortController = controller
  const onAbort = () => controller.abort()
  if (signal) signal.addEventListener('abort', onAbort)

  try {
    const authHeaders = await getWebAuthHeader()
    const response = await fetch(getWebAIEndpoint('/api/ai/stream'), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    })

    updateRateLimitStatusFromResponse(response)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const message =
        errorData.error?.message || `AI request failed: ${response.status} ${response.statusText}`
      throw toAIErrorWithStatus(message, response.status, parseRetryAfterSeconds(response))
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
            const delta = parsed.choices?.[0]?.delta || {}
            const reasoningToken: string = (delta as { reasoning_content?: string }).reasoning_content || ''
            const contentToken: string = (delta as { content?: string }).content || ''
            if (reasoningToken) {
              callbacks.onReasoning?.(reasoningToken)
            }
            if (contentToken) {
              fullResponse += contentToken
              callbacks.onToken?.(contentToken)
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    }

    callbacks.onComplete?.(fullResponse)
  } catch (error) {
    callbacks.onError?.(toAIError(error))
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort)
    if (activeStreamAbortController === controller) {
      activeStreamAbortController = null
    }
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
  toolHandler?: ToolCallHandler,
  model?: DeepSeekModel,
  onReasoning?: (token: string) => void,
): Promise<string> {
  const systemMessage = buildSystemMessage(context)
  const messages: AIMessage[] = [
    { role: 'system', content: systemMessage },
    ...history,
    { role: 'user', content: userMessage },
  ]

  const resolvedModel = model || DEFAULT_MODEL
  const resolvedMaxTokens = resolvedModel === 'deepseek-v3.2-thinking' ? 8192 : DEFAULT_MAX_TOKENS

  const shouldUseTools =
    !!toolHandler &&
    !!context?.allNotes &&
    (resolvedModel !== 'deepseek-v3.2-thinking' || isReasonerToolCallingEnabled())

  if (shouldUseTools) {
    return chatWithTools(messages, toolHandler, onStream, 5, resolvedModel)
  }

  if (onStream) {
    let response = ''
    await sendAIRequestStream(messages, {
      onToken: (token) => {
        response += token
        onStream(token)
      },
      onReasoning,
      onError: (error) => {
        throw error
      },
    }, { model: resolvedModel, maxTokens: resolvedMaxTokens })
    return response
  }

  return sendAIRequest(messages, { model: resolvedModel, maxTokens: resolvedMaxTokens })
}

/**
 * Chat with tool calling support
 */
async function chatWithTools(
  messages: AIMessage[],
  toolHandler: ToolCallHandler,
  onStream?: (token: string) => void,
  maxIterations: number = 5,
  model: DeepSeekModel = 'deepseek-chat',
): Promise<string> {
  let currentMessages = [...messages]
  
  for (let i = 0; i < maxIterations; i++) {
    const data = await sendAIRequestPayload({
      model,
      messages: currentMessages,
      tools: AI_TOOLS,
      tool_choice: 'auto',
      temperature: DEFAULT_TEMPERATURE,
      max_tokens: DEFAULT_MAX_TOKENS,
    })
    const choice = data.choices?.[0]
    const assistantMessage = choice?.message

    if (!assistantMessage) {
      throw new Error('No response from AI')
    }

    // Check if there are tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Add assistant message with tool_calls in proper format
      currentMessages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        tool_calls: assistantMessage.tool_calls,
      } as any)

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

        // Add tool result using the spec-compliant role: 'tool' format
        currentMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        } as any)
      }

      // Continue to next iteration
      continue
    }

    // No tool calls — deliver the final response
    const finalContent = assistantMessage.content || ''
    // Deliver synchronously (no fake word-by-word delays)
    if (onStream && finalContent) onStream(finalContent)
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

  // Strip ```json ... ``` or ``` ... ``` code fences that the model sometimes wraps around JSON
  const stripped = stripJsonCodeFence(response)

  try {
    const parsed = JSON.parse(stripped)
    return {
      summary: parsed.summary || stripped,
      keyPoints: parsed.keyPoints || [],
      suggestedTasks: parsed.suggestedTasks,
    }
  } catch {
    // Not JSON at all — return the raw response as the summary text
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
    return JSON.parse(stripJsonCodeFence(response))
  } catch {
    // Parse as plain text suggestions
    const lines = response.split('\n').filter(line => line.trim())
    return lines.slice(0, 5).map(line => ({
      nodeText: line.replace(/^[-*•\d.]+\s*/, '').trim(),
    }))
  }
}

/**
 * Generate a structured mindmap outline from source text.
 */
export async function generateMindmapOutline(
  sourceText: string,
  rootTextHint?: string,
  additionalPrompt?: string
): Promise<MindmapOutline> {
  const trimmedSource = sourceText.trim()
  if (!trimmedSource) {
    throw new AIError('No source text provided for mindmap generation.', 'unknown')
  }

  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPTS.mindmap },
    {
      role: 'user',
      content: `Create a mindmap outline from the text below.

Requirements:
- Return ONLY valid JSON (no markdown fences).
- Use this exact schema:
{
  "rootText": "string",
  "rootDescription": "string",
  "children": [
    {
      "text": "string",
      "description": "string",
      "children": [
        { "text": "string", "description": "string", "children": [] }
      ]
    }
  ]
}
- 4 to 8 first-level children.
- Up to 3 levels deep total.
- Keep node text concise (max 80 chars).
- Keep descriptions short and useful.

Root title hint: ${rootTextHint?.trim() || 'Central Idea'}

Additional instructions: ${additionalPrompt?.trim() || 'None'}

Source text:
${trimmedSource.slice(0, 8000)}`,
    },
  ]

  const response = await sendAIRequest(messages, { temperature: 0.5 })
  const parsed = parseMindmapOutlineResponse(response)

  if (!parsed) {
    throw new AIError('AI returned an invalid mindmap outline.', 'upstream')
  }

  const normalizedChildren = normalizeMindmapOutlineNodes(parsed.children, 1, 40)
  const fallbackRoot = (rootTextHint || 'Central Idea').trim().slice(0, 80) || 'Central Idea'

  return {
    rootText: (parsed.rootText || fallbackRoot).trim().slice(0, 80) || fallbackRoot,
    rootDescription: (parsed.rootDescription || '').trim().slice(0, 240),
    children: normalizedChildren,
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
    return JSON.parse(stripJsonCodeFence(response))
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
    return JSON.parse(stripJsonCodeFence(response))
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
  let remainingContextChars = AI_NOTE_CONTEXT_LIMITS.maxTotalInjectedChars

  if (context) {
    const contextParts: string[] = ['\n\nCurrent context:']

    if (context.currentNote) {
      contextParts.push(`- Working on note: "${context.currentNote.title}" (${context.currentNote.type})`)
    }

    // Include selected text for context-aware interactions
    if (context.selectedText) {
      contextParts.push(`- User has selected the following text: "${context.selectedText.slice(0, AI_NOTE_CONTEXT_LIMITS.selectedTextContextChars)}${context.selectedText.length > AI_NOTE_CONTEXT_LIMITS.selectedTextContextChars ? '...' : ''}"`)
      contextParts.push(`  When the user asks about "this", "the selection", or "selected text", refer to this text.`)
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

    // Inject current note full content directly (avoids requiring a tool-call round-trip)
    if (context.currentNote?.content) {
      const current = fitContentIntoContextBudget(
        context.currentNote.content,
        AI_NOTE_CONTEXT_LIMITS.maxCharsPerNote,
        remainingContextChars,
      )
      remainingContextChars -= current.usedChars

      if (!current.omitted) {
        message += `\n\n---\n## Current Note: "${context.currentNote.title}"\n${current.content}${current.truncated ? '\n...(truncated for context window)' : ''}\n---`
      }
    }

    if (context.additionalNoteContents && context.additionalNoteContents.length > 0) {
      const limitedNotes = context.additionalNoteContents.slice(0, AI_NOTE_CONTEXT_LIMITS.maxSelectedNotes)
      message += '\n\n---\n## Notes in Context\n'
      for (const n of limitedNotes) {
        const noteContent = fitContentIntoContextBudget(
          n.content,
          AI_NOTE_CONTEXT_LIMITS.maxCharsPerNote,
          remainingContextChars,
        )
        remainingContextChars -= noteContent.usedChars

        if (noteContent.omitted) {
          message += `\n### "${n.title}"\n[omitted due to context budget]\n`
          continue
        }

        message += `\n### "${n.title}"\n${noteContent.content}${noteContent.truncated ? '\n...(truncated for context window)' : ''}\n`
      }

      const omittedCount = Math.max(0, context.additionalNoteContents.length - limitedNotes.length)
      if (omittedCount > 0) {
        message += `\n${omittedCount} additional note(s) omitted due to note limit.`
      }
      message += '---'
    }
  }

  return message
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

function fitContentIntoContextBudget(
  content: string,
  perNoteMaxChars: number,
  remainingBudgetChars: number,
): { content: string; usedChars: number; truncated: boolean; omitted: boolean } {
  if (remainingBudgetChars <= 0) {
    return { content: '', usedChars: 0, truncated: true, omitted: true }
  }

  const hardMax = Math.max(0, Math.min(perNoteMaxChars, remainingBudgetChars))
  const bounded = truncateAtBoundary(content, hardMax)
  return {
    content: bounded,
    usedChars: bounded.length,
    truncated: bounded.length < content.length,
    omitted: false,
  }
}

function parseMindmapOutlineResponse(response: string): MindmapOutline | null {
  const normalized = stripJsonCodeFence(response)

  try {
    const direct = JSON.parse(normalized)
    if (isMindmapOutlineShape(direct)) {
      return direct
    }
  } catch {
    // Continue with balanced object extraction fallback.
  }

  const start = normalized.indexOf('{')
  if (start === -1) return null
  const extracted = extractBalancedJSONObject(normalized, start)
  if (!extracted) return null

  try {
    const parsed = JSON.parse(extracted)
    return isMindmapOutlineShape(parsed) ? parsed : null
  } catch {
    return null
  }
}

function extractBalancedJSONObject(value: string, startIdx: number): string | null {
  if (value[startIdx] !== '{') return null
  let depth = 0
  let inString = false
  let escaping = false

  for (let i = startIdx; i < value.length; i++) {
    const char = value[i]

    if (escaping) {
      escaping = false
      continue
    }

    if (char === '\\' && inString) {
      escaping = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{') depth++
    if (char === '}') {
      depth--
      if (depth === 0) {
        return value.slice(startIdx, i + 1)
      }
    }
  }

  return null
}

function isMindmapOutlineShape(input: unknown): input is MindmapOutline {
  if (!input || typeof input !== 'object') return false
  const candidate = input as { children?: unknown }
  return Array.isArray(candidate.children)
}

function normalizeMindmapOutlineNodes(
  rawNodes: unknown,
  depth: number,
  remainingBudget: number
): MindmapOutlineNode[] {
  if (!Array.isArray(rawNodes) || depth > 3 || remainingBudget <= 0) {
    return []
  }

  const normalized: MindmapOutlineNode[] = []
  let budget = remainingBudget

  for (const rawNode of rawNodes) {
    if (budget <= 0) break
    if (!rawNode || typeof rawNode !== 'object') continue

    const record = rawNode as {
      text?: unknown
      description?: unknown
      children?: unknown
    }

    const text = typeof record.text === 'string' ? record.text.trim() : ''
    if (!text) continue

    budget -= 1
    const children = normalizeMindmapOutlineNodes(record.children, depth + 1, budget)
    budget -= children.length

    normalized.push({
      text: text.slice(0, 80),
      description: typeof record.description === 'string' ? record.description.trim().slice(0, 240) : '',
      children,
    })
  }

  return normalized
}

// ============================================================================
// NOTE TYPE CONTENT EXTRACTORS
// ============================================================================

/**
 * Convert MindmapData nodes into a readable indented outline for AI context.
 */
export function extractMindmapForAI(
  nodes: Record<string, { text: string; description: string; children: string[]; parentId: string | null }>,
  rootId: string
): string {
  const buildTree = (nodeId: string, depth: number): string => {
    const node = nodes[nodeId]
    if (!node) return ''
    const indent = '  '.repeat(depth)
    const prefix = depth === 0 ? '' : `${indent}- `
    const desc = node.description ? ` — ${node.description}` : ''
    const childLines = node.children
      .map(id => buildTree(id, depth + 1))
      .filter(Boolean)
      .join('\n')
    return `${prefix}${node.text}${desc}${childLines ? '\n' + childLines : ''}`
  }
  return buildTree(rootId, 0)
}

/**
 * Convert BulletJournal entries into readable text for AI context.
 */
export function extractBulletJournalForAI(
  entries: Array<{ signifier: string; content: string; indent_level: number; entry_date: string | null }>
): string {
  return entries
    .filter(e => e.content.trim())
    .map(e => {
      const indent = '  '.repeat(e.indent_level)
      const date = e.entry_date ? ` [${e.entry_date}]` : ''
      return `${indent}[${e.signifier}]${date} ${e.content}`
    })
    .join('\n')
}

/**
 * Convert DataSheet columns+rows into a markdown table for AI context.
 */
export function extractDataSheetForAI(
  columns: Array<{ name: string }>,
  rows: string[][]
): string {
  if (!columns.length) return '(empty spreadsheet)'
  const header = columns.map(c => c.name).join(' | ')
  const separator = columns.map(() => '---').join(' | ')
  const dataRows = rows.slice(0, 50).map(row =>
    columns.map((_, i) => row[i] ?? '').join(' | ')
  )
  const suffix = rows.length > 50 ? `\n... (${rows.length - 50} more rows)` : ''
  return [header, separator, ...dataRows].join('\n') + suffix
}

/**
 * Strip HTML tags for AI processing
 */
/** Strip ```json / ``` code fences that models sometimes wrap around JSON responses */
function stripJsonCodeFence(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

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
