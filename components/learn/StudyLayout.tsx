'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Clock3, Flame, Keyboard, X, Zap } from 'lucide-react'
import { cn, formatSeconds } from '@/lib/learn/utils'

interface StudyLayoutProps {
  title: string
  subtitle?: string
  currentIndex: number
  totalCards: number
  streakCount?: number
  children: ReactNode
  onExit: () => void
  rightElement?: ReactNode
  showTimer?: boolean
  timerSeconds?: number
  phaseIndicator?: ReactNode
  animateCard?: boolean
}

export function StudyLayout({
  title,
  subtitle,
  currentIndex,
  totalCards,
  streakCount = 0,
  children,
  onExit,
  rightElement,
  showTimer = true,
  timerSeconds: externalTimer,
  phaseIndicator,
  animateCard = true,
}: StudyLayoutProps) {
  const [timer, setTimer] = useState(0)
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    if (externalTimer !== undefined || !showTimer) return
    const id = window.setInterval(() => setTimer((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(id)
  }, [showTimer, externalTimer])

  const displayTimer = externalTimer ?? timer

  const remaining = Math.max(0, totalCards - currentIndex)

  return (
    <div className={cn('mx-auto w-full max-w-2xl space-y-6 animate-rise-in', animateCard && 'pb-10')}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-base font-semibold text-foreground">{title}</h1>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span>
              Card {Math.min(currentIndex + 1, totalCards)} of {totalCards}
            </span>
            {remaining > 0 && (
              <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-muted">
                {remaining} left
              </span>
            )}
            {subtitle && <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">{subtitle}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {streakCount >= 3 && (
            <div className="hidden items-center gap-1 rounded-full border border-warning/20 bg-warning-light px-2.5 py-1 text-xs font-bold text-warning sm:flex">
              <Flame size={12} />
              {streakCount}
            </div>
          )}
          {showTimer && (
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface-hover px-2.5 py-1 text-xs font-medium tabular-nums text-muted">
              <Clock3 size={12} />
              {formatSeconds(displayTimer)}
            </div>
          )}
          {rightElement}
          <button
            type="button"
            onClick={onExit}
            className="focus-ring rounded-xl p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            title="Exit session (Esc)"
            aria-label="Exit study session"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-1">
          {Array.from({ length: Math.min(totalCards, 30) }).map((_, index) => (
            <div
              key={index}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-all duration-500',
                index < currentIndex
                  ? 'bg-gradient-to-r from-accent to-success'
                  : index === currentIndex
                    ? 'animate-pulse bg-accent/30'
                    : 'bg-surface-sunken',
              )}
            />
          ))}
          {totalCards > 30 && <div className="ml-1 self-center text-[10px] text-muted">+{totalCards - 30}</div>}
        </div>
        {phaseIndicator}
      </div>

      <div className={cn(animateCard && 'animate-rise-in')}>{children}</div>

      <button
        type="button"
        onClick={() => setShowShortcuts((open) => !open)}
        className="glass fixed bottom-[calc(var(--mobile-bar-height,60px)+1rem)] right-4 z-30 rounded-xl p-2 text-muted shadow-glass-sm transition-colors hover:text-foreground md:bottom-4"
        title="Keyboard shortcuts"
        aria-label="Show keyboard shortcuts"
      >
        <Keyboard size={16} />
      </button>

      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowShortcuts(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setShowShortcuts(false)
          }}
          role="button"
          aria-label="Close overlay"
          tabIndex={-1}
        >
          <div
            className="glass-card w-full max-w-sm space-y-4 p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-foreground">Keyboard shortcuts</h3>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover"
                aria-label="Close shortcuts"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1 text-sm">
              <ShortcutItem keys={['Space']} action="Flip card / reveal answer" />
              <ShortcutItem keys={['1']} action="Rate: Again / Wrong" />
              <ShortcutItem keys={['2']} action="Rate: Hard / Still learning" />
              <ShortcutItem keys={['3']} action="Rate: Good / Know it" />
              <ShortcutItem keys={['4']} action="Rate: Easy" />
              <ShortcutItem keys={['A', 'B', 'C', 'D']} action="Select a multiple-choice option" />
              <ShortcutItem keys={['Enter']} action="Submit answer / next card" />
              <ShortcutItem keys={['←']} action="Previous card" />
              <ShortcutItem keys={['Esc']} action="Exit session" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ShortcutItem({ keys, action }: { keys: string[]; action: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
      <span className="text-xs text-muted">{action}</span>
      <div className="flex gap-1">
        {keys.map((key) => (
          <kbd key={key} className="kbd text-[10px]">
            {key}
          </kbd>
        ))}
      </div>
    </div>
  )
}

export function QuestionCard({ children, label = 'Question' }: { children: ReactNode; label?: string }) {
  return (
    <div className="glass-card relative flex min-h-[180px] flex-col items-center justify-center gap-4 overflow-hidden p-8 text-center sm:p-10">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/80">{label}</span>
      <div className="font-display text-xl font-semibold leading-relaxed text-foreground sm:text-2xl">
        {children}
      </div>
    </div>
  )
}

export function OptionButton({
  label,
  text,
  state = 'default',
  onClick,
  disabled = false,
}: {
  label: string
  text: string
  state?: 'default' | 'correct' | 'wrong' | 'neutral'
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex w-full items-center gap-4 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition-all duration-200 focus-ring sm:px-5 sm:py-4',
        state === 'default' &&
          'border-border bg-surface hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent-light/40 hover:shadow-glass-sm',
        state === 'correct' && 'border-success/40 bg-success-light text-success',
        state === 'wrong' && 'border-danger/40 bg-danger-light text-danger',
        state === 'neutral' && 'border-border/60 bg-surface text-muted',
        disabled && state === 'default' && 'cursor-not-allowed opacity-40',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-bold transition-all',
          state === 'default' && 'border-border text-muted group-hover:border-accent/30 group-hover:text-accent',
          state === 'correct' && 'border-success/30 bg-success/10 text-success',
          state === 'wrong' && 'border-danger/30 bg-danger/10 text-danger',
          state === 'neutral' && 'border-border/50 text-muted',
        )}
      >
        {label}
      </span>
      <span className="flex-1">{text}</span>
      {state === 'correct' && <span className="text-[10px] font-bold text-success">✓ Correct</span>}
      {state === 'wrong' && <span className="text-[10px] font-bold text-danger">✗ Wrong</span>}
    </button>
  )
}

export function FeedbackBanner({ correct, correctAnswer }: { correct: boolean; correctAnswer?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3.5 animate-rise-in',
        correct ? 'border-success/30 bg-success-light' : 'border-danger/30 bg-danger-light',
      )}
    >
      {correct ? (
        <Zap size={18} className="mt-0.5 shrink-0 text-success" />
      ) : (
        <Flame size={18} className="mt-0.5 shrink-0 text-danger" />
      )}
      <div>
        <p className={cn('text-sm font-bold', correct ? 'text-success' : 'text-danger')}>
          {correct ? 'Correct!' : 'Not quite'}
        </p>
        {!correct && correctAnswer && (
          <p className="mt-0.5 text-xs text-muted">
            Correct answer: <span className="font-semibold text-foreground">{correctAnswer}</span>
          </p>
        )}
      </div>
    </div>
  )
}

export function ActionButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  className,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 focus-ring disabled:opacity-40',
        variant === 'primary' && 'glass-btn-primary text-accent-foreground shadow-glow-sm hover:-translate-y-0.5',
        variant === 'secondary' && 'glass-btn text-foreground',
        variant === 'danger' && 'border border-danger/30 bg-danger-light text-danger hover:bg-danger hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  )
}

