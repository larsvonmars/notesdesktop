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
      className="link-popover fixed z-50 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 min-w-[320px] max-w-[400px]"
      style={{ top: `${top}px`, left: `${left}px` }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-alpine-100 rounded-lg flex-shrink-0">
          <ExternalLink size={16} className="text-alpine-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate mb-1">{linkElement.textContent}</p>
          <a
            href={linkElement.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-alpine-600 hover:text-alpine-800 truncate block mb-2"
            onClick={(e) => e.stopPropagation()}
          >
            {linkElement.href}
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpen(linkElement.href)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-alpine-600 bg-alpine-50 hover:bg-alpine-100 rounded-lg transition-colors"
              title="Open link in new tab"
            >
              <ExternalLink size={14} />
              Open
            </button>
            <button
              onClick={() => onEdit(linkElement)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              title="Edit link"
            >
              <Edit2 size={14} />
              Edit
            </button>
            <button
              onClick={() => onCopy(linkElement.href)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              title="Copy link"
            >
              {copiedLink ? (
                <>
                  <Check size={14} className="text-green-600" />
                  <span className="text-green-600">Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy
                </>
              )}
            </button>
            <button
              onClick={() => onRemove(linkElement)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors ml-auto"
              title="Remove link"
            >
              <Trash2 size={14} />
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
