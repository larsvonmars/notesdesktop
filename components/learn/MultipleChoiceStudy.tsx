'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLearning } from '@/lib/learn/context'
import type { Card, Deck, SessionResult } from '@/lib/learn/types'
import { shuffle } from '@/lib/learn/utils'
import {
  ActionButton,
  OptionButton,
  QuestionCard,
  StudyLayout,
} from './StudyLayout'

interface Props {
  deck: Deck
  cards: Card[]
  onComplete: (result: SessionResult) => void
  onExit: () => void
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const
const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const

function buildOptions(cards: Card[], currentIndex: number): string[] {
  const correct = cards[currentIndex].back
  const pool = cards
    .filter((_, index) => index !== currentIndex)
    .map((card) => card.back)
  return shuffle([correct, ...shuffle(pool).slice(0, 3)])
}

export function MultipleChoiceStudy({
  deck,
  cards,
  onComplete,
  onExit,
}: Props) {
  const { setCurrentCard } = useLearning()
  const shuffledCards = useMemo(() => shuffle(cards), [cards])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [results, setResults] = useState<boolean[]>([])
  const [streak, setStreak] = useState(0)

  const currentCard = shuffledCards[index]
  const correctAnswer = currentCard?.back ?? ''
  const options = useMemo(
    () => buildOptions(shuffledCards, index),
    [shuffledCards, index]
  )
  const revealed = selected !== null
  const wasCorrect = selected === correctAnswer

  useEffect(() => {
    if (currentCard) setCurrentCard(currentCard)
    return () => setCurrentCard(null)
  }, [currentCard, setCurrentCard])

  function handleSelect(option: string) {
    if (revealed) return
    setSelected(option)
    setStreak((value) => (option === correctAnswer ? value + 1 : 0))
  }

  function advance() {
    const nextResults = [...results, wasCorrect]
    if (index + 1 >= shuffledCards.length) {
      const correctCount = nextResults.filter(Boolean).length
      onComplete({
        cardsReviewed: shuffledCards.length,
        correct: correctCount,
        perfect: correctCount === shuffledCards.length,
        mode: 'multiple-choice',
      })
    } else {
      setResults(nextResults)
      setSelected(null)
      setIndex((value) => value + 1)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!revealed) {
        const key = event.key.toLowerCase()
        const optionIndex = OPTION_KEYS.indexOf(
          key as (typeof OPTION_KEYS)[number]
        )
        if (optionIndex >= 0 && optionIndex < options.length) {
          event.preventDefault()
          handleSelect(options[optionIndex])
        }
      } else if (event.key === 'Enter') {
        event.preventDefault()
        advance()
      }
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!currentCard) return null

  function getOptionState(
    option: string
  ): 'default' | 'correct' | 'wrong' | 'neutral' {
    if (!revealed) return 'default'
    if (option === correctAnswer) return 'correct'
    if (option === selected) return 'wrong'
    return 'neutral'
  }

  return (
    <StudyLayout
      title={deck.title}
      currentIndex={index}
      totalCards={shuffledCards.length}
      streakCount={streak}
      onExit={onExit}
    >
      <QuestionCard label="Multiple choice">{currentCard.front}</QuestionCard>

      <div className="grid grid-cols-1 gap-3">
        {options.map((option, optionIndex) => (
          <OptionButton
            key={`${index}-${option}`}
            label={OPTION_LABELS[optionIndex]}
            text={option}
            state={getOptionState(option)}
            onClick={() => handleSelect(option)}
            disabled={revealed}
          />
        ))}
      </div>

      {revealed && (
        <div className="flex flex-col items-center gap-3 animate-rise-in">
          {!wasCorrect && (
            <p className="text-xs text-muted">
              Correct answer:{' '}
              <span className="font-bold text-success">{correctAnswer}</span>
            </p>
          )}
          <ActionButton
            variant="primary"
            onClick={advance}
            className="w-full max-w-xs"
          >
            {index + 1 >= shuffledCards.length ? 'See results' : 'Next card'}
          </ActionButton>
          <p className="text-[10px] text-muted/70">
            Press <kbd className="kbd text-[9px]">Enter</kbd> to continue
          </p>
        </div>
      )}

      {!revealed && (
        <div className="flex justify-center gap-2 text-[10px] text-muted/60">
          {OPTION_LABELS.slice(0, options.length).map((label) => (
            <kbd key={label} className="kbd text-[9px]">
              {label}
            </kbd>
          ))}
        </div>
      )}
    </StudyLayout>
  )
}
