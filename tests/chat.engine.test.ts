import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildOpenAIMessages, runChatTurn } from '@/lib/chat/engine'
import type { ChatMessage } from '@/lib/chat/types'

const completionMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/chat/transport', () => ({
  requestChatCompletion: completionMock,
}))

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

function userMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'u1',
    role: 'user',
    content: 'Hello',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('chat engine', () => {
  afterEach(() => {
    completionMock.mockReset()
  })

  it('inlines document text and only sends images from the newest user turn', () => {
    const messages: ChatMessage[] = [
      userMessage({
        id: 'u1',
        content: 'First',
        attachments: [
          {
            id: 'img-old',
            kind: 'image',
            name: 'old.png',
            mediaType: 'image/png',
            size: 10,
            dataUrl: 'data:image/png;base64,OLD',
          },
        ],
      }),
      { id: 'a1', role: 'assistant', content: 'Answer', createdAt: new Date().toISOString() },
      userMessage({
        id: 'u2',
        content: 'Second',
        attachments: [
          {
            id: 'img-new',
            kind: 'image',
            name: 'new.png',
            mediaType: 'image/png',
            size: 10,
            dataUrl: 'data:image/png;base64,NEW',
          },
          {
            id: 'doc-1',
            kind: 'document',
            name: 'brief.pdf',
            mediaType: 'application/pdf',
            size: 100,
            text: 'Document body',
          },
        ],
      }),
    ]

    const converted = buildOpenAIMessages(messages)

    expect(converted).toHaveLength(3)
    expect(typeof converted[0].content).toBe('string')

    const latest = converted[2].content
    expect(Array.isArray(latest)).toBe(true)
    const parts = latest as Array<{ type: string; text?: string; image_url?: { url: string } }>
    expect(parts[0]).toMatchObject({ type: 'text' })
    expect(parts[0].text).toContain('[📄 brief.pdf]')
    expect(parts[0].text).toContain('Document body')
    expect(parts[0].text).toContain('Second')
    expect(parts.some((part) => part.image_url?.url === 'data:image/png;base64,NEW')).toBe(true)
    expect(parts.some((part) => part.image_url?.url === 'data:image/png;base64,OLD')).toBe(false)
  })

  it('executes requested tools and feeds the results back before answering', async () => {
    completionMock
      .mockResolvedValueOnce({
        content: '',
        reasoning: 'Need the date.',
        toolCalls: [{ id: 'call-1', name: 'get_current_date', arguments: '{}' }],
      })
      .mockResolvedValueOnce({ content: 'It is today.', reasoning: '', toolCalls: [] })

    const onToolStart = vi.fn()
    const onToolFinish = vi.fn()

    const result = await runChatTurn({
      messages: [userMessage()],
      userId: 'user-1',
      agentMode: false,
      callbacks: { onToolStart, onToolFinish },
    })

    expect(completionMock).toHaveBeenCalledTimes(2)
    expect(onToolStart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'call-1', name: 'get_current_date' })
    )
    expect(onToolFinish).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'call-1', result: expect.any(String) })
    )
    expect(result.text).toBe('It is today.')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]).toMatchObject({ id: 'call-1', status: 'done' })

    const secondPayload = completionMock.mock.calls[1][0] as { messages: Array<Record<string, unknown>> }
    const toolMessage = secondPayload.messages.find((message) => message.role === 'tool')
    expect(toolMessage).toBeTruthy()
    expect(String(toolMessage?.content)).toContain('iso')
  })

  it('forces the selected tool on the first step only', async () => {
    completionMock.mockResolvedValue({ content: 'Done', reasoning: '', toolCalls: [] })

    await runChatTurn({
      messages: [userMessage({ content: 'search my notes' })],
      userId: 'user-1',
      agentMode: false,
      forcedTool: 'search_notes',
    })

    const payload = completionMock.mock.calls[0][0] as Record<string, unknown>
    expect(payload.tool_choice).toEqual({ type: 'function', function: { name: 'search_notes' } })
    expect(Array.isArray(payload.tools)).toBe(true)
  })

  it('reports tool failures without breaking the turn', async () => {
    completionMock
      .mockResolvedValueOnce({
        content: '',
        reasoning: '',
        toolCalls: [{ id: 'call-x', name: 'not_a_real_tool', arguments: '{}' }],
      })
      .mockResolvedValueOnce({ content: 'Recovered', reasoning: '', toolCalls: [] })

    const onToolFinish = vi.fn()
    const result = await runChatTurn({
      messages: [userMessage()],
      userId: 'user-1',
      agentMode: false,
      callbacks: { onToolFinish },
    })

    expect(result.text).toBe('Recovered')
    expect(result.toolCalls[0]).toMatchObject({ status: 'error' })
    expect(onToolFinish).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('unknown tool') })
    )
  })
})
