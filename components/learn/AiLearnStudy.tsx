'use client'

import { Sparkles } from 'lucide-react'
import { runAiLearnChat } from '@/lib/learn/ai'
import type { Card, Deck, SessionResult } from '@/lib/learn/types'
import { StudyChat } from './StudyChat'

interface Props {
  deck: Deck
  cards: Card[]
  onComplete: (result: SessionResult) => void
  onExit: () => void
}

export function AiLearnStudy({ deck, cards, onComplete, onExit }: Props) {
  const cardContent = cards.map((card) => `Q: ${card.front} → A: ${card.back}`)
  const cardIds = cards.map((card) => card.id)

  return (
    <StudyChat
      deck={deck}
      cards={cards}
      mode="ai-learn"
      title="AI Learn"
      subtitle="Card-by-card coaching"
      icon={Sparkles}
      accent="fuchsia"
      send={({ history, message, callbacks }) =>
        runAiLearnChat({
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
