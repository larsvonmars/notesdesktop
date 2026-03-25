import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getUserMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock,
    },
  }),
}))

describe('AI proxy routes', () => {
  const originalApiKey = process.env.DEEPSEEK_API_KEY
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalSupabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const originalRateLimitRequests = process.env.AI_RATE_LIMIT_REQUESTS
  const originalRateLimitWindowMs = process.env.AI_RATE_LIMIT_WINDOW_MS
  const originalProxyMaxBodyBytes = process.env.AI_PROXY_MAX_BODY_BYTES

  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    getUserMock.mockReset()
    process.env.DEEPSEEK_API_KEY = 'test-key'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    process.env.AI_RATE_LIMIT_REQUESTS = '50'
    process.env.AI_RATE_LIMIT_WINDOW_MS = '60000'
    process.env.AI_PROXY_MAX_BODY_BYTES = '400000'
  })

  afterEach(() => {
    process.env.DEEPSEEK_API_KEY = originalApiKey
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnon
    process.env.AI_RATE_LIMIT_REQUESTS = originalRateLimitRequests
    process.env.AI_RATE_LIMIT_WINDOW_MS = originalRateLimitWindowMs
    process.env.AI_PROXY_MAX_BODY_BYTES = originalProxyMaxBodyBytes
  })

  it('returns 401 when chat request has no auth header', async () => {
    const { POST } = await import('@/app/api/ai/chat/route')
    const req = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 503 when server key is missing', async () => {
    process.env.DEEPSEEK_API_KEY = ''
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    const { POST } = await import('@/app/api/ai/chat/route')
    const req = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [] }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(503)
  })

  it('returns 400 for invalid chat payload shape', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    const { POST } = await import('@/app/api/ai/chat/route')
    const req = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'invalid-role', content: 'Hi' }] }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('proxies chat request to DeepSeek on success', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    const upstream = new Response(
      JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream)

    const { POST } = await import('@/app/api/ai/chat/route')
    const req = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'Hi' }] }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit')).toBeTruthy()
    expect(res.headers.get('X-RateLimit-Remaining')).toBeTruthy()
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.deepseek.com/chat/completions')
  })

  it('forces stream=true in stream proxy', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    const upstream = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream)

    const { POST } = await import('@/app/api/ai/stream/route')
    const req = new Request('http://localhost/api/ai/stream', {
      method: 'POST',
      body: JSON.stringify({ model: 'deepseek-chat', stream: false, messages: [{ role: 'user', content: 'Hi' }] }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = requestInit?.body as string
    expect(body).toContain('"stream":true')
  })

  it('returns 400 when stream payload is missing messages', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    const { POST } = await import('@/app/api/ai/stream/route')
    const req = new Request('http://localhost/api/ai/stream', {
      method: 'POST',
      body: JSON.stringify({ model: 'deepseek-chat' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 429 when per-user rate limit is exceeded', async () => {
    process.env.AI_RATE_LIMIT_REQUESTS = '1'
    process.env.AI_RATE_LIMIT_WINDOW_MS = '60000'
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-limit' } }, error: null })

    const upstream = new Response(
      JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream)

    const { POST } = await import('@/app/api/ai/chat/route')
    const makeReq = () => new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'Hi' }] }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    })

    const first = await POST(makeReq())
    const second = await POST(makeReq())

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect(second.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(second.headers.get('Retry-After')).toBeTruthy()
  })

  it('returns 504 when upstream fetch times out', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-timeout' } }, error: null })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('aborted', 'AbortError'))

    const { POST } = await import('@/app/api/ai/chat/route')
    const req = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'Hi' }] }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(504)
  })

  it('returns 413 for oversized chat payload and skips upstream call', async () => {
    process.env.AI_PROXY_MAX_BODY_BYTES = '300'
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-too-large-chat' } }, error: null })
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const { POST } = await import('@/app/api/ai/chat/route')
    const req = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'x'.repeat(2000) }],
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 413 for oversized stream payload and skips upstream call', async () => {
    process.env.AI_PROXY_MAX_BODY_BYTES = '300'
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-too-large-stream' } }, error: null })
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const { POST } = await import('@/app/api/ai/stream/route')
    const req = new Request('http://localhost/api/ai/stream', {
      method: 'POST',
      body: JSON.stringify({
        model: 'deepseek-chat',
        stream: true,
        messages: [{ role: 'user', content: 'x'.repeat(2000) }],
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
