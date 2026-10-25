import { Download, Loader2 } from 'lucide-react'
import BaseModal, { ModalBody, ModalFooter, ModalHeader, ModalTitle } from '@/components/BaseModal'

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

const metaLabelClass = 'text-[11px] font-medium uppercase tracking-[0.08em] text-muted'

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
  const dimensions = getDimensions(scale)

  return (
    <BaseModal isOpen={open} onClose={onClose} size="lg" maxHeight="90vh" animation="zoom">
      <ModalHeader onClose={onClose} closeAriaLabel="Close export dialog" gradient={false}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent">
          <Download size={17} strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0">
          <ModalTitle>Export Mindmap</ModalTitle>
          <p className="mt-0.5 truncate text-xs leading-5 text-muted">Format, scale and background</p>
        </div>
      </ModalHeader>

      <ModalBody>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Preview */}
          <div className="flex flex-col gap-2">
            <div className={metaLabelClass}>Preview</div>
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-border bg-[var(--surface-sunken)]">
              <span className="px-4 text-center text-sm text-muted">
                {(format === 'png' ? 'PNG' : 'JPEG')} · {scale}× · {dimensions.width}×{dimensions.height}px
              </span>
              <span className="absolute bottom-2 left-2 right-2 text-center text-[11px] text-muted">
                ~{formatBytes(getEstimatedSize())}
              </span>
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-col gap-4">
            {/* Filename */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mindmap-export-filename" className={metaLabelClass}>Filename</label>
              <div className="flex items-center gap-1.5">
                <input
                  id="mindmap-export-filename"
                  type="text"
                  value={filename}
                  onChange={(e) => onFilenameChange(e.target.value.replace(/[^a-zA-Z0-9_\-\s]/g, '').slice(0, 60))}
                  className="glass-input h-9 min-w-0 flex-1 px-3 text-sm"
                  placeholder="mindmap"
                />
                <span className="shrink-0 text-sm text-muted">.{format === 'jpeg' ? 'jpg' : 'png'}</span>
              </div>
            </div>

            {/* Format */}
            <div className="flex flex-col gap-1.5">
              <div className={metaLabelClass}>Format</div>
              <div className="segmented w-full" role="group" aria-label="Export format">
                {(['png', 'jpeg'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    aria-pressed={format === fmt}
                    onClick={() => {
                      onFormatChange(fmt)
                      if (fmt === 'jpeg' && background === 'transparent') onBackgroundChange('white')
                    }}
                    className="segmented-item h-8 flex-1"
                  >
                    {fmt === 'png' ? 'PNG' : 'JPEG'}
                  </button>
                ))}
              </div>
            </div>

            {/* Scale */}
            <div className="flex flex-col gap-1.5">
              <div className={metaLabelClass}>Scale</div>
              <div className="flex items-center gap-2">
                <div className="segmented min-w-0 flex-1" role="group" aria-label="Export scale">
                  {[1, 2, 3].map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={scale === s}
                      onClick={() => onScaleChange(s)}
                      className="segmented-item h-8 flex-1"
                    >
                      {s}×
                    </button>
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-1">
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
                    aria-label="Custom export scale"
                    className="glass-input h-8 w-16 px-2 text-center text-xs"
                  />
                  <span className="text-xs text-muted">×</span>
                </div>
              </div>
            </div>

            {/* JPEG Quality */}
            {format === 'jpeg' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mindmap-export-quality" className={metaLabelClass}>
                  Quality: {Math.round(quality * 100)}%
                </label>
                <input
                  id="mindmap-export-quality"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.01}
                  value={quality}
                  onChange={(e) => onQualityChange(parseFloat(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            )}

            {/* Background */}
            <div className="flex flex-col gap-1.5">
              <div className={metaLabelClass}>Background</div>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ['canvas', 'Theme'],
                  ['white', 'White'],
                  ...(format === 'png' ? [['transparent', 'Transparent']] as const : []),
                  ['custom', 'Custom'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={background === key}
                    onClick={() => onBackgroundChange(key)}
                    className={`focus-ring rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      background === key
                        ? 'border-accent bg-[var(--accent-light)] text-accent'
                        : 'border-border bg-[var(--surface-sunken)] text-muted hover:bg-surface-hover hover:text-foreground'
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
                    aria-label="Custom background color"
                    className="h-9 w-9 cursor-pointer rounded-lg border border-border bg-transparent"
                  />
                  <span className="font-mono text-xs text-muted">{customBg}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </ModalBody>

      {/* Bottom bar */}
      <ModalFooter className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs tabular-nums text-muted">
          {dimensions.width} × {dimensions.height} px
          {' · '}~{formatBytes(getEstimatedSize())}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            type="button"
            className="glass-btn h-9 px-4 text-[13px]"
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            onClick={onExport}
            type="button"
            disabled={isExporting}
            className="glass-btn-primary h-9 gap-2 px-4 text-[13px]"
          >
            {isExporting && <Loader2 size={15} className="animate-spin" />}
            {isExporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </ModalFooter>
    </BaseModal>
  )
}
