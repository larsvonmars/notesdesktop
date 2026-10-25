'use client'

import React, { useEffect, useState } from 'react'
import ModalCloseButton from './ModalCloseButton'
import { getFileUrl } from '@/lib/file-storage'
import BaseModal, { ModalHeader, ModalTitle } from './BaseModal'

interface PdfPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  filePath: string | null
  fileName: string | null
}

export default function PdfPreviewModal({
  isOpen,
  onClose,
  filePath,
  fileName,
}: PdfPreviewModalProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !filePath) {
      setUrl(null)
      return
    }

    let isMounted = true
    getFileUrl(filePath).then((objectUrl) => {
      if (isMounted && objectUrl) {
        setUrl(objectUrl)
      }
    }).catch((err) => console.error('Failed to load PDF url for preview:', err))

    return () => {
      isMounted = false
    }
  }, [isOpen, filePath])

  if (!isOpen || !filePath) return null

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="5xl" maxHeight="90vh" className="h-[90vh]" animation="zoom">
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
              {fileName || 'PDF Document'}
            </ModalTitle>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => url && window.open(url, '_blank')}
                className="glass-btn h-8 shrink-0 px-3 text-xs"
                disabled={!url}
              >
                Open in new tab
              </button>
            </div>
        </ModalHeader>

        {/* Content */}
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-[var(--surface-sunken)]">
          {url ? (
            <iframe
              src={url}
              title={fileName || 'PDF'}
              className="h-full w-full border-none"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-[var(--accent)]"></div>
              <span className="text-sm">Loading PDF…</span>
            </div>
          )}
        </div>
    </BaseModal>
  )
}
