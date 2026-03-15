import { afterEach, describe, expect, it, vi } from 'vitest'

import { AIError, getAIRateLimitStatus, isAIAbortError, sendAIRequest } from '@/lib/ai'

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
})
