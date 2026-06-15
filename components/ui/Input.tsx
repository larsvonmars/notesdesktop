'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
  label?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            'w-full px-3.5 py-2.5 rounded-xl text-sm',
            'bg-surface border border-border text-foreground',
            'placeholder:text-muted',
            'transition-all duration-200',
            'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error ? 'border-danger focus:border-danger focus:ring-danger/30' : '',
            className,
          ].join(' ')}
          {...props}
        />
        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'

export { Input }
export type { InputProps }
