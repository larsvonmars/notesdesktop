'use client'

import React, { useEffect, useState } from 'react'
import ModalCloseButton from './ModalCloseButton'
import { getFileUrl } from '@/lib/file-storage'
import BaseModal, { ModalHeader } from './BaseModal'

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
    <BaseModal isOpen={isOpen} onClose={onClose} size="5xl" maxHeight="90vh" backdropBlur animation="zoom">
        <ModalHeader onClose={onClose} closeAriaLabel="Close preview" gradient={false} className="bg-gray-50 dark:bg-slate-800/50">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
              {fileName || 'PDF Document'}
            </h3>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => url && window.open(url, '_blank')}
                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                disabled={!url}
              >
                Open in new tab
              </button>
            </div>
        </ModalHeader>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-slate-950 flex items-center justify-center">
          {url ? (
            <iframe
              src={url}
              title={fileName || 'PDF'}
              className="w-full h-full border-none"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <div className="h-6 w-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin"></div>
              <span className="text-sm">Loading PDF...</span>
            </div>
          )}
        </div>
    </BaseModal>
  )
}
