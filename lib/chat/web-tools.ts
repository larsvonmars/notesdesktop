import { getWebAIEndpoint, getWebAuthHeader, isTauriRuntime } from '@/lib/ai'

interface SearchResult {
  title?: string
  url?: string
  snippet?: string
  summary?: string
  content?: string
  site_name?: string | null
  date?: string | null
}

interface SearchResponse {
  results?: SearchResult[]
}

interface FetchResponse {
  title?: string
  content?: string
}

async function requestDeepSeekTool<T>(
  tool: 'search' | 'fetch',
  payload: Record<string, unknown>,
): Promise<T> {
  let response: Response
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<T>(tool === 'search' ? 'ai_search' : 'ai_fetch', { payload })
  }

  const authHeaders = await getWebAuthHeader()
  response = await fetch(getWebAIEndpoint(`/api/ai/${tool}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(payload),
  })

  const raw = await response.text()
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    if (!response.ok) throw new Error(raw.trim() || `DeepSeek ${tool} failed (${response.status}).`)
    throw new Error(`DeepSeek ${tool} returned invalid JSON.`)
  }

  if (!response.ok) {
    const message = (data as { error?: { message?: unknown } })?.error?.message
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message
        : `DeepSeek ${tool} failed (${response.status}).`,
    )
  }
  return data as T
}

export async function searchWeb(
  query: string,
  count = 5,
  originalQuestion?: string,
): Promise<string> {
  const response = await requestDeepSeekTool<SearchResponse>('search', {
    query,
    count,
    need_content: false,
    ...(originalQuestion ? { ori_question: originalQuestion.slice(0, 128) } : {}),
  })
  const results = Array.isArray(response.results) ? response.results : []
  if (results.length === 0) return `No web results found for "${query}".`

  return [
    `DeepSeek Search returned ${results.length} result${results.length === 1 ? '' : 's'} for "${query}":`,
    ...results.map((result, index) =>
      [
        `${index + 1}. ${result.title || 'Untitled page'}${result.site_name ? ` (${result.site_name})` : ''}`,
        result.url ? `URL: ${result.url}` : '',
        result.date ? `Date: ${result.date}` : '',
        result.summary || result.snippet || '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ].join('\n\n')
}

export async function fetchWebPage(url: string): Promise<string> {
  const response = await requestDeepSeekTool<FetchResponse>('fetch', { url })
  const content = typeof response.content === 'string' ? response.content.trim() : ''
  if (!content) throw new Error('DeepSeek Fetch returned no readable page content.')
  const title = typeof response.title === 'string' && response.title.trim()
    ? response.title.trim()
    : url
  const limitedContent = content.length > 10_000
    ? `${content.slice(0, 10_000)}\n\n[... page content truncated]`
    : content
  return `# ${title}\nURL: ${url}\n\n${limitedContent}`
}
