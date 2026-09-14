'use client'

/**
 * Grammar checking for a contentEditable editor.
 *
 * Responsibilities:
 *  - schedule Harper passes after the user stops typing (debounced), linting
 *    only the blocks that actually changed,
 *  - paint issues as squiggles through the CSS Custom Highlight API (the DOM is
 *    never mutated — see `./highlight.ts`),
 *  - resolve clicks on a squiggle to the issue underneath and expose the
 *    popover state,
 *  - apply/ignore fixes, with host callbacks for history + change emission.
 *
 * The editor keeps ownership of persistence: `onBeforeApply` snapshots history
 * and `onAfterApply` normalises + emits the change, exactly like the other
 * explicit commands in the editor.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Lint } from 'harper.js'
import {
  applyGrammarHighlights,
  clearGrammarHighlights,
} from './highlight'
import {
  addWordToDictionary,
  getGrammarLinter,
  ignoreLintPersistently,
  isGrammarEngineUnavailable,
  isNonEnglishText,
  lintPlainText,
  preloadGrammarEngine,
} from './engine'
import {
  applyReplacementAtOffsets,
  collectLintUnits,
  collectUnitText,
  offsetForNodePosition,
  rangeForOffsets,
  resolveDirtyTarget,
  type UnitText,
} from './units'

/** `off` disables the checker; anything else (or unset) leaves it enabled. */
export const GRAMMAR_ENABLED_STORAGE_KEY = 'notesdesktop:grammar-check-enabled'

/** Wait for a typing pause before linting. */
const LINT_DEBOUNCE_MS = 700
/** Re-lint quickly right after a fix has been applied. */
const RELINT_AFTER_FIX_MS = 150
/** First pass after a note is opened. */
const INITIAL_LINT_MS = 500
/** Longer batches than this are split so the worker stays responsive. */
const BATCH_CHAR_LIMIT = 24_000
const BATCH_SEPARATOR = '\n\n'
const MAX_SUGGESTIONS = 4

/** Harper's `SuggestionKind` values. */
const SUGGESTION_REMOVE = 1
const SUGGESTION_INSERT_AFTER = 2

export interface GrammarSuggestion {
  /** Harper's suggestion kind (0 = replace, 1 = remove, 2 = insert after). */
  kind: number
  replacement: string
  /** Ready-to-render button label. */
  label: string
}

export interface GrammarIssue {
  /** The linted block (list item, paragraph, …). */
  unit: HTMLElement
  /** Start offset in the unit's flattened text. */
  start: number
  /** End offset (exclusive) in the unit's flattened text. */
  end: number
  /** The flagged text. */
  text: string
  message: string
  /** Human-readable category, e.g. "Spelling". */
  kind: string
  suggestions: GrammarSuggestion[]
  /** The exact string passed to Harper (required to ignore the lint). */
  sourceText: string
  /** Harper's lint handle. */
  raw: Lint
}

export interface GrammarPopoverState {
  issue: GrammarIssue
  /** Viewport rectangles of the flagged text (popover anchors to these). */
  anchorTop: number
  anchorBottom: number
  anchorLeft: number
}

export interface UseGrammarCheckOptions {
  editorRef: RefObject<HTMLDivElement | null>
  enabled: boolean
  /** Runs immediately before the DOM is mutated (history snapshot). */
  onBeforeApply?: () => void
  /** Runs after the DOM was mutated (normalise + emit change). */
  onAfterApply?: () => void
}

export function readGrammarEnabledPreference(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(GRAMMAR_ENABLED_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function writeGrammarEnabledPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(GRAMMAR_ENABLED_STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    /* storage unavailable — preference stays session-only */
  }
}

interface LintUnitResult {
  /** The exact unit text that was linted (used to detect stale results). */
  text: string
  issues: GrammarIssue[]
}

export function useGrammarCheck({
  editorRef,
  enabled,
  onBeforeApply,
  onAfterApply,
}: UseGrammarCheckOptions) {
  const [issueCount, setIssueCount] = useState(0)
  const [available, setAvailable] = useState(true)
  const [popover, setPopover] = useState<GrammarPopoverState | null>(null)

  const issuesRef = useRef<GrammarIssue[]>([])
  const popoverRef = useRef<GrammarPopoverState | null>(null)
  const onBeforeApplyRef = useRef(onBeforeApply)
  const onAfterApplyRef = useRef(onAfterApply)
  const relintUnitRef = useRef<((unit: HTMLElement) => void) | null>(null)
  const relintAllRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    onBeforeApplyRef.current = onBeforeApply
  }, [onBeforeApply])

  useEffect(() => {
    onAfterApplyRef.current = onAfterApply
  }, [onAfterApply])

  const paint = useCallback(() => {
    const ranges: Range[] = []

    for (const issue of issuesRef.current) {
      if (!issue.unit.isConnected) continue
      const range = rangeForOffsets(collectUnitText(issue.unit), issue.start, issue.end)
      if (range) ranges.push(range)
    }

    let active: Range | null = null
    const activeIssue = popoverRef.current?.issue
    if (activeIssue && activeIssue.unit.isConnected) {
      active = rangeForOffsets(collectUnitText(activeIssue.unit), activeIssue.start, activeIssue.end)
    }

    applyGrammarHighlights(ranges, active)
  }, [])

  const replaceIssues = useCallback(
    (updater: (issues: GrammarIssue[]) => GrammarIssue[]) => {
      issuesRef.current = updater(issuesRef.current)
      setIssueCount(issuesRef.current.length)
      paint()
    },
    [paint]
  )

  const hidePopover = useCallback(() => {
    if (!popoverRef.current) return
    popoverRef.current = null
    setPopover(null)
    paint()
  }, [paint])

  // ── Scheduling ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      clearGrammarHighlights()
      issuesRef.current = []
      popoverRef.current = null
      setPopover(null)
      setIssueCount(0)
      relintUnitRef.current = null
      relintAllRef.current = null
      return
    }

    const editor = editorRef.current
    if (!editor) return

    let disposed = false
    let timer: number | null = null
    let dirtyAll = true
    const dirty = new Set<HTMLElement>()
    let chain: Promise<void> = Promise.resolve()

    const schedule = (delay: number) => {
      if (disposed) return
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        chain = chain.then(run).catch((error) => {
          console.error('[grammar] Lint pass failed:', error)
        })
      }, delay)
    }

    const run = async (): Promise<void> => {
      if (disposed || isGrammarEngineUnavailable()) {
        if (isGrammarEngineUnavailable()) setAvailable(false)
        return
      }

      const targets = dirtyAll ? collectLintUnits(editor) : Array.from(dirty)
      dirtyAll = false
      dirty.clear()

      if (targets.length === 0) return

      const linter = await getGrammarLinter()
      if (disposed) return
      if (!linter) {
        setAvailable(false)
        return
      }

      const results = await lintUnits(targets)
      if (disposed || results.size === 0) return

      // Blocks edited while the worker was busy: drop their results and line
      // them up for the next pass instead of mapping stale offsets.
      const resultEntries = Array.from(results.entries())
      for (let i = 0; i < resultEntries.length; i += 1) {
        const unit = resultEntries[i][0]
        const result = resultEntries[i][1]
        if (!unit.isConnected || collectUnitText(unit).text !== result.text) {
          dirty.add(unit)
        }
      }

      const merged = issuesRef.current.filter(
        (issue) => !results.has(issue.unit) && issue.unit.isConnected && editor.contains(issue.unit)
      )

      for (let i = 0; i < resultEntries.length; i += 1) {
        const unit = resultEntries[i][0]
        if (dirty.has(unit)) continue
        const issues = resultEntries[i][1].issues
        for (let j = 0; j < issues.length; j += 1) merged.push(issues[j])
      }

      // Any popover anchored to a re-linted block is now stale.
      const active = popoverRef.current?.issue
      if (active && results.has(active.unit)) hidePopover()

      replaceIssues(() => merged)

      if (dirty.size > 0) schedule(RELINT_AFTER_FIX_MS)
    }

    relintUnitRef.current = (unit: HTMLElement) => {
      dirty.add(unit)
      schedule(RELINT_AFTER_FIX_MS)
    }
    relintAllRef.current = () => {
      dirtyAll = true
      dirty.clear()
      schedule(RELINT_AFTER_FIX_MS)
    }

    const observer = new MutationObserver((records) => {
      if (disposed) return

      for (let i = 0; i < records.length; i += 1) {
        const target = resolveDirtyTarget(editor, records[i].target)
        if (target.kind === 'document') {
          dirtyAll = true
          dirty.clear()
          break
        }
        if (target.kind === 'unit') dirty.add(target.unit)
        // 'skip' → code/tables/custom blocks: nothing to lint there.
      }

      schedule(LINT_DEBOUNCE_MS)
    })

    observer.observe(editor, { childList: true, subtree: true, characterData: true })

    // Compile the WebAssembly + dictionary while the note is being read, then
    // take the first pass.
    void preloadGrammarEngine()
    schedule(INITIAL_LINT_MS)

    return () => {
      disposed = true
      observer.disconnect()
      if (timer !== null) window.clearTimeout(timer)
      relintUnitRef.current = null
      relintAllRef.current = null
      clearGrammarHighlights()
      issuesRef.current = []
      setIssueCount(0)
    }
  }, [enabled, editorRef, hidePopover, replaceIssues])

  // ── Clicking a squiggle ───────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const editor = editorRef.current
    if (!editor) return

    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0) return

      // Selecting text wins — never pop a suggestion mid-drag.
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed) {
        hidePopover()
        return
      }

      const position = caretPositionAtPoint(event.clientX, event.clientY)
      if (!position) {
        hidePopover()
        return
      }

      const target = resolveDirtyTarget(editor, position.node)
      if (target.kind !== 'unit') {
        hidePopover()
        return
      }

      const info = collectUnitText(target.unit)
      const offset = offsetForNodePosition(info, position.node, position.offset)
      if (offset === null) {
        hidePopover()
        return
      }

      const issue = issuesRef.current.find(
        (candidate) =>
          candidate.unit === target.unit && offset >= candidate.start && offset <= candidate.end
      )
      if (!issue) {
        hidePopover()
        return
      }

      const range = rangeForOffsets(info, issue.start, issue.end)
      const rect = range?.getBoundingClientRect()
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        hidePopover()
        return
      }

      const next: GrammarPopoverState = {
        issue,
        anchorTop: rect.top,
        anchorBottom: rect.bottom,
        anchorLeft: rect.left,
      }
      popoverRef.current = next
      setPopover(next)
      paint()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hidePopover()
    }

    const handleScroll = () => hidePopover()

    editor.addEventListener('click', handleClick)
    editor.addEventListener('keydown', handleKeyDown)
    editor.addEventListener('scroll', handleScroll, true)

    return () => {
      editor.removeEventListener('click', handleClick)
      editor.removeEventListener('keydown', handleKeyDown)
      editor.removeEventListener('scroll', handleScroll, true)
    }
  }, [enabled, editorRef, hidePopover, paint])

  // Dismiss when clicking anywhere outside the editor and the popover.
  useEffect(() => {
    if (!popover) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('[data-grammar-popover]')) return
      if (editorRef.current && target && editorRef.current.contains(target)) return
      hidePopover()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [popover, editorRef, hidePopover])

  // ── Fixes ─────────────────────────────────────────────────────────────────
  const applySuggestion = useCallback(
    (suggestion: GrammarSuggestion) => {
      const state = popoverRef.current
      if (!state) return

      const issue = state.issue
      if (!issue.unit.isConnected) {
        hidePopover()
        return
      }

      const info = collectUnitText(issue.unit)
      if (info.text.slice(issue.start, issue.end) !== issue.text) {
        // The text moved under the popover — re-lint instead of guessing.
        hidePopover()
        relintUnitRef.current?.(issue.unit)
        return
      }

      const isInsert = suggestion.kind === SUGGESTION_INSERT_AFTER
      const replacement = suggestion.kind === SUGGESTION_REMOVE ? '' : suggestion.replacement

      onBeforeApplyRef.current?.()
      const applied = isInsert
        ? applyReplacementAtOffsets(info, issue.end, issue.end, suggestion.replacement)
        : applyReplacementAtOffsets(info, issue.start, issue.end, replacement)
      if (!applied) return

      replaceIssues((issues) => issues.filter((candidate) => candidate !== issue))
      hidePopover()
      onAfterApplyRef.current?.()
      relintUnitRef.current?.(issue.unit)
    },
    [hidePopover, replaceIssues]
  )

  const ignoreIssue = useCallback(() => {
    const state = popoverRef.current
    if (!state) return

    const issue = state.issue
    replaceIssues((issues) => issues.filter((candidate) => candidate !== issue))
    hidePopover()

    void ignoreLintPersistently(issue.sourceText, issue.raw).then(() => {
      relintAllRef.current?.()
    })
  }, [hidePopover, replaceIssues])

  /** Teach Harper a word for good (spelling lints on names/jargon). */
  const addWord = useCallback(() => {
    const state = popoverRef.current
    if (!state) return

    const issue = state.issue
    const word = issue.text.trim()
    if (!word) return

    replaceIssues((issues) => issues.filter((candidate) => candidate !== issue))
    hidePopover()

    void addWordToDictionary(word).then(() => {
      relintAllRef.current?.()
    })
  }, [hidePopover, replaceIssues])

  return {
    issueCount,
    available,
    popover,
    applySuggestion,
    ignoreIssue,
    addWord,
    dismiss: hidePopover,
  }
}

// ── Lint passes ─────────────────────────────────────────────────────────────

/**
 * Lint a set of units. Units are packed into batches (separated by a blank
 * line) so one RPC covers many blocks; results are mapped back per unit and
 * lints that straddle a batch separator are dropped.
 */
async function lintUnits(units: HTMLElement[]): Promise<Map<HTMLElement, LintUnitResult>> {
  const results = new Map<HTMLElement, LintUnitResult>()
  let batch: UnitText[] = []
  let batchChars = 0

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return
    const current = batch
    batch = []
    batchChars = 0
    await lintBatch(current, results)
  }

  for (const unit of units) {
    if (!unit.isConnected) continue

    const info = collectUnitText(unit)
    if (info.text.trim().length < 2) {
      results.set(unit, { text: info.text, issues: [] })
      continue
    }

    // Non-English notes stay quiet (Harper only speaks English).
    if (await isNonEnglishText(info.text)) {
      results.set(unit, { text: info.text, issues: [] })
      continue
    }

    batch.push(info)
    batchChars += info.text.length + BATCH_SEPARATOR.length
    if (batchChars >= BATCH_CHAR_LIMIT) await flush()
  }

  await flush()
  return results
}

async function lintBatch(
  infos: UnitText[],
  out: Map<HTMLElement, LintUnitResult>
): Promise<void> {
  const parts: string[] = []
  const ranges: Array<{ unit: HTMLElement; start: number; end: number }> = []
  let cursor = 0

  for (const info of infos) {
    if (parts.length > 0) cursor += BATCH_SEPARATOR.length
    ranges.push({ unit: info.unit, start: cursor, end: cursor + info.text.length })
    parts.push(info.text)
    cursor += info.text.length
    out.set(info.unit, { text: info.text, issues: [] })
  }

  const sourceText = parts.join(BATCH_SEPARATOR)
  const lints = await lintPlainText(sourceText)

  for (const lint of lints) {
    let start = 0
    let end = 0
    try {
      const span = lint.span()
      start = span.start
      end = span.end
    } catch {
      continue
    }

    // Lints crossing a separator (or out of range) cannot be mapped safely.
    let owner: { unit: HTMLElement; start: number; end: number } | null = null
    for (let i = 0; i < ranges.length; i += 1) {
      const range = ranges[i]
      if (start >= range.start && end <= range.end) {
        owner = range
        break
      }
    }
    if (!owner) continue

    const entry = out.get(owner.unit)
    if (!entry) continue

    const suggestions: GrammarSuggestion[] = []
    try {
      const raw = lint.suggestions()
      for (let i = 0; i < raw.length && suggestions.length < MAX_SUGGESTIONS; i += 1) {
        const kind = raw[i].kind()
        const replacement = raw[i].get_replacement_text()
        suggestions.push({ kind, replacement, label: describeSuggestion(kind, replacement) })
      }
    } catch {
      /* no suggestions — the popover still shows the message */
    }

    let message = ''
    let kindLabel = ''
    try {
      message = lint.message()
      kindLabel = lint.lint_kind_pretty()
    } catch {
      /* keep the defaults */
    }

    entry.issues.push({
      unit: owner.unit,
      start: start - owner.start,
      end: end - owner.start,
      text: sourceText.slice(start, end),
      message,
      kind: kindLabel,
      suggestions,
      sourceText,
      raw: lint,
    })
  }
}

function describeSuggestion(kind: number, replacement: string): string {
  if (kind === SUGGESTION_REMOVE) return 'Remove'
  if (kind === SUGGESTION_INSERT_AFTER) return `Add “${replacement.trim()}”`
  return replacement.trim() ? replacement : 'Replace'
}

/** Caret position under a viewport point (both browser spellings). */
function caretPositionAtPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }

  try {
    if (typeof doc.caretPositionFromPoint === 'function') {
      const position = doc.caretPositionFromPoint(x, y)
      if (position && position.offsetNode) {
        return { node: position.offsetNode, offset: position.offset }
      }
    }

    if (typeof doc.caretRangeFromPoint === 'function') {
      const range = doc.caretRangeFromPoint(x, y)
      if (range) return { node: range.startContainer, offset: range.startOffset }
    }
  } catch {
    /* unsupported point → no popover */
  }

  return null
}
