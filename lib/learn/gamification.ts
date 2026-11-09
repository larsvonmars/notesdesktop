import type { BadgeId, StudyMode } from './types'

/** Base XP earned per card reviewed. */
export const XP_PER_CARD = 10

const MODE_MULTIPLIERS: Record<StudyMode, number> = {
  flashcard: 1.0,
  'multiple-choice': 1.2,
  'typed-answer': 1.5,
  'spaced-repetition': 1.3,
  test: 2.0,
  smart: 1.5,
  tutor: 0.8,
  'ai-learn': 0.8,
}

/** Cumulative XP needed to complete levels 1..50. */
const LEVEL_BOUNDARIES: number[] = (() => {
  const boundaries: number[] = []
  let total = 0
  for (let level = 1; level <= 50; level += 1) {
    let needed: number
    if (level <= 5) needed = 300
    else if (level <= 15) needed = 500
    else if (level <= 30) needed = 800
    else needed = 1200
    total += needed
    boundaries.push(total)
  }
  return boundaries
})()

const STREAK_BONUS_PER_DAY = 0.05
const MAX_STREAK_BONUS = 0.5
const PERFECT_BONUS = 0.25
const DAILY_GOAL_BONUS_XP = 50

export interface XPBreakdown {
  base: number
  modeMultiplier: number
  modeBonus: number
  streakMultiplier: number
  streakBonus: number
  perfectBonus: number
  dailyGoalBonus: number
}

export interface XPSessionResult {
  xpEarned: number
  breakdown: XPBreakdown
}

/**
 * Total XP for a study session:
 * baseXP × modeMultiplier + streak% + perfect% + flat daily-goal bonus.
 */
export function calcXPForSession(
  cardsReviewed: number,
  mode?: StudyMode,
  options?: {
    streak?: number
    perfect?: boolean
    dailyGoalMet?: boolean
  },
): XPSessionResult {
  const multiplier = mode ? MODE_MULTIPLIERS[mode] ?? 1.0 : 1.0
  const baseXP = cardsReviewed * XP_PER_CARD
  const modeBonus = Math.round(baseXP * (multiplier - 1))

  const streakMultiplier = options?.streak ? calcStreakMultiplier(options.streak) : 1.0
  const streakBonus = Math.round(baseXP * multiplier * (streakMultiplier - 1))

  const perfectBonus = options?.perfect ? Math.round(baseXP * multiplier * PERFECT_BONUS) : 0
  const dailyGoalBonus = options?.dailyGoalMet ? DAILY_GOAL_BONUS_XP : 0

  const xpEarned = Math.round(baseXP * multiplier) + streakBonus + perfectBonus + dailyGoalBonus

  return {
    xpEarned,
    breakdown: {
      base: baseXP,
      modeMultiplier: multiplier,
      modeBonus,
      streakMultiplier,
      streakBonus,
      perfectBonus,
      dailyGoalBonus,
    },
  }
}

/** Streak bonus multiplier (1.0–1.5, +5% per streak day). */
export function calcStreakMultiplier(streak: number): number {
  return 1 + Math.min(streak * STREAK_BONUS_PER_DAY, MAX_STREAK_BONUS)
}

export function calcLevel(xp: number): number {
  for (let i = 0; i < LEVEL_BOUNDARIES.length; i += 1) {
    if (xp < LEVEL_BOUNDARIES[i]) return i + 1
  }
  const last = LEVEL_BOUNDARIES[LEVEL_BOUNDARIES.length - 1]
  return LEVEL_BOUNDARIES.length + Math.floor((xp - last) / 1200) + 1
}

/** Total XP needed to reach the given level (level 1 starts at 0 XP). */
export function calcXPForLevel(level: number): number {
  if (level <= 1) return 0
  const index = level - 2
  if (index < LEVEL_BOUNDARIES.length) return LEVEL_BOUNDARIES[index]
  return LEVEL_BOUNDARIES[LEVEL_BOUNDARIES.length - 1] + (level - LEVEL_BOUNDARIES.length - 1) * 1200
}

/** Total cumulative XP required to reach the next level. */
export function calcXPToNextLevel(xp: number): number {
  const level = calcLevel(xp)
  return calcXPForLevel(level + 1)
}

/** XP earned inside the current level. */
export function calcXPInLevel(xp: number): number {
  const level = calcLevel(xp)
  return xp - calcXPForLevel(level)
}

/** XP span of the current level (used for progress bars). */
export function calcLevelSpan(level: number): number {
  return Math.max(1, calcXPForLevel(level + 1) - calcXPForLevel(level))
}

function toDateStr(value: string | Date | null): string | null {
  if (!value) return null
  const raw = typeof value === 'string' ? value : value.toISOString()
  return raw.slice(0, 10)
}

/** The user's local calendar day as YYYY-MM-DD. */
export function getUserLocalDate(timezoneOffsetMinutes = 0): string {
  const localMs = Date.now() - timezoneOffsetMinutes * 60 * 1000
  return new Date(localMs).toISOString().slice(0, 10)
}

/** UTC instant for local midnight of `dateStr`, given the browser's timezone offset. */
export function localDayBounds(dateStr: string, timezoneOffsetMinutes = 0): { start: string; end: string } {
  const startMs = new Date(`${dateStr}T00:00:00Z`).getTime() + timezoneOffsetMinutes * 60 * 1000
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86_400_000 - 1).toISOString(),
  }
}

/**
 * New streak value.
 * Same day → unchanged, yesterday → +1, larger gap or first study → 1.
 */
export function calcStreak(
  lastStudiedAt: string | null,
  currentStreak: number,
  todayStr?: string,
): number {
  const today = todayStr ?? toDateStr(new Date().toISOString())!
  if (!lastStudiedAt) return 1

  const last = toDateStr(lastStudiedAt)
  if (!last) return 1

  const diffMs = new Date(`${today}T00:00:00Z`).getTime() - new Date(`${last}T00:00:00Z`).getTime()
  const diffDays = Math.round(diffMs / 86_400_000)

  if (diffDays === 0) return currentStreak
  if (diffDays === 1) return currentStreak + 1
  return 1
}

export interface BadgeCheckStats {
  xp: number
  level: number
  streak: number
  totalCardsReviewed: number
  totalDecks: number
  totalSessions: number
  perfectMCSessions?: number
  recentTestTimeSeconds?: number
}

/** Badge IDs that should be newly awarded for the given stats. */
export function checkBadgeUnlocks(stats: BadgeCheckStats, alreadyEarned: Set<BadgeId>): BadgeId[] {
  const unlocked: BadgeId[] = []

  const maybe = (id: BadgeId, condition: boolean) => {
    if (condition && !alreadyEarned.has(id)) unlocked.push(id)
  }

  maybe('first-deck', stats.totalDecks >= 1)
  maybe('collector-5', stats.totalDecks >= 5)
  maybe('collector-10', stats.totalDecks >= 10)

  maybe('streak-3', stats.streak >= 3)
  maybe('streak-7', stats.streak >= 7)
  maybe('streak-14', stats.streak >= 14)
  maybe('streak-30', stats.streak >= 30)

  maybe('level-5', stats.level >= 5)
  maybe('level-10', stats.level >= 10)
  maybe('level-25', stats.level >= 25)

  maybe('century', stats.totalCardsReviewed >= 100)
  maybe('millennium', stats.totalCardsReviewed >= 1000)
  maybe('marathon', stats.totalCardsReviewed >= 5000)

  maybe('quiz-master', (stats.perfectMCSessions ?? 0) >= 10)
  maybe('speed-demon', (stats.recentTestTimeSeconds ?? Infinity) < 30)

  return unlocked
}
