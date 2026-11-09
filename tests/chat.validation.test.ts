import { describe, expect, it, vi } from 'vitest'

import { validateAndSanitizeAIPayload } from '@/app/api/ai/validation'
import { BASE_CHAT_TOOLS, toToolDefinitions } from '@/lib/chat/tools'

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

function tool(name: string) {
  return {
    type: 'function',
    function: {
      name,
      description: `Calls ${name}`,
      parameters: { type: 'object', properties: {} },
    },
  }
}

describe('AI validation for the chat view', () => {
  it('accepts the chat tool set', () => {
    const payload = {
      messages: [{ role: 'user', content: 'What is on my plate?' }],
      tools: [
        'get_current_date',
        'list_notes',
        'search_notes',
        'read_note',
        'create_note',
        'append_to_note',
        'list_folders',
        'list_projects',
        'list_tasks',
        'create_task',
        'complete_task',
        'get_task_stats',
        'delegate_subtask',
      ].map(tool),
    }

    const result = validateAndSanitizeAIPayload(payload)
    expect(result.valid).toBe(true)
  })

  it('accepts the real tool definitions registered by the chat view', () => {
    const result = validateAndSanitizeAIPayload({
      messages: [{ role: 'user', content: 'What is on my plate?' }],
      tools: toToolDefinitions(BASE_CHAT_TOOLS),
      tool_choice: 'auto',
    })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect((result.payload.tools as unknown[]).length).toBe(
        Object.keys(BASE_CHAT_TOOLS).length
      )
    }
  })

  it('still rejects tools outside the whitelist', () => {
    const result = validateAndSanitizeAIPayload({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [tool('delete_everything')],
    })

    expect(result.valid).toBe(false)
  })

  it('rejects more tools than the chat can register', () => {
    const names = Array.from({ length: 49 }, () => 'list_notes')
    const result = validateAndSanitizeAIPayload({
      messages: [{ role: 'user', content: 'hi' }],
      tools: names.map(tool),
    })

    expect(result.valid).toBe(false)
  })

  it('accepts multipart image content for a user message', () => {
    const result = validateAndSanitizeAIPayload({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this picture?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          ],
        },
      ],
    })

    expect(result.valid).toBe(true)
  })

  it('rejects multipart content from assistant messages', () => {
    const result = validateAndSanitizeAIPayload({
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
        },
      ],
    })

    expect(result.valid).toBe(false)
  })

  it('rejects image parts that are neither data URLs nor https', () => {
    const result = validateAndSanitizeAIPayload({
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'http://insecure.example/x.png' } }],
        },
      ],
    })

    expect(result.valid).toBe(false)
  })

  it('rejects unsupported content part types', () => {
    const result = validateAndSanitizeAIPayload({
      messages: [
        {
          role: 'user',
          content: [{ type: 'audio', audio: { url: 'https://example.com/x.mp3' } }],
        },
      ],
    })

    expect(result.valid).toBe(false)
  })
})
