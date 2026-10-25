'use client'

/**
 * The suggestion card for a grammar issue.
 *
 * Rendered next to (never inside) the editor, anchored to the flagged text.
 * The host keeps the state; this component only positions itself within the
 * viewport and reports button presses.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SpellCheck, X } from 'lucide-react'
import type {
  GrammarPopoverState,
  GrammarSuggestion,
} from '@/lib/editor/grammar/useGrammarCheck'

interface GrammarPopoverProps {
  state: GrammarPopoverState | null
  onApply: (suggestion: GrammarSuggestion) => void
  onIgnore: () => void
  onAddWord: () => void
  onDismiss: () => void
}

const VIEWPORT_MARGIN = 8
const ANCHOR_GAP = 8

/** Dictionary entries have to be single words — Harper splits on whitespace. */
const SINGLE_WORD_PATTERN = /^[A-Za-z][A-Za-z'-]*$/

export default function GrammarPopover({
  state,
  onApply,
  onIgnore,
  onAddWord,
  onDismiss,
}: GrammarPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  // Clamp into the viewport once the real size is known; flip above the text
  // when there is no room below (layout effect → no visible jump).
  useLayoutEffect(() => {
    if (!state) {
      setPosition(null)
      return
    }

    const element = containerRef.current
    if (!element) return

    const rect = element.getBoundingClientRect()

    let top = state.anchorBottom + ANCHOR_GAP
    if (top + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
      const above = state.anchorTop - ANCHOR_GAP - rect.height
      top =
        above >= VIEWPORT_MARGIN
          ? above
          : Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN)
    }

    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(state.anchorLeft, window.innerWidth - rect.width - VIEWPORT_MARGIN)
    )

    setPosition({ top, left })
  }, [state])

  useEffect(() => {
    if (!state) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onDismiss()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [state, onDismiss])

  if (!state) return null

  const { issue } = state

  return (
    <div
      ref={containerRef}
      data-grammar-popover="true"
      role="dialog"
      aria-label="Grammar suggestion"
      className="floating-pop-in glass-strong fixed z-50 w-[320px] max-w-[85vw] rounded-2xl p-3"
      style={{
        top: `${position ? position.top : state.anchorBottom + ANCHOR_GAP}px`,
        left: `${position ? position.left : state.anchorLeft}px`,
        visibility: position ? 'visible' : 'hidden',
      }}
      onMouseDown={(event) => {
        // Keep the editor focused and the selection intact.
        event.preventDefault()
      }}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
          <SpellCheck size={14} />
        </div>

        <div className="min-w-0 flex-1">
          {issue.kind ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              {issue.kind}
            </p>
          ) : null}
          <p className="mt-0.5 break-words text-[13px] leading-5 text-foreground">
            {issue.message || `Possible issue with “${issue.text}”`}
          </p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="focus-ring -mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {issue.suggestions.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {issue.suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.kind}:${suggestion.replacement}:${index}`}
              type="button"
              onClick={() => onApply(suggestion)}
              className={
                index === 0
                  ? 'focus-ring rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-strong'
                  : 'focus-ring rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-active'
              }
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
        <span className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
          Harper · on-device
        </span>
        <div className="flex items-center gap-0.5">
          {issue.kind === 'Spelling' && SINGLE_WORD_PATTERN.test(issue.text.trim()) ? (
            <button
              type="button"
              onClick={onAddWord}
              className="focus-ring rounded-full px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              title="Add this word to the dictionary (applies to all notes)"
            >
              Add word
            </button>
          ) : null}
          <button
            type="button"
            onClick={onIgnore}
            className="focus-ring rounded-full px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            title="Never suggest this here again"
          >
            Ignore
          </button>
        </div>
      </div>
    </div>
  )
}
