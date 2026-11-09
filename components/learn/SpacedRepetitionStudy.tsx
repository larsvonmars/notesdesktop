'use client'

import { useEffect, useMemo, useState } from 'react'
import { Brain } from 'lucide-react'
import { useLearning } from '@/lib/learn/context'
import { rateCard } from '@/lib/learn/study'
import type { Card, Deck, SessionResult } from '@/lib/learn/types'
import { cn } from '@/lib/learn/utils'
import { FlipCard } from './LearnPrimitives'
import { ActionButton, StudyLayout } from './StudyLayout'

interface Props {
  deck: Deck
  allCards: Card[]
  sprintSize?: number
  onComplete: (result: SessionResult) => void
  onExit: () => void
}

type Quality = 0 | 1 | 2 | 3

const RATINGS: Array<{
  quality: Quality
  label: string
  shortcut: string
  interval: string
  className: string
}> = [
  {
    quality: 0,
    label: 'Again',
    shortcut: '1',
    interval: '< 1 min',
    className: 'border-danger/25 bg-danger-light text-danger',
  },
  {
    quality: 1,
    label: 'Hard',
    shortcut: '2',
    interval: '~ 1 day',
    className: 'border-warning/25 bg-warning-light text-warning',
  },
  {
    quality: 2,
    label: 'Good',
    shortcut: '3',
    interval: '~ 3 days',
    className: 'border-success/25 bg-success-light text-success',
  },
  {
    quality: 3,
    label: 'Easy',
    shortcut: '4',
    interval: '~ 1 week',
    className:
      'border-alpine-200 bg-alpine-50 text-alpine-600 dark:border-alpine-900 dark:bg-alpine-950 dark:text-alpine-300',
  },
]

export function SpacedRepetitionStudy({
  deck,
  allCards,
  sprintSize = Infinity,
  onComplete,
  onExit,
}: Props) {
  const { setCurrentCard } = useLearning()
  const today = new Date().toISOString().slice(0, 10)

  const dueCards = useMemo(
    () =>
      allCards
        .filter((card) => card.dueDate === null || card.dueDate <= today)
        .slice(0, sprintSize),
    [allCards, today, sprintSize]
  )

  const [studyAll, setStudyAll] = useState(false)
  const [index, setIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [rating, setRating] = useState(false)

  const cards = studyAll ? allCards.slice(0, sprintSize) : dueCards
  const currentCard = dueCards.length === 0 && !studyAll ? null : cards[index]

  useEffect(() => {
    if (currentCard) setCurrentCard(currentCard)
    return () => setCurrentCard(null)
  }, [currentCard, setCurrentCard])

  async function handleRate(quality: Quality) {
    if (rating || !currentCard) return
    setRating(true)
    const wasCorrect = quality >= 2
    if (wasCorrect) setCorrectCount((value) => value + 1)

    try {
      await rateCard(currentCard.id, quality)
    } catch (error) {
      console.warn('Failed to rate card:', error)
    }

    if (index + 1 >= cards.length) {
      const finalCorrect = correctCount + (wasCorrect ? 1 : 0)
      onComplete({
        cardsReviewed: cards.length,
        correct: finalCorrect,
        perfect: finalCorrect === cards.length,
        mode: 'spaced-repetition',
      })
    } else {
      setIndex((value) => value + 1)
      setIsFlipped(false)
      window.setTimeout(() => setRating(false), 300)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isFlipped) {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          setIsFlipped(true)
        } else if (event.key === 'Escape') {
          onExit()
        }
        return
      }
      if (rating) return
      if (event.key === '1') void handleRate(0)
      if (event.key === '2') void handleRate(1)
      if (event.key === '3') void handleRate(2)
      if (event.key === '4') void handleRate(3)
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (dueCards.length === 0 && !studyAll) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center space-y-6 text-center animate-rise-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-accent/15 bg-accent-light shadow-glass-sm">
          <Brain size={34} className="text-accent" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">
            No cards due today
          </h2>
          <p className="mt-1.5 max-w-xs text-sm text-muted">
            Your spaced repetition schedule is up to date. Great job keeping up!
          </p>
        </div>
        <ActionButton variant="primary" onClick={() => setStudyAll(true)}>
          Study {Math.min(allCards.length, sprintSize)} cards anyway
        </ActionButton>
        <ActionButton variant="secondary" onClick={onExit}>
          Go back
        </ActionButton>
      </div>
    )
  }

  if (!currentCard) return null

  return (
    <StudyLayout
      title={deck.title}
      subtitle={!studyAll ? 'Due today' : undefined}
      currentIndex={index}
      totalCards={cards.length}
      onExit={onExit}
    >
      <FlipCard
        key={`sr-${index}`}
        front={currentCard.front}
        back={currentCard.back}
        flipped={isFlipped}
        onFlip={setIsFlipped}
        disabled={rating}
      />

      {isFlipped ? (
        <div className="space-y-3 animate-rise-in">
          <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-muted">
            How well did you know this?
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATINGS.map((option) => (
              <button
                key={option.quality}
                type="button"
                onClick={() => void handleRate(option.quality)}
                disabled={rating}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-xs font-bold transition-all hover:-translate-y-0.5 hover:shadow-glass-sm disabled:opacity-40',
                  option.className
                )}
              >
                <span>{option.label}</span>
                <span className="text-[10px] font-normal opacity-70">
                  {option.interval}
                </span>
                <kbd className="mt-0.5 rounded bg-black/5 px-1 text-[9px] font-mono dark:bg-white/10">
                  {option.shortcut}
                </kbd>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center text-sm font-medium text-muted">
          Tap the card or press <kbd className="kbd text-[10px]">Space</kbd> to
          reveal
        </p>
      )}
    </StudyLayout>
  )
}
