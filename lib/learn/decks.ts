import { supabase } from '@/lib/supabase'
import type { LearnDeckWithCountsRow } from '@/lib/database.types'
import { mapDeckSummary, requireUserId } from './db'
import type { Deck } from './types'

/** Decks with card/mastery counts and last-studied timestamps. */
export async function getDecks(): Promise<Deck[]> {
  const userId = await requireUserId()

  const { data, error } = await supabase.rpc('get_decks_with_counts', {
    user_id_param: userId,
  })

  if (!error) {
    return ((data ?? []) as LearnDeckWithCountsRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      cardCount: Number(row.card_count ?? 0),
      masteredCount: Number(row.mastered_count ?? 0),
      color: row.color,
      lastStudied: row.last_studied ? new Date(row.last_studied) : undefined,
    }))
  }

  // Fallback for environments where the RPC is unavailable: aggregate in JS.
  const [decksResult, cardsResult, sessionsResult] = await Promise.all([
    supabase
      .from('learn_decks')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    supabase.from('learn_cards').select('deck_id, mastered').eq('user_id', userId),
    supabase
      .from('learn_study_sessions')
      .select('deck_id, completed_at')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false }),
  ])

  if (decksResult.error) throw decksResult.error
  if (cardsResult.error) throw cardsResult.error
  if (sessionsResult.error) throw sessionsResult.error

  const counts = new Map<string, { cards: number; mastered: number }>()
  for (const card of cardsResult.data ?? []) {
    if (!card.deck_id) continue
    const entry = counts.get(card.deck_id) ?? { cards: 0, mastered: 0 }
    entry.cards += 1
    if (card.mastered) entry.mastered += 1
    counts.set(card.deck_id, entry)
  }

  const lastStudied = new Map<string, string>()
  for (const session of sessionsResult.data ?? []) {
    if (session.deck_id && !lastStudied.has(session.deck_id)) {
      lastStudied.set(session.deck_id, session.completed_at)
    }
  }

  return (decksResult.data ?? []).map((row) => ({
    ...mapDeckSummary(row),
    cardCount: counts.get(row.id)?.cards ?? 0,
    masteredCount: counts.get(row.id)?.mastered ?? 0,
    lastStudied: lastStudied.get(row.id) ?? undefined,
  }))
}

export async function createDeck(input: {
  title: string
  description?: string
  color?: string
}): Promise<Deck> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('learn_decks')
    .insert({
      user_id: userId,
      title: input.title,
      description: input.description ?? null,
      color: input.color ?? 'bg-accent',
    })
    .select()
    .single()

  if (error) throw error

  return {
    id: data.id,
    title: data.title,
    description: data.description ?? undefined,
    cardCount: 0,
    masteredCount: 0,
    color: data.color,
  }
}

export async function updateDeck(
  id: string,
  input: { title?: string; description?: string | null; color?: string },
): Promise<void> {
  const { error } = await supabase
    .from('learn_decks')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

export async function deleteDeck(id: string): Promise<void> {
  const { error } = await supabase.from('learn_decks').delete().eq('id', id)
  if (error) throw error
}
