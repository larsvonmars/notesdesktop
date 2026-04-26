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
      model: 'deepseek-v4-flash',
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
      model: 'deepseek-v4-flash',
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

  it('accepts supported response_format values for structured AI output', () => {
    const payload = {
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'hello' }],
      response_format: { type: 'json_object' },
    }

    const result = validateAndSanitizeAIPayload(payload)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.payload.response_format).toEqual({ type: 'json_object' })
    }
  })

  it('accepts V4 Pro thinking controls', () => {
    const payload = {
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'hello' }],
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    }

    const result = validateAndSanitizeAIPayload(payload)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.payload.thinking).toEqual({ type: 'enabled' })
      expect(result.payload.reasoning_effort).toBe('max')
    }
  })

  it('accepts the full assistant tool set used in chat mode', () => {
    const payload = {
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'Update the current note' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'edit_note_content',
            description: 'Edit note content by replacing one exact text segment with another.',
            parameters: {
              type: 'object',
              properties: {
                findText: { type: 'string' },
                replaceWith: { type: 'string' },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'replace_note_content',
            description: 'Replace the entire content of the current note.',
            parameters: {
              type: 'object',
              properties: {
                content: { type: 'string' },
              },
            },
          },
        },
      ],
    }

    const result = validateAndSanitizeAIPayload(payload)
    expect(result.valid).toBe(true)
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

  it('uses the V4 Pro token budget when tool calling is enabled', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: '',
                reasoning_content: 'Need note inventory before answering.',
                tool_calls: [{
                  id: 'tool-1',
                  type: 'function',
                  function: {
                    name: 'list_notes',
                    arguments: '{}',
                  },
                }],
              },
            }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )

    const result = await chat(
      'Create a mindmap from this note',
      {
        currentNote: {
          id: 'current',
          title: 'Current Note',
          content: 'current note text',
          type: 'rich-text',
        },
        allNotes: [{ id: 'current', title: 'Current Note' }],
      },
      [],
      undefined,
      async () => '[]',
      'deepseek-v4-pro',
    )

    expect(result).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const firstRequest = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
    expect(firstRequest.model).toBe('deepseek-v4-pro')
    expect(firstRequest.max_tokens).toBe(16384)
    expect(firstRequest.thinking).toEqual({ type: 'enabled' })
    expect(firstRequest.reasoning_effort).toBe('max')
    expect(firstRequest.tool_choice).toBe('auto')

    const secondRequest = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))
    expect(secondRequest.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'assistant',
        reasoning_content: 'Need note inventory before answering.',
        tool_calls: expect.arrayContaining([
          expect.objectContaining({
            id: 'tool-1',
          }),
        ]),
      }),
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'tool-1',
        content: '[]',
      }),
    ]))
  })
})
