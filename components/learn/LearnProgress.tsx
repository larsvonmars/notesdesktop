'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Flame,
  Layers,
  RefreshCw,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLearning } from '@/lib/learn/context'
import { getDailyProgress, getSessionHistory } from '@/lib/learn/stats'
import type {
  BadgeId,
  DailyProgress,
  StudySessionSummary,
  UserStats,
} from '@/lib/learn/types'
import {
  BadgeGrid,
  DailyProgressCard,
  SessionHistoryList,
  StatTile,
  StudyHeatmap,
  XpBar,
} from './LearnPrimitives'

export function LearnProgress() {
  const { stats, decks, isLoadingStats, refreshStats, refreshDecks } =
    useLearning()
  const [sessions, setSessions] = useState<StudySessionSummary[]>([])
  const [daily, setDaily] = useState<DailyProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const [history, progress] = await Promise.all([
        getSessionHistory(200),
        getDailyProgress(new Date().getTimezoneOffset()),
      ])
      setSessions(history)
      setDaily(progress)
    } catch (error) {
      console.warn('Failed to load Learn progress:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const accuracy =
    stats && stats.totalCardsReviewed > 0
      ? Math.round((stats.totalCorrect / stats.totalCardsReviewed) * 100)
      : 0
  const lockedBadges = stats
    ? stats.badges.filter((badge) => !badge.earnedAt)
    : []
  const bestDay = useMemo(() => {
    const totals = new Map<string, number>()
    for (const session of sessions) {
      const day = session.completedAt.slice(0, 10)
      totals.set(day, (totals.get(day) ?? 0) + session.cardsReviewed)
    }
    return Math.max(0, ...totals.values())
  }, [sessions])

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await Promise.all([refreshStats(), refreshDecks(), load()])
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-6 animate-rise-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-foreground">
            Progress
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            XP, streaks, accuracy and study history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={refreshing}
            onClick={() => void handleRefresh()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {stats ? (
        <>
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <XpBar stats={stats} />
            <DailyProgressCard
              streak={stats.streak}
              progress={
                daily ?? {
                  cardsReviewed: stats.dailyCardsReviewed,
                  correct: 0,
                  goal: stats.dailyGoal,
                  goalMet: stats.dailyGoalMet,
                  goalProgress:
                    stats.dailyGoal > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (stats.dailyCardsReviewed / stats.dailyGoal) * 100
                          )
                        )
                      : 0,
                }
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={Zap}
              label="Level"
              value={stats.level}
              hint={`${stats.xp.toLocaleString()} XP total`}
              tone="accent"
            />
            <StatTile
              icon={Flame}
              label="Current streak"
              value={`${stats.streak}d`}
              hint={stats.streak > 0 ? 'Keep it going' : 'Study today to start'}
              tone="warning"
            />
            <StatTile
              icon={TrendingUp}
              label="Accuracy"
              value={`${accuracy}%`}
              hint={`${stats.totalCorrect} correct of ${stats.totalCardsReviewed}`}
              tone="success"
            />
            <StatTile
              icon={Layers}
              label="Sessions"
              value={stats.totalSessions}
              hint={`Best day: ${bestDay} cards`}
              tone="sky"
            />
          </div>

          <BadgeGrid badges={stats.badges} />

          {lockedBadges.length > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-surface-hover text-muted">
                  <Trophy size={16} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Badges to unlock
                  </p>
                  <p className="text-xs text-muted">
                    {lockedBadges.length} milestones remaining
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {lockedBadges.map((badge) => {
                  const progressText = describeBadgeProgress(badge.id, stats)
                  return (
                    <div
                      key={badge.id}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 opacity-70"
                    >
                      <span className="text-2xl grayscale">{badge.icon}</span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {badge.name}
                        </p>
                        <p className="line-clamp-2 text-[10px] leading-4 text-muted">
                          {badge.description}
                        </p>
                        {progressText && (
                          <p className="mt-0.5 text-[10px] font-bold text-accent">
                            {progressText}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <StudyHeatmap sessions={sessions} />

          {loading ? (
            <div className="glass-card px-6 py-10 text-center text-sm text-muted">
              Loading session history…
            </div>
          ) : (
            <SessionHistoryList sessions={sessions.slice(0, 12)} />
          )}
        </>
      ) : (
        <div className="glass-card px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-light text-accent">
            {isLoadingStats ? (
              <RefreshCw size={20} className="animate-spin" />
            ) : (
              <Target size={20} />
            )}
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {isLoadingStats ? 'Loading your stats…' : 'No progress yet'}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Finish your first study session to start building XP, streaks and
            badges.
          </p>
        </div>
      )}

      {decks.length === 0 && !isLoadingStats && (
        <div className="glass-card flex items-center gap-3 p-4 text-sm text-muted">
          <Zap size={16} className="text-accent" />
          Create a deck to start learning.
        </div>
      )}
    </div>
  )
}

function describeBadgeProgress(
  badgeId: BadgeId,
  stats: UserStats
): string | null {
  switch (badgeId) {
    case 'streak-3':
      return `${stats.streak}/3 days`
    case 'streak-7':
      return `${stats.streak}/7 days`
    case 'streak-14':
      return `${stats.streak}/14 days`
    case 'streak-30':
      return `${stats.streak}/30 days`
    case 'level-5':
      return `Level ${stats.level}/5`
    case 'level-10':
      return `Level ${stats.level}/10`
    case 'level-25':
      return `Level ${stats.level}/25`
    case 'century':
      return `${stats.totalCardsReviewed}/100 cards`
    case 'millennium':
      return `${stats.totalCardsReviewed}/1,000 cards`
    case 'marathon':
      return `${stats.totalCardsReviewed}/5,000 cards`
    case 'collector-5':
      return `${stats.totalDecks}/5 decks`
    case 'collector-10':
      return `${stats.totalDecks}/10 decks`
    case 'quiz-master':
      return '10 perfect quiz sessions'
    case 'speed-demon':
      return 'Finish a test under 30s'
    case 'first-deck':
      return `${stats.totalDecks}/1 deck`
    default:
      return null
  }
}
