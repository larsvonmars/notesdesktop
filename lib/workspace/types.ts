export type WorkspaceView = 'welcome' | 'notes' | 'files' | 'projects'

export type ToastVariantLike = 'info' | 'success' | 'warning' | 'error'

export interface ToastActionLike {
  label: string
  onClick: () => void
}

/** Structural subset of the ToastProvider API used by workspace actions. */
export interface ToastLike {
  push: (toast: {
    title?: string
    description?: string
    duration?: number
    variant?: ToastVariantLike
    action?: ToastActionLike
  }) => void
}
