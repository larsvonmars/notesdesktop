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
import { X, Search, Link as LinkIcon, Type, List, CheckSquare, Quote, Code, Minus } from 'lucide-react'
import {
  applyInlineStyle,
  applyBlockFormat,
  generateHeadingId,
  saveSelection as saveSelectionUtil,
  restoreSelection as restoreSelectionUtil
} from '@/lib/editor/commandDispatcher'
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
  getSlashCommands,
  filterSlashCommands,
  type SlashCommand,
  type RichTextCommand
} from '@/lib/editor/slashCommands'

export type { RichTextCommand }

export interface RichTextEditorHandle {
  focus: () => void
  exec: (command: RichTextCommand) => void
  getHTML: () => string
  getMarkdown: () => string
  getHeadings: () => Array<{ id: string; level: number; text: string }>
  queryCommandState: (command: string) => boolean
  showLinkDialog: () => void
  showSearchDialog: () => void
  getRootElement: () => HTMLDivElement | null
  scrollToHeading: (headingId: string) => void
}

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
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
    'mark'
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'type', 'checked', 'data-checked', 'id'],
  ALLOW_DATA_ATTR: true
}

interface SearchMatch {
  index: number
  length: number
  text: string
}

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
  ({ value, onChange, disabled, placeholder }, ref) => {
    const editorRef = useRef<HTMLDivElement | null>(null)
    const slashMenuRef = useRef<HTMLDivElement | null>(null)
    const historyManagerRef = useRef<HistoryManager | null>(null)
    const debouncedCaptureRef = useRef<(() => void) | null>(null)
    const mutationObserverRef = useRef<MutationObserver | null>(null)
    const checklistNormalizationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [showSlashMenu, setShowSlashMenu] = useState(false)
    const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 })
    const [slashMenuFilter, setSlashMenuFilter] = useState('')
    const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
    const [showLinkDialog, setShowLinkDialog] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')
    const [linkText, setLinkText] = useState('')
    const [showSearchDialog, setShowSearchDialog] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [replaceQuery, setReplaceQuery] = useState('')
    const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
    const [caseSensitive, setCaseSensitive] = useState(false)
    const savedSelectionRef = useRef<Range | null>(null)
    const slashPositionRef = useRef<{ container: Node; offset: number } | null>(null)

    const insertFragmentAtSelection = useCallback(
        (fragment: DocumentFragment) => {
          if (!editorRef.current) return false

          let selection = window.getSelection()
          if (!selection || selection.rangeCount === 0) {
            editorRef.current.focus()
            selection = window.getSelection()
          }

          if (!selection || selection.rangeCount === 0) {
            return false
          }

          const range = selection.getRangeAt(0)

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
        },
        [editorRef]
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
      const sanitized = sanitize(editorRef.current.innerHTML)
      if (sanitized !== value) {
        onChange(sanitized)
        if (debouncedCaptureRef.current) {
          debouncedCaptureRef.current()
        }
      }
    }, [onChange, sanitize, value])

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
      }
    }, [scheduleChecklistNormalization])

    const execCommand = useCallback(
      (command: string, valueArg?: string) => {
        if (disabled || !editorRef.current) return
        
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
      },
      [disabled, emitChange]
    )

    const applyCode = useCallback(() => {
      if (disabled) return
      applyInlineStyle('code')
      if (editorRef.current) {
        normalizeEditorContent(editorRef.current)
      }
      emitChange()
    }, [disabled, emitChange])

    const toggleChecklist = useCallback(() => {
      if (disabled || !editorRef.current) return
      
      toggleChecklistState(editorRef.current)
      
      normalizeEditorContent(editorRef.current)
      mergeAdjacentLists(editorRef.current)
      
      emitChange()
    }, [disabled, emitChange])

    // Fixed applyHeading function with robust WebView handling
    const applyHeading = useCallback(
      (level: 1 | 2 | 3) => {
        if (disabled || !editorRef.current) return;
        
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          // Fallback: insert heading at end with proper cursor placement
          const heading = document.createElement(`h${level}`);
          const textNode = document.createTextNode('');
          heading.appendChild(textNode);
          editorRef.current.appendChild(heading);
          
          // Set cursor inside new heading
          const range = document.createRange();
          range.setStart(textNode, 0);
          range.collapse(true);
          selection?.removeAllRanges();
          selection?.addRange(range);
          
          // Generate ID and normalize
          setTimeout(() => {
            if (!editorRef.current) return;
            heading.id = generateHeadingId('');
            normalizeEditorContent(editorRef.current);
            emitChange();
          }, 0);
          return;
        }

        const range = selection.getRangeAt(0);
        
        // Simple approach: always create new heading element
        const heading = document.createElement(`h${level}`);
        
        if (!range.collapsed) {
          // Wrap selected content
          const content = range.extractContents();
          heading.appendChild(content);
        } else {
          // Insert empty heading
          heading.appendChild(document.createTextNode(''));
        }
        
        range.insertNode(heading);
        
        // Move cursor inside heading
        const newRange = document.createRange();
        newRange.selectNodeContents(heading);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        // Generate ID and normalize
        setTimeout(() => {
          if (!editorRef.current) return;
          const headings = editorRef.current.querySelectorAll('h1, h2, h3');
          headings.forEach((heading) => {
            if (!heading.id) {
              const text = heading.textContent || '';
              heading.id = generateHeadingId(text);
            }
          });
          normalizeEditorContent(editorRef.current);
          emitChange();
        }, 0);
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

      saveSelection()
      setShowLinkDialog(true)
    }, [disabled, saveSelection])

    const applyLink = useCallback(() => {
      if (!linkUrl) return

      restoreSelection()

      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      const range = selection.getRangeAt(0)
      
      let node = range.commonAncestorContainer
      if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentNode!
      }
      const existingLink = (node as Element).closest('a')
      
      if (existingLink) {
        existingLink.setAttribute('href', linkUrl)
        existingLink.textContent = linkText || linkUrl
      } else {
        const link = document.createElement('a')
        link.href = linkUrl
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.textContent = linkText || linkUrl

        if (range.collapsed) {
          range.insertNode(link)
        } else {
          range.deleteContents()
          range.insertNode(link)
        }
      }

      setShowLinkDialog(false)
      setLinkUrl('')
      setLinkText('')
      emitChange()
      editorRef.current?.focus()
    }, [linkUrl, linkText, restoreSelection, emitChange])

    // Search functionality
    const highlightMatch = useCallback((matchIndex: number) => {
      if (!editorRef.current || matchIndex < 0 || matchIndex >= searchMatches.length) return

      const match = searchMatches[matchIndex]
      const range = document.createRange()
      const selection = window.getSelection()
      
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
          const offset = match.index - currentPos
          range.setStart(node, offset)
          range.setEnd(node, offset + match.length)
          break
        }
        currentPos += nodeLength
        node = walker.nextNode()
      }

      selection?.removeAllRanges()
      selection?.addRange(range)
      
      range.startContainer.parentElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }, [searchMatches])

    const performSearch = useCallback(() => {
      if (!editorRef.current || !searchQuery) {
        setSearchMatches([])
        return
      }

      const content = editorRef.current.textContent || ''
      const query = caseSensitive ? searchQuery : searchQuery.toLowerCase()
      const searchIn = caseSensitive ? content : content.toLowerCase()
      
      const matches: SearchMatch[] = []
      let index = searchIn.indexOf(query)
      
      while (index !== -1) {
        matches.push({
          index,
          length: searchQuery.length,
          text: content.substr(index, searchQuery.length)
        })
        index = searchIn.indexOf(query, index + 1)
      }

      setSearchMatches(matches)
      setCurrentMatchIndex(0)
      
      if (matches.length > 0) {
        highlightMatch(0)
      }
    }, [searchQuery, caseSensitive, highlightMatch])

    const nextMatch = useCallback(() => {
      if (searchMatches.length === 0) return
      const nextIndex = (currentMatchIndex + 1) % searchMatches.length
      setCurrentMatchIndex(nextIndex)
      highlightMatch(nextIndex)
    }, [currentMatchIndex, searchMatches, highlightMatch])

    const previousMatch = useCallback(() => {
      if (searchMatches.length === 0) return
      const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length
      setCurrentMatchIndex(prevIndex)
      highlightMatch(prevIndex)
    }, [currentMatchIndex, searchMatches, highlightMatch])

    const replaceCurrentMatch = useCallback(() => {
      if (searchMatches.length === 0 || !editorRef.current) return
      
      highlightMatch(currentMatchIndex)
      const replaced = insertPlainTextAtSelection(replaceQuery)

      if (replaced) {
        normalizeEditorContent(editorRef.current)
        mergeAdjacentLists(editorRef.current)
        scheduleChecklistNormalization()
      }
      
      emitChange()
      performSearch()
    }, [currentMatchIndex, replaceQuery, searchMatches, highlightMatch, insertPlainTextAtSelection, emitChange, performSearch, scheduleChecklistNormalization])

    const replaceAllMatches = useCallback(() => {
      if (!editorRef.current || !searchQuery) return
      
      const content = editorRef.current.innerHTML
      const flags = caseSensitive ? 'g' : 'gi'
      const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
      const newContent = content.replace(regex, replaceQuery)
      
      editorRef.current.innerHTML = newContent
      normalizeEditorContent(editorRef.current)
      mergeAdjacentLists(editorRef.current)
      scheduleChecklistNormalization()
      emitChange()
      performSearch()
    }, [searchQuery, replaceQuery, caseSensitive, emitChange, performSearch, scheduleChecklistNormalization])

    // Horizontal rule
    const insertHorizontalRule = useCallback(() => {
      if (disabled) return
      
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return
      
      const range = selection.getRangeAt(0)
      const hr = document.createElement('hr')
      range.insertNode(hr)
      
      const p = document.createElement('p')
      p.appendChild(document.createElement('br'))
      hr.parentNode?.insertBefore(p, hr.nextSibling)
      
      const newRange = document.createRange()
      newRange.setStart(p, 0)
      newRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(newRange)
      
      emitChange()
    }, [disabled, emitChange])

    // Slash commands menu
    const slashCommands = getSlashCommands({
      Type: <Type size={16} />,
      List: <List size={16} />,
      CheckSquare: <CheckSquare size={16} />,
      Quote: <Quote size={16} />,
      Code: <Code size={16} />,
      Minus: <Minus size={16} />,
      Link: <LinkIcon size={16} />
    })

    const filteredSlashCommands = filterSlashCommands(slashCommands, slashMenuFilter)

    // Update menu position based on caret and viewport boundaries
    const updateSlashMenuPosition = useCallback(() => {
      if (!editorRef.current) return

      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const editorRect = editorRef.current.getBoundingClientRect()

      let top = rect.bottom - editorRect.top + editorRef.current.scrollTop + 4
      let left = rect.left - editorRect.left + editorRef.current.scrollLeft

      const isMobile = window.innerWidth < 640
      const menuWidth = isMobile ? Math.min(window.innerWidth - 32, 280) : 288
      const menuHeight = Math.min(filteredSlashCommands.length * 60 + 80, 384)

      const editorWidth = editorRect.width
      const maxLeft = editorWidth - menuWidth - 8
      if (left > maxLeft) {
        left = Math.max(8, maxLeft)
      }
      if (left < 0) {
        left = 8
      }

      const viewportBottom = window.innerHeight
      const menuBottom = rect.bottom + menuHeight + 4
      
      if (menuBottom > viewportBottom) {
        const newTop = rect.top - editorRect.top + editorRef.current.scrollTop - menuHeight - 4
        if (newTop > 0) {
          top = newTop
        } else {
          top = Math.max(8, viewportBottom - editorRect.top - menuHeight - 8)
        }
      }

      setSlashMenuPosition({ top, left })
    }, [filteredSlashCommands.length])

    const detectSlashCommand = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === '/' && !showSlashMenu) {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return

        const range = selection.getRangeAt(0)
        const textBeforeCursor = range.startContainer.textContent?.substring(0, range.startOffset) || ''
        
        const urlPattern = /https?:$/
        if (urlPattern.test(textBeforeCursor.trim())) {
          return
        }
        
        if (textBeforeCursor.trim() === '' || textBeforeCursor.endsWith(' ') || textBeforeCursor.endsWith('\n')) {
          slashPositionRef.current = {
            container: range.startContainer,
            offset: range.startOffset
          }

          setTimeout(() => {
            updateSlashMenuPosition()
            setShowSlashMenu(true)
            setSlashMenuFilter('')
            setSelectedCommandIndex(0)
          }, 0)
        }
      }
    }, [showSlashMenu, updateSlashMenuPosition])

    // Fixed executeSlashCommand with robust WebView handling
    const executeSlashCommand = useCallback((command: SlashCommand) => {
      if (!editorRef.current) return;
      
      setShowSlashMenu(false);
      setSlashMenuFilter('');
      setSelectedCommandIndex(0);

      // Save current selection before any DOM manipulation
      saveSelection();
      
      // Simple approach to remove slash command text
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const startContainer = range.startContainer;
        
        if (startContainer.nodeType === Node.TEXT_NODE) {
          const textContent = startContainer.textContent || '';
          const slashIndex = textContent.lastIndexOf('/');
          
          if (slashIndex !== -1) {
            // Remove the slash and filter text
            startContainer.textContent = textContent.substring(0, slashIndex);
            
            // Set cursor position after the removal
            const newRange = document.createRange();
            newRange.setStart(startContainer, slashIndex);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        }
      }

      // Execute command immediately with requestAnimationFrame for better timing
      requestAnimationFrame(() => {
        try {
          // Special handling for headings to ensure correct cursor placement
          if (command.command === 'heading1') {
            applyHeading(1);
          } else if (command.command === 'heading2') {
            applyHeading(2);
          } else if (command.command === 'heading3') {
            applyHeading(3);
          } else if (typeof command.command === 'function') {
            command.command();
          } else {
            // Use the exec method from imperative handle
            const execFn = (cmd: RichTextCommand) => {
              switch (cmd) {
                case 'bold':
                  execCommand('bold');
                  break;
                case 'italic':
                  execCommand('italic');
                  break;
                case 'underline':
                  execCommand('underline');
                  break;
                case 'strike':
                  execCommand('strikeThrough');
                  break;
                case 'code':
                  applyCode();
                  break;
                case 'unordered-list':
                  execCommand('insertUnorderedList');
                  break;
                case 'ordered-list':
                  execCommand('insertOrderedList');
                  break;
                case 'blockquote':
                  execCommand('formatBlock', 'blockquote');
                  break;
                case 'checklist':
                  toggleChecklist();
                  break;
                case 'heading1':
                  applyHeading(1);
                  break;
                case 'heading2':
                  applyHeading(2);
                  break;
                case 'heading3':
                  applyHeading(3);
                  break;
                case 'horizontal-rule':
                  insertHorizontalRule();
                  break;
                case 'link':
                  insertLink();
                  break;
              }
            };
            execFn(command.command as RichTextCommand);
          }
        } catch (error) {
          console.error('Slash command execution failed:', error);
          // Fallback: insert plain text representation
          const fallbackText = `# ${command.label}\n`;
          insertPlainTextAtSelection(fallbackText);
        }
        
        // Force focus for WebView compatibility
        forceWebViewFocus();
      });
    }, [execCommand, applyCode, toggleChecklist, applyHeading, insertHorizontalRule, insertLink, insertPlainTextAtSelection, forceWebViewFocus])

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
        exec: (command: RichTextCommand) => {
          switch (command) {
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
            default:
              break
          }
        }
      }),
      [applyCode, execCommand, sanitize, toggleChecklist, applyHeading, getHeadings, insertLink, insertHorizontalRule, scrollToHeading]
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
      const content = editorRef.current.innerHTML
      if (sanitize(content) !== value) {
        editorRef.current.innerHTML = value || ''
        if (historyManagerRef.current) {
          historyManagerRef.current.capture()
        }
      }
      scheduleChecklistNormalization()
    }, [sanitize, value, scheduleChecklistNormalization])

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

    // Close slash menu on click outside
    useEffect(() => {
      if (!showSlashMenu) return

      const handleClickOutside = (event: MouseEvent) => {
        if (
          slashMenuRef.current &&
          !slashMenuRef.current.contains(event.target as Node) &&
          editorRef.current &&
          !editorRef.current.contains(event.target as Node)
        ) {
          setShowSlashMenu(false)
          setSlashMenuFilter('')
          setSelectedCommandIndex(0)
          slashPositionRef.current = null
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [showSlashMenu])

    // Update slash menu position on scroll/resize
    useEffect(() => {
      if (!showSlashMenu) return

      const handleUpdate = () => {
        updateSlashMenuPosition()
      }

      window.addEventListener('scroll', handleUpdate, true)
      window.addEventListener('resize', handleUpdate)

      return () => {
        window.removeEventListener('scroll', handleUpdate, true)
        window.removeEventListener('resize', handleUpdate)
      }
    }, [showSlashMenu, updateSlashMenuPosition])

    // Reset selected index when filter changes
    useEffect(() => {
      if (selectedCommandIndex >= filteredSlashCommands.length) {
        setSelectedCommandIndex(Math.max(0, filteredSlashCommands.length - 1))
      }
    }, [filteredSlashCommands.length, selectedCommandIndex])

    // Scroll selected command into view
    useEffect(() => {
      if (!showSlashMenu || !slashMenuRef.current) return

      const selectedElement = slashMenuRef.current.querySelector(
        `[data-command-index="${selectedCommandIndex}"]`
      ) as HTMLElement | null

      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        })
      }
    }, [selectedCommandIndex, showSlashMenu])

    const handleInput = () => emitChange()

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      // Detect slash command
      detectSlashCommand(event)

      if (event.key === 'Enter' && !event.shiftKey) {
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

                const sel = window.getSelection()
                if (sel) {
                  const range = document.createRange()
                  range.setStart(paragraph, 0)
                  range.collapse(true)
                  sel.removeAllRanges()
                  sel.addRange(range)
                }

                emitChange()
                return
              }

              setTimeout(() => {
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
              }, 0)
            }
          }
        }
      }

      // Close slash menu on Escape
      if (event.key === 'Escape' && showSlashMenu) {
        event.preventDefault()
        setShowSlashMenu(false)
        setSlashMenuFilter('')
        setSelectedCommandIndex(0)
        slashPositionRef.current = null
        return
      }

      // Navigate slash menu with arrow keys
      if (showSlashMenu) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSelectedCommandIndex((prev) => 
            prev < filteredSlashCommands.length - 1 ? prev + 1 : prev
          )
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSelectedCommandIndex((prev) => (prev > 0 ? prev - 1 : prev))
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          if (filteredSlashCommands.length > 0 && selectedCommandIndex < filteredSlashCommands.length) {
            executeSlashCommand(filteredSlashCommands[selectedCommandIndex])
          }
          return
        }
        if (event.key === 'Tab') {
          event.preventDefault()
          if (filteredSlashCommands.length > 0 && selectedCommandIndex < filteredSlashCommands.length) {
            executeSlashCommand(filteredSlashCommands[selectedCommandIndex])
          }
          return
        }
        // Handle backspace in filter
        if (event.key === 'Backspace') {
          if (slashMenuFilter.length > 0) {
            setSlashMenuFilter((prev) => {
              const newFilter = prev.slice(0, -1)
              setSelectedCommandIndex(0)
              return newFilter
            })
          } else {
            setShowSlashMenu(false)
            slashPositionRef.current = null
          }
          return
        }
        // Update filter as user types (only single printable characters)
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault()
          setSlashMenuFilter((prev) => {
            const newFilter = prev + event.key
            setSelectedCommandIndex(0)
            return newFilter
          })
          return
        }
      }

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
    }

    const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()

      const finalizeInsertion = () => {
        if (editorRef.current) {
          normalizeEditorContent(editorRef.current)
          mergeAdjacentLists(editorRef.current)
        }
        scheduleChecklistNormalization()
        emitChange()
      }

      const html = event.clipboardData.getData('text/html')
      const text = event.clipboardData.getData('text/plain')

      if (html) {
        const sanitized = sanitize(html)
        if (insertHTMLAtSelection(sanitized)) {
          finalizeInsertion()
        }
        return
      }

      if (!text) {
        return
      }

      if (looksLikeMarkdown(text)) {
        const selectionSnapshot = saveSelectionUtil()
        markdownToHtml(text).then((convertedHtml) => {
          if (selectionSnapshot) {
            restoreSelectionUtil(selectionSnapshot)
          }

          const sanitized = sanitize(convertedHtml)
          if (insertHTMLAtSelection(sanitized)) {
            finalizeInsertion()
          }
        })
        return
      }

      const trimmed = text.trim()
      const urlPattern = /^https?:\/\/.+/i

      if (urlPattern.test(trimmed)) {
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
        return
      }

      if (insertPlainTextAtSelection(text)) {
        finalizeInsertion()
      }
    }

    return (
      <div className="relative h-full">
        <div
          ref={editorRef}
          className="w-full h-full overflow-y-auto whitespace-pre-wrap break-words focus:outline-none p-3 sm:p-4"
          contentEditable={!disabled}
          data-placeholder={placeholder}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          suppressContentEditableWarning
          spellCheck
        />

        {/* Slash Commands Menu */}
        {showSlashMenu && (
          <div
            ref={slashMenuRef}
            className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
            style={{
              top: `${slashMenuPosition.top}px`,
              left: `${slashMenuPosition.left}px`,
              width: 'min(288px, calc(100vw - 2rem))',
              maxHeight: 'min(384px, calc(100vh - 8rem))'
            }}
          >
            {slashMenuFilter && (
              <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                Searching: <span className="font-semibold text-gray-700">/{slashMenuFilter}</span>
              </div>
            )}
            <div className="overflow-y-auto max-h-80">
              {filteredSlashCommands.length > 0 ? (
                <div className="py-1">
                  {filteredSlashCommands.map((cmd, index) => (
                    <button
                      key={cmd.id}
                      data-command-index={index}
                      className={`w-full px-3 py-2.5 text-left flex items-center gap-3 transition-all ${
                        index === selectedCommandIndex
                          ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-500'
                          : 'text-gray-700 hover:bg-gray-50 border-l-2 border-transparent'
                      }`}
                      onClick={() => executeSlashCommand(cmd)}
                      onMouseEnter={() => setSelectedCommandIndex(index)}
                    >
                      <span className={`flex-shrink-0 ${index === selectedCommandIndex ? 'text-blue-600' : 'text-gray-400'}`}>
                        {cmd.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{cmd.label}</div>
                        <div className="text-xs text-gray-500 truncate">{cmd.description}</div>
                      </div>
                      {index === selectedCommandIndex && (
                        <span className="flex-shrink-0 text-xs text-blue-600 font-semibold">↵</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-6 text-sm text-center text-gray-500">
                  <div className="mb-1 font-medium">No commands found</div>
                  {slashMenuFilter && (
                    <div className="text-xs">for &quot;{slashMenuFilter}&quot;</div>
                  )}
                </div>
              )}
            </div>
            <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100 bg-gray-50 flex-shrink-0">
              <div className="flex flex-wrap gap-x-2 gap-y-1 justify-center sm:justify-start">
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px] font-semibold">↑↓</kbd>
                  <span className="hidden sm:inline">navigate</span>
                </span>
                <span className="hidden sm:inline text-gray-300">•</span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px] font-semibold">↵</kbd>
                  <span className="hidden sm:inline">select</span>
                </span>
                <span className="hidden sm:inline text-gray-300">•</span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px] font-semibold">Esc</kbd>
                  <span className="hidden sm:inline">close</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Link Dialog */}
        {showLinkDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Insert Link</h3>
                <button
                  onClick={() => {
                    setShowLinkDialog(false)
                    setLinkUrl('')
                    setLinkText('')
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Text to display
                  </label>
                  <input
                    type="text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    placeholder="Link text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL
                  </label>
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setShowLinkDialog(false)
                      setLinkUrl('')
                      setLinkText('')
                    }}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyLink}
                    disabled={!linkUrl}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Insert Link
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
      </div>
    )
  }
)

RichTextEditor.displayName = 'RichTextEditor'

export default RichTextEditor