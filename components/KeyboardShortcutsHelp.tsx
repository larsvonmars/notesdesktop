'use client'

import { Keyboard } from 'lucide-react'
import { KEYBOARD_SHORTCUTS, AUTOFORMAT_HELP, formatShortcutKeys, getShortcutsByCategory } from '@/lib/editor/keyboardShortcuts'
import BaseModal, { ModalHeader, ModalBody, ModalFooter, ModalTitle } from './BaseModal'

interface KeyboardShortcutsHelpProps {
  isOpen: boolean
  onClose: () => void
}

export default function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  if (!isOpen) return null

  const categories = [
    { id: 'formatting', title: 'Text Formatting' },
    { id: 'blocks', title: 'Blocks & Structure' },
    { id: 'editing', title: 'Editing' },
  ] as const

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="3xl" maxHeight="80vh">
        <ModalHeader onClose={onClose} closeAriaLabel="Close keyboard shortcuts">
          <Keyboard size={24} className="text-alpine-600" />
          <ModalTitle>Keyboard Shortcuts</ModalTitle>
        </ModalHeader>

        <ModalBody className="space-y-6">
          {/* Keyboard Shortcuts */}
          <div className="space-y-4">
            {categories.map(({ id, title }) => {
              const shortcuts = getShortcutsByCategory(id as any)
              if (shortcuts.length === 0) return null

              return (
                <div key={id}>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                    {title}
                  </h3>
                  <div className="space-y-2">
                    {shortcuts.map((shortcut, index) => (
                      <div key={index} className="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-50">
                        <span className="text-gray-700">{shortcut.description}</span>
                        <kbd className="px-3 py-1 text-sm font-mono bg-gray-100 border border-gray-300 rounded shadow-sm">
                          {formatShortcutKeys(shortcut.keys)}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Autoformat Patterns */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Markdown Auto-formatting
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              Type these patterns and press <kbd className="px-2 py-0.5 text-xs font-mono bg-gray-100 border border-gray-300 rounded">Space</kbd> to auto-format:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {AUTOFORMAT_HELP.map((item, index) => (
                <div key={index} className="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-50">
                  <span className="text-gray-700 text-sm">{item.description}</span>
                  <code className="px-2 py-1 text-xs font-mono bg-alpine-50 text-alpine-700 rounded border border-alpine-200">
                    {item.pattern}
                  </code>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Tips */}
          <div className="bg-alpine-50 border border-alpine-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-alpine-900 mb-2">💡 Pro Tips</h4>
            <ul className="text-sm text-alpine-800 space-y-1">
              <li>• Select text to see the floating toolbar for quick formatting</li>
              <li>• Paste Markdown text and it will be automatically converted</li>
              <li>• Drag and drop images to insert them (if supported)</li>
              <li>• Use the slash command <code className="px-1 py-0.5 bg-alpine-100 rounded">/</code> for quick access to all features</li>
            </ul>
          </div>
        </ModalBody>

        <ModalFooter className="bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-alpine-600 text-white rounded-md hover:bg-alpine-700 transition-colors"
          >
            Got it!
          </button>
        </ModalFooter>
    </BaseModal>
  )
}
