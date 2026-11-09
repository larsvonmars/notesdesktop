'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useLearning } from '@/lib/learn/context'
import type { Card, Deck, SessionResult } from '@/lib/learn/types'
import { cn, isAnswerCorrect, shuffle } from '@/lib/learn/utils'
import {
  ActionButton,
  FeedbackBanner,
  QuestionCard,
  StudyLayout,
} from './StudyLayout'

interface Props {
  deck: Deck
  cards: Card[]
  onComplete: (result: SessionResult) => void
  onExit: () => void
}

export function TypedAnswerStudy({ deck, cards, onComplete, onExit }: Props) {
  const { setCurrentCard } = useLearning()
  const shuffledCards = useMemo(() => shuffle(cards), [cards])
  const [index, setIndex] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<boolean[]>([])
  const [streak, setStreak] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const currentCard = shuffledCards[index]
  const isCorrect =
    submitted && currentCard
      ? isAnswerCorrect(inputValue, currentCard.back)
      : false

  useEffect(() => {
    if (currentCard) setCurrentCard(currentCard)
    return () => setCurrentCard(null)
  }, [currentCard, setCurrentCard])

  useEffect(() => {
    if (!submitted) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 60)
      return () => window.clearTimeout(timer)
    }
  }, [submitted, index])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!inputValue.trim() || submitted || !currentCard) return
    setSubmitted(true)
    setStreak((value) =>
      isAnswerCorrect(inputValue, currentCard.back) ? value + 1 : 0
    )
  }

  function handleNext() {
    if (!currentCard) return
    const correct = isAnswerCorrect(inputValue, currentCard.back)
    const nextResults = [...results, correct]

    if (index + 1 >= shuffledCards.length) {
      const correctCount = nextResults.filter(Boolean).length
      onComplete({
        cardsReviewed: shuffledCards.length,
        correct: correctCount,
        perfect: correctCount === shuffledCards.length,
        mode: 'typed-answer',
      })
    } else {
      setResults(nextResults)
      setIndex((value) => value + 1)
      setInputValue('')
      setSubmitted(false)
      setShowHint(false)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onExit()
        return
      }
      if (event.key === 'Enter' && !submitted && inputValue.trim()) {
        event.preventDefault()
        handleSubmit(event as unknown as FormEvent)
      } else if (event.key === 'Enter' && submitted) {
        event.preventDefault()
        handleNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!currentCard) return null

  const hintText = showHint
    ? `${currentCard.back.charAt(0)}${'•'.repeat(Math.max(0, currentCard.back.length - 1))}`
    : null

  return (
    <StudyLayout
      title={deck.title}
      currentIndex={index}
      totalCards={shuffledCards.length}
      streakCount={streak}
      onExit={onExit}
    >
      <QuestionCard label="Type the answer">{currentCard.front}</QuestionCard>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            disabled={submitted}
            placeholder="Type your answer…"
            autoComplete="off"
            className={cn(
              'h-14 w-full rounded-2xl border bg-surface px-5 pr-12 text-base font-semibold text-foreground outline-none shadow-sm transition-all',
              !submitted &&
                'border-border focus:border-accent/50 focus:ring-2 focus:ring-accent/15',
              submitted &&
                isCorrect &&
                'border-success/40 bg-success-light text-success',
              submitted &&
                !isCorrect &&
                'border-danger/40 bg-danger-light text-danger'
            )}
          />
          {!submitted && (
            <button
              type="button"
              onClick={() => setShowHint((value) => !value)}
              className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              title={showHint ? 'Hide hint' : 'Show hint'}
              aria-label={showHint ? 'Hide hint' : 'Show hint'}
            >
              {showHint ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>

        {hintText && (
          <p className="text-center font-mono text-xs text-muted">
            Hint: {hintText}
          </p>
        )}

        {!submitted ? (
          <ActionButton
            type="submit"
            variant="primary"
            disabled={!inputValue.trim()}
            className="w-full"
          >
            Check answer
          </ActionButton>
        ) : (
          <div className="space-y-3">
            <FeedbackBanner
              correct={isCorrect}
              correctAnswer={currentCard.back}
            />
            <ActionButton
              variant="primary"
              onClick={handleNext}
              className="w-full"
            >
              {index + 1 >= shuffledCards.length ? 'See results' : 'Next card'}
            </ActionButton>
          </div>
        )}
      </form>
    </StudyLayout>
  )
}
