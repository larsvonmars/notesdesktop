'use client'

import { useState, useRef, useEffect, useCallback, memo } from 'react'
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
  FileDown,
  FileUp,
  Sparkles,
  Copy,
  ExternalLink,
  Globe,
  FileOutput,
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
  onExportDocx?: () => void
  onExportHtml?: () => void
  onExportPlainText?: () => void
  onImportDocx?: () => void

  // Connections
  onOpenConnections?: () => void
  backlinks?: Array<{ id: string; title: string; folderPath?: string; relationCount: number }>
  connectionsCount?: number
  onSelectBacklink?: (noteId: string) => void

  outgoingLinks?: Array<{ id: string; title: string; folderPath?: string }>
  onSelectOutgoing?: (noteId: string) => void
  
  // AI Assistant
  onOpenAIAssistant?: () => void

  // Share
  shareUrl?: string | null
  shareHint?: string | null
  sharePublishedDisplay?: string | null
  onPublish?: () => void
  onUnpublish?: () => void
  onCopyShareLink?: () => void
  onOpenSharePage?: () => void
  isPublishing?: boolean
  isUnpublishing?: boolean
  canPublish?: boolean

  // Visibility
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Render as an overlay drawer (compact desktops/tablets) instead of a rail. */
  overlay?: boolean
}

const NOTE_TYPE_ICON_MAP: Record<NoteTypeIconKey, LucideIcon> = {
  'file-text': FileText,
  'pen-tool': PenTool,
  network: Network,
  'book-open': BookOpen,
  'table-2': Table2,
  'file-pen-line': FilePenLine,
}

/** Quiet meta label used above every group in the panel. */
const META = 'text-[10px] font-semibold uppercase tracking-[0.08em] text-muted'

/** Shared pill icon button for the panel header / footer. */
const ICON_BUTTON =
  'focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground'

const ROW_BUTTON =
  'focus-ring flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-surface-hover hover:text-foreground'

const FILE_ROW =
  'focus-ring flex w-full items-center gap-3 px-3.5 py-2.5 text-xs text-foreground transition-colors hover:bg-surface-hover hover:text-foreground'

function NoteDetailsSidebar({
  noteId,
  isNewNote,
  noteType,
  title,
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
  onExportDocx,
  onExportHtml,
  onExportPlainText,
  onImportDocx,
  onOpenConnections,
  backlinks = [],
  connectionsCount = 0,
  onSelectBacklink,
  outgoingLinks = [],
  onSelectOutgoing,
  onOpenAIAssistant,
  shareUrl,
  shareHint,
  sharePublishedDisplay,
  onPublish,
  onUnpublish,
  onCopyShareLink,
  onOpenSharePage,
  isPublishing = false,
  isUnpublishing = false,
  canPublish = true,
  collapsed,
  onToggleCollapsed,
  overlay = false,
}: NoteDetailsSidebarProps) {
  const [showWordGoalInput, setShowWordGoalInput] = useState(false)
  const [wordGoalValue, setWordGoalValue] = useState('')
  const wordGoalInputRef = useRef<HTMLInputElement>(null)
  const [tocExpanded, setTocExpanded] = useState(true)
  const [showFileModal, setShowFileModal] = useState(false)

  const hasFileActions = !!(onExportMarkdown || onExportPdf || onExportDocx || onExportHtml || onExportPlainText || onImportDocx || onPublish || shareUrl || shareHint)

  // Focus word goal input when it opens
  const openWordGoalInput = () => {
    setWordGoalValue(wordGoal?.toString() ?? '')
    setShowWordGoalInput(true)
    setTimeout(() => wordGoalInputRef.current?.focus(), 50)
  }

  // Overlay drawers close on Escape.
  useEffect(() => {
    if (!overlay) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onToggleCollapsed()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [overlay, onToggleCollapsed])

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
    if (overlay) return null

    return (
      <aside
        className="glass-subtle fixed bottom-0 right-0 top-[var(--topbar-height,56px)] z-30 hidden w-12 flex-col border-l border-border transition-all duration-300 md:flex"
        title={displayName}
      >
        <div className="flex items-center justify-center px-2 py-4">
          <button
            onClick={onToggleCollapsed}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="Expand details"
            title="Expand details"
          >
            <ChevronLeft size={17} />
          </button>
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1.5 px-1.5 py-3" aria-label="Note details actions">
          {/* Save indicator */}
          {isSaving ? (
            <div className="flex h-8 w-8 items-center justify-center text-accent" title="Saving...">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : hasChanges ? (
            <button
              onClick={onSave}
              disabled={!title.trim()}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-warning transition-colors hover:bg-warning-light disabled:opacity-50"
              title="Save (unsaved changes)"
              aria-label="Save note"
            >
              <Save size={16} />
            </button>
          ) : lastSaveDisplay ? (
            <div className="flex h-8 w-8 items-center justify-center text-success" title={`Saved ${lastSaveDisplay}`}>
              <Check size={16} />
            </div>
          ) : null}
          {/* Note type icon */}
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface-hover ${typePresentation.iconClassName}`}
            title={typePresentation.label}
          >
            <TypeIcon size={15} />
          </div>
          {/* TOC icon - only for rich-text */}
          {noteType === 'rich-text' && headings.length > 0 && (
            <button
              onClick={onToggleCollapsed}
              className={`${ICON_BUTTON}`}
              title={`${headings.length} headings`}
              aria-label="Show table of contents"
            >
              <ListTree size={15} />
            </button>
          )}
          {/* AI Assistant */}
          {onOpenAIAssistant && (
            <button
              onClick={onOpenAIAssistant}
              className={`${ICON_BUTTON} hover:text-accent`}
              title="Open AI Assistant"
              aria-label="Open AI Assistant"
            >
              <Sparkles size={14} />
            </button>
          )}
          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className={ICON_BUTTON}
            title="Settings"
            aria-label="Open settings"
          >
            <Settings size={14} />
          </button>

          {/* File (export/share) */}
          {hasFileActions && (
            <>
              <div className="my-1 h-px w-5 rounded-full bg-border" />
              <button
                onClick={() => { onToggleCollapsed(); setTimeout(() => setShowFileModal(true), 200) }}
                className={ICON_BUTTON}
                title="File actions"
                aria-label="File actions"
              >
                <FileOutput size={14} />
              </button>
            </>
          )}

          {/* Connections */}
          {onOpenConnections && (
            <button
              onClick={onOpenConnections}
              className={ICON_BUTTON}
              title={`Connections (${connectionsCount})`}
              aria-label={`Connections (${connectionsCount})`}
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
    <>
    {overlay && (
      <div
        className="fixed inset-0 z-40 bg-[rgb(14_12_32_/_0.42)] backdrop-blur-[2px]"
        onClick={onToggleCollapsed}
        aria-hidden
      />
    )}
    <aside
      className={
        overlay
          ? 'glass-strong floating-pop-in fixed inset-y-0 right-0 z-50 flex w-[320px] max-w-[85vw] flex-col rounded-l-3xl rounded-r-none border-l border-border max-md:bottom-[var(--mobile-bar-height,60px)]'
          : 'glass fixed bottom-0 right-0 top-[var(--topbar-height,56px)] z-30 hidden w-[280px] flex-col rounded-none border-l border-border transition-all duration-300 md:flex'
      }
      aria-label="Note details"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <div className={META}>Details</div>
          <div className="mt-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground" title={displayName}>{displayName}</div>
        </div>
        <button
          onClick={onToggleCollapsed}
          className={ICON_BUTTON}
          aria-label={overlay ? 'Close details' : 'Collapse details'}
          title={overlay ? 'Close details' : 'Collapse details'}
        >
          {overlay ? <X size={16} /> : <ChevronRight size={15} />}
        </button>
      </div>
      <div className="mx-4 h-px shrink-0 bg-border" aria-hidden />

      {/* Scrollable Content */}
      <div className="scroll-thin flex-1 overflow-y-auto">
        {/* Save Section */}
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={isSaving || !title.trim()}
              className="glass-btn-primary inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
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
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-danger bg-danger-light text-danger transition-colors hover:bg-danger-light disabled:opacity-50"
                title="Delete note"
                aria-label="Delete note"
              >
                {isDeleting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
              </button>
            )}
          </div>
          {/* Save status */}
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px]">
            {isSaving ? (
              <>
                <Loader2 size={10} className="animate-spin text-accent" />
                <span className="font-medium text-accent">Saving...</span>
              </>
            ) : hasChanges ? (
              <>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
                <span className="font-medium text-warning">Unsaved changes</span>
              </>
            ) : lastSaveDisplay ? (
              <>
                <Check size={11} className="text-success" />
                <span className="font-medium text-success">Saved {lastSaveDisplay}</span>
              </>
            ) : isNewNote ? (
              <span className="italic text-muted">New note — not yet saved</span>
            ) : null}
          </div>
        </div>

        {/* Metadata Section */}
        <div className="border-t border-border px-4 py-3.5">
          <div className={`${META} mb-2.5 block`}>Details</div>
          
          <div className="space-y-1">
            {/* Note Type */}
            <div className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs">
              <TypeIcon size={13} className={typePresentation.iconClassName} />
              <span className="truncate text-foreground">{typePresentation.label}</span>
            </div>

            {/* Folder Path */}
            <div className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs">
              <FolderOpen size={13} className="flex-shrink-0 text-muted" />
              <span className="truncate text-foreground">{folderPath}</span>
            </div>

            {/* Project */}
            {projectInfo && (
              <div className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs">
                <div
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-inset ring-border"
                  style={{ backgroundColor: projectInfo.color }}
                />
                <span className="truncate text-foreground">{projectInfo.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats Section (rich-text only) */}
        {noteType === 'rich-text' && (
          <div className="border-t border-border px-4 py-3.5">
            <div className={`${META} mb-2.5 block`}>Statistics</div>
            
            <div className="mb-2.5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-surface-sunken px-2.5 py-2 text-center">
                <div className="text-sm font-semibold tabular-nums text-foreground">{stats.words}</div>
                <div className="text-[10px] text-muted">{stats.words === 1 ? 'word' : 'words'}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface-sunken px-2.5 py-2 text-center">
                <div className="text-sm font-semibold tabular-nums text-foreground">{stats.characters}</div>
                <div className="text-[10px] text-muted">{stats.characters === 1 ? 'char' : 'chars'}</div>
              </div>
            </div>

            {/* Word Goal */}
            {wordGoal && wordGoalProgress ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className={wordGoalProgress.isComplete ? 'font-medium text-success' : 'text-foreground'}>
                    {stats.words}/{wordGoal} words
                  </span>
                  <button
                    onClick={openWordGoalInput}
                    className="focus-ring flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    title="Edit goal"
                    aria-label="Edit word goal"
                  >
                    <Edit2 size={11} />
                  </button>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-hover">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${
                      wordGoalProgress.isComplete
                        ? 'bg-success'
                        : 'bg-accent'
                    }`}
                    style={{ width: `${wordGoalProgress.percentage}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={openWordGoalInput}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full py-0.5 text-[11px] font-medium text-accent transition-colors hover:text-accent-strong"
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
                  aria-label="Word goal"
                  className="focus-ring min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground placeholder:text-muted focus:border-accent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleWordGoalSubmit()
                    if (e.key === 'Escape') setShowWordGoalInput(false)
                  }}
                />
                <button
                  onClick={handleWordGoalSubmit}
                  className="focus-ring rounded-lg bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-strong"
                >
                  Set
                </button>
                {wordGoal && (
                  <button
                    onClick={() => { onSetWordGoal(null); setShowWordGoalInput(false) }}
                    className="focus-ring rounded-lg p-1 text-danger transition-colors hover:bg-danger-light"
                    title="Remove goal"
                    aria-label="Remove word goal"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {/* Heading count */}
            {headings.length > 0 && (
              <div className="mt-2 text-[11px] text-muted">
                {headings.length} {headings.length === 1 ? 'heading' : 'headings'}
              </div>
            )}
          </div>
        )}

        {/* Table of Contents (rich-text only) */}
        {noteType === 'rich-text' && headings.length > 0 && (
          <div className="border-t border-border px-4 py-3.5">
            <button
              onClick={() => setTocExpanded(prev => !prev)}
              className="focus-ring mb-1.5 flex w-full items-center gap-1.5 rounded-lg text-left"
              aria-expanded={tocExpanded}
            >
              <ChevronRight
                size={12}
                className={`text-muted transition-transform duration-200 ${tocExpanded ? 'rotate-90' : ''}`}
              />
              <ListTree size={12} className="text-muted" />
              <span className={META}>Contents</span>
              <span className="ml-auto text-[10px] tabular-nums text-muted">{headings.length}</span>
            </button>
            {tocExpanded && (
              <div className="space-y-0.5">
                {headings.map((heading, index) => (
                  <button
                    key={heading.id || `${heading.level}-${heading.text}-${index}`}
                    onClick={() => onScrollToHeading?.(heading.id)}
                    className="focus-ring w-full truncate rounded-lg px-2 py-1 text-left text-[11px] leading-5 text-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                    style={{ paddingLeft: `${(heading.level - 1) * 10 + 8}px` }}
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
          <div className="border-t border-border px-4 py-3.5">
            <button
              onClick={onOpenConnections}
              className="focus-ring mb-1.5 flex w-full items-center gap-1.5 rounded-lg text-left"
            >
              <Network size={12} className="text-muted" />
              <span className={META}>Connections</span>
              <span className="ml-auto text-[10px] tabular-nums text-muted">{connectionsCount}</span>
            </button>

            {backlinks.length > 0 ? (
              <div className="space-y-0.5">
                {backlinks.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectBacklink?.(item.id)}
                    className="focus-ring w-full rounded-lg px-2 py-1 text-left text-[11px] text-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
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
              <div className="px-1 text-[11px] text-muted">No backlinks yet</div>
            )}

            {/* Outgoing Links */}
            <div className="mt-3.5">
              <div className={`${META} mb-1.5`}>Outgoing links</div>
              {outgoingLinks.length > 0 ? (
                <div className="space-y-0.5">
                  {outgoingLinks.slice(0, 8).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onSelectOutgoing?.(item.id)}
                      className="focus-ring w-full rounded-lg px-2 py-1 text-left text-[11px] text-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
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
                <div className="px-1 text-[11px] text-muted">No outgoing links</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 space-y-0.5 border-t border-border px-3 py-2.5">
        {hasFileActions && (
          <button
            onClick={() => setShowFileModal(true)}
            className={ROW_BUTTON}
          >
            <FileOutput className="h-3.5 w-3.5 shrink-0" />
            <span>File</span>
            {shareUrl && (
              <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-accent-light">
                <Globe size={9} className="text-accent" />
              </span>
            )}
          </button>
        )}
        {onOpenAIAssistant && (
          <button
            onClick={onOpenAIAssistant}
            className={`${ROW_BUTTON} hover:text-accent`}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span>AI Assistant</span>
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className={ROW_BUTTON}
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span>Settings</span>
        </button>
      </div>
    </aside>

    {/* ---- FILE MODAL (Export / Import / Share) ---- */}
    {showFileModal && (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgb(14_12_32_/_0.44)] p-4 backdrop-blur-[3px]"
        onClick={() => setShowFileModal(false)}
      >
        <div
          className="floating-pop-in glass-strong w-full max-w-md overflow-hidden rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-light text-accent">
                <FileOutput size={15} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">File</h3>
                <p className="mt-0.5 max-w-[240px] truncate text-[11px] text-muted">{displayName}</p>
              </div>
            </div>
            <button
              onClick={() => setShowFileModal(false)}
              className={ICON_BUTTON}
              aria-label="Close file actions"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mx-5 h-px bg-border" aria-hidden />

          {/* Modal Body */}
          <div className="scroll-thin max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
            {/* Export / Import Section */}
            {(onExportMarkdown || onExportPdf || onExportDocx || onExportHtml || onExportPlainText || onImportDocx) && (
              <div>
                <div className={`${META} mb-2 block`}>Export &amp; import</div>
                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                  {onExportPdf && (
                    <button
                      onClick={() => { onExportPdf(); setShowFileModal(false) }}
                      className={FILE_ROW}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-danger-light">
                        <Download size={14} className="text-danger" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Export as PDF</div>
                        <div className="mt-0.5 text-[10px] text-muted">Styled .pdf with page numbers</div>
                      </div>
                    </button>
                  )}
                  {onExportDocx && (
                    <button
                      onClick={() => { onExportDocx(); setShowFileModal(false) }}
                      className={FILE_ROW}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-light">
                        <FileDown size={14} className="text-accent" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Export as DOCX</div>
                        <div className="mt-0.5 text-[10px] text-muted">Word document with title &amp; date</div>
                      </div>
                    </button>
                  )}
                  {onExportMarkdown && (
                    <button
                      onClick={() => { onExportMarkdown(); setShowFileModal(false) }}
                      className={FILE_ROW}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
                        <FileText size={14} className="text-foreground" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Export as Markdown</div>
                        <div className="mt-0.5 text-[10px] text-muted">.md with tables &amp; task lists</div>
                      </div>
                    </button>
                  )}
                  {onExportHtml && (
                    <button
                      onClick={() => { onExportHtml(); setShowFileModal(false) }}
                      className={FILE_ROW}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-success-light">
                        <FileText size={14} className="text-success" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Export as HTML</div>
                        <div className="mt-0.5 text-[10px] text-muted">Standalone web page with styles</div>
                      </div>
                    </button>
                  )}
                  {onExportPlainText && (
                    <button
                      onClick={() => { onExportPlainText(); setShowFileModal(false) }}
                      className={FILE_ROW}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
                        <FileText size={14} className="text-muted" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Export as Plain Text</div>
                        <div className="mt-0.5 text-[10px] text-muted">.txt without formatting</div>
                      </div>
                    </button>
                  )}
                  {onImportDocx && (
                    <button
                      onClick={() => { onImportDocx(); setShowFileModal(false) }}
                      className={FILE_ROW}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-warning-light">
                        <FileUp size={14} className="text-warning" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Import from DOCX</div>
                        <div className="mt-0.5 text-[10px] text-muted">Replace content from Word file</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Share Section */}
            {(onPublish || shareUrl || shareHint) && (
              <div>
                <div className={`${META} mb-2 block`}>Share</div>
                <div className="rounded-2xl border border-border bg-surface p-3.5">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${shareUrl ? 'bg-accent-light text-accent' : 'bg-surface-hover text-muted'}`}>
                      <Globe size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-foreground">
                        {shareUrl ? 'Published via link' : 'Private note'}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        {sharePublishedDisplay
                          ? `Last published ${sharePublishedDisplay}`
                          : shareHint || 'Create a read-only share page for this note.'}
                      </div>
                    </div>
                  </div>

                  {shareUrl && (
                    <div className="mt-3 truncate rounded-xl border border-border bg-surface px-3 py-2 font-mono text-[11px] text-muted">
                      {shareUrl}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {onPublish && (
                      <button
                        onClick={onPublish}
                        disabled={!canPublish || isPublishing || isUnpublishing}
                        className="glass-btn-primary inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isPublishing ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                        <span>{shareUrl ? 'Update share' : 'Publish note'}</span>
                      </button>
                    )}
                    {shareUrl && onCopyShareLink && (
                      <button
                        onClick={onCopyShareLink}
                        className="glass-btn inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-medium"
                      >
                        <Copy size={12} />
                        <span>Copy link</span>
                      </button>
                    )}
                    {shareUrl && onOpenSharePage && (
                      <button
                        onClick={onOpenSharePage}
                        className="glass-btn inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-medium"
                      >
                        <ExternalLink size={12} />
                        <span>Open page</span>
                      </button>
                    )}
                    {shareUrl && onUnpublish && (
                      <button
                        onClick={onUnpublish}
                        disabled={isPublishing || isUnpublishing}
                        className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-danger px-3 py-1.5 text-[11px] font-medium text-danger transition-colors hover:bg-danger-light disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isUnpublishing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                        <span>Unpublish</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </>
  )
}

export default memo(NoteDetailsSidebar)
