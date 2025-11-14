'use client'

import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  CheckSquare,
  Undo,
  Redo,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  Table as TableIcon,
  FileText,
  Minus as HorizontalRule,
  Eye,
  EyeOff
} from 'lucide-react'
import { type RichTextCommand } from './RichTextEditor'

interface FixedToolbarProps {
  onCommand: (command: RichTextCommand) => void
  onShowTable?: () => void
  onShowNoteLink?: () => void
  activeFormats: Set<string>
  disabled?: boolean
  showBlockOutlines: boolean
  onToggleBlockOutlines: () => void
}

const commandShortcuts: Record<RichTextCommand, string> = {
  bold: '⌘B',
  italic: '⌘I',
  underline: '⌘U',
  strike: '⌘⇧X',
  code: '⌘`',
  'unordered-list': '⌘⇧L',
  'ordered-list': '⌘⇧O',
  blockquote: '⌘⇧B',
  checklist: '⌘⇧C',
  heading1: '⌘⌥1',
  heading2: '⌘⌥2',
  heading3: '⌘⌥3',
  link: '⌘K',
  'horizontal-rule': '',
  undo: '⌘Z',
  redo: '⌘⇧Z'
}

export default function FixedToolbar({
  onCommand,
  onShowTable,
  onShowNoteLink,
  activeFormats,
  disabled = false,
  showBlockOutlines,
  onToggleBlockOutlines
}: FixedToolbarProps) {
  const handleCommand = (command: RichTextCommand) => {
    if (disabled) return
    onCommand(command)
  }

  const toolbarSections = [
    {
      name: 'Headings',
      buttons: [
        { command: 'heading1' as RichTextCommand, icon: Heading1, label: 'Heading 1' },
        { command: 'heading2' as RichTextCommand, icon: Heading2, label: 'Heading 2' },
        { command: 'heading3' as RichTextCommand, icon: Heading3, label: 'Heading 3' },
      ]
    },
    {
      name: 'Text Style',
      buttons: [
        { command: 'bold' as RichTextCommand, icon: Bold, label: 'Bold' },
        { command: 'italic' as RichTextCommand, icon: Italic, label: 'Italic' },
        { command: 'underline' as RichTextCommand, icon: Underline, label: 'Underline' },
        { command: 'strike' as RichTextCommand, icon: Strikethrough, label: 'Strikethrough' },
        { command: 'code' as RichTextCommand, icon: Code, label: 'Code' },
      ]
    },
    {
      name: 'Lists & Blocks',
      buttons: [
        { command: 'unordered-list' as RichTextCommand, icon: List, label: 'Bullet List' },
        { command: 'ordered-list' as RichTextCommand, icon: ListOrdered, label: 'Numbered List' },
        { command: 'checklist' as RichTextCommand, icon: CheckSquare, label: 'Checklist' },
        { command: 'blockquote' as RichTextCommand, icon: Quote, label: 'Quote' },
      ]
    },
    {
      name: 'Insert',
      buttons: [
        { command: 'link' as RichTextCommand, icon: LinkIcon, label: 'Link' },
        { command: 'horizontal-rule' as RichTextCommand, icon: HorizontalRule, label: 'Horizontal Rule' },
      ]
    },
  ]

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto">
        {/* Toolbar Sections */}
        {toolbarSections.map((section, sectionIndex) => (
          <div key={section.name} className="flex items-center gap-1">
            {section.buttons.map(({ command, icon: Icon, label }) => {
              const isActive = activeFormats.has(command)
              return (
                <button
                  key={command}
                  type="button"
                  onClick={() => handleCommand(command)}
                  disabled={disabled}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  } ${
                    disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                  title={`${label} (${commandShortcuts[command]})`}
                  aria-label={label}
                >
                  <Icon size={16} />
                </button>
              )
            })}
            {/* Divider between sections */}
            {sectionIndex < toolbarSections.length - 1 && (
              <div className="w-px h-6 bg-gray-300 mx-1" />
            )}
          </div>
        ))}

        {/* Special Actions */}
        <div className="w-px h-6 bg-gray-300 mx-1" />
        
        {/* Table Button */}
        {onShowTable && (
          <button
            type="button"
            onClick={onShowTable}
            disabled={disabled}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-all duration-150 hover:bg-gray-100 hover:text-gray-900 ${
              disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            }`}
            title="Insert Table"
            aria-label="Insert Table"
          >
            <TableIcon size={16} />
          </button>
        )}

        {/* Note Link Button */}
        {onShowNoteLink && (
          <button
            type="button"
            onClick={onShowNoteLink}
            disabled={disabled}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-all duration-150 hover:bg-gray-100 hover:text-gray-900 ${
              disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            }`}
            title="Link to Note"
            aria-label="Link to Note"
          >
            <FileText size={16} />
          </button>
        )}

        {/* Divider */}
        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Undo/Redo */}
        <button
          type="button"
          onClick={() => handleCommand('undo')}
          disabled={disabled}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-all duration-150 hover:bg-gray-100 hover:text-gray-900 ${
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
          }`}
          title={`Undo (${commandShortcuts.undo})`}
          aria-label="Undo"
        >
          <Undo size={16} />
        </button>
        <button
          type="button"
          onClick={() => handleCommand('redo')}
          disabled={disabled}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-all duration-150 hover:bg-gray-100 hover:text-gray-900 ${
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
          }`}
          title={`Redo (${commandShortcuts.redo})`}
          aria-label="Redo"
        >
          <Redo size={16} />
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Block Outlines Toggle */}
        <button
          type="button"
          onClick={onToggleBlockOutlines}
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg transition-all duration-150 text-sm font-medium ${
            showBlockOutlines
              ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          } ${
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
          }`}
          title="Toggle Block Outlines"
          aria-label="Toggle Block Outlines"
        >
          {showBlockOutlines ? <Eye size={16} /> : <EyeOff size={16} />}
          <span className="hidden sm:inline">Blocks</span>
        </button>
      </div>
    </div>
  )
}
