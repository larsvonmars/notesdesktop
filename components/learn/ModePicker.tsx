'use client'

import {
  ArrowLeft,
  BookOpen,
  Brain,
  CheckSquare,
  ClipboardList,
  Keyboard,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Card, Deck, StudyMode } from '@/lib/learn/types'
import { cn } from '@/lib/learn/utils'

interface Props {
  deck: Deck
  cards: Card[]
  onSelect: (mode: StudyMode) => void
  onBack: () => void
}

const MODE_STYLES: Record<
  StudyMode,
  { icon: LucideIcon; soft: string; text: string }
> = {
  flashcard: {
    icon: BookOpen,
    soft: 'bg-violet-500/10',
    text: 'text-violet-600 dark:text-violet-400',
  },
  'multiple-choice': {
    icon: CheckSquare,
    soft: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
  },
  'spaced-repetition': {
    icon: Brain,
    soft: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
  },
  'typed-answer': {
    icon: Keyboard,
    soft: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  test: {
    icon: ClipboardList,
    soft: 'bg-rose-500/10',
    text: 'text-rose-600 dark:text-rose-400',
  },
  smart: { icon: Sparkles, soft: 'bg-accent-light', text: 'text-accent' },
}

export function ModePicker({ deck, cards, onSelect, onBack }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const dueCount = cards.filter(
    (card) => card.dueDate === null || card.dueDate <= today
  ).length
  const canMultipleChoice = cards.length >= 3

  const modes: Array<{
    id: StudyMode
    label: string
    description: string
    meta?: string
    disabled?: boolean
    disabledReason?: string
  }> = [
    {
      id: 'flashcard',
      label: 'Flashcard',
      description:
        'Classic flip-card review. Rate each card Know it or Still learning.',
      meta: `${cards.length} card${cards.length === 1 ? '' : 's'}`,
    },
    {
      id: 'multiple-choice',
      label: 'Multiple choice',
      description:
        'Pick the correct answer from four options with instant feedback.',
      meta: canMultipleChoice ? `${cards.length} cards` : undefined,
      disabled: !canMultipleChoice,
      disabledReason: 'Need at least 3 cards for multiple choice',
    },
    {
      id: 'spaced-repetition',
      label: 'Spaced repetition',
      description:
        'SM-2 scheduling resurfaces each card at the right time based on difficulty.',
      meta: dueCount > 0 ? `${dueCount} due today` : 'No cards due today',
    },
    {
      id: 'typed-answer',
      label: 'Typed answer',
      description:
        'Type the answer from memory. Case-insensitive matching with instant feedback.',
      meta: `${cards.length} cards`,
    },
    {
      id: 'test',
      label: 'Test',
      description:
        'Timed mixed-format quiz: multiple choice and written answers, with a final score.',
      meta: `${cards.length} questions`,
    },
    {
      id: 'smart',
      label: 'Smart learning',
      description:
        'Adaptive three-round flow: multiple choice, then typed answers, then flashcards.',
      meta: `${cards.length} cards × 3 rounds`,
    },
  ]

  return (
    <div className="mx-auto max-w-xl space-y-7 animate-rise-in">
      <div className="text-center">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Back to deck
        </button>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {deck.title}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Choose how you want to study
        </p>
      </div>

      <div className="space-y-3">
        {modes.map((mode) => {
          const visual = MODE_STYLES[mode.id]
          const ModeIcon = visual.icon
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => !mode.disabled && onSelect(mode.id)}
              disabled={mode.disabled}
              title={mode.disabled ? mode.disabledReason : undefined}
              className={cn(
                'glass-card group flex w-full items-start gap-4 p-4 text-left transition-all focus-ring',
                mode.disabled
                  ? 'cursor-not-allowed opacity-45'
                  : 'hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-glass'
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
                  visual.soft,
                  visual.text
                )}
              >
                <ModeIcon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {mode.label}
                  </span>
                  {mode.meta && (
                    <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-semibold text-muted">
                      {mode.meta}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted">
                  {mode.description}
                </span>
                {mode.disabled && mode.disabledReason && (
                  <span className="mt-1 block text-[10px] font-medium text-warning">
                    {mode.disabledReason}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
