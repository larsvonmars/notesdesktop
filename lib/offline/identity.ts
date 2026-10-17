import { supabase } from '../supabase'

/**
 * Resolve the signed-in user without requiring a network round-trip.
 * `getSession` reads the persisted auth state, which keeps note creation and
 * updates working while offline.
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.user?.id) return data.session.user.id
  } catch {
    // Offline or auth storage unavailable; fall back to getUser below.
  }
  try {
    const { data } = await supabase.auth.getUser()
    return data?.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Generate a UUID v4 for offline-created rows. The generated id is later sent
 * to Postgres as the primary key, so it must be a valid UUID even in WebViews
 * where `crypto.randomUUID` is unavailable.
 */
export function createOfflineId(_prefix = 'local'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  // RFC 4122 version 4 variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}
