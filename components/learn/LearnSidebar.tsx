'use client'

import { useMemo, useState } from 'react'
import {
  BookOpen,
  Flame,
  GraduationCap,
  LayoutDashboard,
  Plus,
  Search,
  Settings2,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useLearning } from '@/lib/learn/context'
import type { LearnScreen } from '@/lib/learn/types'
import { cn, formatRelativeDate, resolveDeckColor } from '@/lib/learn/utils'
import { ProgressBar } from './LearnPrimitives'

interface LearnSidebarProps {
  /** Called after navigating inside Learn (closes the mobile drawer). */
  onNavigate?: () => void
  className?: string
}

const NAV_ITEMS: Array<{
  id: 'dashboard' | 'decks' | 'progress' | 'settings'
  label: string
  icon: typeof LayoutDashboard
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'decks', label: 'Decks', icon: BookOpen },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'settings', label: 'Study settings', icon: Settings2 },
]

export function LearnSidebar({
  onNavigate,
  className = '',
}: LearnSidebarProps) {
  const {
    stats,
    decks,
    screen,
    setScreen,
    requestCreateDeck,
    startStudy,
  } = useLearning()
  const [query, setQuery] = useState('')

  const filteredDecks = useMemo(() => {
    const term = query.trim().toLowerCase()
    const sorted = [...decks].sort((a, b) => {
      const aTime = a.lastStudied ? new Date(a.lastStudied).getTime() : 0
      const bTime = b.lastStudied ? new Date(b.lastStudied).getTime() : 0
      return bTime - aTime
    })
    if (!term) return sorted
    return sorted.filter(
      (deck) =>
        deck.title.toLowerCase().includes(term) ||
        (deck.description?.toLowerCase() ?? '').includes(term)
    )
  }, [decks, query])

  const continueDeck = useMemo(
    () =>
      decks.find((deck) => deck.lastStudied && deck.cardCount > 0) ??
      decks.find((deck) => deck.cardCount > 0),
    [decks]
  )

  const pendingCards = useMemo(
    () =>
      decks.reduce(
        (sum, deck) => sum + Math.max(0, deck.cardCount - deck.masteredCount),
        0
      ),
    [decks]
  )

  const navigate = (next: LearnScreen) => {
    setScreen(next)
    onNavigate?.()
  }

  const isDeckScreen = screen.kind === 'deck' || screen.kind === 'study'
  const navActive = (id: (typeof NAV_ITEMS)[number]['id']) => {
    if (id === 'decks') return screen.kind === 'decks' || isDeckScreen
    return screen.kind === id
  }

  const dailyPercent =
    stats && stats.dailyGoal > 0
      ? Math.min(
          100,
          Math.round((stats.dailyCardsReviewed / stats.dailyGoal) * 100)
        )
      : 0

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-gradient text-accent-foreground shadow-glow-sm">
            <GraduationCap size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[13px] font-semibold text-foreground">
              Learn
            </p>
            <p className="truncate text-[10px] text-muted">
              {stats
                ? `Level ${stats.level} · ${pendingCards} card${pendingCards === 1 ? '' : 's'} to learn`
                : 'Flashcards & spaced repetition'}
            </p>
          </div>
          {stats && stats.streak > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-warning-light px-1.5 py-0.5 text-[10px] font-bold text-warning">
              <Flame size={9} />
              {stats.streak}
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 px-2">
        <button
          type="button"
          onClick={() => {
            requestCreateDeck()
            onNavigate?.()
          }}
          className="glass-btn-primary focus-ring h-9 w-full gap-1.5 px-3 text-[12px] font-semibold text-accent-foreground"
        >
          <Plus size={13} />
          New deck
        </button>
      </div>

      <nav
        aria-label="Learn sections"
        className="shrink-0 space-y-0.5 px-2 py-2"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = navActive(item.id)
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                navigate({ kind: item.id } as LearnScreen)
              }}
              className={cn(
                'glass-row focus-ring flex h-8 w-full items-center gap-2.5 px-2 text-[12.5px] font-medium',
                active
                  ? 'is-active text-foreground'
                  : 'text-muted hover:text-foreground'
              )}
            >
              <Icon
                size={14}
                strokeWidth={1.9}
                className={active ? 'text-accent' : 'text-muted'}
                aria-hidden
              />
              <span className="flex-1 truncate text-left">{item.label}</span>
              {item.id === 'decks' ? (
                <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-muted">
                  {decks.length}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <div className="glass-divider mx-3 shrink-0" aria-hidden="true" />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-3 pb-1.5 pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              Your decks
            </span>
            <span className="text-[9px] tabular-nums text-muted">
              {decks.length}
            </span>
          </div>
          <div className="relative mt-1.5">
            <Search
              size={12}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a deck…"
              className="glass-input h-7 w-full pl-7 pr-2 text-[11px]"
              aria-label="Search decks"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin px-1.5 pb-2">
          {filteredDecks.length === 0 ? (
            <div className="px-2 py-8 text-center">
              <p className="text-[11px] font-medium text-foreground">
                {decks.length === 0 ? 'No decks yet' : 'No decks match'}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-muted">
                {decks.length === 0
                  ? 'Create a deck to start learning.'
                  : 'Try a different search term.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filteredDecks.map((deck) => {
                const color = resolveDeckColor(deck.color)
                const mastery =
                  deck.cardCount > 0
                    ? Math.round((deck.masteredCount / deck.cardCount) * 100)
                    : 0
                const active = isDeckScreen && screen.deckId === deck.id
                return (
                  <li
                    key={deck.id}
                    className={cn(
                      'group flex items-center gap-0.5 rounded-xl transition-colors',
                      active
                        ? 'bg-[var(--surface-active)]'
                        : 'hover:bg-[var(--surface-hover)]'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ kind: 'deck', deckId: deck.id })
                      }
                      aria-current={active ? 'page' : undefined}
                      className="focus-ring flex min-w-0 flex-1 items-start gap-2 rounded-xl px-2 py-1.5 text-left"
                    >
                      <span
                        className={cn(
                          'mt-1 h-2 w-2 shrink-0 rounded-full',
                          color.dot
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1">
                          <span className="truncate text-[12px] font-medium text-foreground">
                            {deck.title}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 text-[9.5px] text-muted">
                          {deck.cardCount} card{deck.cardCount === 1 ? '' : 's'}
                          <span aria-hidden>·</span>
                          {mastery}%
                          {deck.lastStudied ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="truncate">
                                {formatRelativeDate(deck.lastStudied)}
                              </span>
                            </>
                          ) : null}
                        </span>
                        <ProgressBar
                          value={mastery}
                          className="mt-1 h-[3px]"
                          barClassName={color.bar}
                        />
                      </span>
                    </button>
                    {deck.cardCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          startStudy(deck.id)
                          onNavigate?.()
                        }}
                        className="focus-ring mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 transition-all hover:bg-accent-light hover:text-accent group-hover:opacity-100 focus-visible:opacity-100"
                        title={`Study ${deck.title}`}
                        aria-label={`Study ${deck.title}`}
                      >
                        <Zap size={11} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-border px-3 py-2.5">
        {stats ? (
          <>
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Target size={10} />
                Today
              </span>
              <span className="tabular-nums">
                {stats.dailyCardsReviewed}/{stats.dailyGoal} · {dailyPercent}%
              </span>
            </div>
            <ProgressBar
              value={dailyPercent}
              className="h-1.5"
              barClassName={
                stats.dailyGoalMet
                  ? 'bg-success'
                  : 'bg-gradient-to-r from-accent to-success'
              }
            />
            <div className="flex items-center justify-between text-[10px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Zap size={10} className="text-accent" />
                {stats.xp.toLocaleString()} XP
              </span>
              <button
                type="button"
                onClick={() => navigate({ kind: 'progress' })}
                className="font-semibold text-accent hover:opacity-80"
              >
                Progress
              </button>
            </div>
          </>
        ) : (
          <p className="text-[10px] text-muted">
            Learning stats load automatically.
          </p>
        )}

        {continueDeck && (
          <button
            type="button"
            onClick={() => {
              startStudy(continueDeck.id)
              onNavigate?.()
            }}
            className="glass-btn focus-ring flex h-8 w-full items-center gap-1.5 px-2 text-[11px] font-medium"
            title={`Continue studying ${continueDeck.title}`}
          >
            <Zap size={11} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-left">
              Continue: {continueDeck.title}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
