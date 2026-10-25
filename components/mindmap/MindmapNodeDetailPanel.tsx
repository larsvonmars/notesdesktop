import {
  DEFAULT_COLORS,
  getTextNoteIdFromAttachment,
  type AttachmentInput,
  type MindmapNode,
  type MindmapTextNote,
  type NodeDetailDraft,
} from '@/lib/mindmap'
import { Check, Edit2, Info, Plus, RotateCcw, Trash2, X } from 'lucide-react'

interface MindmapNodeDetailPanelProps {
  node: MindmapNode
  draft: NodeDetailDraft
  readOnly: boolean
  useSharedDetailLayout: boolean
  useSharedDetailBottomSheet: boolean
  isSheetDragging: boolean
  sheetDragOffset: number
  linkedTextNoteId: string
  availableTextNotes: MindmapTextNote[]
  isCreatingTextNote: boolean
  textNoteActionError: string | null
  newAttachmentInput: AttachmentInput
  onClose: () => void
  onUpdateDraft: (updates: Partial<NodeDetailDraft>) => void
  onSetAttachmentInput: (input: AttachmentInput) => void
  onLinkedTextNoteChange: (noteId: string) => void
  onAddAttachment: () => void
  onRemoveAttachment: (attachmentId: string) => void
  onSave: () => void
  onApplyLinkedNote: (noteId: string) => void
  onOpenLinkedNote: (noteId: string) => void
  onCreateLinkedNote: () => void
  onStartSheetDrag: (event: React.PointerEvent<HTMLElement>) => void
  onMoveSheetDrag: (event: React.PointerEvent<HTMLElement>) => void
  onEndSheetDrag: (event?: React.PointerEvent<HTMLElement>) => void
}

const fieldLabelClass = 'text-sm font-medium text-foreground'
const metaLabelClass = 'text-[11px] font-medium uppercase tracking-[0.08em] text-muted'
const readOnlyBoxClass =
  'w-full rounded-xl border border-border bg-[var(--surface-sunken)] px-3 py-2 text-sm text-foreground'
const fieldInputClass = 'glass-input px-3 text-sm'
const secondaryButtonClass =
  'glass-btn gap-2 px-4 disabled:cursor-not-allowed disabled:opacity-40'

export default function MindmapNodeDetailPanel({
  node,
  draft,
  readOnly,
  useSharedDetailLayout,
  useSharedDetailBottomSheet,
  isSheetDragging,
  sheetDragOffset,
  linkedTextNoteId,
  availableTextNotes,
  isCreatingTextNote,
  textNoteActionError,
  newAttachmentInput,
  onClose,
  onUpdateDraft,
  onSetAttachmentInput,
  onLinkedTextNoteChange,
  onAddAttachment,
  onRemoveAttachment,
  onSave,
  onApplyLinkedNote,
  onOpenLinkedNote,
  onCreateLinkedNote,
  onStartSheetDrag,
  onMoveSheetDrag,
  onEndSheetDrag,
}: MindmapNodeDetailPanelProps) {
  return (
    <div
      className={`absolute inset-0 z-20 p-3 ${
        useSharedDetailLayout
          ? useSharedDetailBottomSheet
            ? 'flex items-end justify-center bg-black/30 backdrop-blur-sm dark:bg-black/60'
            : 'pointer-events-none flex items-stretch justify-end'
          : 'flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm dark:bg-black/70'
      }`}
      onClick={() => {
        if (useSharedDetailBottomSheet && !isSheetDragging) {
          onClose()
        }
      }}
    >
      <div
        className={`glass-strong overflow-hidden pointer-events-auto ${
          useSharedDetailLayout
            ? useSharedDetailBottomSheet
              ? 'w-full max-w-2xl max-h-[78vh] rounded-2xl'
              : 'h-full w-full max-w-md rounded-2xl'
            : 'w-full max-w-2xl rounded-2xl'
        }`}
        role="dialog"
        aria-modal={!useSharedDetailLayout}
        onClick={(event) => event.stopPropagation()}
        onPointerMove={onMoveSheetDrag}
        onPointerUp={onEndSheetDrag}
        onPointerCancel={onEndSheetDrag}
        style={
          useSharedDetailBottomSheet
            ? {
                transform: `translateY(${sheetDragOffset}px)`,
                transition: isSheetDragging ? 'none' : 'transform 220ms ease-out',
              }
            : undefined
        }
      >
        {useSharedDetailBottomSheet && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              aria-label="Drag down to close"
              className="h-5 w-16 cursor-grab touch-none rounded-full bg-border-strong active:cursor-grabbing"
              onPointerDown={onStartSheetDrag}
            />
          </div>
        )}
        <div className="flex items-start justify-between gap-4 px-5 py-3 border-b border-border">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-muted">
              {readOnly ? <Info size={18} /> : <Edit2 size={18} />}
              {readOnly ? 'Node Overview' : 'Node Details'}
            </div>
            <h3 className="mt-1 break-words font-display text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground">
              {node.text}
            </h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-3 py-1">
                Children: {node.children.length}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-3 py-1">
                Attachments: {draft.attachments.length}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="Close node detail"
          >
            <X size={16} />
          </button>
        </div>

        <div
          className={`scroll-thin px-5 py-4 space-y-5 overflow-y-auto ${
            useSharedDetailLayout
              ? useSharedDetailBottomSheet
                ? 'max-h-[58vh]'
                : 'h-[calc(100%-132px)]'
              : 'max-h-[70vh]'
          }`}
        >
          <div className="space-y-2">
            <label className={fieldLabelClass} htmlFor="mindmap-node-title">
              Title
            </label>
            {readOnly ? (
              <div className={readOnlyBoxClass}>
                {draft.text || 'Untitled Node'}
              </div>
            ) : (
              <input
                id="mindmap-node-title"
                type="text"
                value={draft.text}
                onChange={(e) => onUpdateDraft({ text: e.target.value })}
                className={fieldInputClass}
                placeholder="Node title"
              />
            )}
          </div>

          <div className="space-y-2">
            <label className={fieldLabelClass} htmlFor="mindmap-node-description">
              Description
            </label>
            {readOnly ? (
              <div className={`${readOnlyBoxClass} whitespace-pre-wrap min-h-[120px]`}>
                {draft.description?.trim() ? draft.description : 'No description provided.'}
              </div>
            ) : (
              <textarea
                id="mindmap-node-description"
                value={draft.description}
                onChange={(e) => onUpdateDraft({ description: e.target.value })}
                rows={5}
                className={`${fieldInputClass} h-auto min-h-[120px] py-2`}
                placeholder="Add more context, notes, or action items"
              />
            )}
          </div>

          {!readOnly && (
          <div className="space-y-3 rounded-2xl border border-border bg-[var(--surface-sunken)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className={fieldLabelClass}>Linked text note</span>
              <span className="text-xs text-muted">Use note content as description</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                value={linkedTextNoteId}
                onChange={(event) => onLinkedTextNoteChange(event.target.value)}
                className={fieldInputClass}
              >
                <option value="">Select a text note…</option>
                {availableTextNotes.map((note) => (
                  <option key={note.id} value={note.id}>
                    {note.title || 'Untitled'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onApplyLinkedNote(linkedTextNoteId)}
                disabled={!linkedTextNoteId}
                className={secondaryButtonClass}
              >
                <Check size={16} />
                Link note
              </button>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => onOpenLinkedNote(linkedTextNoteId)}
                disabled={!linkedTextNoteId}
                className="glass-btn h-8 gap-2 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Edit2 size={14} />
                Open linked note
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted">Need a new note for this node?</span>
              <button
                type="button"
                onClick={onCreateLinkedNote}
                disabled={isCreatingTextNote}
                className="glass-btn-primary h-8 gap-2 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isCreatingTextNote ? (
                  <>
                    <RotateCcw size={14} className="animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    Create text note
                  </>
                )}
              </button>
            </div>

            {textNoteActionError && (
              <p className="text-xs text-danger">{textNoteActionError}</p>
            )}
          </div>
          )}

          {!readOnly && (
          <div className="space-y-3">
            <span className={fieldLabelClass}>Accent color</span>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_COLORS.map((color) => {
                const isActive = draft.color === color
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onUpdateDraft({ color })}
                    className={`h-9 w-9 rounded-full border-2 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-glow)] ${
                      isActive ? 'border-foreground scale-105' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Set node color ${color}`}
                  />
                )
              })}
            </div>
          </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={fieldLabelClass}>Attachments</span>
              <span className={metaLabelClass}>Image URLs or external links</span>
            </div>

            {draft.attachments.length === 0 ? (
              <p className="text-sm text-muted">
                No attachments yet. Add an image or link below.
              </p>
            ) : (
              <div className="grid gap-3">
                {draft.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-[var(--surface-sunken)] p-3"
                  >
                    {attachment.type === 'image' ? (
                      <div className="h-14 w-14 overflow-hidden rounded-xl border border-border bg-surface-solid shrink-0">
                        <img
                          src={attachment.url}
                          alt={attachment.label}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-border-strong text-muted shrink-0">
                        ↗
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground truncate">{attachment.label}</p>
                        <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">{attachment.type}</span>
                      </div>
                      {getTextNoteIdFromAttachment(attachment) ? (
                        <button
                          type="button"
                          onClick={() => {
                            const noteId = getTextNoteIdFromAttachment(attachment)
                            if (!noteId) return
                            onOpenLinkedNote(noteId)
                          }}
                          className="text-xs text-accent hover:underline break-all"
                        >
                          Open linked text note
                        </button>
                      ) : (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-accent hover:underline break-all"
                        >
                          {attachment.url}
                        </a>
                      )}
                    </div>
                    {!readOnly && (
                      <button
                        onClick={() => onRemoveAttachment(attachment.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition-colors hover:bg-surface-hover hover:text-foreground shrink-0"
                        aria-label="Remove attachment"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!readOnly && (
              <>
                {/* Add attachment form — stacked vertically for mobile friendliness */}
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={newAttachmentInput.label}
                    onChange={(e) =>
                      onSetAttachmentInput({ ...newAttachmentInput, label: e.target.value })
                    }
                    placeholder="Label (optional)"
                    className={fieldInputClass}
                  />
                  <input
                    type="url"
                    value={newAttachmentInput.url}
                    onChange={(e) =>
                      onSetAttachmentInput({ ...newAttachmentInput, url: e.target.value })
                    }
                    placeholder="https://example.com/image.png"
                    className={fieldInputClass}
                  />
                  <div className="flex gap-2">
                    <select
                      value={newAttachmentInput.type}
                      onChange={(e) =>
                        onSetAttachmentInput({
                          ...newAttachmentInput,
                          type: e.target.value === 'link' ? 'link' : 'image',
                        })
                      }
                      className={`flex-1 ${fieldInputClass}`}
                    >
                      <option value="image">Image</option>
                      <option value="link">Link</option>
                    </select>
                    <button
                      onClick={onAddAttachment}
                      disabled={!newAttachmentInput.url.trim()}
                      className="glass-btn-primary gap-2 px-4 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border bg-[var(--surface-sunken)] px-5 py-3">
          <button
            onClick={onClose}
            className="glass-btn gap-2 px-4"
          >
            <X size={16} />
            Close
          </button>
          {!readOnly && (
            <button
              onClick={onSave}
              className="glass-btn-primary gap-2 px-4"
            >
              <Check size={16} />
              Save changes
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
