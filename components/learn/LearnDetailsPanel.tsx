'use client'

import {
  Award,
  BookOpen,
  Bot,
  Brain,
  CheckSquare,
  Flame,
  GraduationCap,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useLearning } from '@/lib/learn/context'
import type { StudyMode } from '@/lib/learn/types'
import { cn, formatRelativeDate, resolveDeckColor } from '@/lib/learn/utils'
import { ProgressBar } from './LearnPrimitives'

const QUICK_MODES: Array<{
  mode: StudyMode
  label: string
  icon: typeof Zap
  className: string
}> = [
  {
    mode: 'flashcard',
    label: 'Flashcards',
    icon: BookOpen,
    className: 'text-violet-600 dark:text-violet-400',
  },
  {
    mode: 'multiple-choice',
    label: 'Quiz',
    icon: CheckSquare,
    className: 'text-blue-600 dark:text-blue-400',
  },
  {
    mode: 'spaced-repetition',
    label: 'Spaced',
    icon: Brain,
    className: 'text-amber-600 dark:text-amber-400',
  },
  {
    mode: 'tutor',
    label: 'AI Tutor',
    icon: Sparkles,
    className: 'text-indigo-600 dark:text-indigo-400',
  },
]

/**
 * Right-hand details panel for the Learn workspace, mirroring the note details
 * pane. Shows deck context while studying and a learning summary everywhere
 * else.
 */
export function LearnDetailsPanel() {
  const { stats, decks, screen, setScreen, openAssistant, currentCard } =
    useLearning()

  const deckId =
    screen.kind === 'deck' || screen.kind === 'study'
      ? screen.deckId
      : undefined
  const deck = deckId
    ? decks.find((candidate) => candidate.id === deckId)
    : undefined
  const color = resolveDeckColor(deck?.color)
  const mastery =
    deck && deck.cardCount > 0
      ? Math.round((deck.masteredCount / deck.cardCount) * 100)
      : 0
  const earnedBadges = stats?.badges.filter((badge) => badge.earnedAt) ?? []
  const dailyPercent =
    stats && stats.dailyGoal > 0
      ? Math.min(
          100,
          Math.round((stats.dailyCardsReviewed / stats.dailyGoal) * 100)
        )
      : 0
  const continueDeck =
    decks.find(
      (candidate) => candidate.lastStudied && candidate.cardCount > 0
    ) ?? decks.find((candidate) => candidate.cardCount > 0)

  return (
    <aside
      aria-label="Learn details"
      className="hidden w-[292px] shrink-0 flex-col overflow-y-auto scroll-thin border-l border-border bg-[var(--surface-sunken)] p-3 xl:flex"
    >
      {deck ? (
        <>
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                color.soft,
                color.text
              )}
            >
              <BookOpen size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Deck
              </p>
              <h2 className="truncate font-display text-[15px] font-semibold text-foreground">
                {deck.title}
              </h2>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted">
                {deck.description || 'No description yet'}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <MiniStat label="Cards" value={deck.cardCount} />
            <MiniStat label="Mastered" value={deck.masteredCount} />
            <MiniStat label="Mastery" value={`${mastery}%`} />
          </div>
          <ProgressBar
            value={mastery}
            className="mt-2 h-1.5"
            barClassName={color.bar}
          />
          <p className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
            <span>
              {deck.lastStudied
                ? `Studied ${formatRelativeDate(deck.lastStudied)}`
                : 'Not studied yet'}
            </span>
            <span>
              {Math.max(0, deck.cardCount - deck.masteredCount)} to learn
            </span>
          </p>

          {currentCard && screen.kind === 'study' && (
            <div className="mt-3 rounded-xl border border-accent/20 bg-accent-light/50 p-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-accent">
                Current card
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] font-medium text-foreground">
                {currentCard.front}
              </p>
              <p className="mt-1 line-clamp-2 text-[10px] text-muted">
                {currentCard.back}
              </p>
            </div>
          )}

          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              Start a session
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {QUICK_MODES.map((item) => {
                const Icon = item.icon
                const disabled =
                  item.mode === 'multiple-choice' && deck.cardCount < 3
                return (
                  <button
                    key={item.mode}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      setScreen({
                        kind: 'study',
                        deckId: deck.id,
                        mode: item.mode,
                      })
                    }
                    title={
                      disabled ? 'Need at least 3 cards' : `Start ${item.label}`
                    }
                    className="glass-btn focus-ring flex h-9 items-center justify-start gap-1.5 px-2 text-[11px] font-medium disabled:opacity-40"
                  >
                    <Icon size={12} className={item.className} />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setScreen({ kind: 'study', deckId: deck.id })}
              className="glass-btn-ghost focus-ring mt-1.5 flex h-8 w-full items-center justify-center gap-1 rounded-lg text-[11px] font-medium text-accent"
            >
              All study modes
              <TrendingUp size={11} />
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setScreen({ kind: 'deck', deckId: deck.id })}
              className="glass-btn focus-ring h-8 w-full text-[11px] font-medium"
            >
              Manage cards
            </button>
            <button
              type="button"
              onClick={() =>
                openAssistant(
                  `Help me study the deck "${deck.title}" (id: ${deck.id}). What should I focus on?`
                )
              }
              className="glass-btn focus-ring flex h-8 w-full items-center justify-center gap-1.5 text-[11px] font-medium"
            >
              <Bot size={12} />
              Ask Learn AI
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent">
              <GraduationCap size={16} />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Learn
              </p>
              <h2 className="font-display text-[15px] font-semibold text-foreground">
                Learning overview
              </h2>
            </div>
          </div>

          {stats ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <MiniStat label="Level" value={stats.level} />
                <MiniStat label="XP" value={stats.xp.toLocaleString()} />
                <MiniStat label="Streak" value={`${stats.streak}d`} />
                <MiniStat
                  label="Badges"
                  value={`${earnedBadges.length}/${stats.badges.length}`}
                />
              </div>

              <div className="mt-4 rounded-xl border border-border bg-surface p-2.5">
                <div className="flex items-center justify-between text-[10px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Target size={10} /> Daily goal
                  </span>
                  <span className="tabular-nums">
                    {stats.dailyCardsReviewed}/{stats.dailyGoal}
                  </span>
                </div>
                <ProgressBar
                  value={dailyPercent}
                  className="mt-1.5 h-1.5"
                  barClassName={
                    stats.dailyGoalMet
                      ? 'bg-success'
                      : 'bg-gradient-to-r from-accent to-success'
                  }
                />
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Flame size={10} className="text-warning" />
                    {stats.streak}-day streak
                  </span>
                  <span>
                    {stats.dailyGoalMet
                      ? 'Goal met'
                      : `${Math.max(0, stats.dailyGoal - stats.dailyCardsReviewed)} to go`}
                  </span>
                </div>
              </div>

              {continueDeck && (
                <button
                  type="button"
                  onClick={() =>
                    setScreen({ kind: 'study', deckId: continueDeck.id })
                  }
                  className="glass-row mt-2 flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left"
                >
                  <Zap size={13} className="mt-0.5 shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-accent">
                      Continue
                    </span>
                    <span className="block truncate text-[11px] font-medium text-foreground">
                      {continueDeck.title}
                    </span>
                  </span>
                </button>
              )}

              {earnedBadges.length > 0 && (
                <div className="mt-3">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    <Award size={10} /> Recent badges
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {earnedBadges.slice(0, 6).map((badge) => (
                      <span
                        key={badge.id}
                        title={`${badge.name} — ${badge.description}`}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-0.5 text-[10px] text-foreground"
                      >
                        <span>{badge.icon}</span>
                        <span className="max-w-[86px] truncate">
                          {badge.name}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => openAssistant()}
                className="glass-btn-ghost mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-medium text-accent"
              >
                <Bot size={12} />
                Ask Learn AI
              </button>
            </>
          ) : (
            <p className="mt-4 text-[11px] leading-5 text-muted">
              Study your first deck to see level, streak, daily progress and
              badges here.
            </p>
          )}
        </>
      )}
    </aside>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-2 py-1.5">
      <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  )
}
