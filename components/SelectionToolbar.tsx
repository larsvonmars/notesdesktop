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

/* Sub-components */

const Divider = memo(() => (
  <span
    className="mx-0.5 h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-600"
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
  children: React.ReactNode
}

const TBtn = memo<TBtnProps>(
  ({ active, disabled, title, onClick, mobile, className, children }) => (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-pressed={active || undefined}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={[
        'inline-flex items-center justify-center rounded-full border transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-alpine-500',
        'disabled:pointer-events-none disabled:opacity-40',
        mobile ? 'h-10 w-10' : 'h-8 w-8',
        active
          ? 'border-alpine-300 bg-alpine-50 text-alpine-700 dark:border-alpine-600 dark:bg-alpine-900/50 dark:text-alpine-300'
          : 'border-transparent text-gray-600 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-100',
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

const SelectionToolbar = forwardRef<HTMLDivElement, SelectionToolbarProps>(
  ({ top, left, visible, activeFormats, onCommand, isDisabled }, ref) => {
    const [showMore, setShowMore] = useState(false)
    const [headingOpen, setHeadingOpen] = useState(false)
    const headingRef = useRef<HTMLDivElement>(null)
    const isMobile = useIsMobile()
    const iconSize = isMobile ? 17 : 15

    // Reset dropdowns when toolbar hides
    useEffect(() => {
      if (!visible) {
        setShowMore(false)
        setHeadingOpen(false)
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

    const fire = useCallback(
      (cmd: RichTextCommand) => {
        if (!isDisabled) onCommand(cmd)
      },
      [isDisabled, onCommand],
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
        ref={ref}
        role="toolbar"
        aria-label="Text formatting"
        className="fixed z-50 flex flex-col rounded-2xl border border-gray-200 bg-white/95 shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/95 dark:shadow-black/30"
        style={{ top, left, maxWidth: 'calc(100vw - 32px)' }}
        onMouseDown={(e) => e.preventDefault()}
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
              onClick={() => setHeadingOpen((v) => !v)}
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
                className="absolute left-0 top-full z-10 mt-1.5 min-w-[160px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800"
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
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
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
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span>{label}</span>
                    <kbd className="text-[10px] text-gray-400 dark:text-gray-500">
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
            onClick={() => fire('link')}
            mobile={isMobile}
          >
            <LinkIcon size={iconSize} />
          </TBtn>

          <Divider />

          {/* Alignment */}
          {ALIGNMENT_BUTTONS.map(({ command, Icon, label, shortcut }) => (
            <TBtn
              key={command}
              active={activeFormats.has(command)}
              disabled={isDisabled}
              title={tip(label, shortcut)}
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
            className="flex flex-wrap items-center gap-0.5 border-t border-gray-200 px-2 py-1.5 dark:border-gray-700"
            onMouseDown={(e) => e.preventDefault()}
          >
            {/* Lists */}
            {LIST_BUTTONS.map(({ command, Icon, label, shortcut }) => (
              <TBtn
                key={command}
                active={activeFormats.has(command)}
                disabled={isDisabled}
                title={tip(label, shortcut)}
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

            <Divider />

            {/* Undo / Redo */}
            <TBtn
              disabled={isDisabled}
              title={tip('Undo', '\u2318/Ctrl+Z')}
              onClick={() => fire('undo')}
              mobile={isMobile}
            >
              <Undo size={iconSize} />
            </TBtn>
            <TBtn
              disabled={isDisabled}
              title={tip('Redo', '\u2318/Ctrl+\u21e7+Z')}
              onClick={() => fire('redo')}
              mobile={isMobile}
            >
              <Redo size={iconSize} />
            </TBtn>
          </div>
        )}
      </div>
    )
  },
)

SelectionToolbar.displayName = 'SelectionToolbar'

export default SelectionToolbar
