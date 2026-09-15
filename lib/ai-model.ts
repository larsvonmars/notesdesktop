/**
 * Single source of truth for the AI model used across the app.
 *
 * DeepSeek V4.1 Flash is served under the `deepseek-flash` model name. It is the
 * only model the app uses: it is the newest Flash generation, supports vision,
 * and always runs with thinking mode enabled. The legacy `deepseek-v4-flash`
 * name has been retired by the provider and is intentionally not used anymore.
 *
 * Changing the model or its thinking behaviour should only ever happen here.
 * The server-side validators (Next API routes, Cloudflare worker, Tauri command)
 * pin the same values so clients cannot override them.
 */

export const AI_MODEL = 'deepseek-flash'

export const AI_MODEL_LABEL = 'DeepSeek V4.1 Flash'

export const AI_MODEL_SHORT_LABEL = 'V4.1 Flash'

/** Thinking mode is always on — see https://api-docs.deepseek.com/guides/thinking_mode */
export const AI_THINKING = { type: 'enabled' } as const

/** `high` is DeepSeek's default effort level for thinking mode. */
export const AI_REASONING_EFFORT = 'high'
