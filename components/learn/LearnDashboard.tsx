'use client'

import { useMemo } from 'react'
import {
  ArrowRight,
  Award,
  BookOpen,
  Bot,
  Flame,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useLearning } from '@/lib/learn/context'
import type { Deck } from '@/lib/learn/types'
import { Button } from '@/components/ui/Button'
import { cn, resolveDeckColor } from '@/lib/learn/utils'
import {
  BadgeGrid,
  DailyProgressCard,
  DeckCard,
  ProgressBar,
  StatTile,
  XpBar,
} from './LearnPrimitives'

interface Props {
  onOpenDecks: () => void
  onOpenDeck: (deckId: string) => void
  onStartStudy: (deckId: string) => void
  onCreateDeck: () => void
  onDeleteDeck: (deckId: string) => void
  onEditDeck: (deck: Deck) => void
  onOpenProgress: () => void
  onOpenAssistant: (prompt?: string) => void
  onOpenSettings: () => void
}

function getGreeting(): { text: string; icon: typeof Sun } {
  const hour = new Date().getHours()
  if (hour < 6) return { text: 'Good night', icon: Moon }
  if (hour < 12) return { text: 'Good morning', icon: Sunrise }
  if (hour < 17) return { text: 'Good afternoon', icon: Sun }
  if (hour < 21) return { text: 'Good evening', icon: Sunset }
  return { text: 'Good night', icon: Moon }
}

export function LearnDashboard({
  onOpenDecks,
  onOpenDeck,
  onStartStudy,
  onCreateDeck,
  onDeleteDeck,
  onEditDeck,
  onOpenProgress,
  onOpenAssistant,
  onOpenSettings,
}: Props) {
  const { stats, decks, isLoadingStats, isLoadingDecks } = useLearning()
  const greeting = getGreeting()
  const GreetingIcon = greeting.icon

  const accuracy = stats && stats.totalCardsReviewed > 0 ? Math.round((stats.totalCorrect / stats.totalCardsReviewed) * 100) : 0
  const recentDecks = decks.slice(0, 3)
  const continueDeck = decks.find((deck) => deck.lastStudied) ?? decks[0]
  const dailyProgress = stats
    ? {
        cardsReviewed: stats.dailyCardsReviewed,
        correct: 0,
        goal: stats.dailyGoal,
        goalMet: stats.dailyGoalMet,
        goalProgress: stats.dailyGoal > 0 ? Math.min(100, Math.round((stats.dailyCardsReviewed / stats.dailyGoal) * 100)) : 0,
      }
    : { cardsReviewed: 0, correct: 0, goal: 20, goalMet: false, goalProgress: 0 }

  const badgePreview = useMemo(() => {
    if (!stats) return []
    return [...stats.badges].sort((a, b) => Number(Boolean(b.earnedAt)) - Number(Boolean(a.earnedAt)))
  }, [stats])

  if (isLoadingStats && !stats && isLoadingDecks && decks.length === 0) {
    return (
      <div className="space-y-6 animate-rise-in">
        <div className="space-y-3">
          <div className="h-9 w-64 animate-pulse-soft rounded-xl bg-surface-hover" />
          <div className="h-4 w-48 animate-pulse-soft rounded-lg bg-surface-hover" />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((key) => (
            <div key={key} className="h-24 animate-pulse-soft rounded-2xl bg-surface-hover" />
          ))}
        </div>
        <div className="h-28 animate-pulse-soft rounded-2xl bg-surface-hover" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((key) => (
            <div key={key} className="h-48 animate-pulse-soft rounded-2xl bg-surface-hover" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-rise-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted">
            <GreetingIcon size={15} className="text-accent" />
            {greeting.text}
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground">
            Your learning dashboard
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {stats?.streak && stats.streak > 1
              ? `You're on a ${stats.streak}-day streak. Keep it alive!`
              : 'Build a streak by studying a little every day.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="primary" size="sm" icon={Plus} onClick={onCreateDeck}>
            New deck
          </Button>
          <Button type="button" variant="secondary" size="sm" icon={Bot} onClick={() => onOpenAssistant()}>
            Ask AI
          </Button>
        </div>
      </div>

      {stats ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={Flame} label="Streak" value={`${stats.streak}d`} hint={stats.streak > 0 ? 'Study today to continue' : 'Start today'} tone="warning" />
            <StatTile icon={TrendingUp} label="Accuracy" value={`${accuracy}%`} hint={`${stats.totalCorrect} correct answers`} tone="success" />
            <StatTile icon={BookOpen} label="Decks" value={stats.totalDecks} hint={`${stats.totalCardsReviewed.toLocaleString()} cards reviewed`} tone="sky" />
            <StatTile icon={Zap} label="Sessions" value={stats.totalSessions} hint={`Level ${stats.level}`} tone="accent" />
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <XpBar stats={stats} />
            <DailyProgressCard progress={dailyProgress} streak={stats?.streak} />
          </div>
        </>
      ) : (
        <div className="glass-card flex items-center gap-3 p-4 text-sm text-muted">
          <Sparkles size={16} className="text-accent" />
          Learning stats will appear here once you start your first session.
        </div>
      )}

      {continueDeck ? (
        <div className="glass-card relative overflow-hidden p-5">
          <div
            className={cn('absolute inset-y-0 left-0 w-1 bg-gradient-to-b', resolveDeckColor(continueDeck.color).gradient)}
            aria-hidden
          />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', resolveDeckColor(continueDeck.color).soft, resolveDeckColor(continueDeck.color).text)}>
                <BookOpen size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">Continue studying</p>
                <h2 className="mt-0.5 truncate font-display text-lg font-semibold text-foreground">{continueDeck.title}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {continueDeck.cardCount} cards · {continueDeck.masteredCount} mastered
                  {continueDeck.lastStudied ? ' · pick up where you left off' : ' · start your first session'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDeck(continueDeck.id)}>
                Manage
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={() => onStartStudy(continueDeck.id)}>
                Study now
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] font-medium text-muted">
              <span>Mastery</span>
              <span>{continueDeck.cardCount > 0 ? Math.round((continueDeck.masteredCount / continueDeck.cardCount) * 100) : 0}%</span>
            </div>
            <ProgressBar
              value={continueDeck.cardCount > 0 ? (continueDeck.masteredCount / continueDeck.cardCount) * 100 : 0}
              className="mt-1.5"
              barClassName={resolveDeckColor(continueDeck.color).bar}
            />
          </div>
        </div>
      ) : (
        <div className="glass-card px-6 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-light text-accent">
            <BookOpen size={24} />
          </div>
          <h2 className="mt-3 font-display text-lg font-semibold text-foreground">Create your first deck</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Decks group flashcards by topic. Create one and start learning with eight study modes.
          </p>
          <Button type="button" variant="primary" size="sm" icon={Plus} onClick={onCreateDeck} className="mt-4">
            New deck
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-foreground">Recent decks</h2>
        <button
          type="button"
          onClick={onOpenDecks}
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition-opacity hover:opacity-80"
        >
          View all
          <ArrowRight size={12} />
        </button>
      </div>

      {recentDecks.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recentDecks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              onOpen={() => onOpenDeck(deck.id)}
              onStudy={() => onStartStudy(deck.id)}
              onDelete={() => onDeleteDeck(deck.id)}
              onEdit={() => onEditDeck(deck)}
            />
          ))}
        </div>
      ) : (
        <div className="glass-card px-6 py-8 text-center text-sm text-muted">No decks yet.</div>
      )}

      {badgePreview.length > 0 && <BadgeGrid badges={badgePreview} limit={8} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickAction icon={Target} title="Progress & stats" description="Heatmap, badges and session history" onClick={onOpenProgress} />
        <QuickAction
          icon={Bot}
          title="AI study assistant"
          description="Generate cards, analyze decks and plan reviews"
          onClick={() => onOpenAssistant()}
        />
        <QuickAction
          icon={Award}
          title="Study settings"
          description="Daily goal, streak reminder and display name"
          onClick={onOpenSettings}
        />
      </div>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Target
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card flex items-start gap-3 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-glass focus-ring"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent-light text-accent">
        <Icon size={16} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">{description}</span>
      </span>
    </button>
  )
}
