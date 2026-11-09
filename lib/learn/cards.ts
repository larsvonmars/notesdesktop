import { supabase } from '@/lib/supabase'
import { mapCard, requireUserId } from './db'
import type { Card } from './types'

/** Strip PostgREST filter delimiters so user input cannot break the `or` filter. */
function sanitizeSearchTerm(query: string): string {
  return query.replace(/[,()%_\\]/g, ' ').trim().slice(0, 120)
}

export async function getCardsByDeck(deckId: string): Promise<Card[]> {
  const { data, error } = await supabase
    .from('learn_cards')
    .select('*')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapCard)
}

export async function createCard(input: { deckId: string; front: string; back: string }): Promise<Card> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('learn_cards')
    .insert({
      deck_id: input.deckId,
      user_id: userId,
      front: input.front,
      back: input.back,
    })
    .select()
    .single()

  if (error) throw error
  return mapCard(data)
}

/** Insert several cards in one round-trip (used by bulk import and AI). */
export async function createCards(
  deckId: string,
  cards: Array<{ front: string; back: string }>,
): Promise<Card[]> {
  if (cards.length === 0) return []
  const userId = await requireUserId()

  const { data, error } = await supabase
    .from('learn_cards')
    .insert(
      cards.map((card) => ({
        deck_id: deckId,
        user_id: userId,
        front: card.front,
        back: card.back,
      })),
    )
    .select()

  if (error) throw error
  return (data ?? []).map(mapCard)
}

export async function updateCard(
  id: string,
  input: {
    front?: string
    back?: string
    mastered?: boolean
    dueDate?: string | null
    easeFactor?: number
    intervalDays?: number
    correctCount?: number
    incorrectCount?: number
  },
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (input.front !== undefined) payload.front = input.front
  if (input.back !== undefined) payload.back = input.back
  if (input.mastered !== undefined) payload.mastered = input.mastered
  if (input.dueDate !== undefined) payload.due_date = input.dueDate
  if (input.easeFactor !== undefined) payload.ease_factor = input.easeFactor
  if (input.intervalDays !== undefined) payload.interval_days = input.intervalDays
  if (input.correctCount !== undefined) payload.correct_count = input.correctCount
  if (input.incorrectCount !== undefined) payload.incorrect_count = input.incorrectCount

  if (Object.keys(payload).length === 0) return

  const { error } = await supabase.from('learn_cards').update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from('learn_cards').delete().eq('id', id)
  if (error) throw error
}

export async function searchCards(query: string, deckId?: string): Promise<Card[]> {
  const userId = await requireUserId()
  const term = sanitizeSearchTerm(query)
  if (!term) return []

  let request = supabase
    .from('learn_cards')
    .select('*')
    .eq('user_id', userId)
    .or(`front.ilike.%${term}%,back.ilike.%${term}%`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (deckId) request = request.eq('deck_id', deckId)

  const { data, error } = await request
  if (error) throw error
  return (data ?? []).map(mapCard)
}
