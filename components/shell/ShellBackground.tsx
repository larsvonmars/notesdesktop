import type { CSSProperties } from 'react'

interface OrbStyle extends CSSProperties {
  '--orb-bg'?: string
  '--orb-duration'?: string
  '--orb-delay'?: string
}

const ORBS: Array<{ className: string; style: OrbStyle }> = [
  {
    className: 'absolute -left-40 -top-48 h-[42rem] w-[42rem]',
    style: {
      '--orb-bg': 'var(--aurora-1)',
      '--orb-duration': '42s',
      '--orb-delay': '0s',
    },
  },
  {
    className: 'absolute -right-52 -top-40 h-[38rem] w-[38rem] opacity-70',
    style: {
      '--orb-bg': 'var(--aurora-2)',
      '--orb-duration': '50s',
      '--orb-delay': '-12s',
    },
  },
  {
    className: 'absolute -bottom-64 left-1/3 h-[36rem] w-[36rem] opacity-50',
    style: {
      '--orb-bg': 'var(--aurora-3)',
      '--orb-duration': '58s',
      '--orb-delay': '-24s',
    },
  },
]

/**
 * Fixed atmospheric layers for the whole app: aurora gradient, floating orbs
 * and a fine noise overlay. Visual definitions live in glass.css; this
 * component only positions them and keeps them out of the a11y tree.
 *
 * Orb drift and the noise texture are disabled by glass.css / base.css under
 * prefers-reduced-motion.
 */
export default function ShellBackground({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-shell-background=""
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`.trim()}
    >
      <div className="aurora" />
      {ORBS.map((orb, index) => (
        <div key={index} className={`aurora-orb ${orb.className}`} style={orb.style} />
      ))}
      <div className="noise" />
    </div>
  )
}
