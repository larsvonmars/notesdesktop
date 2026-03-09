'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ChevronRight,
  ChevronLeft,
  Save,
  Trash2,
  Check,
  Loader2,
  FolderOpen,
  Target,
  Edit2,
  ListTree,
  FileText,
  PenTool,
  Network,
  BookOpen,
  Table2,
  FilePenLine,
  Settings,
  X,
  Download,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { NoteType } from '@/lib/notes'
import { getNoteTypePresentation, type NoteTypeIconKey } from '@/lib/note-types'

export interface NoteDetailsSidebarProps {
  // Note identity
  noteId?: string
  isNewNote: boolean
  noteType: NoteType
  
  // Title
  title: string
  onTitleChange: (title: string) => void
  
  // Save/Delete
  onSave: () => void
  onDelete?: () => void
  isSaving: boolean
  isDeleting: boolean
  hasChanges: boolean
  lastSaveDisplay: string | null
  
  // Metadata
  folderPath: string
  projectInfo: { name: string; color: string } | null
  
  // Stats (rich-text only)
  stats: { words: number; characters: number }
  headings: Array<{ id: string; level: number; text: string }>
  onScrollToHeading?: (headingId: string) => void
  
  // Word goal
  wordGoal: number | null
  wordGoalProgress: { percentage: number; isComplete: boolean } | null
  onSetWordGoal: (goal: number | null) => void
  
  // Settings
  onOpenSettings: () => void

  // Export
  onExportMarkdown?: () => void
  onExportPdf?: () => void

  // Connections
  onOpenConnections?: () => void
  backlinks?: Array<{ id: string; title: string; folderPath?: string; relationCount: number }>
  connectionsCount?: number
  onSelectBacklink?: (noteId: string) => void

  outgoingLinks?: Array<{ id: string; title: string; folderPath?: string }>
  onSelectOutgoing?: (noteId: string) => void
  
  // AI Assistant
  onOpenAIAssistant?: () => void

  // Visibility
  collapsed: boolean
  onToggleCollapsed: () => void
}

const NOTE_TYPE_ICON_MAP: Record<NoteTypeIconKey, LucideIcon> = {
  'file-text': FileText,
  'pen-tool': PenTool,
  network: Network,
  'book-open': BookOpen,
  'table-2': Table2,
  'file-pen-line': FilePenLine,
}

export default function NoteDetailsSidebar({
  noteId,
  isNewNote,
  noteType,
  title,
  onTitleChange,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  hasChanges,
  lastSaveDisplay,
  folderPath,
  projectInfo,
  stats,
  headings,
  onScrollToHeading,
  wordGoal,
  wordGoalProgress,
  onSetWordGoal,
  onOpenSettings,
  onExportMarkdown,
  onExportPdf,
  onOpenConnections,
  backlinks = [],
  connectionsCount = 0,
  onSelectBacklink,
  outgoingLinks = [],
  onSelectOutgoing,
  onOpenAIAssistant,
  collapsed,
  onToggleCollapsed,
}: NoteDetailsSidebarProps) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [showWordGoalInput, setShowWordGoalInput] = useState(false)
  const [wordGoalValue, setWordGoalValue] = useState('')
  const wordGoalInputRef = useRef<HTMLInputElement>(null)
  const [tocExpanded, setTocExpanded] = useState(true)

  // Focus word goal input when it opens
  useEffect(() => {
    if (showWordGoalInput) {
      setWordGoalValue(wordGoal?.toString() ?? '')
      setTimeout(() => wordGoalInputRef.current?.focus(), 50)
    }
  }, [showWordGoalInput, wordGoal])

  const handleWordGoalSubmit = useCallback(() => {
    const val = parseInt(wordGoalValue, 10)
    if (!isNaN(val) && val > 0) {
      onSetWordGoal(val)
    } else {
      onSetWordGoal(null)
    }
    setShowWordGoalInput(false)
  }, [wordGoalValue, onSetWordGoal])

  const typePresentation = getNoteTypePresentation(noteType)
  const TypeIcon = NOTE_TYPE_ICON_MAP[typePresentation.iconKey]
  const displayName = title.trim() || 'Untitled note'

  // ---- COLLAPSED VIEW ----
  if (collapsed) {
    return (
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-12 border-l border-border bg-surface transition-all duration-200 lg:flex lg:flex-col" title={displayName}>
        <div className="flex items-center justify-center border-b border-border px-2 py-3">
          <button
            onClick={onToggleCollapsed}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="Expand details"
            title="Expand details"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
        <nav className="flex-1 flex flex-col items-center gap-2 px-1 py-3">
          {/* Save indicator */}
          {isSaving ? (
            <div className="p-1.5 text-alpine-500" title="Saving...">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : hasChanges ? (
            <button
              onClick={onSave}
              disabled={!title.trim()}
              className="p-1.5 rounded-lg text-amber-500 hover:bg-surface-hover transition-colors"
              title="Save (unsaved changes)"
            >
              <Save size={16} />
            </button>
          ) : lastSaveDisplay ? (
            <div className="p-1.5 text-green-500" title={`Saved ${lastSaveDisplay}`}>
              <Check size={16} />
            </div>
          ) : null}
          {/* Note type icon */}
          <div className={`p-1.5 ${typePresentation.iconClassName}`} title={typePresentation.label}>
            <TypeIcon size={16} />
          </div>
          {/* TOC icon - only for rich-text */}
          {noteType === 'rich-text' && headings.length > 0 && (
            <button
              onClick={onToggleCollapsed}
              className="p-1.5 rounded-lg text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
              title={`${headings.length} headings`}
            >
              <ListTree size={16} />
            </button>
          )}
          {/* AI Assistant */}
          {onOpenAIAssistant && (
            <button
              onClick={onOpenAIAssistant}
              className="p-1.5 rounded-lg text-muted hover:bg-surface-hover hover:text-alpine-500 transition-colors"
              title="Open AI Assistant"
            >
              <Sparkles size={14} />
            </button>
          )}
          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
            title="Settings"
          >
            <Settings size={14} />
          </button>

          {/* Export */}
          {(onExportMarkdown || onExportPdf) && (
            <div className="mt-1 h-px w-6 bg-border" />
          )}
          {onExportMarkdown && (
            <button
              onClick={onExportMarkdown}
              className="p-1.5 rounded-lg text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
              title="Export Markdown"
            >
              <FileText size={14} />
            </button>
          )}
          {onExportPdf && (
            <button
              onClick={onExportPdf}
              className="p-1.5 rounded-lg text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
              title="Export PDF"
            >
              <Download size={14} />
            </button>
          )}

          {/* Connections */}
          {onOpenConnections && (
            <button
              onClick={onOpenConnections}
              className="p-1.5 rounded-lg text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
              title={`Connections (${connectionsCount})`}
            >
              <Network size={14} />
            </button>
          )}
        </nav>
      </aside>
    )
  }

  // ---- EXPANDED VIEW ----
  return (
    <aside className="fixed inset-y-0 right-0 z-30 hidden w-[280px] border-l border-border bg-surface transition-all duration-200 lg:flex lg:flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wider">Note Details</div>
          <div className="truncate text-xs font-medium text-foreground" title={displayName}>{displayName}</div>
        </div>
        <button
          onClick={onToggleCollapsed}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="Collapse details"
          title="Collapse details"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Title Section */}
        <div className="px-3 py-3 border-b border-border">
          <label className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5 block">Title</label>
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Note title..."
            className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-surface-hover/50 focus:outline-none focus:ring-1 focus:ring-alpine-500 focus:border-alpine-500 text-foreground placeholder:text-muted"
          />
        </div>

        {/* Save Section */}
        <div className="px-3 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={onSave}
              disabled={isSaving || !title.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-alpine-600 rounded-lg hover:bg-alpine-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={12} />
                  <span>Save</span>
                </>
              )}
            </button>
            {onDelete && noteId && (
              <button
                onClick={onDelete}
                disabled={isDeleting}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger bg-danger-light rounded-lg hover:bg-danger hover:text-white disabled:opacity-50 transition-colors"
                title="Delete note"
              >
                {isDeleting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
              </button>
            )}
          </div>
          {/* Save status */}
          <div className="flex items-center gap-1.5 text-xs">
            {isSaving ? (
              <>
                <Loader2 size={10} className="animate-spin text-alpine-500" />
                <span className="text-alpine-600 font-medium">Saving...</span>
              </>
            ) : hasChanges ? (
              <>
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-amber-600 dark:text-amber-400 font-medium">Unsaved changes</span>
              </>
            ) : lastSaveDisplay ? (
              <>
                <Check size={10} className="text-green-500" />
                <span className="text-green-600 dark:text-green-400 font-medium">Saved {lastSaveDisplay}</span>
              </>
            ) : isNewNote ? (
              <span className="text-muted italic">New note — not yet saved</span>
            ) : null}
          </div>
        </div>

        {/* Metadata Section */}
        <div className="px-3 py-3 border-b border-border space-y-2.5">
          <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block">Details</label>
          
          {/* Note Type */}
          <div className="flex items-center gap-2 text-xs">
            <TypeIcon size={13} className={typePresentation.iconClassName} />
            <span className="text-foreground/80">{typePresentation.label}</span>
          </div>

          {/* Folder Path */}
          <div className="flex items-center gap-2 text-xs">
            <FolderOpen size={13} className="text-muted flex-shrink-0" />
            <span className="text-foreground/80 truncate">{folderPath}</span>
          </div>

          {/* Project */}
          {projectInfo && (
            <div className="flex items-center gap-2 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: projectInfo.color }}
              />
              <span className="text-foreground/80">{projectInfo.name}</span>
            </div>
          )}
        </div>

        {/* Export Section */}
        {(onExportMarkdown || onExportPdf) && (
          <div className="px-3 py-3 border-b border-border">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 block">Export</label>
            <div className="space-y-1.5">
              {onExportMarkdown && (
                <button
                  onClick={onExportMarkdown}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <FileText size={13} className="text-muted" />
                  <span>Export as Markdown</span>
                </button>
              )}
              {onExportPdf && (
                <button
                  onClick={onExportPdf}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <Download size={13} className="text-muted" />
                  <span>Export as PDF</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stats Section (rich-text only) */}
        {noteType === 'rich-text' && (
          <div className="px-3 py-3 border-b border-border">
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 block">Statistics</label>
            
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="bg-surface-hover/50 rounded-lg px-2.5 py-2 text-center">
                <div className="text-sm font-semibold text-foreground">{stats.words}</div>
                <div className="text-[10px] text-muted">{stats.words === 1 ? 'word' : 'words'}</div>
              </div>
              <div className="bg-surface-hover/50 rounded-lg px-2.5 py-2 text-center">
                <div className="text-sm font-semibold text-foreground">{stats.characters}</div>
                <div className="text-[10px] text-muted">{stats.characters === 1 ? 'char' : 'chars'}</div>
              </div>
            </div>

            {/* Word Goal */}
            {wordGoal && wordGoalProgress ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className={wordGoalProgress.isComplete ? 'text-green-600 dark:text-green-400 font-medium' : 'text-foreground/80'}>
                    {stats.words}/{wordGoal} words
                  </span>
                  <button
                    onClick={() => setShowWordGoalInput(true)}
                    className="text-muted hover:text-foreground transition-colors"
                    title="Edit goal"
                  >
                    <Edit2 size={10} />
                  </button>
                </div>
                <div className="relative w-full h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 h-full transition-all duration-300 rounded-full ${
                      wordGoalProgress.isComplete
                        ? 'bg-gradient-to-r from-green-400 to-green-500'
                        : 'bg-gradient-to-r from-alpine-400 to-alpine-500'
                    }`}
                    style={{ width: `${wordGoalProgress.percentage}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowWordGoalInput(true)}
                className="flex items-center gap-1.5 text-xs text-alpine-500 hover:text-alpine-600 transition-colors font-medium"
              >
                <Target size={12} />
                <span>Set word goal</span>
              </button>
            )}

            {/* Word Goal Input */}
            {showWordGoalInput && (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  ref={wordGoalInputRef}
                  type="number"
                  min="1"
                  value={wordGoalValue}
                  onChange={(e) => setWordGoalValue(e.target.value)}
                  placeholder="e.g. 500"
                  className="flex-1 px-2 py-1 text-xs border border-border rounded-md bg-surface focus:outline-none focus:ring-1 focus:ring-alpine-500 text-foreground"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleWordGoalSubmit()
                    if (e.key === 'Escape') setShowWordGoalInput(false)
                  }}
                />
                <button
                  onClick={handleWordGoalSubmit}
                  className="px-2 py-1 text-xs font-medium text-white bg-alpine-600 rounded-md hover:bg-alpine-700"
                >
                  Set
                </button>
                {wordGoal && (
                  <button
                    onClick={() => { onSetWordGoal(null); setShowWordGoalInput(false) }}
                    className="px-1.5 py-1 text-xs text-danger hover:bg-danger-light rounded-md transition-colors"
                    title="Remove goal"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {/* Heading count */}
            {headings.length > 0 && (
              <div className="mt-2 text-xs text-muted">
                {headings.length} {headings.length === 1 ? 'heading' : 'headings'}
              </div>
            )}
          </div>
        )}

        {/* Table of Contents (rich-text only) */}
        {noteType === 'rich-text' && headings.length > 0 && (
          <div className="px-3 py-3">
            <button
              onClick={() => setTocExpanded(prev => !prev)}
              className="flex items-center gap-1.5 w-full text-left mb-2"
            >
              <ChevronRight
                size={12}
                className={`text-muted transition-transform duration-200 ${tocExpanded ? 'rotate-90' : ''}`}
              />
              <ListTree size={13} className="text-muted" />
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Contents</span>
              <span className="ml-auto text-[10px] text-muted">{headings.length}</span>
            </button>
            {tocExpanded && (
              <div className="space-y-0.5">
                {headings.map((heading, index) => (
                  <button
                    key={heading.id || `${heading.level}-${heading.text}-${index}`}
                    onClick={() => onScrollToHeading?.(heading.id)}
                    className="w-full text-left px-2 py-1 rounded-md text-xs hover:bg-surface-hover text-foreground/80 hover:text-foreground transition-colors truncate"
                    style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
                    title={heading.text}
                  >
                    <span className={`${heading.level === 1 ? 'font-semibold' : heading.level === 2 ? 'font-medium' : ''}`}>
                      {heading.text}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Connections */}
        {onOpenConnections && (
          <div className="px-3 py-3 border-t border-border">
            <button
              onClick={onOpenConnections}
              className="mb-2 flex w-full items-center gap-1.5 text-left"
            >
              <Network size={13} className="text-muted" />
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Connections</span>
              <span className="ml-auto text-[10px] text-muted">{connectionsCount}</span>
            </button>

            {backlinks.length > 0 ? (
              <div className="space-y-0.5">
                {backlinks.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectBacklink?.(item.id)}
                    className="w-full rounded-md px-2 py-1 text-left text-xs text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
                    title={`${item.title}${item.folderPath ? ` · ${item.folderPath}` : ''}`}
                  >
                    <div className="truncate font-medium">{item.title || 'Untitled note'}</div>
                    {item.folderPath && (
                      <div className="truncate text-[10px] text-muted">{item.folderPath}</div>
                    )}
                  </button>
                ))}
                {backlinks.length > 8 && (
                  <div className="px-2 pt-1 text-[10px] text-muted">+{backlinks.length - 8} more backlinks</div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted">No backlinks yet</div>
            )}

            {/* Outgoing Links */}
            <div className="mt-4">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">Outgoing Links</div>
              {outgoingLinks.length > 0 ? (
                <div className="space-y-0.5">
                  {outgoingLinks.slice(0, 8).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onSelectOutgoing?.(item.id)}
                      className="w-full rounded-md px-2 py-1 text-left text-xs text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
                      title={`${item.title}${item.folderPath ? ` · ${item.folderPath}` : ''}`}
                    >
                      <div className="truncate font-medium">{item.title || 'Untitled note'}</div>
                      {item.folderPath && (
                        <div className="truncate text-[10px] text-muted">{item.folderPath}</div>
                      )}
                    </button>
                  ))}
                  {outgoingLinks.length > 8 && (
                    <div className="px-2 pt-1 text-[10px] text-muted">+{outgoingLinks.length - 8} more links</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted">No outgoing links</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2 space-y-1">
        {onOpenAIAssistant && (
          <button
            onClick={onOpenAIAssistant}
            className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-all hover:bg-surface-hover hover:text-alpine-500"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span>AI Assistant</span>
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-all hover:bg-surface-hover hover:text-foreground"
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}
