import { Search, X } from 'lucide-react'

interface SearchReplaceDialogProps {
  isOpen: boolean
  searchQuery: string
  replaceQuery: string
  caseSensitive: boolean
  searchMatchesCount: number
  currentMatchIndex: number
  onClose: () => void
  onSearchQueryChange: (value: string) => void
  onReplaceQueryChange: (value: string) => void
  onCaseSensitiveChange: (checked: boolean) => void
  onFind: () => void
  onPrevious: () => void
  onNext: () => void
  onReplace: () => void
  onReplaceAll: () => void
}

export default function SearchReplaceDialog({
  isOpen,
  searchQuery,
  replaceQuery,
  caseSensitive,
  searchMatchesCount,
  currentMatchIndex,
  onClose,
  onSearchQueryChange,
  onReplaceQueryChange,
  onCaseSensitiveChange,
  onFind,
  onPrevious,
  onNext,
  onReplace,
  onReplaceAll,
}: SearchReplaceDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Search size={20} />
            Find & Replace
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Find</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Search text..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                autoFocus
              />
              <button
                onClick={onFind}
                className="px-4 py-2 bg-alpine-600 text-white rounded-md hover:bg-alpine-700 transition-colors"
              >
                Find
              </button>
            </div>
            {searchMatchesCount > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {currentMatchIndex + 1} of {searchMatchesCount}
                </span>
                <button
                  onClick={onPrevious}
                  className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={onNext}
                  className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Replace with</label>
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => onReplaceQueryChange(e.target.value)}
              placeholder="Replacement text..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => onCaseSensitiveChange(e.target.checked)}
                className="rounded border-gray-300"
              />
              Case sensitive
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onReplace}
              disabled={searchMatchesCount === 0}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Replace
            </button>
            <button
              onClick={onReplaceAll}
              disabled={searchMatchesCount === 0}
              className="px-4 py-2 bg-alpine-600 text-white rounded-md hover:bg-alpine-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Replace All
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
