'use client'

import React, { useEffect, useState } from 'react'
import ModalCloseButton from './ModalCloseButton'
import { getFileSignedUrl, getFileUrl } from '@/lib/file-storage'
import DOMPurify from 'dompurify'
import BaseModal, { ModalHeader, ModalTitle } from './BaseModal'

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
        
        // Convert to HTML — mammoth is ~1 MB, so it is only fetched when a
        // DOCX preview is actually opened.
        const { default: mammoth } = await import('mammoth')
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
    <BaseModal isOpen={isOpen} onClose={onClose} size="4xl" maxHeight="90vh" animation="zoom">
        <ModalHeader onClose={onClose} closeAriaLabel="Close preview" gradient={false}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </span>
            <ModalTitle className="truncate">
              {fileName || 'Word Document'}
            </ModalTitle>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => downloadUrl && window.open(downloadUrl, '_blank')}
                className="glass-btn h-8 shrink-0 px-3 text-xs"
                disabled={!downloadUrl}
              >
                Open in new tab
              </button>
            </div>
        </ModalHeader>

        {/* Content */}
        <div className="flex flex-1 justify-center overflow-auto bg-[var(--surface-sunken)] p-4 sm:p-8">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 self-center text-muted">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-[var(--accent)]"></div>
              <span className="text-sm">Loading Document…</span>
            </div>
          ) : error ? (
            <div className="mx-auto flex max-w-md flex-col items-center justify-center self-center rounded-2xl border border-border bg-[var(--surface-hover)] p-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-danger">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h3 className="mb-1 text-base font-semibold text-foreground">Preview Unavailable</h3>
              <p className="mb-4 text-sm text-muted">{error}</p>
              {downloadUrl && (
                <a href={downloadUrl} download className="glass-btn-primary h-9 px-4 text-[13px]">
                  Download File
                </a>
              )}
            </div>
          ) : htmlContent ? (
            <div
              className="prose prose-sm sm:prose-base dark:prose-invert min-h-full w-full max-w-3xl rounded-2xl border border-border bg-[var(--surface-solid)] p-8 text-foreground shadow-glass sm:p-12"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          ) : null}
        </div>
    </BaseModal>
  )
}
