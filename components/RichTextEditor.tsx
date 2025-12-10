'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent
} from 'react'
import DOMPurify from 'dompurify'
import type { Config } from 'dompurify'
import {
  X,
  Search,
  Plus,
  Trash2,
  Minus,
  ExternalLink,
  Link2,
  Copy,
  Edit2,
  Check,
  AlertCircle,
  Clock,
  Globe
} from 'lucide-react'
import EditorToolbar from './EditorToolbar'
import {
  applyInlineStyle,
  applyBlockFormat,
  generateHeadingId,
  saveSelection as saveSelectionUtil,
  restoreSelection as restoreSelectionUtil
} from '@/lib/editor/commandDispatcher'
import {
  saveCursorPosition,
  restoreCursorPosition,
  positionCursorInElement,
  applyCursorOperation,
  CURSOR_TIMING
} from '@/lib/editor/cursorPosition'
import {
  normalizeInlineNodes,
  normalizeEditorContent,
  sanitizeInlineNodes
} from '@/lib/editor/domNormalizer'
import {
  toggleListType,
  toggleChecklistState,
  addCheckboxToListItem,
  removeCheckboxFromListItem,
  getClosestListItem,
  mergeAdjacentLists
} from '@/lib/editor/listHandler'
import { HistoryManager, createDebouncedCapture } from '@/lib/editor/historyManager'
import {
  looksLikeMarkdown,
  markdownToHtml,
  htmlToMarkdown
} from '@/lib/editor/markdownHelpers'
import {
  applyAutoformat,
  shouldApplyAutoformat,
  checkListPrefixPattern
} from '@/lib/editor/autoformat'


// Re-export RichTextCommand type for external use
export type RichTextCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'unordered-list'
  | 'ordered-list'
  | 'blockquote'
  | 'checklist'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'undo'
  | 'redo'
  | 'link'
  | 'horizontal-rule'

export interface RichTextEditorHandle {
  focus: () => void
  exec: (command: RichTextCommand) => void
  insertCustomBlock?: (type: string, payload?: any) => void
  getHTML: () => string
  getMarkdown: () => string
  getHeadings: () => Array<{ id: string; level: number; text: string }>
  queryCommandState: (command: string) => boolean
  showLinkDialog: () => void
  showSearchDialog: () => void
  showTableDialog: () => void
  requestNoteLink: () => void
  getRootElement: () => HTMLDivElement | null
  scrollToHeading: (headingId: string) => void
}

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
  // Optional custom block descriptors that allow rendering and parsing of blocks
  customBlocks?: CustomBlockDescriptor[]
  // Optional callback for handling custom commands that need UI interaction (e.g., table insertion, note links)
  onCustomCommand?: (commandId: string) => void
}

const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    'a',
    'b',
    'strong',
    'i',
    'em',
    'u',
    's',
    'code',
    'pre',
    'p',
    'br',
    'div',
    'span',
    'blockquote',
    'ul',
    'ol',
    'li',
    'hr',
    'input',
    'h1',
    'h2',
    'h3',
    'mark',
    'img',
    'button',
    'svg',
    'path'
  ],
  // allow data-block attributes and stored payload attribute
  // (data-block-payload stores URI-encoded JSON)
  ALLOWED_ATTR: [
    'href',
    'target',
    'rel',
    'class',
    'type',
    'checked',
    'data-checked',
    'id',
    'data-block',
    'data-block-type',
    'data-block-payload',
    'data-note-id',
    'data-note-title',
    'data-folder-id',
    'src',
    'alt',
    'width',
    'height',
    'style',
    'data-direction',
    'aria-label',
    'title',
    'draggable',
    'contenteditable',
    'xmlns',
    'viewBox',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'd'
  ],
  ALLOW_DATA_ATTR: true
}

// Type describing a custom block renderer/parser that callers can register
export interface CustomBlockDescriptor {
  // unique type identifier used in data-block-type
  type: string
  // render block given an optional payload; should return an HTML string
  render: (payload?: any) => string
  // optional function to parse the block element back into a payload for serialization
  parse?: (el: HTMLElement) => any
}

interface SearchMatch {
  index: number
  length: number
  text: string
}

interface BlockMetadata {
  id: string
  type: string
  textPreview: string
  index: number
}

// Performance limits
const MAX_SEARCH_MATCHES = 1000
const MAX_REPLACE_MATCHES = 1000

// Regex patterns
const REGEX_ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g

const splitLinesToFragment = (text: string): DocumentFragment => {
  const fragment = document.createDocumentFragment()
  const lines = text.split(/\r?\n|\r/g)

  lines.forEach((line, index) => {
    fragment.appendChild(document.createTextNode(line))
    if (index < lines.length - 1) {
      fragment.appendChild(document.createElement('br'))
    }
  })

  return fragment
}

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  ({ value, onChange, disabled, placeholder, customBlocks, onCustomCommand }, ref) => {
    // local ref to hold passed customBlocks (avoid re-creating callbacks when prop changes)
    const customBlocksRef = useRef<CustomBlockDescriptor[] | undefined>(undefined)
  const editorRef = useRef<HTMLDivElement | null>(null)
    const historyManagerRef = useRef<HistoryManager | null>(null)
    const debouncedCaptureRef = useRef<(() => void) | null>(null)
  const lastSyncedValueRef = useRef<string>('')
    const mutationObserverRef = useRef<MutationObserver | null>(null)
    const checklistNormalizationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [showLinkDialog, setShowLinkDialog] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')
    const [linkText, setLinkText] = useState('')
    const [linkUrlError, setLinkUrlError] = useState('')
    const [recentLinks, setRecentLinks] = useState<Array<{url: string, text: string, timestamp: number}>>([])
    const [showLinkPopover, setShowLinkPopover] = useState(false)
    const [linkPopoverPos, setLinkPopoverPos] = useState({ top: 0, left: 0 })
    const [hoveredLinkElement, setHoveredLinkElement] = useState<HTMLAnchorElement | null>(null)
    const linkPopoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [copiedLink, setCopiedLink] = useState(false)
    const [showSearchDialog, setShowSearchDialog] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [replaceQuery, setReplaceQuery] = useState('')
    const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
    const [caseSensitive, setCaseSensitive] = useState(false)
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [hoverRows, setHoverRows] = useState<number | null>(null)
  const [hoverCols, setHoverCols] = useState<number | null>(null)
    const savedSelectionRef = useRef<Range | null>(null)
    const [autoformatEnabled, setAutoformatEnabled] = useState(true)
    const [blockMetadata, setBlockMetadata] = useState<BlockMetadata[]>([])
    const [blockPanelOpen, setBlockPanelOpen] = useState(false)
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
    const [showBlockOutlines, setShowBlockOutlines] = useState(false)
    const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
    const blockIdCounterRef = useRef(0)
    const activeFormatsFrameRef = useRef<number | null>(null)

    const ensureBlockId = useCallback((node: HTMLElement | null) => {
      if (!node) return ''
      try {
        let id = node.getAttribute('data-block-id')
        if (!id) {
          blockIdCounterRef.current += 1
          id = `block-${blockIdCounterRef.current}`
          node.setAttribute('data-block-id', id)
        }
        return id
      } catch (error) {
        console.error('Error ensuring block ID:', error)
        return ''
      }
    }, [])

    const updateBlockMetadata = useCallback(() => {
      if (!editorRef.current) return
      try {
        const blockNodes = Array.from(editorRef.current.children) as HTMLElement[]
        const metadata = blockNodes.map((node, idx) => {
          const id = ensureBlockId(node)
          const type = node.getAttribute('data-block-type') ?? node.tagName.toLowerCase()
          const textPreview = (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
          return {
            id,
            type,
            textPreview: textPreview || '(empty)',
            index: idx + 1
          }
        })
        setBlockMetadata(metadata)
      } catch (error) {
        console.error('Error updating block metadata:', error)
      }
    }, [ensureBlockId])

    const refreshActiveBlock = useCallback(() => {
      try {
        if (!editorRef.current) {
          setActiveBlockId(null)
          return
        }
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
          setActiveBlockId(null)
          return
        }
        const anchorNode = selection.getRangeAt(0).startContainer
        const element = anchorNode instanceof HTMLElement ? anchorNode : anchorNode.parentElement
        if (!element) {
          setActiveBlockId(null)
          return
        }
        const blockElement = element.closest('[data-block-id]') || element.closest('[data-block="true"]')
        if (blockElement instanceof HTMLElement) {
          const id = ensureBlockId(blockElement)
          setActiveBlockId(id)
        } else {
          setActiveBlockId(null)
        }
      } catch (error) {
        console.error('Error refreshing active block:', error)
        setActiveBlockId(null)
      }
    }, [ensureBlockId])

    const updateActiveFormats = useCallback(() => {
      try {
        if (!editorRef.current) {
          setActiveFormats(new Set())
          return
        }
        
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
          setActiveFormats(new Set())
          return
        }
        
        const range = selection.getRangeAt(0)
        const node = range.commonAncestorContainer
        const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
        
        if (!element) {
          setActiveFormats(new Set())
          return
        }
        
        const formats = new Set<string>()
        
        // Check inline formatting
        if (element.closest('strong, b')) formats.add('bold')
        if (element.closest('em, i')) formats.add('italic')
        if (element.closest('u')) formats.add('underline')
        if (element.closest('s, strike')) formats.add('strike')
        if (element.closest('code')) formats.add('code')
        
        // Check lists
        if (element.closest('ul')) formats.add('unordered-list')
        if (element.closest('ol')) formats.add('ordered-list')
        
        // Check block-level formatting
        if (element.closest('h1')) formats.add('heading1')
        if (element.closest('h2')) formats.add('heading2')
        if (element.closest('h3')) formats.add('heading3')
        if (element.closest('blockquote')) formats.add('blockquote')
        
        setActiveFormats(formats)
      } catch (error) {
        console.error('Error updating active formats:', error)
        setActiveFormats(new Set())
      }
    }, []) // Empty deps: only uses DOM APIs and setState

    const scheduleActiveFormatsUpdate = useCallback(() => {
      if (activeFormatsFrameRef.current !== null) {
        window.cancelAnimationFrame(activeFormatsFrameRef.current)
      }

      activeFormatsFrameRef.current = window.requestAnimationFrame(() => {
        updateActiveFormats()
        activeFormatsFrameRef.current = null
      })
    }, [updateActiveFormats])

    const focusBlockById = useCallback(
      (blockId: string) => {
        if (!editorRef.current || !blockId) return
        const escapeSelector = (value: string) => {
          if (typeof CSS !== 'undefined' && CSS.escape) {
            return CSS.escape(value)
          }
          return value.replace(/(["#.;?+*~':!^$\[\]()=>|/@])/g, '\\$1')
        }
        const selectorId = escapeSelector(blockId)
        const block = editorRef.current.querySelector(
          `[data-block-id="${selectorId}"]`
        ) as HTMLElement | null
        if (!block) return

        const focusTarget = (block.querySelector('p, div, span, li, blockquote') as HTMLElement | null) ?? block
        positionCursorInElement(focusTarget, 'start', editorRef.current)
        block.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setActiveBlockId(blockId)
      },
      []
    )
    

    const insertFragmentAtSelection = useCallback(
        (fragment: DocumentFragment) => {
          if (!editorRef.current) return false

          try {
            let selection = window.getSelection()
            if (!selection || selection.rangeCount === 0) {
              editorRef.current.focus()
              selection = window.getSelection()
            }

            if (!selection || selection.rangeCount === 0) {
              console.warn('Unable to get selection for fragment insertion')
              return false
            }

            const range = selection.getRangeAt(0)

            // Validate range is within editor
            if (!editorRef.current.contains(range.commonAncestorContainer)) {
              console.warn('Selection range is outside editor')
              return false
            }

            range.deleteContents()

            const nodes = Array.from(fragment.childNodes)

            if (nodes.length === 0) {
              range.collapse(true)
              selection.removeAllRanges()
              selection.addRange(range)
              return true
            }

            range.insertNode(fragment)

            const lastNode = nodes[nodes.length - 1]
            const newRange = document.createRange()

            if (lastNode.nodeType === Node.TEXT_NODE) {
              newRange.setStart(lastNode, lastNode.textContent?.length ?? 0)
            } else if (lastNode.childNodes.length > 0) {
              newRange.setStart(lastNode, lastNode.childNodes.length)
            } else {
              newRange.setStartAfter(lastNode)
            }

            newRange.collapse(true)
            selection.removeAllRanges()
            selection.addRange(newRange)
            return true
          } catch (error) {
            console.error('Error inserting fragment at selection:', error)
            return false
          }
        },
        [editorRef]
      )

        const insertCustomBlockAtSelection = useCallback(
          (html: string) => {
            // Parse the HTML to check if it's already marked as a block
            const temp = document.createElement('div')
            temp.innerHTML = html
            const firstChild = temp.firstChild as HTMLElement
            
            // If the content already has data-block attribute (inline blocks like note-link),
            // insert it directly without wrapping
            if (firstChild && firstChild.getAttribute && firstChild.getAttribute('data-block') === 'true') {
              return insertFragmentAtSelection(document.createRange().createContextualFragment(html))
            }
            
            // Otherwise, wrap block in a container with data-block-type so it survives sanitization
            const wrapper = document.createElement('div')
            wrapper.setAttribute('data-block', 'true')
            wrapper.innerHTML = html

            return insertFragmentAtSelection(document.createRange().createContextualFragment(wrapper.outerHTML))
          },
          [insertFragmentAtSelection]
        )

    const insertHTMLAtSelection = useCallback(
        (html: string) => {
          const fragment = document.createDocumentFragment()

          if (html) {
            const template = document.createElement('template')
            template.innerHTML = html

            while (template.content.firstChild) {
              fragment.appendChild(template.content.firstChild)
            }
          }

          return insertFragmentAtSelection(fragment)
        },
        [insertFragmentAtSelection]
      )

    const insertPlainTextAtSelection = useCallback(
        (text: string) => {
          const fragment = splitLinesToFragment(text)
          return insertFragmentAtSelection(fragment)
        },
        [insertFragmentAtSelection]
      )

    // keep customBlocksRef in sync with prop
    useEffect(() => {
      customBlocksRef.current = customBlocks
    }, [customBlocks])

    useEffect(() => {
      updateBlockMetadata()
    }, [updateBlockMetadata])

    useEffect(() => {
      const handleSelection = () => refreshActiveBlock()
      document.addEventListener('selectionchange', handleSelection)
      return () => document.removeEventListener('selectionchange', handleSelection)
    }, [refreshActiveBlock])

    useEffect(() => {
      const handleSelection = () => scheduleActiveFormatsUpdate()
      document.addEventListener('selectionchange', handleSelection)
      return () => document.removeEventListener('selectionchange', handleSelection)
    }, [scheduleActiveFormatsUpdate])

    useEffect(() => {
      if (!editorRef.current) return
      const nodes = editorRef.current.querySelectorAll('[data-block-id]')
      nodes.forEach((node) => {
        if (showBlockOutlines) {
          node.setAttribute('data-block-outline', 'true')
        } else {
          node.removeAttribute('data-block-outline')
        }
      })
    }, [showBlockOutlines, blockMetadata])

    const sanitize = useCallback(
      (html: string) => {
        if (typeof window === 'undefined') return html
        return DOMPurify.sanitize(html, SANITIZE_CONFIG) as string
      },
      []
    )

    // WebView-specific focus helper
    const forceWebViewFocus = useCallback(() => {
      if (!editorRef.current) return;
      
      // WebView sometimes needs extra focus handling
      editorRef.current.blur();
      setTimeout(() => {
        editorRef.current?.focus();
      }, 50);
    }, []);

    // Debounced checklist normalization
    const normalizeChecklistItemsInline = useCallback(() => {
      if (!editorRef.current) return

      const listItems = editorRef.current.querySelectorAll('li')
      listItems.forEach((item) => {
        const li = item as HTMLLIElement
        const checkbox = li.querySelector('input[type="checkbox"]') as HTMLInputElement | null

        if (checkbox) {
          if (!checkbox.classList.contains('checklist-checkbox')) {
            checkbox.classList.add('checklist-checkbox', 'align-middle', 'mr-2')
          }
          if (!checkbox.hasAttribute('data-checked')) {
            checkbox.setAttribute('data-checked', checkbox.checked ? 'true' : 'false')
          }
          li.classList.add('checklist-item')
          li.setAttribute('data-checklist', 'true')
          const existingTextNode = Array.from(li.childNodes).find(
            (node): node is Text => node.nodeType === Node.TEXT_NODE
          )
          if (!existingTextNode) {
            const textNode = document.createTextNode('')
            li.appendChild(textNode)
          }
        } else if (li.classList.contains('checklist-item') || li.getAttribute('data-checklist') === 'true') {
          li.classList.remove('checklist-item')
          li.removeAttribute('data-checklist')
        }
      })

      const lists = editorRef.current.querySelectorAll('ul, ol')
      lists.forEach((list) => {
        const hasCheckbox = !!list.querySelector('input[type="checkbox"]')
        if (hasCheckbox) {
          list.classList.add('checklist-list')
          list.setAttribute('data-checklist', 'true')
        } else {
          list.classList.remove('checklist-list')
          list.removeAttribute('data-checklist')
        }
      })
    }, [])

    const scheduleChecklistNormalization = useCallback(() => {
      if (checklistNormalizationTimerRef.current) {
        clearTimeout(checklistNormalizationTimerRef.current)
      }
      
      checklistNormalizationTimerRef.current = setTimeout(() => {
        normalizeChecklistItemsInline()
      }, 150)
    }, [normalizeChecklistItemsInline])

    const emitChange = useCallback(() => {
      if (!editorRef.current) return
      
      try {
        // Validate editor is still connected
        if (!editorRef.current.isConnected) {
          console.warn('Editor disconnected, skipping change emission')
          return
        }
        
        const sanitized = sanitize(editorRef.current.innerHTML)
        lastSyncedValueRef.current = sanitized
        
        if (sanitized !== value) {
          onChange(sanitized)
          if (debouncedCaptureRef.current) {
            debouncedCaptureRef.current()
          }
        }
        
        updateBlockMetadata()
        scheduleActiveFormatsUpdate()
      } catch (error) {
        console.error('Error emitting change:', error)
      }
    }, [onChange, sanitize, updateBlockMetadata, value, scheduleActiveFormatsUpdate])

    // Public API: insert a custom block by type and optional payload
    const insertCustomBlock = useCallback(
      (type: string, payload?: any) => {
        const descriptors = customBlocksRef.current || []
        const desc = descriptors.find((d) => d.type === type)
        if (!desc) {
          console.warn(`No custom block registered for type: ${type}`)
          return false
        }

        try {
          const html = desc.render(payload)
          const ok = insertCustomBlockAtSelection(html)
          if (ok) {
            // mark the inserted block's top-level element with data-block-type
            // and, if a payload was provided, attach it as data-block-payload
            // we do this after a short timeout to allow DOM insertion
            setTimeout(() => {
              if (!editorRef.current) return
              const blocks = editorRef.current.querySelectorAll('[data-block]')
              blocks.forEach((b) => {
                if (!b.getAttribute('data-block-type')) {
                  b.setAttribute('data-block-type', type)
                }
                if (payload !== undefined && !b.getAttribute('data-block-payload')) {
                  try {
                    b.setAttribute('data-block-payload', encodeURIComponent(JSON.stringify(payload)))
                  } catch (e) {
                    // ignore serialization errors
                  }
                }
              })
              
              // For block-level custom blocks (like images), ensure there's a paragraph after
              // for continued editing if the block is at the end
              const selection = window.getSelection()
              if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0)
                const container = range.commonAncestorContainer
                
                // Find the custom block that was just inserted
                let blockElement: HTMLElement | null = null
                if (container.nodeType === Node.ELEMENT_NODE) {
                  blockElement = (container as HTMLElement).querySelector('[data-block="true"]')
                  if (!blockElement && (container as HTMLElement).hasAttribute('data-block')) {
                    blockElement = container as HTMLElement
                  }
                } else if (container.parentElement) {
                  blockElement = container.parentElement.closest('[data-block="true"]') as HTMLElement
                }
                
                // Check if this is a block-level element (like image) and needs a trailing paragraph
                // We check the block type directly rather than getComputedStyle for better performance
                if (blockElement && blockElement.getAttribute('data-block-type') === type) {
                  // Known block-level custom block types
                  const blockLevelTypes = ['image', 'table']
                  const isBlockLevel = blockLevelTypes.includes(type)
                  const hasNextSibling = blockElement.nextElementSibling
                  
                  if (isBlockLevel && !hasNextSibling) {
                    // Create a paragraph after the block for continued editing
                    const paragraph = document.createElement('p')
                    paragraph.appendChild(document.createElement('br'))
                    blockElement.parentNode?.insertBefore(paragraph, blockElement.nextSibling)
                    
                    // Position cursor in the new paragraph
                    const newRange = document.createRange()
                    newRange.setStart(paragraph, 0)
                    newRange.collapse(true)
                    selection.removeAllRanges()
                    selection.addRange(newRange)
                  }
                }
              }
            }, 20)
          }
          emitChange()
          return ok
        } catch (err) {
          console.error('Failed to render custom block', err)
          return false
        }
      },
      [insertCustomBlockAtSelection, emitChange]
    )

    // Rehydrate existing custom blocks in the editor by running descriptor.parse
    const rehydrateExistingBlocks = useCallback(() => {
      if (!editorRef.current) return
      const descriptors = customBlocksRef.current || []
      const nodes = Array.from(editorRef.current.querySelectorAll('[data-block][data-block-type]'))
      nodes.forEach((node) => {
        const type = node.getAttribute('data-block-type') || ''
        const desc = descriptors.find((d) => d.type === type)
        if (desc && typeof desc.parse === 'function') {
          try {
            const parsed = desc.parse(node as HTMLElement)
            if (parsed !== undefined) {
              try {
                node.setAttribute('data-block-payload', encodeURIComponent(JSON.stringify(parsed)))
              } catch {}
            }
          } catch (e) {
            // parsing failed - ignore
          }
        } else {
          // if there is already a payload attribute, leave it as-is; otherwise clear
        }
      })
    }, [])

    // Table manipulation helpers (defined after emitChange so it's available)
    const [tableToolbarVisible, setTableToolbarVisible] = useState(false)
    const [tableToolbarPos, setTableToolbarPos] = useState({ top: 0, left: 0 })
    const tableNodeRef = useRef<HTMLElement | null>(null)

    const findClosestTableBlock = useCallback((el: Node | null) => {
      if (!el || !editorRef.current) return null
      let node: Node | null = el
      while (node && node !== editorRef.current) {
        if (node instanceof HTMLElement) {
          const isBlock = node.getAttribute('data-block') === 'true' || node.hasAttribute('data-block')
          const type = node.getAttribute('data-block-type')
          if (isBlock && type === 'table') return node as HTMLElement
          const table = node.closest('table')
          if (table) return table as HTMLElement
        }
        node = node.parentNode
      }
      return null
    }, [])

    const showTableToolbarForNode = useCallback((node: HTMLElement | null) => {
      if (!node) {
        setTableToolbarVisible(false)
        tableNodeRef.current = null
        return
      }
      tableNodeRef.current = node
      const rect = node.getBoundingClientRect()

      // Prefer showing toolbar above the table; if not enough space, show below
      const TOOLBAR_HEIGHT = 40
      const MARGIN = 8
      let top = rect.top - TOOLBAR_HEIGHT - MARGIN
      if (top < MARGIN) {
        top = rect.bottom + MARGIN
      }

      // Align left to table left, but clamp to viewport
      let left = rect.left
      const toolbarWidthEstimate = 360
      const maxLeft = window.innerWidth - toolbarWidthEstimate - MARGIN
      if (left > maxLeft) left = Math.max(MARGIN, maxLeft)
      if (left < MARGIN) left = MARGIN

      setTableToolbarPos({ top, left })
      setTableToolbarVisible(true)
    }, [])

    const updateTablePayload = useCallback(() => {
      const table = tableNodeRef.current as HTMLTableElement | null
      if (!table) return
      // find ancestor block element that has data-block attribute, otherwise use table
      let block: HTMLElement | null = table
      let p: HTMLElement | null = table
      while (p && p !== editorRef.current) {
        if (p.getAttribute && (p.getAttribute('data-block') === 'true' || p.hasAttribute('data-block'))) {
          block = p
          break
        }
        p = p.parentElement
      }
      const rows = table.querySelectorAll('tr').length
      const cols = table.querySelectorAll('tr')[0]?.querySelectorAll('td,th').length || 0
      try {
        block.setAttribute('data-block-payload', encodeURIComponent(JSON.stringify({ rows, cols })))
      } catch {}
    }, [])

    const addTableRow = useCallback(() => {
      const table = tableNodeRef.current as HTMLTableElement | null
      if (!table) return
      const cols = table.querySelectorAll('tr')[0]?.querySelectorAll('td,th').length || 1
      const tr = document.createElement('tr')
      for (let i = 0; i < cols; i++) {
        const td = document.createElement('td')
        td.className = 'border px-2 py-1 align-top'
        td.innerHTML = '&nbsp;'
        tr.appendChild(td)
      }
      table.appendChild(tr)
      // update payload on the containing block element
      updateTablePayload()
      emitChange()
    }, [emitChange, updateTablePayload])

    const deleteTableRow = useCallback(() => {
      const table = tableNodeRef.current as HTMLTableElement | null
      if (!table) return
      const rows = table.querySelectorAll('tr')
      if (rows.length <= 1) return
      const last = rows[rows.length - 1]
      last.remove()
      updateTablePayload()
      emitChange()
    }, [emitChange, updateTablePayload])

    const addTableCol = useCallback(() => {
      const table = tableNodeRef.current as HTMLTableElement | null
      if (!table) return
      const rows = table.querySelectorAll('tr')
      rows.forEach((row) => {
        const td = document.createElement('td')
        td.className = 'border px-2 py-1 align-top'
        td.innerHTML = '&nbsp;'
        row.appendChild(td)
      })
      updateTablePayload()
      emitChange()
    }, [emitChange, updateTablePayload])

    const deleteTableCol = useCallback(() => {
      const table = tableNodeRef.current as HTMLTableElement | null
      if (!table) return
      const rows = table.querySelectorAll('tr')
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td,th')
        if (cells.length > 1) {
          cells[cells.length - 1].remove()
        }
      })
      updateTablePayload()
      emitChange()
    }, [emitChange, updateTablePayload])

    const deleteTable = useCallback(() => {
      const table = tableNodeRef.current as HTMLElement | null
      if (!table) return
      table.remove()
      tableNodeRef.current = null
      setTableToolbarVisible(false)
      emitChange()
    }, [emitChange])

    // Editor click handler to detect table clicks and note link clicks
    useEffect(() => {
      const handleClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null
        
        // Check for note link clicks
        if (target) {
          const noteLinkElement = target.closest('[data-block-type="note-link"]') as HTMLElement | null
          if (noteLinkElement) {
            event.preventDefault()
            const noteId = noteLinkElement.getAttribute('data-note-id')
            if (noteId) {
              // Dispatch custom event that parent can listen to
              window.dispatchEvent(new CustomEvent('note-link-click', { 
                detail: { noteId } 
              }))
            }
            return
          }
        }
        
        // Check for table clicks
        const tableNode = findClosestTableBlock(target)
        if (tableNode) {
          showTableToolbarForNode(tableNode as HTMLElement)
        } else {
          setTableToolbarVisible(false)
        }
      }
      
      document.addEventListener('click', handleClick)
      
      return () => {
        document.removeEventListener('click', handleClick)
      }
    }, [findClosestTableBlock, showTableToolbarForNode])

    const createChecklistCheckbox = useCallback(() => {
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'align-middle mr-2 checklist-checkbox'
      checkbox.setAttribute('data-checked', 'false')
      checkbox.addEventListener('change', () => {
        checkbox.setAttribute('data-checked', checkbox.checked ? 'true' : 'false')
        if (checkbox.checked) {
          checkbox.setAttribute('checked', 'true')
        } else {
          checkbox.removeAttribute('checked')
        }
        emitChange()
      })
      return checkbox
    }, [emitChange])

    const markChecklistList = useCallback(
      (list: HTMLUListElement | HTMLOListElement | null | undefined, isChecklist: boolean) => {
        if (!list) return
        if (isChecklist) {
          list.classList.add('checklist-list')
          list.setAttribute('data-checklist', 'true')
        } else {
          list.classList.remove('checklist-list')
          list.removeAttribute('data-checklist')
        }
      },
      []
    )

    const markChecklistItem = useCallback((listItem: HTMLLIElement, isChecklist: boolean) => {
      if (isChecklist) {
        listItem.classList.add('checklist-item')
        listItem.setAttribute('data-checklist', 'true')
      } else {
        listItem.classList.remove('checklist-item')
        listItem.removeAttribute('data-checklist')
      }
      markChecklistList(listItem.parentElement as HTMLUListElement | HTMLOListElement | null, isChecklist)
    }, [markChecklistList])

    const ensureTextNode = useCallback((element: HTMLElement): Text => {
      const existingTextNode = Array.from(element.childNodes).find(
        (node): node is Text => node.nodeType === Node.TEXT_NODE
      )
      if (existingTextNode) {
        return existingTextNode
      }
      const textNode = document.createTextNode('')
      element.appendChild(textNode)
      return textNode
    }, [])

    const getChecklistItemText = useCallback((listItem: HTMLLIElement) => {
      return Array.from(listItem.childNodes)
        .filter((node) => {
          return !(node instanceof HTMLInputElement && node.type === 'checkbox')
        })
        .map((node) => node.textContent ?? '')
        .join('')
        .trim()
    }, [])

    const addCheckboxToListItem = useCallback(
      (listItem: HTMLLIElement) => {
        const existingCheckbox = listItem.querySelector('input[type="checkbox"]') as
          | HTMLInputElement
          | null

        if (existingCheckbox) {
          existingCheckbox.classList.add('checklist-checkbox', 'align-middle', 'mr-2')
          markChecklistItem(listItem, true)
          ensureTextNode(listItem)
          return existingCheckbox
        }

        const checkbox = createChecklistCheckbox()
        listItem.insertBefore(checkbox, listItem.firstChild)
        markChecklistItem(listItem, true)
        ensureTextNode(listItem)
        return checkbox
      },
      [createChecklistCheckbox, ensureTextNode, markChecklistItem]
    )

    const removeCheckboxFromListItem = useCallback(
      (listItem: HTMLLIElement) => {
        const checkbox = listItem.querySelector('input[type="checkbox"]')
        if (checkbox) {
          checkbox.remove()
        }
        markChecklistItem(listItem, false)
      },
      [markChecklistItem]
    )

    const convertListToChecklist = useCallback(
      (list: HTMLUListElement | HTMLOListElement) => {
        Array.from(list.children).forEach((child) => {
          if (child instanceof HTMLLIElement) {
            addCheckboxToListItem(child)
          }
        })
        markChecklistList(list, true)
      },
      [addCheckboxToListItem, markChecklistList]
    )

    const convertListToRegular = useCallback(
      (list: HTMLUListElement | HTMLOListElement) => {
        Array.from(list.children).forEach((child) => {
          if (child instanceof HTMLLIElement) {
            removeCheckboxFromListItem(child)
          }
        })
        markChecklistList(list, false)
      },
      [markChecklistList, removeCheckboxFromListItem]
    )

    const normalizeChecklistItems = useCallback(() => {
      if (!editorRef.current) return

      const listItems = editorRef.current.querySelectorAll('li')
      listItems.forEach((item) => {
        const li = item as HTMLLIElement
        const checkbox = li.querySelector('input[type="checkbox"]') as HTMLInputElement | null

        if (checkbox) {
          if (!checkbox.classList.contains('checklist-checkbox')) {
            checkbox.classList.add('checklist-checkbox', 'align-middle', 'mr-2')
          }
          if (!checkbox.hasAttribute('data-checked')) {
            checkbox.setAttribute('data-checked', checkbox.checked ? 'true' : 'false')
          }
          markChecklistItem(li, true)
          ensureTextNode(li)
        } else if (li.classList.contains('checklist-item') || li.getAttribute('data-checklist') === 'true') {
          markChecklistItem(li, false)
        }
      })

      const lists = editorRef.current.querySelectorAll('ul, ol')
      lists.forEach((list) => {
        const hasCheckbox = !!list.querySelector('input[type="checkbox"]')
        markChecklistList(list as HTMLUListElement | HTMLOListElement, hasCheckbox)
      })
    }, [ensureTextNode, markChecklistItem, markChecklistList])

    // Setup mutation observer for checklist normalization
    useEffect(() => {
      if (!editorRef.current) return
      
      const observer = new MutationObserver((mutations) => {
        const hasRelevantChanges = mutations.some(mutation => {
          if (mutation.target instanceof HTMLElement) {
            const target = mutation.target
            if (target.tagName === 'LI' || target.closest('li') || target.querySelector('li')) {
              return true
            }
          }
          
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof HTMLElement) {
              if (node.tagName === 'LI' || node.querySelector('li') || node.querySelector('input[type="checkbox"]')) {
                return true
              }
            }
          }
          
          return false
        })
        
        if (hasRelevantChanges) {
          scheduleChecklistNormalization()
        }
      })
      
      observer.observe(editorRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['checked', 'data-checked']
      })
      
      mutationObserverRef.current = observer
      
      return () => {
        observer.disconnect()
        if (checklistNormalizationTimerRef.current) {
          clearTimeout(checklistNormalizationTimerRef.current)
        }
        if (activeFormatsFrameRef.current !== null) {
          window.cancelAnimationFrame(activeFormatsFrameRef.current)
        }
      }
    }, [scheduleChecklistNormalization])

    const execCommand = useCallback(
      (command: string, valueArg?: string) => {
        if (disabled || !editorRef.current) return
        
        try {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            sanitizeInlineNodes(range)
          }
          
          switch (command) {
            case 'bold':
              applyInlineStyle('strong')
              break
            case 'italic':
              applyInlineStyle('em')
              break
            case 'underline':
              applyInlineStyle('u')
              break
            case 'strikeThrough':
              applyInlineStyle('s')
              break
            case 'formatBlock':
              if (valueArg) {
                const tag = valueArg.toLowerCase().replace(/[<>]/g, '')
                if (['p', 'h1', 'h2', 'h3', 'blockquote'].includes(tag)) {
                  applyBlockFormat(tag as 'p' | 'h1' | 'h2' | 'h3' | 'blockquote', editorRef.current)
                }
              }
              break
            case 'insertUnorderedList':
              toggleListType('ul', editorRef.current)
              break
            case 'insertOrderedList':
              toggleListType('ol', editorRef.current)
              break
            default:
              console.warn(`Unsupported rich text command: ${command}`)
          }
          
          if (editorRef.current) {
            normalizeEditorContent(editorRef.current)
            mergeAdjacentLists(editorRef.current)
          }
          
          emitChange()
        } catch (error) {
          console.error('Error in execCommand:', error);
          // Try to recover gracefully
          try {
            if (editorRef.current) {
              normalizeEditorContent(editorRef.current);
            }
          } catch (e) {
            console.error('Failed to recover from execCommand error:', e);
          }
        }
      },
      [disabled, emitChange]
    )

    const applyCode = useCallback(() => {
      if (disabled) return
      try {
        applyInlineStyle('code')
        if (editorRef.current) {
          normalizeEditorContent(editorRef.current)
        }
        emitChange()
      } catch (error) {
        console.error('Error in applyCode:', error);
      }
    }, [disabled, emitChange])

    const toggleChecklist = useCallback(() => {
      if (disabled || !editorRef.current) return
      
      try {
        toggleChecklistState(editorRef.current)
        
        normalizeEditorContent(editorRef.current)
        mergeAdjacentLists(editorRef.current)
        
        emitChange()
      } catch (error) {
        console.error('Error in toggleChecklist:', error);
      }
    }, [disabled, emitChange])

    /**
     * Apply heading format - improved with better cursor positioning
     * Uses applyBlockFormat from commandDispatcher with enhanced cursor management
     */
    const applyHeading = useCallback(
      (level: 1 | 2 | 3) => {
        if (disabled || !editorRef.current) return
        
        const editor = editorRef.current
        
        // Ensure focus before any operations (critical for WebView)
        editor.focus()
        
        try {
          // Use the commandDispatcher's applyBlockFormat function
          // This already handles cursor positioning internally
          applyBlockFormat(`h${level}` as 'h1' | 'h2' | 'h3', editor)
          
          // Add heading ID after block format completes
          // Use EXTRA_LONG timing to ensure applyBlockFormat's cursor positioning (LONG=80ms) completes first
          // This prevents race conditions where we try to find the heading before cursor is properly restored
          setTimeout(() => {
            try {
              // Verify editor is still valid
              if (!editor.isConnected) {
                console.warn('Editor removed from DOM during heading operation')
                return
              }
              
              // Try to find the heading at the current cursor position first
              const selection = window.getSelection()
              let targetHeading: HTMLElement | null = null
              
              if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0)
                let node: Node | null = range.startContainer
                
                // Find the heading element containing the cursor
                while (node && node !== editor) {
                  if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node as HTMLElement
                    const tagName = element.tagName?.toLowerCase()
                    if (tagName === `h${level}`) {
                      targetHeading = element
                      break
                    }
                  }
                  node = node.parentElement
                }
              }
              
              // If we found a heading at cursor position, assign ID to it
              // Only assign if the heading doesn't already have an ID
              if (targetHeading && !targetHeading.id) {
                targetHeading.id = generateHeadingId(targetHeading.textContent || '')
              }
              
              // Normalize and emit change once
              normalizeEditorContent(editor)
              emitChange()
            } catch (error) {
              console.error('Error in heading ID assignment:', error)
            }
          }, CURSOR_TIMING.EXTRA_LONG)
        } catch (error) {
          console.error('Error in applyHeading:', error)
          // Try to recover by normalizing
          try {
            normalizeEditorContent(editor)
          } catch (e) {
            console.error('Failed to recover from applyHeading error:', e)
          }
        }
      },
      [disabled, emitChange]
    )

    const getHeadings = useCallback(() => {
      if (!editorRef.current) return []
      const headings = editorRef.current.querySelectorAll('h1, h2, h3')
      return Array.from(headings).map((heading) => ({
        id: heading.id || '',
        level: parseInt(heading.tagName.substring(1)),
        text: heading.textContent || ''
      }))
    }, [])

    // Save current selection
    const saveSelection = useCallback(() => {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
      }
    }, [])

    // Restore saved selection
    const restoreSelection = useCallback(() => {
      if (savedSelectionRef.current) {
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(savedSelectionRef.current)
      }
    }, [])

    // Validate URL
    const validateUrl = useCallback((url: string): { valid: boolean; error: string } => {
      if (!url.trim()) {
        return { valid: false, error: 'URL is required' }
      }

      try {
        const trimmed = url.trim()
        const lowerTrimmed = trimmed.toLowerCase()
        
        // Check for common XSS patterns
        if (lowerTrimmed.startsWith('javascript:') || 
            lowerTrimmed.startsWith('data:') ||
            lowerTrimmed.startsWith('vbscript:')) {
          return { valid: false, error: 'Invalid or dangerous protocol' }
        }
        
        // Add protocol if missing
        let testUrl = trimmed
        if (!testUrl.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:/)) {
          testUrl = 'https://' + testUrl
        }
        
        const urlObj = new URL(testUrl)
        
        // Check for valid protocols only
        if (!['http:', 'https:', 'mailto:', 'tel:'].includes(urlObj.protocol)) {
          return { valid: false, error: 'Invalid protocol. Use http, https, mailto, or tel' }
        }
        
        // Additional validation for http/https
        if (['http:', 'https:'].includes(urlObj.protocol)) {
          if (!urlObj.hostname || urlObj.hostname.length < 2) {
            return { valid: false, error: 'Invalid hostname' }
          }
        }
        
        return { valid: true, error: '' }
      } catch (error) {
        console.error('URL validation error:', error)
        return { valid: false, error: 'Invalid URL format' }
      }
    }, [])

    // Normalize URL (add https:// if missing)
    const normalizeUrl = useCallback((url: string): string => {
      const trimmed = url.trim()
      if (!trimmed) return trimmed
      
      const lowerTrimmed = trimmed.toLowerCase()
      
      // Prevent XSS through URL
      if (lowerTrimmed.startsWith('javascript:') || 
          lowerTrimmed.startsWith('data:') ||
          lowerTrimmed.startsWith('vbscript:')) {
        return ''
      }
      
      if (!trimmed.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:/)) {
        return 'https://' + trimmed
      }
      
      return trimmed
    }, [])

    // Add to recent links
    const addToRecentLinks = useCallback((url: string, text: string) => {
      setRecentLinks(prev => {
        const filtered = prev.filter(link => link.url !== url)
        const updated = [{ url, text, timestamp: Date.now() }, ...filtered].slice(0, 5)
        
        // Save to localStorage
        try {
          localStorage.setItem('editor-recent-links', JSON.stringify(updated))
        } catch {}
        
        return updated
      })
    }, [])

    // Load recent links from localStorage
    useEffect(() => {
      try {
        const stored = localStorage.getItem('editor-recent-links')
        if (stored) {
          const links = JSON.parse(stored)
          setRecentLinks(links)
        }
      } catch {}
    }, [])

    // Link functionality
    const insertLink = useCallback(() => {
      if (disabled) return
      
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      const range = selection.getRangeAt(0)
      const selectedText = range.toString()

      let node = range.commonAncestorContainer
      if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentNode!
      }
      const existingLink = (node as Element).closest('a')

      if (existingLink) {
        setLinkUrl(existingLink.getAttribute('href') || '')
        setLinkText(existingLink.textContent || '')
      } else {
        setLinkUrl('')
        setLinkText(selectedText)
      }

      setLinkUrlError('')
      saveSelection()
      setShowLinkDialog(true)
    }, [disabled, saveSelection])

    const applyLink = useCallback(() => {
      try {
        // Validate URL
        const validation = validateUrl(linkUrl)
        if (!validation.valid) {
          setLinkUrlError(validation.error)
          return
        }

        const normalizedUrl = normalizeUrl(linkUrl)
        
        // Additional safety check
        if (!normalizedUrl) {
          setLinkUrlError('Invalid URL')
          return
        }
        
        restoreSelection()

        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
          console.warn('No selection available for link insertion')
          return
        }

        const range = selection.getRangeAt(0)
        
        let node = range.commonAncestorContainer
        if (node.nodeType === Node.TEXT_NODE) {
          node = node.parentNode!
        }
        const existingLink = (node as Element).closest('a')
        
        if (existingLink) {
          existingLink.setAttribute('href', normalizedUrl)
          existingLink.textContent = linkText || normalizedUrl
          existingLink.className = 'text-blue-600 hover:text-blue-800 underline decoration-blue-400 decoration-2 underline-offset-2 transition-colors cursor-pointer inline-flex items-center gap-1'
        } else {
          const link = document.createElement('a')
          link.href = normalizedUrl
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          link.className = 'text-blue-600 hover:text-blue-800 underline decoration-blue-400 decoration-2 underline-offset-2 transition-colors cursor-pointer inline-flex items-center gap-1'
          link.textContent = linkText || normalizedUrl

          if (range.collapsed) {
            range.insertNode(link)
          } else {
            range.deleteContents()
            range.insertNode(link)
          }
          
          // Position cursor after the link for better UX
          applyCursorOperation(() => {
            try {
              const newRange = document.createRange()
              newRange.setStartAfter(link)
              newRange.collapse(true)
              selection.removeAllRanges()
              selection.addRange(newRange)
            } catch (error) {
              console.warn('Error positioning cursor after link:', error)
            }
          }, CURSOR_TIMING.SHORT)
        }

        // Add to recent links
        addToRecentLinks(normalizedUrl, linkText || normalizedUrl)

        setShowLinkDialog(false)
        setLinkUrl('')
        setLinkText('')
        setLinkUrlError('')
        emitChange()
        
        // Ensure focus returns to editor
        applyCursorOperation(() => {
          editorRef.current?.focus()
        }, CURSOR_TIMING.MEDIUM)
      } catch (error) {
        console.error('Error applying link:', error)
        setLinkUrlError('Failed to create link')
      }
    }, [linkUrl, linkText, restoreSelection, emitChange, validateUrl, normalizeUrl, addToRecentLinks])

    // Show link popover on hover
    const showLinkPopoverForElement = useCallback((linkElement: HTMLAnchorElement) => {
      if (linkPopoverTimeoutRef.current) {
        clearTimeout(linkPopoverTimeoutRef.current)
      }

      const rect = linkElement.getBoundingClientRect()
      const top = rect.bottom + window.scrollY + 8
      const left = rect.left + window.scrollX

      setLinkPopoverPos({ top, left })
      setHoveredLinkElement(linkElement)
      setShowLinkPopover(true)
    }, [])

    // Hide link popover
    const hideLinkPopover = useCallback(() => {
      linkPopoverTimeoutRef.current = setTimeout(() => {
        setShowLinkPopover(false)
        setHoveredLinkElement(null)
      }, 200)
    }, [])

    // Keep popover open when hovering over it
    const keepPopoverOpen = useCallback(() => {
      if (linkPopoverTimeoutRef.current) {
        clearTimeout(linkPopoverTimeoutRef.current)
      }
    }, [])

    // Copy link to clipboard
    const copyLinkUrl = useCallback(async (url: string) => {
      try {
        await navigator.clipboard.writeText(url)
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      } catch (err) {
        console.error('Failed to copy link:', err)
      }
    }, [])

    // Edit link
    const editLink = useCallback((linkElement: HTMLAnchorElement) => {
      setLinkUrl(linkElement.getAttribute('href') || '')
      setLinkText(linkElement.textContent || '')
      setLinkUrlError('')
      setShowLinkPopover(false)
      
      // Select the link element
      const range = document.createRange()
      range.selectNodeContents(linkElement)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      
      saveSelection()
      setShowLinkDialog(true)
    }, [saveSelection])

    // Remove link
    const removeLink = useCallback((linkElement: HTMLAnchorElement) => {
      const text = linkElement.textContent || ''
      const textNode = document.createTextNode(text)
      linkElement.parentNode?.replaceChild(textNode, linkElement)
      setShowLinkPopover(false)
      emitChange()
    }, [emitChange])

    // Open link in new tab
    const openLink = useCallback((url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    }, [])

    // Link hover detection
    useEffect(() => {
      if (!editorRef.current) return

      const handleMouseOver = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null
        if (target) {
          const linkElement = target.closest('a[href]') as HTMLAnchorElement | null
          if (linkElement && !linkElement.closest('[data-block-type="note-link"]')) {
            showLinkPopoverForElement(linkElement)
          }
        }
      }

      const handleMouseOut = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null
        const relatedTarget = event.relatedTarget as HTMLElement | null
        
        if (target && target.closest('a[href]') && !relatedTarget?.closest('a[href]') && !relatedTarget?.closest('.link-popover')) {
          hideLinkPopover()
        }
      }

      const editor = editorRef.current
      editor.addEventListener('mouseover', handleMouseOver)
      editor.addEventListener('mouseout', handleMouseOut)
      
      return () => {
        editor.removeEventListener('mouseover', handleMouseOver)
        editor.removeEventListener('mouseout', handleMouseOut)
      }
    }, [showLinkPopoverForElement, hideLinkPopover])

    // Search functionality
    const highlightMatch = useCallback((matchIndex: number) => {
      if (!editorRef.current || matchIndex < 0 || matchIndex >= searchMatches.length) return

      try {
        const match = searchMatches[matchIndex]
        const range = document.createRange()
        const selection = window.getSelection()
        
        if (!selection) {
          console.warn('No selection available for highlighting match')
          return
        }
        
        const walker = document.createTreeWalker(
          editorRef.current,
          NodeFilter.SHOW_TEXT,
          null
        )

        let currentPos = 0
        let node = walker.nextNode()

        while (node) {
          const nodeLength = node.textContent?.length || 0
          if (currentPos + nodeLength > match.index) {
            const rawOffset = match.index - currentPos
            const offset = Math.max(0, Math.min(rawOffset, nodeLength))
            const endOffset = Math.min(offset + match.length, nodeLength)
            
            // Set range with clamped offsets
            range.setStart(node, offset)
            range.setEnd(node, endOffset)
            break
          }
          currentPos += nodeLength
          node = walker.nextNode()
        }

        selection.removeAllRanges()
        selection.addRange(range)
        
        // Safely scroll into view
        const containerElement = range.startContainer.parentElement
        if (containerElement && containerElement.scrollIntoView) {
          containerElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          })
        }
      } catch (error) {
        console.error('Error highlighting match:', error)
      }
    }, [searchMatches])

    const performSearch = useCallback(() => {
      try {
        if (!editorRef.current || !searchQuery) {
          setSearchMatches([])
          return
        }

        const content = editorRef.current.textContent || ''
        const query = caseSensitive ? searchQuery : searchQuery.toLowerCase()
        const searchIn = caseSensitive ? content : content.toLowerCase()
        
        const matches: SearchMatch[] = []
        let index = searchIn.indexOf(query)
        
        // Limit matches to prevent performance issues
        let matchCount = 0
        
        while (index !== -1 && matchCount < MAX_SEARCH_MATCHES) {
          matches.push({
            index,
            length: searchQuery.length,
            text: content.substring(index, index + searchQuery.length)
          })
          index = searchIn.indexOf(query, index + 1)
          matchCount++
        }

        if (matchCount >= MAX_SEARCH_MATCHES) {
          console.warn(`Search limited to ${MAX_SEARCH_MATCHES} matches`)
        }

        setSearchMatches(matches)
        setCurrentMatchIndex(0)
        
        if (matches.length > 0) {
          highlightMatch(0)
        }
      } catch (error) {
        console.error('Error performing search:', error)
        setSearchMatches([])
      }
    }, [searchQuery, caseSensitive, highlightMatch])

    const nextMatch = useCallback(() => {
      try {
        if (searchMatches.length === 0) return
        const nextIndex = (currentMatchIndex + 1) % searchMatches.length
        setCurrentMatchIndex(nextIndex)
        highlightMatch(nextIndex)
      } catch (error) {
        console.error('Error navigating to next match:', error)
      }
    }, [currentMatchIndex, searchMatches, highlightMatch])

    const previousMatch = useCallback(() => {
      try {
        if (searchMatches.length === 0) return
        const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length
        setCurrentMatchIndex(prevIndex)
        highlightMatch(prevIndex)
      } catch (error) {
        console.error('Error navigating to previous match:', error)
      }
    }, [currentMatchIndex, searchMatches, highlightMatch])

    const replaceCurrentMatch = useCallback(() => {
      if (searchMatches.length === 0 || !editorRef.current) return
      
      try {
        highlightMatch(currentMatchIndex)
        const replaced = insertPlainTextAtSelection(replaceQuery)

        if (replaced) {
          normalizeEditorContent(editorRef.current)
          mergeAdjacentLists(editorRef.current)
          scheduleChecklistNormalization()
        }
        
        emitChange()
        performSearch()
      } catch (error) {
        console.error('Error replacing current match:', error)
      }
    }, [currentMatchIndex, replaceQuery, searchMatches, highlightMatch, insertPlainTextAtSelection, emitChange, performSearch, scheduleChecklistNormalization])

    const replaceAllMatches = useCallback(() => {
      if (!editorRef.current || !searchQuery) return
      
      try {
        const content = editorRef.current.innerHTML
        const flags = caseSensitive ? 'g' : 'gi'
        
        // Escape special regex characters
        const escapedQuery = searchQuery.replace(REGEX_ESCAPE_PATTERN, '\\$&')
        
        // Count matches efficiently without creating array
        const searchIn = caseSensitive ? content : content.toLowerCase()
        const queryLower = caseSensitive ? escapedQuery : escapedQuery.toLowerCase()
        let matchCount = 0
        let pos = searchIn.indexOf(queryLower)
        
        while (pos !== -1 && matchCount < MAX_REPLACE_MATCHES) {
          matchCount++
          pos = searchIn.indexOf(queryLower, pos + 1)
        }
        
        if (matchCount >= MAX_REPLACE_MATCHES) {
          console.warn(`Too many matches (${matchCount}+) for replace all operation, limit is ${MAX_REPLACE_MATCHES}`)
          return
        }
        
        // Perform the replacement
        const regex = new RegExp(escapedQuery, flags)
        const newContent = content.replace(regex, replaceQuery)
        
        editorRef.current.innerHTML = newContent
        normalizeEditorContent(editorRef.current)
        mergeAdjacentLists(editorRef.current)
        scheduleChecklistNormalization()
        emitChange()
        performSearch()
      } catch (error) {
        console.error('Error replacing all matches:', error)
      }
    }, [searchQuery, replaceQuery, caseSensitive, emitChange, performSearch, scheduleChecklistNormalization])

    // Horizontal rule
    const insertHorizontalRule = useCallback(() => {
      if (disabled || !editorRef.current) return
      
      try {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
          console.warn('No selection for horizontal rule insertion')
          return
        }
        
        const range = selection.getRangeAt(0)
        const hr = document.createElement('hr')
        range.insertNode(hr)
        
        const p = document.createElement('p')
        p.appendChild(document.createElement('br'))
        
        if (hr.parentNode) {
          hr.parentNode.insertBefore(p, hr.nextSibling)
          
          // Use improved cursor positioning
          positionCursorInElement(p, 'start', editorRef.current)
        } else {
          console.warn('Horizontal rule has no parent, cannot insert paragraph')
        }
        
        emitChange()
      } catch (error) {
        console.error('Error inserting horizontal rule:', error)
      }
    }, [disabled, emitChange])

    const createRootLevelBlock = useCallback(() => {
      if (!editorRef.current) return null

      try {
        const newBlock = document.createElement('div')
        newBlock.setAttribute('data-block', 'true')
        newBlock.className = 'block-root rounded-xl border border-slate-200 bg-white/80 px-3 py-2 my-3 shadow-sm'

        const paragraph = document.createElement('p')
        paragraph.appendChild(document.createElement('br'))
        newBlock.appendChild(paragraph)

        const selection = window.getSelection()
        let anchorBlock: HTMLElement | null = null
        if (selection && selection.rangeCount > 0) {
          const anchorNode = selection.getRangeAt(0).startContainer
          anchorBlock = (anchorNode instanceof HTMLElement ? anchorNode : anchorNode.parentElement)?.closest(
            '[data-block-id]'
          ) as HTMLElement | null
        }

        if (anchorBlock && anchorBlock.parentElement === editorRef.current) {
          anchorBlock.insertAdjacentElement('afterend', newBlock)
        } else {
          editorRef.current.appendChild(newBlock)
        }

        ensureBlockId(newBlock)
        const target = (newBlock.querySelector('p, div, span') as HTMLElement | null) ?? newBlock
        positionCursorInElement(target, 'start', editorRef.current)
        normalizeEditorContent(editorRef.current)
        emitChange()
        updateBlockMetadata()
        return newBlock
      } catch (error) {
        console.error('Error creating root level block:', error)
        return null
      }
    }, [emitChange, ensureBlockId, updateBlockMetadata])

    /**
     * Execute a rich text command
     * This is the main entry point for all formatting commands
     */
    const executeRichTextCommand = useCallback((cmd: RichTextCommand) => {
      switch (cmd) {
        case 'bold':
          execCommand('bold')
          break
        case 'italic':
          execCommand('italic')
          break
        case 'underline':
          execCommand('underline')
          break
        case 'strike':
          execCommand('strikeThrough')
          break
        case 'code':
          applyCode()
          break
        case 'unordered-list':
          execCommand('insertUnorderedList')
          break
        case 'ordered-list':
          execCommand('insertOrderedList')
          break
        case 'blockquote':
          execCommand('formatBlock', 'blockquote')
          break
        case 'checklist':
          toggleChecklist()
          break
        case 'heading1':
          applyHeading(1)
          break
        case 'heading2':
          applyHeading(2)
          break
        case 'heading3':
          applyHeading(3)
          break
        case 'horizontal-rule':
          insertHorizontalRule()
          break
        case 'link':
          insertLink()
          break
        case 'undo':
          historyManagerRef.current?.undo()
          break
        case 'redo':
          historyManagerRef.current?.redo()
          break
      }
    }, [execCommand, applyCode, toggleChecklist, applyHeading, insertHorizontalRule, insertLink])

    const handleBlockTypeChange = useCallback((value: string) => {
      if (disabled || !editorRef.current) return
      
      try {
        switch (value) {
          case 'heading1':
            applyHeading(1)
            break
          case 'heading2':
            applyHeading(2)
            break
          case 'heading3':
            applyHeading(3)
            break
          case 'blockquote':
            execCommand('formatBlock', 'blockquote')
            break
          case 'paragraph':
          case 'p':
            execCommand('formatBlock', 'p')
            break
          default:
            console.warn('Unknown block type:', value)
        }
      } catch (error) {
        console.error('Error in handleBlockTypeChange:', error)
      }
    }, [disabled, applyHeading, execCommand])

    const scrollToHeading = useCallback((headingId: string) => {
      if (!editorRef.current || !headingId) return
      
      const escapedId = typeof CSS !== 'undefined' && CSS.escape 
        ? CSS.escape(headingId)
        : headingId.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&')
      const heading = editorRef.current.querySelector(`#${escapedId}`)
      if (heading && heading instanceof HTMLElement) {
        const editorRect = editorRef.current.getBoundingClientRect()
        const headingRect = heading.getBoundingClientRect()
        
        const scrollTop = editorRef.current.scrollTop + (headingRect.top - editorRect.top) - 16
        
        editorRef.current.scrollTo({
          top: scrollTop,
          behavior: 'smooth'
        })
      }
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        focus: () => editorRef.current?.focus(),
        getHTML: () => sanitize(editorRef.current?.innerHTML ?? ''),
        getMarkdown: () => htmlToMarkdown(editorRef.current?.innerHTML ?? ''),
        getHeadings,
        getRootElement: () => editorRef.current,
        scrollToHeading,
        queryCommandState: (command: string) => {
          try {
            const selection = window.getSelection()
            if (!selection || selection.rangeCount === 0) return false
            
            const range = selection.getRangeAt(0)
            const node = range.commonAncestorContainer
            const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
            
            switch (command) {
              case 'bold':
                return !!element?.closest('strong, b')
              case 'italic':
                return !!element?.closest('em, i')
              case 'underline':
                return !!element?.closest('u')
              case 'strikeThrough':
                return !!element?.closest('s, strike')
              case 'code':
                return !!element?.closest('code')
              case 'insertUnorderedList':
                return !!element?.closest('ul')
              case 'insertOrderedList':
                return !!element?.closest('ol')
              case 'heading1':
                return !!element?.closest('h1')
              case 'heading2':
                return !!element?.closest('h2')
              case 'heading3':
                return !!element?.closest('h3')
              case 'blockquote':
                return !!element?.closest('blockquote')
              default:
                try {
                  return document.queryCommandState?.(command) ?? false
                } catch {
                  return false
                }
            }
          } catch {
            return false
          }
        },
        showLinkDialog: () => {
          insertLink()
        },
        showSearchDialog: () => {
          setShowSearchDialog(true)
        },
        showTableDialog: () => {
          saveSelection()
          setTableRows(3)
          setTableCols(3)
          setShowTableDialog(true)
        },
        requestNoteLink: () => {
          saveSelection()
          onCustomCommand?.('note-link')
        },
        insertCustomBlock: (type: string, payload?: any) => {
          return insertCustomBlock(type, payload)
        },
        getBlockPayloads: () => {
          if (!editorRef.current) return []
          const nodes = Array.from(editorRef.current.querySelectorAll('[data-block][data-block-type]'))
          return nodes.map((n) => {
            const type = n.getAttribute('data-block-type') || ''
            const raw = n.getAttribute('data-block-payload')
            let payload: any = undefined
            if (raw) {
              try {
                payload = JSON.parse(decodeURIComponent(raw))
              } catch {}
            }
            return { type, payload, node: n }
          })
        },
        exec: (command: RichTextCommand) => {
          executeRichTextCommand(command)
        }
      }),
      [sanitize, getHeadings, scrollToHeading, executeRichTextCommand, insertCustomBlock, saveSelection, onCustomCommand, insertLink]
    )

    // Initialize history manager
    useEffect(() => {
      if (editorRef.current && !historyManagerRef.current) {
        const manager = new HistoryManager(editorRef.current)
        manager.initialize()
        historyManagerRef.current = manager
        debouncedCaptureRef.current = createDebouncedCapture(manager)
      }
    }, [])

    useEffect(() => {
      if (!editorRef.current) return

      try {
        const editorEl = editorRef.current
        
        // Validate editor is still connected to DOM
        if (!editorEl.isConnected) {
          console.warn('Editor not connected to DOM during value sync')
          return
        }
        
        const sanitizedValue = sanitize(value || '')

        // Only update if value has actually changed to prevent unnecessary renders
        if (lastSyncedValueRef.current !== sanitizedValue) {
          // Store cursor position before update
          const savedCursorPos = saveCursorPosition(editorEl)
          
          editorEl.innerHTML = sanitizedValue
          lastSyncedValueRef.current = sanitizedValue
          
          // Restore cursor position after update if it was valid
          if (savedCursorPos) {
            try {
              restoreCursorPosition(savedCursorPos, editorEl)
            } catch (error) {
              console.warn('Could not restore cursor position:', error)
            }
          }
          
          if (historyManagerRef.current) {
            try {
              historyManagerRef.current.capture()
            } catch (error) {
              console.error('Error capturing history:', error)
            }
          }
        }

        scheduleChecklistNormalization()
        // attempt to rehydrate any custom blocks that came from loaded HTML
        rehydrateExistingBlocks()
        updateBlockMetadata()
      } catch (error) {
        console.error('Error synchronizing editor value:', error)
      }
    }, [sanitize, value, scheduleChecklistNormalization, rehydrateExistingBlocks, updateBlockMetadata])

    useEffect(() => {
      if (!editorRef.current) return

      const handleCheckboxChange = (event: Event) => {
        const target = event.target as HTMLInputElement | null
        if (!target || target.type !== 'checkbox') return
        target.setAttribute('data-checked', target.checked ? 'true' : 'false')
        if (target.checked) {
          target.setAttribute('checked', 'true')
        } else {
          target.removeAttribute('checked')
        }
        emitChange()
      }

      const el = editorRef.current
      el.addEventListener('change', handleCheckboxChange)
      return () => {
        el.removeEventListener('change', handleCheckboxChange)
      }
    }, [emitChange])

    // Initialize image block interactions (resize and delete)
    useEffect(() => {
      if (!editorRef.current) return
      
      // Dynamically import and initialize image block interactions
      let cleanupFn: (() => void) | undefined = undefined
      
      const initImageBlocks = async () => {
        try {
          const { initializeImageBlockInteractions } = await import('@/lib/editor/imageBlock')
          cleanupFn = initializeImageBlockInteractions(editorRef.current!, emitChange)
        } catch (error) {
          console.error('Failed to initialize image block interactions:', error)
        }
      }
      
      initImageBlocks()
      
      return () => {
        if (cleanupFn) {
          cleanupFn()
        }
      }
    }, [emitChange])

    const handleInput = () => {
      try {
        // Validate editor is still connected to DOM
        if (!editorRef.current || !editorRef.current.isConnected) {
          console.warn('Editor disconnected during input')
          return
        }
        emitChange()
      } catch (error) {
        console.error('Error in handleInput:', error)
      }
    }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    try {
      // Validate editor state
      if (disabled || !editorRef.current || !editorRef.current.isConnected) {
        return
      }

      // Handle autoformatting
      if (autoformatEnabled && shouldApplyAutoformat(event.nativeEvent)) {
        try {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            const node = range.startContainer
            
            // Check for inline autoformatting (bold, italic, etc.)
            if (node.nodeType === Node.TEXT_NODE && event.key === ' ') {
              const textNode = node as Text
              const cursorOffset = range.startOffset
              
              if (applyAutoformat(textNode, cursorOffset)) {
                event.preventDefault()
                emitChange()
                return
              }
            }
            
            // Check for list prefix patterns (at start of line)
            if (event.key === ' ') {
              const textNode = node.nodeType === Node.TEXT_NODE ? node as Text : null
              if (textNode) {
                const text = textNode.textContent?.substring(0, range.startOffset) || ''
                const lineStart = text.lastIndexOf('\n') + 1
                const lineText = text.substring(lineStart)
                const action = checkListPrefixPattern(lineText)
                
                if (action) {
                  event.preventDefault()
                  
                  // Remove the pattern text
                  const patternLength = lineText.length
                  const removeRange = document.createRange()
                  removeRange.setStart(textNode, range.startOffset - patternLength)
                  removeRange.setEnd(textNode, range.startOffset)
                  removeRange.deleteContents()
                  
                  // Apply the formatting
                  switch (action) {
                    case 'unordered-list':
                      execCommand('insertUnorderedList')
                      break
                    case 'ordered-list':
                      execCommand('insertOrderedList')
                      break
                    case 'checklist':
                      toggleChecklist()
                      break
                    case 'heading1':
                      applyHeading(1)
                      break
                    case 'heading2':
                      applyHeading(2)
                      break
                    case 'heading3':
                      applyHeading(3)
                      break
                    case 'blockquote':
                      execCommand('formatBlock', 'blockquote')
                      break
                    case 'horizontal-rule':
                      insertHorizontalRule()
                      break
                  }
                  
                  emitChange()
                  return
                }
              }
            }
          }
        } catch (error) {
          console.error('Error in autoformatting:', error)
        }
      }
      
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        try {
          event.preventDefault()
          createRootLevelBlock()
          return
        } catch (error) {
          console.error('Error creating root level block:', error)
        }
      }

      // Handle Enter key for checklist items
      if (event.key === 'Enter' && !event.shiftKey) {
        try {
          const selection = window.getSelection()
          const currentListItem = getClosestListItem(selection?.anchorNode ?? null)
          if (currentListItem) {
            const hasCheckbox = !!currentListItem.querySelector('input[type="checkbox"]')
            const isChecklist =
              hasCheckbox ||
              currentListItem.classList.contains('checklist-item') ||
              currentListItem.getAttribute('data-checklist') === 'true'

            if (isChecklist) {
              const list = currentListItem.parentElement
              if (list) {
                const textContent = getChecklistItemText(currentListItem)

                if (textContent.length === 0) {
                  event.preventDefault()

                  const parent = list.parentElement
                  const paragraph = document.createElement('p')
                  paragraph.appendChild(document.createElement('br'))

                  list.removeChild(currentListItem)
                  if (list.childElementCount === 0) {
                    list.remove()
                  }

                  if (parent) {
                    parent.insertBefore(paragraph, list.nextSibling)
                  } else {
                    editorRef.current?.appendChild(paragraph)
                  }

                  // Use improved cursor positioning
                  positionCursorInElement(paragraph, 'start', editorRef.current || undefined)

                  emitChange()
                  return
                }

                // Use applyCursorOperation for consistent timing
                applyCursorOperation(() => {
                  const postSelection = window.getSelection()
                  const newListItem = getClosestListItem(postSelection?.anchorNode ?? null)
                  if (!newListItem || newListItem === currentListItem) {
                    return
                  }

                  if (!newListItem.querySelector('input[type="checkbox"]')) {
                    addCheckboxToListItem(newListItem)
                  } else {
                    markChecklistItem(newListItem, true)
                  }

                  emitChange()
                }, CURSOR_TIMING.SHORT)
              }
            }
          }
        } catch (error) {
          console.error('Error handling checklist Enter key:', error)
        }
      }

      // Handle keyboard shortcuts
      try {
        if (!(event.metaKey || event.ctrlKey)) return
        const key = event.key.toLowerCase()

        if (key === 'b' && !event.shiftKey) {
          event.preventDefault()
          execCommand('bold')
        } else if (key === 'i') {
          event.preventDefault()
          execCommand('italic')
        } else if (key === 'u') {
          event.preventDefault()
          execCommand('underline')
        } else if (event.shiftKey && key === 'x') {
          event.preventDefault()
          execCommand('strikeThrough')
        } else if (event.shiftKey && key === 'c') {
          event.preventDefault()
          toggleChecklist()
        } else if (event.shiftKey && key === 'b') {
          event.preventDefault()
          execCommand('formatBlock', 'blockquote')
        } else if (event.shiftKey && key === 'l') {
          event.preventDefault()
          execCommand('insertUnorderedList')
        } else if (event.shiftKey && key === 'o') {
          event.preventDefault()
          execCommand('insertOrderedList')
        } else if (event.altKey && key === '1') {
          event.preventDefault()
          applyHeading(1)
        } else if (event.altKey && key === '2') {
          event.preventDefault()
          applyHeading(2)
        } else if (event.altKey && key === '3') {
          event.preventDefault()
          applyHeading(3)
        } else if (key === '`') {
          event.preventDefault()
          applyCode()
        } else if (key === 'k') {
          event.preventDefault()
          insertLink()
        } else if (key === 'f') {
          event.preventDefault()
          setShowSearchDialog(true)
        } else if (key === 'z') {
          event.preventDefault()
          if (event.shiftKey) {
            historyManagerRef.current?.redo()
          } else {
            historyManagerRef.current?.undo()
          }
        }
      } catch (error) {
        console.error('Error handling keyboard shortcut:', error)
      }
    } catch (error) {
      console.error('Critical error in handleKeyDown:', error)
    }
  }

    const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()

      try {
        const finalizeInsertion = () => {
          try {
            if (editorRef.current) {
              normalizeEditorContent(editorRef.current)
              mergeAdjacentLists(editorRef.current)
            }
            scheduleChecklistNormalization()
            emitChange()
          } catch (error) {
            console.error('Error finalizing paste:', error);
          }
        }

        const html = event.clipboardData.getData('text/html')
        const text = event.clipboardData.getData('text/plain')

        if (html) {
          try {
            const sanitized = sanitize(html)
            if (insertHTMLAtSelection(sanitized)) {
              finalizeInsertion()
            }
          } catch (error) {
            console.error('Error pasting HTML:', error);
            // Fallback to plain text
            if (text && insertPlainTextAtSelection(text)) {
              finalizeInsertion()
            }
          }
          return
        }

        if (!text) {
          return
        }

        if (looksLikeMarkdown(text)) {
          const selectionSnapshot = saveSelectionUtil()
          markdownToHtml(text).then((convertedHtml) => {
            try {
              if (selectionSnapshot) {
                restoreSelectionUtil(selectionSnapshot)
              }

              const sanitized = sanitize(convertedHtml)
              if (insertHTMLAtSelection(sanitized)) {
                finalizeInsertion()
              }
            } catch (error) {
              console.error('Error pasting markdown:', error);
            }
          }).catch(error => {
            console.error('Error converting markdown:', error);
            // Fallback to plain text
            try {
              if (insertPlainTextAtSelection(text)) {
                finalizeInsertion()
              }
            } catch (e) {
              console.error('Error in markdown fallback:', e);
            }
          })
          return
        }

        const trimmed = text.trim()
        const urlPattern = /^https?:\/\/.+/i

        if (urlPattern.test(trimmed)) {
          try {
            const selection = window.getSelection()
            const selectedText = selection?.toString()

            if (selectedText && selectedText.length > 0 && selection && selection.rangeCount > 0) {
              const link = document.createElement('a')
              link.href = trimmed
              link.target = '_blank'
              link.rel = 'noopener noreferrer'
              link.textContent = selectedText

              const range = selection.getRangeAt(0)
              range.deleteContents()
              range.insertNode(link)

              const newRange = document.createRange()
              if (link.childNodes.length > 0) {
                newRange.setStart(link, link.childNodes.length)
              } else {
                newRange.setStartAfter(link)
              }
              newRange.collapse(true)
              selection.removeAllRanges()
              selection.addRange(newRange)

              finalizeInsertion()
              return
            }

            const fragment = document.createDocumentFragment()
            const anchor = document.createElement('a')
            anchor.href = trimmed
            anchor.target = '_blank'
            anchor.rel = 'noopener noreferrer'
            anchor.textContent = trimmed
            fragment.appendChild(anchor)

            if (insertFragmentAtSelection(fragment)) {
              finalizeInsertion()
            }
          } catch (error) {
            console.error('Error pasting URL:', error);
            // Fallback to plain text
            if (insertPlainTextAtSelection(text)) {
              finalizeInsertion()
            }
          }
          return
        }

        if (insertPlainTextAtSelection(text)) {
          finalizeInsertion()
        }
      } catch (error) {
        console.error('Critical error in handlePaste:', error);
      }
    }

    const toolbarButtonClass =
      'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-white text-slate-600 shadow-sm hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40'

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <EditorToolbar
          onCommand={executeRichTextCommand}
          onBlockTypeChange={handleBlockTypeChange}
          onUndo={() => historyManagerRef.current?.undo()}
          onRedo={() => historyManagerRef.current?.redo()}
          onNewBlock={createRootLevelBlock}
          onToggleBlockPanel={() => setBlockPanelOpen((prev) => !prev)}
          onToggleBlockOutlines={() => setShowBlockOutlines((prev) => !prev)}
          blockPanelOpen={blockPanelOpen}
          showBlockOutlines={showBlockOutlines}
          activeBlockId={activeBlockId}
          activeBlockType={blockMetadata.find((block) => block.id === activeBlockId)?.type}
          activeFormats={activeFormats}
          disabled={disabled}
        />

        <div className="flex-1 min-h-0 overflow-hidden">
          <div
            ref={editorRef}
            className="h-full w-full overflow-y-auto whitespace-pre-wrap break-words p-3 focus:outline-none sm:p-4"
            contentEditable={!disabled}
            data-placeholder={placeholder}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            suppressContentEditableWarning
            spellCheck
            role="textbox"
            aria-label="Rich text editor"
            aria-multiline="true"
            aria-disabled={disabled}
          />

          {blockPanelOpen && (
            <div className="fixed right-4 top-24 z-50 w-80 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Block navigator</p>
                  <p className="text-xs text-slate-500">{blockMetadata.length} blocks</p>
                </div>
                <button
                  className="text-slate-400 transition hover:text-slate-600"
                  onClick={() => setBlockPanelOpen(false)}
                  aria-label="Close block navigator"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {blockMetadata.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-500">Start typing to create blocks.</p>
                ) : (
                  blockMetadata.map((block) => (
                    <button
                      key={block.id}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-slate-50 ${
                        activeBlockId === block.id ? 'bg-blue-50/80 ring-1 ring-blue-200' : ''
                      }`}
                      onClick={() => focusBlockById(block.id)}
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <span>Block {block.index}</span>
                        <span>{block.type}</span>
                      </div>
                      <p className="text-sm text-slate-700">
                        {block.textPreview}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Link Dialog - Enhanced */}
        {showLinkDialog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Link2 size={20} className="text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900">Insert Link</h3>
                </div>
                <button
                  onClick={() => {
                    setShowLinkDialog(false)
                    setLinkUrl('')
                    setLinkText('')
                    setLinkUrlError('')
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
                  aria-label="Close dialog"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-5">
                {/* URL Input */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                    <Globe size={16} />
                    URL
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(e) => {
                        setLinkUrl(e.target.value)
                        setLinkUrlError('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          applyLink()
                        }
                      }}
                      placeholder="https://example.com or example.com"
                      className={`w-full px-4 py-3 pr-10 border-2 ${
                        linkUrlError 
                          ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                          : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500'
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

                {/* Text Input */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                    <Edit2 size={16} />
                    Link Text (optional)
                  </label>
                  <input
                    type="text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        applyLink()
                      }
                    }}
                    placeholder="Custom display text"
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 transition-all text-slate-900 placeholder-slate-400"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Leave empty to use the URL as display text
                  </p>
                </div>

                {/* Recent Links */}
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
                          onClick={() => {
                            setLinkUrl(recent.url)
                            setLinkText(recent.text)
                            setLinkUrlError('')
                          }}
                          className="w-full px-3 py-2 text-left rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all group"
                        >
                          <div className="flex items-center gap-2">
                            <ExternalLink size={14} className="text-slate-400 group-hover:text-blue-600" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">
                                {recent.text}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {recent.url}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    onClick={() => {
                      setShowLinkDialog(false)
                      setLinkUrl('')
                      setLinkText('')
                      setLinkUrlError('')
                    }}
                    className="px-5 py-2.5 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyLink}
                    disabled={!linkUrl.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg shadow-blue-500/30 disabled:shadow-none flex items-center gap-2"
                  >
                    <Check size={18} />
                    Insert Link
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Link Popover - Shows on hover */}
        {showLinkPopover && hoveredLinkElement && (
          <div
            className="link-popover fixed z-50 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 min-w-[320px] max-w-[400px]"
            style={{
              top: `${linkPopoverPos.top}px`,
              left: `${linkPopoverPos.left}px`,
            }}
            onMouseEnter={keepPopoverOpen}
            onMouseLeave={hideLinkPopover}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                <ExternalLink size={16} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate mb-1">
                  {hoveredLinkElement.textContent}
                </p>
                <a
                  href={hoveredLinkElement.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 truncate block mb-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {hoveredLinkElement.href}
                </a>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openLink(hoveredLinkElement.href)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    title="Open link in new tab"
                  >
                    <ExternalLink size={14} />
                    Open
                  </button>
                  <button
                    onClick={() => editLink(hoveredLinkElement)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    title="Edit link"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => copyLinkUrl(hoveredLinkElement.href)}
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
                    onClick={() => removeLink(hoveredLinkElement)}
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
        )}

        {/* Search & Replace Dialog */}
        {showSearchDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Search size={20} />
                  Find & Replace
                </h3>
                <button
                  onClick={() => {
                    setShowSearchDialog(false)
                    setSearchQuery('')
                    setReplaceQuery('')
                    setSearchMatches([])
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Find
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search text..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      autoFocus
                    />
                    <button
                      onClick={performSearch}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Find
                    </button>
                  </div>
                  {searchMatches.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        {currentMatchIndex + 1} of {searchMatches.length}
                      </span>
                      <button
                        onClick={previousMatch}
                        className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                      >
                        Previous
                      </button>
                      <button
                        onClick={nextMatch}
                        className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Replace with
                  </label>
                  <input
                    type="text"
                    value={replaceQuery}
                    onChange={(e) => setReplaceQuery(e.target.value)}
                    placeholder="Replacement text..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={caseSensitive}
                      onChange={(e) => setCaseSensitive(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Case sensitive
                  </label>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={replaceCurrentMatch}
                    disabled={searchMatches.length === 0}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Replace
                  </button>
                  <button
                    onClick={replaceAllMatches}
                    disabled={searchMatches.length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Replace All
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Table configuration dialog */}
        {showTableDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onMouseDown={() => setShowTableDialog(false)} />
            <div className="relative z-10 w-80 rounded bg-white p-4 shadow-lg">
              <h3 className="text-sm font-medium mb-2">Insert table</h3>
              <div className="mb-3">
                <div className="text-xs mb-2">Pick table size</div>
                <div className="grid grid-cols-6 gap-1">
                  {Array.from({ length: 36 }).map((_, idx) => {
                    const r = Math.floor(idx / 6)
                    const c = idx % 6
                    const rowsSelected = hoverRows ?? tableRows
                    const colsSelected = hoverCols ?? tableCols
                    const isActive = rowsSelected > r && colsSelected > c
                    return (
                      <button
                        key={`cell-${r}-${c}`}
                        type="button"
                        onMouseEnter={() => { setHoverRows(r + 1); setHoverCols(c + 1) }}
                        onMouseLeave={() => { setHoverRows(null); setHoverCols(null) }}
                        onClick={() => { setTableRows(r + 1); setTableCols(c + 1) }}
                        aria-label={`${r + 1} by ${c + 1}`}
                        className={`w-6 h-6 rounded-sm border ${isActive ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-200'} focus:outline-none`}
                      />
                    )
                  })}
                </div>
                <div className="mt-2 text-xs text-gray-600">{(hoverRows ?? tableRows)} x {(hoverCols ?? tableCols)}</div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTableDialog(false)}
                  className="px-3 py-1 rounded border text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTableDialog(false)
                    insertCustomBlock('table', { rows: tableRows, cols: tableCols })
                    forceWebViewFocus()
                  }}
                  className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
                >
                  Insert
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Table toolbar for manipulating existing tables */}
        {tableToolbarVisible && (
          <div
            className="fixed z-50 flex items-center gap-2 rounded-md bg-white border px-2 py-1 shadow max-w-[92vw] overflow-auto"
            style={{ top: tableToolbarPos.top, left: tableToolbarPos.left }}
          >
            <div className="px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-700 font-medium">
              {(() => {
                const table = tableNodeRef.current as HTMLTableElement | null
                if (!table) return '0 x 0'
                const rows = table.querySelectorAll('tr').length
                const cols = table.querySelectorAll('tr')[0]?.querySelectorAll('td,th').length || 0
                return `${rows} x ${cols}`
              })()}
            </div>
            <button onClick={addTableRow} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-100">
              <Plus size={14} /> Row
            </button>
            <button onClick={deleteTableRow} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-100">
              <Minus size={14} /> Row
            </button>
            <button onClick={addTableCol} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-100">
              <Plus size={14} /> Col
            </button>
            <button onClick={deleteTableCol} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-100">
              <Minus size={14} /> Col
            </button>
            <button onClick={deleteTable} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded text-red-600 hover:bg-red-50">
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
        <style jsx global>{`
          [data-block-outline='true'] {
            outline: 2px dashed rgba(59, 130, 246, 0.75);
            outline-offset: 6px;
            border-radius: 12px;
          }
        `}</style>
      </div>
    )
  }
)

RichTextEditor.displayName = 'RichTextEditor'

export default RichTextEditor