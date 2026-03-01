'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Label shown in the fallback UI (e.g. "Editor", "Kanban Board") */
  label?: string
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  /** If true, show a compact inline fallback instead of a full-page one */
  inline?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  copied: boolean
}

/**
 * React Error Boundary that prevents crashes from propagating up
 * and provides recovery options including content copy and retry.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false })
  }

  handleCopyError = async () => {
    const { error, errorInfo } = this.state
    const text = [
      `Error: ${error?.message}`,
      `Stack: ${error?.stack}`,
      `Component Stack: ${errorInfo?.componentStack}`,
    ].join('\n\n')

    try {
      await navigator.clipboard.writeText(text)
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    } catch {
      // Fallback: select a hidden textarea
      console.warn('Clipboard write failed')
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const { label, inline } = this.props
    const { error, copied } = this.state

    if (inline) {
      return (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
          <AlertTriangle size={18} className="shrink-0 text-red-500" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">
              {label ? `${label} encountered an error` : 'Something went wrong'}
            </p>
            {error && (
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-300 truncate">
                {error.message}
              </p>
            )}
          </div>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 transition-colors dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )
    }

    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border border-red-200 bg-red-50/80 p-8 text-center dark:border-red-800 dark:bg-red-950/30">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
          <AlertTriangle size={24} className="text-red-500" />
        </div>

        <div>
          <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">
            {label ? `${label} crashed` : 'Something went wrong'}
          </h3>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            An unexpected error occurred. Your data has been preserved.
          </p>
          {error && (
            <p className="mt-2 max-w-md rounded bg-red-100 px-3 py-1.5 text-xs font-mono text-red-800 dark:bg-red-900/50 dark:text-red-200">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 transition-colors"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
          <button
            onClick={this.handleCopyError}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 transition-colors dark:border-red-700 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy Error Details'}
          </button>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
