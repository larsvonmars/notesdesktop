/**
 * Transport for the Chat view.
 *
 * Web builds go through the DeepSeek proxy (`/api/ai/stream` SSE) so the API key
 * never reaches the browser; desktop builds call the Tauri command, which holds
 * the key in the OS keychain. Both accept the same OpenAI-compatible payload.
 */

import { getWebAIEndpoint, getWebAuthHeader, isTauriRuntime } from '@/lib/ai'

export interface AccumulatedToolCall {
  id: string
  name: string
  arguments: string
}

export interface ChatCompletionResult {
  content: string
  reasoning: string
  toolCalls: AccumulatedToolCall[]
}

export interface ChatCompletionHandlers {
  onText?: (delta: string) => void
  onReasoning?: (delta: string) => void
}

interface RawToolCallDelta {
  index?: number
  id?: string
  function?: { name?: string; arguments?: string }
}

function accumulateToolCall(
  calls: Map<number, AccumulatedToolCall>,
  delta: RawToolCallDelta,
) {
  const index = typeof delta.index === 'number' ? delta.index : 0
  const existing = calls.get(index) ?? { id: '', name: '', arguments: '' }
  if (delta.id) existing.id = delta.id
  if (delta.function?.name) existing.name = delta.function.name
  if (delta.function?.arguments) existing.arguments += delta.function.arguments
  calls.set(index, existing)
}

async function readErrorMessage(response: Response): Promise<string> {
  const raw = await response.text().catch(() => '')
  try {
    const parsed = JSON.parse(raw)
    const message = parsed?.error?.message ?? parsed?.message
    if (typeof message === 'string' && message.trim()) return message
  } catch {
    // Not JSON — fall through to the raw body/status text.
  }
  return raw.trim() || `AI request failed: ${response.status} ${response.statusText}`
}

async function requestViaTauri(
  payload: Record<string, unknown>,
  handlers: ChatCompletionHandlers,
): Promise<ChatCompletionResult> {
  const { invoke } = await import('@tauri-apps/api/core')
  const data = await invoke<{
    choices?: {
      message?: {
        content?: string
        reasoning_content?: string
        tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[]
      }
    }[]
  }>('ai_chat_json', { payload })

  const message = data?.choices?.[0]?.message
  const content = message?.content ?? ''
  const reasoning = message?.reasoning_content ?? ''
  const toolCalls: AccumulatedToolCall[] = (message?.tool_calls ?? []).map((call, index) => ({
    id: call.id ?? `call_${index}`,
    name: call.function?.name ?? '',
    arguments: call.function?.arguments ?? '',
  }))

  if (reasoning) handlers.onReasoning?.(reasoning)
  if (content) handlers.onText?.(content)

  return { content, reasoning, toolCalls }
}

async function requestViaProxy(
  payload: Record<string, unknown>,
  handlers: ChatCompletionHandlers,
  signal?: AbortSignal,
): Promise<ChatCompletionResult> {
  const authHeaders = await getWebAuthHeader()
  const response = await fetch(getWebAIEndpoint('/api/ai/stream'), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('The AI response stream is not readable.')

  const decoder = new TextDecoder()
  const toolCalls = new Map<number, AccumulatedToolCall>()
  let content = ''
  let reasoning = ''
  let buffer = ''

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const data = trimmed.slice(5).trim()
    if (!data || data === '[DONE]') return

    let parsed: {
      choices?: {
        delta?: {
          content?: string
          reasoning_content?: string
          tool_calls?: RawToolCallDelta[]
        }
      }[]
    }
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }

    const delta = parsed.choices?.[0]?.delta
    if (!delta) return

    if (delta.reasoning_content) {
      reasoning += delta.reasoning_content
      handlers.onReasoning?.(delta.reasoning_content)
    }
    if (delta.content) {
      content += delta.content
      handlers.onText?.(delta.content)
    }
    for (const callDelta of delta.tool_calls ?? []) {
      accumulateToolCall(toolCalls, callDelta)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    // Keep the trailing partial line for the next chunk.
    buffer = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
  }

  // Flush the decoder and any event that arrived without a trailing newline.
  buffer += decoder.decode()
  for (const line of buffer.split('\n')) handleLine(line)

  return {
    content,
    reasoning,
    toolCalls: [...toolCalls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, call]) => ({ ...call, id: call.id || `call_${index}` })),
  }
}

/** Run one completion (streaming on web, single-shot in desktop builds). */
export async function requestChatCompletion(
  payload: Record<string, unknown>,
  handlers: ChatCompletionHandlers = {},
  signal?: AbortSignal,
): Promise<ChatCompletionResult> {
  if (isTauriRuntime()) {
    return requestViaTauri(payload, handlers)
  }
  return requestViaProxy(payload, handlers, signal)
}
