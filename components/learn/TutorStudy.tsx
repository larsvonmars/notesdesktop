'use client'

import { useState } from 'react'
import { ArrowLeft, Gavel, GraduationCap, MessageCircle, Sparkles, Zap } from 'lucide-react'
import { runTutorChat, TUTOR_STYLES, type TutorStyle } from '@/lib/learn/ai'
import type { Card, Deck, SessionResult } from '@/lib/learn/types'
import { cn } from '@/lib/learn/utils'
import { StudyChat } from './StudyChat'

interface Props {
  deck: Deck
  cards: Card[]
  onComplete: (result: SessionResult) => void
  onExit: () => void
}

const STYLE_VISUALS: Record<TutorStyle, { icon: typeof GraduationCap; soft: string; text: string }> = {
  socratic: {
    icon: GraduationCap,
    soft: 'bg-indigo-500/10',
    text: 'text-indigo-600 dark:text-indigo-400',
  },
  'oral-exam': {
    icon: Gavel,
    soft: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
  },
  conversational: {
    icon: MessageCircle,
    soft: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  'rapid-fire': {
    icon: Zap,
    soft: 'bg-rose-500/10',
    text: 'text-rose-600 dark:text-rose-400',
  },
}

export function TutorStudy({ deck, cards, onComplete, onExit }: Props) {
  const [style, setStyle] = useState<TutorStyle | null>(null)

  const cardContent = cards.map((card) => `Q: ${card.front} → A: ${card.back}`)
  const cardIds = cards.map((card) => card.id)

  if (!style) {
    return (
      <div className="mx-auto max-w-xl space-y-8 animate-rise-in">
        <div className="text-center">
          <button
            type="button"
            onClick={onExit}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft size={15} />
            Back to study modes
          </button>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
            <Sparkles size={28} />
          </div>
          <h1 className="font-display text-2xl font-semibold text-foreground">AI Tutor</h1>
          <p className="mt-1.5 text-sm text-muted">
            Choose a tutoring style for <span className="font-semibold text-foreground">{deck.title}</span>
          </p>
        </div>

        <div className="space-y-3">
          {TUTOR_STYLES.map((option) => {
            const visual = STYLE_VISUALS[option.id]
            const StyleIcon = visual.icon
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setStyle(option.id)}
                className="glass-card flex w-full items-start gap-4 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-glass focus-ring"
              >
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', visual.soft, visual.text)}>
                  <StyleIcon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const styleLabel = TUTOR_STYLES.find((option) => option.id === style)?.label ?? 'Socratic'

  return (
    <StudyChat
      deck={deck}
      cards={cards}
      mode="tutor"
      title={`AI Tutor · ${styleLabel}`}
      subtitle={`${styleLabel} mode`}
      icon={Sparkles}
      accent="indigo"
      send={({ history, message, callbacks }) =>
        runTutorChat({
          style,
          deckTitle: deck.title,
          cardContent,
          cardIds,
          history,
          message,
          callbacks,
        })
      }
      onComplete={onComplete}
      onExit={onExit}
    />
  )
}
