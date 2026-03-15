import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type DeleteAccountRequest = {
  confirmationText?: string
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(' ')
  if (!scheme || !token) return null
  if (scheme.toLowerCase() !== 'bearer') return null
  return token.trim() || null
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { error: 'Account deletion is not configured on this deployment.' },
      { status: 500 }
    )
  }

  const token = getBearerToken(request.headers.get('authorization'))
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 })
  }

  let body: DeleteAccountRequest = {}
  try {
    body = (await request.json()) as DeleteAccountRequest
  } catch {
    body = {}
  }

  if (body.confirmationText !== 'DELETE') {
    return NextResponse.json(
      { error: 'Type DELETE to confirm account deletion.' },
      { status: 400 }
    )
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: userData, error: userError } = await authClient.auth.getUser(token)
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 })
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id)
  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message || 'Failed to delete account.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
