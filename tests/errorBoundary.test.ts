import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'

// We test ErrorBoundary by importing it directly and verifying
// state transitions — rendering requires react-testing-library which
// may not be installed, so we do a more lightweight unit-style test.

import { ErrorBoundary } from '@/components/ErrorBoundary'

describe('ErrorBoundary', () => {
  it('should export ErrorBoundary class', () => {
    expect(ErrorBoundary).toBeDefined()
  })

  it('getDerivedStateFromError should set hasError to true', () => {
    const result = ErrorBoundary.getDerivedStateFromError(new Error('test'))
    expect(result).toHaveProperty('hasError', true)
    expect(result).toHaveProperty('error')
    expect(result.error!.message).toBe('test')
  })
})
