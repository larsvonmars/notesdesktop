'use client'

import { useIsMobile } from '@/lib/useIsMobile'
import ThemeSelector from './ThemeSelector'
import ModalCloseButton from './ModalCloseButton'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const isMobile = useIsMobile()

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full flex flex-col overflow-hidden ${
          isMobile ? 'max-w-full max-h-[92vh]' : 'max-w-lg max-h-[82vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-white to-gray-50 dark:from-slate-900 dark:to-slate-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Settings</h2>
          <ModalCloseButton onClick={onClose} ariaLabel="Close settings" className="dark:text-slate-400" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-8">
          {/* ─── Appearance ─── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3">Appearance</h3>
            <ThemeSelector />
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/60">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm font-medium text-gray-700 dark:text-slate-100 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
