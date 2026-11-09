import { AI_MODEL, AI_REASONING_EFFORT, AI_THINKING } from '@/lib/ai-model'

const ALLOWED_ROLES = new Set(['system', 'user', 'assistant', 'tool'])
const ALLOWED_TOOL_NAMES = new Set([
  'list_notes',
  'read_note',
  'search_notes',
  'create_mindmap_note',
  // Chat view tools (notes, tasks, calendar, projects, Learn, workspace)
  'create_note',
  'append_to_note',
  'update_note',
  'delete_note',
  'create_mindmap_note',
  'create_data_sheet_note',
  'create_bullet_journal_note',
  'create_folder',
  'create_project',
  'update_project',
  'list_folders',
  'list_projects',
  'list_tasks',
  'create_task',
  'complete_task',
  'update_task',
  'delete_task',
  'get_task_stats',
  'list_events',
  'create_event',
  'update_event',
  'delete_event',
  'get_current_date',
  'get_workspace_overview',
  'delegate_subtask',
  // Learn workspace
  'list_decks',
  'get_cards',
  'create_deck',
  'add_cards',
  'update_card',
  'update_deck',
  'delete_card',
  'delete_deck',
  'get_stats',
  'search_cards',
])
const MAX_MESSAGES = 100
const MAX_MESSAGE_CONTENT_CHARS = 320000
const MAX_TOTAL_MESSAGE_CHARS = 640000
const MAX_TOOL_COUNT = 48
/** A single user message may mix text with a handful of images (vision). */
const MAX_CONTENT_PARTS = 8
/** Base64 image payload ceiling (~9 MB decoded) per image part. */
const MAX_IMAGE_URL_CHARS = 12_000_000

type ValidationSuccess = {
  valid: true
  payload: Record<string, unknown>
}

type ValidationFailure = {
  valid: false
  message: string
}

export type ValidationResult = ValidationSuccess | ValidationFailure

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Text length of a message's content. Accepts a plain string or, for vision
 * requests, an array of text/image_url parts. Returns null when invalid.
 */
function getContentChars(content: unknown): number | null {
  if (typeof content === 'string') return content.length
  if (!Array.isArray(content) || content.length === 0 || content.length > MAX_CONTENT_PARTS) {
    return null
  }

  let chars = 0
  for (const part of content) {
    if (!isRecord(part)) return null
    if (part.type === 'text') {
      if (typeof part.text !== 'string') return null
      chars += part.text.length
      continue
    }
    if (part.type === 'image_url') {
      const imageUrl = part.image_url
      if (!isRecord(imageUrl) || typeof imageUrl.url !== 'string') return null
      if (!/^(data:image\/(png|jpe?g|webp|gif);base64,|https:\/\/)/i.test(imageUrl.url)) return null
      if (imageUrl.url.length > MAX_IMAGE_URL_CHARS) return null
      continue
    }
    return null
  }
  return chars
}

function validateMessages(messages: unknown): messages is Array<Record<string, unknown>> {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return false
  }

  return messages.every(message => {
    if (!isRecord(message)) return false
    const role = message.role
    const content = message.content
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) return false
    // Rich (multipart) content is only accepted from the user turn; tool and
    // assistant messages must stay plain text.
    if (Array.isArray(content) && role !== 'user') return false
    const chars = getContentChars(content)
    if (chars === null) return false
    return chars <= MAX_MESSAGE_CONTENT_CHARS
  })
}

function getTotalMessageChars(messages: Array<Record<string, unknown>>): number {
  return messages.reduce((sum, message) => sum + (getContentChars(message.content) ?? 0), 0)
}

function validateTools(tools: unknown): tools is Array<Record<string, unknown>> {
  if (!Array.isArray(tools) || tools.length === 0 || tools.length > MAX_TOOL_COUNT) return false

  return tools.every(tool => {
    if (!isRecord(tool)) return false
    if (tool.type !== 'function') return false
    const fn = tool.function
    if (!isRecord(fn)) return false

    const name = fn.name
    const description = fn.description
    const parameters = fn.parameters

    if (typeof name !== 'string' || !ALLOWED_TOOL_NAMES.has(name)) return false
    if (typeof description !== 'string' || description.length < 1 || description.length > 1000) return false
    if (!isRecord(parameters)) return false
    if (parameters.type !== 'object') return false

    return true
  })
}

function validateToolChoice(toolChoice: unknown): boolean {
  if (toolChoice === 'auto' || toolChoice === 'none' || toolChoice === 'required') return true
  if (!isRecord(toolChoice)) return false
  if (toolChoice.type !== 'function') return false
  const fn = toolChoice.function
  if (!isRecord(fn)) return false
  return typeof fn.name === 'string' && ALLOWED_TOOL_NAMES.has(fn.name)
}

function validateResponseFormat(responseFormat: unknown): boolean {
  if (!isRecord(responseFormat)) return false
  return responseFormat.type === 'text' || responseFormat.type === 'json_object'
}

export function validateAndSanitizeAIPayload(
  input: unknown,
  options?: { forceStream?: boolean },
): ValidationResult {
  if (!isRecord(input)) {
    return { valid: false, message: 'Invalid payload: expected JSON object.' }
  }

  const messages = input.messages
  if (!validateMessages(messages)) {
    return {
      valid: false,
      message: 'Invalid payload: messages must be a non-empty array of valid role/content items.',
    }
  }

  const totalMessageChars = getTotalMessageChars(messages)
  if (totalMessageChars > MAX_TOTAL_MESSAGE_CHARS) {
    return {
      valid: false,
      message: 'Invalid payload: total message content is too large. Reduce context and retry.',
    }
  }

  // The app always talks to the newest DeepSeek Flash with thinking enabled.
  // Model, thinking and sampling controls are pinned server-side; any
  // client-supplied model/thinking/temperature fields are intentionally ignored
  // so the assistant cannot be pointed anywhere else.
  const payload: Record<string, unknown> = {
    messages,
    model: AI_MODEL,
    thinking: AI_THINKING,
    reasoning_effort: AI_REASONING_EFFORT,
  }

  const maxTokens = input.max_tokens
  if (maxTokens !== undefined) {
    if (!Number.isInteger(maxTokens) || (maxTokens as number) < 1 || (maxTokens as number) > 16384) {
      return { valid: false, message: 'Invalid payload: max_tokens must be an integer between 1 and 16384.' }
    }
    payload.max_tokens = maxTokens
  }

  if (input.tools !== undefined) {
    if (!validateTools(input.tools)) {
      return {
        valid: false,
        message: 'Invalid payload: tools must be a valid list of supported function tool definitions.',
      }
    }
    payload.tools = input.tools
  }

  if (input.tool_choice !== undefined) {
    if (!validateToolChoice(input.tool_choice)) {
      return {
        valid: false,
        message: 'Invalid payload: tool_choice is not supported.',
      }
    }
    payload.tool_choice = input.tool_choice
  }

  if (input.response_format !== undefined) {
    if (!validateResponseFormat(input.response_format)) {
      return {
        valid: false,
        message: 'Invalid payload: response_format is not supported.',
      }
    }
    payload.response_format = input.response_format
  }

  const stream = options?.forceStream ? true : input.stream
  if (stream !== undefined) {
    if (typeof stream !== 'boolean') {
      return { valid: false, message: 'Invalid payload: stream must be a boolean.' }
    }
    payload.stream = stream
  }

  return { valid: true, payload }
}