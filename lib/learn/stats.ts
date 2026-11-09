import { supabase } from '@/lib/supabase'
import type { LearnUserStatsRow } from '@/lib/database.types'
import { requireUserId } from './db'
import {
  calcLevel,
  calcXPToNextLevel,
  getUserLocalDate,
  localDayBounds,
} from './gamification'
import {
  BADGE_DEFINITIONS,
  type Badge,
  type BadgeId,
  type DailyProgress,
  type StudyMode,
  type StudySessionSummary,
  type UserStats,
} from './types'

export async function fetchStatsRow(
  userId: string
): Promise<LearnUserStatsRow> {
  const { data, error } = await supabase
    .from('learn_user_stats')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  if (data) return data

  const { data: inserted, error: insertError } = await supabase
    .from('learn_user_stats')
    .insert({ id: userId })
    .select()
    .single()

  if (insertError) throw insertError
  return inserted
}

export async function getUserStats(
  timezoneOffset = 0
): Promise<UserStats | null> {
  const userId = await requireUserId()

  const [statsRow, badgesResult, decksCountResult] = await Promise.all([
    fetchStatsRow(userId),
    supabase
      .from('learn_user_badges')
      .select('badge_id, earned_at')
      .eq('user_id', userId),
    supabase
      .from('learn_decks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ])

  if (badgesResult.error) throw badgesResult.error
  if (decksCountResult.error) throw decksCountResult.error

  const earnedMap = new Map<string, string>(
    (badgesResult.data ?? []).map((row) => [row.badge_id, row.earned_at])
  )

  const badges: Badge[] = BADGE_DEFINITIONS.map((definition) => ({
    ...definition,
    earnedAt: earnedMap.has(definition.id)
      ? new Date(earnedMap.get(definition.id)!)
      : undefined,
  }))

  const today = getUserLocalDate(timezoneOffset)
  const { start, end } = localDayBounds(today, timezoneOffset)
  const { data: todaySessions, error: sessionsError } = await supabase
    .from('learn_study_sessions')
    .select('cards_reviewed, correct_count')
    .eq('user_id', userId)
    .gte('completed_at', start)
    .lte('completed_at', end)

  if (sessionsError) throw sessionsError

  const dailyCardsReviewed = (todaySessions ?? []).reduce(
    (sum, row) => sum + (row.cards_reviewed ?? 0),
    0
  )
  const dailyGoal = statsRow.daily_goal ?? 20

  return {
    xp: statsRow.xp ?? 0,
    xpToNextLevel: calcXPToNextLevel(statsRow.xp ?? 0),
    level: calcLevel(statsRow.xp ?? 0),
    streak: statsRow.streak ?? 0,
    badges,
    totalCardsReviewed: statsRow.total_cards_reviewed ?? 0,
    totalDecks: decksCountResult.count ?? 0,
    totalSessions: statsRow.total_sessions ?? 0,
    totalCorrect: statsRow.total_correct ?? 0,
    dailyCardsReviewed,
    dailyGoalMet: dailyCardsReviewed >= dailyGoal,
    dailyGoal,
    streakReminderEnabled: statsRow.streak_reminder_enabled ?? true,
  }
}

export async function updateStudyPreferences(input: {
  dailyGoal?: number
  streakReminder?: boolean
}): Promise<void> {
  const userId = await requireUserId()
  const payload: Record<string, unknown> = {}
  if (input.dailyGoal !== undefined) payload.daily_goal = input.dailyGoal
  if (input.streakReminder !== undefined)
    payload.streak_reminder_enabled = input.streakReminder
  if (Object.keys(payload).length === 0) return

  await fetchStatsRow(userId)
  const { error } = await supabase
    .from('learn_user_stats')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) throw error
}

export async function getUserBadges(): Promise<Badge[]> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('learn_user_badges')
    .select('badge_id, earned_at')
    .eq('user_id', userId)

  if (error) throw error

  const earnedMap = new Map<string, string>(
    (data ?? []).map((row) => [row.badge_id, row.earned_at])
  )
  return BADGE_DEFINITIONS.map((definition) => ({
    ...definition,
    earnedAt: earnedMap.has(definition.id)
      ? new Date(earnedMap.get(definition.id)!)
      : undefined,
  }))
}

export async function getDailyProgress(
  timezoneOffset = 0
): Promise<DailyProgress> {
  const userId = await requireUserId()
  const today = getUserLocalDate(timezoneOffset)
  const { start, end } = localDayBounds(today, timezoneOffset)

  const [sessionsResult, statsResult] = await Promise.all([
    supabase
      .from('learn_study_sessions')
      .select('cards_reviewed, correct_count')
      .eq('user_id', userId)
      .gte('completed_at', start)
      .lte('completed_at', end),
    supabase
      .from('learn_user_stats')
      .select('daily_goal')
      .eq('id', userId)
      .maybeSingle(),
  ])

  if (sessionsResult.error) throw sessionsResult.error

  const cardsReviewed = (sessionsResult.data ?? []).reduce(
    (sum, row) => sum + (row.cards_reviewed ?? 0),
    0
  )
  const correct = (sessionsResult.data ?? []).reduce(
    (sum, row) => sum + (row.correct_count ?? 0),
    0
  )
  const goal = statsResult.data?.daily_goal ?? 20

  return {
    cardsReviewed,
    correct,
    goal,
    goalMet: cardsReviewed >= goal,
    goalProgress:
      goal > 0 ? Math.min(100, Math.round((cardsReviewed / goal) * 100)) : 0,
  }
}

export async function getSessionHistory(
  limit = 10,
  offset = 0
): Promise<StudySessionSummary[]> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('learn_study_sessions')
    .select(
      'id, deck_id, cards_reviewed, correct_count, xp_earned, mode, completed_at'
    )
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error || !data) return []

  const deckIds = [
    ...new Set(
      data
        .map((session) => session.deck_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const { data: decks } =
    deckIds.length > 0
      ? await supabase.from('learn_decks').select('id, title').in('id', deckIds)
      : { data: [] as Array<{ id: string; title: string }> }

  const deckMap = new Map((decks ?? []).map((deck) => [deck.id, deck.title]))

  return data.map((session) => ({
    id: session.id,
    deckId: session.deck_id ?? '',
    deckTitle: session.deck_id
      ? (deckMap.get(session.deck_id) ?? 'Unknown deck')
      : 'Unknown deck',
    mode: (session.mode as StudyMode | null) ?? null,
    cardsReviewed: session.cards_reviewed,
    correct: session.correct_count ?? 0,
    xpEarned: session.xp_earned,
    completedAt: session.completed_at,
  }))
}

export interface Profile {
  username: string | null
  email: string | null
}

export async function getProfile(): Promise<Profile> {
  const userId = await requireUserId()
  const [{ data: profile, error }, { data: userData }] = await Promise.all([
    supabase
      .from('learn_profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle(),
    supabase.auth.getUser(),
  ])

  if (error) throw error

  return {
    username: profile?.username ?? null,
    email: userData.user?.email ?? null,
  }
}

export async function updateProfile(input: {
  username: string
}): Promise<void> {
  const userId = await requireUserId()
  const trimmed = input.username.trim()

  const { error } = await supabase
    .from('learn_profiles')
    .upsert({ id: userId, username: trimmed || null }, { onConflict: 'id' })

  if (error) throw error
}

/** Badge definitions that were earned, newest first. */
export function earnedBadges(badges: Badge[]): Badge[] {
  return badges
    .filter((badge) => badge.earnedAt)
    .sort((a, b) => (b.earnedAt?.getTime() ?? 0) - (a.earnedAt?.getTime() ?? 0))
}

export type { BadgeId }
