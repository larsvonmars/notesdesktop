'use client'

import React, { useEffect, useState } from 'react'
import ModalCloseButton from './ModalCloseButton'
import { getFileSignedUrl, getFileUrl } from '@/lib/file-storage'
import mammoth from 'mammoth'
import DOMPurify from 'dompurify'

interface DocxPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  filePath: string | null
  fileName: string | null
}

export default function DocxPreviewModal({
  isOpen,
  onClose,
  filePath,
  fileName,
}: DocxPreviewModalProps) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !filePath) {
      setHtmlContent(null)
      setError(null)
      setDownloadUrl(null)
      return
    }

    let isMounted = true
    setIsLoading(true)
    setError(null)

    const loadDocx = async () => {
      try {
        const url = await getFileUrl(filePath)
        if (isMounted && url) {
          setDownloadUrl(url)
        }

        // We fetch the document as an array buffer
        const response = await fetch(url)
        const arrayBuffer = await response.arrayBuffer()
        
        // Convert to HTML
        const result = await mammoth.convertToHtml({ arrayBuffer })
        
        if (isMounted) {
          // Sanitize generated HTML just in case
          const cleanHtml = DOMPurify.sanitize(result.value)
          setHtmlContent(cleanHtml)
          setIsLoading(false)
        }
      } catch (err: any) {
        console.error('Failed to load DOCX:', err)
        if (isMounted) {
          setError(err.message || 'Failed to render document')
          setIsLoading(false)
        }
      }
    }

    loadDocx()

    return () => {
      isMounted = false
    }
  }, [isOpen, filePath])

  if (!isOpen || !filePath) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200"
        style={{ height: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
              {fileName || 'Word Document'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadUrl && window.open(downloadUrl, '_blank')}
              className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              disabled={!downloadUrl}
            >
              Open in new tab
            </button>
            <ModalCloseButton
              onClick={onClose}
              ariaLabel="Close preview"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-slate-950 flex justify-center p-4 sm:p-8">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 text-slate-500 self-center">
              <div className="h-6 w-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin"></div>
              <span className="text-sm">Loading Document...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-red-100 dark:border-red-900 mx-auto self-center max-w-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 mb-3">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-1">Preview Unavailable</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
              {downloadUrl && (
                <a href={downloadUrl} download className="px-4 py-2 bg-blue-500 text-white rounded shadow-sm text-sm font-medium hover:bg-blue-600 transition-colors">
                  Download File
                </a>
              )}
            </div>
          ) : htmlContent ? (
            <div 
              className="prose prose-sm sm:prose-base dark:prose-invert max-w-3xl w-full bg-white dark:bg-slate-900 shadow-md border border-slate-200 dark:border-slate-800 rounded-lg p-8 sm:p-12 min-h-full"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
