'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Bold, Italic, Underline, Strikethrough, Code, Link as LinkIcon } from 'lucide-react'

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
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [activeCommands, setActiveCommands] = useState<Set<string>>(new Set())

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

    const toolbarHeight = 40
    const toolbarWidth = 300
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
    setActiveCommands(active)
  }, [queryCommandState])

  useEffect(() => {
    const handleSelectionChange = () => {
      // Small delay to ensure selection is stable
      setTimeout(updatePosition, 10)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('mouseup', handleSelectionChange)
    window.addEventListener('resize', () => setIsVisible(false))
    window.addEventListener('scroll', () => setIsVisible(false), true)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('mouseup', handleSelectionChange)
      window.removeEventListener('resize', () => setIsVisible(false))
      window.removeEventListener('scroll', () => setIsVisible(false), true)
    }
  }, [updatePosition])

  const handleCommand = (command: string) => {
    if (isDisabled) return
    onCommand(command)
    // Update position after command (selection might have changed)
    setTimeout(updatePosition, 50)
  }

  if (!isVisible) return null

  const buttons = [
    { command: 'bold', icon: Bold, label: 'Bold (⌘B)' },
    { command: 'italic', icon: Italic, label: 'Italic (⌘I)' },
    { command: 'underline', icon: Underline, label: 'Underline (⌘U)' },
    { command: 'strike', icon: Strikethrough, label: 'Strikethrough (⌘⇧X)' },
    { command: 'code', icon: Code, label: 'Code (⌘`)' },
    { command: 'link', icon: LinkIcon, label: 'Link (⌘K)' },
  ]

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-1 rounded-lg bg-gray-900 text-white shadow-lg px-2 py-1.5 animate-in fade-in duration-150"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => {
        // Prevent toolbar from taking focus away from editor
        e.preventDefault()
      }}
    >
      {buttons.map(({ command, icon: Icon, label }) => (
        <button
          key={command}
          onClick={() => handleCommand(command)}
          onMouseDown={(e) => e.preventDefault()}
          title={label}
          disabled={isDisabled}
          className={`p-2 rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            activeCommands.has(command) ? 'bg-gray-700' : ''
          }`}
          aria-label={label}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  )
}
