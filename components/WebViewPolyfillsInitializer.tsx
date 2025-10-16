'use client'

import { useEffect } from 'react'
import { initializeWebViewPolyfills } from '@/lib/webview-polyfills'

/**
 * Component that initializes WebView polyfills on mount
 * This ensures compatibility with Tauri and various WebView implementations
 */
export function WebViewPolyfillsInitializer() {
  useEffect(() => {
    // Initialize polyfills as early as possible
    initializeWebViewPolyfills()
  }, [])

  // This component doesn't render anything
  return null
}
