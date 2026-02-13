'use client'

import { useState, useEffect } from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * Detects whether the app is running on a mobile device.
 * Combines viewport width detection with user-agent / Tauri platform hints.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => {
      const byWidth = window.innerWidth < MOBILE_BREAKPOINT
      // Also check for touch-primary device as a secondary signal
      const byTouch =
        'ontouchstart' in window &&
        window.matchMedia('(pointer: coarse)').matches
      setIsMobile(byWidth || byTouch)
    }

    check()

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const handler = () => check()
    mql.addEventListener('change', handler)
    window.addEventListener('resize', handler)

    return () => {
      mql.removeEventListener('change', handler)
      window.removeEventListener('resize', handler)
    }
  }, [])

  return isMobile
}
