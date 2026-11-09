'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Loader2,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import { getCardsByDeck } from '@/lib/learn/cards'
import { useLearning } from '@/lib/learn/context'
import { completeSession, type CompleteSessionResult } from '@/lib/learn/study'
import type { Card, SessionResult, StudyMode } from '@/lib/learn/types'
import { cn } from '@/lib/learn/utils'
import { FlashcardStudy } from './FlashcardStudy'
import { ModePicker } from './ModePicker'
import { MultipleChoiceStudy } from './MultipleChoiceStudy'
import { SessionComplete } from './SessionComplete'
import { SmartStudy } from './SmartStudy'
import { SpacedRepetitionStudy } from './SpacedRepetitionStudy'
import { TestStudy } from './TestStudy'
import { TypedAnswerStudy } from './TypedAnswerStudy'

const SPRINT_SIZE = 10

const VALID_MODES: StudyMode[] = [
  'flashcard',
  'multiple-choice',
  'spaced-repetition',
  'typed-answer',
  'test',
  'smart',
]

function chunkCards(cards: Card[], size: number): Card[][] {
  const chunks: Card[][] = []
  for (let index = 0; index < cards.length; index += size) {
    chunks.push(cards.slice(index, index + size))
  }
  return chunks.length > 0 ? chunks : [[]]
}

interface Props {
  deckId: string
  initialMode?: StudyMode | null
  onBackToDeck: () => void
}

export function StudySession({ deckId, initialMode, onBackToDeck }: Props) {
  const { decks, refreshStats, refreshDecks } = useLearning()
  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const deck = useMemo(
    () => decks.find((candidate) => candidate.id === deckId),
    [deckId, decks]
  )

  const [mode, setMode] = useState<StudyMode | null>(
    initialMode && VALID_MODES.includes(initialMode) ? initialMode : null
  )
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [sprints, setSprints] = useState<Card[][]>([])
  const [sprintIndex, setSprintIndex] = useState(0)
  const [sprintResults, setSprintResults] = useState<SessionResult[]>([])
  const [showSprintComplete, setShowSprintComplete] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null)
  const [xpEarned, setXpEarned] = useState(0)
  const [newBadges, setNewBadges] = useState<
    CompleteSessionResult['newBadges']
  >([])
  const [extra, setExtra] = useState<Omit<
    CompleteSessionResult,
    'xpEarned' | 'newBadges'
  > | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadCards = useCallback(async () => {
    setLoading(true)
    try {
      const next = await getCardsByDeck(deckId)
      if (!mountedRef.current) return
      setCards(next)
      setSprints(chunkCards(next, SPRINT_SIZE))
    } catch (error) {
      console.warn('Failed to load cards:', error)
      if (mountedRef.current) {
        setCards([])
        setSprints([[]])
        toastRef.current.push({
          title: 'Could not load cards',
          description: 'Check your connection and try again.',
          variant: 'error',
        })
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [deckId])

  useEffect(() => {
    void loadCards()
  }, [loadCards])

  const handleSprintComplete = useCallback(
    (result: SessionResult) => {
      const nextResults = [...sprintResults, result]
      setSprintResults(nextResults)

      if (sprintIndex + 1 >= sprints.length) {
        const totalCards = nextResults.reduce(
          (sum, entry) => sum + entry.cardsReviewed,
          0
        )
        const totalCorrect = nextResults.reduce(
          (sum, entry) => sum + entry.correct,
          0
        )
        const allPerfect = nextResults.every((entry) => entry.perfect)

        const finalResult: SessionResult = {
          cardsReviewed: totalCards,
          correct: totalCorrect,
          perfect: allPerfect,
          mode: result.mode,
          sessionTimeSeconds: result.sessionTimeSeconds,
        }

        completeSession({
          deckId,
          cardsReviewed: totalCards,
          correct: totalCorrect,
          perfect: allPerfect,
          mode: result.mode,
          sessionTimeSeconds: result.sessionTimeSeconds,
          timezoneOffset: new Date().getTimezoneOffset(),
        })
          .then((response) => {
            if (!mountedRef.current) return
            setXpEarned(response.xpEarned)
            setNewBadges(response.newBadges)
            setExtra({
              newStreak: response.newStreak,
              newLevel: response.newLevel,
              leveledUp: response.leveledUp,
              dailyGoalMet: response.dailyGoalMet,
              streakMultiplier: response.streakMultiplier,
              modeMultiplier: response.modeMultiplier,
              xpBreakdown: response.xpBreakdown,
            })
            void refreshStats()
            void refreshDecks()
          })
          .catch((error) => {
            console.warn('Failed to complete session:', error)
            if (!mountedRef.current) return
            setXpEarned(totalCards * 10)
            setNewBadges([])
            setExtra(null)
            toast.push({
              title: 'Session saved locally only',
              description: 'XP could not be saved. Check your connection.',
              variant: 'warning',
            })
          })
          .finally(() => {
            if (!mountedRef.current) return
            setSessionResult(finalResult)
            setCompleted(true)
          })
      } else {
        setShowSprintComplete(true)
      }
    },
    [
      deckId,
      refreshDecks,
      refreshStats,
      sprintIndex,
      sprintResults,
      sprints.length,
      toast,
    ]
  )

  function handleStudyAgain() {
    setSprints(chunkCards(cards, SPRINT_SIZE))
    setSprintIndex(0)
    setSprintResults([])
    setShowSprintComplete(false)
    setCompleted(false)
    setSessionResult(null)
    setXpEarned(0)
    setNewBadges([])
    setExtra(null)
    setMode(null)
  }

  if (!deck) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 text-center">
        <span className="glass flex h-12 w-12 items-center justify-center rounded-2xl text-muted">
          <BookOpen size={20} />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Deck not found
          </h2>
          <p className="mt-1 text-sm text-muted">
            This deck is unavailable or no longer belongs to you.
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToDeck}
          className="glass-btn rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground"
        >
          Back to decks
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center animate-rise-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/10 bg-accent-light shadow-glass-sm">
          <Loader2 size={26} className="animate-spin text-accent" />
        </div>
        <p className="text-base font-semibold text-foreground">
          Loading study session…
        </p>
        <p className="text-sm text-muted">
          {deck.title} · {deck.cardCount} cards
        </p>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl border border-accent/10 bg-accent-light text-accent">
          <Search size={28} />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            No cards yet
          </h2>
          <p className="mt-1 text-sm text-muted">
            Add some cards to this deck before starting a study session.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBackToDeck}
            className="glass-btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold text-accent-foreground"
          >
            <BookOpen size={15} className="mr-1.5 inline" />
            Manage cards
          </button>
          <button
            type="button"
            onClick={onBackToDeck}
            className="glass-btn rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground"
          >
            <ArrowLeft size={15} className="mr-1.5 inline" />
            Go back
          </button>
        </div>
      </div>
    )
  }

  if (completed && sessionResult) {
    return (
      <SessionComplete
        deck={deck}
        result={sessionResult}
        xpEarned={xpEarned}
        newBadges={newBadges}
        leveledUp={extra?.leveledUp}
        newLevel={extra?.newLevel}
        dailyGoalMet={extra?.dailyGoalMet}
        streakMultiplier={extra?.streakMultiplier}
        modeMultiplier={extra?.modeMultiplier}
        xpBreakdown={extra?.xpBreakdown}
        onStudyAgain={handleStudyAgain}
        onBackToDeck={onBackToDeck}
      />
    )
  }

  if (showSprintComplete && sprintResults.length > 0) {
    const lastResult = sprintResults[sprintResults.length - 1]
    const sprintAccuracy =
      lastResult.cardsReviewed > 0
        ? Math.round((lastResult.correct / lastResult.cardsReviewed) * 100)
        : 0
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center space-y-6 px-4 text-center animate-rise-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] border-2 border-accent/20 bg-accent-light shadow-xl">
          <Zap size={38} className="text-accent" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Sprint {sprintIndex + 1} complete!
          </h2>
          <p className="mt-1 text-sm text-muted">
            {lastResult.cardsReviewed} cards · {lastResult.correct} correct
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-3">
          <div className="glass-card flex flex-col items-center px-2 py-4">
            <span
              className={cn(
                'font-display text-2xl font-semibold',
                sprintAccuracy >= 80
                  ? 'text-success'
                  : sprintAccuracy >= 50
                    ? 'text-warning'
                    : 'text-danger'
              )}
            >
              {sprintAccuracy}%
            </span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Accuracy
            </span>
          </div>
          <div className="glass-card flex flex-col items-center px-2 py-4">
            <span className="font-display text-2xl font-semibold text-success">
              {lastResult.correct}
            </span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Correct
            </span>
          </div>
          <div className="glass-card flex flex-col items-center px-2 py-4">
            <span className="font-display text-2xl font-semibold text-foreground">
              {sprintResults.reduce(
                (sum, entry) => sum + entry.cardsReviewed,
                0
              )}
            </span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Reviewed
            </span>
          </div>
        </div>
        <p className="text-xs text-muted">
          Sprint {sprintIndex + 1} of {sprints.length} ·{' '}
          {sprints[sprintIndex + 1]?.length ?? 0} cards next
        </p>
        <button
          type="button"
          onClick={() => {
            setSprintIndex((value) => value + 1)
            setShowSprintComplete(false)
          }}
          className="glass-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-accent-foreground"
        >
          Next sprint
          <ChevronRight size={15} />
        </button>
      </div>
    )
  }

  if (!mode) {
    return (
      <ModePicker
        deck={deck}
        cards={cards}
        onSelect={(selected) => setMode(selected)}
        onBack={onBackToDeck}
      />
    )
  }

  const currentSprintCards = sprints[sprintIndex] ?? []
  const exitToDeck = () => {
    setMode(null)
    setShowSprintComplete(false)
    onBackToDeck()
  }

  if (mode === 'flashcard') {
    return (
      <FlashcardStudy
        deck={deck}
        cards={currentSprintCards}
        onComplete={handleSprintComplete}
        onExit={exitToDeck}
      />
    )
  }
  if (mode === 'multiple-choice') {
    return (
      <MultipleChoiceStudy
        deck={deck}
        cards={currentSprintCards}
        onComplete={handleSprintComplete}
        onExit={exitToDeck}
      />
    )
  }
  if (mode === 'spaced-repetition') {
    return (
      <SpacedRepetitionStudy
        deck={deck}
        allCards={cards}
        sprintSize={SPRINT_SIZE}
        onComplete={handleSprintComplete}
        onExit={exitToDeck}
      />
    )
  }
  if (mode === 'typed-answer') {
    return (
      <TypedAnswerStudy
        deck={deck}
        cards={currentSprintCards}
        onComplete={handleSprintComplete}
        onExit={exitToDeck}
      />
    )
  }
  if (mode === 'test') {
    return (
      <TestStudy
        deck={deck}
        cards={currentSprintCards}
        onComplete={handleSprintComplete}
        onExit={exitToDeck}
      />
    )
  }
  if (mode === 'smart') {
    return (
      <SmartStudy
        deck={deck}
        cards={currentSprintCards}
        onComplete={handleSprintComplete}
        onExit={exitToDeck}
      />
    )
  }
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-3 text-center">
      <Sparkles size={26} className="text-accent" />
      <p className="text-sm text-muted">This study mode is unavailable.</p>
      <button
        type="button"
        onClick={() => setMode(null)}
        className="glass-btn rounded-xl px-4 py-2 text-sm"
      >
        Choose another mode
      </button>
    </div>
  )
}
