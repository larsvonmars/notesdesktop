import { NextResponse } from 'next/server'

function getServerApiKey(): string | null {
  const key = process.env.DEEPSEEK_API_KEY
  return key && key.trim().length > 0 ? key : null
}

export async function POST() {
  const available = !!getServerApiKey()
  return NextResponse.json({
    available,
    source: available ? 'server-env' : 'none',
  })
}
