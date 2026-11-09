import { describe, expect, it } from 'vitest'
import {
  calcLevel,
  calcStreak,
  calcStreakMultiplier,
  calcXPForLevel,
  calcXPForSession,
  calcXPInLevel,
  calcXPToNextLevel,
  checkBadgeUnlocks,
  getUserLocalDate,
  localDayBounds,
  XP_PER_CARD,
} from '@/lib/learn/gamification'

describe('Learn XP calculation', () => {
  it('awards base XP per card', () => {
    expect(XP_PER_CARD).toBe(10)
    expect(calcXPForSession(4).xpEarned).toBe(40)
    expect(calcXPForSession(0).xpEarned).toBe(0)
  })

  it('applies the study-mode multiplier', () => {
    const result = calcXPForSession(10, 'test')
    expect(result.breakdown.modeMultiplier).toBe(2)
    expect(result.xpEarned).toBe(200)
  })

  it('adds streak, perfect and daily-goal bonuses', () => {
    const result = calcXPForSession(10, 'flashcard', {
      streak: 10,
      perfect: true,
      dailyGoalMet: true,
    })
    // 100 base + 50% streak + 25% perfect + 50 goal
    expect(result.breakdown.streakBonus).toBe(50)
    expect(result.breakdown.perfectBonus).toBe(25)
    expect(result.breakdown.dailyGoalBonus).toBe(50)
    expect(result.xpEarned).toBe(225)
  })
})

describe('Learn level curve', () => {
  it('starts at level 1 and crosses boundaries at the right XP', () => {
    expect(calcLevel(0)).toBe(1)
    expect(calcLevel(299)).toBe(1)
    expect(calcLevel(300)).toBe(2)
    expect(calcXPForLevel(1)).toBe(0)
    expect(calcXPForLevel(2)).toBe(300)
    expect(calcXPToNextLevel(0)).toBe(300)
    expect(calcXPToNextLevel(300)).toBe(600)
    expect(calcXPInLevel(450)).toBe(150)
  })

  it('keeps increasing beyond level 50', () => {
    expect(calcLevel(100_000)).toBeGreaterThan(50)
  })
})

describe('Learn streaks', () => {
  it('starts at 1, keeps same-day value, increments yesterday and resets after a gap', () => {
    expect(calcStreak(null, 0, '2026-05-10')).toBe(1)
    expect(calcStreak('2026-05-10', 4, '2026-05-10')).toBe(4)
    expect(calcStreak('2026-05-09', 4, '2026-05-10')).toBe(5)
    expect(calcStreak('2026-05-01', 9, '2026-05-10')).toBe(1)
  })

  it('caps the streak multiplier at +50%', () => {
    expect(calcStreakMultiplier(0)).toBe(1)
    expect(calcStreakMultiplier(4)).toBeCloseTo(1.2)
    expect(calcStreakMultiplier(20)).toBe(1.5)
  })

  it('derives local dates from the timezone offset', () => {
    const date = getUserLocalDate(new Date().getTimezoneOffset())
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('builds correct UTC bounds for a local day', () => {
    // UTC+1 => local midnight is 23:00 UTC the previous day.
    const bounds = localDayBounds('2026-05-10', -60)
    expect(bounds.start).toBe('2026-05-09T23:00:00.000Z')
    expect(bounds.end).toBe('2026-05-10T22:59:59.999Z')
  })
})

describe('Learn badge unlocks', () => {
  it('unlocks milestone badges only once', () => {
    const unlocked = checkBadgeUnlocks(
      {
        xp: 0,
        level: 5,
        streak: 3,
        totalCardsReviewed: 100,
        totalDecks: 1,
        totalSessions: 1,
        recentTestTimeSeconds: 20,
      },
      new Set(),
    )
    expect(unlocked).toEqual(
      expect.arrayContaining(['first-deck', 'streak-3', 'level-5', 'century', 'speed-demon']),
    )

    const second = checkBadgeUnlocks(
      {
        xp: 0,
        level: 5,
        streak: 3,
        totalCardsReviewed: 100,
        totalDecks: 1,
        totalSessions: 1,
      },
      new Set(unlocked),
    )
    expect(second).toEqual([])
  })
})
