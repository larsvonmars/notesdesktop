'use client'

/**
 * Slash menu — type `/` to insert or convert a block.
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

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Table,
  type LucideIcon,
} from 'lucide-react'
import {
  filterSlashCommands,
  matchSlashTrigger,
  SLASH_COMMANDS,
  type SlashCommandDefinition,
  type SlashCommandId,
} from '@/lib/editor/slashCommands'
import { getTopLevelBlock } from '@/lib/editor/blockTools'
import { getElementText, getTextOffsetInBlock } from '@/lib/editor/textOffsets'

const ICONS: Record<SlashCommandId, LucideIcon> = {
  paragraph: Pilcrow,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  quote: Quote,
  code: Code2,
  ul: List,
  ol: ListOrdered,
  checklist: CheckSquare,
  divider: Minus,
  table: Table,
}

const MENU_WIDTH = 244
const MENU_MAX_VISIBLE = 6
const ITEM_HEIGHT = 32
const FOOTER_HEIGHT = 26
const GAP = 6
const EDGE = 4

interface TriggerContext {
  /** Block the caret is in — offsets below are relative to its text. */
  block: HTMLElement
  /** Character offset of the `/` inside the block text. */
  start: number
  /** Character offset of the caret while the menu was last refreshed. */
  end: number
  query: string
}

interface SlashMenuState extends TriggerContext {
  items: SlashCommandDefinition[]
  top: number
  left: number
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
  /** Runs the command; the owner deletes the `/query` text first. */
  onSelect: (id: SlashCommandId, selection: SlashMenuSelection) => void
}

/** Read the trigger from the live caret, plus the geometry to anchor the menu. */
function readTrigger(
  editor: HTMLElement
): { context: TriggerContext; anchor: { top: number; bottom: number; left: number } } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  const node = range.startContainer
  if (!editor.contains(node)) return null

  // Markdown stays literal in code blocks, custom islands and table cells.
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  if (!element || element.closest('pre, [data-block], td, th')) return null

  // Offsets are block-relative: typing often leaves the caret in a freshly
  // created empty text node, so the node itself is not a reliable anchor.
  const block = getTopLevelBlock(node, editor)
  if (!block) return null

  const caretOffset = getTextOffsetInBlock(block, range.startContainer, range.startOffset)
  if (caretOffset === null) return null

  const trigger = matchSlashTrigger(getElementText(block).slice(0, caretOffset))
  if (!trigger) return null

  // A collapsed caret has no width, and happy-dom reports an empty rect —
  // fall back to the block box so the menu still lands somewhere sensible.
  let rect = range.getBoundingClientRect()
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    rect = block.getBoundingClientRect()
  }

  return {
    context: { block, start: trigger.start, end: caretOffset, query: trigger.query },
    anchor: {
      top: rect?.top ?? 0,
      bottom: rect?.bottom ?? 0,
      left: rect?.left ?? 0,
    },
  }
}

export default function SlashMenu({ editorRef, disabled = false, onSelect }: SlashMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef<SlashMenuState | null>(null)
  const activeIndexRef = useRef(0)
  const disabledRef = useRef(disabled)

  const [menu, setMenu] = useState<SlashMenuState | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  disabledRef.current = disabled
  stateRef.current = menu
  activeIndexRef.current = activeIndex

  const close = useCallback(() => {
    stateRef.current = null
    activeIndexRef.current = 0
    setMenu(null)
    setActiveIndex(0)
  }, [])

  const setActive = useCallback((index: number) => {
    activeIndexRef.current = index
    setActiveIndex(index)
  }, [])

  /** Re-read the caret and (re)position the menu; closes when the trigger is gone. */
  const update = useCallback(() => {
    const editor = editorRef.current
    if (!editor || disabledRef.current) {
      close()
      return
    }

    const found = readTrigger(editor)
    if (!found) {
      close()
      return
    }

    const { context, anchor } = found
    const items = filterSlashCommands(context.query, SLASH_COMMANDS)
    const editorRect = editor.getBoundingClientRect()

    const visibleItems = Math.max(items.length, 1)
    const height =
      Math.min(visibleItems, MENU_MAX_VISIBLE) * ITEM_HEIGHT + FOOTER_HEIGHT + 8
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

    // Keep the highlighted entry stable while typing narrows the list.
    const nextIndex = Math.min(activeIndexRef.current, Math.max(items.length - 1, 0))
    setActive(nextIndex)

    setMenu({ ...context, items, top, left })
  }, [close, editorRef, setActive])

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

  // Arrow/Enter/Tab/Escape belong to the menu while it is open. The listener is
  // registered in the capture phase so the editor's own key handling never sees
  // those keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = stateRef.current
      if (!current || event.isComposing) return

      const count = current.items.length
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (count === 0) return
        const delta = event.key === 'ArrowDown' ? 1 : -1
        setActive((activeIndexRef.current + delta + count) % count)
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        const item = current.items[activeIndexRef.current]
        if (!item) return
        choose(item.id)
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
  }, [choose, close, setActive])

  if (!menu) return null

  const height = Math.min(Math.max(menu.items.length, 1), MENU_MAX_VISIBLE) * ITEM_HEIGHT

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
        <div
          data-testid="slash-menu-items"
          className="flex flex-col overflow-y-auto p-1"
          style={{ maxHeight: height }}
        >
          {menu.items.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted">No matching blocks</div>
          )}

          {menu.items.map((item, index) => {
            const Icon = ICONS[item.id] ?? Pilcrow
            const active = index === activeIndex
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={active}
                data-index={index}
                data-command={item.id}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(item.id)}
                className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors ${
                  active
                    ? 'bg-alpine-50 font-medium text-alpine-700 dark:bg-alpine-900/40 dark:text-alpine-300'
                    : 'text-foreground hover:bg-surface-hover'
                }`}
              >
                <Icon size={15} strokeWidth={2} />
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border px-2 py-1 text-[10px] text-muted">
          <span>Type to filter</span>
          <span>↑↓ · ↵ · esc</span>
        </div>
      </div>
    </div>
  )
}
