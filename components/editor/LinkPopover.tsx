import { Check, Copy, Edit2, ExternalLink, Trash2 } from 'lucide-react'

interface LinkPopoverProps {
  isOpen: boolean
  top: number
  left: number
  linkElement: HTMLAnchorElement | null
  copiedLink: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onOpen: (url: string) => void
  onEdit: (linkElement: HTMLAnchorElement) => void
  onCopy: (url: string) => void
  onRemove: (linkElement: HTMLAnchorElement) => void
}

const PILL =
  'focus-ring inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors'

/**
 * Hover card over an inline link. Positioning and the hover-intent callbacks
 * are owned by the host; this file only paints the card.
 */
export default function LinkPopover({
  isOpen,
  top,
  left,
  linkElement,
  copiedLink,
  onMouseEnter,
  onMouseLeave,
  onOpen,
  onEdit,
  onCopy,
  onRemove,
}: LinkPopoverProps) {
  if (!isOpen || !linkElement) return null

  return (
    <div
      className="link-popover floating-pop-in glass-strong fixed z-50 min-w-[320px] max-w-[400px] rounded-2xl p-3"
      style={{ top: `${top}px`, left: `${left}px` }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent">
          <ExternalLink size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
            {linkElement.textContent}
          </p>
          <a
            href={linkElement.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2.5 block truncate text-[11px] font-medium text-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {linkElement.href}
          </a>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpen(linkElement.href)}
              className={`${PILL} bg-accent text-accent-foreground hover:bg-accent-strong`}
              title="Open link in new tab"
            >
              <ExternalLink size={13} />
              Open
            </button>
            <button
              type="button"
              onClick={() => onEdit(linkElement)}
              className={`${PILL} bg-surface-hover text-foreground hover:bg-surface-active`}
              title="Edit link"
            >
              <Edit2 size={13} />
              Edit
            </button>
            <button
              type="button"
              onClick={() => onCopy(linkElement.href)}
              className={`${PILL} ${
                copiedLink
                  ? 'bg-success-light text-success'
                  : 'bg-surface-hover text-foreground hover:bg-surface-active'
              }`}
              title="Copy link"
            >
              {copiedLink ? (
                <>
                  <Check size={13} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={13} />
                  Copy
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onRemove(linkElement)}
              className={`${PILL} ml-auto text-danger hover:bg-danger-light`}
              title="Remove link"
            >
              <Trash2 size={13} />
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
