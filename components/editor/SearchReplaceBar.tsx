'use client'

import { memo, useEffect, useRef } from 'react'
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Replace,
  ReplaceAll,
  Search,
  WholeWord,
  X,
} from 'lucide-react'

interface SearchReplaceBarProps {
  searchQuery: string
  replaceQuery: string
  caseSensitive: boolean
  wholeWord: boolean
  matchesCount: number
  currentMatchIndex: number
  /** True when the match limit was hit — the count is then shown as "1000+". */
  capped?: boolean
  /** Bumped by the owner to (re)focus and select the search field (Cmd/Ctrl+F while open). */
  focusSignal?: number
  onClose: () => void
  onSearchQueryChange: (value: string) => void
  onReplaceQueryChange: (value: string) => void
  onCaseSensitiveChange: (value: boolean) => void
  onWholeWordChange: (value: boolean) => void
  onNext: () => void
  onPrevious: () => void
  onReplace: () => void
  onReplaceAll: () => void
}

const TOGGLE_BASE =
  'inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors focus-ring disabled:pointer-events-none disabled:opacity-40'

const toggleClass = (active: boolean) =>
  [
    TOGGLE_BASE,
    active
      ? 'bg-accent-light text-accent'
      : 'text-muted hover:bg-surface-hover hover:text-foreground',
  ].join(' ')

const FIELD =
  'focus-ring h-8 rounded-full border border-border bg-surface text-[13px] text-foreground placeholder:text-muted transition-colors focus:border-accent'

/**
 * Non-modal find & replace bar.
 *
 * Deliberately not a dialog: the document stays fully visible and editable
 * while searching, matches are highlighted in place and the keyboard never
 * leaves the note (Enter / Shift+Enter walk the matches).
 */
const SearchReplaceBar = memo<SearchReplaceBarProps>(
  ({
    searchQuery,
    replaceQuery,
    caseSensitive,
    wholeWord,
    matchesCount,
    currentMatchIndex,
    capped = false,
    focusSignal = 0,
    onClose,
    onSearchQueryChange,
    onReplaceQueryChange,
    onCaseSensitiveChange,
    onWholeWordChange,
    onNext,
    onPrevious,
    onReplace,
    onReplaceAll,
  }) => {
    const searchInputRef = useRef<HTMLInputElement>(null)
    const replaceInputRef = useRef<HTMLInputElement>(null)

    // Opening (or Cmd/Ctrl+F while open) focuses and selects the query.
    useEffect(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }, [focusSignal])

    // Escape closes the bar from anywhere — focus often lives on a button that
    // just became disabled (Replace All) or outside the bar entirely.
    useEffect(() => {
      const handleDocumentKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        onClose()
      }

      document.addEventListener('keydown', handleDocumentKeyDown)
      return () => document.removeEventListener('keydown', handleDocumentKeyDown)
    }, [onClose])

    // Clicking a button moves focus to it; keep the keyboard workflow intact
    // (Enter in the replace field repeats "Replace").
    const handleReplace = () => {
      onReplace()
      replaceInputRef.current?.focus()
    }

    const handleReplaceAll = () => {
      onReplaceAll()
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        if (event.target === replaceInputRef.current) {
          onReplace()
        } else if (event.shiftKey) {
          onPrevious()
        } else {
          onNext()
        }
      }
    }

    const hasQuery = searchQuery.length > 0
    const hasMatches = matchesCount > 0
    const counter = !hasQuery
      ? ''
      : hasMatches
        ? `${currentMatchIndex + 1}/${capped ? `${matchesCount}+` : matchesCount}`
        : 'No results'

    return (
      <div
        role="search"
        aria-label="Find and replace"
        className="floating-pop-in glass-strong fixed inset-x-0 z-50 mx-auto flex w-[min(460px,calc(100vw_-_24px))] flex-col gap-1.5 rounded-2xl p-2.5"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 64px)' }}
        onKeyDown={handleKeyDown}
      >
        {/* Find row */}
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Find in note…"
              aria-label="Search text"
              spellCheck={false}
              autoComplete="off"
              className={`${FIELD} w-full pl-7 pr-2`}
            />
          </div>

          <span
            aria-live="polite"
            className={`min-w-[54px] text-right text-[11px] font-medium tabular-nums ${
              hasQuery && !hasMatches ? 'text-danger' : 'text-muted'
            }`}
          >
            {counter}
          </span>

          <button
            type="button"
            className={toggleClass(caseSensitive)}
            aria-pressed={caseSensitive}
            title="Match case"
            aria-label="Match case"
            onClick={() => onCaseSensitiveChange(!caseSensitive)}
          >
            <CaseSensitive size={15} />
          </button>

          <button
            type="button"
            className={toggleClass(wholeWord)}
            aria-pressed={wholeWord}
            title="Match whole word"
            aria-label="Match whole word"
            onClick={() => onWholeWordChange(!wholeWord)}
          >
            <WholeWord size={15} />
          </button>

          <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />

          <button
            type="button"
            className={toggleClass(false)}
            title="Previous match (Shift+Enter)"
            aria-label="Previous match"
            disabled={!hasMatches}
            onClick={onPrevious}
          >
            <ChevronUp size={16} />
          </button>

          <button
            type="button"
            className={toggleClass(false)}
            title="Next match (Enter)"
            aria-label="Next match"
            disabled={!hasMatches}
            onClick={onNext}
          >
            <ChevronDown size={16} />
          </button>

          <button
            type="button"
            className={toggleClass(false)}
            title="Close (Escape)"
            aria-label="Close find and replace"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        {/* Replace row */}
        <div className="flex items-center gap-1">
          <input
            ref={replaceInputRef}
            type="text"
            value={replaceQuery}
            onChange={(event) => onReplaceQueryChange(event.target.value)}
            placeholder="Replace with…"
            aria-label="Replacement text"
            spellCheck={false}
            autoComplete="off"
            className={`${FIELD} min-w-0 flex-1 px-3`}
          />

          <button
            type="button"
            disabled={!hasMatches}
            onClick={handleReplace}
            title="Replace this match (Enter in the field above)"
            className="focus-ring inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-40"
          >
            <Replace size={12} />
            Replace
          </button>

          <button
            type="button"
            disabled={!hasMatches}
            onClick={handleReplaceAll}
            title="Replace all matches"
            className="focus-ring inline-flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-[11px] font-semibold text-accent-foreground transition-colors hover:bg-accent-strong disabled:pointer-events-none disabled:opacity-40"
          >
            <ReplaceAll size={12} />
            All
          </button>
        </div>
      </div>
    )
  }
)

SearchReplaceBar.displayName = 'SearchReplaceBar'

export default SearchReplaceBar
