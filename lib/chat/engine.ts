/**
 * Chat turn engine.
 *
 * Runs the model as an OpenAI-compatible multi-step tool loop: stream a step,
 * execute any requested tools locally, feed the results back, repeat until the
 * model answers without tool calls (or the step budget is spent).
 */

import { AI_MODEL, AI_REASONING_EFFORT, AI_THINKING } from '@/lib/ai-model'
import {
  BASE_CHAT_TOOLS,
  CHAT_TOOL_GROUP_NAMES,
  getChatToolsByGroups,
  toToolDefinitions,
  type ChatToolContext,
  type ChatToolDefinition,
  type ChatToolSpec,
} from './tools'
import { requestChatCompletion, type AccumulatedToolCall } from './transport'
import { AGENT_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT, SUB_AGENT_SYSTEM_PROMPT } from './prompts'
import type { ChatMessage, ChatToolCall, ChatTurnCallbacks, ChatTurnResult } from './types'

const CHAT_MAX_STEPS = 6
const AGENT_MAX_STEPS = 15
const SUB_AGENT_MAX_STEPS = 8
const CHAT_MAX_TOKENS = 4096
const AGENT_MAX_TOKENS = 8192
const MAX_TOOL_OUTPUT_CHARS = 12000
/**
 * Text budget for replayed history. The proxy rejects oversized payloads, so
 * long conversations keep the newest turns instead of failing outright.
 */
const MAX_HISTORY_TEXT_CHARS = 480000

type TextPart = { type: 'text'; text: string }
type ImagePart = { type: 'image_url'; image_url: { url: string } }

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<TextPart | ImagePart>
  /** Required by DeepSeek thinking mode on assistant messages that call tools. */
  reasoning_content?: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

export interface RunChatTurnOptions {
  /** Full conversation, oldest first. */
  messages: ChatMessage[]
  userId: string
  agentMode: boolean
  /** Tool forced for the first step (chat mode only). */
  forcedTool?: string | null
  signal?: AbortSignal
  callbacks?: ChatTurnCallbacks
}

function messageTextChars(message: OpenAIMessage): number {
  if (typeof message.content === 'string') return message.content.length
  return message.content.reduce(
    (total, part) => total + (part.type === 'text' ? part.text.length : 0),
    0,
  )
}

/** Build the OpenAI message list for a conversation, keeping the newest turns. */
export function buildOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
  const lastUserIndex = messages.reduce(
    (last, message, index) => (message.role === 'user' ? index : last),
    -1,
  )

  const converted = messages.map<OpenAIMessage>((message, index) => {
    const documentBlocks = (message.attachments ?? [])
      .filter((attachment) => attachment.kind === 'document' && attachment.text)
      .map(
        (attachment) =>
          `[📄 ${attachment.name}${attachment.truncated ? ' (truncated)' : ''}]\n\n${attachment.text}`,
      )

    const text = [documentBlocks.join('\n\n---\n\n'), message.content]
      .filter((part) => part && part.trim())
      .join('\n\n')

    // Images are only sent for the newest user message: data URLs are large and
    // older pictures rarely matter for follow-up questions.
    const images =
      index === lastUserIndex
        ? (message.attachments ?? [])
            .filter((attachment) => attachment.kind === 'image' && attachment.dataUrl)
            .map<ImagePart>((attachment) => ({
              type: 'image_url',
              image_url: { url: attachment.dataUrl as string },
            }))
        : []

    if (message.role === 'user' && images.length > 0) {
      return {
        role: 'user',
        content: [...(text ? [{ type: 'text' as const, text }] : []), ...images],
      }
    }

    return { role: message.role, content: text }
  })

  // Walk backwards so the most recent exchange always survives the budget.
  let total = 0
  let start = converted.length
  for (let index = converted.length - 1; index >= 0; index--) {
    const chars = messageTextChars(converted[index])
    const isNewest = index === converted.length - 1
    if (!isNewest && total + chars > MAX_HISTORY_TEXT_CHARS) break
    total += chars
    start = index
  }

  return converted.slice(start)
}

function summariseToolOutput(output: string): string {
  return output.length > MAX_TOOL_OUTPUT_CHARS
    ? `${output.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n\n[... tool output truncated]`
    : output
}

function parseArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** Build the delegate_subtask tool, which recursively runs a restricted agent. */
function createDelegateTool(
  ctx: ChatToolContext,
  signal?: AbortSignal,
): ChatToolSpec {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'delegate_subtask',
        description: `Delegate a focused subtask to a specialised sub-agent that only sees the tools you grant it.

Use it for multi-domain requests (e.g. "review my project notes and my task load"): issue one delegate_subtask call per domain in the same turn and they run in parallel.
Available tool groups: ${CHAT_TOOL_GROUP_NAMES.join(', ')}.`,
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The precise task for the sub-agent, including what to report back.',
            },
            tools: {
              type: 'array',
              items: { type: 'string', enum: CHAT_TOOL_GROUP_NAMES },
              description: 'Tool groups the sub-agent may use.',
            },
            maxSteps: {
              type: 'number',
              minimum: 1,
              maximum: SUB_AGENT_MAX_STEPS,
              description: `Maximum tool rounds for the sub-agent (default ${SUB_AGENT_MAX_STEPS}).`,
            },
          },
          required: ['prompt', 'tools'],
        },
      },
    },
    execute: async (args) => {
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
      if (!prompt) return 'Sub-agent error: a prompt is required.'

      const requested = Array.isArray(args.tools)
        ? args.tools.filter((value): value is string => typeof value === 'string')
        : []
      const tools = getChatToolsByGroups(requested)
      if (Object.keys(tools).length === 0) {
        return `Sub-agent error: no valid tool groups. Available: ${CHAT_TOOL_GROUP_NAMES.join(', ')}.`
      }

      const maxSteps =
        typeof args.maxSteps === 'number'
          ? Math.max(1, Math.min(SUB_AGENT_MAX_STEPS, Math.round(args.maxSteps)))
          : SUB_AGENT_MAX_STEPS

      const result = await runConversation({
        history: [{ role: 'user', content: prompt }],
        system: SUB_AGENT_SYSTEM_PROMPT,
        tools,
        maxSteps,
        maxTokens: CHAT_MAX_TOKENS,
        ctx,
        signal,
      })

      return result.text.trim() || '(Sub-agent finished but returned no text.)'
    },
  }
}

interface RunConversationOptions {
  history: OpenAIMessage[]
  system: string
  tools: Record<string, ChatToolSpec>
  maxSteps: number
  maxTokens: number
  ctx: ChatToolContext
  signal?: AbortSignal
  callbacks?: ChatTurnCallbacks
  forcedTool?: string | null
  /** Collected tool calls for the UI (top-level turn only). */
  collected?: ChatToolCall[]
}

async function runConversation(options: RunConversationOptions): Promise<ChatTurnResult> {
  const { history, system, tools, maxSteps, maxTokens, ctx, signal, callbacks, forcedTool } = options
  const definitions = toToolDefinitions(tools)
  const turnMessages: OpenAIMessage[] = [...history]

  let text = ''
  let reasoning = ''
  const collected = options.collected ?? []

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const payload: Record<string, unknown> = {
      model: AI_MODEL,
      messages: [{ role: 'system', content: system }, ...turnMessages],
      thinking: AI_THINKING,
      reasoning_effort: AI_REASONING_EFFORT,
      max_tokens: maxTokens,
    }

    if (definitions.length > 0) {
      payload.tools = definitions as ChatToolDefinition[]
      payload.tool_choice =
        step === 0 && forcedTool && tools[forcedTool]
          ? { type: 'function', function: { name: forcedTool } }
          : 'auto'
    }

    let stepText = ''
    let stepReasoning = ''
    const result = await requestChatCompletion(
      payload,
      {
        onText: (delta) => {
          stepText += delta
          text += delta
          callbacks?.onText?.(delta)
        },
        onReasoning: (delta) => {
          // Separate the reasoning of consecutive tool steps for readability.
          if (!stepReasoning && reasoning) {
            reasoning += '\n\n'
            callbacks?.onReasoning?.('\n\n')
          }
          stepReasoning += delta
          reasoning += delta
          callbacks?.onReasoning?.(delta)
        },
      },
      signal,
    )

    // Non-streaming transports (desktop) return the whole answer at once.
    if (!stepText && result.content) {
      text += result.content
      callbacks?.onText?.(result.content)
    }
    if (!stepReasoning && result.reasoning) {
      if (reasoning) {
        reasoning += '\n\n'
        callbacks?.onReasoning?.('\n\n')
      }
      reasoning += result.reasoning
      callbacks?.onReasoning?.(result.reasoning)
    }

    const calls = result.toolCalls.filter((call) => call.name)
    if (calls.length === 0) break

    turnMessages.push({
      role: 'assistant',
      content: result.content,
      // Thinking mode rejects tool-call turns whose reasoning is not echoed back.
      reasoning_content: stepReasoning || result.reasoning || undefined,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    })

    const runTool = async (call: AccumulatedToolCall) => {
      const args = parseArguments(call.arguments)
      callbacks?.onToolStart?.({ id: call.id, name: call.name, arguments: call.arguments })

      const entry: ChatToolCall = {
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        status: 'running',
      }
      collected.push(entry)

      const spec = tools[call.name]
      let output: string
      if (!spec) {
        output = `Error: unknown tool "${call.name}".`
        entry.status = 'error'
        entry.error = output
      } else {
        try {
          output = summariseToolOutput(await spec.execute(args, ctx))
          entry.status = 'done'
          entry.result = output
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          output = `Error: ${message}`
          entry.status = 'error'
          entry.error = message
        }
      }

      callbacks?.onToolFinish?.({ id: call.id, result: entry.result, error: entry.error })
      return { call, output }
    }

    // Parallel only for independent delegations; all other tools run in order so
    // data mutations cannot race each other.
    const parallel = calls.every((call) => call.name === 'delegate_subtask')
    const results = parallel
      ? await Promise.all(calls.map(runTool))
      : await calls.reduce<Promise<{ call: AccumulatedToolCall; output: string }[]>>(
          async (previous, call) => [...(await previous), await runTool(call)],
          Promise.resolve([]),
        )

    for (const { call, output } of results) {
      turnMessages.push({ role: 'tool', tool_call_id: call.id, content: output })
    }
  }

  return { text, reasoning, toolCalls: collected }
}

/** Run one user turn and stream the assistant answer. */
export async function runChatTurn(options: RunChatTurnOptions): Promise<ChatTurnResult> {
  const { messages, userId, agentMode, forcedTool, signal, callbacks } = options
  const ctx: ChatToolContext = { userId, signal }

  const tools: Record<string, ChatToolSpec> = { ...BASE_CHAT_TOOLS }
  if (agentMode) {
    tools.delegate_subtask = createDelegateTool(ctx, signal)
  }

  return runConversation({
    history: buildOpenAIMessages(messages),
    system: agentMode ? AGENT_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT,
    tools,
    maxSteps: agentMode ? AGENT_MAX_STEPS : CHAT_MAX_STEPS,
    maxTokens: agentMode ? AGENT_MAX_TOKENS : CHAT_MAX_TOKENS,
    ctx,
    signal,
    callbacks,
    forcedTool: agentMode ? null : forcedTool,
    collected: [],
  })
}
