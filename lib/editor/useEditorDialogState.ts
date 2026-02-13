import { useCallback, useEffect, useState } from 'react'

export interface RecentLink {
  url: string
  text: string
  timestamp: number
}

export interface SearchMatch {
  index: number
  length: number
  text: string
}

export function useLinkDialogState() {
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [linkUrlError, setLinkUrlError] = useState('')
  const [recentLinks, setRecentLinks] = useState<RecentLink[]>([])

  const addToRecentLinks = useCallback((url: string, text: string) => {
    setRecentLinks((prev) => {
      const filtered = prev.filter((link) => link.url !== url)
      const updated = [{ url, text, timestamp: Date.now() }, ...filtered].slice(0, 5)

      try {
        localStorage.setItem('editor-recent-links', JSON.stringify(updated))
      } catch {
        // ignore storage issues
      }

      return updated
    })
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('editor-recent-links')
      if (stored) {
        const links = JSON.parse(stored)
        setRecentLinks(Array.isArray(links) ? links : [])
      }
    } catch {
      setRecentLinks([])
    }
  }, [])

  const resetLinkDialog = useCallback(() => {
    setShowLinkDialog(false)
    setLinkUrl('')
    setLinkText('')
    setLinkUrlError('')
  }, [])

  return {
    showLinkDialog,
    setShowLinkDialog,
    linkUrl,
    setLinkUrl,
    linkText,
    setLinkText,
    linkUrlError,
    setLinkUrlError,
    recentLinks,
    setRecentLinks,
    addToRecentLinks,
    resetLinkDialog,
  }
}

export function useSearchDialogState() {
  const [showSearchDialog, setShowSearchDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [caseSensitive, setCaseSensitive] = useState(false)

  const resetSearchDialog = useCallback(() => {
    setShowSearchDialog(false)
    setSearchQuery('')
    setReplaceQuery('')
    setSearchMatches([])
    setCurrentMatchIndex(0)
  }, [])

  return {
    showSearchDialog,
    setShowSearchDialog,
    searchQuery,
    setSearchQuery,
    replaceQuery,
    setReplaceQuery,
    searchMatches,
    setSearchMatches,
    currentMatchIndex,
    setCurrentMatchIndex,
    caseSensitive,
    setCaseSensitive,
    resetSearchDialog,
  }
}

export function useTableDialogState() {
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [hoverRows, setHoverRows] = useState<number | null>(null)
  const [hoverCols, setHoverCols] = useState<number | null>(null)

  const openTableDialog = useCallback((rows = 3, cols = 3) => {
    setTableRows(rows)
    setTableCols(cols)
    setHoverRows(null)
    setHoverCols(null)
    setShowTableDialog(true)
  }, [])

  const closeTableDialog = useCallback(() => {
    setShowTableDialog(false)
    setHoverRows(null)
    setHoverCols(null)
  }, [])

  return {
    showTableDialog,
    setShowTableDialog,
    tableRows,
    setTableRows,
    tableCols,
    setTableCols,
    hoverRows,
    setHoverRows,
    hoverCols,
    setHoverCols,
    openTableDialog,
    closeTableDialog,
  }
}
