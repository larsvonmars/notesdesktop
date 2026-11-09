'use client'

import { useMemo } from 'react'
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flame,
  Pencil,
  Sparkles,
  Trash2,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { calcLevelSpan, calcXPInLevel } from '@/lib/learn/gamification'
import type {
  Badge,
  DailyProgress,
  Deck,
  StudySessionSummary,
  UserStats,
} from '@/lib/learn/types'
import { STUDY_MODE_LABELS } from '@/lib/learn/types'
import { cn, formatRelativeDate, resolveDeckColor } from '@/lib/learn/utils'

export function ProgressBar({
  value,
  max = 100,
  className = '',
  barClassName = 'bg-accent',
}: {
  value: number
  max?: number
  className?: string
  barClassName?: string
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-surface-sunken',
        className
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-soft',
          barClassName
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

export function XpBar({
  stats,
  compact = false,
}: {
  stats: UserStats
  compact?: boolean
}) {
  const level = stats.level
  const xpInLevel = calcXPInLevel(stats.xp)
  const span = calcLevelSpan(level)
  const remaining = Math.max(0, stats.xpToNextLevel - stats.xp)

  return (
    <div className={cn('glass-card', compact ? 'px-4 py-3' : 'p-5')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-gradient text-sm font-bold text-accent-foreground shadow-glow-sm">
            {level}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Level
            </p>
            <p className="truncate font-display text-sm font-semibold text-foreground">
              {remaining > 0
                ? `${remaining} XP to level ${level + 1}`
                : 'Max level reached'}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-light px-2.5 py-1 text-xs font-semibold tabular-nums text-accent">
          <Zap size={12} />
          {stats.xp.toLocaleString()} XP
        </span>
      </div>
      <ProgressBar value={xpInLevel} max={span} className="mt-3" />
      {!compact && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
          <span>
            {Math.round(xpInLevel)} / {Math.round(span)} XP this level
          </span>
          <span>
            {stats.totalCardsReviewed.toLocaleString()} cards reviewed
          </span>
        </div>
      )}
    </div>
  )
}

export function DailyProgressCard({
  progress,
  streak,
  className = '',
}: {
  progress: DailyProgress
  streak?: number
  className?: string
}) {
  return (
    <div className={cn('glass-card p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-warning-light text-warning">
            <Target size={16} />
          </span>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Daily goal
              {typeof streak === 'number' && streak > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-warning-light px-1.5 py-0.5 text-[9px] font-bold text-warning">
                  <Flame size={9} />
                  {streak}
                </span>
              )}
            </p>
            <p className="text-xs text-muted">
              {progress.cardsReviewed} of {progress.goal} cards
            </p>
          </div>
        </div>
        {progress.goalMet ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-light px-2.5 py-1 text-[11px] font-semibold text-success">
            <CheckCircle2 size={12} /> Goal met
          </span>
        ) : (
          <span className="text-xs font-semibold tabular-nums text-muted">
            {progress.goalProgress}%
          </span>
        )}
      </div>
      <ProgressBar
        value={progress.goalProgress}
        className="mt-3.5 h-2.5"
        barClassName={
          progress.goalMet
            ? 'bg-success'
            : 'bg-gradient-to-r from-accent to-success'
        }
      />
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted">
        <span>{progress.correct} correct today</span>
        <span>{Math.max(0, progress.goal - progress.cardsReviewed)} to go</span>
      </div>
    </div>
  )
}

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'accent',
}: {
  icon: LucideIcon
  label: string
  value: string | number
  hint?: string
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'sky'
}) {
  const tones = {
    accent: 'bg-accent-light text-accent',
    success: 'bg-success-light text-success',
    warning: 'bg-warning-light text-warning',
    danger: 'bg-danger-light text-danger',
    sky: 'bg-alpine-100 text-alpine-600 dark:bg-alpine-950 dark:text-alpine-300',
  } as const

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-xl',
            tones[tone]
          )}
        >
          <Icon size={14} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {label}
        </p>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  )
}

export function BadgeGrid({
  badges,
  limit,
}: {
  badges: Badge[]
  limit?: number
}) {
  const visible = limit ? badges.slice(0, limit) : badges
  const earnedCount = badges.filter((badge) => badge.earnedAt).length

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-warning-light text-warning">
            <Award size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Badges</p>
            <p className="text-xs text-muted">
              {earnedCount} of {badges.length} unlocked
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
        {visible.map((badge) => (
          <div
            key={badge.id}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors',
              badge.earnedAt
                ? 'border-accent/25 bg-accent-light/60'
                : 'border-border bg-surface-sunken opacity-55'
            )}
            title={`${badge.name} — ${badge.description}${badge.earnedAt ? ` · Earned ${badge.earnedAt.toLocaleDateString()}` : ''}`}
          >
            <span className={cn('text-xl', !badge.earnedAt && 'grayscale')}>
              {badge.icon}
            </span>
            <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-foreground">
              {badge.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StudyHeatmap({
  sessions,
}: {
  sessions: StudySessionSummary[]
}) {
  const { weeks, monthLabels, maxCount } = useMemo(() => {
    const days = 16 * 7
    const counts = new Map<string, number>()
    for (const session of sessions) {
      const day = session.completedAt.slice(0, 10)
      counts.set(day, (counts.get(day) ?? 0) + session.cardsReviewed)
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(today)
    start.setDate(start.getDate() - (days - 1))
    // Start on a Monday so the grid rows are weekdays.
    const startDay = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - startDay)

    const weeks: Array<Array<{ date: string; count: number }>> = []
    const labels: Array<{ index: number; label: string }> = []
    let cursor = new Date(start)
    let max = 0

    for (let week = 0; week < 17; week += 1) {
      const column: Array<{ date: string; count: number }> = []
      for (let day = 0; day < 7; day += 1) {
        const iso = cursor.toISOString().slice(0, 10)
        const count = counts.get(iso) ?? 0
        max = Math.max(max, count)
        column.push({ date: iso, count })
        cursor.setDate(cursor.getDate() + 1)
      }
      if (cursor.getDate() <= 7) {
        labels.push({
          index: week,
          label: cursor.toLocaleDateString(undefined, { month: 'short' }),
        })
      }
      weeks.push(column)
    }

    return { weeks, monthLabels: labels, maxCount: max }
  }, [sessions])

  const levelClass = (count: number) => {
    if (count === 0) return 'bg-surface-sunken'
    const ratio = maxCount > 0 ? count / maxCount : 1
    if (ratio <= 0.25) return 'bg-accent/25'
    if (ratio <= 0.5) return 'bg-accent/45'
    if (ratio <= 0.75) return 'bg-accent/70'
    return 'bg-accent'
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-success-light text-success">
            <CalendarDays size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Study activity
            </p>
            <p className="text-xs text-muted">
              Cards reviewed over the last 16 weeks
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-1 text-[10px] text-muted sm:flex">
          <span>Less</span>
          {[
            'bg-surface-sunken',
            'bg-accent/25',
            'bg-accent/45',
            'bg-accent/70',
            'bg-accent',
          ].map((tone) => (
            <span
              key={tone}
              className={cn('h-2.5 w-2.5 rounded-[3px]', tone)}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="inline-flex min-w-full flex-col gap-1">
          <div className="relative flex h-4 gap-[3px] pl-0 text-[9px] text-muted">
            {weeks.map((_, index) => {
              const label = monthLabels.find((entry) => entry.index === index)
              return (
                <span key={index} className="relative w-3 shrink-0">
                  {label && (
                    <span className="absolute left-0 top-0 whitespace-nowrap">
                      {label.label}
                    </span>
                  )}
                </span>
              )
            })}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-[3px]">
                {week.map((day) => (
                  <span
                    key={day.date}
                    title={`${day.date}: ${day.count} card${day.count === 1 ? '' : 's'}`}
                    className={cn(
                      'h-3 w-3 rounded-[3px]',
                      levelClass(day.count)
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SessionHistoryList({
  sessions,
}: {
  sessions: StudySessionSummary[]
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-alpine-100 text-alpine-600 dark:bg-alpine-950 dark:text-alpine-300">
            <Clock3 size={14} />
          </span>
          <h3 className="text-sm font-semibold text-foreground">
            Recent sessions
          </h3>
        </div>
        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
          {sessions.length}
        </span>
      </div>

      {sessions.length === 0 ? (
        <div className="px-6 pb-10 pt-4 text-center">
          <p className="text-sm font-medium text-foreground">No sessions yet</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Finish a study session and it will appear here.
          </p>
        </div>
      ) : (
        <ul className="px-2 pb-2">
          {sessions.map((session) => {
            const accuracy =
              session.cardsReviewed > 0
                ? Math.round((session.correct / session.cardsReviewed) * 100)
                : 0
            return (
              <li
                key={session.id}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent">
                  <BookOpen size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">
                    {session.deckTitle}
                  </p>
                  <p className="text-[11px] text-muted">
                    {session.mode
                      ? (STUDY_MODE_LABELS[
                          session.mode as keyof typeof STUDY_MODE_LABELS
                        ] ?? session.mode)
                      : 'Study'}{' '}
                    · {session.cardsReviewed} cards ·{' '}
                    {formatRelativeDate(session.completedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] font-semibold tabular-nums text-foreground">
                    +{session.xpEarned} XP
                  </p>
                  <p
                    className={cn(
                      'text-[11px] font-semibold tabular-nums',
                      accuracy >= 80
                        ? 'text-success'
                        : accuracy >= 50
                          ? 'text-warning'
                          : 'text-danger'
                    )}
                  >
                    {accuracy}% correct
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function DeckCard({
  deck,
  onOpen,
  onStudy,
  onDelete,
  onEdit,
}: {
  deck: Deck
  onOpen: () => void
  onStudy: () => void
  onDelete: () => void
  onEdit?: () => void
}) {
  const color = resolveDeckColor(deck.color)
  const mastery =
    deck.cardCount > 0
      ? Math.round((deck.masteredCount / deck.cardCount) * 100)
      : 0
  const due = deck.cardCount - deck.masteredCount

  return (
    <div className="glass-card group relative flex flex-col overflow-hidden">
      <span
        className={cn('absolute inset-x-0 top-0 h-1', color.bar)}
        aria-hidden
      />
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col p-4 text-left focus-ring"
      >
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-2xl',
              color.soft,
              color.text
            )}
          >
            <BookOpen size={16} />
          </span>
          <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
            {deck.cardCount} card{deck.cardCount === 1 ? '' : 's'}
          </span>
        </div>
        <h3 className="mt-3 line-clamp-1 font-display text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          {deck.title}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-[32px] text-xs leading-4 text-muted">
          {deck.description || 'No description yet'}
        </p>
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] font-medium text-muted">
            <span>{mastery}% mastered</span>
            <span>
              {deck.masteredCount}/{deck.cardCount}
            </span>
          </div>
          <ProgressBar
            value={mastery}
            className="mt-1.5 h-1.5"
            barClassName={color.bar}
          />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted">
          <Clock3 size={11} />
          {deck.lastStudied
            ? `Studied ${formatRelativeDate(deck.lastStudied)}`
            : 'Not studied yet'}
        </div>
      </button>

      <div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant="primary"
          icon={Zap}
          onClick={onStudy}
          disabled={deck.cardCount === 0}
          title={deck.cardCount === 0 ? 'Add cards before studying' : undefined}
          className="flex-1"
        >
          Study
        </Button>
        {onEdit && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={Pencil}
            onClick={onEdit}
            aria-label={`Edit ${deck.title}`}
            title="Edit deck"
          />
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          icon={BookOpen}
          onClick={onOpen}
          aria-label={`Manage cards in ${deck.title}`}
          title="Manage cards"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          icon={Trash2}
          onClick={onDelete}
          aria-label={`Delete ${deck.title}`}
          title="Delete deck"
          className="text-danger hover:bg-danger-light hover:text-danger"
        />
      </div>
      {due > 0 && (
        <span className="pointer-events-none absolute right-3 top-12 rounded-full bg-warning-light px-2 py-0.5 text-[9px] font-semibold text-warning">
          {due} to learn
        </span>
      )}
    </div>
  )
}

export function FlipCard({
  front,
  back,
  flipped,
  onFlip,
  disabled = false,
}: {
  front: string
  back: string
  flipped: boolean
  onFlip?: (flipped: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="[perspective:1400px]">
      <button
        type="button"
        onClick={() => {
          if (disabled) return
          onFlip?.(!flipped)
        }}
        aria-label={flipped ? 'Show question' : 'Show answer'}
        disabled={disabled}
        className={cn(
          'relative block min-h-[240px] w-full rounded-3xl border border-border bg-surface text-left transition-shadow duration-300 focus-ring sm:min-h-[280px]',
          'shadow-glass-sm hover:shadow-glass',
          disabled && 'cursor-default'
        )}
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : undefined,
          transition: 'transform 520ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Front
          </span>
          <p className="font-display text-xl font-semibold leading-relaxed text-foreground sm:text-2xl">
            {front}
          </p>
          <span className="mt-2 text-[11px] text-muted">
            Tap to reveal the answer
          </span>
        </div>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
            Back
          </span>
          <p className="text-base leading-relaxed text-foreground sm:text-lg">
            {back}
          </p>
        </div>
      </button>
    </div>
  )
}

export function AccuracyPill({
  correct,
  reviewed,
}: {
  correct: number
  reviewed: number
}) {
  const accuracy = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0
  const Icon: LucideIcon =
    accuracy >= 80 ? TrendingUp : accuracy >= 50 ? Sparkles : Flame
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        accuracy >= 80
          ? 'bg-success-light text-success'
          : accuracy >= 50
            ? 'bg-warning-light text-warning'
            : 'bg-danger-light text-danger'
      )}
    >
      <Icon size={11} />
      {accuracy}% accuracy
    </span>
  )
}
