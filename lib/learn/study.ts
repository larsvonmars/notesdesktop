import { supabase } from '@/lib/supabase'
import { requireUserId } from './db'
import { fetchStatsRow } from './stats'
import {
  calcLevel,
  calcStreak,
  calcXPForSession,
  checkBadgeUnlocks,
  getUserLocalDate,
  localDayBounds,
  type XPBreakdown,
} from './gamification'
import type { BadgeId, StudyMode } from './types'

export interface CompleteSessionInput {
  deckId: string
  cardsReviewed: number
  correct: number
  perfect?: boolean
  mode?: StudyMode
  sessionTimeSeconds?: number
  /** `new Date().getTimezoneOffset()` — minutes behind UTC. */
  timezoneOffset?: number
}

export interface CompleteSessionResult {
  xpEarned: number
  newBadges: BadgeId[]
  newStreak: number
  newLevel: number
  leveledUp: boolean
  dailyGoalMet: boolean
  streakMultiplier: number
  modeMultiplier: number
  xpBreakdown: XPBreakdown
}

/**
 * Award XP, update streak/level/totals, record the session and unlock badges.
 * Mirrors the gamification rules of the web Learn app.
 */
export async function completeSession(
  input: CompleteSessionInput
): Promise<CompleteSessionResult> {
  const userId = await requireUserId()
  const tzOffset = input.timezoneOffset ?? 0
  const userToday = getUserLocalDate(tzOffset)
  const { start, end } = localDayBounds(userToday, tzOffset)

  const currentStats = await fetchStatsRow(userId)

  const { data: todaySessions, error: todayError } = await supabase
    .from('learn_study_sessions')
    .select('cards_reviewed')
    .eq('user_id', userId)
    .gte('completed_at', start)
    .lte('completed_at', end)

  if (todayError) throw todayError

  const todayCardsBefore = (todaySessions ?? []).reduce(
    (sum, row) => sum + (row.cards_reviewed ?? 0),
    0
  )
  const dailyGoal = currentStats.daily_goal ?? 20
  const dailyGoalMet = todayCardsBefore + input.cardsReviewed >= dailyGoal

  const { xpEarned, breakdown } = calcXPForSession(
    input.cardsReviewed,
    input.mode,
    {
      streak: currentStats.streak,
      perfect: input.perfect,
      dailyGoalMet,
    }
  )

  const oldLevel = calcLevel(currentStats.xp)
  const newXP = currentStats.xp + xpEarned
  const newStreak = calcStreak(
    currentStats.last_studied_at,
    currentStats.streak,
    userToday
  )
  const newLevel = calcLevel(newXP)
  const newTotalCards = currentStats.total_cards_reviewed + input.cardsReviewed
  const newTotalCorrect = (currentStats.total_correct ?? 0) + input.correct
  const newTotalSessions = (currentStats.total_sessions ?? 0) + 1

  const [earnedResult, decksResult] = await Promise.all([
    supabase.from('learn_user_badges').select('badge_id').eq('user_id', userId),
    supabase
      .from('learn_decks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ])

  if (earnedResult.error) throw earnedResult.error
  if (decksResult.error) throw decksResult.error

  const alreadyEarned = new Set<BadgeId>(
    (earnedResult.data ?? []).map((row) => row.badge_id as BadgeId)
  )

  let perfectMCSessions = 0
  if (!alreadyEarned.has('quiz-master')) {
    const { data: mcSessions } = await supabase
      .from('learn_study_sessions')
      .select('cards_reviewed, correct_count')
      .eq('user_id', userId)
      .eq('mode', 'multiple-choice')

    perfectMCSessions = (mcSessions ?? []).filter(
      (session) =>
        session.cards_reviewed > 0 &&
        session.correct_count === session.cards_reviewed
    ).length
    if (input.mode === 'multiple-choice' && input.perfect)
      perfectMCSessions += 1
  }

  const newBadges = checkBadgeUnlocks(
    {
      xp: newXP,
      level: newLevel,
      streak: newStreak,
      totalCardsReviewed: newTotalCards,
      totalDecks: decksResult.count ?? 0,
      totalSessions: newTotalSessions,
      perfectMCSessions,
      recentTestTimeSeconds: input.sessionTimeSeconds,
    },
    alreadyEarned
  )

  if (input.perfect && !alreadyEarned.has('perfect-session')) {
    newBadges.push('perfect-session')
  }

  const [statsResult, sessionResult, badgesResult] = await Promise.all([
    supabase
      .from('learn_user_stats')
      .update({
        xp: newXP,
        level: newLevel,
        streak: newStreak,
        last_studied_at: userToday,
        total_cards_reviewed: newTotalCards,
        total_sessions: newTotalSessions,
        total_correct: newTotalCorrect,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId),
    supabase.from('learn_study_sessions').insert({
      user_id: userId,
      deck_id: input.deckId,
      cards_reviewed: input.cardsReviewed,
      correct_count: input.correct,
      xp_earned: xpEarned,
      mode: input.mode ?? null,
    }),
    newBadges.length > 0
      ? supabase
          .from('learn_user_badges')
          .insert(
            newBadges.map((badgeId) => ({ user_id: userId, badge_id: badgeId }))
          )
      : Promise.resolve({ error: null }),
  ])

  if (statsResult.error) throw statsResult.error
  if (sessionResult.error) throw sessionResult.error
  if (badgesResult && 'error' in badgesResult && badgesResult.error) {
    const code = (badgesResult.error as { code?: string }).code
    // A concurrent session may have unlocked the same badge; that is fine.
    if (code !== '23505') throw badgesResult.error
  }

  return {
    xpEarned,
    newBadges,
    newStreak,
    newLevel,
    leveledUp: newLevel > oldLevel,
    dailyGoalMet,
    streakMultiplier: breakdown.streakMultiplier,
    modeMultiplier: breakdown.modeMultiplier,
    xpBreakdown: breakdown,
  }
}

/**
 * SM-2 spaced-repetition rating.
 * quality: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy.
 */
export async function rateCard(
  cardId: string,
  quality: 0 | 1 | 2 | 3
): Promise<void> {
  const userId = await requireUserId()

  const { data: card, error: fetchError } = await supabase
    .from('learn_cards')
    .select('ease_factor, interval_days, correct_count, incorrect_count')
    .eq('id', cardId)
    .eq('user_id', userId)
    .single()

  if (fetchError) throw fetchError

  const currentEase = card.ease_factor ?? 2.5
  const currentInterval = card.interval_days ?? 1
  const correctCount = card.correct_count ?? 0
  const incorrectCount = card.incorrect_count ?? 0

  const q = [0, 2, 4, 5][quality]
  const newEase = Math.max(
    1.3,
    currentEase + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
  )

  let newInterval: number
  if (q < 2) newInterval = 1
  else if (q === 2)
    newInterval = Math.max(1, Math.ceil(currentInterval * newEase * 0.8))
  else if (q === 4)
    newInterval = Math.max(1, Math.ceil(currentInterval * newEase))
  else newInterval = Math.max(1, Math.ceil(currentInterval * newEase * 1.3))

  const due = new Date()
  due.setDate(due.getDate() + newInterval)

  const { error } = await supabase
    .from('learn_cards')
    .update({
      ease_factor: newEase,
      interval_days: newInterval,
      due_date: due.toISOString().slice(0, 10),
      correct_count: quality >= 2 ? correctCount + 1 : correctCount,
      incorrect_count: quality >= 2 ? incorrectCount : incorrectCount + 1,
    })
    .eq('id', cardId)
    .eq('user_id', userId)

  if (error) throw error
}
