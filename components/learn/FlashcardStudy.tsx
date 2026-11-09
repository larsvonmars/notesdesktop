'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, RotateCcw, Shuffle } from 'lucide-react'
import { useLearning } from '@/lib/learn/context'
import type { Card, Deck, SessionResult } from '@/lib/learn/types'
import { cn, shuffle } from '@/lib/learn/utils'
import { FlipCard } from './LearnPrimitives'
import { ActionButton, StudyLayout } from './StudyLayout'

interface Props {
  deck: Deck
  cards: Card[]
  onComplete: (result: SessionResult) => void
  onExit: () => void
}

export function FlashcardStudy({ deck, cards, onComplete, onExit }: Props) {
  const { setCurrentCard } = useLearning()
  const [shuffled, setShuffled] = useState(false)
  const [index, setIndex] = useState(0)
  const [flippedMap, setFlippedMap] = useState<Record<number, boolean>>({})
  const [results, setResults] = useState<Record<number, 'know' | 'learning'>>(
    {}
  )
  const [streak, setStreak] = useState(0)

  const orderedCards = useMemo(
    () => (shuffled ? shuffle(cards) : cards),
    [shuffled, cards]
  )
  const currentCard = orderedCards[index]
  const isFlipped = flippedMap[index] ?? false
  const rated = results[index] !== undefined

  useEffect(() => {
    if (currentCard) setCurrentCard(currentCard)
    return () => setCurrentCard(null)
  }, [currentCard, setCurrentCard])

  const toggleShuffle = useCallback(() => {
    setShuffled((value) => !value)
    setIndex(0)
    setFlippedMap({})
    setResults({})
    setStreak(0)
  }, [])

  const rate = useCallback(
    (verdict: 'know' | 'learning') => {
      if (!currentCard) return
      const next = { ...results, [index]: verdict }
      setResults(next)
      setStreak((value) => (verdict === 'know' ? value + 1 : 0))

      if (index + 1 >= orderedCards.length) {
        const correct = Object.values(next).filter(
          (value) => value === 'know'
        ).length
        onComplete({
          cardsReviewed: orderedCards.length,
          correct,
          perfect:
            correct === orderedCards.length &&
            Object.keys(next).length === orderedCards.length,
          mode: 'flashcard',
        })
      } else {
        setIndex((value) => value + 1)
        setFlippedMap((map) => ({ ...map, [index + 1]: false }))
      }
    },
    [currentCard, index, orderedCards.length, onComplete, results]
  )

  const prev = useCallback(() => {
    if (index === 0) return
    setIndex((value) => value - 1)
  }, [index])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        if (!isFlipped) setFlippedMap((map) => ({ ...map, [index]: true }))
      }
      if (event.key === '1' && isFlipped) rate('learning')
      if (event.key === '2' && isFlipped) rate('know')
      if (event.key === 'ArrowLeft' && isFlipped) prev()
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, isFlipped, onExit, prev, rate])

  if (!currentCard) return null

  return (
    <StudyLayout
      title={deck.title}
      currentIndex={index}
      totalCards={orderedCards.length}
      streakCount={streak}
      onExit={onExit}
      rightElement={
        <button
          type="button"
          onClick={toggleShuffle}
          title={shuffled ? 'Disable shuffle' : 'Shuffle cards'}
          aria-label={shuffled ? 'Disable shuffle' : 'Shuffle cards'}
          className={cn(
            'focus-ring rounded-xl p-2 transition-all',
            shuffled
              ? 'bg-accent-light text-accent'
              : 'text-muted hover:bg-surface-hover'
          )}
        >
          <Shuffle size={16} />
        </button>
      }
    >
      <div key={`card-${index}`} className="animate-rise-in">
        <FlipCard
          front={currentCard.front}
          back={currentCard.back}
          flipped={isFlipped}
          onFlip={(next) => setFlippedMap((map) => ({ ...map, [index]: next }))}
        />
      </div>

      <div className="flex items-center justify-center gap-3 pt-2">
        <ActionButton
          onClick={prev}
          variant="secondary"
          disabled={index === 0}
          className="px-3"
        >
          <ChevronLeft size={18} />
        </ActionButton>

        {isFlipped ? (
          <>
            <ActionButton
              onClick={() => rate('learning')}
              variant="danger"
              className="max-w-[170px] flex-1"
            >
              <RotateCcw size={15} />
              Still learning
            </ActionButton>
            <ActionButton
              onClick={() => rate('know')}
              variant="primary"
              className="max-w-[170px] flex-1"
            >
              Know it ✓
            </ActionButton>
          </>
        ) : (
          <p className="text-sm font-medium text-muted">
            Tap the card or press <kbd className="kbd text-[10px]">Space</kbd>{' '}
            to reveal
          </p>
        )}
      </div>

      {rated && !isFlipped && (
        <div className="flex justify-center animate-fade-in">
          <span
            className={cn(
              'rounded-full border px-4 py-1.5 text-xs font-bold',
              results[index] === 'know'
                ? 'border-success/20 bg-success-light text-success'
                : 'border-warning/20 bg-warning-light text-warning'
            )}
          >
            {results[index] === 'know' ? '✓ Know it' : '↻ Still learning'}
          </span>
        </div>
      )}

      {isFlipped && (
        <div className="flex justify-center gap-3 text-[10px] text-muted/70">
          <span>
            <kbd className="kbd text-[9px]">1</kbd> Learning
          </span>
          <span>
            <kbd className="kbd text-[9px]">2</kbd> Know it
          </span>
          <span>
            <kbd className="kbd text-[9px]">←</kbd> Back
          </span>
        </div>
      )}
    </StudyLayout>
  )
}
