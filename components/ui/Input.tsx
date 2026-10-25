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
            className="text-[13px] font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={[
            'glass-input h-10 w-full rounded-xl px-3.5 text-sm text-foreground',
            'transition-[border-color,box-shadow,background-color] duration-200',
            'placeholder:text-muted',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-danger hover:border-danger focus:border-danger' : '',
            className,
          ].join(' ')}
          {...props}
        />
        {error && (
          <p className="text-xs leading-5 text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'

export { Input }
export type { InputProps }