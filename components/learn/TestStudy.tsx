'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLearning } from '@/lib/learn/context'
import type { Card, Deck, SessionResult } from '@/lib/learn/types'
import { cn, isAnswerCorrect, shuffle } from '@/lib/learn/utils'
import {
  ActionButton,
  FeedbackBanner,
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

type QuestionType = 'multiple-choice' | 'typed'

interface TestQuestion {
  card: Card
  type: QuestionType
  options?: string[]
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const
const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const

function buildOptions(cards: Card[], currentCard: Card): string[] {
  const pool = cards
    .filter((card) => card.id !== currentCard.id)
    .map((card) => card.back)
  return shuffle([currentCard.back, ...shuffle(pool).slice(0, 3)])
}

function buildTestQuestions(cards: Card[]): TestQuestion[] {
  const shuffled = shuffle(cards)
  const canMultipleChoice = cards.length >= 3
  return shuffled.map((card, index) => {
    const useMultipleChoice = canMultipleChoice && index % 2 === 0
    return {
      card,
      type: useMultipleChoice ? 'multiple-choice' : 'typed',
      options: useMultipleChoice ? buildOptions(cards, card) : undefined,
    }
  })
}

export function TestStudy({ deck, cards, onComplete, onExit }: Props) {
  const { setCurrentCard } = useLearning()
  const questions = useMemo(() => buildTestQuestions(cards), [cards])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Array<string | null>>(() =>
    new Array(questions.length).fill(null)
  )
  const [revealed, setRevealed] = useState(false)
  const [typedInput, setTypedInput] = useState('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [streak, setStreak] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const advanceTimer = useRef<number | null>(null)

  const currentQuestion = questions[index]

  useEffect(() => {
    const id = window.setInterval(
      () => setElapsedSeconds((value) => value + 1),
      1000
    )
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (currentQuestion) setCurrentCard(currentQuestion.card)
    return () => setCurrentCard(null)
  }, [currentQuestion, setCurrentCard])

  useEffect(() => {
    if (currentQuestion?.type === 'typed' && !revealed) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 60)
      return () => window.clearTimeout(timer)
    }
  }, [index, revealed, currentQuestion?.type])

  useEffect(() => {
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    }
  }, [])

  const currentAnswer = answers[index]

  function advanceOrComplete(nextAnswers: Array<string | null>) {
    if (index + 1 >= questions.length) {
      const correctCount = questions.filter((question, questionIndex) => {
        const answer = nextAnswers[questionIndex]
        return answer !== null && isAnswerCorrect(answer, question.card.back)
      }).length
      onComplete({
        cardsReviewed: questions.length,
        correct: correctCount,
        perfect: correctCount === questions.length,
        mode: 'test',
        sessionTimeSeconds: elapsedSeconds,
      })
    } else {
      setIndex((value) => value + 1)
      setTypedInput('')
      setRevealed(false)
    }
  }

  function handleMultipleChoiceSelect(option: string) {
    if (!currentQuestion || revealed) return
    const correct = option === currentQuestion.card.back
    setStreak((value) => (correct ? value + 1 : 0))

    const next = [...answers]
    next[index] = option
    setAnswers(next)
    setRevealed(true)

    advanceTimer.current = window.setTimeout(() => advanceOrComplete(next), 900)
  }

  function handleTypedSubmit(event: FormEvent) {
    event.preventDefault()
    if (!currentQuestion || !typedInput.trim() || revealed) return
    const correct = isAnswerCorrect(typedInput, currentQuestion.card.back)
    setStreak((value) => (correct ? value + 1 : 0))

    const next = [...answers]
    next[index] = typedInput
    setAnswers(next)
    setRevealed(true)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!currentQuestion) return
      if (
        currentQuestion.type === 'multiple-choice' &&
        currentQuestion.options &&
        !revealed
      ) {
        const key = event.key.toLowerCase()
        const optionIndex = OPTION_KEYS.indexOf(
          key as (typeof OPTION_KEYS)[number]
        )
        if (optionIndex >= 0 && optionIndex < currentQuestion.options.length) {
          event.preventDefault()
          handleMultipleChoiceSelect(currentQuestion.options[optionIndex])
        }
      }
      if (
        currentQuestion.type === 'typed' &&
        !revealed &&
        event.key === 'Enter' &&
        typedInput.trim()
      ) {
        event.preventDefault()
        handleTypedSubmit(event as unknown as FormEvent)
      }
      if (
        currentQuestion.type === 'typed' &&
        revealed &&
        event.key === 'Enter'
      ) {
        event.preventDefault()
        advanceOrComplete(answers)
      }
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!currentQuestion) return null

  function getOptionState(
    option: string
  ): 'default' | 'correct' | 'wrong' | 'neutral' {
    if (!revealed) return 'default'
    if (option === currentQuestion.card.back) return 'correct'
    if (option === currentAnswer) return 'wrong'
    return 'neutral'
  }

  const typedCorrect =
    currentQuestion.type === 'typed' &&
    revealed &&
    isAnswerCorrect(typedInput, currentQuestion.card.back)

  return (
    <StudyLayout
      title={deck.title}
      currentIndex={index}
      totalCards={questions.length}
      streakCount={streak}
      onExit={onExit}
      showTimer
      timerSeconds={elapsedSeconds}
    >
      <div className="flex items-center justify-center">
        <span
          className={cn(
            'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em]',
            currentQuestion.type === 'multiple-choice'
              ? 'border-accent/20 bg-accent-light text-accent'
              : 'border-alpine-200 bg-alpine-50 text-alpine-600 dark:border-alpine-900 dark:bg-alpine-950 dark:text-alpine-300'
          )}
        >
          {currentQuestion.type === 'multiple-choice'
            ? 'Multiple choice'
            : 'Written answer'}
        </span>
      </div>

      <QuestionCard>{currentQuestion.card.front}</QuestionCard>

      {currentQuestion.type === 'multiple-choice' &&
        currentQuestion.options && (
          <div className="grid grid-cols-1 gap-3">
            {currentQuestion.options.map((option, optionIndex) => (
              <OptionButton
                key={`${index}-${option}`}
                label={OPTION_LABELS[optionIndex]}
                text={option}
                state={getOptionState(option)}
                onClick={() => handleMultipleChoiceSelect(option)}
                disabled={revealed}
              />
            ))}
          </div>
        )}

      {currentQuestion.type === 'typed' && (
        <form onSubmit={handleTypedSubmit} className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={typedInput}
            onChange={(event) => setTypedInput(event.target.value)}
            disabled={revealed}
            placeholder="Write your answer…"
            autoComplete="off"
            className={cn(
              'h-14 w-full rounded-2xl border bg-surface px-5 text-base font-semibold text-foreground outline-none shadow-sm transition-all',
              !revealed &&
                'border-border focus:border-accent/50 focus:ring-2 focus:ring-accent/15',
              revealed &&
                typedCorrect &&
                'border-success/40 bg-success-light text-success',
              revealed &&
                !typedCorrect &&
                'border-danger/40 bg-danger-light text-danger'
            )}
          />

          {!revealed ? (
            <ActionButton
              type="submit"
              variant="primary"
              disabled={!typedInput.trim()}
              className="w-full"
            >
              Submit answer
            </ActionButton>
          ) : (
            <div className="space-y-3">
              <FeedbackBanner
                correct={typedCorrect}
                correctAnswer={currentQuestion.card.back}
              />
              <ActionButton
                variant="primary"
                onClick={() => advanceOrComplete(answers)}
                className="w-full"
              >
                {index + 1 >= questions.length
                  ? 'See results'
                  : 'Next question'}
              </ActionButton>
            </div>
          )}
        </form>
      )}

      {currentQuestion.type === 'multiple-choice' && revealed && (
        <p className="text-center text-[10px] text-muted/70">
          Moving to the next question…
        </p>
      )}
    </StudyLayout>
  )
}
