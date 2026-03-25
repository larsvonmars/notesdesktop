import { afterEach, describe, expect, it, vi } from 'vitest'

import { validateAndSanitizeAIPayload } from '@/app/api/ai/validation'
import { chat } from '@/lib/ai'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}))

describe('AI validation and context shaping', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects payloads when aggregate message content is too large', () => {
    const payload = {
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: 'a'.repeat(250000) },
        { role: 'assistant', content: 'b'.repeat(250000) },
        { role: 'user', content: 'c'.repeat(250000) },
      ],
    }

    const result = validateAndSanitizeAIPayload(payload)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.message).toContain('total message content is too large')
    }
  })

  it('rejects unsupported tool definitions', () => {
    const payload = {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'unknown_tool',
            description: 'bad tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
    }

    const result = validateAndSanitizeAIPayload(payload)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.message).toContain('tools must be a valid list')
    }
  })

  it('builds system context with truncation and note omission markers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const additionalNotes = Array.from({ length: 14 }, (_, i) => ({
      id: `note-${i}`,
      title: `Note ${i}`,
      content: 'lorem ipsum '.repeat(4000),
    }))

    await chat('Summarize context', {
      currentNote: {
        id: 'current',
        title: 'Current Note',
        content: 'current note text '.repeat(5000),
        type: 'rich-text',
      },
      additionalNoteContents: additionalNotes,
      allNotes: additionalNotes.map(n => ({ id: n.id, title: n.title })),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body))
    const systemMessage = String(body.messages?.[0]?.content || '')

    expect(systemMessage).toContain('...(truncated for context window)')
    expect(
      systemMessage.includes('[omitted due to context budget]') ||
      systemMessage.includes('additional note(s) omitted due to note limit')
    ).toBe(true)
  })
})
