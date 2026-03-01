'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  MoreHorizontal,
  Type as TypeIcon,
} from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'

interface SelectionToolbarProps {
  onCommand: (command: string) => void
  queryCommandState: (command: string) => boolean
  isDisabled?: boolean
}

interface Position {
  top: number
  left: number
}

export default function SelectionToolbar({ 
  onCommand, 
  queryCommandState,
  isDisabled 
}: SelectionToolbarProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 })
  const [showMore, setShowMore] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const [activeCommands, setActiveCommands] = useState<Set<string>>(new Set())
  const isMobile = useIsMobile()

  const updatePosition = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      setIsVisible(false)
      return
    }

    const range = selection.getRangeAt(0)
    const text = range.toString()

    // Only show if there's selected text (not just a cursor)
    if (!text || text.trim().length === 0) {
      setIsVisible(false)
      return
    }

    const rect = range.getBoundingClientRect()
    
    if (rect.width === 0 && rect.height === 0) {
      setIsVisible(false)
      return
    }

    const toolbarHeight = isMobile ? 48 : 40
    const toolbarWidth = isMobile ? 320 : 420
    const margin = 8

    // Position above selection if possible, otherwise below
    let top = rect.top + window.scrollY - toolbarHeight - margin
    if (top < margin) {
      top = rect.bottom + window.scrollY + margin
    }

    // Center horizontally on selection
    let left = rect.left + window.scrollX + (rect.width / 2) - (toolbarWidth / 2)
    
    // Clamp to viewport
    const maxLeft = window.innerWidth - toolbarWidth - margin
    if (left > maxLeft) left = maxLeft
    if (left < margin) left = margin

    setPosition({ top, left })
    setIsVisible(true)

    // Update active command states
    const active = new Set<string>()
    if (queryCommandState('bold')) active.add('bold')
    if (queryCommandState('italic')) active.add('italic')
    if (queryCommandState('underline')) active.add('underline')
    if (queryCommandState('strikeThrough')) active.add('strike')
    if (queryCommandState('code')) active.add('code')
    // Headings
    if (queryCommandState('heading1')) active.add('heading1')
    if (queryCommandState('heading2')) active.add('heading2')
    if (queryCommandState('heading3')) active.add('heading3')
    // Block
    if (queryCommandState('blockquote')) active.add('blockquote')
    // Alignment
    if (queryCommandState('align-left')) active.add('align-left')
    if (queryCommandState('align-center')) active.add('align-center')
    if (queryCommandState('align-right')) active.add('align-right')
    // Detect active highlight color
    for (const c of ['yellow', 'green', 'pink', 'blue']) {
      if (queryCommandState(`highlight:${c}`)) active.add(`highlight:${c}`)
    }
    // Detect active text color
    for (const c of ['red', 'green', 'blue', 'purple']) {
      if (queryCommandState(`color:${c}`)) active.add(`color:${c}`)
    }
    setActiveCommands(active)
  }, [queryCommandState, isMobile])

  useEffect(() => {
    const handleSelectionChange = () => {
      // Small delay to ensure selection is stable
      setTimeout(updatePosition, 10)
    }

    const handleHide = () => {
      setIsVisible(false)
      setShowMore(false)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('mouseup', handleSelectionChange)
    window.addEventListener('resize', handleHide)
    window.addEventListener('scroll', handleHide, true)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('mouseup', handleSelectionChange)
      window.removeEventListener('resize', handleHide)
      window.removeEventListener('scroll', handleHide, true)
    }
  }, [updatePosition])

  // Close "more" dropdown when clicking outside
  useEffect(() => {
    if (!showMore) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        moreRef.current &&
        !moreRef.current.contains(e.target as Node) &&
        toolbarRef.current &&
        !toolbarRef.current.contains(e.target as Node)
      ) {
        setShowMore(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMore])

  const handleCommand = (command: string) => {
    if (isDisabled) return
    onCommand(command)
    // Update position after command (selection might have changed)
    setTimeout(updatePosition, 50)
  }

  if (!isVisible) return null

  // Determine current heading label for the heading cycle button
  const currentHeading = activeCommands.has('heading1')
    ? 'H1'
    : activeCommands.has('heading2')
    ? 'H2'
    : activeCommands.has('heading3')
    ? 'H3'
    : 'P'

  // Primary inline formatting buttons
  const inlineButtons = [
    { command: 'bold', icon: Bold, label: 'Bold (Ctrl+B)' },
    { command: 'italic', icon: Italic, label: 'Italic (Ctrl+I)' },
    { command: 'underline', icon: Underline, label: 'Underline (Ctrl+U)' },
    { command: 'strike', icon: Strikethrough, label: 'Strikethrough (Ctrl+Shift+X)' },
    { command: 'code', icon: Code, label: 'Inline Code (Ctrl+`)' },
    { command: 'link', icon: LinkIcon, label: 'Link (Ctrl+K)' },
  ]

  // Alignment buttons
  const alignmentButtons = [
    { command: 'align-left', icon: AlignLeft, label: 'Align Left' },
    { command: 'align-center', icon: AlignCenter, label: 'Center (Ctrl+Shift+E)' },
    { command: 'align-right', icon: AlignRight, label: 'Right (Ctrl+Shift+R)' },
  ]

  const highlightColors = [
    { key: 'yellow', title: 'Highlight: Yellow', colorClass: 'bg-yellow-200' },
    { key: 'green', title: 'Highlight: Green', colorClass: 'bg-green-200' },
    { key: 'pink', title: 'Highlight: Pink', colorClass: 'bg-pink-200' },
    { key: 'blue', title: 'Highlight: Blue', colorClass: 'bg-blue-200' },
  ]

  const textColors = [
    { key: 'default', title: 'Color: Default', colorClass: 'bg-transparent', indicatorClass: 'border border-gray-300' },
    { key: 'red', title: 'Color: Red', colorClass: 'bg-red-500' },
    { key: 'green', title: 'Color: Green', colorClass: 'bg-green-500' },
    { key: 'blue', title: 'Color: Blue', colorClass: 'bg-blue-500' },
    { key: 'purple', title: 'Color: Purple', colorClass: 'bg-purple-500' },
  ]

  const fontSizes = [
    { key: '12', label: '12' },
    { key: '16', label: '16' },
    { key: '20', label: '20' },
    { key: '24', label: '24' },
  ]

  const btnBase = `rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target`
  const btnSize = isMobile ? 'p-2.5 min-w-[40px] min-h-[40px]' : 'p-1.5 min-w-[30px] min-h-[30px]'
  const iconSize = isMobile ? 18 : 15

  const Divider = () => (
    <div className="w-px h-5 bg-gray-600 mx-0.5 shrink-0" />
  )

  return (
    <div
      ref={toolbarRef}
      className={`fixed z-50 flex flex-col rounded-lg bg-gray-900 text-white shadow-lg ${isMobile ? 'px-1.5 py-1' : 'px-1.5 py-1'} animate-in fade-in duration-150`}
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => {
        // Prevent toolbar from taking focus away from editor
        e.preventDefault()
      }}
    >
      {/* Row 1: Heading cycle + inline formatting + alignment + blockquote + more */}
      <div className="flex items-center gap-0.5 flex-wrap">
        {/* Heading cycle button */}
        <button
          onClick={() => {
            // Cycle: P -> H1 -> H2 -> H3 -> P
            if (currentHeading === 'P') handleCommand('heading1')
            else if (currentHeading === 'H1') handleCommand('heading2')
            else if (currentHeading === 'H2') handleCommand('heading3')
            else handleCommand('heading1') // H3 → toggle off → becomes P, then next click → H1
          }}
          onMouseDown={(e) => e.preventDefault()}
          title={`Block: ${currentHeading} (click to cycle)`}
          disabled={isDisabled}
          className={`${btnBase} flex items-center gap-0.5 ${isMobile ? 'px-2.5 py-2' : 'px-2 py-1'} font-semibold text-xs ${
            currentHeading !== 'P' ? 'bg-gray-700' : ''
          }`}
          aria-label={`Block: ${currentHeading}`}
        >
          <TypeIcon size={iconSize} />
          <span>{currentHeading}</span>
        </button>

        <Divider />

        {/* Inline buttons */}
        {inlineButtons.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            onClick={() => handleCommand(command)}
            onMouseDown={(e) => e.preventDefault()}
            title={label}
            disabled={isDisabled}
            className={`${btnSize} ${btnBase} ${
              activeCommands.has(command) ? 'bg-gray-700' : ''
            }`}
            aria-label={label}
          >
            <Icon size={iconSize} />
          </button>
        ))}

        <Divider />

        {/* Alignment buttons */}
        {alignmentButtons.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            onClick={() => handleCommand(command)}
            onMouseDown={(e) => e.preventDefault()}
            title={label}
            disabled={isDisabled}
            className={`${btnSize} ${btnBase} ${
              activeCommands.has(command) ? 'bg-gray-700' : ''
            }`}
            aria-label={label}
          >
            <Icon size={iconSize} />
          </button>
        ))}

        <Divider />

        {/* Blockquote toggle */}
        <button
          onClick={() => handleCommand('blockquote')}
          onMouseDown={(e) => e.preventDefault()}
          title="Blockquote (Ctrl+Shift+B)"
          disabled={isDisabled}
          className={`${btnSize} ${btnBase} ${
            activeCommands.has('blockquote') ? 'bg-gray-700' : ''
          }`}
          aria-label="Blockquote"
        >
          <Quote size={iconSize} />
        </button>

        {/* More button for secondary options (colors, font sizes) */}
        <Divider />
        <button
          onClick={() => setShowMore(!showMore)}
          onMouseDown={(e) => e.preventDefault()}
          title="More formatting"
          disabled={isDisabled}
          className={`${btnSize} ${btnBase} ${showMore ? 'bg-gray-700' : ''}`}
          aria-label="More formatting"
        >
          <MoreHorizontal size={iconSize} />
        </button>
      </div>

      {/* Row 2: Expandable panel with highlights, colors, font sizes */}
      {showMore && (
        <div
          ref={moreRef}
          className="flex items-center gap-0.5 flex-wrap pt-1 mt-1 border-t border-gray-700"
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* Highlight color buttons */}
          {highlightColors.map(({ key, title, colorClass }) => (
            <button
              key={key}
              onClick={() => handleCommand(`highlight:${key}`)}
              onMouseDown={(e) => e.preventDefault()}
              title={title}
              disabled={isDisabled}
              className={`p-1 rounded hover:opacity-90 touch-target ${
                activeCommands.has(`highlight:${key}`) ? 'ring-2 ring-white/70' : ''
              }`}
              aria-label={title}
            >
              <span className={`${colorClass} inline-block h-4 w-4 rounded`} />
            </button>
          ))}
          <button
            onClick={() => handleCommand('highlight:clear')}
            onMouseDown={(e) => e.preventDefault()}
            title="Remove highlight"
            disabled={isDisabled}
            className={`px-1.5 py-0.5 text-[10px] rounded hover:bg-gray-700 touch-target`}
            aria-label="Remove highlight"
          >
            ✕
          </button>

          <Divider />

          {/* Text color buttons */}
          {textColors.map(({ key, title, colorClass, indicatorClass }) => (
            <button
              key={key}
              onClick={() => handleCommand(`color:${key}`)}
              onMouseDown={(e) => e.preventDefault()}
              title={title}
              disabled={isDisabled}
              className={`p-1 rounded hover:opacity-90 touch-target ${
                activeCommands.has(`color:${key}`) ? 'ring-2 ring-white/70' : ''
              }`}
              aria-label={title}
            >
              <span className={`${colorClass} inline-block h-4 w-4 rounded ${indicatorClass ?? ''}`} />
            </button>
          ))}

          <Divider />

          {/* Font size buttons */}
          {fontSizes.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleCommand(`font-size:${key}`)}
              onMouseDown={(e) => e.preventDefault()}
              title={`Font size ${label}px`}
              disabled={isDisabled}
              className={`px-1.5 py-0.5 text-[10px] rounded hover:bg-gray-700 touch-target`}
              aria-label={`Font size ${label}px`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => handleCommand('font-size:clear')}
            onMouseDown={(e) => e.preventDefault()}
            title="Reset font size"
            disabled={isDisabled}
            className={`px-1.5 py-0.5 text-[10px] rounded hover:bg-gray-700 touch-target`}
            aria-label="Reset font size"
          >
            A↺
          </button>
        </div>
      )}
    </div>
  )
}
