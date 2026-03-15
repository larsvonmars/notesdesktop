type RateLimitState = {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateLimitState>()

function getLimitConfig() {
  const requests = Number(process.env.AI_RATE_LIMIT_REQUESTS || '40')
  const windowMs = Number(process.env.AI_RATE_LIMIT_WINDOW_MS || '60000')

  return {
    requests: Number.isFinite(requests) && requests > 0 ? requests : 40,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60000,
  }
}

export function checkRateLimit(bucketKey: string): {
  allowed: boolean
  retryAfterSeconds: number
  limit: number
  remaining: number
  resetAtEpochSeconds: number
  windowMs: number
} {
  const now = Date.now()
  const { requests, windowMs } = getLimitConfig()
  const existing = buckets.get(bucketKey)

  if (!existing || existing.resetAt <= now) {
    const next = {
      count: 1,
      resetAt: now + windowMs,
    }
    buckets.set(bucketKey, next)
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

  existing.count += 1
  buckets.set(bucketKey, existing)
  return {
    allowed: true,
    retryAfterSeconds: 0,
    limit: requests,
    remaining: Math.max(0, requests - existing.count),
    resetAtEpochSeconds: Math.ceil(existing.resetAt / 1000),
    windowMs,
  }
}

export function __resetRateLimitStateForTests() {
  buckets.clear()
}
