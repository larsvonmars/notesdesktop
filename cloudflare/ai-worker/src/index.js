const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'

const ALLOWED_MODELS = new Set(['deepseek-chat', 'deepseek-reasoner'])
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant', 'tool'])

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

function getCorsHeaders(env, req) {
  const allowedOrigin = env.ALLOWED_ORIGIN || ''
  if (!allowedOrigin) return {}

  const origin = req.headers.get('Origin') || ''
  if (origin !== allowedOrigin) return {}

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    return false
  }

  return messages.every(message => {
    if (!isRecord(message)) return false
    const role = message.role
    const content = message.content
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) return false
    if (typeof content !== 'string') return false
    return content.length <= 120000
  })
}

function validateAndSanitizeAIPayload(input, options = {}) {
  if (!isRecord(input)) {
    return { valid: false, message: 'Invalid payload: expected JSON object.' }
  }

  const messages = input.messages
  if (!validateMessages(messages)) {
    return {
      valid: false,
      message: 'Invalid payload: messages must be a non-empty array of valid role/content items.',
    }
  }

  const payload = {
    messages,
    model: 'deepseek-chat',
  }

  const model = input.model
  if (typeof model === 'string') {
    if (!ALLOWED_MODELS.has(model)) {
      return { valid: false, message: 'Invalid payload: unsupported model.' }
    }
    payload.model = model
  }

  const temperature = input.temperature
  if (temperature !== undefined) {
    if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      return { valid: false, message: 'Invalid payload: temperature must be between 0 and 2.' }
    }
    payload.temperature = temperature
  }

  const maxTokens = input.max_tokens
  if (maxTokens !== undefined) {
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 16384) {
      return { valid: false, message: 'Invalid payload: max_tokens must be an integer between 1 and 16384.' }
    }
    payload.max_tokens = maxTokens
  }

  if (Array.isArray(input.tools)) {
    payload.tools = input.tools
  }

  if (input.tool_choice !== undefined) {
    payload.tool_choice = input.tool_choice
  }

  const stream = options.forceStream ? true : input.stream
  if (stream !== undefined) {
    if (typeof stream !== 'boolean') {
      return { valid: false, message: 'Invalid payload: stream must be a boolean.' }
    }
    payload.stream = stream
  }

  return { valid: true, payload }
}

async function fetchWithTimeout(input, init, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('UPSTREAM_TIMEOUT')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function rateLimitHeaders(rate) {
  return {
    'X-RateLimit-Limit': String(rate.limit),
    'X-RateLimit-Remaining': String(rate.remaining),
    'X-RateLimit-Reset': String(rate.resetAtEpochSeconds),
    'X-RateLimit-Window-Ms': String(rate.windowMs),
  }
}

async function getUserIdFromRequest(req, env) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice('Bearer '.length)
  if (!token) return null

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) return null
  const data = await response.json().catch(() => null)
  if (!data || typeof data.id !== 'string') return null
  return data.id
}

async function checkRateLimit(env, bucketKey) {
  const requests = parsePositiveInteger(env.AI_RATE_LIMIT_REQUESTS, 40)
  const windowMs = parsePositiveInteger(env.AI_RATE_LIMIT_WINDOW_MS, 60000)

  const id = env.RATE_LIMITER.idFromName(bucketKey)
  const stub = env.RATE_LIMITER.get(id)

  return stub.check({ requests, windowMs })
}

async function handleKeyStatus(req, env) {
  const cors = getCorsHeaders(env, req)
  const available = typeof env.DEEPSEEK_API_KEY === 'string' && env.DEEPSEEK_API_KEY.trim().length > 0

  return jsonResponse(
    {
      available,
      source: available ? 'server-env' : 'none',
    },
    200,
    cors,
  )
}

async function handleChat(req, env) {
  const cors = getCorsHeaders(env, req)
  const userId = await getUserIdFromRequest(req, env)
  if (!userId) {
    return jsonResponse({ error: { message: 'Unauthorized' } }, 401, cors)
  }

  const rate = await checkRateLimit(env, `ai:${userId}`)
  const headers = {
    ...rateLimitHeaders(rate),
    ...cors,
  }

  if (!rate.allowed) {
    return jsonResponse(
      { error: { message: 'Rate limit exceeded. Please retry later.' } },
      429,
      {
        ...headers,
        'Retry-After': String(rate.retryAfterSeconds),
      },
    )
  }

  const key = env.DEEPSEEK_API_KEY
  if (!key || !key.trim()) {
    return jsonResponse({ error: { message: 'AI API key not configured on server.' } }, 503, headers)
  }

  const payload = await req.json().catch(() => null)
  const validation = validateAndSanitizeAIPayload(payload)
  if (!validation.valid) {
    return jsonResponse({ error: { message: validation.message } }, 400, headers)
  }

  try {
    const timeoutMs = parsePositiveInteger(env.AI_UPSTREAM_TIMEOUT_MS, 30000)
    const upstream = await fetchWithTimeout(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(validation.payload),
    }, timeoutMs)

    const contentType = upstream.headers.get('content-type') || 'application/json'
    const bodyText = await upstream.text()
    return new Response(bodyText, {
      status: upstream.status,
      headers: {
        ...headers,
        'Content-Type': contentType,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UPSTREAM_TIMEOUT') {
      return jsonResponse({ error: { message: 'AI upstream timeout.' } }, 504, headers)
    }
    return jsonResponse({ error: { message: 'Unexpected AI proxy error.' } }, 500, headers)
  }
}

async function handleStream(req, env) {
  const cors = getCorsHeaders(env, req)
  const userId = await getUserIdFromRequest(req, env)
  if (!userId) {
    return jsonResponse({ error: { message: 'Unauthorized' } }, 401, cors)
  }

  const rate = await checkRateLimit(env, `ai:${userId}`)
  const headers = {
    ...rateLimitHeaders(rate),
    ...cors,
  }

  if (!rate.allowed) {
    return jsonResponse(
      { error: { message: 'Rate limit exceeded. Please retry later.' } },
      429,
      {
        ...headers,
        'Retry-After': String(rate.retryAfterSeconds),
      },
    )
  }

  const key = env.DEEPSEEK_API_KEY
  if (!key || !key.trim()) {
    return jsonResponse({ error: { message: 'AI API key not configured on server.' } }, 503, headers)
  }

  const payload = await req.json().catch(() => null)
  const validation = validateAndSanitizeAIPayload(payload, { forceStream: true })
  if (!validation.valid) {
    return jsonResponse({ error: { message: validation.message } }, 400, headers)
  }

  try {
    const timeoutMs = parsePositiveInteger(env.AI_UPSTREAM_TIMEOUT_MS, 25000)
    const upstream = await fetchWithTimeout(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(validation.payload),
    }, timeoutMs)

    if (!upstream.ok || !upstream.body) {
      const bodyText = await upstream.text()
      return new Response(bodyText, {
        status: upstream.status,
        headers: {
          ...headers,
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
        },
      })
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UPSTREAM_TIMEOUT') {
      return jsonResponse({ error: { message: 'AI upstream timeout.' } }, 504, headers)
    }
    return jsonResponse({ error: { message: 'Unexpected AI stream proxy error.' } }, 500, headers)
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const { pathname } = url

    if (pathname === '/') {
      return new Response('notesdesktop-ai worker is running. Use /api/ai/* endpoints.', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      })
    }

    if (!pathname.startsWith('/api/ai/')) {
      return new Response('Not Found', { status: 404 })
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(env, req) })
    }

    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    if (url.pathname.endsWith('/api/ai/chat')) {
      return handleChat(req, env)
    }

    if (url.pathname.endsWith('/api/ai/stream')) {
      return handleStream(req, env)
    }

    if (url.pathname.endsWith('/api/ai/key-status')) {
      return handleKeyStatus(req, env)
    }

    return new Response('Not Found', { status: 404 })
  },
}

export class RateLimiterDO {
  constructor(state) {
    this.state = state
  }

  async check(input) {
    const requests = Number(input?.requests) > 0 ? Number(input.requests) : 40
    const windowMs = Number(input?.windowMs) > 0 ? Number(input.windowMs) : 60000

    const now = Date.now()
    const existing = await this.state.storage.get('bucket')

    if (!existing || existing.resetAt <= now) {
      const next = {
        count: 1,
        resetAt: now + windowMs,
      }
      await this.state.storage.put('bucket', next, { expiration: Math.ceil(next.resetAt / 1000) + 60 })

      return {
        allowed: true,
        retryAfterSeconds: 0,
        limit: requests,
        remaining: Math.max(0, requests - next.count),
        resetAtEpochSeconds: Math.ceil(next.resetAt / 1000),
        windowMs,
      }
    }

    if (existing.count >= requests) {
      const retryAfterMs = Math.max(0, existing.resetAt - now)
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        limit: requests,
        remaining: 0,
        resetAtEpochSeconds: Math.ceil(existing.resetAt / 1000),
        windowMs,
      }
    }

    const next = {
      count: existing.count + 1,
      resetAt: existing.resetAt,
    }

    await this.state.storage.put('bucket', next, { expiration: Math.ceil(next.resetAt / 1000) + 60 })

    return {
      allowed: true,
      retryAfterSeconds: 0,
      limit: requests,
      remaining: Math.max(0, requests - next.count),
      resetAtEpochSeconds: Math.ceil(next.resetAt / 1000),
      windowMs,
    }
  }
}
