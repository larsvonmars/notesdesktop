import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'

function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return null
  }

  return createClient(url, anon)
}

async function requireUserFromRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return false
  }

  const accessToken = authHeader.slice('Bearer '.length)
  const supabase = getServerSupabaseClient()
  if (!supabase) {
    return false
  }

  const { data, error } = await supabase.auth.getUser(accessToken)
  return !error && !!data.user
}

function getServerApiKey(): string | null {
  const key = process.env.DEEPSEEK_API_KEY
  return key && key.trim().length > 0 ? key : null
}

export async function POST(req: Request) {
  try {
    const authenticated = await requireUserFromRequest(req)
    if (!authenticated) {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 })
    }

    const key = getServerApiKey()
    if (!key) {
      return NextResponse.json(
        { error: { message: 'AI API key not configured on server.' } },
        { status: 503 },
      )
    }

    const payload = await req.json()
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: { message: 'Invalid payload.' } }, { status: 400 })
    }

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    })

    const contentType = response.headers.get('content-type') || 'application/json'
    const bodyText = await response.text()

    return new NextResponse(bodyText, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
      },
    })
  } catch {
    return NextResponse.json(
      { error: { message: 'Unexpected AI proxy error.' } },
      { status: 500 },
    )
  }
}
