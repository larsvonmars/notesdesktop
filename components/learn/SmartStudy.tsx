'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, ChevronRight, XCircle } from 'lucide-react'
import { useLearning } from '@/lib/learn/context'
import type { Card, Deck, SessionResult } from '@/lib/learn/types'
import { cn, isAnswerCorrect, shuffle } from '@/lib/learn/utils'
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

type Phase = 'multiple-choice' | 'typed' | 'flashcard'

const PHASES: Phase[] = ['multiple-choice', 'typed', 'flashcard']
const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const
const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const

const PHASE_META: Record<
  Phase,
  {
    label: string
    description: string
    icon: string
    className: string
    soft: string
  }
> = {
  'multiple-choice': {
    label: 'Multiple choice',
    description: 'Pick the correct answer',
    icon: '🎯',
    className: 'text-accent',
    soft: 'bg-accent-light',
  },
  typed: {
    label: 'Typed answer',
    description: 'Type the answer from memory',
    icon: '✍️',
    className: 'text-alpine-600 dark:text-alpine-300',
    soft: 'bg-alpine-100 dark:bg-alpine-950',
  },
  flashcard: {
    label: 'Flashcard',
    description: 'Rate your recall',
    icon: '🃏',
    className: 'text-success',
    soft: 'bg-success-light',
  },
}

function buildOptions(cards: Card[], currentCard: Card): string[] {
  const pool = cards
    .filter((card) => card.id !== currentCard.id)
    .map((card) => card.back)
  return shuffle([currentCard.back, ...shuffle(pool).slice(0, 3)])
}

export function SmartStudy({ deck, cards, onComplete, onExit }: Props) {
  const { setCurrentCard } = useLearning()
  const canMultipleChoice = cards.length >= 3
  const startPhaseIndex = canMultipleChoice ? 0 : 1

  const [phaseIndex, setPhaseIndex] = useState(startPhaseIndex)
  const [showPhaseTransition, setShowPhaseTransition] = useState(false)
  const [cardIndex, setCardIndex] = useState(0)
  const [correctTotal, setCorrectTotal] = useState(0)
  const [streak, setStreak] = useState(0)
  const [mcSelected, setMcSelected] = useState<string | null>(null)
  const [typedInput, setTypedInput] = useState('')
  const [typedSubmitted, setTypedSubmitted] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const shuffledCards = useMemo(() => shuffle(cards), [cards])
  const phase = PHASES[phaseIndex]
  const currentCard = shuffledCards[cardIndex]
  const totalPhases = PHASES.length - startPhaseIndex
  const totalCards = shuffledCards.length * totalPhases
  const reviewedSoFar =
    (phaseIndex - startPhaseIndex) * shuffledCards.length + cardIndex

  useEffect(() => {
    if (currentCard) setCurrentCard(currentCard)
    return () => setCurrentCard(null)
  }, [currentCard, setCurrentCard])

  const mcOptions = useMemo(
    () =>
      phase === 'multiple-choice' && currentCard
        ? buildOptions(shuffledCards, currentCard)
        : [],
    [phase, currentCard, shuffledCards]
  )

  useEffect(() => {
    if (phase === 'typed' && !typedSubmitted) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 60)
      return () => window.clearTimeout(timer)
    }
  }, [cardIndex, phaseIndex, typedSubmitted, phase])

  function resetCardState() {
    setMcSelected(null)
    setTypedInput('')
    setTypedSubmitted(false)
    setFlipped(false)
  }

  function advanceCard(correct: boolean) {
    const newCorrect = correctTotal + (correct ? 1 : 0)
    setCorrectTotal(newCorrect)
    setStreak((value) => (correct ? value + 1 : 0))

    if (cardIndex + 1 >= shuffledCards.length) {
      const nextPhaseIndex = phaseIndex + 1
      if (nextPhaseIndex >= PHASES.length) {
        onComplete({
          cardsReviewed: totalCards,
          correct: newCorrect,
          perfect: newCorrect === totalCards,
          mode: 'smart',
        })
      } else {
        setPhaseIndex(nextPhaseIndex)
        setCardIndex(0)
        resetCardState()
        setShowPhaseTransition(true)
      }
    } else {
      setCardIndex((value) => value + 1)
      resetCardState()
    }
  }

  function handleMcSelect(option: string) {
    if (!currentCard || mcSelected !== null) return
    setMcSelected(option)
    window.setTimeout(() => advanceCard(option === currentCard.back), 900)
  }

  function handleTypedSubmit(event: FormEvent) {
    event.preventDefault()
    if (!typedInput.trim() || typedSubmitted) return
    setTypedSubmitted(true)
  }

  const typedCorrect = Boolean(
    currentCard &&
    typedSubmitted &&
    isAnswerCorrect(typedInput, currentCard.back)
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (showPhaseTransition) {
        if (event.key === 'Enter') setShowPhaseTransition(false)
        return
      }
      if (phase === 'multiple-choice' && mcSelected === null) {
        const key = event.key.toLowerCase()
        const optionIndex = OPTION_KEYS.indexOf(
          key as (typeof OPTION_KEYS)[number]
        )
        if (optionIndex >= 0 && optionIndex < mcOptions.length) {
          event.preventDefault()
          handleMcSelect(mcOptions[optionIndex])
        }
      }
      if (
        phase === 'typed' &&
        !typedSubmitted &&
        event.key === 'Enter' &&
        typedInput.trim()
      ) {
        event.preventDefault()
        handleTypedSubmit(event as unknown as FormEvent)
      }
      if (
        phase === 'typed' &&
        typedSubmitted &&
        event.key === 'Enter' &&
        currentCard
      ) {
        event.preventDefault()
        advanceCard(isAnswerCorrect(typedInput, currentCard.back))
      }
      if (phase === 'flashcard') {
        if (!flipped && (event.key === ' ' || event.key === 'Enter')) {
          event.preventDefault()
          setFlipped(true)
        } else if (flipped && event.key === '1') {
          advanceCard(false)
        } else if (flipped && event.key === '2') {
          advanceCard(true)
        }
      }
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!currentCard) return null

  if (showPhaseTransition) {
    const nextPhase = PHASES[phaseIndex]
    const meta = PHASE_META[nextPhase]
    const roundNumber = phaseIndex - startPhaseIndex + 1
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center space-y-8 text-center animate-rise-in">
        <div
          className={cn(
            'flex h-20 w-20 items-center justify-center rounded-3xl text-3xl shadow-glass-sm',
            meta.soft
          )}
        >
          {meta.icon}
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">
            Round {roundNumber} of {totalPhases}
          </p>
          <h2
            className={cn(
              'font-display text-3xl font-semibold',
              meta.className
            )}
          >
            {meta.label}
          </h2>
          <p className="mt-2 text-sm text-muted">{meta.description}</p>
        </div>
        <ActionButton
          variant="primary"
          onClick={() => setShowPhaseTransition(false)}
        >
          Start round {roundNumber} →
        </ActionButton>
      </div>
    )
  }

  const meta = PHASE_META[phase]

  return (
    <StudyLayout
      title={deck.title}
      currentIndex={reviewedSoFar}
      totalCards={totalCards}
      streakCount={streak}
      onExit={onExit}
      animateCard={false}
      phaseIndicator={
        <div className="flex flex-wrap items-center gap-2">
          {PHASES.slice(startPhaseIndex).map((phaseName, index) => {
            const phaseMeta = PHASE_META[phaseName]
            const absoluteIndex = PHASES.indexOf(phaseName)
            const isActive = absoluteIndex === phaseIndex
            const isDone = absoluteIndex < phaseIndex
            return (
              <span
                key={phaseName}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold',
                  isActive && 'border-accent/30 bg-accent-light text-accent',
                  isDone && 'border-success/25 bg-success-light text-success',
                  !isActive && !isDone && 'border-border bg-surface text-muted'
                )}
              >
                {isDone ? (
                  <CheckCircle2 size={11} />
                ) : isActive ? (
                  <span>{phaseMeta.icon}</span>
                ) : (
                  <span className="opacity-60">{phaseMeta.icon}</span>
                )}
                {phaseMeta.label}
                {index < totalPhases - 1 && !isActive && !isDone && (
                  <ChevronRight size={10} className="opacity-40" />
                )}
              </span>
            )
          })}
        </div>
      }
    >
      <div className="flex items-center justify-center">
        <span
          className={cn(
            'rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em]',
            meta.soft,
            meta.className
          )}
        >
          {meta.icon} {meta.label}
        </span>
      </div>

      <QuestionCard
        label={`Round ${phaseIndex - startPhaseIndex + 1} · ${meta.label}`}
      >
        {currentCard.front}
      </QuestionCard>

      {phase === 'multiple-choice' && (
        <div className="grid grid-cols-1 gap-3">
          {mcOptions.map((option, optionIndex) => {
            const state =
              mcSelected === null
                ? 'default'
                : option === currentCard.back
                  ? 'correct'
                  : option === mcSelected
                    ? 'wrong'
                    : 'neutral'
            return (
              <OptionButton
                key={`${cardIndex}-${option}`}
                label={OPTION_LABELS[optionIndex]}
                text={option}
                state={state}
                onClick={() => handleMcSelect(option)}
                disabled={mcSelected !== null}
              />
            )
          })}
        </div>
      )}

      {phase === 'typed' && (
        <form onSubmit={handleTypedSubmit} className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={typedInput}
            onChange={(event) => setTypedInput(event.target.value)}
            disabled={typedSubmitted}
            placeholder="Type your answer…"
            autoComplete="off"
            className={cn(
              'h-14 w-full rounded-2xl border bg-surface px-5 text-base font-semibold text-foreground outline-none shadow-sm transition-all',
              !typedSubmitted &&
                'border-border focus:border-accent/50 focus:ring-2 focus:ring-accent/15',
              typedSubmitted &&
                typedCorrect &&
                'border-success/40 bg-success-light text-success',
              typedSubmitted &&
                !typedCorrect &&
                'border-danger/40 bg-danger-light text-danger'
            )}
          />
          {!typedSubmitted ? (
            <ActionButton
              type="submit"
              variant="primary"
              disabled={!typedInput.trim()}
              className="w-full"
            >
              Check answer
            </ActionButton>
          ) : (
            <div className="space-y-3">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold',
                  typedCorrect
                    ? 'border-success/30 bg-success-light text-success'
                    : 'border-danger/30 bg-danger-light text-danger'
                )}
              >
                {typedCorrect ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <XCircle size={16} />
                )}
                {typedCorrect
                  ? 'Correct!'
                  : `Correct answer: ${currentCard.back}`}
              </div>
              <ActionButton
                variant="primary"
                onClick={() => advanceCard(typedCorrect)}
                className="w-full"
              >
                Next card
              </ActionButton>
            </div>
          )}
        </form>
      )}

      {phase === 'flashcard' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setFlipped((value) => !value)}
            className="glass-card flex min-h-[200px] w-full flex-col items-center justify-center gap-3 p-8 text-center focus-ring"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
              {flipped ? 'Answer' : 'Recall the answer'}
            </span>
            <p
              className={cn(
                'font-display text-lg font-semibold leading-relaxed',
                flipped ? 'text-foreground' : 'text-foreground/80'
              )}
            >
              {flipped ? currentCard.back : currentCard.front}
            </p>
            {!flipped && (
              <span className="text-[11px] text-muted">Tap to reveal</span>
            )}
          </button>
          {flipped && (
            <div className="flex gap-2">
              <ActionButton
                onClick={() => advanceCard(false)}
                variant="danger"
                className="flex-1"
              >
                Still learning
              </ActionButton>
              <ActionButton
                onClick={() => advanceCard(true)}
                variant="primary"
                className="flex-1"
              >
                Know it ✓
              </ActionButton>
            </div>
          )}
        </div>
      )}
    </StudyLayout>
  )
}
