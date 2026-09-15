import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AIError,
  generateMindmapOutline,
  getAIRateLimitStatus,
  isAIAbortError,
  sendAIRequest,
  suggestEvents,
  suggestMindmapNodes,
  suggestTasks,
  summarizeNote,
  editText,
} from '@/lib/ai'

describe('AI transport reliability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries transient server failures and succeeds', async () => {
    const first = new Response(JSON.stringify({ error: { message: 'upstream down' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
    const second = new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Recovered response' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)

    const content = await sendAIRequest([{ role: 'user', content: 'Hello' }], { retryCount: 1 })

    expect(content).toBe('Recovered response')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns typed unauthorized error for auth failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(sendAIRequest([{ role: 'user', content: 'Hello' }], { retryCount: 0 })).rejects.toMatchObject({
      name: 'AIError',
      code: 'unauthorized',
      retryable: false,
    })
  })

  it('detects abort errors', () => {
    const err = new AIError('Response canceled.', 'aborted')
    expect(isAIAbortError(err)).toBe(true)
    expect(isAIAbortError(new Error('other'))).toBe(false)
  })

  it('captures quota headers from successful responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': '40',
            'X-RateLimit-Remaining': '37',
            'X-RateLimit-Reset': '9999999999',
            'X-RateLimit-Window-Ms': '60000',
          },
        },
      ),
    )

    await sendAIRequest([{ role: 'user', content: 'hello' }], { retryCount: 0 })

    expect(getAIRateLimitStatus()).toMatchObject({
      limit: 40,
      remaining: 37,
      resetAtEpochSeconds: 9999999999,
      windowMs: 60000,
    })
  })

  it('always calls DeepSeek V4.1 Flash with thinking enabled', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await sendAIRequest([{ role: 'user', content: 'Think this through' }], { retryCount: 0 })

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
    expect(requestBody.model).toBe('deepseek-flash')
    expect(requestBody.thinking).toEqual({ type: 'enabled' })
    expect(requestBody.reasoning_effort).toBe('high')
    expect(requestBody.max_tokens).toBe(16384)
    expect(requestBody.temperature).toBeUndefined()
  })

  it('uses the fixed DeepSeek Flash model for helper-based AI actions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: '{"summary":"ok","keyPoints":[]}' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: 'edited' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: '[{"title":"Task","priority":"medium"}]' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: '[{"title":"Event","duration":60}]' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: '[{"nodeText":"Idea"}]' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: '{"rootText":"Root","rootDescription":"","children":[]}' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    await summarizeNote('note body', 'Note')
    await editText('original', 'improve')
    await suggestTasks({ currentNote: { id: '1', title: 'Note', content: 'body', type: 'rich-text' } })
    await suggestEvents({ currentNote: { id: '1', title: 'Note', content: 'body', type: 'rich-text' } })
    await suggestMindmapNodes('Root', 'desc')
    await generateMindmapOutline('source text', 'Root')

    expect(fetchMock).toHaveBeenCalledTimes(6)

    for (const call of fetchMock.mock.calls) {
      const requestInit = call[1] as RequestInit
      const body = JSON.parse(String(requestInit.body))
      expect(body.model).toBe('deepseek-flash')
      expect(body.thinking).toEqual({ type: 'enabled' })
      expect(body.reasoning_effort).toBe('high')
    }

    const outlineRequest = JSON.parse(String((fetchMock.mock.calls[5]?.[1] as RequestInit).body))
    expect(outlineRequest.response_format).toEqual({ type: 'json_object' })
    expect(outlineRequest.max_tokens).toBe(16384)
  })
})
