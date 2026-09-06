import BaseModal from '@/components/BaseModal'

export type MindmapExportFormat = 'png' | 'jpeg'
export type MindmapExportBackground = 'canvas' | 'transparent' | 'white' | 'custom'

interface MindmapExportDialogProps {
  open: boolean
  filename: string
  format: MindmapExportFormat
  scale: number
  quality: number
  background: MindmapExportBackground
  customBg: string
  isExporting: boolean
  getDimensions: (scale: number) => { width: number; height: number }
  getEstimatedSize: () => number
  onClose: () => void
  onFilenameChange: (value: string) => void
  onFormatChange: (format: MindmapExportFormat) => void
  onScaleChange: (scale: number) => void
  onQualityChange: (quality: number) => void
  onBackgroundChange: (background: MindmapExportBackground) => void
  onCustomBgChange: (color: string) => void
  onExport: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MindmapExportDialog({
  open,
  filename,
  format,
  scale,
  quality,
  background,
  customBg,
  isExporting,
  getDimensions,
  getEstimatedSize,
  onClose,
  onFilenameChange,
  onFormatChange,
  onScaleChange,
  onQualityChange,
  onBackgroundChange,
  onCustomBgChange,
  onExport,
}: MindmapExportDialogProps) {
  return (
    <BaseModal isOpen={open} onClose={onClose} size="lg">
      <div className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Export Mindmap</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Preview */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Preview</label>
            <div className="relative aspect-video rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
                {(format === 'png' ? 'PNG' : 'JPEG')} · {scale}× · {getDimensions(scale).width}×{getDimensions(scale).height}px
              </div>
              <div className="absolute bottom-2 left-2 right-2 text-center text-xs text-slate-400">
                ~{formatBytes(getEstimatedSize())}
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-col gap-4">
            {/* Filename */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Filename</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => onFilenameChange(e.target.value.replace(/[^a-zA-Z0-9_\-\s]/g, '').slice(0, 60))}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-alpine-500"
                  placeholder="mindmap"
                />
                <span className="text-sm text-slate-400 shrink-0">.{format === 'jpeg' ? 'jpg' : 'png'}</span>
              </div>
            </div>

            {/* Format */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Format</label>
              <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
                {(['png', 'jpeg'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => {
                      onFormatChange(fmt)
                      if (fmt === 'jpeg' && background === 'transparent') onBackgroundChange('white')
                    }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      format === fmt
                        ? 'bg-alpine-500 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {fmt === 'png' ? 'PNG' : 'JPEG'}
                  </button>
                ))}
              </div>
            </div>

            {/* Scale */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Scale</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((s) => (
                  <button
                    key={s}
                    onClick={() => onScaleChange(s)}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      scale === s
                        ? 'bg-alpine-500 text-white'
                        : 'border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {s}×
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0.5}
                    max={4}
                    step={0.5}
                    value={![1,2,3].includes(scale) ? scale : ''}
                    placeholder="Custom"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      if (v >= 0.5 && v <= 4) onScaleChange(v)
                    }}
                    className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-center text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-alpine-500"
                  />
                  <span className="text-xs text-slate-400">×</span>
                </div>
              </div>
            </div>

            {/* JPEG Quality */}
            {format === 'jpeg' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Quality: {Math.round(quality * 100)}%
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.01}
                  value={quality}
                  onChange={(e) => onQualityChange(parseFloat(e.target.value))}
                  className="w-full accent-alpine-500"
                />
              </div>
            )}

            {/* Background */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Background</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ['canvas', 'Theme'],
                  ['white', 'White'],
                  ...(format === 'png' ? [['transparent', 'Transparent']] as const : []),
                  ['custom', 'Custom'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => onBackgroundChange(key)}
                    className={`py-2 text-sm font-medium rounded-lg transition-colors ${
                      background === key
                        ? 'bg-alpine-500 text-white'
                        : 'border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {background === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customBg}
                    onChange={(e) => onCustomBgChange(e.target.value)}
                    className="w-8 h-8 rounded border border-slate-200 dark:border-slate-600 cursor-pointer"
                  />
                  <span className="text-xs text-slate-400">{customBg}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-400">
            {getDimensions(scale).width} × {getDimensions(scale).height} px
            {' · '}~{formatBytes(getEstimatedSize())}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              disabled={isExporting}
            >
              Cancel
            </button>
            <button
              onClick={onExport}
              disabled={isExporting}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-alpine-500 text-white hover:bg-alpine-600 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isExporting && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {isExporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </div>
      </div>
    </BaseModal>
  )
}
