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

const TABLET_MIN = 768
const TABLET_MAX = 1023

/**
 * Detects tablet-sized screens (768–1023px).
 * Returns false on phones and full desktops.
 */
export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(false)

  useEffect(() => {
    const check = () => {
      setIsTablet(
        window.innerWidth >= TABLET_MIN && window.innerWidth < TABLET_MAX
      )
    }

    check()

    const mqMin = window.matchMedia(`(min-width: ${TABLET_MIN}px)`)
    const mqMax = window.matchMedia(`(max-width: ${TABLET_MAX}px)`)
    const handler = () => check()
    mqMin.addEventListener('change', handler)
    mqMax.addEventListener('change', handler)
    window.addEventListener('resize', handler)

    return () => {
      mqMin.removeEventListener('change', handler)
      mqMax.removeEventListener('change', handler)
      window.removeEventListener('resize', handler)
    }
  }, [])

  return isTablet
}

/**
 * Detects compact screens (phone or tablet, < 1024px).
 * Useful when you need a single boolean for "not a full desktop".
 */
export function useIsCompact(): boolean {
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    const check = () => setIsCompact(window.innerWidth < 1024)
    check()
    const mql = window.matchMedia('(max-width: 1023px)')
    const handler = () => check()
    mql.addEventListener('change', handler)
    window.addEventListener('resize', handler)
    return () => {
      mql.removeEventListener('change', handler)
      window.removeEventListener('resize', handler)
    }
  }, [])

  return isCompact
}
