const ALLOWED_MODELS = new Set(['deepseek-chat', 'deepseek-reasoner'])
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant', 'tool'])

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
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    return false
  }

  return messages.every(message => {
    if (!isRecord(message)) return false
    const role = message.role
    const content = message.content
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) return false
    if (typeof content !== 'string') return false
    return content.length <= 120000
  })
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

  const payload: Record<string, unknown> = {
    messages,
    model: 'deepseek-chat',
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

  if (Array.isArray(input.tools)) {
    payload.tools = input.tools
  }

  if (input.tool_choice !== undefined) {
    payload.tool_choice = input.tool_choice
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