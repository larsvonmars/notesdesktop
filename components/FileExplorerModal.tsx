'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Upload,
  FolderPlus,
  Trash2,
  Download,
  ChevronRight,
  Home,
  Grid3x3,
  List,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileIcon,
  File,
  Music,
  Video,
  Archive,
  Eye,
  MoreVertical,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  Loader2,
  Check,
  CheckSquare,
  Square,
  FolderOpen,
  AlertCircle,
  RefreshCw,
  Pencil,
  Copy,
} from 'lucide-react'
import ModalCloseButton from './ModalCloseButton'
import BaseModal, { ModalHeader, ModalTitle } from './BaseModal'
import {
  listItems,
  uploadFiles,
  deleteFile,
  deleteFiles,
  deleteStorageFolder,
  createStorageFolder,
  getFileUrl,
  triggerDownload,
  renameFile,
  formatFileSize,
  isPreviewableImage,
  isPreviewablePdf,
  isPreviewableText,
  getFileIconHint,
  type StorageItem,
} from '@/lib/file-storage'
import { useToast } from '@/components/ToastProvider'

// ============================================================================
// TYPES
// ============================================================================

export interface FileExplorerModalProps {
  isOpen: boolean
  onClose: () => void
  /** When set, enables "select" mode — the user can pick files to attach */
  onSelectFiles?: (files: Array<{ name: string; path: string; size: number; type: string }>) => void
  /** Title override */
  title?: string
  /** Initial folder path shown when modal opens */
  initialPath?: string
  /** Optional folder path to always use as upload target */
  uploadPath?: string
  /** Render as a full view (no overlay) */
  asView?: boolean
}

type ViewMode = 'grid' | 'list'

interface PreviewState {
  url: string
  name: string
  type: string
  path: string
}

// ============================================================================
// ICON HELPER
// ============================================================================

function FileTypeIcon({ mimeType, size = 20 }: { mimeType: string; size?: number }) {
  const hint = getFileIconHint(mimeType)
  const props = { size, strokeWidth: 1.5 }
  switch (hint) {
    case 'image':
      return <FileImage {...props} className="text-[var(--hue-rose)]" />
    case 'pdf':
      return <FileText {...props} className="text-[var(--danger)]" />
    case 'text':
      return <FileText {...props} className="text-[var(--hue-sky)]" />
    case 'spreadsheet':
      return <FileSpreadsheet {...props} className="text-[var(--hue-mint)]" />
    case 'presentation':
      return <FileIcon {...props} className="text-[var(--hue-amber)]" />
    case 'audio':
      return <Music {...props} className="text-[var(--hue-violet)]" />
    case 'video':
      return <Video {...props} className="text-[var(--hue-sky)]" />
    case 'archive':
      return <Archive {...props} className="text-[var(--hue-amber)]" />
    default:
      return <File {...props} className="text-muted" />
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function FileExplorerModal({
  isOpen,
  onClose,
  onSelectFiles,
  title = 'File Explorer',
  initialPath = '',
  uploadPath,
  asView = false,
}: FileExplorerModalProps) {
  const toast = useToast()

  // Navigation
  const [currentPath, setCurrentPath] = useState('')
  const [items, setItems] = useState<StorageItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // View
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')

  // Selection (for multi-select in attach mode)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  // Upload
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Folder creation
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderInputRef = useRef<HTMLInputElement>(null)

  // Rename
  const [renamingItem, setRenamingItem] = useState<string | null>(null) // path of item being renamed
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Preview
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: StorageItem } | null>(null)

  // Sort
  const [sortField, setSortField] = useState<'name' | 'date' | 'size'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Keyboard focus
  const [focusedPath, setFocusedPath] = useState<string | null>(null)

  // ============================================================================
  // BREADCRUMB
  // ============================================================================

  const breadcrumbs = useMemo(() => {
    if (!currentPath) return []
    return currentPath.split('/').filter(Boolean)
  }, [currentPath])

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path)
    setSelectedPaths(new Set())
    setSearchQuery('')
    setContextMenu(null)
    setPreview(null)
  }, [])

  const navigateUp = useCallback(() => {
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    navigateTo(parts.join('/'))
  }, [currentPath, navigateTo])

  // ============================================================================
  // LOAD DATA
  // ============================================================================

  const loadItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listItems(currentPath)
      setItems(data)
    } catch (err: any) {
      console.error('Failed to load files:', err)
      setError(err.message || 'Failed to load files')
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [currentPath])

  useEffect(() => {
    if (isOpen) {
      setCurrentPath(initialPath)
      setSelectedPaths(new Set())
      setSearchQuery('')
      setContextMenu(null)
      setPreview(null)
    }
  }, [isOpen, initialPath])

  useEffect(() => {
    if (isOpen) {
      loadItems()
    }
  }, [isOpen, loadItems])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentPath('')
      setSelectedPaths(new Set())
      setSearchQuery('')
      setPreview(null)
      setContextMenu(null)
      setShowNewFolderInput(false)
      setRenamingItem(null)
      setError(null)
    }
  }, [isOpen])

  // ============================================================================
  // FILTERED ITEMS
  // ============================================================================

  const filteredItems = useMemo(() => {
    let result = !searchQuery.trim()
      ? items
      : items.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))

    // Sort: folders always first, then by chosen field
    result = [...result].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      let cmp = 0
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else if (sortField === 'date') {
        const at = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0
        cmp = at - bt
      } else if (sortField === 'size') {
        cmp = (a.size ?? 0) - (b.size ?? 0)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [items, searchQuery, sortField, sortDir])

  const totalSize = useMemo(
    () => items.filter((i) => i.kind === 'file').reduce((sum, i) => sum + (i.size ?? 0), 0),
    [items]
  )

  // ============================================================================
  // UPLOAD HANDLERS
  // ============================================================================

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      if (fileArray.length === 0) return

      setIsUploading(true)
      setUploadProgress({ done: 0, total: fileArray.length })
      try {
        const targetPath = uploadPath ?? currentPath
        const uploadResults = await uploadFiles(fileArray, targetPath, (done, total) => {
          setUploadProgress({ done, total })
        })

        const renamedFiles = uploadResults
          .map((result, idx) => ({
            original: fileArray[idx]?.name,
            stored: result.file.name,
          }))
          .filter((entry) => entry.original && entry.original !== entry.stored) as Array<{ original: string; stored: string }>

        if (renamedFiles.length > 0) {
          const preview = renamedFiles
            .slice(0, 2)
            .map((entry) => `${entry.original} -> ${entry.stored}`)
            .join('; ')
          const remainder = renamedFiles.length > 2 ? ` (+${renamedFiles.length - 2} more)` : ''

          toast.push({
            title: 'Some filenames were adjusted',
            description: `${preview}${remainder}`,
            duration: 5000,
          })
        }

        toast.push({
          title: 'Upload complete',
          description: `${fileArray.length} file${fileArray.length > 1 ? 's' : ''} uploaded`,
        })
        loadItems()
      } catch (err: any) {
        console.error('Upload failed:', err)
        toast.push({ title: 'Upload failed', description: err.message })
      } finally {
        setIsUploading(false)
        setUploadProgress(null)
      }
    },
    [currentPath, loadItems, toast, uploadPath]
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleUpload(e.target.files)
        e.target.value = '' // Reset so same file can be re-uploaded
      }
    },
    [handleUpload]
  )

  // Drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files)
      }
    },
    [handleUpload]
  )

  // ============================================================================
  // FOLDER CREATION
  // ============================================================================

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim()
    if (!name) return

    // Validate
    if (name.length > 100) {
      toast.push({ title: 'Error', description: 'Folder name is too long (max 100 characters)' })
      return
    }
    if (/[<>:"|?*\\]/.test(name)) {
      toast.push({ title: 'Error', description: 'Folder name contains invalid characters' })
      return
    }
    // Check for duplicates
    if (items.some((i) => i.kind === 'folder' && i.name.toLowerCase() === name.toLowerCase())) {
      toast.push({ title: 'Error', description: 'A folder with this name already exists' })
      return
    }

    try {
      await createStorageFolder(currentPath, name)
      toast.push({ title: 'Folder created', description: name })
      setShowNewFolderInput(false)
      setNewFolderName('')
      loadItems()
    } catch (err: any) {
      console.error('Failed to create folder:', err)
      toast.push({ title: 'Error', description: err.message })
    }
  }, [newFolderName, currentPath, items, loadItems, toast])

  // ============================================================================
  // DELETE
  // ============================================================================

  const handleDeleteItem = useCallback(
    async (item: StorageItem) => {
      const confirmMsg =
        item.kind === 'folder'
          ? `Delete folder "${item.name}" and all its contents?`
          : `Delete "${item.name}"?`
      if (!confirm(confirmMsg)) return

      try {
        if (item.kind === 'folder') {
          await deleteStorageFolder(item.path)
        } else {
          await deleteFile(item.path)
        }
        toast.push({ title: 'Deleted', description: item.name })
        setSelectedPaths((prev) => {
          const next = new Set(prev)
          next.delete(item.path)
          return next
        })
        loadItems()
      } catch (err: any) {
        console.error('Delete failed:', err)
        toast.push({ title: 'Delete failed', description: err.message })
      }
    },
    [loadItems, toast]
  )

  const handleDeleteSelected = useCallback(async () => {
    if (selectedPaths.size === 0) return
    if (!confirm(`Delete ${selectedPaths.size} selected item(s)?`)) return

    try {
      const filePaths = Array.from(selectedPaths).filter((p) => {
        const item = items.find((i) => i.path === p)
        return item?.kind === 'file'
      })
      const folderPaths = Array.from(selectedPaths).filter((p) => {
        const item = items.find((i) => i.path === p)
        return item?.kind === 'folder'
      })

      if (filePaths.length > 0) await deleteFiles(filePaths)
      for (const fp of folderPaths) await deleteStorageFolder(fp)

      toast.push({ title: 'Deleted', description: `${selectedPaths.size} item(s) removed` })
      setSelectedPaths(new Set())
      loadItems()
    } catch (err: any) {
      console.error('Bulk delete failed:', err)
      toast.push({ title: 'Delete failed', description: err.message })
    }
  }, [selectedPaths, items, loadItems, toast])

  // ============================================================================
  // RENAME
  // ============================================================================

  const startRename = useCallback((item: StorageItem) => {
    setRenamingItem(item.path)
    setRenameValue(item.name)
    setContextMenu(null)
    setTimeout(() => renameInputRef.current?.select(), 50)
  }, [])

  const commitRename = useCallback(async () => {
    if (!renamingItem) return
    const newName = renameValue.trim()
    if (!newName || newName === items.find((i) => i.path === renamingItem)?.name) {
      setRenamingItem(null)
      return
    }

    try {
      await renameFile(renamingItem, newName)
      toast.push({ title: 'Renamed', description: newName })
      setRenamingItem(null)
      loadItems()
    } catch (err: any) {
      console.error('Rename failed:', err)
      toast.push({ title: 'Rename failed', description: err.message })
      setRenamingItem(null)
    }
  }, [renamingItem, renameValue, items, loadItems, toast])

  // ============================================================================
  // PREVIEW
  // ============================================================================

  const openPreview = useCallback(async (item: StorageItem) => {
    if (item.kind === 'folder') return
    const mimeType = item.type || ''
    if (!isPreviewableImage(mimeType) && !isPreviewablePdf(mimeType) && !isPreviewableText(mimeType)) {
      // Not previewable — just download
      try {
        await triggerDownload(item.path)
      } catch (err: any) {
        toast.push({ title: 'Download failed', description: err.message })
      }
      return
    }

    try {
      const url = await getFileUrl(item.path)
      setPreview({ url, name: item.name, type: mimeType, path: item.path })

      // For text files, also fetch content
      if (isPreviewableText(mimeType)) {
        const resp = await fetch(url)
        const text = await resp.text()
        setPreviewTextContent(text)
      } else {
        setPreviewTextContent(null)
      }
    } catch (err: any) {
      console.error('Preview failed:', err)
      toast.push({ title: 'Preview failed', description: err.message })
    }
  }, [toast])

  const closePreview = useCallback(() => {
    setPreview(null)
    setPreviewTextContent(null)
  }, [])

  // ============================================================================
  // SELECTION
  // ============================================================================

  const toggleSelection = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleConfirmSelection = useCallback(() => {
    if (!onSelectFiles || selectedPaths.size === 0) return
    const selected = items
      .filter((i) => i.kind === 'file' && selectedPaths.has(i.path))
      .map((i) => ({
        name: i.name,
        path: i.path,
        size: i.size || 0,
        type: i.type || 'application/octet-stream',
      }))
    onSelectFiles(selected)
    onClose()
  }, [onSelectFiles, selectedPaths, items, onClose])

  // ============================================================================
  // ITEM CLICK HANDLER
  // ============================================================================

  const handleItemClick = useCallback(
    (item: StorageItem) => {
      if (item.kind === 'folder') {
        navigateTo(item.path)
      } else if (onSelectFiles) {
        // In select mode, toggle selection
        toggleSelection(item.path)
      } else {
        // In browse mode, open preview
        openPreview(item)
      }
    },
    [navigateTo, onSelectFiles, toggleSelection, openPreview]
  )

  const handleItemDoubleClick = useCallback(
    (item: StorageItem) => {
      if (item.kind === 'folder') {
        navigateTo(item.path)
      } else {
        openPreview(item)
      }
    },
    [navigateTo, openPreview]
  )

  // ============================================================================
  // CONTEXT MENU
  // ============================================================================

  const handleContextMenu = useCallback((e: React.MouseEvent, item: StorageItem) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, item })
  }, [])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  // Focus new folder input
  useEffect(() => {
    if (showNewFolderInput) {
      setTimeout(() => newFolderInputRef.current?.focus(), 50)
    }
  }, [showNewFolderInput])

  // ============================================================================
  // KEYBOARD NAVIGATION
  // ============================================================================

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const focusedIdx = focusedPath ? filteredItems.findIndex((i) => i.path === focusedPath) : -1

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          const next = focusedIdx < filteredItems.length - 1 ? focusedIdx + 1 : 0
          setFocusedPath(filteredItems[next]?.path ?? null)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const prev = focusedIdx > 0 ? focusedIdx - 1 : filteredItems.length - 1
          setFocusedPath(filteredItems[prev]?.path ?? null)
          break
        }
        case 'Enter': {
          if (focusedPath) {
            const item = filteredItems.find((i) => i.path === focusedPath)
            if (item) {
              e.preventDefault()
              if (item.kind === 'folder') navigateTo(item.path)
              else openPreview(item)
            }
          }
          break
        }
        case 'Delete':
        case 'Backspace': {
          if (selectedPaths.size > 0 && !onSelectFiles) {
            e.preventDefault()
            handleDeleteSelected()
          }
          break
        }
        case 'a':
        case 'A': {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            setSelectedPaths(new Set(filteredItems.filter((i) => i.kind === 'file').map((i) => i.path)))
          }
          break
        }
        case 'Escape': {
          if (contextMenu) setContextMenu(null)
          else if (selectedPaths.size > 0) setSelectedPaths(new Set())
          else if (focusedPath) setFocusedPath(null)
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isOpen,
    focusedPath,
    filteredItems,
    selectedPaths,
    onSelectFiles,
    contextMenu,
    navigateTo,
    openPreview,
    handleDeleteSelected,
  ])

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!isOpen && !asView) return null

  const isSelectMode = !!onSelectFiles
  const hasSelection = selectedPaths.size > 0
  const uploadPathSegments = (uploadPath ?? '').split('/').filter(Boolean)

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        size="5xl"
        maxHeight="calc(100vh - 3rem)"
        zIndex={100}
        asView={asView}
        className={asView ? '!bg-transparent' : undefined}
      >
          {/* ============ HEADER ============ */}
          <ModalHeader onClose={onClose} closeAriaLabel="Close file explorer">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent">
              <FolderOpen size={17} strokeWidth={1.9} aria-hidden />
            </span>
            <div className="min-w-0">
              <ModalTitle className="truncate">{title}</ModalTitle>
              <p className="mt-0.5 truncate text-xs leading-5 text-muted">
                {isSelectMode ? 'Select files to attach' : 'Manage your uploaded files'}
              </p>
            </div>
          </ModalHeader>

          {uploadPathSegments.length > 0 && (
            <div className="border-b border-border bg-[var(--surface-sunken)] px-4 py-2 sm:px-5">
              <div className="flex items-center gap-2 overflow-x-auto text-xs text-muted">
                <span className="whitespace-nowrap font-medium text-foreground">Folder structure</span>
                <span className="text-muted">/</span>
                {uploadPathSegments.map((segment, index) => (
                  <span key={`${segment}-${index}`} className="flex items-center gap-2 whitespace-nowrap">
                    <span className="rounded-md border border-border bg-[var(--surface-hover)] px-2 py-0.5 text-accent">
                      {segment}
                    </span>
                    {index < uploadPathSegments.length - 1 && (
                      <span className="text-muted">/</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ============ TOOLBAR ============ */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-[var(--surface-sunken)] px-4 py-2.5 sm:px-5">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto">
              <button
                onClick={() => navigateTo('')}
                className="focus-ring flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-foreground transition-colors hover:bg-surface-hover"
              >
                <Home size={14} />
                <span>Files</span>
              </button>
              {breadcrumbs.map((crumb, idx) => {
                const pathUpToHere = breadcrumbs.slice(0, idx + 1).join('/')
                const isLast = idx === breadcrumbs.length - 1
                return (
                  <span key={pathUpToHere} className="flex items-center gap-1">
                    <ChevronRight size={12} className="text-muted flex-shrink-0" />
                    <button
                      onClick={() => navigateTo(pathUpToHere)}
                      className={`focus-ring whitespace-nowrap rounded-lg px-2 py-1 transition-colors ${
                        isLast
                          ? 'font-medium text-foreground'
                          : 'text-muted hover:bg-surface-hover hover:text-foreground'
                      }`}
                      disabled={isLast}
                    >
                      {crumb}
                    </button>
                  </span>
                )
              })}
            </nav>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="glass-input h-8 w-28 rounded-lg pl-8 pr-3 text-sm sm:w-40"
                />
              </div>

              <div className="hidden h-5 w-px bg-[var(--border)] sm:block" />

              {/* View toggle */}
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className="glass-btn-ghost h-8 w-8"
                title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
              >
                {viewMode === 'grid' ? <List size={16} /> : <Grid3x3 size={16} />}
              </button>

              <div className="hidden h-5 w-px bg-[var(--border)] sm:block" />

              {/* Sort controls */}
              <button
                onClick={() => {
                  const fields: Array<'name' | 'date' | 'size'> = ['name', 'date', 'size']
                  const next = fields[(fields.indexOf(sortField) + 1) % fields.length]
                  setSortField(next)
                  setSortDir('asc')
                }}
                className="glass-btn h-8 gap-1 px-2.5 text-xs text-muted hover:text-foreground"
                title={`Sort by: ${sortField} (click to cycle)`}
              >
                <ArrowUpDown size={13} />
                <span className="capitalize hidden sm:inline">{sortField}</span>
              </button>
              <button
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="glass-btn-ghost h-8 w-8"
                title={sortDir === 'asc' ? 'Ascending — click to descend' : 'Descending — click to ascend'}
              >
                {sortDir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
              </button>

              <div className="hidden h-5 w-px bg-[var(--border)] sm:block" />

              {/* New folder */}
              <button
                onClick={() => {
                  setShowNewFolderInput(true)
                  setNewFolderName('')
                }}
                className="glass-btn-ghost h-8 w-8"
                title="New folder"
              >
                <FolderPlus size={16} />
              </button>

              {/* Upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="glass-btn-primary h-8 gap-1.5 px-3 text-xs"
                title="Upload files"
              >
                {isUploading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                <span className="hidden sm:inline">Upload</span>
              </button>

              {/* Refresh */}
              <button
                onClick={loadItems}
                className="glass-btn-ghost h-8 w-8"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* New folder input row */}
          {showNewFolderInput && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-[var(--surface-sunken)] px-4 py-2 sm:px-5">
              <FolderPlus size={16} className="shrink-0 text-accent" />
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder()
                  if (e.key === 'Escape') {
                    setShowNewFolderInput(false)
                    setNewFolderName('')
                  }
                }}
                placeholder="Folder name..."
                className="glass-input h-8 min-w-0 flex-1 text-sm"
              />
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="glass-btn-primary h-8 px-3 text-xs"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewFolderInput(false)
                  setNewFolderName('')
                }}
                className="glass-btn h-8 px-3 text-xs"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ============ CONTENT ============ */}
          <div
            className={`relative min-h-[300px] flex-1 overflow-y-auto ${isDragOver ? 'bg-[var(--accent-light)] ring-2 ring-inset ring-[var(--accent)]' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Upload progress */}
            {uploadProgress && (
              <div className="border-b border-border bg-[var(--accent-light)] px-4 py-2 sm:px-5">
                <div className="flex items-center gap-2 text-sm text-accent">
                  <Loader2 size={14} className="animate-spin" />
                  <span>
                    Uploading {uploadProgress.done}/{uploadProgress.total} files...
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-active)]">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-border bg-danger-light px-4 py-3 text-sm text-danger sm:mx-5">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{error}</span>
                <button onClick={loadItems} className="ml-auto text-danger underline hover:no-underline">
                  Retry
                </button>
              </div>
            )}

            {/* Loading */}
            {isLoading && !error && (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-accent" />
              </div>
            )}

            {/* Empty state */}
            {!isLoading && !error && filteredItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center px-5">
                {searchQuery ? (
                  <>
                    <Search size={40} className="text-muted mb-3" />
                    <p className="text-muted text-sm">No files matching &ldquo;{searchQuery}&rdquo;</p>
                  </>
                ) : (
                  <>
                    <Upload size={40} className="text-muted mb-3" />
                    <p className="font-medium text-foreground mb-1">This folder is empty</p>
                    <p className="text-muted text-sm mb-4">
                      Drag files here or click Upload to add files
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="glass-btn-primary h-9 px-4 text-[13px]"
                    >
                      Upload Files
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Drag overlay */}
            {isDragOver && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[var(--accent-light)] backdrop-blur-[2px]">
                <div className="flex flex-col items-center gap-2 text-accent">
                  <Upload size={40} />
                  <p className="font-medium">Drop files to upload</p>
                </div>
              </div>
            )}

            {/* ============ FILE GRID / LIST ============ */}
            {!isLoading && !error && filteredItems.length > 0 && (
              <div className={viewMode === 'grid' ? 'p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3' : 'divide-y divide-border'}>
                {/* Back button when inside a folder */}
                {currentPath && viewMode === 'list' && (
                  <button
                    onClick={navigateUp}
                    className="focus-ring flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground sm:px-5"
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                )}
                {currentPath && viewMode === 'grid' && (
                  <button
                    onClick={navigateUp}
                    className="focus-ring flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-[var(--surface-sunken)] p-4 text-muted transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-foreground"
                  >
                    <ArrowLeft size={24} />
                    <span className="text-xs font-medium">Back</span>
                  </button>
                )}

                {filteredItems.map((item) => (
                  viewMode === 'grid' ? (
                    <GridItem
                      key={item.path}
                      item={item}
                      isSelected={selectedPaths.has(item.path)}
                      isFocused={focusedPath === item.path}
                      isSelectMode={isSelectMode}
                      isRenaming={renamingItem === item.path}
                      renameValue={renameValue}
                      renameInputRef={renameInputRef}
                      onRenameChange={setRenameValue}
                      onRenameCommit={commitRename}
                      onRenameCancel={() => setRenamingItem(null)}
                      onClick={() => { setFocusedPath(item.path); handleItemClick(item) }}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      onContextMenu={(e) => handleContextMenu(e, item)}
                      onToggleSelect={() => toggleSelection(item.path)}
                    />
                  ) : (
                    <ListItem
                      key={item.path}
                      item={item}
                      isSelected={selectedPaths.has(item.path)}
                      isFocused={focusedPath === item.path}
                      isSelectMode={isSelectMode}
                      isRenaming={renamingItem === item.path}
                      renameValue={renameValue}
                      renameInputRef={renameInputRef}
                      onRenameChange={setRenameValue}
                      onRenameCommit={commitRename}
                      onRenameCancel={() => setRenamingItem(null)}
                      onClick={() => { setFocusedPath(item.path); handleItemClick(item) }}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      onContextMenu={(e) => handleContextMenu(e, item)}
                      onToggleSelect={() => toggleSelection(item.path)}
                    />
                  )
                ))}
              </div>
            )}
          </div>

          {/* ============ FOOTER ============ */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-[var(--surface-sunken)] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-3 text-xs text-muted">
              <span>
                {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
                {hasSelection && ` · ${selectedPaths.size} selected`}
              </span>
              {totalSize > 0 && (
                <span className="text-muted">{formatFileSize(totalSize)} total</span>
              )}
              {/* Select All / Deselect All */}
              {!isSelectMode && filteredItems.some((i) => i.kind === 'file') && (
                <button
                  onClick={() => {
                    const allFilePaths = filteredItems.filter((i) => i.kind === 'file').map((i) => i.path)
                    if (selectedPaths.size === allFilePaths.length) {
                      setSelectedPaths(new Set())
                    } else {
                      setSelectedPaths(new Set(allFilePaths))
                    }
                  }}
                  className="focus-ring flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted transition-colors hover:text-accent"
                  title="Select all / deselect all files (or Ctrl+A)"
                >
                  {selectedPaths.size > 0 && selectedPaths.size === filteredItems.filter((i) => i.kind === 'file').length
                    ? <><CheckSquare size={13} /> Deselect all</>
                    : <><Square size={13} /> Select all</>
                  }
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasSelection && !isSelectMode && (
                <button
                  onClick={handleDeleteSelected}
                  className="glass-btn h-8 gap-1.5 px-3.5 text-xs text-danger hover:bg-danger-light"
                >
                  <Trash2 size={14} />
                  <span>Delete Selected</span>
                </button>
              )}
              {isSelectMode && (
                <>
                  <button
                    onClick={onClose}
                    className="glass-btn h-8 px-3.5 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmSelection}
                    disabled={selectedPaths.size === 0}
                    className="glass-btn-primary h-8 gap-1.5 px-3.5 text-xs"
                  >
                    <Check size={14} />
                    <span>Attach {selectedPaths.size > 0 ? `(${selectedPaths.size})` : ''}</span>
                  </button>
                </>
              )}
              {!isSelectMode && (
                <button
                  onClick={onClose}
                  className="glass-btn h-8 px-3.5 text-xs font-medium"
                >
                  Close
                </button>
              )}
            </div>
          </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />
      </BaseModal>

      {/* ============ CONTEXT MENU ============ */}
      {contextMenu && (
        <div
          className="glass-strong fixed z-[110] min-w-[180px] overflow-hidden rounded-2xl p-1.5"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.item.kind === 'file' && (
            <>
              <button
                onClick={() => {
                  openPreview(contextMenu.item)
                  setContextMenu(null)
                }}
                className="glass-row gap-2.5 px-2.5 py-2 text-sm"
              >
                <Eye size={15} />
                <span>Preview</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    await triggerDownload(contextMenu.item.path)
                  } catch (err: any) {
                    toast.push({ title: 'Download failed', description: err.message })
                  }
                  setContextMenu(null)
                }}
                className="glass-row gap-2.5 px-2.5 py-2 text-sm"
              >
                <Download size={15} />
                <span>Download</span>
              </button>
              <button
                onClick={() => startRename(contextMenu.item)}
                className="glass-row gap-2.5 px-2.5 py-2 text-sm"
              >
                <Pencil size={15} />
                <span>Rename</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    const url = await getFileUrl(contextMenu.item.path)
                    await navigator.clipboard.writeText(url)
                    toast.push({ title: 'Link copied', description: 'File URL copied to clipboard' })
                  } catch (err: any) {
                    toast.push({ title: 'Copy failed', description: err.message })
                  }
                  setContextMenu(null)
                }}
                className="glass-row gap-2.5 px-2.5 py-2 text-sm"
              >
                <Copy size={15} />
                <span>Copy link</span>
              </button>
            </>
          )}
          {contextMenu.item.kind === 'folder' && (
            <button
              onClick={() => {
                navigateTo(contextMenu.item.path)
                setContextMenu(null)
              }}
              className="glass-row gap-2.5 px-2.5 py-2 text-sm"
            >
              <FolderOpen size={15} />
              <span>Open</span>
            </button>
          )}
          <div className="glass-divider my-1" />
          <button
            onClick={() => {
              handleDeleteItem(contextMenu.item)
              setContextMenu(null)
            }}
            className="glass-row gap-2.5 px-2.5 py-2 text-sm text-danger hover:bg-danger-light"
          >
            <Trash2 size={15} />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* ============ PREVIEW OVERLAY ============ */}
      {preview && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-md sm:p-8 dark:bg-black/70"
          onClick={closePreview}
        >
          <div
            className="glass-strong relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview header */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2 min-w-0">
                <FileTypeIcon mimeType={preview.type} size={18} />
                <span className="truncate font-medium text-foreground">{preview.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      await triggerDownload(preview.path)
                    } catch (err: any) {
                      toast.push({ title: 'Download failed', description: err.message })
                    }
                  }}
                  className="glass-btn-ghost h-8 w-8"
                  title="Download"
                >
                  <Download size={18} />
                </button>
                <ModalCloseButton
                  onClick={closePreview}
                  ariaLabel="Close file preview"
                  className="text-muted hover:text-foreground"
                  size={18}
                />
              </div>
            </div>
            {/* Preview content */}
            <div className="flex flex-1 items-center justify-center overflow-auto bg-[var(--surface-sunken)] p-4">
              {isPreviewableImage(preview.type) && (
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-md"
                />
              )}
              {isPreviewablePdf(preview.type) && (
                <iframe
                  src={preview.url}
                  title={preview.name}
                  className="h-[70vh] w-full rounded-lg border border-border"
                />
              )}
              {isPreviewableText(preview.type) && previewTextContent !== null && (
                <pre className="scroll-thin max-h-[70vh] w-full overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-[var(--surface-hover)] p-4 font-mono text-sm text-foreground">
                  {previewTextContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================================
// GRID ITEM
// ============================================================================

interface ItemProps {
  item: StorageItem
  isSelected: boolean
  isFocused: boolean
  isSelectMode: boolean
  isRenaming: boolean
  renameValue: string
  renameInputRef: React.RefObject<HTMLInputElement>
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onClick: () => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onToggleSelect: () => void
}

function GridItem({
  item,
  isSelected,
  isFocused,
  isSelectMode,
  isRenaming,
  renameValue,
  renameInputRef,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onClick,
  onDoubleClick,
  onContextMenu,
  onToggleSelect,
}: ItemProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  // Load image thumbnail for grid view
  useEffect(() => {
    if (item.kind === 'file' && isPreviewableImage(item.type || '')) {
      let cancelled = false
      getFileUrl(item.path).then((url) => {
        if (!cancelled) setThumbUrl(url)
      }).catch(() => {})
      return () => { cancelled = true }
    }
  }, [item])

  return (
    <div
      className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-all duration-150 ${
        isSelected
          ? 'border-accent bg-[var(--accent-light)] shadow-[inset_0_0_0_1px_var(--accent)]'
          : isFocused
            ? 'border-border-strong bg-surface-hover'
            : 'border-border bg-[var(--surface-sunken)] hover:border-border-strong hover:bg-surface-hover'
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Select checkbox */}
      {isSelectMode && item.kind === 'file' && (
        <button
          className={`focus-ring absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
            isSelected
              ? 'border-accent bg-accent text-[var(--accent-foreground)]'
              : 'border-border-strong bg-[var(--surface-sunken)] text-transparent hover:border-accent'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
        >
          <Check size={12} />
        </button>
      )}

      {/* Thumbnail / Icon */}
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
        {item.kind === 'folder' ? (
          <FolderOpen size={32} className="text-[var(--hue-amber)]" />
        ) : thumbUrl ? (
          <img src={thumbUrl} alt={item.name} className="h-full w-full rounded-lg object-cover" />
        ) : (
          <FileTypeIcon mimeType={item.type || ''} size={32} />
        )}
      </div>

      {/* Name */}
      {isRenaming ? (
        <input
          ref={renameInputRef}
          type="text"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit()
            if (e.key === 'Escape') onRenameCancel()
          }}
          onBlur={onRenameCommit}
          className="glass-input h-7 w-full px-1.5 text-center text-xs"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="w-full truncate text-center text-xs font-medium text-foreground" title={item.name}>
          {item.name}
        </span>
      )}

      {/* Size for files */}
      {item.kind === 'file' && item.size !== undefined && (
        <span className="text-[10px] text-muted">{formatFileSize(item.size)}</span>
      )}

      {/* Hover actions */}
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition">
        <button
          className="focus-ring rounded-md p-1 text-muted transition-colors hover:bg-surface-active hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu(e)
          }}
        >
          <MoreVertical size={14} />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// LIST ITEM
// ============================================================================

function ListItem({
  item,
  isSelected,
  isFocused,
  isSelectMode,
  isRenaming,
  renameValue,
  renameInputRef,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onClick,
  onDoubleClick,
  onContextMenu,
  onToggleSelect,
}: ItemProps) {
  return (
    <div
      className={`glass-row group cursor-pointer gap-3 rounded-none px-4 py-2.5 sm:px-5 ${
        isSelected ? 'is-active' : isFocused ? 'bg-surface-hover' : ''
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Select checkbox */}
      {isSelectMode && item.kind === 'file' && (
        <button
          className={`focus-ring flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            isSelected
              ? 'border-accent bg-accent text-[var(--accent-foreground)]'
              : 'border-border-strong bg-[var(--surface-sunken)] text-transparent hover:border-accent'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
        >
          <Check size={12} />
        </button>
      )}

      {/* Icon */}
      <div className="flex-shrink-0">
        {item.kind === 'folder' ? (
          <FolderOpen size={20} className="text-[var(--hue-amber)]" />
        ) : (
          <FileTypeIcon mimeType={item.type || ''} size={20} />
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit()
              if (e.key === 'Escape') onRenameCancel()
            }}
            onBlur={onRenameCommit}
            className="glass-input h-7 w-full px-2 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
        )}
      </div>

      {/* Meta */}
      {item.kind === 'file' && (
        <div className="flex shrink-0 items-center gap-4 text-xs text-muted">
          <span>{formatFileSize(item.size || 0)}</span>
          {item.updated_at && (
            <span className="hidden sm:inline">
              {new Date(item.updated_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
      {item.kind === 'folder' && (
        <ChevronRight size={16} className="text-muted flex-shrink-0" />
      )}

      {/* Hover actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
        <button
          className="focus-ring rounded-md p-1 text-muted transition-colors hover:bg-surface-active hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu(e)
          }}
        >
          <MoreVertical size={14} />
        </button>
      </div>
    </div>
  )
}
