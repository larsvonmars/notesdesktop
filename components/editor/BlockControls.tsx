'use client'

/**
 * Notion-style block handle.
 *
 * Rendered as an overlay **next to** the editor (never inside it, so it can
 * never end up in the saved HTML). Hovering a block shows a small label button
 * in the left gutter:
 *   - click  → block menu (turn into / duplicate / move / delete)
 *   - drag   → reorder blocks with a drop indicator
 *
 * Reordering is also available from the keyboard (Alt+↑/↓), handled by the
 * editor itself — that is the path used on touch devices where hover does not
 * exist.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Code2,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  blockAtPoint,
  blockKind,
  blockLabel,
  canIndentBlock,
  dropIndicatorTop,
  findDropReference,
  getBlockRange,
  getTopLevelBlock,
  isStructuralBlock,
  type BlockKind,
} from '@/lib/editor/blockTools'

export type BlockActionId =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'quote'
  | 'code'
  | 'ul'
  | 'ol'
  | 'checklist'
  | 'duplicate'
  | 'delete'
  | 'move-up'
  | 'move-down'
  | 'indent'
  | 'outdent'
  | 'clear-selection'

interface BlockControlsProps {
  editorRef: React.RefObject<HTMLDivElement | null>
  disabled?: boolean
  /** Blocks were dropped: the owner moves them (history + persistence). */
  onDropBlock: (blocks: HTMLElement[], reference: HTMLElement | null) => void
  /** Runs a menu action against one block or a contiguous selection. */
  onAction: (action: BlockActionId, blocks: HTMLElement[]) => void
}

interface MenuEntry {
  id: BlockActionId
  label: string
  Icon: LucideIcon
  /** Block kinds this entry currently represents (ticked in the menu). */
  matches: BlockKind[]
}

/** A contiguous run of blocks selected with shift+click on the handle. */
interface BlockSelection {
  /** Fixed end of the range — shift+clicking grows or shrinks towards it. */
  anchor: HTMLElement
  blocks: HTMLElement[]
}

interface ActiveHandle {
  top: number
  label: string
  title: string
  blocks: HTMLElement[]
}

const TURN_INTO_ENTRIES: MenuEntry[] = [
  { id: 'paragraph', label: 'Paragraph', Icon: Pilcrow, matches: ['paragraph', 'other'] },
  { id: 'h1', label: 'Heading 1', Icon: Heading1, matches: ['h1'] },
  { id: 'h2', label: 'Heading 2', Icon: Heading2, matches: ['h2'] },
  { id: 'h3', label: 'Heading 3', Icon: Heading3, matches: ['h3'] },
  { id: 'quote', label: 'Quote', Icon: Quote, matches: ['quote'] },
  { id: 'code', label: 'Code block', Icon: Code2, matches: ['code'] },
  { id: 'ul', label: 'Bulleted list', Icon: List, matches: ['ul'] },
  { id: 'ol', label: 'Numbered list', Icon: ListOrdered, matches: ['ol'] },
  { id: 'checklist', label: 'Checklist', Icon: CheckSquare, matches: ['checklist'] },
]

const ACTION_ENTRIES: MenuEntry[] = [
  { id: 'duplicate', label: 'Duplicate', Icon: Copy, matches: [] },
  { id: 'indent', label: 'Indent', Icon: IndentIncrease, matches: [] },
  { id: 'outdent', label: 'Outdent', Icon: IndentDecrease, matches: [] },
  { id: 'move-up', label: 'Move up', Icon: ArrowUp, matches: [] },
  { id: 'move-down', label: 'Move down', Icon: ArrowDown, matches: [] },
  { id: 'delete', label: 'Delete', Icon: Trash2, matches: [] },
]

/** Menu width/height are used for clamping; the multi-selection menu is taller. */
const MENU_WIDTH = 208
const MENU_MAX_HEIGHT = 336
const HANDLE_HEIGHT = 28
/** Grace period before the handle hides when the pointer leaves the editor. */
const HIDE_DELAY = 300

export default function BlockControls({
  editorRef,
  disabled = false,
  onDropBlock,
  onAction,
}: BlockControlsProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const hoveredBlockRef = useRef<HTMLElement | null>(null)
  /** Last pointer position seen over the editor (kept for scroll handling). */
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const draggedBlocksRef = useRef<HTMLElement[]>([])
  const dropReferenceRef = useRef<HTMLElement | null>(null)
  const menuOpenRef = useRef(false)
  const disabledRef = useRef(disabled)

  const handleDisabledRef = useRef(false)
  /** Block whose handle was clicked last — the anchor of the next shift range. */
  const anchorBlockRef = useRef<HTMLElement | null>(null)
  const selectionRef = useRef<BlockSelection | null>(null)

  const [handle, setHandle] = useState<{ top: number; label: string; block: HTMLElement } | null>(
    null
  )
  const [selection, setSelection] = useState<BlockSelection | null>(null)
  const [selectionRect, setSelectionRect] = useState<{ top: number; height: number } | null>(null)
  const [menu, setMenu] = useState<{
    top: number
    left: number
    kind: BlockKind
    blocks: HTMLElement[]
    canIndent: boolean
  } | null>(null)
  const [dropTop, setDropTop] = useState<number | null>(null)

  // Native listeners read the latest values from refs (assigned on every render).
  disabledRef.current = disabled
  menuOpenRef.current = !!menu
  selectionRef.current = selection

  const selectionActive =
    !!selectionRect &&
    !!selection &&
    selection.blocks.length > 1 &&
    // Undo/redo and external value syncs replace the whole subtree — the
    // selection would be stale, so it must not paint over the new content.
    selection.blocks.every((block) => block.isConnected)
  const hoveredBlock = handle?.block ?? null
  const hoverInsideSelection =
    selectionActive && !!hoveredBlock && !!selection && selection.blocks.includes(hoveredBlock)

  // The handle pins itself to the top of a selection — unless the pointer is
  // hovering a block outside of it, where it follows that block so a
  // shift+click can grow the range.
  const activeHandle: ActiveHandle | null = (() => {
    if (selectionActive && selection && selectionRect && (!hoveredBlock || hoverInsideSelection)) {
      const count = selection.blocks.length
      return {
        top: selectionRect.top,
        label: String(count),
        title: `${count} blocks selected`,
        blocks: selection.blocks,
      }
    }
    if (handle) {
      return {
        top: handle.top,
        label: handle.label,
        title: `Block options (${handle.label})`,
        blocks: [handle.block],
      }
    }
    return null
  })()

  const clearSelection = useCallback(() => {
    selectionRef.current = null
    setSelection(null)
    setSelectionRect(null)
  }, [])

  /** Keep the selection overlay glued to its blocks (scroll, resize, edits). */
  const syncSelectionRect = useCallback(() => {
    const editor = editorRef.current
    const current = selectionRef.current
    if (!editor || !current) {
      setSelectionRect(null)
      return
    }

    const live = current.blocks.filter(
      (block) => block.isConnected && block.parentElement === editor
    )
    if (live.length !== current.blocks.length) {
      // The owner rewrote the document (delete, undo, …) — drop the selection.
      selectionRef.current = null
      setSelection(null)
      setSelectionRect(null)
      return
    }

    const editorRect = editor.getBoundingClientRect()
    const firstRect = live[0].getBoundingClientRect()
    const lastRect = live[live.length - 1].getBoundingClientRect()
    setSelectionRect({
      top: firstRect.top - editorRect.top,
      height: Math.max(lastRect.bottom - firstRect.top, 4),
    })
  }, [editorRef])

  // Follow the selection while the editor scrolls, and let a second Escape
  // clear it (the first one belongs to the menu).
  useEffect(() => {
    if (!selection) return

    syncSelectionRect()

    const editor = editorRef.current
    const remeasure = () => {
      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        syncSelectionRect()
      })
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || menuOpenRef.current) return
      clearSelection()
    }

    editor?.addEventListener('scroll', remeasure, true)
    window.addEventListener('resize', remeasure)
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      editor?.removeEventListener('scroll', remeasure, true)
      window.removeEventListener('resize', remeasure)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [clearSelection, editorRef, selection, syncSelectionRect])

  // Hover handles only make sense for mouse/trackpad. Touch users reorder with
  // Alt+↑/↓ (handled by the editor).
  useEffect(() => {
    handleDisabledRef.current =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      !window.matchMedia('(pointer: fine)').matches
  }, [])

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const hideHandle = useCallback(() => {
    cancelHide()
    hoveredBlockRef.current = null
    setHandle(null)
  }, [cancelHide])

  const scheduleHide = useCallback(() => {
    cancelHide()
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      hoveredBlockRef.current = null
      setHandle(null)
    }, HIDE_DELAY)
  }, [cancelHide])

  /** Keep the handle aligned while the block is hovered. */
  const positionHandle = useCallback(
    (block: HTMLElement) => {
      const editor = editorRef.current
      if (!editor) return

      const editorRect = editor.getBoundingClientRect()
      const blockRect = block.getBoundingClientRect()

      const fullyAbove = blockRect.bottom < editorRect.top
      const fullyBelow = blockRect.top > editorRect.bottom
      if (fullyAbove || fullyBelow) {
        setHandle(null)
        return
      }

      const top = Math.max(0, Math.min(
        blockRect.top - editorRect.top,
        editorRect.height - HANDLE_HEIGHT
      ))

      hoveredBlockRef.current = block
      setHandle({ top, label: blockLabel(blockKind(block)), block })
    },
    [editorRef]
  )

  // ── Hover tracking ──────────────────────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    // `pointermove` keeps the handle aligned while moving inside a block;
    // `pointerover` also fires when the element under a stationary cursor
    // changes (e.g. the menu closes) — without it the handle would stay hidden.
    const onPointerActivity = (event: PointerEvent) => {
      if (disabledRef.current || menuOpenRef.current || handleDisabledRef.current) return
      pointerRef.current = { x: event.clientX, y: event.clientY }
      // While dragging a block the handle belongs to the dragged run.
      if (draggedBlocksRef.current.length > 0) return

      const target = event.target as Node | null
      const clientY = event.clientY

      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        if (disabledRef.current || handleDisabledRef.current) return
        if (draggedBlocksRef.current.length > 0) return

        // The handle lives in the left gutter, where there is no text under the
        // pointer — fall back to the block at the pointer's height so reaching
        // for the handle does not make it disappear.
        const block = getTopLevelBlock(target, editor) ?? blockAtPoint(editor, clientY)
        if (!block) {
          setHandle(null)
          return
        }
        positionHandle(block)
      })
    }

    const onPointerLeave = (event: PointerEvent) => {
      if (menuOpenRef.current) return
      // `relatedTarget` is not always a Node (React can hand over `window`).
      const related = event.relatedTarget instanceof Node ? event.relatedTarget : null
      if (related && (handleRef.current?.contains(related) || menuRef.current?.contains(related))) {
        return
      }
      pointerRef.current = null
      scheduleHide()
    }

    const onScrollOrResize = () => {
      if (menuOpenRef.current) {
        setMenu(null)
        menuOpenRef.current = false
      }

      // Scrolling must not make the handle vanish — the content moves, the
      // pointer does not, so re-derive the block from the pointer position.
      const pointer = pointerRef.current
      if (!pointer) {
        hideHandle()
        return
      }

      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        const block = blockAtPoint(editor, pointer.y)
        if (!block) {
          hideHandle()
          return
        }
        positionHandle(block)
      })
    }

    // Clicking into the text ends a block selection — the overlay sits outside
    // the editor, so any pointerdown inside it means "back to plain editing".
    const onEditorPointerDown = () => {
      if (selectionRef.current) clearSelection()
    }

    editor.addEventListener('pointermove', onPointerActivity)
    editor.addEventListener('pointerover', onPointerActivity)
    editor.addEventListener('pointerleave', onPointerLeave)
    editor.addEventListener('pointerdown', onEditorPointerDown)
    editor.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)

    return () => {
      editor.removeEventListener('pointermove', onPointerActivity)
      editor.removeEventListener('pointerover', onPointerActivity)
      editor.removeEventListener('pointerleave', onPointerLeave)
      editor.removeEventListener('pointerdown', onEditorPointerDown)
      editor.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [clearSelection, editorRef, hideHandle, positionHandle, scheduleHide])

  // ── Drag & drop reordering ──────────────────────────────────────────────
  const resetDrag = useCallback(() => {
    draggedBlocksRef.current.forEach((block) => {
      block.style.opacity = ''
    })
    draggedBlocksRef.current = []
    dropReferenceRef.current = null
    setDropTop(null)
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const onDragOver = (event: DragEvent) => {
      const dragged = draggedBlocksRef.current
      if (dragged.length === 0 || disabledRef.current) return

      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'

      // Every block of the dragged run is ignored, so the indicator lands on a
      // real target and never inside the selection itself.
      const reference = findDropReference(editor, event.clientY, dragged)
      dropReferenceRef.current = reference
      setDropTop(dropIndicatorTop(editor, reference))
    }

    const onDrop = (event: DragEvent) => {
      const dragged = draggedBlocksRef.current
      if (dragged.length === 0 || disabledRef.current) return

      event.preventDefault()
      const reference = dropReferenceRef.current
      resetDrag()
      onDropBlock(dragged, reference)
    }

    editor.addEventListener('dragover', onDragOver)
    editor.addEventListener('drop', onDrop)
    window.addEventListener('dragend', resetDrag)

    return () => {
      editor.removeEventListener('dragover', onDragOver)
      editor.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', resetDrag)
    }
  }, [editorRef, onDropBlock, resetDrag])

  // ── Menu lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!menu) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setMenu(null)
      menuRef.current = null
      editorRef.current?.focus({ preventScroll: true })
    }

    const onPointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (
        target &&
        (menuRef.current?.contains(target) || handleRef.current?.contains(target))
      ) {
        return
      }
      setMenu(null)
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDownOutside, true)
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('button')
    firstItem?.focus({ preventScroll: true })

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDownOutside, true)
    }
  }, [editorRef, menu])

  const openMenu = useCallback(
    ({ extend, blocks }: { extend: boolean; blocks: HTMLElement[] }) => {
      // The blocks travel with the handle so a pending hide timer can never
      // turn the click into a no-op.
      const editor = editorRef.current
      const clicked = blocks[0] ?? handle?.block ?? hoveredBlockRef.current
      if (!clicked || !clicked.isConnected || !editor || disabledRef.current) return

      let nextBlocks = blocks.length > 0 ? blocks : [clicked]

      // Shift+click grows (or shrinks) the range towards the clicked block.
      if (extend) {
        const anchor = selectionRef.current?.anchor ?? anchorBlockRef.current ?? clicked
        const range = getBlockRange(editor, anchor, clicked)
        if (range.length > 0) nextBlocks = range
      }

      if (nextBlocks.length > 1) {
        const anchor =
          selectionRef.current && nextBlocks.includes(selectionRef.current.anchor)
            ? selectionRef.current.anchor
            : nextBlocks[0]
        const next: BlockSelection = { anchor, blocks: nextBlocks }
        selectionRef.current = next
        setSelection(next)
        syncSelectionRect()
      } else {
        anchorBlockRef.current = clicked
        clearSelection()
        anchorBlockRef.current = clicked
      }

      const firstRect = nextBlocks[0].getBoundingClientRect()
      const editorRect = editor.getBoundingClientRect()

      const top = Math.max(
        4,
        Math.min(
          firstRect.top - editorRect.top,
          Math.max(4, editorRect.height - MENU_MAX_HEIGHT - 4)
        )
      )
      const left = Math.max(4, Math.min(30, editorRect.width - MENU_WIDTH - 4))

      cancelHide()
      setMenu({
        top,
        left,
        kind: blockKind(nextBlocks[0]),
        blocks: nextBlocks,
        canIndent: nextBlocks.some((block) => canIndentBlock(block)),
      })
    },
    [cancelHide, clearSelection, editorRef, handle, syncSelectionRect]
  )

  const runAction = useCallback(
    (id: BlockActionId) => {
      const blocks = menu?.blocks ?? []
      setMenu(null)
      hideHandle()

      if (id === 'clear-selection') {
        clearSelection()
        return
      }

      if (blocks.length === 0) return
      onAction(id, blocks)

      // The owner edits the DOM synchronously — re-measure on the next frame.
      // Blocks that were deleted disconnect themselves and clear the selection
      // inside syncSelectionRect.
      window.requestAnimationFrame(() => syncSelectionRect())
    },
    [clearSelection, hideHandle, menu, onAction, syncSelectionRect]
  )

  const handleMenuKeys = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

      const container = menuRef.current
      if (!container) return

      const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      if (buttons.length === 0) return

      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next =
        event.key === 'ArrowDown'
          ? current < 0
            ? 0
            : (current + 1) % buttons.length
          : current <= 0
            ? buttons.length - 1
            : current - 1

      event.preventDefault()
      buttons[next]?.focus()
    },
    []
  )

  const kind = menu?.kind ?? 'other'
  const isMulti = (menu?.blocks.length ?? 0) > 1
  const showTurnInto = !isMulti && !isStructuralBlock(kind)
  const actionEntries = ACTION_ENTRIES.filter(
    ({ id }) => (id !== 'indent' && id !== 'outdent') || (menu?.canIndent ?? false)
  )

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 z-30"
      aria-hidden={false}
    >
      {dropTop !== null && (
        <div
          className="absolute left-1 right-3 h-0.5 rounded-full bg-alpine-500"
          style={{ top: dropTop }}
          aria-hidden="true"
        />
      )}

      {selectionActive && selectionRect && (
        <div
          data-testid="block-selection-highlight"
          className="absolute left-0 right-2 rounded-md bg-alpine-500/10 ring-1 ring-inset ring-alpine-500/30"
          style={{ top: selectionRect.top, height: selectionRect.height }}
          aria-hidden="true"
        />
      )}

      {activeHandle && !menu && (
        <button
          ref={handleRef}
          type="button"
          tabIndex={-1}
          title={activeHandle.title}
          aria-label={activeHandle.title}
          className="pointer-events-auto absolute left-0 flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-transparent text-[10px] font-semibold text-muted opacity-70 transition-colors hover:border-border hover:bg-surface-hover hover:text-foreground hover:opacity-100 active:cursor-grabbing"
          style={{ top: activeHandle.top }}
          draggable
          onPointerEnter={cancelHide}
          onPointerOver={cancelHide}
          onPointerMove={cancelHide}
          onPointerLeave={(event) => {
            if (menuOpenRef.current) return
            // `relatedTarget` is not always a Node — React can hand over the
            // `window` (e.g. leaving towards the browser chrome), and calling
            // `contains()` with it would throw inside the event dispatch.
            const related = event.relatedTarget instanceof Node ? event.relatedTarget : null
            if (related && menuRef.current?.contains(related)) return
            // Leaving into the editor keeps the handle (the editor's hover
            // handler re-arms it); leaving anywhere else hides it.
            if (related && editorRef.current?.contains(related)) return
            scheduleHide()
          }}
          onClick={(event) => {
            openMenu({ extend: event.shiftKey, blocks: activeHandle.blocks })
          }}
          onDragStart={(event) => {
            const live = activeHandle.blocks.filter((block) => block.isConnected)
            if (live.length === 0) {
              event.preventDefault()
              return
            }
            draggedBlocksRef.current = live
            live.forEach((block) => {
              block.style.opacity = '0.45'
            })
            event.dataTransfer?.setData(
              'text/plain',
              live
                .map((block) => block.textContent ?? '')
                .join('\n')
                .slice(0, 200)
            )
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
            setMenu(null)
          }}
        >
          <span aria-hidden="true">{activeHandle.label}</span>
        </button>
      )}

      {activeHandle && !menu && <div className="sr-only">{activeHandle.title}</div>}

      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Block options"
          className="pointer-events-auto absolute flex max-h-[336px] flex-col overflow-y-auto rounded-xl border border-border bg-surface/98 p-1 shadow-xl backdrop-blur-xl"
          style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
          onKeyDown={handleMenuKeys}
        >
          {isMulti && (
            <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              {menu.blocks.length} blocks selected
            </div>
          )}

          {showTurnInto && (
            <>
              <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Turn into
              </div>
              {TURN_INTO_ENTRIES.map(({ id, label, Icon, matches }) => {
                const active = matches.includes(kind)
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    onClick={() => runAction(id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                      active
                        ? 'bg-alpine-50 font-medium text-alpine-700 dark:bg-alpine-900/40 dark:text-alpine-300'
                        : 'text-foreground hover:bg-surface-hover'
                    }`}
                  >
                    <Icon size={15} strokeWidth={2} />
                    <span className="flex-1 truncate">{label}</span>
                  </button>
                )
              })}
              <div className="my-1 h-px bg-border" />
            </>
          )}

          {actionEntries.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => runAction(id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                id === 'delete'
                  ? 'text-danger hover:bg-danger-light/60'
                  : 'text-foreground hover:bg-surface-hover'
              }`}
            >
              <Icon size={15} strokeWidth={2} />
              <span className="flex-1 truncate">{label}</span>
            </button>
          ))}

          {isMulti && (
            <>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction('clear-selection')}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <X size={15} strokeWidth={2} />
                <span className="flex-1 truncate">Clear selection</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
