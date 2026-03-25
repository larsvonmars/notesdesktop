import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  AI_DEEPSEEK_CHAT_COMPLETIONS_URL,
  AI_INVALID_JSON_PAYLOAD_MESSAGE,
  AI_PROXY_PAYLOAD_TOO_LARGE_MESSAGE,
  getAIProxyMaxBodyBytes,
  getAIUpstreamTimeoutMs,
} from '../limits'
import { validateAndSanitizeAIPayload } from '../validation'
import { checkRateLimit } from '../rate-limit'
import { fetchWithTimeout } from '../upstream'

function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return null
  }

  return createClient(url, anon)
}


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

    const rawBody = await req.text()
    if (rawBody.length > getAIProxyMaxBodyBytes()) {
      return NextResponse.json(
        { error: { message: AI_PROXY_PAYLOAD_TOO_LARGE_MESSAGE } },
        { status: 413, headers: rateHeaders },
      )
    }

    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json(
        { error: { message: AI_INVALID_JSON_PAYLOAD_MESSAGE } },
        { status: 400, headers: rateHeaders },
      )
    }

    const validation = validateAndSanitizeAIPayload(payload)
    if (!validation.valid) {
      return NextResponse.json(
        { error: { message: validation.message } },
        { status: 400, headers: rateHeaders },
      )
    }

    const upstreamBody = JSON.stringify(validation.payload)
    if (upstreamBody.length > getAIProxyMaxBodyBytes()) {
      return NextResponse.json(
        { error: { message: AI_PROXY_PAYLOAD_TOO_LARGE_MESSAGE } },
        { status: 413, headers: rateHeaders },
      )
    }

    const response = await fetchWithTimeout(AI_DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: upstreamBody,
    }, getAIUpstreamTimeoutMs('chat'))

    const contentType = response.headers.get('content-type') || 'application/json'
    const bodyText = await response.text()

    return new NextResponse(bodyText, {
      status: response.status,
      headers: {
        ...rateHeaders,
        'Content-Type': contentType,
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
      { error: { message: 'Unexpected AI proxy error.' } },
      { status: 500 },
    )
  }
}
