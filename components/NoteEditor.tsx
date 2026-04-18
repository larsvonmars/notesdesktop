'use client'

import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue, useLayoutEffect } from 'react'
import DOMPurify from 'dompurify'
import {
  List,
  ListOrdered,
  Quote,
  CheckSquare,
  Save,
  Trash2,
  X,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  ListTree,
  Link as LinkIcon,
  Search as SearchIcon,
  PenTool,
  Loader2,
  Target,
  Edit2,
  Network,
  Table as TableIcon,
  Table2 as Table2Icon,
  FileText,
  Plus,
  Minus as HorizontalRule,
  ListOrdered as OrderedListIcon,
  Image as ImageIcon,
  Paperclip,
} from 'lucide-react'
import RichTextEditor, {
  type RichTextCommand,
  type RichTextEditorHandle
} from './RichTextEditor'
import DrawingEditor, {
  type DrawingEditorHandle,
  type DrawingData
} from './DrawingEditor'
import MindmapEditor, {
  type MindmapEditorHandle,
  type MindmapData
} from './MindmapEditor'
import { getMindmapTemplate } from '../lib/mindmap-templates'
import BulletJournalEditor, {
  type BulletJournalEditorHandle,
  type BulletJournalData
} from './BulletJournalEditor'
import DataSheetEditor, {
  type DataSheetEditorHandle,
  type DataSheetData
} from './DataSheetEditor'
import PdfAnnotationEditor, {
  type PdfAnnotationEditorHandle,
  type PdfAnnotationData
} from './PdfAnnotationEditor'
import ProjectsWorkspaceModal from './ProjectsWorkspaceModal'
import { useToast } from './ToastProvider'
import { Note as LibNote, createNote, createNoteAttachment, deleteNoteAttachment, getNote, getNoteAttachments } from '../lib/notes'
import { getProjects, Project } from '../lib/projects'
import { buildPublicShareUrl, getNoteShare, publishNoteShare, unpublishNoteShare, type NoteShareMetadata, type PublishedNoteShare } from '../lib/note-shares'
import NoteLinkDialog from './NoteLinkDialog'
import DataSheetPickerDialog from './DataSheetPickerDialog'
import { ErrorBoundary } from './ErrorBoundary'
import KnowledgeGraphModal from './KnowledgeGraphModal'
import { useIsMobile } from '@/lib/useIsMobile'
import SelectionToolbar from './SelectionToolbar'
import { noteLinkBlock } from '../lib/editor/noteLinkBlock'
import { imageBlock } from '../lib/editor/imageBlock'
import { dataSheetTableBlock, type DataSheetTablePayload } from '../lib/editor/dataSheetTableBlock'
import { pdfAnnotationEmbedBlock, type PdfAnnotationEmbedPayload } from '../lib/editor/pdfAnnotationEmbedBlock'
import {
  fileBlock,
  type FileBlockPayload,
  initializeFileBlockInteractions,
  FILE_BLOCK_ANNOTATE_PDF_EVENT,
  FILE_BLOCK_PREVIEW_DOCX_EVENT,
  type FileBlockPreviewDocxEventDetail,
  type FileBlockAnnotatePdfEventDetail,
} from '../lib/editor/fileBlock'
import FileExplorerModal from './FileExplorerModal'
import DocxPreviewModal from './DocxPreviewModal'
import SettingsModal from './SettingsModal'
import AIAssistant from './AIAssistant'
import {
  extractMindmapForAI,
  extractBulletJournalForAI,
  extractDataSheetForAI,
  generateMindmapOutline,
  type MindmapOutline,
} from '@/lib/ai'
import NoteDetailsSidebar from './NoteDetailsSidebar'
import { Settings } from 'lucide-react'
import { htmlToMarkdown } from '@/lib/editor/markdownHelpers'
import type { NoteType } from '@/lib/notes'
import { deleteFile, getFileSignedUrl, uploadImageFile } from '@/lib/file-storage'

export type { Note } from '../lib/notes'

// Maximum image file size in bytes (10MB)
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024

interface NoteEditorProps {
  note?: LibNote | null
  // `isAuto` will be passed when the editor triggers an autosave so parents can handle it differently
  onSave: (
    note: { title: string; content: string; note_type?: NoteType },
    isAuto?: boolean
  ) => Promise<void>
  onCancel?: () => void
  onDelete?: (id: string) => Promise<void>
  initialNoteType?: NoteType
  /** When set, the new mindmap uses this template's data instead of the single-root default */
  mindmapTemplateId?: string
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim()

const MINDMAP_NODE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']
const MAX_AUTO_MINDMAP_NODES = 12
const MAX_AI_MINDMAP_FIRST_LEVEL_NODES = 10
const MINDMAP_ROOT_X = 400
const MINDMAP_ROOT_Y = 300

const normalizeTextLineForMindmap = (value: string): string => {
  return value
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const buildFallbackMindmapDataFromText = (sourceText: string, rootText: string): MindmapData => {
  const rootId = 'root'
  const lines = sourceText
    .split(/\r?\n/)
    .map(normalizeTextLineForMindmap)
    .filter(Boolean)

  const seen = new Set<string>()
  const childLabels: string[] = []
  for (const line of lines) {
    const normalized = line.toLowerCase()
    if (normalized === rootText.toLowerCase()) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    childLabels.push(line)
    if (childLabels.length >= MAX_AUTO_MINDMAP_NODES) break
  }

  if (childLabels.length === 0) {
    childLabels.push('Main Idea', 'Key Details', 'Next Steps')
  }

  const nodes: MindmapData['nodes'] = {
    [rootId]: {
      id: rootId,
      text: rootText,
      x: 400,
      y: 300,
      parentId: null,
      children: [],
      collapsed: false,
      color: MINDMAP_NODE_COLORS[0],
      description: '',
      attachments: [],
    },
  }

  childLabels.forEach((label, index) => {
    const nodeId = `node-${Date.now()}-${index}`
    const angle = (Math.PI * 2 * index) / childLabels.length
    const distance = 190

    nodes[rootId].children.push(nodeId)
    nodes[nodeId] = {
      id: nodeId,
      text: label.slice(0, 80),
      x: 400 + Math.cos(angle) * distance,
      y: 300 + Math.sin(angle) * distance,
      parentId: rootId,
      children: [],
      collapsed: false,
      color: MINDMAP_NODE_COLORS[(index + 1) % MINDMAP_NODE_COLORS.length],
      description: '',
      attachments: [],
    }
  })

  return { rootId, nodes }
}

const buildMindmapDataFromOutline = (outline: MindmapOutline, fallbackRootText: string): MindmapData => {
  const rootId = 'root'
  const rootText = outline.rootText?.trim().slice(0, 80) || fallbackRootText || 'Central Idea'
  const nodes: MindmapData['nodes'] = {
    [rootId]: {
      id: rootId,
      text: rootText,
      x: MINDMAP_ROOT_X,
      y: MINDMAP_ROOT_Y,
      parentId: null,
      children: [],
      collapsed: false,
      color: MINDMAP_NODE_COLORS[0],
      description: outline.rootDescription?.trim() || '',
      attachments: [],
    },
  }

  const idCounter = { value: 0 }

  const addChildren = (
    parentId: string,
    parentX: number,
    parentY: number,
    children: NonNullable<MindmapOutline['children']>,
    depth: number,
    startAngle: number,
    endAngle: number
  ) => {
    if (!children.length || depth > 3) return

    const radius = depth === 1 ? 210 : Math.max(110, 210 - depth * 35)
    const arcSize = endAngle - startAngle

    children.forEach((child, index) => {
      idCounter.value += 1
      const nodeId = `node-ai-${idCounter.value}`
      const angle = startAngle + (arcSize * (index + 1)) / (children.length + 1)
      const x = parentX + Math.cos(angle) * radius
      const y = parentY + Math.sin(angle) * radius
      const colorIndex = (depth + index) % MINDMAP_NODE_COLORS.length

      nodes[parentId].children.push(nodeId)
      nodes[nodeId] = {
        id: nodeId,
        text: child.text,
        x,
        y,
        parentId,
        children: [],
        collapsed: false,
        color: MINDMAP_NODE_COLORS[colorIndex],
        description: child.description?.trim() || '',
        attachments: [],
      }

      const grandchildren = (child.children || []).slice(0, MAX_AUTO_MINDMAP_NODES)
      if (grandchildren.length > 0) {
        const childArcSize = Math.min(Math.PI * 0.9, Math.max(Math.PI / 6, arcSize / Math.max(children.length, 1)))
        addChildren(
          nodeId,
          x,
          y,
          grandchildren,
          depth + 1,
          angle - childArcSize / 2,
          angle + childArcSize / 2
        )
      }
    })
  }

  const firstLevel = outline.children.slice(0, MAX_AI_MINDMAP_FIRST_LEVEL_NODES)
  addChildren(rootId, MINDMAP_ROOT_X, MINDMAP_ROOT_Y, firstLevel, 1, -Math.PI, Math.PI)

  if (nodes[rootId].children.length === 0) {
    return buildFallbackMindmapDataFromText(rootText, rootText)
  }

  return { rootId, nodes }
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const sanitizeImageAltText = (value: string | null | undefined, fallback: string = 'Image') => {
  const sanitized = (value || '')
    .replace(/[<>"']/g, '')
    .trim()
  return sanitized || fallback
}

const LEGACY_IMAGE_SRC_PATTERN = /src\s*=\s*["'](?:data:|file:\/\/)/i

const containsLegacyImageSources = (html: string): boolean => {
  if (!html) return false
  return LEGACY_IMAGE_SRC_PATTERN.test(html)
}

const extractReferencedImageAttachments = (html: string): { attachmentIds: Set<string>; storagePaths: Set<string> } => {
  const attachmentIds = new Set<string>()
  const storagePaths = new Set<string>()

  if (!html) {
    return { attachmentIds, storagePaths }
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const imageBlocks = Array.from(doc.querySelectorAll('[data-block-type="image"]'))

  for (const block of imageBlocks) {
    const attachmentId = block.getAttribute('data-attachment-id')?.trim()
    if (attachmentId) {
      attachmentIds.add(attachmentId)
    }

    const storagePath = block.getAttribute('data-storage-path')?.trim()
    if (storagePath) {
      storagePaths.add(storagePath)
    }

    const encodedPayload = block.getAttribute('data-block-payload')
    if (!encodedPayload) continue

    try {
      const parsed = JSON.parse(decodeURIComponent(encodedPayload)) as { attachmentId?: string; storagePath?: string }
      if (parsed.attachmentId && typeof parsed.attachmentId === 'string') {
        attachmentIds.add(parsed.attachmentId)
      }
      if (parsed.storagePath && typeof parsed.storagePath === 'string') {
        storagePaths.add(parsed.storagePath)
      }
    } catch {
      // ignore malformed payloads
    }
  }

  return { attachmentIds, storagePaths }
}

const fileNameExtensionForMimeType = (mimeType: string | undefined): string => {
  const normalized = (mimeType || '').toLowerCase()
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('gif')) return 'gif'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('svg')) return 'svg'
  if (normalized.includes('bmp')) return 'bmp'
  return 'png'
}

const buildLegacyMigrationFileName = (src: string, preferredAlt?: string): string => {
  const trimmedAlt = sanitizeImageAltText(preferredAlt, 'image')
    .replace(/\s+/g, '-')
    .toLowerCase()
  const safeBase = trimmedAlt || 'image'

  if (src.startsWith('data:')) {
    const mimeType = src.slice(5, src.indexOf(';') > -1 ? src.indexOf(';') : src.length)
    const ext = fileNameExtensionForMimeType(mimeType)
    return `${safeBase}.${ext}`
  }

  if (src.startsWith('file://')) {
    const rawPath = src.replace('file://', '')
    const pathParts = rawPath.split(/[\\/]/)
    const fileName = pathParts[pathParts.length - 1] || ''
    if (fileName && /\.[a-z0-9]+$/i.test(fileName)) {
      return sanitizePathSegment(fileName, `${safeBase}.png`)
    }
  }

  return `${safeBase}.png`
}

const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], fileName, {
    type: blob.type || 'application/octet-stream',
    lastModified: Date.now(),
  })
}

const getImageDimensions = (file: File): Promise<{ width: number; height: number } | null> => {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      const width = image.naturalWidth
      const height = image.naturalHeight
      URL.revokeObjectURL(objectUrl)
      resolve(width > 0 && height > 0 ? { width, height } : null)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }

    image.src = objectUrl
  })
}

const readImageFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result
      if (typeof result === 'string' && result.startsWith('data:')) {
        resolve(result)
      } else {
        reject(new Error('Could not read file as data URL'))
      }
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

const extractNoteLinkIdsFromHtml = (htmlContent: string): string[] => {
  if (!htmlContent) return []

  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlContent, 'text/html')
  const linkElements = doc.querySelectorAll('[data-block-type="note-link"]')

  return Array.from(linkElements)
    .map(el => el.getAttribute('data-note-id'))
    .filter((id): id is string => !!id)
}

const sanitizePathSegment = (value: string, fallback: string): string => {
  const transliterated = value
    .replace(/ß/g, 'ss')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')

  const normalized = transliterated
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\.+$/, '')
    .replace(/^[-._]+|[-._]+$/g, '')
    .trim()

  return normalized || fallback
}

const safeParsePdfAnnotationData = (value: string): PdfAnnotationData | null => {
  try {
    return JSON.parse(value) as PdfAnnotationData
  } catch {
    return null
  }
}

interface NoteEditorWithPanelProps extends NoteEditorProps {
  folders?: any[]
  selectedFolderId?: string | null
  onSelectFolder?: (folderId: string | null) => void
  onCreateFolder?: (parentId: string | null, projectId?: string | null) => void
  onRenameFolder?: (folderId: string, newName: string) => void
  onDeleteFolder?: (folderId: string) => void
  onMoveFolder?: (folderId: string, newParentId: string | null) => void
  notes?: LibNote[]
  allNotes?: LibNote[]  // All notes for AI tool calling
  onSelectNote?: (note: LibNote) => void
  onNewNote?: (noteType?: NoteType, folderId?: string | null, projectId?: string | null) => void
  onDuplicateNote?: (note: LibNote) => void
  onMoveNote?: (noteId: string, newFolderId: string | null) => Promise<void>
  isLoadingNotes?: boolean
  currentFolderName?: string
  userEmail?: string
  onSignOut?: () => void
  onOpenFileExplorer?: () => void
  onOpenProjectsView?: () => void
}

export default function NoteEditor({ 
  note, 
  onSave, 
  onCancel, 
  onDelete,
  initialNoteType = 'rich-text',
  mindmapTemplateId,
  folders = [],
  selectedFolderId = null,
  onSelectFolder = () => {},
  onCreateFolder = () => {},
  onRenameFolder = () => {},
  onDeleteFolder = () => {},
  onMoveFolder,
  notes = [],
  allNotes,
  onSelectNote = () => {},
  onNewNote = () => {},
  onDuplicateNote,
  onMoveNote,
  isLoadingNotes = false,
  currentFolderName,
  userEmail,
  onSignOut,
  onOpenFileExplorer,
  onOpenProjectsView,
}: NoteEditorWithPanelProps) {
  const toast = useToast()
  const isMobile = useIsMobile()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [drawingData, setDrawingData] = useState<DrawingData | null>(null)
  const [mindmapData, setMindmapData] = useState<MindmapData | null>(null)
  const [bulletJournalData, setBulletJournalData] = useState<BulletJournalData | null>(null)
  const [dataSheetData, setDataSheetData] = useState<DataSheetData | null>(null)
  const [pdfAnnotationData, setPdfAnnotationData] = useState<PdfAnnotationData | null>(null)
  const [dataSheetKey, setDataSheetKey] = useState(0)
  const [noteType, setNoteType] = useState<NoteType>('rich-text')
  const [isSaving, setIsSaving] = useState(false)
  const [isAutosaving, setIsAutosaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showTOC, setShowTOC] = useState(false)
  const [headings, setHeadings] = useState<Array<{ id: string; level: number; text: string }>>([])
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const editorRef = useRef<RichTextEditorHandle | null>(null)
  const drawingEditorRef = useRef<DrawingEditorHandle | null>(null)
  const mindmapEditorRef = useRef<MindmapEditorHandle | null>(null)
  const bulletJournalRef = useRef<BulletJournalEditorHandle | null>(null)
  const dataSheetRef = useRef<DataSheetEditorHandle | null>(null)
  const pdfAnnotationRef = useRef<PdfAnnotationEditorHandle | null>(null)
  const [pdfExtractedText, setPdfExtractedText] = useState<string>('')
  const headingUpdateTimeoutRef = useRef<number | null>(null)
  const autosaveTimeoutRef = useRef<number | null>(null)
  const isAutosavingRef = useRef(false)
  const autosaveRetryCountRef = useRef(0)
  const MAX_AUTOSAVE_RETRIES = 3
  const migratingLegacyImagesRef = useRef(false)
  const migratedNotesRef = useRef<Set<string>>(new Set())
  const activeFormatsFrameRef = useRef<number | null>(null)
  const noteLoadingRef = useRef(false) // Suppress hasChanges flicker during note load
  const floatingToolbarRef = useRef<HTMLDivElement | null>(null)
  const floatingToolbarSizeRef = useRef({ width: 0, height: 0 })
  const [floatingToolbar, setFloatingToolbar] = useState({ visible: false, top: 0, left: 0 })
  const deferredContent = useDeferredValue(content)
  const plainContent = useMemo(() => stripHtml(deferredContent), [deferredContent])
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null)
  const [wordGoal, setWordGoal] = useState<number | null>(null)
  const [showWordGoalInput, setShowWordGoalInput] = useState(false)
  const wordGoalInputRef = useRef<HTMLInputElement>(null)
  const [showNoteLinkDialog, setShowNoteLinkDialog] = useState(false)
  const [showDataSheetPicker, setShowDataSheetPicker] = useState(false)
  const savedNoteLinkSelection = useRef<Range | null>(null)
  const savedContentBlockSelectionRef = useRef<Range | null>(null)
  const [showContentBlocksMenu, setShowContentBlocksMenu] = useState(false)
  const [blockSearchQuery, setBlockSearchQuery] = useState('')
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0)
  const blockSearchInputRef = useRef<HTMLInputElement>(null)
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false)
  const [showProjectsModal, setShowProjectsModal] = useState(false)
  const [showFilePicker, setShowFilePicker] = useState(false)
  
  // DOCX Preview Modal State
  const [docxPreview, setDocxPreview] = useState<{isOpen: boolean, filePath: string | null, fileName: string | null}>({
    isOpen: false,
    filePath: null,
    fileName: null
  })

  const [showSettings, setShowSettings] = useState(false)
  const [showAIAssistant, setShowAIAssistant] = useState(false)
  const [isAIAssistantLarge, setIsAIAssistantLarge] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
  const [shareRecord, setShareRecord] = useState<PublishedNoteShare | null>(null)
  const [isLoadingShare, setIsLoadingShare] = useState(false)
  const [isPublishingShare, setIsPublishingShare] = useState(false)
  const [isUnpublishingShare, setIsUnpublishingShare] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const rightSidebarOffset = rightSidebarCollapsed ? '48px' : '280px'
  const currentProjectName = useMemo(() => {
    if (!note?.project_id) return 'inbox'
    const project = projects.find((item) => item.id === note.project_id)
    return project?.name || 'inbox'
  }, [note?.project_id, projects])

  const currentNoteStorageName = useMemo(() => {
    return sanitizePathSegment(title || note?.title || '', 'untitled-note')
  }, [title, note?.title])

  const noteFileUploadPath = useMemo(() => {
    const projectSegment = sanitizePathSegment(currentProjectName, 'inbox')
    return `${projectSegment}/${currentNoteStorageName}/file`
  }, [currentProjectName, currentNoteStorageName])

  const noteImageUploadPath = useMemo(() => {
    const projectSegment = sanitizePathSegment(currentProjectName, 'inbox')
    return `${projectSegment}/${currentNoteStorageName}/image`
  }, [currentProjectName, currentNoteStorageName])
  // Load projects for display
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const fetchedProjects = await getProjects()
        setProjects(fetchedProjects)
      } catch (error) {
        console.error('Failed to load projects:', error)
      }
    }
    loadProjects()
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadShare = async () => {
      if (!note?.id) {
        setShareRecord(null)
        setIsLoadingShare(false)
        return
      }

      setIsLoadingShare(true)

      try {
        const existingShare = await getNoteShare(note.id)
        if (!cancelled) {
          setShareRecord(existingShare)
        }
      } catch (error) {
        console.error('Failed to load note share:', error)
        if (!cancelled) {
          setShareRecord(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingShare(false)
        }
      }
    }

    void loadShare()

    return () => {
      cancelled = true
    }
  }, [note?.id])

  // Set CSS variable for right sidebar offset
  useEffect(() => {
    if (typeof document === 'undefined' || isMobile) return
    document.documentElement.style.setProperty('--workspace-right-sidebar-offset', rightSidebarOffset)
    return () => { document.documentElement.style.removeProperty('--workspace-right-sidebar-offset') }
  }, [rightSidebarOffset, isMobile])
  
  // Selected text state for AI assistant integration
  const [selectedText, setSelectedText] = useState('')
  const selectedTextRef = useRef<string>('')
  const selectedTextUpdateTimeoutRef = useRef<number | null>(null)
  
  // Selected mindmap node state for AI assistant integration
  const [selectedMindmapNodeId, setSelectedMindmapNodeId] = useState<string | null>(null)

  // Content blocks configuration
  const contentBlocks = useMemo(() => [
    // Headings
    { id: 'heading1', label: 'Heading 1', description: 'Large section heading', icon: Heading1, color: 'indigo', category: 'Headings', command: 'heading1' as RichTextCommand, keywords: ['h1', 'title', 'big'] },
    { id: 'heading2', label: 'Heading 2', description: 'Medium section heading', icon: Heading2, color: 'indigo', category: 'Headings', command: 'heading2' as RichTextCommand, keywords: ['h2', 'subtitle'] },
    { id: 'heading3', label: 'Heading 3', description: 'Small section heading', icon: Heading3, color: 'indigo', category: 'Headings', command: 'heading3' as RichTextCommand, keywords: ['h3'] },
    { id: 'heading4', label: 'Heading 4', description: 'Sub-section heading', icon: Heading4, color: 'indigo', category: 'Headings', command: 'heading4' as RichTextCommand, keywords: ['h4'] },
    { id: 'heading5', label: 'Heading 5', description: 'Minor heading', icon: Heading5, color: 'indigo', category: 'Headings', command: 'heading5' as RichTextCommand, keywords: ['h5'] },
    { id: 'heading6', label: 'Heading 6', description: 'Smallest heading', icon: Heading6, color: 'indigo', category: 'Headings', command: 'heading6' as RichTextCommand, keywords: ['h6'] },
    // Lists
    { id: 'unordered-list', label: 'Bullet List', description: 'Create an unordered list', icon: List, color: 'green', category: 'Lists', command: 'unordered-list' as RichTextCommand, keywords: ['ul', 'bullet', 'unordered'] },
    { id: 'ordered-list', label: 'Numbered List', description: 'Create an ordered list', icon: OrderedListIcon, color: 'green', category: 'Lists', command: 'ordered-list' as RichTextCommand, keywords: ['ol', 'numbered', 'ordered'] },
    { id: 'checklist', label: 'Checklist', description: 'Task list with checkboxes', icon: CheckSquare, color: 'green', category: 'Lists', command: 'checklist' as RichTextCommand, keywords: ['cl', 'todo', 'tasks', 'check', 'checkbox'] },
    // Content
    { id: 'blockquote', label: 'Quote', description: 'Insert a blockquote', icon: Quote, color: 'amber', category: 'Content', command: 'blockquote' as RichTextCommand, keywords: ['bq', 'blockquote', 'cite'] },
    { id: 'horizontal-rule', label: 'Divider', description: 'Add a horizontal rule', icon: HorizontalRule, color: 'gray', category: 'Content', command: 'horizontal-rule' as RichTextCommand, keywords: ['hr', 'rule', 'separator', 'line'] },
    { id: 'hyperlink', label: 'Hyperlink', description: 'Insert a web link', icon: LinkIcon, color: 'blue', category: 'Content', command: 'link' as RichTextCommand, keywords: ['url', 'link', 'a', 'web', 'href'] },
    { id: 'table', label: 'Table', description: 'Insert a customizable table', icon: TableIcon, color: 'blue', category: 'Content', command: null, keywords: ['tbl', 'grid', 'spreadsheet'] },
    { id: 'note-link', label: 'Note Link', description: 'Link to another note', icon: FileText, color: 'purple', category: 'Content', command: null, keywords: ['nl', 'notelink', 'internal'] },
    { id: 'data-sheet-table', label: 'Data Sheet Table', description: 'Insert table from a data sheet', icon: Table2Icon, color: 'emerald', category: 'Content', command: null, keywords: ['dst', 'data', 'sheet'] },
    { id: 'image', label: 'Image', description: 'Insert an image', icon: ImageIcon, color: 'pink', category: 'Media', command: null, keywords: ['img', 'picture', 'photo', 'pic'] },
    { id: 'file', label: 'File', description: 'Attach a file from your storage', icon: Paperclip, color: 'alpine', category: 'Media', command: null, keywords: ['attachment', 'attach', 'upload', 'doc'] },
  ], [])

  // Filter content blocks based on search query
  const filteredBlocks = useMemo(() => {
    if (!blockSearchQuery.trim()) return contentBlocks
    
    const query = blockSearchQuery.toLowerCase()
    return contentBlocks.filter(block => 
      block.label.toLowerCase().includes(query) ||
      block.description.toLowerCase().includes(query) ||
      block.category.toLowerCase().includes(query) ||
      (block.keywords && block.keywords.some(kw => kw.toLowerCase().includes(query)))
    )
  }, [blockSearchQuery, contentBlocks])

  // Reset selected index when filtered blocks change
  useEffect(() => {
    if (selectedBlockIndex >= filteredBlocks.length) {
      setSelectedBlockIndex(Math.max(0, filteredBlocks.length - 1))
    }
  }, [filteredBlocks.length, selectedBlockIndex])

  // Focus search input when menu opens
  useEffect(() => {
    if (showContentBlocksMenu && blockSearchInputRef.current) {
      setTimeout(() => {
        blockSearchInputRef.current?.focus()
      }, 50)
    } else {
      // Reset search when menu closes
      setBlockSearchQuery('')
      setSelectedBlockIndex(0)
    }
  }, [showContentBlocksMenu])

  const scheduleHeadingsUpdate = useCallback(() => {
    if (headingUpdateTimeoutRef.current !== null) {
      window.clearTimeout(headingUpdateTimeoutRef.current)
    }

    headingUpdateTimeoutRef.current = window.setTimeout(() => {
      const newHeadings = editorRef.current?.getHeadings() ?? []
      setHeadings((previous) => {
        if (
          previous.length === newHeadings.length &&
          previous.every((item, index) => {
            const next = newHeadings[index]
            return (
              next && item.id === next.id && item.level === next.level && item.text === next.text
            )
          })
        ) {
          return previous
        }
        return newHeadings
      })
    }, 150)
  }, [])

  // Track the previous note id so we can detect actual note switches
  // (as opposed to same-note reference updates from saves)
  const prevNoteIdRef = useRef<string | undefined>(note?.id)

  useEffect(() => {
    const isNoteSwitched = prevNoteIdRef.current !== note?.id
    prevNoteIdRef.current = note?.id

    // Cancel any pending autosave from the PREVIOUS note immediately.
    // Without this, a stale autosave callback could fire between renders
    // and save old note content to the newly selected note's ID.
    if (isNoteSwitched && autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    // Mark that we're loading a note to suppress hasChanges flicker
    noteLoadingRef.current = true
    if (note) {
      setTitle(note.title)
      setNoteType(note.note_type || 'rich-text')
      
      if (note.note_type === 'drawing') {
        // Parse drawing data from content
        try {
          const data = JSON.parse(note.content || '{}')
          // Migrate old format to new multi-page format
          if (data.strokes && !data.pages) {
            const migratedData = {
              pages: [{ strokes: data.strokes, background: data.background || 'none' }],
              width: data.width || 800,
              height: data.height || 600,
              currentPage: 0
            }
            setDrawingData(migratedData)
          } else {
            setDrawingData(data)
          }
          setContent('')
          setMindmapData(null)
        } catch {
          setDrawingData({ pages: [{ strokes: [], background: 'none' }], width: 800, height: 600, currentPage: 0 })
          setContent('')
          setMindmapData(null)
        }
      } else if (note.note_type === 'mindmap') {
        // Parse mindmap data from content
        try {
          const data = JSON.parse(note.content || '{}')
          setMindmapData(data)
          setContent('')
          setDrawingData(null)
        } catch {
          // Create default mindmap if parsing fails
          const rootId = 'root'
          setMindmapData({
            rootId,
            nodes: {
              [rootId]: {
                id: rootId,
                text: 'Central Idea',
                x: 400,
                y: 300,
                parentId: null,
                children: [],
                collapsed: false,
                color: '#3B82F6',
                description: '',
                attachments: [],
              },
            },
          })
          setContent('')
          setDrawingData(null)
        }
      } else if (note.note_type === 'bullet-journal') {
        // Parse bullet journal data from content
        try {
          const data = JSON.parse(note.content || '{}')
          setBulletJournalData(data)
        } catch {
          setBulletJournalData(null)
        }
        setContent('')
        setDrawingData(null)
        setMindmapData(null)
        setDataSheetData(null)
      } else if (note.note_type === 'data-sheet') {
        // Parse data sheet data from content
        try {
          const data = JSON.parse(note.content || '{}')
          setDataSheetData(data)
        } catch {
          setDataSheetData(null)
        }
        setContent('')
        setDrawingData(null)
        setMindmapData(null)
        setBulletJournalData(null)
        setPdfAnnotationData(null)
      } else if (note.note_type === 'pdf-annotation') {
        try {
          const data = JSON.parse(note.content || '{}')
          setPdfAnnotationData(data)
        } catch {
          setPdfAnnotationData(null)
        }
        setContent('')
        setDrawingData(null)
        setMindmapData(null)
        setBulletJournalData(null)
        setDataSheetData(null)
      } else {
        setContent(note.content || '')
        setDrawingData(null)
        setMindmapData(null)
        setBulletJournalData(null)
        setDataSheetData(null)
        setPdfAnnotationData(null)
      }
      
      setHasChanges(false)
      scheduleHeadingsUpdate()
      
      // Initialize lastSaveTime from note's updated_at so status shows correctly
      if (note.updated_at) {
        setLastSaveTime(new Date(note.updated_at))
      }
      
      // Load word goal from localStorage for this note
      if (note.id) {
        const savedGoal = localStorage.getItem(`wordGoal_${note.id}`)
        setWordGoal(savedGoal ? parseInt(savedGoal, 10) : null)
      }
    } else {
      setTitle('')
      setContent('')
      setDrawingData(initialNoteType === 'drawing' ? { pages: [{ strokes: [], background: 'none' }], width: 800, height: 600, currentPage: 0 } : null)
      setMindmapData(initialNoteType === 'mindmap'
        ? getMindmapTemplate(mindmapTemplateId ?? 'blank').createData()
        : null)
      setBulletJournalData(initialNoteType === 'bullet-journal' ? { entries: [], activeDate: new Date().toISOString().slice(0, 10), view: 'daily' as const } : null)
      setDataSheetData(null) // null triggers the size picker in DataSheetEditor
      setPdfAnnotationData(initialNoteType === 'pdf-annotation' ? null : null)
      setDataSheetKey(k => k + 1) // force remount of DataSheetEditor
      setNoteType(initialNoteType)
      setHasChanges(false)
      setHeadings([])
      setWordGoal(null)
      setLastSaveTime(null)
    }
    setActiveFormats(new Set())
    // Allow the hasChanges effect to run normally after state has settled
    requestAnimationFrame(() => { noteLoadingRef.current = false })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- we intentionally
    // key on note?.id (not the full object) so same-note saves don't cause
    // a full editor reset. The note-loading effect should only run when the
    // actual note changes or when creating a new note.
  }, [note?.id, initialNoteType, mindmapTemplateId, scheduleHeadingsUpdate])

  useEffect(() => {
    // Skip hasChanges computation while a note is being loaded (prevents brief flicker)
    if (noteLoadingRef.current) return
    if (note) {
      if (noteType === 'drawing') {
        const currentDrawingStr = JSON.stringify(drawingData)
        const noteDrawingStr = note.content || '{}'
        setHasChanges(title !== note.title || currentDrawingStr !== noteDrawingStr)
      } else if (noteType === 'mindmap') {
        const currentMindmapStr = JSON.stringify(mindmapData)
        const noteMindmapStr = note.content || '{}'
        setHasChanges(title !== note.title || currentMindmapStr !== noteMindmapStr)
      } else if (noteType === 'bullet-journal') {
        const currentBJStr = JSON.stringify(bulletJournalData)
        const noteBJStr = note.content || '{}'
        setHasChanges(title !== note.title || currentBJStr !== noteBJStr)
      } else if (noteType === 'data-sheet') {
        const currentDSStr = JSON.stringify(dataSheetData)
        const noteDSStr = note.content || '{}'
        setHasChanges(title !== note.title || currentDSStr !== noteDSStr)
      } else if (noteType === 'pdf-annotation') {
        const currentPAStr = JSON.stringify(pdfAnnotationData)
        const notePAStr = note.content || '{}'
        setHasChanges(title !== note.title || currentPAStr !== notePAStr)
      } else {
        setHasChanges(title !== note.title || content !== (note.content || ''))
      }
    } else {
      if (noteType === 'drawing') {
        const totalStrokes = drawingData?.pages.reduce((sum, page) => sum + page.strokes.length, 0) || 0
        setHasChanges(title.trim() !== '' || totalStrokes > 0)
      } else if (noteType === 'mindmap') {
        const nodeCount = mindmapData ? Object.keys(mindmapData.nodes).length : 0
        setHasChanges(title.trim() !== '' || nodeCount > 1)
      } else if (noteType === 'bullet-journal') {
        const entryCount = bulletJournalData?.entries.filter(e => e.content.trim() !== '').length ?? 0
        setHasChanges(title.trim() !== '' || entryCount > 0)
      } else if (noteType === 'data-sheet') {
        const cellCount = dataSheetData?.rows.reduce((sum, r) => sum + r.filter(c => c.trim() !== '').length, 0) ?? 0
        setHasChanges(title.trim() !== '' || cellCount > 0)
      } else if (noteType === 'pdf-annotation') {
        setHasChanges(title.trim() !== '' || !!pdfAnnotationData?.pdfStoragePath)
      } else {
        setHasChanges(title.trim() !== '' || plainContent !== '')
      }
    }
  }, [title, content, drawingData, mindmapData, bulletJournalData, dataSheetData, pdfAnnotationData, note, plainContent, noteType])

  useEffect(() => {
    return () => {
      if (headingUpdateTimeoutRef.current !== null) {
        window.clearTimeout(headingUpdateTimeoutRef.current)
      }
      if (activeFormatsFrameRef.current !== null) {
        window.cancelAnimationFrame(activeFormatsFrameRef.current)
      }
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    }
  }, [])

  // Flush pending saves on window close or app hide to prevent data loss
  const handleSaveRef = useRef<((opts?: { isAuto?: boolean }) => void) | null>(null)
  const hasChangesRef = useRef(hasChanges)
  hasChangesRef.current = hasChanges

  useEffect(() => {
    const flushSave = () => {
      if (hasChangesRef.current && !isAutosavingRef.current && handleSaveRef.current) {
        handleSaveRef.current({ isAuto: true })
      }
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChangesRef.current) {
        flushSave()
        e.preventDefault()
        e.returnValue = '' // Required for Chrome
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSave()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Tauri close-requested integration (if available)
    let tauriUnlisten: (() => void) | null = null
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        tauriUnlisten = await listen('tauri://close-requested', () => {
          flushSave()
        })
      } catch {
        // Not in a Tauri environment — ignore
      }
    })()

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      tauriUnlisten?.()
    }
  }, [])

  const updateActiveFormats = useCallback(() => {
    if (!editorRef.current) return
    // Single-pass: getActiveFormats resolves the selection element once and
    // checks every format in one DOM walk — more reliable and efficient than
    // calling queryCommandState N times.
    setActiveFormats(editorRef.current.getActiveFormats())
  }, [])

  const scheduleActiveFormatsUpdate = useCallback(() => {
    if (activeFormatsFrameRef.current !== null) {
      window.cancelAnimationFrame(activeFormatsFrameRef.current)
    }

    activeFormatsFrameRef.current = window.requestAnimationFrame(() => {
      updateActiveFormats()
      activeFormatsFrameRef.current = null
    })
  }, [updateActiveFormats])

  const hideFloatingToolbar = useCallback(() => {
    floatingToolbarSizeRef.current = { width: 0, height: 0 }
    setFloatingToolbar((previous) =>
      previous.visible ? { ...previous, visible: false } : previous
    )
  }, [])

  const updateFloatingToolbar = useCallback(() => {
    const selection = window.getSelection()
    const editorElement = editorRef.current?.getRootElement()

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !editorElement) {
      hideFloatingToolbar()
      return
    }

    const anchorNode = selection.anchorNode
    const focusNode = selection.focusNode

    if (
      !anchorNode ||
      !focusNode ||
      !editorElement.contains(anchorNode) ||
      !editorElement.contains(focusNode)
    ) {
      hideFloatingToolbar()
      return
    }

    const range = selection.getRangeAt(0)
    const selectedText = selection.toString()
    if (!selectedText || selectedText.trim().length === 0) {
      hideFloatingToolbar()
      return
    }

    const rect = range.getBoundingClientRect()

    if ((rect.width === 0 && rect.height === 0) || Number.isNaN(rect.top) || Number.isNaN(rect.left)) {
      hideFloatingToolbar()
      return
    }

    const MIN_MARGIN = 16
    const SELECTION_GAP = 12
    const selectionTop = rect.top
    const selectionBottom = rect.bottom
    const selectionCenterX = rect.left + rect.width / 2

    const { width, height } = floatingToolbarSizeRef.current
    const availableWidth = Math.max(window.innerWidth - MIN_MARGIN * 2, 0)
    const fallbackWidth = Math.min(availableWidth, 280)
    const measuredWidth = width > 0 ? width : fallbackWidth
    const effectiveWidth = Math.min(measuredWidth, availableWidth)
    const halfWidth = effectiveWidth / 2

    let left = selectionCenterX - halfWidth
    const minLeft = MIN_MARGIN
    const maxLeft = window.innerWidth - MIN_MARGIN - effectiveWidth
    left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft))

    const measuredHeight = height > 0 ? height : 44
    let top = selectionTop - measuredHeight - SELECTION_GAP
    const minTop = MIN_MARGIN

    if (top < minTop) {
      top = selectionBottom + SELECTION_GAP
      const maxTop = window.innerHeight - MIN_MARGIN - measuredHeight
      top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop))
    }

    setFloatingToolbar((previous) => {
      const next = { visible: true, top, left }
      if (
        previous.visible === next.visible &&
        Math.abs(previous.top - next.top) < 0.5 &&
        Math.abs(previous.left - next.left) < 0.5
      ) {
        return previous
      }
      return next
    })
  }, [hideFloatingToolbar])

  const handleContentChange = useCallback(
    (html: string) => {
      setContent(html)
      scheduleHeadingsUpdate()
      scheduleActiveFormatsUpdate()
      updateFloatingToolbar()
    },
    [scheduleHeadingsUpdate, scheduleActiveFormatsUpdate, updateFloatingToolbar]
  )

  // Initialize file-block click interactions (download / preview / delete)
  useEffect(() => {
    const editorElement = editorRef.current?.getRootElement()
    if (!editorElement) return

    const cleanup = initializeFileBlockInteractions(editorElement, () => {
      // Trigger content change so the editor saves the updated HTML
      if (editorRef.current) {
        const html = editorElement.innerHTML
        handleContentChange(html)
      }
    })

    return cleanup
  }, [handleContentChange])

  const handleCommand = useCallback(
    (command: RichTextCommand) => {
      editorRef.current?.exec(command)
      window.requestAnimationFrame(() => {
        scheduleActiveFormatsUpdate()
        updateFloatingToolbar()
      })
      // Block-format commands (headings, blockquote) restore the cursor
      // asynchronously (80-150 ms). Schedule a second format update after
      // the cursor has settled so the toolbar reflects the true state.
      if (
        command.startsWith('heading') ||
        command === 'blockquote' ||
        command === 'unordered-list' ||
        command === 'ordered-list' ||
        command === 'checklist'
      ) {
        setTimeout(() => {
          updateActiveFormats()
          updateFloatingToolbar()
        }, 200)
      }
    },
    [scheduleActiveFormatsUpdate, updateActiveFormats, updateFloatingToolbar]
  )

  // Save current selection before opening note link dialog
  const saveNoteLinkSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      savedNoteLinkSelection.current = selection.getRangeAt(0).cloneRange()
    }
  }, [])

  // Restore selection and insert note link
  const handleNoteLinkSelect = useCallback(
    (noteId: string, noteTitle: string, folderId?: string | null) => {
      // Restore the saved selection first
      if (savedNoteLinkSelection.current) {
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(savedNoteLinkSelection.current)
        }
      }

      // Focus the editor
      editorRef.current?.focus()

      // Small delay to ensure focus is set before inserting
      setTimeout(() => {
        if (editorRef.current && editorRef.current.insertCustomBlock) {
          editorRef.current.insertCustomBlock('note-link', {
            noteId,
            noteTitle,
            folderId
          })
          setHasChanges(true)
        }
        // Clear the saved selection
        savedNoteLinkSelection.current = null
      }, 10)
    },
    []
  )
  
  const saveContentBlockSelection = useCallback(() => {
    if (typeof window === 'undefined') return
    const editorElement = editorRef.current?.getRootElement()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorElement) return

    const range = selection.getRangeAt(0)
    if (!editorElement.contains(range.commonAncestorContainer)) return

    savedContentBlockSelectionRef.current = range.cloneRange()
  }, [])

  const restoreContentBlockSelection = useCallback(() => {
    if (typeof window === 'undefined') {
      savedContentBlockSelectionRef.current = null
      return
    }

    const savedRange = savedContentBlockSelectionRef.current
    const editorElement = editorRef.current?.getRootElement()

    if (!savedRange || !editorElement) return

    const { startContainer, endContainer } = savedRange
    if (
      !startContainer.isConnected ||
      !endContainer.isConnected ||
      !editorElement.contains(startContainer) ||
      !editorElement.contains(endContainer)
    ) {
      savedContentBlockSelectionRef.current = null
      return
    }

    const selection = window.getSelection()
    if (!selection) return

    selection.removeAllRanges()
    selection.addRange(savedRange)
    savedContentBlockSelectionRef.current = null
  }, [])

  const runAfterMenuClose = useCallback(
    (action?: () => void) => {
      const execute = () => {
        editorRef.current?.focus()
        restoreContentBlockSelection()
        action?.()
      }

      if (typeof window === 'undefined') {
        execute()
        return
      }

      if (showContentBlocksMenu) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(execute)
        })
      } else {
        execute()
      }
    },
    [restoreContentBlockSelection, showContentBlocksMenu]
  )

  const openContentBlocksMenu = useCallback(() => {
    if (showContentBlocksMenu) return
    saveContentBlockSelection()
    setShowContentBlocksMenu(true)
  }, [saveContentBlockSelection, showContentBlocksMenu])

  const hideContentBlocksMenu = useCallback(
    (afterClose?: () => void) => {
      setShowContentBlocksMenu(false)
      runAfterMenuClose(afterClose)
    },
    [runAfterMenuClose]
  )

  // Handle content block insertion
  const handleInsertTable = useCallback(() => {
    hideContentBlocksMenu(() => {
      editorRef.current?.showTableDialog()
    })
  }, [hideContentBlocksMenu])

  const handleInsertNoteLink = useCallback(() => {
    hideContentBlocksMenu(() => {
      editorRef.current?.requestNoteLink()
    })
  }, [hideContentBlocksMenu])

  const handleInsertDataSheetTable = useCallback(() => {
    hideContentBlocksMenu(() => {
      saveNoteLinkSelection()
      setShowDataSheetPicker(true)
    })
  }, [hideContentBlocksMenu, saveNoteLinkSelection])

  const handleDataSheetTableSelect = useCallback(
    (payload: DataSheetTablePayload) => {
      // Restore the saved selection first
      if (savedNoteLinkSelection.current) {
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(savedNoteLinkSelection.current)
        }
      }

      editorRef.current?.focus()

      setTimeout(() => {
        if (editorRef.current && editorRef.current.insertCustomBlock) {
          editorRef.current.insertCustomBlock('data-sheet-table', payload)
          setHasChanges(true)
        }
        savedNoteLinkSelection.current = null
      }, 10)
    },
    []
  )

  const uploadAndBuildImagePayload = useCallback(async (
    file: File,
    sourceType: 'insert' | 'paste' | 'drop' | 'migration',
    options?: {
      preferredAlt?: string
      silent?: boolean
      legacySource?: string
      originalDataUrl?: string
    }
  ) => {
    const mimeType = (file.type || '').toLowerCase()
    if (!mimeType.startsWith('image/')) {
      if (!options?.silent) {
        toast.push({ title: 'Unsupported file type', description: 'Please select a valid image file.' })
      }
      return null
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      if (!options?.silent) {
        toast.push({ title: 'Image too large', description: 'Image file is too large. Maximum size is 10MB.' })
      }
      return null
    }

    const uploaded = await uploadImageFile(file, noteImageUploadPath)
    const dimensions = await getImageDimensions(file)
    const alt = sanitizeImageAltText(
      options?.preferredAlt || file.name,
      sourceType === 'paste' ? 'Pasted image' : 'Image'
    )

    let attachmentId: string | undefined
    try {
      const attachment = await createNoteAttachment({
        note_id: note?.id ?? null,
        kind: 'image',
        storage_path: uploaded.path,
        url: uploaded.url,
        mime_type: uploaded.file.type || null,
        size_bytes: uploaded.file.size,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        alt_text: alt,
        source_type: sourceType,
        metadata: {
          original_name: file.name,
          uploaded_name: uploaded.file.name,
          ...(options?.legacySource ? { legacy_source: options.legacySource } : {}),
        },
      })
      attachmentId = attachment.id
    } catch (attachmentError) {
      console.warn('Image uploaded but attachment record failed:', attachmentError)
    }

    return {
      src: uploaded.url,
      alt,
      attachmentId,
      storagePath: uploaded.path,
      mimeType: uploaded.file.type,
      sizeBytes: uploaded.file.size,
      sourceType,
      uploadedAt: new Date().toISOString(),
      width: dimensions?.width,
      height: dimensions?.height,
    }
  }, [note?.id, noteImageUploadPath, toast])

  const migrateLegacyImagesInHtml = useCallback(async (html: string) => {
    if (!containsLegacyImageSources(html)) {
      return { html, migratedCount: 0, failedCount: 0 }
    }

    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const imageNodes = Array.from(doc.querySelectorAll('img'))

    let migratedCount = 0
    let failedCount = 0

    for (const img of imageNodes) {
      const src = img.getAttribute('src') || ''
      if (!(src.startsWith('data:') || src.startsWith('file://'))) {
        continue
      }

      try {
        let migrationDataUrl = src

        if (src.startsWith('file://')) {
          const { convertFileUrlToDataUrl } = await import('@/lib/tauri/imageStorage')
          const converted = await convertFileUrlToDataUrl(src)
          if (!converted || !converted.startsWith('data:')) {
            throw new Error('Could not read file:// image for migration')
          }
          migrationDataUrl = converted
        }

        if (!migrationDataUrl.startsWith('data:')) {
          throw new Error('Legacy image source is not a data URL')
        }

        const fileName = buildLegacyMigrationFileName(src, img.getAttribute('alt') || undefined)
        const file = await dataUrlToFile(migrationDataUrl, fileName)

        const payload = await uploadAndBuildImagePayload(file, 'migration', {
          preferredAlt: img.getAttribute('alt') || undefined,
          legacySource: src,
          originalDataUrl: migrationDataUrl,
          silent: true,
        })

        if (!payload) {
          failedCount++
          continue
        }

        img.setAttribute('src', payload.src)
        img.setAttribute('alt', payload.alt || 'Image')

        const container = img.closest('[data-block][data-block-type="image"]') as HTMLElement | null
        if (container) {
          if (payload.attachmentId) container.setAttribute('data-attachment-id', payload.attachmentId)
          if (payload.storagePath) container.setAttribute('data-storage-path', payload.storagePath)
          if (payload.mimeType) container.setAttribute('data-mime-type', payload.mimeType)
          if (payload.sizeBytes) container.setAttribute('data-size-bytes', String(payload.sizeBytes))
          container.setAttribute('data-source-type', 'migration')
          if (payload.uploadedAt) container.setAttribute('data-uploaded-at', payload.uploadedAt)

          try {
            const encodedPayload = container.getAttribute('data-block-payload')
            const parsedPayload = encodedPayload
              ? JSON.parse(decodeURIComponent(encodedPayload))
              : {}
            const mergedPayload = {
              ...parsedPayload,
              src: payload.src,
              alt: payload.alt,
              attachmentId: payload.attachmentId,
              storagePath: payload.storagePath,
              mimeType: payload.mimeType,
              sizeBytes: payload.sizeBytes,
              sourceType: 'migration',
              uploadedAt: payload.uploadedAt,
            }
            container.setAttribute('data-block-payload', encodeURIComponent(JSON.stringify(mergedPayload)))
          } catch {
            // ignore malformed legacy payloads
          }
        }

        migratedCount++
      } catch (error) {
        console.warn('Legacy image migration failed for one image:', error)
        failedCount++
      }
    }

    return {
      html: doc.body.innerHTML,
      migratedCount,
      failedCount,
    }
  }, [uploadAndBuildImagePayload])

  useEffect(() => {
    if (!note?.id || noteType !== 'rich-text') return
    if (migratedNotesRef.current.has(note.id)) return
    if (!containsLegacyImageSources(content)) {
      migratedNotesRef.current.add(note.id)
      return
    }
    if (migratingLegacyImagesRef.current) return

    migratedNotesRef.current.add(note.id)
    migratingLegacyImagesRef.current = true
    let cancelled = false

    ;(async () => {
      try {
        const migration = await migrateLegacyImagesInHtml(content)
        if (cancelled) return

        if (migration.migratedCount > 0 && migration.html !== content) {
          setContent(migration.html)
          setHasChanges(true)
          toast.push({
            title: 'Images migrated',
            description: `Migrated ${migration.migratedCount} legacy image${migration.migratedCount === 1 ? '' : 's'} to cloud storage.`,
          })
        }

        if (migration.failedCount > 0) {
          toast.push({
            title: 'Some images could not be migrated',
            description: `${migration.failedCount} legacy image${migration.failedCount === 1 ? '' : 's'} could not be migrated automatically.`,
          })
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Legacy image migration failed:', error)
          toast.push({
            title: 'Image migration failed',
            description: 'Could not migrate one or more legacy images automatically.',
          })
        }
      } finally {
        migratingLegacyImagesRef.current = false
      }
    })()

    return () => {
      cancelled = true
    }
  }, [content, migrateLegacyImagesInHtml, note?.id, noteType, toast])

  const reconcileOrphanedImageAttachments = useCallback(async (noteId: string, html: string) => {
    const referenced = extractReferencedImageAttachments(html)
    const attachments = await getNoteAttachments(noteId)
    const imageAttachments = attachments.filter((attachment) => attachment.kind === 'image')

    const orphaned = imageAttachments.filter((attachment) => {
      if (referenced.attachmentIds.has(attachment.id)) return false
      if (attachment.storage_path && referenced.storagePaths.has(attachment.storage_path)) return false
      return true
    })

    let deletedCount = 0
    let failedCount = 0

    for (const attachment of orphaned) {
      try {
        if (attachment.storage_path) {
          try {
            await deleteFile(attachment.storage_path)
          } catch (storageError) {
            console.warn('Failed to delete orphaned image storage object:', storageError)
          }
        }

        await deleteNoteAttachment(attachment.id)
        deletedCount++
      } catch (error) {
        console.warn('Failed to delete orphaned note attachment record:', error)
        failedCount++
      }
    }

    return {
      deletedCount,
      failedCount,
    }
  }, [])

  const handleInsertImage = useCallback(async () => {

    hideContentBlocksMenu(async () => {
      try {
        // Try to use Tauri native file dialog first
        const { isTauriEnvironment, selectImageFile, readImageAsDataUrl } = await import('@/lib/tauri/imageStorage')
        
        if (isTauriEnvironment()) {
          // Use Tauri native file dialog
          const selected = await selectImageFile()
          
          if (selected) {
            const dataUrl = await readImageAsDataUrl(selected.path)
            if (dataUrl && editorRef.current && editorRef.current.insertCustomBlock) {
              const imageFile = await dataUrlToFile(dataUrl, selected.name)
              const payload = await uploadAndBuildImagePayload(imageFile, 'insert')

              if (!payload) return

              editorRef.current.insertCustomBlock('image', {
                ...payload,
              })
              setHasChanges(true)
            }
          }
        } else {
          // Fall back to web file input
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'image/*'
          input.onchange = async (e: Event) => {
            const target = e.target as HTMLInputElement
            const file = target.files?.[0]
            if (file) {
              try {
                const payload = await uploadAndBuildImagePayload(file, 'insert')
                if (!payload || !editorRef.current?.insertCustomBlock) return

                editorRef.current.insertCustomBlock('image', {
                  ...payload,
                })
                setHasChanges(true)
              } catch (uploadError) {
                console.error('Image upload failed:', uploadError)
                toast.push({ title: 'Upload failed', description: 'Could not upload image. Please try again.' })
              }
            }
          }
          input.click()
        }
      } catch (error) {
        console.error('Failed to insert image:', error)
        toast.push({ title: 'Error', description: 'Failed to insert image. Please try again.' })
      }
    })
  }, [hideContentBlocksMenu, uploadAndBuildImagePayload, toast])

  const handleInsertFile = useCallback(() => {
    hideContentBlocksMenu(() => {
      saveNoteLinkSelection()
      setShowFilePicker(true)
    })
  }, [hideContentBlocksMenu, saveNoteLinkSelection])

  const handleFilePickerSelect = useCallback((files: Array<{ name: string; path: string; size: number; type: string }>) => {
    setShowFilePicker(false)
    if (!editorRef.current) return

    // Restore the selection that was saved before the file picker modal opened
    if (savedNoteLinkSelection.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(savedNoteLinkSelection.current)
      }
    }

    editorRef.current.focus()

    // Small delay to ensure focus + selection are settled before inserting
    setTimeout(() => {
      if (!editorRef.current) return
      for (const file of files) {
        const payload: FileBlockPayload = {
          name: file.name,
          path: file.path,
          size: file.size,
          type: file.type,
          attached_at: new Date().toISOString(),
        }
        editorRef.current.insertCustomBlock?.('file', payload)
      }
      setHasChanges(true)
    }, 10)
  }, [])

  const handleInsertContentBlock = useCallback((command: RichTextCommand) => {
    hideContentBlocksMenu(() => {
      editorRef.current?.exec(command)
    })
  }, [hideContentBlocksMenu])

  const executeBlockAction = useCallback((blockId: string) => {
    const block = contentBlocks.find(b => b.id === blockId)
    if (!block) return

    if (blockId === 'table') {
      handleInsertTable()
    } else if (blockId === 'note-link') {
      handleInsertNoteLink()
    } else if (blockId === 'data-sheet-table') {
      handleInsertDataSheetTable()
    } else if (blockId === 'image') {
      handleInsertImage()
    } else if (blockId === 'file') {
      handleInsertFile()
    } else if (block.command) {
      handleInsertContentBlock(block.command)
    }
  }, [contentBlocks, handleInsertContentBlock, handleInsertNoteLink, handleInsertTable, handleInsertImage, handleInsertFile, handleInsertDataSheetTable])

  // Keyboard navigation for content blocks menu
  const handleBlockMenuKeyDown = useCallback((e: KeyboardEvent | React.KeyboardEvent) => {
    if (!showContentBlocksMenu) return

    if (e.key === 'Escape') {
      e.preventDefault()
      hideContentBlocksMenu()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedBlockIndex(prev => Math.min(prev + 1, filteredBlocks.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedBlockIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selectedBlock = filteredBlocks[selectedBlockIndex]
      if (selectedBlock) {
        executeBlockAction(selectedBlock.id)
      }
    }
  }, [showContentBlocksMenu, selectedBlockIndex, filteredBlocks, executeBlockAction, hideContentBlocksMenu])

  // Add global keyboard listener for content blocks menu
  useEffect(() => {
    if (!showContentBlocksMenu) return

    const handleKeyDown = (e: KeyboardEvent) => {
      handleBlockMenuKeyDown(e)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showContentBlocksMenu, handleBlockMenuKeyDown])

  // Handle clicking on note links
  useEffect(() => {
    const handleNoteLinkClick = async (event: Event) => {
      const customEvent = event as CustomEvent<{ noteId: string }>
      const noteId = customEvent.detail?.noteId
      
      if (noteId && onSelectNote) {
        // First check if the note is in the current notes array (already loaded)
        if (notes) {
          const targetNote = notes.find(n => n.id === noteId)
          if (targetNote) {
            onSelectNote(targetNote)
            return
          }
        }
        
        // If not found in current notes, fetch it directly from Supabase
        // This handles notes in other folders
        try {
          const { getNote } = await import('../lib/notes')
          const targetNote = await getNote(noteId)
          if (targetNote) {
            onSelectNote(targetNote)
          } else {
            toast.push({ title: 'Note not found', description: 'The linked note could not be found.' })
          }
        } catch (error) {
          console.error('Failed to load note:', error)
          toast.push({ title: 'Error loading note', description: 'Failed to load the linked note.' })
        }
      }
    }

    window.addEventListener('note-link-click', handleNoteLinkClick)
    return () => window.removeEventListener('note-link-click', handleNoteLinkClick)
  }, [notes, onSelectNote, toast])

  // Handle "Annotate PDF" action from file attachment blocks inside the rich text editor.
  useEffect(() => {
    const openPdfAnnotationNote = async (noteId: string): Promise<boolean> => {
      const existing = (allNotes ?? notes).find((item) => item.id === noteId)
      if (existing) {
        onSelectNote(existing)
        return true
      }

      try {
        const fetched = await getNote(noteId)
        if (fetched) {
          onSelectNote(fetched)
          return true
        }
      } catch (error) {
        console.error('Failed to open embedded PDF annotation note:', error)
      }

      return false
    }

    const findExistingPdfAnnotationEmbed = (
      sourcePath: string,
      occurrenceIndex: number
    ): { noteId: string; element: HTMLElement } | null => {
      const editorElement = editorRef.current?.getRootElement()
      if (!editorElement) return null

      const embedNodes = Array.from(
        editorElement.querySelectorAll('[data-block-type="pdf-annotation-embed"]')
      ) as HTMLElement[]

      const exact = embedNodes.find((node) => {
        const nodePath = node.getAttribute('data-pdf-source-path') || ''
        const nodeOccurrence = Number(node.getAttribute('data-pdf-source-occurrence') || '0')
        return nodePath === sourcePath && nodeOccurrence === occurrenceIndex
      })

      if (exact) {
        const noteId = exact.getAttribute('data-pdf-note-id') || ''
        if (noteId) {
          return { noteId, element: exact }
        }
      }

      const byPath = embedNodes.find((node) => {
        const nodePath = node.getAttribute('data-pdf-source-path') || ''
        return nodePath === sourcePath
      })

      if (byPath) {
        const noteId = byPath.getAttribute('data-pdf-note-id') || ''
        if (noteId) {
          return { noteId, element: byPath }
        }
      }

      return null
    }

    const handleAnnotatePdfFromFileBlock = async (event: Event) => {
      const customEvent = event as CustomEvent<FileBlockAnnotatePdfEventDetail>
      const detail = customEvent.detail
      if (!detail?.filePath) return

      const mime = (detail.fileType || '').toLowerCase()
      const isPdf = mime === 'application/pdf' || detail.filePath.toLowerCase().endsWith('.pdf')
      if (!isPdf) {
        toast.push({ title: 'Unsupported file', description: 'Only PDF files can be opened in PDF annotation notes.' })
        return
      }

      const baseName = (detail.fileName || 'PDF').replace(/\.[pP][dD][fF]$/, '').trim() || 'PDF'
      const annotationTitle = `${baseName} Annotation`
      const nowIso = new Date().toISOString()
      const occurrenceIndex = typeof detail.occurrenceIndex === 'number' ? detail.occurrenceIndex : 0

      if (noteType === 'rich-text') {
        const existingEmbed = findExistingPdfAnnotationEmbed(detail.filePath, occurrenceIndex)
        if (existingEmbed) {
          const opened = await openPdfAnnotationNote(existingEmbed.noteId)
          if (opened) {
            existingEmbed.element.classList.add('ring-2', 'ring-indigo-300')
            window.setTimeout(() => {
              existingEmbed.element.classList.remove('ring-2', 'ring-indigo-300')
            }, 1200)

            toast.push({
              title: 'Existing annotation reused',
              description: 'Opened the embedded PDF annotation note for this attachment.',
            })
            return
          }
        }
      }

      const initialPdfData: PdfAnnotationData = {
        pdfStoragePath: detail.filePath,
        pages: [],
        currentPage: 0,
        totalPages: 0,
        zoom: 1,
      }

      try {
        const created = await createNote({
          title: annotationTitle,
          content: JSON.stringify(initialPdfData),
          folder_id: note?.folder_id ?? selectedFolderId ?? null,
          project_id: note?.project_id ?? null,
          note_type: 'pdf-annotation',
        })

        if (noteType === 'rich-text' && editorRef.current?.insertCustomBlock) {
          const embedPayload: PdfAnnotationEmbedPayload = {
            noteId: created.id,
            noteTitle: created.title || annotationTitle,
            sourcePath: detail.filePath,
            sourceName: detail.fileName || 'PDF',
            occurrenceIndex,
            createdAt: nowIso,
          }

          editorRef.current.insertCustomBlock('pdf-annotation-embed', embedPayload)
          const html = editorRef.current.getHTML()
          handleContentChange(html)
          setHasChanges(true)
        }

        toast.push({
          title: 'PDF annotation note created',
          description: 'Embedded annotation block added. Use Open to jump into the annotation note.',
        })
      } catch (error) {
        console.error('Failed to create PDF annotation note from file block:', error)
        toast.push({ title: 'Creation failed', description: 'Could not create PDF annotation note.' })
      }
    }

    const handlePreviewDocxFromFileBlock = (event: Event) => {
      const customEvent = event as CustomEvent<FileBlockPreviewDocxEventDetail>
      const detail = customEvent.detail
      if (!detail?.filePath) return
      
      setDocxPreview({
        isOpen: true,
        filePath: detail.filePath,
        fileName: detail.fileName
      })
    }

    const handleOpenEmbeddedPdfNote = async (event: Event) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const button = target.closest('[data-open-pdf-note-id]') as HTMLElement | null
      if (!button) return

      const editorElement = editorRef.current?.getRootElement()
      if (!editorElement || !editorElement.contains(button)) return

      event.preventDefault()
      const noteId = button.getAttribute('data-open-pdf-note-id')
      if (!noteId) return

      void openPdfAnnotationNote(noteId)
    }

    window.addEventListener(FILE_BLOCK_ANNOTATE_PDF_EVENT, handleAnnotatePdfFromFileBlock as EventListener)
    window.addEventListener(FILE_BLOCK_PREVIEW_DOCX_EVENT, handlePreviewDocxFromFileBlock as EventListener)
    window.addEventListener('click', handleOpenEmbeddedPdfNote)

    return () => {
      window.removeEventListener(FILE_BLOCK_ANNOTATE_PDF_EVENT, handleAnnotatePdfFromFileBlock as EventListener)
      window.removeEventListener(FILE_BLOCK_PREVIEW_DOCX_EVENT, handlePreviewDocxFromFileBlock as EventListener)
      window.removeEventListener('click', handleOpenEmbeddedPdfNote)
    }
  }, [
    allNotes,
    handleContentChange,
    note?.folder_id,
    note?.project_id,
    noteType,
    notes,
    onSelectNote,
    selectedFolderId,
    toast,
  ])

  const handleSave = useCallback(async (opts?: { isAuto?: boolean }) => {
    const isAuto = !!opts?.isAuto

    // If this is a manual save, cancel pending autosave
    if (!isAuto && autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    // For manual save, require title. For autosave, use fallback.
    const effectiveTitle = title.trim() || (isAuto ? 'Untitled' : '')
    if (!effectiveTitle) {
      if (!isAuto) alert('Please enter a title')
      return
    }

    if (isAuto) {
      // mark autosave in-flight to avoid concurrent autosaves; use ref to avoid rerenders
      isAutosavingRef.current = true
      setIsAutosaving(true)
    } else {
      setIsSaving(true)
    }

    try {
      let savedRichTextContent: string | null = null

      if (noteType === 'drawing') {
        const drawingContent = JSON.stringify(drawingData)
        await onSave({
          title: effectiveTitle,
          content: drawingContent,
          note_type: 'drawing',
        }, isAuto)
      } else if (noteType === 'mindmap') {
        const mindmapContent = JSON.stringify(mindmapData)
        await onSave({
          title: effectiveTitle,
          content: mindmapContent,
          note_type: 'mindmap',
        }, isAuto)
      } else if (noteType === 'bullet-journal') {
        // Also persist entries to Supabase
        try { await bulletJournalRef.current?.saveToDb() } catch (e) { console.error('BJ saveToDb error', e) }
        const bjContent = JSON.stringify(bulletJournalData)
        await onSave({
          title: effectiveTitle,
          content: bjContent,
          note_type: 'bullet-journal',
        }, isAuto)
      } else if (noteType === 'data-sheet') {
        const dsContent = JSON.stringify(dataSheetData)
        await onSave({
          title: effectiveTitle,
          content: dsContent,
          note_type: 'data-sheet',
        }, isAuto)
      } else if (noteType === 'pdf-annotation') {
        const paContent = JSON.stringify(pdfAnnotationData)
        await onSave({
          title: effectiveTitle,
          content: paContent,
          note_type: 'pdf-annotation',
        }, isAuto)
      } else {
        let contentToSave = content
        if (containsLegacyImageSources(contentToSave)) {
          const migration = await migrateLegacyImagesInHtml(contentToSave)
          if (migration.migratedCount > 0) {
            contentToSave = migration.html
            setContent(contentToSave)
          }
        }

        await onSave({
          title: effectiveTitle,
          content: contentToSave,
          note_type: 'rich-text',
        }, isAuto)

        savedRichTextContent = contentToSave
      }

      if (noteType === 'rich-text' && note?.id && savedRichTextContent !== null) {
        try {
          const cleanupResult = await reconcileOrphanedImageAttachments(note.id, savedRichTextContent)
          if (cleanupResult.failedCount > 0) {
            toast.push({
              title: 'Some image cleanup failed',
              description: `${cleanupResult.failedCount} removed image attachment${cleanupResult.failedCount === 1 ? '' : 's'} could not be fully cleaned up.`,
            })
          }
        } catch (cleanupError) {
          console.error('Failed to reconcile note image attachments:', cleanupError)
        }
      }

      setHasChanges(false)
      setLastSaveTime(new Date())
      // Reset retry counter on success
      if (isAuto) autosaveRetryCountRef.current = 0
    } catch (error: any) {
      if (!isAuto) {
        alert('Failed to save note: ' + error.message)
      } else {
        console.error('Autosave failed:', error)
        autosaveRetryCountRef.current++

        if (autosaveRetryCountRef.current <= MAX_AUTOSAVE_RETRIES) {
          // Retry with exponential backoff
          const retryDelay = Math.min(2000 * Math.pow(2, autosaveRetryCountRef.current - 1), 16000)
          autosaveTimeoutRef.current = window.setTimeout(() => {
            autosaveTimeoutRef.current = null
            if (hasChanges && !isSaving && !isDeleting) {
              handleSave({ isAuto: true })
            }
          }, retryDelay)
        } else {
          // Max retries exceeded — notify user
          toast.push({
            title: 'Autosave failed',
            description: 'Changes could not be saved automatically. Please save manually.',
            duration: 8000,
          })
          autosaveRetryCountRef.current = 0
        }
      }
    } finally {
      if (isAuto) {
        isAutosavingRef.current = false
        setIsAutosaving(false)
      } else {
        setIsSaving(false)
      }
    }
  }, [content, drawingData, mindmapData, onSave, title, noteType, hasChanges, isSaving, isDeleting, toast, migrateLegacyImagesInHtml, note?.id, reconcileOrphanedImageAttachments])

  // Autosave: debounce saves after a short period of inactivity.
  useEffect(() => {
    const AUTOSAVE_DELAY = 2000 // ms

    // clear any existing autosave
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    // Only schedule autosave when there are unsaved changes, not currently saving/deleting.
    // Title is no longer required — autosave uses "Untitled" as fallback.
    if (!hasChanges || isSaving || isDeleting) {
      return
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      // safety guards before saving
      if (!hasChanges || isSaving || isDeleting) {
        autosaveTimeoutRef.current = null
        return
      }
      ;(async () => {
        try {
          // avoid scheduling a new autosave while one is running
          if (isAutosavingRef.current) return
          await handleSave({ isAuto: true })
        } finally {
          autosaveTimeoutRef.current = null
        }
      })()
    }, AUTOSAVE_DELAY)

    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    }
  }, [title, content, drawingData, mindmapData, noteType, hasChanges, isSaving, isDeleting, handleSave])

  // Keep ref in sync now that handleSave is declared
  handleSaveRef.current = handleSave

  const handleDelete = async () => {
    if (!note || !onDelete) return

    if (!confirm('Are you sure you want to delete this note?')) return

    setIsDeleting(true)
    try {
      await onDelete(note.id)
    } catch (error: any) {
      alert('Failed to delete note: ' + error.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancel = () => {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        return
      }
    }
    onCancel?.()
  }

  const handleSetWordGoal = (goal: number | null) => {
    setWordGoal(goal)
    if (note?.id) {
      if (goal === null) {
        localStorage.removeItem(`wordGoal_${note.id}`)
      } else {
        localStorage.setItem(`wordGoal_${note.id}`, goal.toString())
      }
    }
    setShowWordGoalInput(false)
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Handle "+" key to open content blocks menu (for rich text notes only)
      if (event.key === '+' && noteType === 'rich-text' && !isSaving && !isDeleting) {
        event.preventDefault()
        openContentBlocksMenu()
        return
      }

      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()

      if (key === 's') {
        event.preventDefault()
        if (hasChanges && !isSaving) {
          handleSave()
        }
        return
      }

      if (key === 'enter') {
        event.preventDefault()
        if (!isSaving) {
          handleSave()
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, hasChanges, isSaving, noteType, isDeleting, openContentBlocksMenu])

  // Listen for selection changes to update active format states
  useEffect(() => {
    const handleSelectionChange = () => {
      scheduleActiveFormatsUpdate()
      updateFloatingToolbar()
      
      // Track selected text for AI assistant (debounced to avoid excessive updates)
      if (noteType === 'rich-text' && editorRef.current) {
        // Clear any pending update
        if (selectedTextUpdateTimeoutRef.current !== null) {
          window.clearTimeout(selectedTextUpdateTimeoutRef.current)
        }
        
        const editorElement = editorRef.current.getRootElement()
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0 && editorElement) {
          const range = selection.getRangeAt(0)
          // Only capture selection if it's within the editor
          if (editorElement.contains(range.commonAncestorContainer)) {
            const text = selection.toString().trim()
            if (text !== selectedTextRef.current) {
              selectedTextRef.current = text
              // Debounce the state update by 150ms to avoid rapid re-renders during drag selection
              selectedTextUpdateTimeoutRef.current = window.setTimeout(() => {
                setSelectedText(text)
                selectedTextUpdateTimeoutRef.current = null
              }, 150)
            }
          } else if (selectedTextRef.current !== '') {
            selectedTextRef.current = ''
            setSelectedText('')
          }
        } else if (selectedTextRef.current !== '') {
          selectedTextRef.current = ''
          setSelectedText('')
        }
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      // Clean up pending timeout on unmount
      if (selectedTextUpdateTimeoutRef.current !== null) {
        window.clearTimeout(selectedTextUpdateTimeoutRef.current)
      }
    }
  }, [scheduleActiveFormatsUpdate, updateFloatingToolbar, noteType])

  useEffect(() => {
    const handleWindowChange = () => updateFloatingToolbar()

    window.addEventListener('scroll', handleWindowChange, true)
    window.addEventListener('resize', handleWindowChange)
    return () => {
      window.removeEventListener('scroll', handleWindowChange, true)
      window.removeEventListener('resize', handleWindowChange)
    }
  }, [updateFloatingToolbar])

  useLayoutEffect(() => {
    if (!floatingToolbar.visible || !floatingToolbarRef.current) {
      return
    }

    const { offsetWidth, offsetHeight } = floatingToolbarRef.current
    const previous = floatingToolbarSizeRef.current
    if (
      Math.abs(previous.width - offsetWidth) > 0.5 ||
      Math.abs(previous.height - offsetHeight) > 0.5
    ) {
      floatingToolbarSizeRef.current = { width: offsetWidth, height: offsetHeight }
      updateFloatingToolbar()
    }
  }, [floatingToolbar.visible, floatingToolbar.left, floatingToolbar.top, updateFloatingToolbar])

  useEffect(() => {
    if (isSaving || isDeleting) {
      hideFloatingToolbar()
    }
  }, [hideFloatingToolbar, isDeleting, isSaving])

  useEffect(() => {
    hideFloatingToolbar()
  }, [hideFloatingToolbar, note])

  useEffect(() => {
    if (showTOC) {
      scheduleHeadingsUpdate()
    }
  }, [showTOC, scheduleHeadingsUpdate])

  useEffect(() => {
    scheduleActiveFormatsUpdate()
  }, [note, scheduleActiveFormatsUpdate])

  // Update last save display every 10 seconds
  useEffect(() => {
    if (!lastSaveTime) return
    
    const interval = setInterval(() => {
      // Force re-render by updating a dummy state (the memo will recalculate)
      setLastSaveTime(new Date(lastSaveTime))
    }, 10000)
    
    return () => clearInterval(interval)
  }, [lastSaveTime])

  const stats = useMemo(() => {
    const words = plainContent ? plainContent.split(/\s+/).filter(Boolean).length : 0
    return { characters: plainContent.length, words }
  }, [plainContent])

  const wordGoalProgress = useMemo(() => {
    if (!wordGoal) return null
    const percentage = Math.min((stats.words / wordGoal) * 100, 100)
    const isComplete = stats.words >= wordGoal
    return { percentage, isComplete }
  }, [wordGoal, stats.words])

  const notesForConnections = useMemo(() => {
    if (allNotes && allNotes.length > 0) return allNotes
    return notes || []
  }, [allNotes, notes])

  const folderPathMap = useMemo(() => {
    const map = new Map<string, string>()

    const walk = (nodes: any[], path: string[] = []) => {
      for (const node of nodes) {
        const nextPath = [...path, node.name]
        map.set(node.id, nextPath.join(' / '))
        if (Array.isArray(node.children) && node.children.length > 0) {
          walk(node.children, nextPath)
        }
      }
    }

    walk(folders || [])
    return map
  }, [folders])

  const connectionData = useMemo(() => {
    if (!note?.id) {
      return {
        backlinks: [] as Array<{ id: string; title: string; folderPath?: string; relationCount: number }>,
        connectionsCount: 0,
        outgoingLinks: [] as Array<{ id: string; title: string; folderPath?: string }>,
      }
    }

    const currentLinks = noteType === 'rich-text'
      ? extractNoteLinkIdsFromHtml(content)
      : extractNoteLinkIdsFromHtml(note.content || '')
    const outgoingIds = new Set(currentLinks.filter((id) => id !== note.id))

    const backlinks = notesForConnections
      .filter((candidate) => candidate.id !== note.id && candidate.note_type === 'rich-text')
      .map((candidate) => {
        const links = extractNoteLinkIdsFromHtml(candidate.content)
        const relationCount = links.filter((id) => id === note.id).length
        if (relationCount <= 0) return null

        return {
          id: candidate.id,
          title: candidate.title || 'Untitled note',
          folderPath: candidate.folder_id ? folderPathMap.get(candidate.folder_id) : 'All Notes',
          relationCount,
        }
      })
      .filter((item): item is { id: string; title: string; folderPath: string | undefined; relationCount: number } => !!item)
      .sort((a, b) => b.relationCount - a.relationCount || a.title.localeCompare(b.title))

    const allConnectionIds = new Set<string>(outgoingIds)
    backlinks.forEach((item) => allConnectionIds.add(item.id))

    // Build outgoingLinks array
    const outgoingLinks = notesForConnections
      .filter((candidate) => outgoingIds.has(candidate.id))
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.title || 'Untitled note',
        folderPath: candidate.folder_id ? folderPathMap.get(candidate.folder_id) : 'All Notes',
      }))

    return {
      backlinks,
      connectionsCount: allConnectionIds.size,
      outgoingLinks,
    }
  }, [note?.id, note?.content, noteType, content, notesForConnections, folderPathMap])

  // Get folder path for display
  const folderPath = useMemo(() => {
    if (!note?.folder_id) return 'All Notes'
    
    const findFolderPath = (folderId: string, nodes: any[], path: string[] = []): string[] | null => {
      for (const node of nodes) {
        if (node.id === folderId) {
          return [...path, node.name]
        }
        if (node.children && node.children.length > 0) {
          const result = findFolderPath(folderId, node.children, [...path, node.name])
          if (result) return result
        }
      }
      return null
    }
    
    const path = findFolderPath(note.folder_id, folders)
    return path ? path.join(' / ') : 'All Notes'
  }, [note?.folder_id, folders])

  // Get project name for display
  const projectInfo = useMemo(() => {
    if (!note?.project_id) return null
    const project = projects.find(p => p.id === note.project_id)
    return project ? { name: project.name, color: project.color } : null
  }, [note?.project_id, projects])

  // Format last save time
  const lastSaveDisplay = useMemo(() => {
    if (!lastSaveTime) return null
    
    const now = new Date()
    const diffMs = now.getTime() - lastSaveTime.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    
    if (diffSecs < 10) return 'Just now'
    if (diffSecs < 60) return `${diffSecs}s ago`
    
    const diffMins = Math.floor(diffSecs / 60)
    if (diffMins < 60) return `${diffMins}m ago`
    
    const diffHours = Math.floor(diffMins / 60)
    return `${diffHours}h ago`
  }, [lastSaveTime])

  const downloadBlobFile = useCallback((fileName: string, blob: Blob) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, [])

  const downloadTextFile = useCallback((fileName: string, body: string, mimeType: string) => {
    const blob = new Blob([body], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, [])

  const getStructuredExportContent = useCallback(() => {
    if (noteType === 'drawing') {
      return JSON.stringify(drawingData || { pages: [], width: 800, height: 600, currentPage: 0 }, null, 2)
    }
    if (noteType === 'mindmap') {
      return JSON.stringify(mindmapData || {}, null, 2)
    }
    if (noteType === 'bullet-journal') {
      return JSON.stringify(bulletJournalData || { entries: [] }, null, 2)
    }
    if (noteType === 'data-sheet') {
      return JSON.stringify(dataSheetData || { rows: [] }, null, 2)
    }
    if (noteType === 'pdf-annotation') {
      return JSON.stringify(pdfAnnotationData || {}, null, 2)
    }
    return content
  }, [noteType, drawingData, mindmapData, bulletJournalData, dataSheetData, pdfAnnotationData, content])

  const serializeCurrentNoteContent = useCallback(() => {
    if (noteType === 'drawing') {
      return JSON.stringify(drawingData)
    }
    if (noteType === 'mindmap') {
      return JSON.stringify(mindmapData)
    }
    if (noteType === 'bullet-journal') {
      return JSON.stringify(bulletJournalData)
    }
    if (noteType === 'data-sheet') {
      return JSON.stringify(dataSheetData)
    }
    if (noteType === 'pdf-annotation') {
      return JSON.stringify(pdfAnnotationData)
    }
    return content
  }, [bulletJournalData, content, dataSheetData, drawingData, mindmapData, noteType, pdfAnnotationData])

  const buildShareMetadata = useCallback(async (serializedContent: string, type: NoteType): Promise<NoteShareMetadata | null> => {
    if (type !== 'pdf-annotation') {
      return null
    }

    const pdfData = safeParsePdfAnnotationData(serializedContent)
    if (!pdfData?.pdfStoragePath) {
      return null
    }

    try {
      const pdfUrl = await getFileSignedUrl(pdfData.pdfStoragePath, 60 * 60 * 24 * 30)
      return {
        pdfUrl,
        pdfStoragePath: pdfData.pdfStoragePath,
      }
    } catch (error) {
      console.error('Failed to create signed PDF URL for share:', error)
      return {
        pdfStoragePath: pdfData.pdfStoragePath,
      }
    }
  }, [])

  const shareUrl = useMemo(() => {
    if (!shareRecord) return null
    return buildPublicShareUrl(shareRecord.share_token)
  }, [shareRecord])

  const sharePublishedDisplay = useMemo(() => {
    if (!shareRecord?.published_at) return null
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(shareRecord.published_at))
  }, [shareRecord?.published_at])

  const shareHint = useMemo(() => {
    if (!note?.id) {
      return 'Save this note once before publishing it.'
    }

    if (!process.env.NEXT_PUBLIC_SHARE_BASE_URL && typeof window !== 'undefined') {
      const protocol = window.location.protocol
      if (protocol === 'tauri:' || protocol === 'file:') {
        return 'Set NEXT_PUBLIC_SHARE_BASE_URL to your public web app URL so copied links work outside the desktop app.'
      }
    }

    return 'Publishing creates a read-only page for anyone with the link.'
  }, [note?.id])

  const handleExportMarkdown = useCallback(() => {
    const fileBase = sanitizePathSegment(title || note?.title || '', 'untitled-note')

    if (noteType === 'rich-text') {
      const markdown = editorRef.current?.getMarkdown() || htmlToMarkdown(content)
      downloadTextFile(`${fileBase}.md`, markdown, 'text/markdown;charset=utf-8')
      toast.push({ title: 'Markdown exported' })
      return
    }

    const structured = getStructuredExportContent()
    const markdown = `# ${title || note?.title || 'Untitled note'}\n\nType: ${noteType}\n\n\`\`\`json\n${structured}\n\`\`\`\n`
    downloadTextFile(`${fileBase}.md`, markdown, 'text/markdown;charset=utf-8')
    toast.push({ title: 'Markdown exported' })
  }, [title, note?.title, noteType, content, getStructuredExportContent, downloadTextFile, toast])

  const handleExportDocx = useCallback(async () => {
    const fileBase = sanitizePathSegment(title || note?.title || '', 'untitled-note')
    const docTitle = title || note?.title || 'Untitled note'

    if (noteType !== 'rich-text') {
      toast.push({ title: 'DOCX export only supported for Rich Text notes' })
      return
    }

    try {
      toast.push({ title: 'Generating DOCX…' })

      let bodyHtml = editorRef.current?.getHTML() || content

      // Convert checklist checkboxes to visual representation for Word
      bodyHtml = bodyHtml
        .replace(/<input[^>]*type="checkbox"[^>]*checked[^>]*>/gi, '☑ ')
        .replace(/<input[^>]*type="checkbox"[^>]*>/gi, '☐ ')

      // Wrap images in paragraph tags if they're bare
      bodyHtml = bodyHtml.replace(
        /<img([^>]*)>/gi,
        '<p><img$1 style="max-width:100%;height:auto;"></p>'
      )

      const now = new Date()
      const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 1in; }
    body, p, h1, h2, h3, h4, h5, h6, ul, ol, li, table, th, td, blockquote, div {
      font-family: Calibri, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    body { font-size: 11pt; line-height: 1.6; color: #1a1a1a; }
    h1 { font-size: 26pt; font-weight: bold; margin-top: 0pt; margin-bottom: 6pt; color: #1a1a1a; }
    h2 { font-size: 20pt; font-weight: bold; margin-top: 18pt; margin-bottom: 8pt; color: #2c2c2c; }
    h3 { font-size: 15pt; font-weight: bold; margin-top: 16pt; margin-bottom: 6pt; color: #2c2c2c; }
    h4 { font-size: 13pt; font-weight: bold; margin-top: 14pt; margin-bottom: 6pt; }
    h5 { font-size: 12pt; font-weight: bold; margin-top: 12pt; margin-bottom: 4pt; }
    h6 { font-size: 11pt; font-weight: bold; margin-top: 10pt; margin-bottom: 4pt; color: #555; }
    p { margin-top: 0; margin-bottom: 8pt; }
    table { border-collapse: collapse; width: 100%; margin-top: 8pt; margin-bottom: 12pt; }
    th { border: 1px solid #999; padding: 6pt 8pt; background-color: #f2f2f2; font-weight: bold; text-align: left; }
    td { border: 1px solid #bbb; padding: 6pt 8pt; vertical-align: top; }
    tr:nth-child(even) td { background-color: #fafafa; }
    blockquote {
      margin: 10pt 0;
      padding: 8pt 14pt;
      border-left: 4px solid #94a3b8;
      color: #4b5563;
      font-style: italic;
      background-color: #f8fafc;
    }
    pre {
      font-family: "Courier New", Consolas, monospace;
      background-color: #f4f4f5;
      padding: 10pt 12pt;
      border: 1px solid #d4d4d8;
      border-radius: 4pt;
      font-size: 9.5pt;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
    }
    code {
      font-family: "Courier New", Consolas, monospace;
      background-color: #f4f4f5;
      padding: 1pt 3pt;
      border-radius: 2pt;
      font-size: 9.5pt;
    }
    ul, ol { margin-top: 4pt; margin-bottom: 8pt; padding-left: 24pt; }
    li { margin-bottom: 3pt; }
    hr { border: none; border-top: 1px solid #d1d5db; margin: 16pt 0; }
    a { color: #2563eb; text-decoration: underline; }
    img { max-width: 100%; height: auto; }
    mark { background-color: #fef08a; padding: 1pt 2pt; }
    s, del, strike { text-decoration: line-through; color: #888; }
    .doc-title { font-size: 28pt; font-weight: bold; margin-bottom: 4pt; color: #111; }
    .doc-meta { font-size: 10pt; color: #666; margin-bottom: 24pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 12pt; }
  </style>
</head>
<body>
  <div class="doc-title">${escapeHtml(docTitle)}</div>
  <div class="doc-meta">${escapeHtml(dateStr)}</div>
  ${bodyHtml}
</body>
</html>`
      
      const { asBlob } = await import('html-docx-js-typescript')
      const blob = await asBlob(htmlContent, { 
        margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } 
      }) as Blob
      
      downloadBlobFile(`${fileBase}.docx`, blob)
      toast.push({ title: 'DOCX exported' })
    } catch (error) {
      console.error('Export docx error:', error)
      toast.push({ title: 'Failed to export DOCX' })
    }
  }, [title, note?.title, noteType, content, downloadBlobFile, toast])

  const handleExportHtml = useCallback(() => {
    const fileBase = sanitizePathSegment(title || note?.title || '', 'untitled-note')
    const docTitle = escapeHtml(title || note?.title || 'Untitled note')
    const bodyHtml = noteType === 'rich-text'
      ? (editorRef.current?.getHTML() || content)
      : `<pre>${escapeHtml(getStructuredExportContent())}</pre>`

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${docTitle}</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 780px;
      margin: 0 auto;
      padding: 40px 24px;
      line-height: 1.65;
      color: #1a1a1a;
      background: #fff;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #1a1a2e; color: #e2e8f0; }
      pre, code { background: #2d2d44; border-color: #3d3d55; }
      td, th { border-color: #3d3d55; }
      th { background: #2d2d44; }
      blockquote { border-color: #4a5568; color: #94a3b8; background: #2d2d44; }
      a { color: #60a5fa; }
      hr { border-color: #3d3d55; }
    }
    h1 { font-size: 2em; margin: 0 0 0.2em; font-weight: 700; }
    h2 { font-size: 1.5em; margin-top: 1.5em; }
    h3 { font-size: 1.25em; margin-top: 1.3em; }
    p { margin: 0 0 1em; }
    a { color: #2563eb; }
    img { max-width: 100%; height: auto; border-radius: 6px; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    pre { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px; overflow-x: auto; font-size: 0.9em; }
    code { font-family: "SF Mono", Consolas, "Liberation Mono", Menlo, monospace; background: #f1f5f9; padding: 2px 5px; border-radius: 3px; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    blockquote { margin: 1em 0; padding: 10px 16px; border-left: 4px solid #cbd5e1; color: #4b5563; font-style: italic; background: #f8fafc; border-radius: 0 6px 6px 0; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
    ul, ol { padding-left: 1.5em; }
    li { margin-bottom: 0.3em; }
    mark { background: #fef08a; padding: 2px 4px; border-radius: 2px; }
    .meta { font-size: 0.85em; color: #6b7280; margin-bottom: 2em; padding-bottom: 1em; border-bottom: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <h1>${docTitle}</h1>
  <div class="meta">Exported on ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
  ${bodyHtml}
</body>
</html>`

    downloadTextFile(`${fileBase}.html`, htmlContent, 'text/html;charset=utf-8')
    toast.push({ title: 'HTML exported' })
  }, [title, note?.title, noteType, content, getStructuredExportContent, downloadTextFile, toast])

  const handleExportPlainText = useCallback(() => {
    const fileBase = sanitizePathSegment(title || note?.title || '', 'untitled-note')
    const docTitle = title || note?.title || 'Untitled note'

    let plainText: string
    if (noteType === 'rich-text') {
      const html = editorRef.current?.getHTML() || content
      // Parse HTML and extract text with basic formatting
      const div = document.createElement('div')
      div.innerHTML = html

      const extractText = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
        if (node.nodeType !== Node.ELEMENT_NODE) return ''

        const el = node as HTMLElement
        const tag = el.tagName.toLowerCase()
        const children = Array.from(el.childNodes).map(extractText).join('')

        switch (tag) {
          case 'h1': return `${children.trim()}\n${'='.repeat(Math.min(children.trim().length, 60))}\n\n`
          case 'h2': return `${children.trim()}\n${'-'.repeat(Math.min(children.trim().length, 60))}\n\n`
          case 'h3': case 'h4': case 'h5': case 'h6':
            return `${children.trim()}\n\n`
          case 'p': return `${children}\n\n`
          case 'br': return '\n'
          case 'li': {
            const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null
            if (checkbox) {
              const checked = checkbox.checked || checkbox.getAttribute('data-checked') === 'true'
              return `  ${checked ? '[x]' : '[ ]'} ${children.trim()}\n`
            }
            return `  • ${children.trim()}\n`
          }
          case 'ul': case 'ol': return `${children}\n`
          case 'blockquote': return children.trim().split('\n').map(l => `  | ${l}`).join('\n') + '\n\n'
          case 'pre': return `---\n${children.trim()}\n---\n\n`
          case 'hr': return '\n' + '─'.repeat(40) + '\n\n'
          case 'table': {
            const rows = Array.from(el.querySelectorAll('tr'))
            const data = rows.map(r =>
              Array.from(r.querySelectorAll('th, td')).map(c => (c.textContent || '').trim())
            )
            if (data.length === 0) return ''
            const colWidths = data[0].map((_, ci) =>
              Math.max(...data.map(row => (row[ci] || '').length), 3)
            )
            return data.map((row, ri) => {
              const line = row.map((cell, ci) => cell.padEnd(colWidths[ci])).join('  |  ')
              if (ri === 0) {
                return line + '\n' + colWidths.map(w => '-'.repeat(w)).join('--+--')
              }
              return line
            }).join('\n') + '\n\n'
          }
          default: return children
        }
      }

      plainText = `${docTitle}\n${'='.repeat(docTitle.length)}\n\n${extractText(div).replace(/\n{3,}/g, '\n\n').trim()}\n`
    } else {
      plainText = `${docTitle}\n\n${getStructuredExportContent()}`
    }

    downloadTextFile(`${fileBase}.txt`, plainText, 'text/plain;charset=utf-8')
    toast.push({ title: 'Plain text exported' })
  }, [title, note?.title, noteType, content, getStructuredExportContent, downloadTextFile, toast])

  const handleImportDocx = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.docx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const arrayBuffer = await file.arrayBuffer()
        const mammoth = (await import('mammoth')).default
        
        // Map common Word styles to HTML tags for better RichTextEditor compatibility
        const options = {
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Subtitle'] => h2:fresh",
            "p[style-name='Quote'] => blockquote:fresh",
            "p[style-name='Intense Quote'] => blockquote:fresh",
            "p[style-name='Code'] => pre:fresh",
            "r[style-name='Strong'] => strong",
            "r[style-name='Emphasis'] => em",
            "r[style-name='Strike'] => s",
            "r[style-name='Code'] => code"
          ]
        }
        
        const result = await mammoth.convertToHtml({ arrayBuffer }, options)
        const DOMPurify = (await import('dompurify')).default
        
        // mammoth usually returns paragraphs, we need to clean them gently
        let plainHtml = result.value.replace(/<p><\/p>/g, '')
        
        const allowedTags = [
          'b', 'i', 'em', 'strong', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
          'ul', 'ol', 'li', 'br', 'img', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 
          'hr', 'code', 'pre', 's', 'strike', 'blockquote', 'sub', 'sup'
        ]
        const allowedAttributes = ['href', 'target', 'src', 'alt', 'title']
        
        let cleanHtml = ''
        if (typeof window !== 'undefined' && typeof DOMPurify.sanitize === 'function') {
           cleanHtml = DOMPurify.sanitize(plainHtml, {
             ALLOWED_TAGS: allowedTags,
             ALLOWED_ATTR: allowedAttributes
           })
        } else {
           cleanHtml = plainHtml
        }
        
        // Set content
        if (content.trim() === '' || content === '<p></p>') {
            handleContentChange(cleanHtml)
        } else {
            handleContentChange(content + '<hr>' + cleanHtml)
        }
        
        if (editorRef.current) {
             editorRef.current.focus()
             // wait for render then scroll
             setTimeout(() => {
                 editorRef.current?.focus()
             }, 100)
        }
        
        toast.push({ title: 'DOCX imported' })
      } catch (error) {
        console.error('Import docx error:', error)
        toast.push({ title: 'Failed to import DOCX' })
      }
    }
    input.click()
  }, [content, handleContentChange, toast])

  const handleExportPdf = useCallback(async () => {
    const fileBase = sanitizePathSegment(title || note?.title || '', 'untitled-note')
    const printableTitle = title || note?.title || 'Untitled note'
    const bodyHtml = noteType === 'rich-text'
      ? (editorRef.current?.getHTML() || content)
      : `<pre>${escapeHtml(getStructuredExportContent())}</pre>`

    try {
      toast.push({ title: 'Generating PDF…' })

      // Create an off-screen container for rendering
      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;padding:40px;background:white;color:#111827;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.6;'
      container.innerHTML = `<h1 style="margin:0 0 20px;font-size:24px;font-weight:700;">${escapeHtml(printableTitle)}</h1>${bodyHtml}`

      // Force light theme styles for rendering
      container.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement
        htmlEl.style.colorScheme = 'light'
      })

      // Style tables, code blocks, blockquotes for PDF
      container.querySelectorAll('table').forEach(t => {
        const table = t as HTMLElement
        table.style.borderCollapse = 'collapse'
        table.style.width = '100%'
        table.style.marginBottom = '12px'
      })
      container.querySelectorAll('td, th').forEach(c => {
        const cell = c as HTMLElement
        cell.style.border = '1px solid #e5e7eb'
        cell.style.padding = '6px 8px'
        cell.style.verticalAlign = 'top'
      })
      container.querySelectorAll('pre').forEach(p => {
        const pre = p as HTMLElement
        pre.style.background = '#f8fafc'
        pre.style.border = '1px solid #e5e7eb'
        pre.style.borderRadius = '6px'
        pre.style.padding = '12px'
        pre.style.whiteSpace = 'pre-wrap'
        pre.style.wordBreak = 'break-word'
        pre.style.fontFamily = 'monospace'
        pre.style.fontSize = '12px'
      })
      container.querySelectorAll('blockquote').forEach(bq => {
        const el = bq as HTMLElement
        el.style.borderLeft = '4px solid #cbd5e1'
        el.style.paddingLeft = '14px'
        el.style.margin = '12px 0'
        el.style.color = '#4b5563'
        el.style.fontStyle = 'italic'
      })
      container.querySelectorAll('img').forEach(img => {
        const imgEl = img as HTMLImageElement
        imgEl.style.maxWidth = '100%'
        imgEl.style.height = 'auto'
      })
      container.querySelectorAll('code').forEach(c => {
        const el = c as HTMLElement
        if (el.parentElement?.tagName !== 'PRE') {
          el.style.background = '#f1f5f9'
          el.style.padding = '2px 5px'
          el.style.borderRadius = '3px'
          el.style.fontFamily = 'monospace'
          el.style.fontSize = '0.9em'
        }
      })
      container.querySelectorAll('a').forEach(a => {
        const el = a as HTMLElement
        el.style.color = '#2563eb'
        el.style.textDecoration = 'underline'
      })

      document.body.appendChild(container)

      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      })

      document.body.removeChild(container)

      // A4 dimensions in mm
      const pageWidth = 210
      const pageHeight = 297
      const margin = 15
      const contentWidth = pageWidth - margin * 2
      const contentHeight = pageHeight - margin * 2

      const imgWidth = contentWidth
      const imgHeight = (canvas.height * contentWidth) / canvas.width

      const pdf = new jsPDF('p', 'mm', 'a4')

      // Multi-page support
      let remainingHeight = imgHeight
      let srcY = 0
      let pageIndex = 0

      while (remainingHeight > 0) {
        if (pageIndex > 0) pdf.addPage()

        const sliceHeight = Math.min(contentHeight, remainingHeight)
        const srcSliceHeight = (sliceHeight / imgHeight) * canvas.height

        // Create a slice canvas for this page
        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = canvas.width
        sliceCanvas.height = srcSliceHeight
        const ctx = sliceCanvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
          ctx.drawImage(canvas, 0, srcY, canvas.width, srcSliceHeight, 0, 0, canvas.width, srcSliceHeight)
        }

        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95)
        pdf.addImage(sliceData, 'JPEG', margin, margin, imgWidth, sliceHeight)

        srcY += srcSliceHeight
        remainingHeight -= contentHeight
        pageIndex++
      }

      // Add page numbers
      const totalPages = pdf.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i)
        pdf.setFontSize(9)
        pdf.setTextColor(150)
        pdf.text(`${i} / ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' })
      }

      pdf.save(`${fileBase}.pdf`)
      toast.push({ title: 'PDF exported' })
    } catch (error) {
      console.error('Export PDF error:', error)
      // Fallback to print dialog
      const htmlContent = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(printableTitle)}</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; color: #111827; }
      h1 { margin: 0 0 20px; font-size: 24px; }
      pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #e5e7eb; padding: 6px; vertical-align: top; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(printableTitle)}</h1>
    ${bodyHtml}
  </body>
</html>`

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
      const blobUrl = URL.createObjectURL(blob)
      const printWindow = window.open(blobUrl, '_blank', 'width=980,height=1200')
      if (printWindow) {
        printWindow.onload = () => {
          URL.revokeObjectURL(blobUrl)
          printWindow.focus()
          printWindow.print()
        }
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
        toast.push({ title: 'Print dialog opened (fallback)', description: 'Choose "Save as PDF" to export.' })
      } else {
        URL.revokeObjectURL(blobUrl)
        toast.push({ title: 'Could not export PDF' })
      }
    }
  }, [title, note?.title, noteType, content, getStructuredExportContent, toast])

  const handleCopyShareLink = useCallback(async () => {
    if (!shareUrl) return

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = shareUrl
        textArea.setAttribute('readonly', 'true')
        textArea.style.position = 'absolute'
        textArea.style.left = '-9999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }

      toast.push({ title: 'Share link copied' })
    } catch (error) {
      console.error('Failed to copy share link:', error)
      toast.push({ title: 'Copy failed', description: 'The share link could not be copied.' })
    }
  }, [shareUrl, toast])

  const handleOpenSharePage = useCallback(() => {
    if (!shareUrl) return
    window.open(shareUrl, '_blank', 'noopener,noreferrer')
  }, [shareUrl])

  const handlePublishShare = useCallback(async () => {
    if (!note?.id) {
      toast.push({ title: 'Save required', description: 'Save the note before publishing it.' })
      return
    }

    setIsPublishingShare(true)

    try {
      if (hasChanges) {
        await handleSave()
      }

      const latestNote = await getNote(note.id)
      if (!latestNote) {
        throw new Error('Could not load the saved note for publishing.')
      }

      const metadata = await buildShareMetadata(latestNote.content, latestNote.note_type)
      const publishedShare = await publishNoteShare(latestNote.id, {
        title: latestNote.title,
        content: latestNote.content,
        note_type: latestNote.note_type,
        metadata,
      })

      setShareRecord(publishedShare)
      toast.push({
        title: shareRecord ? 'Share updated' : 'Note published',
        description: 'The read-only share page is ready.',
      })
    } catch (error: any) {
      console.error('Failed to publish note share:', error)
      toast.push({
        title: 'Publish failed',
        description: error?.message || 'The share page could not be published.',
      })
    } finally {
      setIsPublishingShare(false)
    }
  }, [buildShareMetadata, handleSave, hasChanges, note?.id, shareRecord, toast])

  const handleUnpublishShare = useCallback(async () => {
    if (!note?.id) return

    setIsUnpublishingShare(true)

    try {
      await unpublishNoteShare(note.id)
      setShareRecord(null)
      toast.push({ title: 'Share removed', description: 'The public share page is no longer available.' })
    } catch (error: any) {
      console.error('Failed to unpublish note share:', error)
      toast.push({
        title: 'Unpublish failed',
        description: error?.message || 'The share page could not be removed.',
      })
    } finally {
      setIsUnpublishingShare(false)
    }
  }, [note?.id, toast])

  const handleSelectBacklink = useCallback(async (noteId: string) => {
    const targetNote = notesForConnections.find((item) => item.id === noteId)
    if (targetNote) {
      onSelectNote(targetNote)
      return
    }

    try {
      const { getNote } = await import('../lib/notes')
      const fetchedNote = await getNote(noteId)
      if (fetchedNote) {
        onSelectNote(fetchedNote)
      } else {
        toast.push({ title: 'Note not found', description: 'The related note could not be found.' })
      }
    } catch (error) {
      console.error('Failed to load related note:', error)
      toast.push({ title: 'Error loading note', description: 'Failed to open the related note.' })
    }
  }, [notesForConnections, onSelectNote, toast])

  const handleSelectOutgoing = useCallback(async (noteId: string) => {
    const targetNote = notesForConnections.find((item) => item.id === noteId)
    if (targetNote) {
      onSelectNote(targetNote)
      return
    }

    try {
      const { getNote } = await import('../lib/notes')
      const fetchedNote = await getNote(noteId)
      if (fetchedNote) {
        onSelectNote(fetchedNote)
      } else {
        toast.push({ title: 'Note not found', description: 'The linked note could not be found.' })
      }
    } catch (error) {
      console.error('Failed to load linked note:', error)
      toast.push({ title: 'Error loading note', description: 'Failed to open the linked note.' })
    }
  }, [notesForConnections, onSelectNote, toast])



  // AI Assistant handlers
  // Build a readable plain-text representation of the current note for the AI,
  // based on note type (rich-text, mindmap, bullet-journal, data-sheet, etc.)
  const aiNoteContent = useMemo(() => {
    if (noteType === 'rich-text') return content
    if (noteType === 'mindmap' && mindmapData) {
      return extractMindmapForAI(mindmapData.nodes, mindmapData.rootId)
    }
    if (noteType === 'bullet-journal' && bulletJournalData) {
      return extractBulletJournalForAI(bulletJournalData.entries)
    }
    if (noteType === 'data-sheet' && dataSheetData) {
      return extractDataSheetForAI(dataSheetData.columns, dataSheetData.rows)
    }
    if (noteType === 'drawing') return '[This note contains a drawing — no text content is available for AI]'
    if (noteType === 'pdf-annotation') {
      if (pdfExtractedText) return `[PDF document — extracted text below]\n\n${pdfExtractedText}`
      return '[This note contains a PDF — text is still being extracted or the PDF has no selectable text]'
    }
    return content
  }, [noteType, content, mindmapData, bulletJournalData, dataSheetData, pdfExtractedText])

  const handleAICreateMindmapNote = useCallback(async (input: {
    sourceText: string
    sourceTitle?: string
    sourceType: 'selection' | 'current-note'
    targetTitle?: string
    additionalPrompt?: string
  }) => {
    const sourceText = input.sourceText?.trim()
    if (!sourceText) {
      toast.push({ title: 'No text available', description: 'Select text or open a text note first.' })
      return
    }

    const baseTitle =
      input.targetTitle?.trim() ||
      input.sourceTitle?.trim() ||
      note?.title?.trim() ||
      'Untitled'
    const finalTitle = `${baseTitle.slice(0, 80)} Mindmap`

    const rootHint = baseTitle.slice(0, 80) || 'Central Idea'
    let mindmapDataForNote: MindmapData
    let usedAI = true

    try {
      const outline = await generateMindmapOutline(sourceText, rootHint, input.additionalPrompt)
      mindmapDataForNote = buildMindmapDataFromOutline(outline, rootHint)
    } catch (error) {
      console.warn('AI mindmap generation failed, falling back to text outline conversion:', error)
      usedAI = false
      mindmapDataForNote = buildFallbackMindmapDataFromText(sourceText, rootHint)
    }

    try {
      const created = await createNote({
        title: finalTitle,
        content: JSON.stringify(mindmapDataForNote),
        folder_id: note?.folder_id ?? selectedFolderId ?? null,
        project_id: note?.project_id ?? null,
        note_type: 'mindmap',
      })

      toast.push({
        title: 'Mindmap note created',
        description: usedAI
          ? input.sourceType === 'selection'
            ? 'AI generated from selected text.'
            : 'AI generated from current note content.'
          : input.sourceType === 'selection'
            ? 'Built from selected text (fallback mode).'
            : 'Built from current note content (fallback mode).',
      })

      setShowAIAssistant(false)
      onSelectNote(created)
    } catch (error) {
      console.error('Failed to create mindmap note from AI action:', error)
      toast.push({ title: 'Creation failed', description: 'Could not create the mindmap note.' })
    }
  }, [note?.title, note?.folder_id, note?.project_id, selectedFolderId, onSelectNote, toast])

  const handleAIInsertText = useCallback((text: string) => {
    if (noteType === 'rich-text' && editorRef.current) {
      // Insert the HTML at the end of the current content
      const currentHtml = editorRef.current.getHTML()
      const newContent = currentHtml + text
      handleContentChange(newContent)
      toast.push({ title: 'Content inserted' })
    }
  }, [noteType, handleContentChange, toast])

  const handleAIReplaceText = useCallback((text: string) => {
    if (noteType === 'rich-text') {
      handleContentChange(text)
      toast.push({ title: 'Content replaced' })
    }
  }, [noteType, handleContentChange, toast])
  
  // Replace selected text with AI-generated text
  const handleAIReplaceSelection = useCallback((text: string) => {
    if (noteType === 'rich-text' && editorRef.current) {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const editorElement = editorRef.current.getRootElement()
        
        if (editorElement && editorElement.contains(range.commonAncestorContainer)) {
          // Delete the selected content and insert new text
          range.deleteContents()
          
          // Create a text node with the new content
          // If the text contains HTML-like formatting, sanitize and insert as HTML
          if (text.includes('<') && text.includes('>')) {
            // Sanitize HTML to prevent XSS
            const sanitizedHtml = DOMPurify.sanitize(text, {
              ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre'],
              ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
            })
            const fragment = range.createContextualFragment(sanitizedHtml)
            range.insertNode(fragment)
          } else {
            const textNode = document.createTextNode(text)
            range.insertNode(textNode)
          }
          
          // Collapse selection to end
          selection.collapseToEnd()
          
          // Update content state
          const newContent = editorRef.current.getHTML()
          handleContentChange(newContent)
          setHasChanges(true)
          toast.push({ title: 'Selection replaced' })
        }
      }
    }
  }, [noteType, handleContentChange, toast])
  
  // Insert text at current cursor position
  const handleAIInsertAtCursor = useCallback((text: string) => {
    if (noteType === 'rich-text' && editorRef.current) {
      editorRef.current.focus()
      
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const editorElement = editorRef.current.getRootElement()
        
        if (editorElement && editorElement.contains(range.commonAncestorContainer)) {
          // Insert at cursor position
          if (text.includes('<') && text.includes('>')) {
            // Sanitize HTML to prevent XSS
            const sanitizedHtml = DOMPurify.sanitize(text, {
              ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre'],
              ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
            })
            const fragment = range.createContextualFragment(sanitizedHtml)
            range.insertNode(fragment)
          } else {
            const textNode = document.createTextNode(text)
            range.insertNode(textNode)
          }
          
          // Move cursor to end of inserted text
          selection.collapseToEnd()
          
          // Update content state
          const newContent = editorRef.current.getHTML()
          handleContentChange(newContent)
          setHasChanges(true)
          toast.push({ title: 'Content inserted at cursor' })
        }
      } else {
        // No cursor position, append to end
        handleAIInsertText(text)
      }
    }
  }, [noteType, handleContentChange, toast, handleAIInsertText])

  const handleAIAddMindmapNode = useCallback((nodeText: string, description?: string) => {
    if (noteType === 'mindmap' && mindmapEditorRef.current) {
      // Get current data and add a new node
      const currentData = mindmapEditorRef.current.getData()
      const rootNode = currentData.nodes[currentData.rootId]
      
      const newNodeId = `node-${Date.now()}`
      const childCount = rootNode.children.length
      const angle = (Math.PI * 2 * childCount) / Math.max(childCount + 1, 4)
      const distance = 150
      const newX = rootNode.x + Math.cos(angle) * distance
      const newY = rootNode.y + Math.sin(angle) * distance
      
      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']
      const colorIndex = childCount % colors.length
      
      const newData = {
        ...currentData,
        nodes: {
          ...currentData.nodes,
          [currentData.rootId]: {
            ...rootNode,
            children: [...rootNode.children, newNodeId],
          },
          [newNodeId]: {
            id: newNodeId,
            text: nodeText,
            x: newX,
            y: newY,
            parentId: currentData.rootId,
            children: [],
            collapsed: false,
            color: colors[colorIndex],
            description: description || '',
            attachments: [],
          },
        },
      }
      
      mindmapEditorRef.current.setData(newData)
      setMindmapData(newData)
      setHasChanges(true)
      toast.push({ title: 'Node added to mindmap' })
    }
  }, [noteType, toast])

  const textNotesForMindmap = useMemo(
    () => (allNotes ?? []).filter((item) => item.note_type === 'rich-text'),
    [allNotes]
  )

  const handleCreateTextNoteFromMindmap = useCallback(
    async ({ title: sourceTitle, description }: { title: string; description: string }) => {
      const title = sourceTitle.trim() || 'Untitled Note'
      const descriptionHtml = description.trim()
        ? `<p>${escapeHtml(description).replace(/\n/g, '<br>')}</p>`
        : ''

      const created = await createNote({
        title,
        content: descriptionHtml,
        folder_id: note?.folder_id ?? selectedFolderId ?? null,
        project_id: note?.project_id ?? null,
        note_type: 'rich-text',
      })

      toast.push({ title: 'Text note created', description: `"${created.title || title}" linked to node.` })

      return {
        id: created.id,
        title: created.title || title,
        content: created.content || descriptionHtml,
      }
    },
    [note?.folder_id, note?.project_id, selectedFolderId, toast]
  )

  const handleOpenTextNoteFromMindmap = useCallback(
    async (noteId: string) => {
      const targetNote = (allNotes ?? []).find((item) => item.id === noteId)
      if (targetNote) {
        onSelectNote(targetNote)
        return
      }

      try {
        const fetched = await getNote(noteId)
        if (!fetched) {
          toast.push({ title: 'Note not found', description: 'The linked note could not be opened.' })
          return
        }
        onSelectNote(fetched)
      } catch {
        toast.push({ title: 'Open failed', description: 'Could not open linked note.' })
      }
    },
    [allNotes, onSelectNote, toast]
  )

  return (
    <>
      {/* Right Sidebar — Note Details */}
      {!isMobile && (
        <NoteDetailsSidebar
          noteId={note?.id}
          isNewNote={!note}
          noteType={noteType}
          title={title}
          onTitleChange={setTitle}
          onSave={() => handleSave()}
          onDelete={note && onDelete ? handleDelete : undefined}
          isSaving={isSaving || isAutosaving}
          isDeleting={isDeleting}
          hasChanges={hasChanges}
          lastSaveDisplay={lastSaveDisplay}
          folderPath={folderPath}
          projectInfo={projectInfo}
          stats={stats}
          headings={headings}
          onScrollToHeading={(headingId) => editorRef.current?.scrollToHeading(headingId)}
          wordGoal={wordGoal}
          wordGoalProgress={wordGoalProgress}
          onSetWordGoal={handleSetWordGoal}
          onOpenSettings={() => setShowSettings(true)}
          onOpenAIAssistant={() => setShowAIAssistant(true)}
          onExportMarkdown={handleExportMarkdown}
          onExportPdf={handleExportPdf}
          onExportDocx={handleExportDocx}
          onExportHtml={handleExportHtml}
          onExportPlainText={handleExportPlainText}
          onImportDocx={handleImportDocx}
          onOpenConnections={() => setShowKnowledgeGraph(true)}
          backlinks={connectionData.backlinks}
          connectionsCount={connectionData.connectionsCount}
          onSelectBacklink={handleSelectBacklink}
          outgoingLinks={connectionData.outgoingLinks}
          onSelectOutgoing={handleSelectOutgoing}
          shareUrl={shareUrl}
          shareHint={shareHint}
          sharePublishedDisplay={sharePublishedDisplay}
          onPublish={handlePublishShare}
          onUnpublish={shareRecord ? handleUnpublishShare : undefined}
          onCopyShareLink={shareUrl ? handleCopyShareLink : undefined}
          onOpenSharePage={shareUrl ? handleOpenSharePage : undefined}
          isPublishing={isLoadingShare || isPublishingShare}
          isUnpublishing={isUnpublishingShare}
          canPublish={!!note?.id}
          collapsed={rightSidebarCollapsed}
          onToggleCollapsed={() => setRightSidebarCollapsed(prev => !prev)}
        />
      )}

      {/* Clean Editor Area */}
      <div
        className="flex h-screen flex-col bg-background pt-16 text-foreground lg:pt-0"
        style={!isMobile ? { paddingRight: rightSidebarOffset } : undefined}
      >
        <div className="flex-1 overflow-hidden px-3 py-2 sm:px-4 sm:py-3">
          <div className="h-full w-full">
            <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface">
              {noteType === 'drawing' ? (
                <ErrorBoundary label="Drawing Editor" inline>
                  <DrawingEditor
                    ref={drawingEditorRef}
                    value={drawingData}
                    onChange={setDrawingData}
                    disabled={isSaving || isDeleting}
                  />
                </ErrorBoundary>
              ) : noteType === 'mindmap' ? (
                <ErrorBoundary label="Mindmap Editor" inline>
                  <MindmapEditor
                    ref={mindmapEditorRef}
                    initialData={mindmapData || undefined}
                    onChange={setMindmapData}
                    onSelectedNodeChange={(nodeId, _node) => setSelectedMindmapNodeId(nodeId)}
                    textNotes={textNotesForMindmap.map((item) => ({
                      id: item.id,
                      title: item.title || 'Untitled',
                      content: item.content || '',
                    }))}
                    onCreateTextNote={handleCreateTextNoteFromMindmap}
                    onOpenTextNote={handleOpenTextNoteFromMindmap}
                    readOnly={isSaving || isDeleting}
                  />
                </ErrorBoundary>
              ) : noteType === 'bullet-journal' ? (
                <ErrorBoundary label="Journal Editor" inline>
                  <BulletJournalEditor
                    ref={bulletJournalRef}
                    noteId={note?.id ?? null}
                    initialData={bulletJournalData}
                    onChange={setBulletJournalData}
                    disabled={isSaving || isDeleting}
                  />
                </ErrorBoundary>
              ) : noteType === 'data-sheet' ? (
                <ErrorBoundary label="Data Sheet" inline>
                  <DataSheetEditor
                    key={note?.id ?? `new-${dataSheetKey}`}
                    ref={dataSheetRef}
                    initialData={dataSheetData}
                    onChange={setDataSheetData}
                    disabled={isSaving || isDeleting}
                  />
                </ErrorBoundary>
              ) : noteType === 'pdf-annotation' ? (
                <ErrorBoundary label="PDF Annotation" inline>
                  <PdfAnnotationEditor
                    ref={pdfAnnotationRef}
                    value={pdfAnnotationData}
                    onChange={setPdfAnnotationData}
                    disabled={isSaving || isDeleting}
                    noteId={note?.id ?? null}
                    onTextExtracted={setPdfExtractedText}
                  />
                </ErrorBoundary>
              ) : (
                <ErrorBoundary label="Rich Text Editor" inline>
                <RichTextEditor
                    ref={editorRef}
                    value={content}
                    onChange={handleContentChange}
                    disabled={isSaving || isDeleting}
                    placeholder="Start writing your note..."
                    onImagePaste={async (file: File) => {
                      try {
                        return await uploadAndBuildImagePayload(file, 'paste')
                      } catch (error) {
                        console.error('Paste upload failed:', error)
                        toast.push({ title: 'Paste failed', description: 'Could not upload pasted image.' })
                        return null
                      }
                    }}
                    onImageDrop={async (file: File) => {
                      try {
                        return await uploadAndBuildImagePayload(file, 'drop')
                      } catch (error) {
                        console.error('Drop upload failed:', error)
                        toast.push({ title: 'Drop failed', description: 'Could not upload dropped image.' })
                        return null
                      }
                    }}
                    onCustomCommand={(commandId) => {
                      if (commandId === 'note-link') {
                        saveNoteLinkSelection()
                        setShowNoteLinkDialog(true)
                      }
                    }}
                    customBlocks={[
                      noteLinkBlock,
                      imageBlock,
                      dataSheetTableBlock,
                      fileBlock,
                      pdfAnnotationEmbedBlock,
                      {
                        type: 'table',
                        render: (payload?: any) => {
                          const rows = (payload && payload.rows) || 3
                          const cols = (payload && payload.cols) || 3
                          let html = '<div class="overflow-auto my-2"><table class="min-w-full table-fixed border-collapse">'
                          for (let r = 0; r < rows; r++) {
                            html += '<tr>'
                            for (let c = 0; c < cols; c++) {
                              html += '<td class="border px-2 py-1 align-top">' + (r === 0 ? '<strong>Header</strong>' : '&nbsp;') + '</td>'
                            }
                            html += '</tr>'
                          }
                          html += '</table></div>'
                          return html
                        },
                        parse: (el: HTMLElement) => {
                          // naive parse: count rows/cols
                          const table = el.querySelector('table')
                          if (!table) return { rows: 0, cols: 0 }
                          const rows = table.querySelectorAll('tr').length
                          const firstRow = table.querySelector('tr')
                          const cols = firstRow ? firstRow.querySelectorAll('td,th').length : 0
                          return { rows, cols }
                        }
                      }
                    ]}
                  />
                </ErrorBoundary>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Toolbar - Only show for rich text notes */}
      <SelectionToolbar
        ref={floatingToolbarRef}
        top={floatingToolbar.top}
        left={floatingToolbar.left}
        visible={noteType === 'rich-text' && floatingToolbar.visible}
        activeFormats={activeFormats}
        onCommand={handleCommand}
        isDisabled={isSaving || isDeleting}
      />

      {/* Word Goal Input Modal */}
      {showWordGoalInput && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-alpine-100 flex items-center justify-center">
                <Target size={24} className="text-alpine-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Set Word Goal</h3>
                <p className="text-sm text-gray-500">Set a target word count for this note</p>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target word count
              </label>
              <input
                ref={wordGoalInputRef}
                type="number"
                min="1"
                defaultValue={wordGoal || ''}
                placeholder="e.g., 1000"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = parseInt(e.currentTarget.value, 10)
                    if (value > 0) {
                      handleSetWordGoal(value)
                    }
                  } else if (e.key === 'Escape') {
                    setShowWordGoalInput(false)
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Current: {stats.words} words</p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => handleSetWordGoal(null)}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Clear Goal
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowWordGoalInput(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (wordGoalInputRef.current) {
                      const value = parseInt(wordGoalInputRef.current.value, 10)
                      if (!isNaN(value) && value > 0) {
                        handleSetWordGoal(value)
                      }
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-alpine-600 rounded-lg hover:bg-alpine-700 transition-colors"
                >
                  Set Goal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note Link Dialog */}
      <NoteLinkDialog
        isOpen={showNoteLinkDialog}
        onClose={() => setShowNoteLinkDialog(false)}
        onSelect={handleNoteLinkSelect}
        currentNoteId={note?.id}
      />

      {/* Data Sheet Picker Dialog */}
      <DataSheetPickerDialog
        isOpen={showDataSheetPicker}
        onClose={() => setShowDataSheetPicker(false)}
        onSelect={handleDataSheetTableSelect}
        currentNoteId={note?.id}
      />

      {/* Knowledge Graph Modal */}
      <KnowledgeGraphModal
        isOpen={showKnowledgeGraph}
        onClose={() => setShowKnowledgeGraph(false)}
        currentNoteId={note?.id}
        onSelectNote={onSelectNote}
        folders={folders}
        selectedFolderId={selectedFolderId}
      />

      {/* File Picker for inserting file blocks / file references */}
      <FileExplorerModal
        isOpen={showFilePicker}
        onClose={() => setShowFilePicker(false)}
        onSelectFiles={handleFilePickerSelect}
        title="Attach File"
        initialPath={noteFileUploadPath}
        uploadPath={noteFileUploadPath}
      />

      {/* DOCX Action Previews */}
      <DocxPreviewModal
        isOpen={docxPreview.isOpen}
        onClose={() => setDocxPreview({isOpen: false, filePath: null, fileName: null})}
        filePath={docxPreview.filePath}
        fileName={docxPreview.fileName}
      />

      {/* Project Manager Modal (fallback when workspace view callback is not provided) */}
      {!onOpenProjectsView && (
        <ProjectsWorkspaceModal
          isOpen={showProjectsModal}
          onClose={() => setShowProjectsModal(false)}
          onSelectNote={onSelectNote}
          onSelectFolder={onSelectFolder}
          onNewNote={onNewNote}
          onDuplicateNote={onDuplicateNote}
        />
      )}

      {/* Floating Content Blocks Button - Only show for rich text notes */}
      {noteType === 'rich-text' && !showContentBlocksMenu && (
        <button
          onClick={openContentBlocksMenu}
          className={`fixed z-40 rounded-full bg-alpine-600 hover:bg-alpine-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group ${
            isMobile ? 'right-4 bottom-20 w-14 h-14 touch-target safe-bottom' : 'bottom-24 w-14 h-14'
          }`}
          style={!isMobile ? { right: `calc(${rightSidebarOffset} + 24px)` } : undefined}
          title="Insert content block"
        >
          <Plus size={24} className="transition-transform group-hover:rotate-90" />
        </button>
      )}

      {/* Content Blocks Menu */}
      {showContentBlocksMenu && noteType === 'rich-text' && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" 
          onClick={() => hideContentBlocksMenu()}
        >
          <div 
            className={`bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col ${
              isMobile
                ? 'fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[70vh] safe-bottom'
                : 'rounded-xl w-96 max-h-[80vh]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with search */}
            <div className="flex flex-col border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Insert Content Block</h3>
                <button
                  onClick={() => hideContentBlocksMenu()}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Close menu"
                >
                  <X size={16} />
                </button>
              </div>
              
              {/* Search bar */}
              <div className="px-4 pb-3">
                <div className="relative">
                  <SearchIcon 
                    size={16} 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" 
                  />
                  <input
                    ref={blockSearchInputRef}
                    type="text"
                    value={blockSearchQuery}
                    onChange={(e) => {
                      setBlockSearchQuery(e.target.value)
                      setSelectedBlockIndex(0)
                    }}
                    onKeyDown={handleBlockMenuKeyDown}
                    placeholder="Search blocks..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Use ↑↓ to navigate, Enter to select, Esc to close
                </p>
              </div>
            </div>

            {/* Content blocks list */}
            <div className="overflow-y-auto flex-1 py-2">
              {filteredBlocks.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No blocks found matching &quot;{blockSearchQuery}&quot;
                </div>
              ) : (
                <>
                  {Object.entries(
                    filteredBlocks.reduce((acc, block) => {
                      if (!acc[block.category]) acc[block.category] = []
                      acc[block.category].push(block)
                      return acc
                    }, {} as Record<string, typeof filteredBlocks>)
                  ).map(([category, blocks]) => (
                    <div key={category}>
                      {/* Category header - only show if not searching or multiple categories present */}
                      {(!blockSearchQuery || Object.keys(
                        filteredBlocks.reduce((acc, block) => {
                          acc[block.category] = true
                          return acc
                        }, {} as Record<string, boolean>)
                      ).length > 1) && (
                        <div className="px-3 pt-3 pb-1 first:pt-1">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {category}
                          </div>
                        </div>
                      )}
                      
                      {blocks.map((block) => {
                        const blockIndex = filteredBlocks.indexOf(block)
                        const isSelected = blockIndex === selectedBlockIndex
                        const IconComponent = block.icon
                        
                        return (
                          <button
                            key={block.id}
                            onClick={() => executeBlockAction(block.id)}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
                              isSelected 
                                ? 'bg-alpine-50 ring-2 ring-alpine-500 ring-inset' 
                                : 'hover:bg-gray-50'
                            }`}
                            onMouseEnter={() => setSelectedBlockIndex(blockIndex)}
                          >
                            <div className={`flex-shrink-0 w-10 h-10 rounded-lg bg-${block.color}-100 flex items-center justify-center`}>
                              <IconComponent size={20} className={`text-${block.color}-600`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 text-sm">{block.label}</div>
                              <div className="text-xs text-gray-500">{block.description}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* AI Assistant Popup */}
      {showAIAssistant && (
        <div className="fixed inset-0 z-50">
          <button
            onClick={() => setShowAIAssistant(false)}
            className="absolute inset-0 bg-black/30 -[1px]"
            aria-label="Close AI Assistant"
          />

          <div className="absolute bottom-4 right-4 pointer-events-none">
            <div
              className={`pointer-events-auto flex flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden md:resize ${
                isAIAssistantLarge
                  ? 'w-[calc(100vw-1rem)] h-[calc(100dvh-2rem)] sm:w-[min(92vw,860px)] sm:h-[min(88vh,860px)]'
                  : 'w-[calc(100vw-1rem)] h-[calc(100dvh-2rem)] sm:w-[420px] sm:h-[600px] sm:max-h-[90vh]'
              }`}
              style={{ minHeight: '440px', maxWidth: '92vw', maxHeight: '88vh' }}
            >
              <div className="flex-1 min-h-0">
                <AIAssistant
                  note={note ?? null}
                  noteContent={aiNoteContent}
                  allNotes={allNotes}
                  selectedText={selectedText || undefined}
                  mindmapData={mindmapData}
                  selectedMindmapNodeId={selectedMindmapNodeId}
                  onInsertText={handleAIInsertText}
                  onReplaceText={handleAIReplaceText}
                  onReplaceSelection={handleAIReplaceSelection}
                  onInsertAtCursor={handleAIInsertAtCursor}
                  onAddMindmapNode={noteType === 'mindmap' ? handleAIAddMindmapNode : undefined}
                  onCreateMindmapNote={handleAICreateMindmapNote}
                  onClose={() => setShowAIAssistant(false)}
                  onToggleSize={() => setIsAIAssistantLarge(prev => !prev)}
                  isLargeWindow={isAIAssistantLarge}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
