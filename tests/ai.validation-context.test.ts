import { afterEach, describe, expect, it, vi } from 'vitest'

import { validateAndSanitizeAIPayload } from '@/app/api/ai/validation'

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
      model: 'deepseek-flash',
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
      model: 'deepseek-flash',
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
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: 'hello' }],
      response_format: { type: 'json_object' },
    }

    const result = validateAndSanitizeAIPayload(payload)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.payload.response_format).toEqual({ type: 'json_object' })
    }
  })

  it('pins the model and thinking settings server-side', () => {
    const payload = {
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'hello' }],
      thinking: { type: 'disabled' },
      reasoning_effort: 'max',
    }

    const result = validateAndSanitizeAIPayload(payload)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.payload.model).toBe('deepseek-flash')
      expect(result.payload.thinking).toEqual({ type: 'enabled' })
      expect(result.payload.reasoning_effort).toBe('high')
    }
  })

  it('accepts the note maintenance tools used in chat mode', () => {
    const payload = {
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: 'Update the current note' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'update_note',
            description: 'Update an existing note.',
            parameters: {
              type: 'object',
              properties: {
                noteId: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'create_mindmap_note',
            description: 'Create a mindmap note from a central idea.',
            parameters: {
              type: 'object',
              properties: {
                root: { type: 'string' },
                branches: { type: 'array' },
              },
            },
          },
        },
      ],
    }

    const result = validateAndSanitizeAIPayload(payload)
    expect(result.valid).toBe(true)
  })

})
