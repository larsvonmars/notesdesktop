'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  BookOpen,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import BaseModal, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/BaseModal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ToastProvider'
import { createDeck, deleteDeck } from '@/lib/learn/decks'
import { useLearning } from '@/lib/learn/context'
import type { Deck } from '@/lib/learn/types'
import { DECK_COLORS, cn } from '@/lib/learn/utils'
import { describeLearnError } from '@/lib/learn/db'
import { DeckCard } from './LearnPrimitives'

type SortBy = 'recent' | 'name' | 'cards' | 'mastery'

interface Props {
  onOpenDeck: (deckId: string) => void
  onStartStudy: (deckId: string) => void
  onEditDeck: (deck: Deck) => void
}

export function DecksView({ onOpenDeck, onStartStudy, onEditDeck }: Props) {
  const {
    decks,
    refreshDecks,
    isLoadingDecks,
    createDeckSignal,
    consumeCreateDeckRequest,
  } = useLearning()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(DECK_COLORS[0].value)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  const [showSort, setShowSort] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Deck | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (createDeckSignal === 0) return
    setShowForm(true)
    consumeCreateDeckRequest()
  }, [createDeckSignal, consumeCreateDeckRequest])

  const filteredDecks = useMemo(() => {
    let result = decks.filter(
      (deck) =>
        deck.title.toLowerCase().includes(search.toLowerCase()) ||
        (deck.description?.toLowerCase() ?? '').includes(search.toLowerCase())
    )

    switch (sortBy) {
      case 'name':
        result = [...result].sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'cards':
        result = [...result].sort((a, b) => b.cardCount - a.cardCount)
        break
      case 'mastery':
        result = [...result].sort((a, b) => {
          const masteryA = a.cardCount > 0 ? a.masteredCount / a.cardCount : 0
          const masteryB = b.cardCount > 0 ? b.masteredCount / b.cardCount : 0
          return masteryB - masteryA
        })
        break
      case 'recent':
      default:
        result = [...result].sort((a, b) => {
          const dateA = a.lastStudied ? new Date(a.lastStudied).getTime() : 0
          const dateB = b.lastStudied ? new Date(b.lastStudied).getTime() : 0
          return dateB - dateA
        })
    }

    return result
  }, [decks, search, sortBy])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      await createDeck({
        title: title.trim(),
        description: description.trim() || undefined,
        color,
      })
      await refreshDecks()
      setTitle('')
      setDescription('')
      setColor(DECK_COLORS[0].value)
      setShowForm(false)
      toast.push({ title: 'Deck created', variant: 'success' })
    } catch (error) {
      toast.push({
        title: 'Could not create deck',
        description: describeLearnError(error),
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    try {
      await deleteDeck(pendingDelete.id)
      await refreshDecks()
      toast.push({
        title: 'Deck deleted',
        description: pendingDelete.title,
        variant: 'success',
      })
      setPendingDelete(null)
    } catch (error) {
      toast.push({
        title: 'Could not delete deck',
        description: describeLearnError(error),
        variant: 'error',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 animate-rise-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-foreground">
            Your decks
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/15 bg-accent-light px-2.5 py-0.5 text-xs font-bold text-accent">
              {decks.length}
            </span>{' '}
            deck{decks.length === 1 ? '' : 's'} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setShowForm(true)}
          >
            New deck
          </Button>
        </div>
      </div>

      {decks.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search decks…"
              className="glass-input h-10 w-full pl-10 pr-4 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowSort((value) => !value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-all',
              showSort
                ? 'border-accent/25 bg-accent-light text-accent'
                : 'border-border bg-surface text-muted hover:text-foreground'
            )}
          >
            <SlidersHorizontal size={14} />
            Sort
          </button>
        </div>
      )}

      {showSort && (
        <div className="flex flex-wrap gap-2 animate-rise-in">
          {(['recent', 'name', 'cards', 'mastery'] as SortBy[]).map(
            (option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSortBy(option)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-bold capitalize transition-all',
                  sortBy === option
                    ? 'bg-accent text-accent-foreground shadow-glow-sm'
                    : 'border border-border bg-surface text-muted hover:text-foreground'
                )}
              >
                {option === 'recent' ? 'Last studied' : option}
              </button>
            )
          )}
        </div>
      )}

      {isLoadingDecks && decks.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((key) => (
            <div
              key={key}
              className="h-56 animate-pulse-soft rounded-2xl bg-surface-hover"
            />
          ))}
        </div>
      ) : filteredDecks.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDecks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              onOpen={() => onOpenDeck(deck.id)}
              onStudy={() => onStartStudy(deck.id)}
              onDelete={() => setPendingDelete(deck)}
              onEdit={() => onEditDeck(deck)}
            />
          ))}
        </div>
      ) : decks.length === 0 ? (
        <div className="glass-card px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-light text-accent">
            <BookOpen size={24} />
          </div>
          <h2 className="mt-3 font-display text-lg font-semibold text-foreground">
            No decks yet
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Create your first deck, then add cards manually or paste a CSV
            list.
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setShowForm(true)}
            className="mt-4"
          >
            Create deck
          </Button>
        </div>
      ) : (
        <div className="glass-card px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            No decks match “{search}”
          </p>
          <p className="mt-1 text-xs text-muted">
            Try a different search term.
          </p>
        </div>
      )}

      <BaseModal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        size="md"
        animation="zoom"
        ariaLabel="Create deck"
      >
        <ModalHeader
          onClose={() => setShowForm(false)}
          closeAriaLabel="Close create deck"
        >
          <div>
            <ModalTitle>Create new deck</ModalTitle>
            <p className="mt-1 text-sm text-muted">
              Start a new learning collection.
            </p>
          </div>
        </ModalHeader>
        <form onSubmit={handleCreate}>
          <ModalBody className="space-y-4">
            <Input
              label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Spanish vocabulary"
            />
            <Input
              label="Description (optional)"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What will you learn?"
            />
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Color
              </p>
              <div className="flex flex-wrap gap-2.5">
                {DECK_COLORS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setColor(option.value)}
                    aria-label={option.label}
                    aria-pressed={color === option.value}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full transition-transform',
                      option.dot,
                      color === option.value
                        ? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface-solid)]'
                        : 'hover:scale-105'
                    )}
                  />
                ))}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={saving}
                disabled={!title.trim()}
              >
                Create deck
              </Button>
            </div>
          </ModalFooter>
        </form>
      </BaseModal>

      <BaseModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        size="sm"
        animation="zoom"
        ariaLabel="Delete deck"
      >
        <ModalHeader
          onClose={() => setPendingDelete(null)}
          closeAriaLabel="Close delete deck"
        >
          <ModalTitle>Delete deck?</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm leading-6 text-muted">
            <span className="font-semibold text-foreground">
              {pendingDelete?.title}
            </span>{' '}
            and all of its cards will be permanently deleted. This cannot be
            undone.
          </p>
        </ModalBody>
        <ModalFooter>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={deleting}
              onClick={() => void handleDelete()}
            >
              Delete deck
            </Button>
          </div>
        </ModalFooter>
      </BaseModal>
    </div>
  )
}
