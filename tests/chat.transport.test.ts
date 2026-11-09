import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestChatCompletion } from '@/lib/chat/transport'

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('chat transport (proxy)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('streams reasoning, text and tool call deltas from SSE', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"reasoning_content":"Thinking"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search_notes","arguments":"{\\"que"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ry\\":\\"x\\"}"}}]}}]}\n\n',
      'data: [DONE]',
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse(chunks))

    const onText = vi.fn()
    const onReasoning = vi.fn()
    const result = await requestChatCompletion({ messages: [] }, { onText, onReasoning })

    expect(result.content).toBe('Hello')
    expect(result.reasoning).toBe('Thinking')
    expect(onText).toHaveBeenCalledWith('Hel')
    expect(onReasoning).toHaveBeenCalledWith('Thinking')
    expect(result.toolCalls).toEqual([
      { id: 'call_1', name: 'search_notes', arguments: '{"query":"x"}' },
    ])
  })

  it('surfaces proxy errors as readable messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Rate limit exceeded.' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(requestChatCompletion({ messages: [] })).rejects.toThrow('Rate limit exceeded.')
  })
})
