/**
 * Shared AI helpers for the Chat view.
 *
 * Web builds talk to the DeepSeek proxy and desktop builds use the Tauri
 * command. These helpers resolve the proxy endpoint, authenticate web calls
 * and convert between note HTML and plain text.
 */

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function getWebAIEndpoint(path: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_AI_API_BASE_URL || '').trim()
  if (!baseUrl) {
    return path
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

export async function getWebAuthHeader(): Promise<Record<string, string>> {
  try {
    const { supabase } = await import('./supabase')
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` }
    }
  } catch {
    // Auth-less requests are handled by server auth checks.
  }

  return {}
}

export function stripHtmlForAI(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Convert plain text to basic HTML for note content. */
export function textToHtml(text: string): string {
  return text
    .split('\n\n')
    .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('')
}
