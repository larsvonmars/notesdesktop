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
            ? 'flex items-end justify-center bg-slate-900/30'
            : 'pointer-events-none flex items-stretch justify-end'
          : 'flex items-end sm:items-center justify-center bg-slate-900/50 '
      }`}
      onClick={() => {
        if (useSharedDetailBottomSheet && !isSheetDragging) {
          onClose()
        }
      }}
    >
      <div
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden shadow-2xl pointer-events-auto ${
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
              className="h-5 w-16 cursor-grab touch-none rounded-full bg-slate-300/80 active:cursor-grabbing dark:bg-slate-600/80"
              onPointerDown={onStartSheetDrag}
            />
          </div>
        )}
        <div className="flex items-start justify-between gap-4 px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-sm font-medium">
              {readOnly ? <Info size={18} /> : <Edit2 size={18} />}
              {readOnly ? 'Node Overview' : 'Node Details'}
            </div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-1 leading-tight break-words">
              {node.text}
            </h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1">
                Children: {node.children.length}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1">
                Attachments: {draft.attachments.length}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close node detail"
          >
            <X size={16} />
          </button>
        </div>

        <div
          className={`px-5 py-4 space-y-5 overflow-y-auto ${
            useSharedDetailLayout
              ? useSharedDetailBottomSheet
                ? 'max-h-[58vh]'
                : 'h-[calc(100%-132px)]'
              : 'max-h-[70vh]'
          }`}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="mindmap-node-title">
              Title
            </label>
            {readOnly ? (
              <div className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm">
                {draft.text || 'Untitled Node'}
              </div>
            ) : (
              <input
                id="mindmap-node-title"
                type="text"
                value={draft.text}
                onChange={(e) => onUpdateDraft({ text: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm shadow-sm focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
                placeholder="Node title"
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="mindmap-node-description">
              Description
            </label>
            {readOnly ? (
              <div className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 px-3 py-2 text-sm whitespace-pre-wrap min-h-[120px]">
                {draft.description?.trim() ? draft.description : 'No description provided.'}
              </div>
            ) : (
              <textarea
                id="mindmap-node-description"
                value={draft.description}
                onChange={(e) => onUpdateDraft({ description: e.target.value })}
                rows={5}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm shadow-sm focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
                placeholder="Add more context, notes, or action items"
              />
            )}
          </div>

          {!readOnly && (
          <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Linked text note</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Use note content as description</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                value={linkedTextNoteId}
                onChange={(event) => onLinkedTextNoteChange(event.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm shadow-sm focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
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
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Edit2 size={14} />
                Open linked note
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Need a new note for this node?</span>
              <button
                type="button"
                onClick={onCreateLinkedNote}
                disabled={isCreatingTextNote}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-alpine-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-alpine-700 disabled:cursor-not-allowed disabled:opacity-40"
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
              <p className="text-xs text-red-600 dark:text-red-400">{textNoteActionError}</p>
            )}
          </div>
          )}

          {!readOnly && (
          <div className="space-y-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Accent color</span>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_COLORS.map((color) => {
                const isActive = draft.color === color
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onUpdateDraft({ color })}
                    className={`h-9 w-9 rounded-full border-2 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-alpine-400 ${
                      isActive ? 'border-slate-900 dark:border-white scale-105' : 'border-transparent'
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
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Attachments</span>
              <span className="text-xs text-slate-400">Image URLs or external links</span>
            </div>

            {draft.attachments.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No attachments yet. Add an image or link below.
              </p>
            ) : (
              <div className="grid gap-3">
                {draft.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-3"
                  >
                    {attachment.type === 'image' ? (
                      <div className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
                        <img
                          src={attachment.url}
                          alt={attachment.label}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 shrink-0">
                        ↗
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{attachment.label}</p>
                        <span className="text-xs uppercase tracking-wide text-slate-400 shrink-0">{attachment.type}</span>
                      </div>
                      {getTextNoteIdFromAttachment(attachment) ? (
                        <button
                          type="button"
                          onClick={() => {
                            const noteId = getTextNoteIdFromAttachment(attachment)
                            if (!noteId) return
                            onOpenLinkedNote(noteId)
                          }}
                          className="text-xs text-alpine-600 hover:underline break-all"
                        >
                          Open linked text note
                        </button>
                      ) : (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-alpine-600 hover:underline break-all"
                        >
                          {attachment.url}
                        </a>
                      )}
                    </div>
                    {!readOnly && (
                      <button
                        onClick={() => onRemoveAttachment(attachment.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
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
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm shadow-sm focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
                  />
                  <input
                    type="url"
                    value={newAttachmentInput.url}
                    onChange={(e) =>
                      onSetAttachmentInput({ ...newAttachmentInput, url: e.target.value })
                    }
                    placeholder="https://example.com/image.png"
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm shadow-sm focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
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
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm shadow-sm focus:border-alpine-500 focus:outline-none focus:ring-2 focus:ring-alpine-200"
                    >
                      <option value="image">Image</option>
                      <option value="link">Link</option>
                    </select>
                    <button
                      onClick={onAddAttachment}
                      disabled={!newAttachmentInput.url.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-alpine-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-alpine-700 disabled:cursor-not-allowed disabled:opacity-40"
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

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-5 py-3">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={16} />
            Close
          </button>
          {!readOnly && (
            <button
              onClick={onSave}
              className="inline-flex items-center gap-2 rounded-lg bg-alpine-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-alpine-700 transition-colors"
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
