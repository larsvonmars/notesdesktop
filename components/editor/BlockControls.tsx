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
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import {
  blockKind,
  blockLabel,
  dropIndicatorTop,
  findDropReference,
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

interface BlockControlsProps {
  editorRef: React.RefObject<HTMLDivElement | null>
  disabled?: boolean
  /** A block was dropped: the owner moves it (history + persistence). */
  onDropBlock: (block: HTMLElement, reference: HTMLElement | null) => void
  /** Runs a menu action against a block. */
  onAction: (action: BlockActionId, block: HTMLElement) => void
}

interface MenuEntry {
  id: BlockActionId
  label: string
  Icon: LucideIcon
  /** Block kinds this entry currently represents (ticked in the menu). */
  matches: BlockKind[]
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
  { id: 'move-up', label: 'Move up', Icon: ArrowUp, matches: [] },
  { id: 'move-down', label: 'Move down', Icon: ArrowDown, matches: [] },
  { id: 'delete', label: 'Delete', Icon: Trash2, matches: [] },
]

const MENU_WIDTH = 208
const MENU_MAX_HEIGHT = 336
const HANDLE_HEIGHT = 24
const HIDE_DELAY = 140

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
  const draggedBlockRef = useRef<HTMLElement | null>(null)
  const dropReferenceRef = useRef<HTMLElement | null>(null)
  const menuOpenRef = useRef(false)
  const disabledRef = useRef(disabled)

  const handleDisabledRef = useRef(false)

  const [handle, setHandle] = useState<{ top: number; label: string; block: HTMLElement } | null>(
    null
  )
  const [menu, setMenu] = useState<{
    top: number
    left: number
    kind: BlockKind
    block: HTMLElement
  } | null>(null)
  const [dropTop, setDropTop] = useState<number | null>(null)

  disabledRef.current = disabled
  menuOpenRef.current = !!menu

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
      const target = event.target as Node | null

      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        if (disabledRef.current || handleDisabledRef.current) return

        const block = getTopLevelBlock(target, editor)
        if (!block) {
          setHandle(null)
          return
        }
        positionHandle(block)
      })
    }

    const onPointerLeave = (event: PointerEvent) => {
      if (menuOpenRef.current) return
      const related = event.relatedTarget as Node | null
      if (
        related &&
        (handleRef.current?.contains(related) || menuRef.current?.contains(related))
      ) {
        return
      }
      scheduleHide()
    }

    const onScrollOrResize = () => {
      if (menuOpenRef.current) {
        setMenu(null)
        menuOpenRef.current = false
      }
      hideHandle()
    }

    editor.addEventListener('pointermove', onPointerActivity)
    editor.addEventListener('pointerover', onPointerActivity)
    editor.addEventListener('pointerleave', onPointerLeave)
    editor.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)

    return () => {
      editor.removeEventListener('pointermove', onPointerActivity)
      editor.removeEventListener('pointerover', onPointerActivity)
      editor.removeEventListener('pointerleave', onPointerLeave)
      editor.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [editorRef, hideHandle, positionHandle, scheduleHide])

  // ── Drag & drop reordering ──────────────────────────────────────────────
  const resetDrag = useCallback(() => {
    const dragged = draggedBlockRef.current
    if (dragged) {
      dragged.style.opacity = ''
    }
    draggedBlockRef.current = null
    dropReferenceRef.current = null
    setDropTop(null)
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const onDragOver = (event: DragEvent) => {
      const dragged = draggedBlockRef.current
      if (!dragged || disabledRef.current) return

      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'

      const reference = findDropReference(editor, event.clientY, dragged)
      dropReferenceRef.current = reference
      setDropTop(dropIndicatorTop(editor, reference))
    }

    const onDrop = (event: DragEvent) => {
      const dragged = draggedBlockRef.current
      if (!dragged || disabledRef.current) return

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

  const openMenu = useCallback(() => {
    // The block travels with the handle so a pending hide timer can never turn
    // the click into a no-op.
    const block = handle?.block ?? hoveredBlockRef.current
    const editor = editorRef.current
    if (!block || !block.isConnected || !editor || disabledRef.current) return

    const editorRect = editor.getBoundingClientRect()
    const blockRect = block.getBoundingClientRect()

    const top = Math.max(4, Math.min(
      blockRect.top - editorRect.top,
      Math.max(4, editorRect.height - MENU_MAX_HEIGHT - 4)
    ))
    const left = Math.max(4, Math.min(30, editorRect.width - MENU_WIDTH - 4))

    cancelHide()
    setMenu({ top, left, kind: blockKind(block), block })
  }, [cancelHide, editorRef, handle])

  const runAction = useCallback(
    (id: BlockActionId) => {
      const block = menu?.block ?? null
      setMenu(null)
      hideHandle()
      if (!block || !block.isConnected) return
      onAction(id, block)
    },
    [hideHandle, menu, onAction]
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
  const showTurnInto = !isStructuralBlock(kind)

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

      {handle && !menu && (
        <button
          ref={handleRef}
          type="button"
          tabIndex={-1}
          title="Block options"
          aria-label={`Block options (${handle.label})`}
          className="pointer-events-auto absolute left-0.5 flex h-6 min-w-6 items-center justify-center rounded-md border border-transparent px-1 text-[10px] font-semibold text-muted opacity-70 transition-colors hover:border-border hover:bg-surface-hover hover:text-foreground hover:opacity-100"
          style={{ top: handle.top }}
          draggable
          onPointerEnter={cancelHide}
          onPointerLeave={(event) => {
            if (menuOpenRef.current) return
            const related = event.relatedTarget as Node | null
            if (related && menuRef.current?.contains(related)) return
            scheduleHide()
          }}
          onClick={openMenu}
          onDragStart={(event) => {
            const block = handle?.block ?? hoveredBlockRef.current
            if (!block || !block.isConnected) {
              event.preventDefault()
              return
            }
            draggedBlockRef.current = block
            block.style.opacity = '0.45'
            event.dataTransfer?.setData('text/plain', block.textContent?.slice(0, 200) ?? '')
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
            setMenu(null)
          }}
        >
          <span aria-hidden="true">{handle.label}</span>
        </button>
      )}

      {handle && !menu && <div className="sr-only">{`Block type ${handle.label}`}</div>}

      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Block options"
          className="pointer-events-auto absolute flex max-h-[336px] flex-col overflow-y-auto rounded-xl border border-border bg-surface/98 p-1 shadow-xl backdrop-blur-xl"
          style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
          onKeyDown={handleMenuKeys}
        >
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

          {ACTION_ENTRIES.map(({ id, label, Icon }) => (
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
        </div>
      )}
    </div>
  )
}
