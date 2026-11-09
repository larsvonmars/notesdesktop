import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ModePicker } from '@/components/learn/ModePicker'
import type { Card, Deck } from '@/lib/learn/types'

const deck: Deck = {
  id: 'deck-1',
  title: 'Biology basics',
  description: 'Cells and genetics',
  cardCount: 3,
  masteredCount: 1,
  color: 'bg-green-500',
}

function makeCard(index: number): Card {
  return {
    id: `card-${index}`,
    deckId: deck.id,
    front: `Question ${index}`,
    back: `Answer ${index}`,
    mastered: false,
    dueDate: null,
    easeFactor: 2.5,
    intervalDays: 1,
    correctCount: 0,
    incorrectCount: 0,
  }
}

describe('Learn mode picker', () => {
  it('lists every study mode including the two AI modes', () => {
    const html = renderToStaticMarkup(
      <ModePicker
        deck={deck}
        cards={[makeCard(1), makeCard(2), makeCard(3)]}
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />
    )

    for (const label of [
      'Flashcard',
      'Multiple choice',
      'Spaced repetition',
      'Typed answer',
      'Test',
      'Smart learning',
      'AI Learn',
      'AI Tutor',
    ]) {
      expect(html).toContain(label)
    }
  })

  it('disables multiple choice when the deck has fewer than three cards', () => {
    const html = renderToStaticMarkup(
      <ModePicker
        deck={deck}
        cards={[makeCard(1), makeCard(2)]}
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />
    )
    expect(html).toContain('Need at least 3 cards for multiple choice')
  })

  it('shows the spaced-repetition due count', () => {
    const dueCard = { ...makeCard(1), dueDate: '2026-01-01' }
    const html = renderToStaticMarkup(
      <ModePicker
        deck={deck}
        cards={[dueCard, makeCard(2), makeCard(3)]}
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />
    )
    expect(html).toContain('due today')
  })
})
