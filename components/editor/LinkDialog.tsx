import { AlertCircle, Check, Clock, Edit2, ExternalLink, Globe, Link2, X } from 'lucide-react'
import type { RecentLink } from '@/lib/editor/useEditorDialogState'

interface LinkDialogProps {
  isOpen: boolean
  linkUrl: string
  linkText: string
  linkUrlError: string
  recentLinks: RecentLink[]
  onClose: () => void
  onApply: () => void
  onUrlChange: (value: string) => void
  onTextChange: (value: string) => void
  onUseRecent: (link: RecentLink) => void
}

const FIELD_LABEL =
  'mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted'

const FIELD_INPUT =
  'focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted transition-colors focus:border-accent'

export default function LinkDialog({
  isOpen,
  linkUrl,
  linkText,
  linkUrlError,
  recentLinks,
  onClose,
  onApply,
  onUrlChange,
  onTextChange,
  onUseRecent,
}: LinkDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(14_12_32_/_0.44)] p-4 backdrop-blur-[3px]">
      <div className="floating-pop-in glass-strong w-full max-w-lg rounded-3xl p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-light text-accent">
              <Link2 size={18} />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.01em] text-foreground">Insert link</h3>
              <p className="text-[11px] text-muted">Link text to a page, note, or file</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="Close dialog"
          >
            <X size={17} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="link-dialog-url" className={FIELD_LABEL}>
              <Globe size={12} />
              URL
            </label>
            <div className="relative">
              <input
                id="link-dialog-url"
                type="url"
                value={linkUrl}
                onChange={(e) => onUrlChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    onApply()
                  }
                }}
                placeholder="https://example.com or example.com"
                className={`${FIELD_INPUT} pr-10 ${
                  linkUrlError ? 'border-danger focus:border-danger' : ''
                }`}
                autoFocus
              />
              {linkUrlError && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <AlertCircle size={18} className="text-danger" />
                </div>
              )}
            </div>
            {linkUrlError && (
              <p className="mt-2 flex items-center gap-1 text-xs text-danger">
                <AlertCircle size={13} />
                {linkUrlError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="link-dialog-text" className={FIELD_LABEL}>
              <Edit2 size={12} />
              Link text
            </label>
            <input
              id="link-dialog-text"
              type="text"
              value={linkText}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onApply()
                }
              }}
              placeholder="Custom display text (optional)"
              className={FIELD_INPUT}
            />
            <p className="mt-2 text-[11px] text-muted">Leave empty to use the URL as display text</p>
          </div>

          {recentLinks.length > 0 && (
            <div className="border-t border-border pt-4">
              <div className={FIELD_LABEL}>
                <Clock size={12} />
                Recent links
              </div>
              <div className="scroll-thin max-h-32 space-y-1.5 overflow-y-auto pr-0.5">
                {recentLinks.map((recent, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => onUseRecent(recent)}
                    className="focus-ring group flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-accent hover:bg-surface-hover"
                  >
                    <ExternalLink
                      size={13}
                      className="shrink-0 text-muted transition-colors group-hover:text-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{recent.text}</p>
                      <p className="truncate text-[11px] text-muted">{recent.url}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="glass-btn h-10 rounded-xl px-4 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={!linkUrl.trim()}
              className="glass-btn-primary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check size={16} />
              Insert link
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
