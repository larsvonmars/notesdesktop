import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { validateAndSanitizeAIPayload } from '../validation'
import { checkRateLimit } from '../rate-limit'
import { fetchWithTimeout } from '../upstream'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'

function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return null
  }

  return createClient(url, anon)
}

const AI_UPSTREAM_TIMEOUT_MS = Number(process.env.AI_UPSTREAM_TIMEOUT_MS || '45000')

async function requireUserFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const accessToken = authHeader.slice('Bearer '.length)
  const supabase = getServerSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) {
    return null
  }

  return data.user.id
}

function getServerApiKey(): string | null {
  const key = process.env.DEEPSEEK_API_KEY
  return key && key.trim().length > 0 ? key : null
}

export async function POST(req: Request) {
  try {
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
          headers: {
            ...rateHeaders,
            'Retry-After': String(rate.retryAfterSeconds),
          },
        },
      )
    }

    const key = getServerApiKey()
    if (!key) {
      return NextResponse.json(
        { error: { message: 'AI API key not configured on server.' } },
        { status: 503 },
      )
    }

    const payload = await req.json()
    const validation = validateAndSanitizeAIPayload(payload, { forceStream: true })
    if (!validation.valid) {
      return NextResponse.json(
        { error: { message: validation.message } },
        { status: 400, headers: rateHeaders },
      )
    }

    const response = await fetchWithTimeout(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(validation.payload),
    }, AI_UPSTREAM_TIMEOUT_MS)

    if (!response.ok || !response.body) {
      const bodyText = await response.text()
      return new NextResponse(bodyText, {
        status: response.status,
        headers: {
          ...rateHeaders,
          'Content-Type': response.headers.get('content-type') || 'application/json',
        },
      })
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        ...rateHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UPSTREAM_TIMEOUT') {
      return NextResponse.json(
        { error: { message: 'AI upstream timeout.' } },
        { status: 504 },
      )
    }

    return NextResponse.json(
      { error: { message: 'Unexpected AI stream proxy error.' } },
      { status: 500 },
    )
  }
}
