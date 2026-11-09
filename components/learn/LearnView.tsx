'use client'

import { useMemo, useState } from 'react'
import {
  BookOpen,
  Flame,
  GraduationCap,
  LayoutDashboard,
  Settings2,
  Target,
  TrendingUp,
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
import { deleteDeck, updateDeck } from '@/lib/learn/decks'
import { useLearning } from '@/lib/learn/context'
import type { Deck } from '@/lib/learn/types'
import { describeLearnError } from '@/lib/learn/db'
import { DECK_COLORS, cn, resolveDeckColor } from '@/lib/learn/utils'
import { DecksView } from './DecksView'
import { DeckEditor } from './DeckEditor'
import { LearnDetailsPanel } from './LearnDetailsPanel'
import { LearnDashboard } from './LearnDashboard'
import { LearnProgress } from './LearnProgress'
import { LearnSettings } from './LearnSettings'
import { StudySession } from './StudySession'

const TABS: Array<{
  id: 'dashboard' | 'decks' | 'progress' | 'settings'
  label: string
  icon: typeof LayoutDashboard
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'decks', label: 'Decks', icon: BookOpen },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'settings', label: 'Settings', icon: Settings2 },
]

export default function LearnView({
  onOpenAppSettings,
  showSectionTabs = true,
  detailsOpen = true,
}: {
  onOpenAppSettings: () => void
  /** Hidden on desktop while the Learn library panel owns navigation. */
  showSectionTabs?: boolean
  /** Right-hand details panel (desktop xl+). */
  detailsOpen?: boolean
}) {
  return (
    <LearnShell
      onOpenAppSettings={onOpenAppSettings}
      showSectionTabs={showSectionTabs}
      detailsOpen={detailsOpen}
    />
  )
}

function LearnShell({
  onOpenAppSettings,
  showSectionTabs,
  detailsOpen,
}: {
  onOpenAppSettings: () => void
  showSectionTabs: boolean
  detailsOpen: boolean
}) {
  const {
    stats,
    decks,
    refreshDecks,
    isLoadingStats,
    isLoadingDecks,
    screen,
    setScreen,
    requestCreateDeck,
  } = useLearning()
  const toast = useToast()
  const [pendingDeleteDeck, setPendingDeleteDeck] = useState<string | null>(
    null
  )
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null)
  const [deletingDeck, setDeletingDeck] = useState(false)

  const activeTab =
    screen.kind === 'deck' || screen.kind === 'study' ? 'decks' : screen.kind

  const pendingDeck = useMemo(
    () =>
      pendingDeleteDeck
        ? decks.find((deck) => deck.id === pendingDeleteDeck)
        : undefined,
    [decks, pendingDeleteDeck]
  )

  async function handleDeleteDeck() {
    if (!pendingDeck || deletingDeck) return
    setDeletingDeck(true)
    try {
      await deleteDeck(pendingDeck.id)
      await refreshDecks()
      toast.push({
        title: 'Deck deleted',
        description: pendingDeck.title,
        variant: 'success',
      })
      setPendingDeleteDeck(null)
      if (
        (screen.kind === 'deck' || screen.kind === 'study') &&
        screen.deckId === pendingDeck.id
      ) {
        setScreen({ kind: 'decks' })
      }
    } catch (error) {
      toast.push({
        title: 'Could not delete deck',
        description: describeLearnError(error),
        variant: 'error',
      })
    } finally {
      setDeletingDeck(false)
    }
  }

  const dailyPercent =
    stats && stats.dailyGoal > 0
      ? Math.min(
          100,
          Math.round((stats.dailyCardsReviewed / stats.dailyGoal) * 100)
        )
      : 0

  return (
    <>
      <div className="flex h-full min-h-0">
        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-12">
            <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-gradient text-accent-foreground shadow-glow-sm">
                  <GraduationCap size={21} />
                </span>
                <div>
                  <h1 className="font-display text-xl font-semibold tracking-[-0.02em] text-foreground">
                    Learn
                  </h1>
                  <p className="text-xs text-muted">
                    Flashcards and spaced repetition
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {stats ? (
                  <>
                    <StatChip
                      icon={Zap}
                      label={`Level ${stats.level}`}
                      tone="accent"
                    />
                    <StatChip
                      icon={Flame}
                      label={`${stats.streak}-day streak`}
                      tone="warning"
                    />
                    <StatChip
                      icon={Target}
                      label={`${stats.dailyCardsReviewed}/${stats.dailyGoal} today`}
                      tone={stats.dailyGoalMet ? 'success' : 'default'}
                      hint={`${dailyPercent}%`}
                    />
                    <button
                      type="button"
                      onClick={() => setScreen({ kind: 'progress' })}
                      className="rounded-full border border-accent/20 bg-accent-light px-3 py-1.5 text-xs font-bold text-accent transition-opacity hover:opacity-80"
                    >
                      {stats.xp.toLocaleString()} XP
                    </button>
                  </>
                ) : (
                  <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted">
                    {isLoadingStats || isLoadingDecks
                      ? 'Loading Learn…'
                      : 'Ready to learn'}
                  </span>
                )}
              </div>
            </header>

            <nav
              aria-label="Learn sections"
              className={cn(
                'glass-card mb-5 flex flex-wrap items-center gap-1 p-1.5',
                showSectionTabs ? 'flex' : 'lg:hidden'
              )}
            >
              {TABS.map((tab) => {
                const Icon = tab.icon
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      if (tab.id === 'dashboard')
                        setScreen({ kind: 'dashboard' })
                      else if (tab.id === 'decks') setScreen({ kind: 'decks' })
                      else if (tab.id === 'progress')
                        setScreen({ kind: 'progress' })
                      else setScreen({ kind: 'settings' })
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors focus-ring',
                      active
                        ? 'bg-accent text-accent-foreground shadow-glow-sm'
                        : 'text-muted hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                )
              })}
            </nav>

            {screen.kind === 'dashboard' && (
              <LearnDashboard
                onOpenDecks={() => setScreen({ kind: 'decks' })}
                onOpenDeck={(deckId) => setScreen({ kind: 'deck', deckId })}
                onStartStudy={(deckId) => setScreen({ kind: 'study', deckId })}
                onCreateDeck={requestCreateDeck}
                onDeleteDeck={(deckId) => setPendingDeleteDeck(deckId)}
                onEditDeck={(deck) => setEditingDeck(deck)}
                onOpenProgress={() => setScreen({ kind: 'progress' })}
                onOpenSettings={() => setScreen({ kind: 'settings' })}
              />
            )}

            {screen.kind === 'decks' && (
              <DecksView
                onOpenDeck={(deckId) => setScreen({ kind: 'deck', deckId })}
                onStartStudy={(deckId) => setScreen({ kind: 'study', deckId })}
                onEditDeck={(deck) => setEditingDeck(deck)}
              />
            )}

            {screen.kind === 'deck' && (
              <DeckEditor
                deckId={screen.deckId}
                onBack={() => setScreen({ kind: 'decks' })}
                onStartStudy={() =>
                  setScreen({ kind: 'study', deckId: screen.deckId })
                }
              />
            )}

            {screen.kind === 'study' && (
              <StudySession
                key={`${screen.deckId}:${screen.mode ?? 'picker'}`}
                deckId={screen.deckId}
                initialMode={screen.mode ?? null}
                onBackToDeck={() =>
                  setScreen({ kind: 'deck', deckId: screen.deckId })
                }
              />
            )}

            {screen.kind === 'progress' && <LearnProgress />}

            {screen.kind === 'settings' && (
              <LearnSettings onOpenAppSettings={onOpenAppSettings} />
            )}
          </div>
        </div>
        {detailsOpen && <LearnDetailsPanel />}
      </div>

      {editingDeck && (
        <EditDeckModal
          key={editingDeck.id}
          deck={editingDeck}
          onClose={() => setEditingDeck(null)}
          onSaved={async () => {
            await refreshDecks()
            setEditingDeck(null)
          }}
        />
      )}

      <BaseModal
        isOpen={pendingDeleteDeck !== null}
        onClose={() => setPendingDeleteDeck(null)}
        size="sm"
        animation="zoom"
        ariaLabel="Delete deck"
      >
        <ModalHeader
          onClose={() => setPendingDeleteDeck(null)}
          closeAriaLabel="Close delete deck"
        >
          <ModalTitle>Delete deck?</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm leading-6 text-muted">
            <span className="font-semibold text-foreground">
              {pendingDeck?.title}
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
              onClick={() => setPendingDeleteDeck(null)}
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
    </>
  )
}

function StatChip({
  icon: Icon,
  label,
  tone,
  hint,
}: {
  icon: typeof Zap
  label: string
  tone: 'accent' | 'warning' | 'success' | 'default'
  hint?: string
}) {
  const tones = {
    accent: 'border-accent/20 bg-accent-light text-accent',
    warning: 'border-warning/20 bg-warning-light text-warning',
    success: 'border-success/20 bg-success-light text-success',
    default: 'border-border bg-surface text-muted',
  } as const

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold',
        tones[tone]
      )}
    >
      <Icon size={12} />
      {label}
      {hint && <span className="opacity-70">{hint}</span>}
    </span>
  )
}

function EditDeckModal({
  deck,
  onClose,
  onSaved,
}: {
  deck: Deck
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const toast = useToast()
  const [title, setTitle] = useState(deck.title)
  const [description, setDescription] = useState(deck.description ?? '')
  const [color, setColor] = useState(resolveDeckColor(deck.color).value)
  const [saving, setSaving] = useState(false)

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      await updateDeck(deck.id, {
        title: title.trim(),
        description: description.trim() || null,
        color,
      })
      toast.push({ title: 'Deck updated', variant: 'success' })
      await onSaved()
    } catch (error) {
      toast.push({
        title: 'Could not update deck',
        description: describeLearnError(error),
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      size="md"
      animation="zoom"
      ariaLabel="Edit deck"
    >
      <ModalHeader onClose={onClose} closeAriaLabel="Close edit deck">
        <div>
          <ModalTitle>Edit deck</ModalTitle>
          <p className="mt-1 text-sm text-muted">
            Update the title, description or accent colour.
          </p>
        </div>
      </ModalHeader>
      <form onSubmit={handleSave}>
        <ModalBody className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Title
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="glass-input h-10 w-full px-3.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="glass-input w-full resize-y px-3.5 py-2.5 text-sm leading-6"
            />
          </label>
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
              onClick={onClose}
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
              Save deck
            </Button>
          </div>
        </ModalFooter>
      </form>
    </BaseModal>
  )
}
