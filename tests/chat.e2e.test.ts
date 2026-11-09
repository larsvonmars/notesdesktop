import { afterEach, describe, expect, it, vi } from 'vitest'

import { runChatTurn } from '@/lib/chat/engine'

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

function deltaEvent(delta: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`
}

describe('chat turn over the proxy', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('streams a tool call, runs it locally and finishes with an answer', async () => {
    const toolCallStream = sseResponse([
      deltaEvent({ reasoning_content: 'I need the date.' }),
      deltaEvent({
        tool_calls: [
          {
            index: 0,
            id: 'call_date',
            function: { name: 'get_current_date', arguments: '' },
          },
        ],
      }),
      deltaEvent({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }),
      'data: [DONE]',
    ])
    const answerStream = sseResponse([
      deltaEvent({ reasoning_content: 'Composing the answer.' }),
      deltaEvent({ content: 'Today is a good day.' }),
      'data: [DONE]',
    ])

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(toolCallStream)
      .mockResolvedValueOnce(answerStream)

    const deltas: string[] = []
    const result = await runChatTurn({
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'What day is it?',
          createdAt: new Date().toISOString(),
        },
      ],
      userId: 'user-1',
      agentMode: false,
      callbacks: { onText: (delta) => deltas.push(delta) },
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]).toMatchObject({ name: 'get_current_date', status: 'done' })
    expect(deltas.join('')).toBe('Today is a good day.')
    expect(result.text).toBe('Today is a good day.')
    expect(result.reasoning).toBe('I need the date.\n\nComposing the answer.')

    const secondRequest = fetchMock.mock.calls[1][1] as { body: string }
    const payload = JSON.parse(secondRequest.body) as {
      messages: {
        role: string
        content: string
        tool_call_id?: string
        reasoning_content?: string
        tool_calls?: unknown[]
      }[]
    }
    const toolMessage = payload.messages.find((message) => message.role === 'tool')
    expect(toolMessage).toBeTruthy()

    // DeepSeek thinking mode rejects tool-call turns without the reasoning echo.
    const assistantToolTurn = payload.messages.find(
      (message) => message.role === 'assistant' && Array.isArray(message.tool_calls)
    )
    expect(assistantToolTurn?.reasoning_content).toBe('I need the date.')
  })
})
