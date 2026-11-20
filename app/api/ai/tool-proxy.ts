import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkRateLimit } from './rate-limit'
import { fetchWithTimeout } from './upstream'

type DeepSeekTool = 'search' | 'fetch'

function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  return createClient(url, anon)
}

async function requireUserFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const supabase = getServerSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase.auth.getUser(authHeader.slice('Bearer '.length))
  return error || !data.user ? null : data.user.id
}

function validateToolRequest(tool: DeepSeekTool, input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const body = input as Record<string, unknown>

  if (tool === 'search') {
    const query = typeof body.query === 'string' ? body.query.trim() : ''
    const count = body.count === undefined ? 5 : body.count
    const needContent = body.need_content === undefined ? false : body.need_content
    if (!query || [...query].length > 128) return null
    if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > 50) return null
    if (typeof needContent !== 'boolean') return null

    const payload: Record<string, unknown> = {
      query,
      count,
      need_content: needContent,
    }
    if (typeof body.ori_question === 'string' && body.ori_question.trim()) {
      const question = body.ori_question.trim()
      if ([...question].length > 128) return null
      payload.ori_question = question
    }
    return payload
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
  if (!rawUrl || [...rawUrl].length > 8192) return null
  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
  } catch {
    return null
  }
  return { url: rawUrl }
}

export async function handleDeepSeekToolRequest(req: Request, tool: DeepSeekTool) {
  const userId = await requireUserFromRequest(req)
  if (!userId) {
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 })
  }

  const rate = checkRateLimit(`ai:${userId}`)
  const rateHeaders = {
    'X-RateLimit-Limit': String(rate.limit),
    'X-RateLimit-Remaining': String(rate.remaining),
    'X-RateLimit-Reset': String(rate.resetAtEpochSeconds),
    'X-RateLimit-Window-Ms': String(rate.windowMs),
  }
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { message: 'Rate limit exceeded. Please retry later.' } },
      {
        status: 429,
        headers: { ...rateHeaders, 'Retry-After': String(rate.retryAfterSeconds) },
      },
    )
  }

  const key = process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) {
    return NextResponse.json(
      { error: { message: 'AI API key not configured on server.' } },
      { status: 503 },
    )
  }

  const rawBody = await req.text()
  if (rawBody.length > 16_384) {
    return NextResponse.json({ error: { message: 'AI tool request is too large.' } }, { status: 413 })
  }

  let input: unknown
  try {
    input = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: { message: 'Request body must be valid JSON.' } }, { status: 400 })
  }

  const payload = validateToolRequest(tool, input)
  if (!payload) {
    return NextResponse.json(
      {
        error: {
          message:
            tool === 'search'
              ? 'Invalid search request. Provide a query of 1–128 characters, count from 1–50, and a boolean need_content.'
              : 'Invalid fetch request. Provide a valid HTTP or HTTPS URL without credentials (maximum 8192 characters).',
        },
      },
      { status: 400, headers: rateHeaders },
    )
  }

  try {
    const response = await fetchWithTimeout(
      `https://api.deepseek.com/v1/tools/${tool}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
      },
      45_000,
    )
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        ...rateHeaders,
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UPSTREAM_TIMEOUT') {
      return NextResponse.json({ error: { message: 'AI upstream timeout.' } }, { status: 504 })
    }
    return NextResponse.json({ error: { message: 'Unexpected AI tool proxy error.' } }, { status: 500 })
  }
}
