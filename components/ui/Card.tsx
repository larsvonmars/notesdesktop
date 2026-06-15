'use client'

import { type ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  /** Glass morphism effect */
  glass?: boolean
  /** Remove default padding */
  noPadding?: boolean
}

function Card({ children, className = '', glass = false, noPadding = false }: CardProps) {
  return (
    <div
      className={[
        'rounded-2xl border border-border shadow-sm transition-shadow duration-200',
        glass
          ? 'bg-surface/80 backdrop-blur-xl'
          : 'bg-surface',
        noPadding ? '' : 'p-5',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={['flex flex-col gap-1 pb-4', className].join(' ')}>
      {children}
    </div>
  )
}

function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={['text-lg font-semibold text-foreground leading-tight', className].join(' ')}>
      {children}
    </h3>
  )
}

function CardDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={['text-sm text-muted', className].join(' ')}>
      {children}
    </p>
  )
}

function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}

function CardFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={['flex items-center gap-2 pt-4 border-t border-border mt-4', className].join(' ')}>
      {children}
    </div>
  )
}

Card.Header = CardHeader
Card.Title = CardTitle
Card.Description = CardDescription
Card.Body = CardBody
Card.Footer = CardFooter

export { Card }
export type { CardProps }
