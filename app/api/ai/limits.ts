const DEFAULT_AI_PROXY_MAX_BODY_BYTES = 400000
const DEFAULT_AI_UPSTREAM_TIMEOUT_CHAT_MS = 30000
const DEFAULT_AI_UPSTREAM_TIMEOUT_STREAM_MS = 45000

export const AI_DEEPSEEK_CHAT_COMPLETIONS_URL = 'https://api.deepseek.com/chat/completions'
export const AI_INVALID_JSON_PAYLOAD_MESSAGE = 'Invalid payload: request body must be valid JSON.'

export const AI_PROXY_PAYLOAD_TOO_LARGE_MESSAGE =
  'AI request payload is too large. Reduce context and retry.'

export function getAIProxyMaxBodyBytes(): number {
  const raw = Number(process.env.AI_PROXY_MAX_BODY_BYTES || String(DEFAULT_AI_PROXY_MAX_BODY_BYTES))
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AI_PROXY_MAX_BODY_BYTES
}

export function getAIUpstreamTimeoutMs(mode: 'chat' | 'stream'): number {
  const fallback = mode === 'chat'
    ? DEFAULT_AI_UPSTREAM_TIMEOUT_CHAT_MS
    : DEFAULT_AI_UPSTREAM_TIMEOUT_STREAM_MS

  const raw = Number(process.env.AI_UPSTREAM_TIMEOUT_MS || String(fallback))
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}
