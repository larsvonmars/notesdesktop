import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetRateLimitStateForTests } from '@/app/api/ai/rate-limit'

const getUserMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: getUserMock } }),
}))

describe('DeepSeek Search and Fetch proxy routes', () => {
  const originalApiKey = process.env.DEEPSEEK_API_KEY
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalSupabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    __resetRateLimitStateForTests()
    getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    process.env.DEEPSEEK_API_KEY = 'test-key'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  })

  afterEach(() => {
    process.env.DEEPSEEK_API_KEY = originalApiKey
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnon
  })

  it('proxies only the supported Search API fields to DeepSeek', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const { POST } = await import('@/app/api/ai/search/route')
    const response = await POST(
      new Request('http://localhost/api/ai/search', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-token' },
        body: JSON.stringify({
          query: 'DeepSeek vision',
          count: 3,
          need_content: true,
          ignored: 'must not be forwarded',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/tools/search',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        body: JSON.stringify({ query: 'DeepSeek vision', count: 3, need_content: true }),
      }),
    )
  })

  it('rejects credential-bearing Fetch URLs without contacting DeepSeek', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const { POST } = await import('@/app/api/ai/fetch/route')
    const response = await POST(
      new Request('http://localhost/api/ai/fetch', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-token' },
        body: JSON.stringify({ url: 'https://user:password@example.com/private' }),
      }),
    )

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('proxies a validated URL to the official Fetch API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ title: 'Page', content: '# Page' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const { POST } = await import('@/app/api/ai/fetch/route')
    const response = await POST(
      new Request('http://localhost/api/ai/fetch', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-token' },
        body: JSON.stringify({ url: 'https://example.com/article' }),
      }),
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/tools/fetch',
      expect.objectContaining({
        body: JSON.stringify({ url: 'https://example.com/article' }),
      }),
    )
  })
})
