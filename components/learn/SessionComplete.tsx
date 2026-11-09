'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Award,
  Bot,
  ChevronDown,
  ChevronUp,
  Flame,
  PartyPopper,
  Rocket,
  RotateCcw,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import { BADGE_DEFINITIONS, type BadgeId, type Deck, type SessionResult } from '@/lib/learn/types'
import type { XPBreakdown } from '@/lib/learn/gamification'
import { cn } from '@/lib/learn/utils'
import { ActionButton } from './StudyLayout'

interface Props {
  deck: Deck
  result: SessionResult
  xpEarned: number
  newBadges: BadgeId[]
  leveledUp?: boolean
  newLevel?: number
  dailyGoalMet?: boolean
  streakMultiplier?: number
  modeMultiplier?: number
  xpBreakdown?: XPBreakdown
  onStudyAgain: () => void
  onBackToDeck: () => void
  onAskAi?: () => void
}

export function SessionComplete({
  deck,
  result,
  xpEarned,
  newBadges,
  leveledUp,
  newLevel,
  dailyGoalMet,
  streakMultiplier = 1,
  modeMultiplier = 1,
  xpBreakdown,
  onStudyAgain,
  onBackToDeck,
  onAskAi,
}: Props) {
  const [displayXp, setDisplayXp] = useState(0)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const accuracy = result.cardsReviewed > 0 ? Math.round((result.correct / result.cardsReviewed) * 100) : 0
  const medalBadges = newBadges
    .map((id) => BADGE_DEFINITIONS.find((badge) => badge.id === id))
    .filter((badge): badge is (typeof BADGE_DEFINITIONS)[number] => Boolean(badge))

  useEffect(() => {
    if (xpEarned <= 0) return
    const steps = 40
    const increment = xpEarned / steps
    let current = 0
    const interval = window.setInterval(() => {
      current += increment
      if (current >= xpEarned) {
        setDisplayXp(xpEarned)
        window.clearInterval(interval)
      } else {
        setDisplayXp(Math.round(current))
      }
    }, 1500 / steps)
    return () => window.clearInterval(interval)
  }, [xpEarned])

  const hero = result.perfect
    ? { icon: Trophy, className: 'from-warning/25 to-orange-500/15 border-warning/30', iconClass: 'text-warning', title: 'Perfect session!' }
    : leveledUp
      ? { icon: Rocket, className: 'from-accent/25 to-success/15 border-accent/30', iconClass: 'text-accent', title: 'Level up!' }
      : newBadges.length > 0
        ? { icon: Star, className: 'from-alpine-100 to-purple-500/15 border-alpine-200 dark:from-alpine-950', iconClass: 'text-alpine-500', title: 'Session complete!' }
        : { icon: PartyPopper, className: 'from-accent/15 to-success/15 border-accent/20', iconClass: 'text-accent', title: 'Session complete!' }

  const HeroIcon = hero.icon

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center space-y-6 px-4 text-center animate-rise-in">
      <div
        className={cn(
          'flex h-24 w-24 items-center justify-center rounded-[2rem] border-2 bg-gradient-to-br shadow-xl',
          hero.className,
        )}
      >
        <HeroIcon size={46} className={hero.iconClass} />
      </div>

      <div>
        <h2 className="font-display text-3xl font-semibold text-foreground md:text-4xl">{hero.title}</h2>
        <p className="mt-2 text-sm text-muted">
          {result.cardsReviewed} card{result.cardsReviewed === 1 ? '' : 's'} in{' '}
          <span className="font-semibold text-foreground">{deck.title}</span>
          {leveledUp && newLevel ? ` · now level ${newLevel}` : ''}
        </p>
      </div>

      <div className="grid w-full grid-cols-3 gap-3">
        <StatCard value={`${accuracy}%`} label="Accuracy" tone={accuracy >= 90 ? 'success' : accuracy >= 70 ? 'warning' : 'danger'} />
        <StatCard value={result.correct} label="Correct" tone="success" />
        <StatCard value={result.cardsReviewed - result.correct} label="Missed" tone="danger" />
      </div>

      <div className="glass-card w-full space-y-3 p-5 text-left">
        <button
          type="button"
          onClick={() => setShowBreakdown((value) => !value)}
          className="flex w-full items-center justify-between gap-3 focus-ring"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-gradient text-accent-foreground shadow-glow-sm">
              <Zap size={18} />
            </span>
            <span className="font-display text-2xl font-semibold tabular-nums text-foreground">+{displayXp} XP</span>
          </span>
          {xpBreakdown && (
            <span className="flex items-center gap-1 text-xs text-muted">
              {showBreakdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showBreakdown ? 'Hide details' : 'Details'}
            </span>
          )}
        </button>

        {showBreakdown && xpBreakdown && (
          <div className="space-y-2 border-t border-border pt-3 text-sm">
            <BreakdownRow label={`Base (${result.cardsReviewed} × 10)`} value={xpBreakdown.base} />
            {xpBreakdown.modeBonus > 0 && (
              <BreakdownRow label={`Mode bonus (×${xpBreakdown.modeMultiplier})`} value={xpBreakdown.modeBonus} tone="text-accent" />
            )}
            {xpBreakdown.streakBonus > 0 && (
              <BreakdownRow
                label={`Streak bonus (+${Math.round((xpBreakdown.streakMultiplier - 1) * 100)}%)`}
                value={xpBreakdown.streakBonus}
                tone="text-warning"
              />
            )}
            {xpBreakdown.perfectBonus > 0 && (
              <BreakdownRow label="Perfect bonus (+25%)" value={xpBreakdown.perfectBonus} tone="text-success" />
            )}
            {xpBreakdown.dailyGoalBonus > 0 && (
              <BreakdownRow label="Daily goal bonus" value={xpBreakdown.dailyGoalBonus} tone="text-alpine-500" />
            )}
            <div className="flex items-center justify-between border-t border-border pt-2 font-bold">
              <span className="text-foreground">Total</span>
              <span className="text-accent">+{xpEarned} XP</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {modeMultiplier > 1 && <BonusChip icon={<TrendingUp size={11} />} text={`Mode ×${modeMultiplier}`} tone="accent" />}
          {streakMultiplier > 1 && (
            <BonusChip icon={<Flame size={11} />} text={`Streak +${Math.round((streakMultiplier - 1) * 100)}%`} tone="warning" />
          )}
          {result.perfect && <BonusChip icon={<Trophy size={11} />} text="Perfect +25%" tone="success" />}
          {dailyGoalMet && <BonusChip icon={<Target size={11} />} text="Daily goal hit" tone="accent" />}
        </div>
      </div>

      {medalBadges.length > 0 && (
        <div className="glass-card w-full p-4 text-left">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Award size={15} className="text-warning" />
            New badge{medalBadges.length === 1 ? '' : 's'} unlocked
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {medalBadges.map((badge) => (
              <div
                key={badge.id}
                className="flex items-center gap-2 rounded-xl border border-warning/25 bg-warning-light px-3 py-2"
              >
                <span className="text-lg">{badge.icon}</span>
                <div>
                  <p className="text-xs font-semibold text-foreground">{badge.name}</p>
                  <p className="text-[10px] text-muted">{badge.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <ActionButton variant="primary" onClick={onStudyAgain} className="flex-1">
          <RotateCcw size={15} />
          Study again
        </ActionButton>
        {onAskAi && (
          <ActionButton variant="secondary" onClick={onAskAi} className="flex-1">
            <Bot size={15} />
            Ask AI
          </ActionButton>
        )}
        <ActionButton variant="secondary" onClick={onBackToDeck} className="flex-1">
          <ArrowLeft size={15} />
          Back to deck
        </ActionButton>
      </div>
    </div>
  )
}

function StatCard({ value, label, tone }: { value: string | number; label: string; tone: 'success' | 'warning' | 'danger' }) {
  const tones = {
    success: 'text-success border-success/20 bg-success-light',
    warning: 'text-warning border-warning/20 bg-warning-light',
    danger: 'text-danger border-danger/20 bg-danger-light',
  } as const

  return (
    <div className={cn('flex flex-col items-center rounded-2xl border px-2 py-4 shadow-glass-sm', tones[tone])}>
      <span className="font-display text-2xl font-semibold tabular-nums">{value}</span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
    </div>
  )
}

function BreakdownRow({ label, value, tone = 'text-foreground' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted">{label}</span>
      <span className={cn('font-semibold tabular-nums', tone)}>+{value}</span>
    </div>
  )
}

function BonusChip({ icon, text, tone }: { icon: ReactNode; text: string; tone: 'accent' | 'warning' | 'success' }) {
  const tones = {
    accent: 'border-accent/20 bg-accent-light text-accent',
    warning: 'border-warning/20 bg-warning-light text-warning',
    success: 'border-success/20 bg-success-light text-success',
  } as const
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold', tones[tone])}>
      {icon}
      {text}
    </span>
  )
}
