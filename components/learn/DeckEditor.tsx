'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  Clock3,
  FileText,
  List,
  Loader2,
  Paperclip,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import BaseModal, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/BaseModal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ToastProvider'
import { generateCardsFromDocument } from '@/lib/learn/ai'
import {
  createCard,
  createCards,
  deleteCard,
  getCardsByDeck,
  updateCard,
} from '@/lib/learn/cards'
import { deleteDeck } from '@/lib/learn/decks'
import { useLearning } from '@/lib/learn/context'
import {
  getDocumentText,
  updateDocument,
  uploadDocument,
} from '@/lib/learn/documents'
import type { Card } from '@/lib/learn/types'
import { checkTextQuality } from '@/lib/learn/pdf-text'
import { cn, formatRelativeDate, resolveDeckColor } from '@/lib/learn/utils'
import { describeLearnError } from '@/lib/learn/db'
import { ProgressBar } from './LearnPrimitives'

interface Props {
  deckId: string
  onBack: () => void
  onStartStudy: () => void
  onOpenAssistant: (prompt?: string) => void
}

interface CardDraft {
  front: string
  back: string
  mastered: boolean
}

export function DeckEditor({
  deckId,
  onBack,
  onStartStudy,
  onOpenAssistant,
}: Props) {
  const { decks, refreshDecks, aiRefreshCounter } = useLearning()
  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const deck = useMemo(
    () => decks.find((candidate) => candidate.id === deckId),
    [deckId, decks]
  )
  const color = resolveDeckColor(deck?.color)

  const [cards, setCards] = useState<Card[]>([])
  const [drafts, setDrafts] = useState<Record<string, CardDraft>>({})
  const [loading, setLoading] = useState(true)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [newFront, setNewFront] = useState('')
  const [newBack, setNewBack] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkInput, setBulkInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [showDeleteDeck, setShowDeleteDeck] = useState(false)
  const [deletingDeck, setDeletingDeck] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadCards = useCallback(async () => {
    setLoading(true)
    try {
      const next = await getCardsByDeck(deckId)
      if (!mountedRef.current) return
      setCards(next)
      setDrafts(
        Object.fromEntries(
          next.map((card) => [
            card.id,
            { front: card.front, back: card.back, mastered: card.mastered },
          ])
        )
      )
    } catch (error) {
      console.warn('Failed to load deck cards:', error)
      if (mountedRef.current) {
        setCards([])
        setDrafts({})
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [deckId])

  useEffect(() => {
    void loadCards()
  }, [loadCards])

  useEffect(() => {
    if (aiRefreshCounter > 0) void loadCards()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiRefreshCounter])

  const bulkPairs = useMemo(() => {
    if (!bulkInput.trim()) return []
    return bulkInput
      .split('\n')
      .map((line) => {
        const separator = line.indexOf(',')
        if (separator === -1) return null
        const front = line.slice(0, separator).trim()
        const back = line.slice(separator + 1).trim()
        return front && back ? { front, back } : null
      })
      .filter((pair): pair is { front: string; back: string } => pair !== null)
  }, [bulkInput])

  function updateDraft(id: string, patch: Partial<CardDraft>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }))
  }

  async function handleCreateCard() {
    if (!newFront.trim() || !newBack.trim()) return
    setPendingKey('create')
    try {
      await createCard({ deckId, front: newFront.trim(), back: newBack.trim() })
      setNewFront('')
      setNewBack('')
      await Promise.all([loadCards(), refreshDecks()])
      toastRef.current.push({ title: 'Card added', variant: 'success' })
    } catch (error) {
      toastRef.current.push({
        title: 'Could not add card',
        description: describeLearnError(error),
        variant: 'error',
      })
    } finally {
      setPendingKey(null)
    }
  }

  async function handleBulkCreate() {
    if (bulkPairs.length === 0) return
    setPendingKey('bulk')
    try {
      await createCards(deckId, bulkPairs)
      setBulkInput('')
      await Promise.all([loadCards(), refreshDecks()])
      toastRef.current.push({
        title: `${bulkPairs.length} cards imported`,
        variant: 'success',
      })
    } catch (error) {
      toastRef.current.push({
        title: 'Import failed',
        description: describeLearnError(error),
        variant: 'error',
      })
    } finally {
      setPendingKey(null)
    }
  }

  async function handleSaveCard(id: string) {
    const draft = drafts[id]
    if (!draft || !draft.front.trim() || !draft.back.trim()) return
    setPendingKey(`save:${id}`)
    try {
      await updateCard(id, {
        front: draft.front.trim(),
        back: draft.back.trim(),
        mastered: draft.mastered,
      })
      await Promise.all([loadCards(), refreshDecks()])
      toastRef.current.push({ title: 'Card saved', variant: 'success' })
    } catch (error) {
      toastRef.current.push({
        title: 'Could not save card',
        description: describeLearnError(error),
        variant: 'error',
      })
    } finally {
      setPendingKey(null)
    }
  }

  async function handleDeleteCard(id: string) {
    setPendingKey(`delete:${id}`)
    try {
      await deleteCard(id)
      await Promise.all([loadCards(), refreshDecks()])
    } catch (error) {
      toastRef.current.push({
        title: 'Could not delete card',
        description: describeLearnError(error),
        variant: 'error',
      })
    } finally {
      setPendingKey(null)
    }
  }

  async function handleDeleteDeck() {
    if (!deck || deletingDeck) return
    setDeletingDeck(true)
    try {
      await deleteDeck(deck.id)
      await refreshDecks()
      toastRef.current.push({
        title: 'Deck deleted',
        description: deck.title,
        variant: 'success',
      })
      setShowDeleteDeck(false)
      onBack()
    } catch (error) {
      toastRef.current.push({
        title: 'Could not delete deck',
        description: describeLearnError(error),
        variant: 'error',
      })
    } finally {
      setDeletingDeck(false)
    }
  }

  async function handlePdfUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !deck) return

    if (file.type !== 'application/pdf') {
      toastRef.current.push({
        title: 'Only PDF files are supported',
        variant: 'error',
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toastRef.current.push({
        title: 'File too large',
        description: 'Maximum size is 10 MiB.',
        variant: 'error',
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    setUploadStatus('Uploading PDF…')
    try {
      const document = await uploadDocument(file)
      setUploadStatus('Extracting text…')
      const extracted = await getDocumentText(document.id)
      const warning = checkTextQuality(extracted.text)
      if (warning) {
        toastRef.current.push({
          title: 'Limited PDF text',
          description: warning,
          variant: 'warning',
        })
      }
      setUploadStatus('Generating flashcards with AI…')
      const generated = await generateCardsFromDocument(extracted.text, {
        deckTitle: deck.title,
        maxCards: Math.max(
          10,
          Math.min(40, Math.ceil(extracted.text.length / 800))
        ),
        onProgress: (message) => setUploadStatus(message),
      })
      setUploadStatus(`Adding ${generated.length} cards…`)
      await createCards(deck.id, generated)
      await updateDocument(document.id, {
        status: 'processed',
        deckId: deck.id,
      })
      await Promise.all([loadCards(), refreshDecks()])
      toastRef.current.push({
        title: `${generated.length} AI cards added`,
        description: `Generated from ${file.name}`,
        variant: 'success',
      })
    } catch (error) {
      toastRef.current.push({
        title: 'PDF import failed',
        description: describeLearnError(error),
        variant: 'error',
      })
    } finally {
      if (mountedRef.current) {
        setUploading(false)
        setUploadStatus(null)
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!deck && !loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 text-center">
        <span className="glass flex h-12 w-12 items-center justify-center rounded-2xl text-muted">
          <BookOpen size={18} />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Deck not found
          </h2>
          <p className="mt-1 text-sm text-muted">
            This deck is unavailable or no longer belongs to you.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onBack}>
          Back to decks
        </Button>
      </div>
    )
  }

  const masteredCount = cards.filter((card) => card.mastered).length
  const mastery =
    cards.length > 0 ? Math.round((masteredCount / cards.length) * 100) : 0

  return (
    <div className="space-y-6 animate-rise-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft size={15} />
            Back to decks
          </button>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                color.soft,
                color.text
              )}
            >
              <BookOpen size={18} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">
                {deck?.title ?? 'Deck'}
              </h1>
              <p className="mt-0.5 text-sm text-muted">
                {deck?.description ||
                  'Add and maintain the cards used in this study session.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={Bot}
            onClick={() =>
              onOpenAssistant(
                `Help me improve the deck "${deck?.title ?? ''}" (id: ${deckId}).`
              )
            }
          >
            Ask AI
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={Trash2}
            onClick={() => setShowDeleteDeck(true)}
            className="text-danger hover:bg-danger-light hover:text-danger"
          >
            Delete
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={Zap}
            onClick={onStartStudy}
            disabled={cards.length === 0}
          >
            Study
          </Button>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4 text-xs text-muted">
            <span>
              <span className="font-semibold text-foreground">
                {cards.length}
              </span>{' '}
              cards
            </span>
            <span>
              <span className="font-semibold text-foreground">
                {masteredCount}
              </span>{' '}
              mastered
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 size={11} />
              {deck?.lastStudied
                ? `Studied ${formatRelativeDate(deck.lastStudied)}`
                : 'Not studied yet'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-muted">
            {mastery}% mastery
          </div>
        </div>
        <ProgressBar
          value={mastery}
          className="mt-3 h-1.5"
          barClassName={color.bar}
        />
      </div>

      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border border-border bg-surface-sunken p-0.5">
            <button
              type="button"
              onClick={() => setBulkMode(false)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                !bulkMode
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted hover:text-foreground'
              )}
            >
              <Plus size={12} />
              Single
            </button>
            <button
              type="button"
              onClick={() => setBulkMode(true)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                bulkMode
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted hover:text-foreground'
              )}
            >
              <List size={12} />
              Bulk CSV
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={(event) => void handlePdfUpload(event)}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Paperclip}
              loading={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Import PDF with AI
            </Button>
          </div>
        </div>

        {uploadStatus && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-accent/20 bg-accent-light px-3 py-2 text-xs font-medium text-accent">
            <Loader2 size={13} className="animate-spin" />
            {uploadStatus}
          </div>
        )}

        {!bulkMode ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              value={newFront}
              onChange={(event) => setNewFront(event.target.value)}
              placeholder="Front (question)"
              className="glass-input h-10 px-3 text-sm"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleCreateCard()
                }
              }}
            />
            <div className="flex gap-2">
              <input
                value={newBack}
                onChange={(event) => setNewBack(event.target.value)}
                placeholder="Back (answer)"
                className="glass-input h-10 flex-1 px-3 text-sm"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleCreateCard()
                  }
                }}
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={Plus}
                loading={pendingKey === 'create'}
                disabled={!newFront.trim() || !newBack.trim()}
                onClick={() => void handleCreateCard()}
              >
                Add
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <textarea
              value={bulkInput}
              onChange={(event) => setBulkInput(event.target.value)}
              rows={6}
              placeholder={'Front,Back\nCapital of France,Paris\nH2O,Water'}
              className="glass-input w-full resize-y px-3 py-2 text-sm leading-6"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted">
                One card per line as{' '}
                <span className="font-mono">Front,Back</span>. Detected:{' '}
                <span className="font-semibold text-foreground">
                  {bulkPairs.length}
                </span>
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={Sparkles}
                loading={pendingKey === 'bulk'}
                disabled={bulkPairs.length === 0}
                onClick={() => void handleBulkCreate()}
              >
                Import {bulkPairs.length || ''} cards
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-light text-accent">
              <FileText size={14} />
            </span>
            <h2 className="text-sm font-semibold text-foreground">Cards</h2>
          </div>
          <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
            {cards.length}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" />
            Loading cards…
          </div>
        ) : cards.length === 0 ? (
          <div className="px-6 pb-12 pt-4 text-center">
            <p className="text-sm font-medium text-foreground">
              No cards in this deck
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Add cards above, paste a CSV list, or import a PDF and let AI
              build the deck.
            </p>
          </div>
        ) : (
          <ul className="space-y-2 px-2 pb-3">
            {cards.map((card, index) => {
              const draft = drafts[card.id] ?? {
                front: card.front,
                back: card.back,
                mastered: card.mastered,
              }
              const dirty =
                draft.front !== card.front ||
                draft.back !== card.back ||
                draft.mastered !== card.mastered
              const dueLabel = card.dueDate
                ? `Due ${card.dueDate}`
                : 'Not scheduled'
              return (
                <li
                  key={card.id}
                  className="rounded-2xl border border-border bg-surface p-3"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-[10px] font-bold tabular-nums text-muted">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        value={draft.front}
                        onChange={(event) =>
                          updateDraft(card.id, { front: event.target.value })
                        }
                        placeholder="Front (question)"
                        className="glass-input h-9 w-full px-3 text-sm font-medium"
                      />
                      <textarea
                        value={draft.back}
                        onChange={(event) =>
                          updateDraft(card.id, { back: event.target.value })
                        }
                        placeholder="Back (answer)"
                        rows={2}
                        className="glass-input w-full resize-y px-3 py-2 text-sm leading-5"
                      />
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-medium">
                          <input
                            type="checkbox"
                            checked={draft.mastered}
                            onChange={(event) =>
                              updateDraft(card.id, {
                                mastered: event.target.checked,
                              })
                            }
                            className="h-3 w-3 accent-[var(--accent)]"
                          />
                          Mastered
                        </label>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                            card.mastered
                              ? 'bg-success-light text-success'
                              : 'bg-surface-hover'
                          )}
                        >
                          {card.mastered ? (
                            <Check size={9} />
                          ) : (
                            <Clock3 size={9} />
                          )}
                          {dueLabel}
                        </span>
                        <span>Ease {card.easeFactor.toFixed(2)}</span>
                        <span>
                          ✓ {card.correctCount} / ✗ {card.incorrectCount}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        icon={Save}
                        loading={pendingKey === `save:${card.id}`}
                        disabled={
                          !dirty || !draft.front.trim() || !draft.back.trim()
                        }
                        onClick={() => void handleSaveCard(card.id)}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        loading={pendingKey === `delete:${card.id}`}
                        onClick={() => void handleDeleteCard(card.id)}
                        className="text-danger hover:bg-danger-light hover:text-danger"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <BaseModal
        isOpen={showDeleteDeck}
        onClose={() => setShowDeleteDeck(false)}
        size="sm"
        animation="zoom"
        ariaLabel="Delete deck"
      >
        <ModalHeader
          onClose={() => setShowDeleteDeck(false)}
          closeAriaLabel="Close delete deck"
        >
          <ModalTitle>Delete deck?</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm leading-6 text-muted">
            <span className="font-semibold text-foreground">{deck?.title}</span>{' '}
            and all {cards.length} card
            {cards.length === 1 ? '' : 's'} will be permanently deleted. This
            cannot be undone.
          </p>
        </ModalBody>
        <ModalFooter>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteDeck(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={deletingDeck}
              onClick={() => void handleDeleteDeck()}
            >
              Delete deck
            </Button>
          </div>
        </ModalFooter>
      </BaseModal>
    </div>
  )
}
