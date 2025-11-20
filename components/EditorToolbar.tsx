'use client'

import React from 'react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link as LinkIcon,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  RotateCcw,
  RotateCw,
  Type,
  Plus,
  LayoutGrid,
  Eye,
  EyeOff
} from 'lucide-react'

export type RichTextCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'link'
  | 'unordered-list'
  | 'ordered-list'
  | 'checklist'
  | 'blockquote'
  | 'horizontal-rule'
  | 'undo'
  | 'redo'

export interface EditorToolbarProps {
  onCommand: (command: RichTextCommand) => void
  onBlockTypeChange: (blockType: string) => void
  onUndo: () => void
  onRedo: () => void
  onNewBlock: () => void
  onToggleBlockPanel: () => void
  onToggleBlockOutlines: () => void
  blockPanelOpen: boolean
  showBlockOutlines: boolean
  activeBlockId: string | null
  activeBlockType?: string
  activeFormats?: Set<string>
  disabled?: boolean
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  onCommand,
  onBlockTypeChange,
  onUndo,
  onRedo,
  onNewBlock,
  onToggleBlockPanel,
  onToggleBlockOutlines,
  blockPanelOpen,
  showBlockOutlines,
  activeBlockId,
  activeBlockType,
  activeFormats = new Set(),
  disabled = false
}) => {
  const toolbarButtonClass =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-white text-slate-600 shadow-sm hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

  const activeButtonClass =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-blue-50 text-blue-700 shadow-sm hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

  // Determine the current block type based on active formats
  const getCurrentBlockType = () => {
    if (activeFormats.has('heading1')) return 'heading1'
    if (activeFormats.has('heading2')) return 'heading2'
    if (activeFormats.has('heading3')) return 'heading3'
    if (activeFormats.has('blockquote')) return 'blockquote'
    return 'paragraph'
  }

  const currentBlockType = getCurrentBlockType()

  return (
    <div className="sticky top-0 z-40 flex-shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        {/* Text Formatting Group */}
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/80 px-2 py-1 shadow-sm">
          <button
            className={activeFormats.has('bold') ? activeButtonClass : toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCommand('bold')}
            disabled={disabled}
            aria-label="Bold (Cmd+B)"
            title="Bold (Cmd+B)"
          >
            <Bold size={16} />
          </button>
          <button
            className={activeFormats.has('italic') ? activeButtonClass : toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCommand('italic')}
            disabled={disabled}
            aria-label="Italic (Cmd+I)"
            title="Italic (Cmd+I)"
          >
            <Italic size={16} />
          </button>
          <button
            className={activeFormats.has('underline') ? activeButtonClass : toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCommand('underline')}
            disabled={disabled}
            aria-label="Underline (Cmd+U)"
            title="Underline (Cmd+U)"
          >
            <Underline size={16} />
          </button>
          <button
            className={activeFormats.has('strike') ? activeButtonClass : toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCommand('strike')}
            disabled={disabled}
            aria-label="Strikethrough (Cmd+Shift+X)"
            title="Strikethrough (Cmd+Shift+X)"
          >
            <Strikethrough size={16} />
          </button>
          <button
            className={activeFormats.has('code') ? activeButtonClass : toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCommand('code')}
            disabled={disabled}
            aria-label="Inline code (Cmd+`)"
            title="Inline code (Cmd+`)"
          >
            <Code size={16} />
          </button>
          <button
            className={toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCommand('link')}
            disabled={disabled}
            aria-label="Insert link (Cmd+K)"
            title="Insert link (Cmd+K)"
          >
            <LinkIcon size={16} />
          </button>
        </div>

        {/* Block Type Selector */}
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-1 shadow-sm">
          <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Type size={14} />
            <span>Block</span>
          </div>
          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            value={currentBlockType}
            onChange={(event) => onBlockTypeChange(event.target.value)}
            disabled={disabled}
            aria-label="Block type"
          >
            <option value="paragraph">Paragraph</option>
            <option value="heading1">Heading 1</option>
            <option value="heading2">Heading 2</option>
            <option value="heading3">Heading 3</option>
            <option value="blockquote">Quote</option>
          </select>
        </div>

        {/* Lists & Structure Group */}
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/80 px-2 py-1 shadow-sm">
          <button
            className={activeFormats.has('unordered-list') ? activeButtonClass : toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCommand('unordered-list')}
            disabled={disabled}
            aria-label="Bulleted list (Cmd+Shift+L)"
            title="Bulleted list (Cmd+Shift+L)"
          >
            <List size={16} />
          </button>
          <button
            className={activeFormats.has('ordered-list') ? activeButtonClass : toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCommand('ordered-list')}
            disabled={disabled}
            aria-label="Numbered list (Cmd+Shift+O)"
            title="Numbered list (Cmd+Shift+O)"
          >
            <ListOrdered size={16} />
          </button>
          <button
            className={toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCommand('checklist')}
            disabled={disabled}
            aria-label="Checklist (Cmd+Shift+C)"
            title="Checklist (Cmd+Shift+C)"
          >
            <CheckSquare size={16} />
          </button>
          <button
            className={toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCommand('horizontal-rule')}
            disabled={disabled}
            aria-label="Horizontal divider"
            title="Horizontal divider"
          >
            <Minus size={16} />
          </button>
        </div>

        {/* History Group */}
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/80 px-2 py-1 shadow-sm">
          <button
            className={toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onUndo}
            disabled={disabled}
            aria-label="Undo (Cmd+Z)"
            title="Undo (Cmd+Z)"
          >
            <RotateCcw size={16} />
          </button>
          <button
            className={toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRedo}
            disabled={disabled}
            aria-label="Redo (Cmd+Shift+Z)"
            title="Redo (Cmd+Shift+Z)"
          >
            <RotateCw size={16} />
          </button>
        </div>

        {/* Active Block Info */}
        <div className="ml-auto flex flex-col gap-1 text-right text-xs text-slate-500">
          <span className="font-semibold text-slate-600">
            {activeBlockId ? `Block: ${activeBlockId}` : 'No block selected'}
          </span>
          {activeBlockType && (
            <span className="capitalize">
              {activeBlockType}
            </span>
          )}
        </div>

        {/* Block Controls Group */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onNewBlock}
            disabled={disabled}
            aria-label="New block (Ctrl+Enter)"
            title="New block (Ctrl+Enter)"
          >
            <Plus size={16} /> New block
          </button>
          <button
            className={blockPanelOpen ? activeButtonClass : toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggleBlockPanel}
            disabled={disabled}
            aria-label="Toggle block navigator"
            title="Toggle block navigator"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            className={showBlockOutlines ? activeButtonClass : toolbarButtonClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggleBlockOutlines}
            disabled={disabled}
            aria-label="Toggle block outlines"
            title="Toggle block outlines"
          >
            {showBlockOutlines ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EditorToolbar
