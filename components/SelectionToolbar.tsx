'use client'

import { forwardRef, memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Quote,
  List,
  ListOrdered,
  CheckSquare,
  ChevronDown,
  Copy,
  Eraser,
  MoreHorizontal,
  Undo,
  Redo,
} from 'lucide-react'
import type { RichTextCommand } from './RichTextEditor'
import { useIsMobile } from '@/lib/useIsMobile'

/* Types */

interface SelectionToolbarProps {
  top: number
  left: number
  visible: boolean
  activeFormats: Set<string>
  onCommand: (command: RichTextCommand) => void
  isDisabled?: boolean
  /** Touch/compact layout: dock the toolbar at the bottom edge. */
  docked?: boolean
  /** Escape pressed while the toolbar has focus (or is visible). */
  onDismiss?: () => void
}

/* Static button descriptors (allocated once) */

interface HeadingOption {
  level: number
  command: RichTextCommand
  label: string
  shortcut: string
}

const HEADING_OPTIONS: HeadingOption[] = [
  { level: 1, command: 'heading1', label: 'Heading 1', shortcut: '\u2318/Ctrl+Alt+1' },
  { level: 2, command: 'heading2', label: 'Heading 2', shortcut: '\u2318/Ctrl+Alt+2' },
  { level: 3, command: 'heading3', label: 'Heading 3', shortcut: '\u2318/Ctrl+Alt+3' },
  { level: 4, command: 'heading4', label: 'Heading 4', shortcut: '\u2318/Ctrl+Alt+4' },
  { level: 5, command: 'heading5', label: 'Heading 5', shortcut: '\u2318/Ctrl+Alt+5' },
  { level: 6, command: 'heading6', label: 'Heading 6', shortcut: '\u2318/Ctrl+Alt+6' },
]

const INLINE_BUTTONS = [
  { command: 'bold' as RichTextCommand, Icon: Bold, label: 'Bold', shortcut: '\u2318/Ctrl+B' },
  { command: 'italic' as RichTextCommand, Icon: Italic, label: 'Italic', shortcut: '\u2318/Ctrl+I' },
  { command: 'underline' as RichTextCommand, Icon: Underline, label: 'Underline', shortcut: '\u2318/Ctrl+U' },
  { command: 'strike' as RichTextCommand, Icon: Strikethrough, label: 'Strikethrough', shortcut: '\u2318/Ctrl+\u21e7+X' },
  { command: 'code' as RichTextCommand, Icon: Code, label: 'Inline Code', shortcut: '\u2318/Ctrl+`' },
] as const

const ALIGNMENT_BUTTONS = [
  { command: 'align-left' as RichTextCommand, Icon: AlignLeft, label: 'Align Left', shortcut: '' },
  { command: 'align-center' as RichTextCommand, Icon: AlignCenter, label: 'Center', shortcut: '\u2318/Ctrl+\u21e7+E' },
  { command: 'align-right' as RichTextCommand, Icon: AlignRight, label: 'Align Right', shortcut: '\u2318/Ctrl+\u21e7+R' },
] as const

const LIST_BUTTONS = [
  { command: 'unordered-list' as RichTextCommand, Icon: List, label: 'Bullet List', shortcut: '\u2318/Ctrl+\u21e7+L' },
  { command: 'ordered-list' as RichTextCommand, Icon: ListOrdered, label: 'Numbered List', shortcut: '\u2318/Ctrl+\u21e7+O' },
  { command: 'checklist' as RichTextCommand, Icon: CheckSquare, label: 'Checklist', shortcut: '\u2318/Ctrl+\u21e7+C' },
] as const

interface ColorSwatch {
  key: string
  bg: string
  border?: string
  label: string
}

const HIGHLIGHT_COLORS: ColorSwatch[] = [
  { key: 'yellow', bg: 'bg-yellow-300', label: 'Yellow highlight' },
  { key: 'green', bg: 'bg-green-300', label: 'Green highlight' },
  { key: 'pink', bg: 'bg-pink-300', label: 'Pink highlight' },
  { key: 'blue', bg: 'bg-blue-300', label: 'Blue highlight' },
]

const TEXT_COLORS: ColorSwatch[] = [
  { key: 'default', bg: 'bg-transparent', border: 'border border-gray-300 dark:border-gray-500', label: 'Default color' },
  { key: 'red', bg: 'bg-red-500', label: 'Red text' },
  { key: 'green', bg: 'bg-green-500', label: 'Green text' },
  { key: 'blue', bg: 'bg-blue-500', label: 'Blue text' },
  { key: 'purple', bg: 'bg-purple-500', label: 'Purple text' },
]

const FONT_SIZES = [
  { key: '12', label: '12' },
  { key: '16', label: '16' },
  { key: '20', label: '20' },
  { key: '24', label: '24' },
] as const

const TEXT_CASE_OPTIONS = [
  { command: 'case:title' as RichTextCommand, label: 'Title Case', sample: 'Aa' },
  { command: 'case:upper' as RichTextCommand, label: 'UPPERCASE', sample: 'AA' },
  { command: 'case:lower' as RichTextCommand, label: 'lowercase', sample: 'aa' },
] as const

/**
 * Convert a display shortcut such as "⌘/Ctrl+⇧+X" into the two combos that
 * `aria-keyshortcuts` expects: "Meta+Shift+X Control+Shift+X".
 */
const toAriaKeyshortcuts = (display: string): string | undefined => {
  if (!display) return undefined

  const parts = display.split('+').map((part) => part.trim())
  if (parts.length < 2) return undefined

  const key = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1)
  const hasMeta = modifiers.some((modifier) => modifier.includes('\u2318'))
  const hasCtrl = modifiers.some((modifier) => /ctrl/i.test(modifier))
  const hasShift = modifiers.some((modifier) => modifier.includes('\u21e7'))
  const hasAlt = modifiers.some((modifier) => /alt/i.test(modifier))

  const combos: string[] = []
  const build = (primary: 'Meta' | 'Control') => {
    combos.push(
      [primary, ...(hasShift ? ['Shift'] : []), ...(hasAlt ? ['Alt'] : []), key].join('+')
    )
  }
  if (hasMeta) build('Meta')
  if (hasCtrl || !hasMeta) build('Control')

  return combos.join(' ')
}

/* Sub-components */

const Divider = memo(() => (
  <span
    className="mx-0.5 h-5 w-px shrink-0 bg-border"
    aria-hidden="true"
  />
))
Divider.displayName = 'Divider'

interface TBtnProps {
  active?: boolean
  disabled?: boolean
  title: string
  onClick: () => void
  mobile?: boolean
  className?: string
  /** Concatenated key combos for assistive tech, e.g. "Meta+B Control+B". */
  shortcut?: string
  children: React.ReactNode
}

const TBtn = memo<TBtnProps>(
  ({ active, disabled, title, onClick, mobile, className, shortcut, children }) => (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-pressed={active || undefined}
      aria-label={title}
      aria-keyshortcuts={shortcut}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={[
        'inline-flex items-center justify-center rounded-full border transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-alpine-500',
        'disabled:pointer-events-none disabled:opacity-40',
        mobile ? 'h-10 w-10' : 'h-8 w-8',
        active
          ? 'border-alpine-300 bg-alpine-50 text-alpine-700 dark:border-alpine-600 dark:bg-alpine-900/50 dark:text-alpine-300'
          : 'border-transparent text-muted hover:border-border hover:bg-surface-hover hover:text-foreground',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  ),
)
TBtn.displayName = 'TBtn'

/* Main component */

const SelectionToolbar = forwardRef<HTMLDivElement | null, SelectionToolbarProps>(
  (
    {
      top,
      left,
      visible,
      activeFormats,
      onCommand,
      isDisabled,
      docked = false,
      onDismiss,
    },
    ref
  ) => {
    const [showMore, setShowMore] = useState(false)
    const [headingOpen, setHeadingOpen] = useState(false)
    const [headingOpensUp, setHeadingOpensUp] = useState(false)
    const [caseOpen, setCaseOpen] = useState(false)
    const headingRef = useRef<HTMLDivElement>(null)
    const caseRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const isMobile = useIsMobile()
    const iconSize = isMobile ? 17 : 15

    // Merge the forwarded (measured) ref with the internal one used for keyboard
    // navigation and the dropdown flip decision.
    const setContainerRef = useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node
        if (typeof ref === 'function') {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      },
      [ref]
    )

    // Reset dropdowns when toolbar hides
    useEffect(() => {
      if (!visible) {
        setShowMore(false)
        setHeadingOpen(false)
        setCaseOpen(false)
      }
    }, [visible])

    // Close heading dropdown on outside click
    useEffect(() => {
      if (!headingOpen) return
      const handler = (e: MouseEvent) => {
        if (
          headingRef.current &&
          !headingRef.current.contains(e.target as Node)
        ) {
          setHeadingOpen(false)
        }
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [headingOpen])

    // Close the text-case dropdown on outside click
    useEffect(() => {
      if (!caseOpen) return
      const handler = (e: MouseEvent) => {
        if (caseRef.current && !caseRef.current.contains(e.target as Node)) {
          setCaseOpen(false)
        }
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [caseOpen])

    const fire = useCallback(
      (cmd: RichTextCommand) => {
        if (!isDisabled) onCommand(cmd)
      },
      [isDisabled, onCommand],
    )

    /** Keep the text selection alive: never let presses steal focus from the editor. */
    const keepSelection = useCallback((event: React.SyntheticEvent) => {
      event.preventDefault()
    }, [])

    const toggleHeadingDropdown = useCallback(() => {
      const next = !headingOpen
      if (next) {
        // Open towards the side with more room so the menu stays on screen.
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          const spaceAbove = rect.top
          const spaceBelow = window.innerHeight - rect.bottom
          setHeadingOpensUp(spaceAbove > spaceBelow)
        }
      }
      setHeadingOpen(next)
    }, [headingOpen])

    // Keyboard support: arrows/Home/End move between buttons, Escape dismisses.
    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
          if (headingOpen || caseOpen) {
            // Close only the dropdown; the toolbar stays (and keeps the selection).
            event.stopPropagation()
            setHeadingOpen(false)
            setCaseOpen(false)
            return
          }
          // No dropdown: dismiss the toolbar but let the event bubble — the
          // owner (useFloatingToolbar) then returns focus to the editor.
          onDismiss?.()
          return
        }

        if (
          event.key !== 'ArrowRight' &&
          event.key !== 'ArrowLeft' &&
          event.key !== 'ArrowDown' &&
          event.key !== 'ArrowUp' &&
          event.key !== 'Home' &&
          event.key !== 'End'
        ) {
          return
        }

        const container = containerRef.current
        if (!container) return

        const buttons = Array.from(
          container.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
        )
        if (buttons.length === 0) return

        event.preventDefault()
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)

        let nextIndex = current
        switch (event.key) {
          case 'ArrowRight':
          case 'ArrowDown':
            nextIndex = current < 0 ? 0 : (current + 1) % buttons.length
            break
          case 'ArrowLeft':
          case 'ArrowUp':
            nextIndex = current <= 0 ? buttons.length - 1 : current - 1
            break
          case 'Home':
            nextIndex = 0
            break
          case 'End':
            nextIndex = buttons.length - 1
            break
        }
        buttons[nextIndex]?.focus()
      },
      [headingOpen, onDismiss]
    )
    if (!visible) return null

    const activeHeading = HEADING_OPTIONS.find((h) =>
      activeFormats.has(h.command),
    )
    const headingBtnLabel = activeHeading ? `H${activeHeading.level}` : 'P'

    const tip = (label: string, shortcut?: string) =>
      shortcut ? `${label} (${shortcut})` : label

    return (
      <div
        ref={setContainerRef}
        role="toolbar"
        aria-label="Text formatting"
        aria-orientation="horizontal"
        className="selection-toolbar-in fixed z-50 flex flex-col rounded-2xl border border-border bg-surface/95 backdrop-blur-xl shadow-lg"
        style={
          docked
            ? {
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
                left: 0,
                right: 0,
                marginLeft: 'auto',
                marginRight: 'auto',
                width: 'fit-content',
                maxWidth: 'calc(100vw - 24px)',
              }
            : { top, left, maxWidth: 'calc(100vw - 32px)' }
        }
        onPointerDown={keepSelection}
        onMouseDown={keepSelection}
        onKeyDown={handleKeyDown}
      >
        {/* Primary row */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
          {/* Heading selector */}
          <div ref={headingRef} className="relative">
            <button
              type="button"
              disabled={isDisabled}
              title="Text type"
              aria-haspopup="listbox"
              aria-expanded={headingOpen}
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleHeadingDropdown}
              className={[
                'inline-flex items-center gap-0.5 rounded-full border px-2 text-xs font-semibold transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-alpine-500',
                'disabled:pointer-events-none disabled:opacity-40',
                isMobile ? 'h-10' : 'h-8',
                activeHeading
                  ? 'border-alpine-300 bg-alpine-50 text-alpine-700 dark:border-alpine-600 dark:bg-alpine-900/50 dark:text-alpine-300'
                  : 'border-transparent text-gray-600 hover:border-gray-300 hover:bg-gray-100 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700',
              ].join(' ')}
            >
              {headingBtnLabel}
              <ChevronDown
                size={12}
                className={`transition-transform ${headingOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {headingOpen && (
              <div
                role="listbox"
                className={`absolute left-0 z-10 min-w-[160px] overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-surface py-1 shadow-xl ${
                  headingOpensUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                }`}
                // Never taller than the space a small window/short viewport has.
                style={{ maxHeight: 'min(320px, 50vh)' }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={!activeHeading}
                  onClick={() => {
                    if (activeHeading) fire(activeHeading.command)
                    setHeadingOpen(false)
                  }}
                  className={`flex w-full items-center px-3 py-1.5 text-sm transition-colors ${
                    !activeHeading
                      ? 'bg-alpine-50 font-medium text-alpine-700 dark:bg-alpine-900/40 dark:text-alpine-300'
                      : 'text-foreground hover:bg-surface-hover'
                  }`}
                >
                  Paragraph
                </button>

                {HEADING_OPTIONS.map(({ level, command, label, shortcut }) => (
                  <button
                    key={command}
                    type="button"
                    role="option"
                    aria-selected={activeFormats.has(command)}
                    onClick={() => {
                      fire(command)
                      setHeadingOpen(false)
                    }}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-sm transition-colors ${
                      activeFormats.has(command)
                        ? 'bg-alpine-50 font-medium text-alpine-700 dark:bg-alpine-900/40 dark:text-alpine-300'
                        : 'text-foreground hover:bg-surface-hover'
                    }`}
                  >
                    <span>{label}</span>
                    <kbd className="text-[10px] text-muted">
                      {shortcut}
                    </kbd>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Divider />

          {/* Inline formatting */}
          {INLINE_BUTTONS.map(({ command, Icon, label, shortcut }) => (
            <TBtn
              key={command}
              active={activeFormats.has(command)}
              disabled={isDisabled}
              title={tip(label, shortcut)}
              shortcut={toAriaKeyshortcuts(shortcut)}
              onClick={() => fire(command)}
              mobile={isMobile}
            >
              <Icon size={iconSize} />
            </TBtn>
          ))}

          <Divider />

          {/* Link */}
          <TBtn
            disabled={isDisabled}
            title={tip('Link', '\u2318/Ctrl+K')}
            shortcut="Meta+K Control+K"
            onClick={() => fire('link')}
            mobile={isMobile}
          >
            <LinkIcon size={iconSize} />
          </TBtn>

          {/* Copy selection */}
          <TBtn
            disabled={isDisabled}
            title={tip('Copy', '\u2318/Ctrl+C')}
            shortcut="Meta+C Control+C"
            onClick={() => fire('copy')}
            mobile={isMobile}
          >
            <Copy size={iconSize} />
          </TBtn>

          <Divider />

          {/* Alignment */}
          {ALIGNMENT_BUTTONS.map(({ command, Icon, label, shortcut }) => (
            <TBtn
              key={command}
              active={activeFormats.has(command)}
              disabled={isDisabled}
              title={tip(label, shortcut)}
              shortcut={toAriaKeyshortcuts(shortcut)}
              onClick={() => fire(command)}
              mobile={isMobile}
            >
              <Icon size={iconSize} />
            </TBtn>
          ))}

          <Divider />

          {/* Blockquote */}
          <TBtn
            active={activeFormats.has('blockquote')}
            disabled={isDisabled}
            title={tip('Blockquote', '\u2318/Ctrl+\u21e7+B')}
            shortcut="Meta+Shift+B Control+Shift+B"
            onClick={() => fire('blockquote')}
            mobile={isMobile}
          >
            <Quote size={iconSize} />
          </TBtn>

          <Divider />

          {/* More toggle */}
          <TBtn
            active={showMore}
            disabled={isDisabled}
            title="More formatting options"
            onClick={() => setShowMore((v) => !v)}
            mobile={isMobile}
          >
            <MoreHorizontal size={iconSize} />
          </TBtn>
        </div>

        {/* Expanded panel */}
        {showMore && (
          <div
            className="flex flex-wrap items-center gap-0.5 border-t border-border px-2 py-1.5"
            onMouseDown={(e) => e.preventDefault()}
          >
            {/* Lists */}
            {LIST_BUTTONS.map(({ command, Icon, label, shortcut }) => (
              <TBtn
                key={command}
                active={activeFormats.has(command)}
                disabled={isDisabled}
                title={tip(label, shortcut)}
                shortcut={toAriaKeyshortcuts(shortcut)}
                onClick={() => fire(command)}
                mobile={isMobile}
              >
                <Icon size={iconSize} />
              </TBtn>
            ))}

            <Divider />

            {/* Highlight colors */}
            {HIGHLIGHT_COLORS.map(({ key, bg, label }) => {
              const cmd = `highlight:${key}` as RichTextCommand
              return (
                <TBtn
                  key={key}
                  active={activeFormats.has(cmd)}
                  disabled={isDisabled}
                  title={label}
                  onClick={() => fire(cmd)}
                  mobile={isMobile}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-sm ${bg}`} />
                </TBtn>
              )
            })}
            <TBtn
              disabled={isDisabled}
              title="Clear highlight"
              onClick={() => fire('highlight:clear' as RichTextCommand)}
              mobile={isMobile}
            >
              <span className="text-[10px] font-medium leading-none">{'\u2715'}</span>
            </TBtn>

            <Divider />

            {/* Text colors */}
            {TEXT_COLORS.map(({ key, bg, border, label }) => {
              const cmd = `color:${key}` as RichTextCommand
              return (
                <TBtn
                  key={key}
                  active={activeFormats.has(cmd)}
                  disabled={isDisabled}
                  title={label}
                  onClick={() => fire(cmd)}
                  mobile={isMobile}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-sm ${bg} ${border ?? ''}`}
                  />
                </TBtn>
              )
            })}

            <Divider />

            {/* Font sizes */}
            {FONT_SIZES.map(({ key, label }) => (
              <TBtn
                key={key}
                disabled={isDisabled}
                title={`Font size ${label}px`}
                onClick={() => fire(`font-size:${key}` as RichTextCommand)}
                mobile={isMobile}
              >
                <span className="text-[10px] font-medium leading-none">
                  {label}
                </span>
              </TBtn>
            ))}
            <TBtn
              disabled={isDisabled}
              title="Reset font size"
              onClick={() => fire('font-size:clear' as RichTextCommand)}
              mobile={isMobile}
            >
              <span className="text-[10px] font-medium leading-none">{`A\u21ba`}</span>
            </TBtn>

            {/* Text case */}
            <div ref={caseRef} className="relative">
              <TBtn
                active={caseOpen}
                disabled={isDisabled}
                title="Change case"
                onClick={() => setCaseOpen((value) => !value)}
                mobile={isMobile}
              >
                <span className="text-[10px] font-semibold leading-none">Aa</span>
              </TBtn>

              {caseOpen && (
                <div
                  role="menu"
                  aria-label="Change case"
                  className="absolute bottom-full left-0 z-10 mb-1.5 min-w-[152px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {TEXT_CASE_OPTIONS.map(({ command, label, sample }) => (
                    <button
                      key={command}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        fire(command)
                        setCaseOpen(false)
                      }}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-hover"
                    >
                      <span>{label}</span>
                      <span className="text-[10px] text-muted">{sample}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Divider />

            {/* Undo / Redo */}
            <TBtn
              disabled={isDisabled}
              title={tip('Undo', '\u2318/Ctrl+Z')}
              shortcut="Meta+Z Control+Z"
              onClick={() => fire('undo')}
              mobile={isMobile}
            >
              <Undo size={iconSize} />
            </TBtn>
            <TBtn
              disabled={isDisabled}
              title={tip('Redo', '\u2318/Ctrl+\u21e7+Z')}
              shortcut="Meta+Shift+Z Control+Shift+Z"
              onClick={() => fire('redo')}
              mobile={isMobile}
            >
              <Redo size={iconSize} />
            </TBtn>

            <Divider />

            {/* Clear formatting */}
            <TBtn
              disabled={isDisabled}
              title={tip('Clear formatting', '\u2318/Ctrl+\\')}
              shortcut="Meta+\\ Control+\\"
              onClick={() => fire('clear-formatting')}
              mobile={isMobile}
            >
              <Eraser size={iconSize} />
            </TBtn>
          </div>
        )}
      </div>
    )
  },
)

SelectionToolbar.displayName = 'SelectionToolbar'

export default memo(SelectionToolbar)
