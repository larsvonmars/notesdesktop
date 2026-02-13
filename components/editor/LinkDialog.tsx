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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-alpine-100 rounded-lg">
              <Link2 size={20} className="text-alpine-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900">Insert Link</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Globe size={16} />
              URL
            </label>
            <div className="relative">
              <input
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
                className={`w-full px-4 py-3 pr-10 border-2 ${
                  linkUrlError
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-slate-200 focus:border-alpine-500 focus:ring-alpine-500'
                } rounded-xl focus:ring-2 focus:ring-offset-0 transition-all text-slate-900 placeholder-slate-400`}
                autoFocus
              />
              {linkUrlError && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <AlertCircle size={20} className="text-red-500" />
                </div>
              )}
            </div>
            {linkUrlError && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle size={14} />
                {linkUrlError}
              </p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Edit2 size={16} />
              Link Text (optional)
            </label>
            <input
              type="text"
              value={linkText}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onApply()
                }
              }}
              placeholder="Custom display text"
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-alpine-500 focus:ring-2 focus:ring-alpine-500 focus:ring-offset-0 transition-all text-slate-900 placeholder-slate-400"
            />
            <p className="mt-2 text-xs text-slate-500">Leave empty to use the URL as display text</p>
          </div>

          {recentLinks.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <Clock size={16} />
                Recent Links
              </label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {recentLinks.map((recent, index) => (
                  <button
                    key={index}
                    onClick={() => onUseRecent(recent)}
                    className="w-full px-3 py-2 text-left rounded-lg border border-slate-200 hover:border-alpine-300 hover:bg-alpine-50 transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <ExternalLink size={14} className="text-slate-400 group-hover:text-alpine-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{recent.text}</p>
                        <p className="text-xs text-slate-500 truncate">{recent.url}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={onApply}
              disabled={!linkUrl.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-alpine-600 to-alpine-700 text-white rounded-xl hover:from-alpine-700 hover:to-alpine-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg shadow-alpine-500/30 disabled:shadow-none flex items-center gap-2"
            >
              <Check size={18} />
              Insert Link
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
