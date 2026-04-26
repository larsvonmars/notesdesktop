const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro'])
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant', 'tool'])
const ALLOWED_TOOL_NAMES = new Set([
  'list_notes',
  'read_note',
  'search_notes',
  'create_mindmap_note',
  'replace_note_content',
  'edit_note_content',
])
const MAX_MESSAGES = 100
const MAX_MESSAGE_CONTENT_CHARS = 320000
const MAX_TOTAL_MESSAGE_CHARS = 640000
const MAX_TOOL_COUNT = 8

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

function validateMessages(messages: unknown): messages is Array<Record<string, unknown>> {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return false
  }

  return messages.every(message => {
    if (!isRecord(message)) return false
    const role = message.role
    const content = message.content
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) return false
    if (typeof content !== 'string') return false
    return content.length <= MAX_MESSAGE_CONTENT_CHARS
  })
}

function getTotalMessageChars(messages: Array<Record<string, unknown>>): number {
  return messages.reduce((sum, message) => {
    const content = message.content
    return sum + (typeof content === 'string' ? content.length : 0)
  }, 0)
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

function validateThinking(thinking: unknown): boolean {
  if (!isRecord(thinking)) return false
  return thinking.type === 'enabled' || thinking.type === 'disabled'
}

function validateReasoningEffort(reasoningEffort: unknown): boolean {
  return reasoningEffort === 'high' || reasoningEffort === 'max'
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

  const payload: Record<string, unknown> = {
    messages,
    model: 'deepseek-v4-flash',
  }

  const model = input.model
  if (typeof model === 'string') {
    if (!ALLOWED_MODELS.has(model)) {
      return { valid: false, message: 'Invalid payload: unsupported model.' }
    }
    payload.model = model
  }

  const temperature = input.temperature
  if (temperature !== undefined) {
    if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      return { valid: false, message: 'Invalid payload: temperature must be between 0 and 2.' }
    }
    payload.temperature = temperature
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

  if (input.thinking !== undefined) {
    if (!validateThinking(input.thinking)) {
      return {
        valid: false,
        message: 'Invalid payload: thinking is not supported.',
      }
    }
    payload.thinking = input.thinking
  }

  if (input.reasoning_effort !== undefined) {
    if (!validateReasoningEffort(input.reasoning_effort)) {
      return {
        valid: false,
        message: 'Invalid payload: reasoning_effort is not supported.',
      }
    }
    payload.reasoning_effort = input.reasoning_effort
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