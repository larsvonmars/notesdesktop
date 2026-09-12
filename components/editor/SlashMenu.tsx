'use client'

/**
 * Slash menu — the single block inserter for the editor.
 *
 * Two entry points share it: typing `/` (the trigger text is removed when a
 * command is applied) and the floating "+" button / `+` key, which opens it at
 * the caret without deleting anything ("manual" mode).
 *
 * Rendered as an overlay **next to** the editor (same pattern as
 * `BlockControls.tsx`), so nothing it draws can ever end up in the saved HTML.
 *
 * While the menu is open it owns ArrowUp/ArrowDown/Enter/Tab/Escape: the
 * listener sits in the capture phase on `document`, which stops those keys
 * before the editor's own key handling sees them. Every other keystroke flows
 * into the editor as usual and only re-filters the list.
 *
 * The menu closes without side effects, leaving the typed `/query` in place.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  ArrowLeft,
  CheckSquare,
  Code2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Image as ImageIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Paperclip,
  Pilcrow,
  Quote,
  Table,
  Table2,
  type LucideIcon,
} from 'lucide-react'
import {
  filterSlashCommands,
  filterSlashOptions,
  groupSlashCommands,
  matchSlashTrigger,
  resolveCommandHighlight,
  SLASH_COMMANDS,
  SLASH_QUERY_MAX_LENGTH,
  type SlashCommandDefinition,
  type SlashCommandId,
  type SlashInlineOption,
  type SlashInlinePicker,
  type SlashInlinePickers,
} from '@/lib/editor/slashCommands'
import { getTopLevelBlock } from '@/lib/editor/blockTools'
import { getElementText, getTextOffsetInBlock } from '@/lib/editor/textOffsets'

const ICONS: Record<SlashCommandId, LucideIcon> = {
  paragraph: Pilcrow,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  h5: Heading5,
  h6: Heading6,
  quote: Quote,
  code: Code2,
  ul: List,
  ol: ListOrdered,
  checklist: CheckSquare,
  divider: Minus,
  hyperlink: LinkIcon,
  table: Table,
  'note-link': FileText,
  'data-sheet-table': Table2,
  image: ImageIcon,
  file: Paperclip,
}

const MENU_WIDTH = 260
const MENU_MAX_VISIBLE = 8
const ITEM_HEIGHT = 32
const HEADER_HEIGHT = 24
const FOOTER_HEIGHT = 26
const GAP = 6
const EDGE = 4

/** Table step: pick a size on a grid (mirrors the old insert-table dialog). */
const GRID_ROWS = 6
const GRID_COLS = 6
const GRID_CELL = 26
const GRID_DEFAULT_INDEX = 2 * GRID_COLS + 2 // 3 × 3

/** Where the last applied command is remembered between sessions. */
const LAST_COMMAND_STORAGE_KEY = 'notesdesktop:last-block-command'

function readLastCommand(): SlashCommandId | null {
  try {
    return (window.localStorage.getItem(LAST_COMMAND_STORAGE_KEY) as SlashCommandId) || null
  } catch {
    return null
  }
}

function rememberLastCommand(id: SlashCommandId): void {
  try {
    window.localStorage.setItem(LAST_COMMAND_STORAGE_KEY, id)
  } catch {
    /* private mode / disabled storage — the highlight is a nicety */
  }
}

interface TriggerContext {
  /** Block the caret is in — offsets below are relative to its text. */
  block: HTMLElement
  /** Character offset of the `/` inside the block text. */
  start: number
  /** Character offset of the caret while the menu was last refreshed. */
  end: number
  query: string
}

interface Anchor {
  top: number
  bottom: number
  left: number
}

/** Palette views: the command list, a host picker or the table size grid. */
type MenuView = 'commands' | 'picker' | 'grid'

interface PickerState {
  id: SlashCommandId
  title: string
  picker: SlashInlinePicker
  /** Rows loaded once, filtered locally against the step query. */
  options: SlashInlineOption[]
  loading: boolean
  failed: boolean
}

interface SlashMenuState extends TriggerContext {
  anchor: Anchor
  top: number
  left: number
  view: MenuView
  /** Filtered commands (view `commands`). */
  items: SlashCommandDefinition[]
  /** Filtered rows of the active picker (view `picker`). */
  visibleOptions: SlashInlineOption[]
  picker: PickerState | null
  /** Filter of the step views — typed text never touches the document. */
  stepQuery: string
}

export interface SlashMenuSelection {
  block: HTMLElement
  /** Character range of the `/query` run (`end` is refreshed on apply). */
  start: number
  end: number
}

interface SlashMenuProps {
  editorRef: React.RefObject<HTMLDivElement | null>
  disabled?: boolean
  /** Runs a command; the owner deletes the `/query` text first. */
  onSelect: (id: SlashCommandId, selection: SlashMenuSelection, optionId?: string) => void
  /**
   * Sub-step pickers for app-level commands. Choosing such a command opens a
   * second palette view instead of running it; picking a row calls
   * `onRemoveQuery` (so the trigger text goes away) and then the picker's
   * `apply`.
   */
  pickers?: SlashInlinePickers
  /** Removes the trigger text without running a command (picker applies). */
  onRemoveQuery?: (selection: SlashMenuSelection) => void
}

/** Imperative API — the floating "+" button and the `+` shortcut use this. */
export interface SlashMenuHandle {
  /** Open the palette at the caret as a pure inserter (nothing is deleted). */
  open: () => void
  close: () => void
}

/** Live caret inside a block: character offset + the rect used to anchor. */
function readCaretInBlock(
  editor: HTMLElement,
  block?: HTMLElement
): { block: HTMLElement; offset: number; anchor: { top: number; bottom: number; left: number } } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  const node = range.startContainer
  if (!editor.contains(node)) return null

  const targetBlock = block ?? getTopLevelBlock(node, editor)
  if (!targetBlock) return null
  // The caret may have moved into another block; the manual palette closes then.
  if (block && !block.contains(node)) return null

  const offset = getTextOffsetInBlock(targetBlock, range.startContainer, range.startOffset)
  if (offset === null) return null

  // A collapsed caret has no width, and happy-dom reports an empty rect —
  // fall back to the block box so the menu still lands somewhere sensible.
  let rect = range.getBoundingClientRect()
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    rect = targetBlock.getBoundingClientRect()
  }

  return {
    block: targetBlock,
    offset,
    anchor: { top: rect?.top ?? 0, bottom: rect?.bottom ?? 0, left: rect?.left ?? 0 },
  }
}

/** Read the trigger from the live caret, plus the geometry to anchor the menu. */
function readTrigger(
  editor: HTMLElement
): { context: TriggerContext; anchor: { top: number; bottom: number; left: number } } | null {
  const caret = readCaretInBlock(editor)
  if (!caret) return null

  const selection = window.getSelection()
  const range = selection?.getRangeAt(0)
  const node = range?.startContainer
  if (!range || !node) return null
  if (isBlockedContext(node)) return null

  const trigger = matchSlashTrigger(getElementText(caret.block).slice(0, caret.offset))
  if (!trigger) return null

  return {
    context: {
      block: caret.block,
      start: trigger.start,
      end: caret.offset,
      query: trigger.query,
    },
    anchor: caret.anchor,
  }
}

/** Markdown stays literal in code blocks, custom islands and table cells. */
function isBlockedContext(node: Node | null | undefined): boolean {
  if (!node) return false
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return !!element?.closest('pre, [data-block], td, th')
}

const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(
  { editorRef, disabled = false, onSelect, pickers, onRemoveQuery },
  ref
) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef<SlashMenuState | null>(null)
  const activeIndexRef = useRef(0)
  const disabledRef = useRef(disabled)
  const pickersRef = useRef(pickers)
  const lastCommandRef = useRef<SlashCommandId | null>(null)
  /**
   * Opened from the "+" button / key instead of a typed `/`: whatever is typed
   * after opening becomes the filter (and is deleted again on apply).
   */
  const manualRef = useRef(false)

  const [menu, setMenu] = useState<SlashMenuState | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  disabledRef.current = disabled
  pickersRef.current = pickers
  stateRef.current = menu
  activeIndexRef.current = activeIndex

  if (lastCommandRef.current === null && typeof window !== 'undefined') {
    lastCommandRef.current = readLastCommand()
  }

  const close = useCallback(() => {
    manualRef.current = false
    stateRef.current = null
    activeIndexRef.current = 0
    setMenu(null)
    setActiveIndex(0)
  }, [])

  const setActive = useCallback((index: number) => {
    activeIndexRef.current = index
    setActiveIndex(index)
  }, [])

  /** Geometry for a menu of `height` px, anchored at the caret line. */
  const position = useCallback(
    (height: number, anchor: Anchor) => {
      const editor = editorRef.current
      if (!editor) return null

      const editorRect = editor.getBoundingClientRect()
      const width = Math.min(MENU_WIDTH, Math.max(editorRect.width - EDGE * 2, 120))

      let top = anchor.bottom - editorRect.top + GAP
      if (top + height > editorRect.height - EDGE) {
        // Not enough room below the caret — flip above it.
        top = anchor.top - editorRect.top - height - GAP
      }
      top = Math.max(EDGE, Math.min(top, Math.max(EDGE, editorRect.height - height - EDGE)))

      const left = Math.max(
        EDGE,
        Math.min(anchor.left - editorRect.left, Math.max(EDGE, editorRect.width - width - EDGE))
      )

      return { top, left }
    },
    [editorRef]
  )

  /**
   * Position the menu for a caret context and (re)build its rows.
   * `overrides` switches the view (command list → picker → grid) without
   * touching the document.
   */
  const commit = useCallback(
    (
      context: TriggerContext,
      anchor: Anchor,
      overrides?: { view?: MenuView; picker?: PickerState | null; stepQuery?: string }
    ) => {
      const previous = stateRef.current
      const view = overrides?.view ?? previous?.view ?? 'commands'
      const picker =
        overrides && 'picker' in overrides ? (overrides.picker ?? null) : (previous?.picker ?? null)
      const stepQuery = overrides?.stepQuery ?? previous?.stepQuery ?? ''

      const items = view === 'commands' ? filterSlashCommands(context.query, SLASH_COMMANDS) : []
      const visibleOptions =
        view === 'picker' && picker ? filterSlashOptions(stepQuery, picker.options) : []

      // Height: rows + section headers + footer (+ status row while loading).
      const placeholderRow =
        view === 'picker' && (picker?.loading || picker?.failed || visibleOptions.length === 0)
      const rows =
        view === 'grid'
          ? GRID_ROWS
          : view === 'picker'
            ? Math.max(Math.min(visibleOptions.length, MENU_MAX_VISIBLE), 1) + (placeholderRow ? 1 : 0)
            : Math.max(Math.min(items.length, MENU_MAX_VISIBLE), 1)
      const headers =
        view === 'commands' ? (context.query ? 0 : groupSlashCommands(items).length) : 1
      const height =
        view === 'grid'
          ? rows * GRID_CELL + headers * HEADER_HEIGHT + FOOTER_HEIGHT + 10
          : rows * ITEM_HEIGHT + headers * HEADER_HEIGHT + FOOTER_HEIGHT + 8

      const placed = position(height, anchor)
      if (!placed) return

      // Highlight: repeat-friendly for the palette, first row for filters,
      // sticky cell for the grid.
      let nextIndex = 0
      if (view === 'grid') {
        nextIndex = Math.min(Math.max(activeIndexRef.current, 0), GRID_ROWS * GRID_COLS - 1)
      } else if (view === 'picker') {
        const count = visibleOptions.length
        const queryChanged = previous?.stepQuery !== stepQuery
        nextIndex = count === 0 ? 0 : queryChanged ? 0 : Math.min(activeIndexRef.current, count - 1)
      } else {
        nextIndex = resolveCommandHighlight({
          items,
          query: context.query,
          previousQuery: previous?.query ?? null,
          previousIndex: activeIndexRef.current,
          lastUsedId: lastCommandRef.current,
        })
      }

      setActive(nextIndex)
      setMenu({
        ...context,
        anchor,
        top: placed.top,
        left: placed.left,
        view,
        items,
        visibleOptions,
        picker,
        stepQuery,
      })
    },
    [position, setActive]
  )

  /** Current caret context, reused when only the view changes. */
  const contextOf = (state: SlashMenuState): TriggerContext => ({
    block: state.block,
    start: state.start,
    end: state.end,
    query: state.query,
  })

  /** Re-read the caret and (re)position the menu; closes when the caret left. */
  const update = useCallback(() => {
    const editor = editorRef.current
    if (!editor || disabledRef.current) {
      close()
      return
    }

    const previous = stateRef.current

    // Step views keep their own query — the caret only keeps them anchored
    // (and closes them once it leaves the block). The trigger range never
    // shrinks below its start, so a caret that was re-created at the block
    // start cannot turn the pending deletion into a no-op.
    if (previous && previous.view !== 'commands') {
      const caret = readCaretInBlock(editor, previous.block)
      if (!caret) {
        close()
        return
      }
      commit(
        {
          block: caret.block,
          start: previous.start,
          end: Math.max(caret.offset, previous.start),
          query: previous.query,
        },
        caret.anchor,
        { view: previous.view }
      )
      return
    }

    if (manualRef.current) {
      const current = previous
      const caret = current ? readCaretInBlock(editor, current.block) : null
      if (!current || !caret) {
        close()
        return
      }

      // No leading slash here — whatever was typed since the palette opened is
      // the filter, and applying removes exactly that text again. Normal prose
      // (whitespace) closes the palette instead of swallowing the words.
      if (caret.offset < current.start) {
        close()
        return
      }

      const typed = getElementText(caret.block).slice(current.start, caret.offset)
      if (typed.length > SLASH_QUERY_MAX_LENGTH || /\s/.test(typed)) {
        close()
        return
      }

      commit({ block: caret.block, start: current.start, end: caret.offset, query: typed }, caret.anchor)
      return
    }

    const found = readTrigger(editor)
    if (!found) {
      close()
      return
    }

    commit(found.context, found.anchor)
  }, [close, commit, editorRef])

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        const editor = editorRef.current
        if (!editor || disabledRef.current) return

        const selection = window.getSelection()
        if (isBlockedContext(selection?.getRangeAt(0)?.startContainer)) return

        const caret = readCaretInBlock(editor)
        if (!caret) return

        manualRef.current = true
        commit({ block: caret.block, start: caret.offset, end: caret.offset, query: '' }, caret.anchor)
      },
      close,
    }),
    [close, commit, editorRef]
  )

  /** Leave a sub-step and return to the command list. */
  const goBack = useCallback(() => {
    const state = stateRef.current
    if (!state) return

    commit(contextOf(state), state.anchor, { view: 'commands', picker: null, stepQuery: '' })
  }, [commit])

  /** Run a command: delete the typed filter text first, then hand it over. */
  const applyCommand = useCallback(
    (id: SlashCommandId, optionId?: string) => {
      const current = stateRef.current
      if (!current) return

      const selection: SlashMenuSelection = {
        block: current.block,
        start: current.start,
        end: current.end,
      }

      lastCommandRef.current = id
      rememberLastCommand(id)
      close()
      onSelect(id, selection, optionId)
    },
    [close, onSelect]
  )

  /** Command row activated: pickers and the table grid open a sub-step. */
  const chooseCommand = useCallback(
    (id: SlashCommandId) => {
      const current = stateRef.current
      if (!current) return

      if (id === 'table') {
        setActive(GRID_DEFAULT_INDEX)
        commit(contextOf(current), current.anchor, { view: 'grid', picker: null, stepQuery: '' })
        return
      }

      const picker = pickersRef.current?.[id]
      if (!picker) {
        applyCommand(id)
        return
      }

      // Enter the step with a loading row, then fill it in. The trigger text
      // stays in the document until a row is actually picked.
      const step: PickerState = {
        id,
        title: picker.title,
        picker,
        options: [],
        loading: true,
        failed: false,
      }
      commit(contextOf(current), current.anchor, { view: 'picker', picker: step, stepQuery: '' })

      Promise.resolve()
        .then(() => picker.load())
        .then((options) => {
          const state = stateRef.current
          if (!state?.picker || state.picker.id !== id) return // step was left meanwhile
          commit(contextOf(state), state.anchor, {
            view: 'picker',
            picker: { ...state.picker, options: options ?? [], loading: false },
          })
        })
        .catch((error) => {
          console.error('Slash picker failed to load options:', error)
          const state = stateRef.current
          if (!state?.picker || state.picker.id !== id) return
          commit(contextOf(state), state.anchor, {
            view: 'picker',
            picker: { ...state.picker, loading: false, failed: true },
          })
        })
    },
    [applyCommand, commit, setActive]
  )

  /** Picker row activated: quiet removal of the query, then the host applies. */
  const applyOption = useCallback(() => {
    const current = stateRef.current
    const picker = current?.picker
    if (!current || !picker) return

    const option = current.visibleOptions[activeIndexRef.current]
    if (!option) return

    const selection: SlashMenuSelection = {
      block: current.block,
      start: current.start,
      end: current.end,
    }

    lastCommandRef.current = picker.id
    rememberLastCommand(picker.id)
    close()
    onRemoveQuery?.(selection)
    picker.picker.apply(option.id)
  }, [close, onRemoveQuery])

  /** Table grid cell activated. */
  const applyGrid = useCallback(() => {
    const index = activeIndexRef.current
    const row = Math.floor(index / GRID_COLS) + 1
    const col = (index % GRID_COLS) + 1
    applyCommand('table', `${row}x${col}`)
  }, [applyCommand])

  // Track the caret: typing, arrow keys, clicks and IME updates all surface as
  // `input` or `selectionchange`.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    let frame: number | null = null
    const scheduleUpdate = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        update()
      })
    }

    const onBlur = () => close()

    editor.addEventListener('input', scheduleUpdate)
    editor.addEventListener('blur', onBlur)
    document.addEventListener('selectionchange', scheduleUpdate)
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      editor.removeEventListener('input', scheduleUpdate)
      editor.removeEventListener('blur', onBlur)
      document.removeEventListener('selectionchange', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [close, editorRef, update])

  // A disabled editor must never show the palette.
  useEffect(() => {
    if (disabled) close()
  }, [close, disabled])

  // Keep the highlighted row visible while walking the list.
  useEffect(() => {
    if (!menu) return
    const container = menuRef.current
    if (!container) return
    const item = container.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, menu])

  const choose = useCallback(
    (id: SlashCommandId) => {
      const current = stateRef.current
      if (!current) return

      // The caret may have been re-created since the menu was refreshed —
      // re-derive its offset so the `/query` run is removed exactly. When the
      // caret has left the block the stored offsets are still the right ones.
      const selection = window.getSelection()
      let end = current.end
      if (selection && selection.rangeCount > 0 && selection.isCollapsed) {
        const range = selection.getRangeAt(0)
        const offset = getTextOffsetInBlock(
          current.block,
          range.startContainer,
          range.startOffset
        )
        if (offset !== null && offset >= current.start) end = offset
      }

      close()
      onSelect(id, { block: current.block, start: current.start, end })
    },
    [close, onSelect]
  )

  /** Step views filter through an internal buffer — nothing reaches the doc. */
  const setStepQuery = useCallback(
    (nextQuery: string) => {
      const current = stateRef.current
      if (!current || current.view === 'commands') return
      commit(contextOf(current), current.anchor, { view: current.view, stepQuery: nextQuery })
    },
    [commit]
  )

  // Arrow/Enter/Tab/Escape belong to the menu while it is open, and while a
  // sub-step is open the palette also swallows every printable key (it searches
  // its rows instead of writing the words into the note). The listener sits in
  // the capture phase so the editor's own key handling never sees those keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = stateRef.current
      if (!current || event.isComposing) return

      const isPrintable =
        event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey

      if (current.view === 'grid') {
        const index = activeIndexRef.current
        const row = Math.floor(index / GRID_COLS)
        const col = index % GRID_COLS
        let next = index

        if (event.key === 'ArrowDown' && row < GRID_ROWS - 1) next = index + GRID_COLS
        else if (event.key === 'ArrowUp' && row > 0) next = index - GRID_COLS
        else if (event.key === 'ArrowRight' && col < GRID_COLS - 1) next = index + 1
        else if (event.key === 'ArrowLeft' && col > 0) next = index - 1
        else if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault()
          event.stopPropagation()
          applyGrid()
          return
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          goBack()
          return
        } else {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        setActive(next)
        return
      }

      if (current.view === 'picker') {
        if (isPrintable) {
          event.preventDefault()
          event.stopPropagation()
          setStepQuery(current.stepQuery + event.key)
          return
        }
        if (event.key === 'Backspace') {
          event.preventDefault()
          event.stopPropagation()
          setStepQuery(current.stepQuery.slice(0, -1))
          return
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault()
          event.stopPropagation()
          applyOption()
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          goBack()
          return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const count = current.visibleOptions.length
          if (count === 0) return
          event.preventDefault()
          event.stopPropagation()
          const delta = event.key === 'ArrowDown' ? 1 : -1
          setActive((activeIndexRef.current + delta + count) % count)
        }
        return
      }

      const count = current.items.length
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (count === 0) return
        const delta = event.key === 'ArrowDown' ? 1 : -1
        setActive((activeIndexRef.current + delta + count) % count)
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        const item = current.items[activeIndexRef.current]
        if (!item) return
        chooseCommand(item.id)
      } else if (event.key === 'Escape') {
        close()
      } else {
        return
      }

      event.preventDefault()
      event.stopPropagation()
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [applyGrid, applyOption, chooseCommand, close, goBack, setActive, setStepQuery])

  if (!menu) return null

  const picker = menu.picker
  const isStep = menu.view !== 'commands'
  const stepTitle = picker?.title ?? 'Table size'

  // Command list: category sections when nothing is typed, a flat ranked list
  // while filtering. Step rows reuse the same index space so the keyboard
  // handling stays a single `activeIndex`.
  type Row =
    | { kind: 'header'; label: string }
    | { kind: 'command'; command: SlashCommandDefinition; index: number }
    | { kind: 'option'; option: SlashInlineOption; index: number }

  const rows: Row[] = []
  if (menu.view === 'commands') {
    if (menu.query) {
      menu.items.forEach((command, index) => rows.push({ kind: 'command', command, index }))
    } else {
      let index = 0
      for (const group of groupSlashCommands(menu.items)) {
        rows.push({ kind: 'header', label: group.category })
        for (const command of group.commands) {
          rows.push({ kind: 'command', command, index })
          index += 1
        }
      }
    }
  } else if (menu.view === 'picker') {
    menu.visibleOptions.forEach((option, index) => rows.push({ kind: 'option', option, index }))
  }

  const placeholderRow =
    menu.view === 'picker' && (picker?.loading || picker?.failed || menu.visibleOptions.length === 0)
  const headerCount =
    menu.view === 'commands' && !menu.query ? groupSlashCommands(menu.items).length : 0
  const bodyHeight =
    menu.view === 'grid'
      ? GRID_ROWS * GRID_CELL + 34 // grid + size readout
      : (menu.view === 'picker'
          ? Math.max(Math.min(menu.visibleOptions.length, MENU_MAX_VISIBLE), 1) +
            (placeholderRow ? 1 : 0)
          : Math.max(Math.min(menu.items.length, MENU_MAX_VISIBLE), 1)) * ITEM_HEIGHT +
        headerCount * HEADER_HEIGHT

  return (
    <div className="pointer-events-none absolute inset-0 z-40" aria-hidden={false}>
      <div
        ref={menuRef}
        data-testid="slash-menu"
        role="listbox"
        aria-label="Insert block"
        className="pointer-events-auto absolute overflow-hidden rounded-xl border border-border bg-surface/98 shadow-xl backdrop-blur-xl"
        style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
      >
        {isStep && (
          <div
            data-testid="slash-step-header"
            className="flex items-center gap-1.5 border-b border-border px-2 py-1.5"
          >
            <button
              type="button"
              aria-label="Back to blocks"
              data-testid="slash-step-back"
              onMouseDown={(event) => event.preventDefault()}
              onClick={goBack}
              className="flex h-5 w-5 items-center justify-center rounded text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <ArrowLeft size={13} strokeWidth={2} />
            </button>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {stepTitle}
            </span>
            {menu.stepQuery && (
              <span className="ml-auto truncate rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-foreground">
                {menu.stepQuery}
              </span>
            )}
          </div>
        )}

        {menu.view === 'grid' ? (
          <div className="p-2" data-testid="slash-grid">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, index) => {
                const row = Math.floor(index / GRID_COLS) + 1
                const col = (index % GRID_COLS) + 1
                const active = index === activeIndex
                return (
                  <button
                    key={index}
                    type="button"
                    data-testid="slash-grid-cell"
                    data-index={index}
                    aria-label={`${row} by ${col}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={applyGrid}
                    className={`rounded-[4px] border transition-colors ${
                      active
                        ? 'border-alpine-500 bg-alpine-500/25'
                        : 'border-border bg-surface-hover/30 hover:bg-surface-hover'
                    }`}
                    style={{ height: GRID_CELL }}
                  />
                )
              })}
            </div>
            <div className="mt-1.5 text-center text-[11px] font-medium text-muted">
              {Math.floor(activeIndex / GRID_COLS) + 1} × {(activeIndex % GRID_COLS) + 1}
            </div>
          </div>
        ) : (
          <div
            data-testid="slash-menu-items"
            className="flex flex-col overflow-y-auto p-1"
            style={{ maxHeight: bodyHeight }}
          >
            {menu.view === 'commands' && menu.items.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted">No matching blocks</div>
            )}

            {menu.view === 'picker' && picker?.loading && (
              <div className="px-2 py-1.5 text-sm text-muted">Loading…</div>
            )}
            {menu.view === 'picker' && picker?.failed && (
              <div className="px-2 py-1.5 text-sm text-danger">Could not load the list</div>
            )}
            {menu.view === 'picker' &&
              !picker?.loading &&
              !picker?.failed &&
              menu.visibleOptions.length === 0 && (
                <div className="px-2 py-1.5 text-sm text-muted">
                  {picker?.options.length ? 'No matches' : 'Nothing available'}
                </div>
              )}

            {rows.map((row) => {
              if (row.kind === 'header') {
                return (
                  <div
                    key={`header-${row.label}`}
                    className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted"
                  >
                    {row.label}
                  </div>
                )
              }

              const { index } = row
              const active = index === activeIndex
              const Icon =
                row.kind === 'command'
                  ? (ICONS[row.command.id] ?? Pilcrow)
                  : (picker ? ICONS[picker.id] ?? Pilcrow : Pilcrow)
              const label = row.kind === 'command' ? row.command.label : row.option.label
              const description =
                row.kind === 'command' ? row.command.description : row.option.description
              const key = row.kind === 'command' ? row.command.id : `${picker?.id}-${row.option.id}`

              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  title={description}
                  data-index={index}
                  data-command={row.kind === 'command' ? row.command.id : undefined}
                  data-option={row.kind === 'option' ? row.option.id : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => (row.kind === 'command' ? chooseCommand(row.command.id) : applyOption())}
                  className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors ${
                    active
                      ? 'bg-alpine-50 font-medium text-alpine-700 dark:bg-alpine-900/40 dark:text-alpine-300'
                      : 'text-foreground hover:bg-surface-hover'
                  }`}
                >
                  <Icon size={15} strokeWidth={2} />
                  <span className="flex-1 truncate">{label}</span>
                  {row.kind === 'option' && row.option.description && (
                    <span className="max-w-[40%] truncate text-[10px] text-muted">
                      {row.option.description}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-2 py-1 text-[10px] text-muted">
          <span>
            {menu.view === 'commands'
              ? 'Type to filter'
              : menu.view === 'picker'
                ? 'Type to search'
                : 'Pick a size'}
          </span>
          <span>
            {menu.view === 'grid' ? '↑↓←→ · ↵ · esc back' : isStep ? '↑↓ · ↵ · esc back' : '↑↓ · ↵ · esc'}
          </span>
        </div>
      </div>
    </div>
  )
})

SlashMenu.displayName = 'SlashMenu'

export default SlashMenu
