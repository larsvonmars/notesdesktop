export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function isAnswerCorrect(input: string, answer: string): boolean {
  return input.trim().toLowerCase() === answer.trim().toLowerCase()
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatRelativeDate(value: Date | string | null | undefined): string {
  if (!value) return 'Never'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return 'Never'

  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export interface DeckColorOption {
  value: string
  label: string
  dot: string
  bar: string
  soft: string
  text: string
  gradient: string
}

/** Deck accent colours stored in `learn_decks.color`. */
export const DECK_COLORS: DeckColorOption[] = [
  {
    value: 'bg-accent',
    label: 'Lime',
    dot: 'bg-accent',
    bar: 'bg-accent',
    soft: 'bg-accent-light',
    text: 'text-accent',
    gradient: 'from-accent to-success',
  },
  {
    value: 'bg-green-500',
    label: 'Green',
    dot: 'bg-green-500',
    bar: 'bg-green-500',
    soft: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    value: 'bg-blue-500',
    label: 'Blue',
    dot: 'bg-blue-500',
    bar: 'bg-blue-500',
    soft: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    gradient: 'from-blue-500 to-sky-500',
  },
  {
    value: 'bg-purple-500',
    label: 'Purple',
    dot: 'bg-purple-500',
    bar: 'bg-purple-500',
    soft: 'bg-purple-500/10',
    text: 'text-purple-600 dark:text-purple-400',
    gradient: 'from-purple-500 to-violet-500',
  },
  {
    value: 'bg-red-500',
    label: 'Red',
    dot: 'bg-red-500',
    bar: 'bg-red-500',
    soft: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    gradient: 'from-red-500 to-rose-500',
  },
  {
    value: 'bg-orange-500',
    label: 'Orange',
    dot: 'bg-orange-500',
    bar: 'bg-orange-500',
    soft: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    gradient: 'from-orange-500 to-amber-500',
  },
  {
    value: 'bg-teal-500',
    label: 'Teal',
    dot: 'bg-teal-500',
    bar: 'bg-teal-500',
    soft: 'bg-teal-500/10',
    text: 'text-teal-600 dark:text-teal-400',
    gradient: 'from-teal-500 to-emerald-500',
  },
  {
    value: 'bg-pink-500',
    label: 'Pink',
    dot: 'bg-pink-500',
    bar: 'bg-pink-500',
    soft: 'bg-pink-500/10',
    text: 'text-pink-600 dark:text-pink-400',
    gradient: 'from-pink-500 to-rose-500',
  },
  {
    value: 'bg-indigo-500',
    label: 'Indigo',
    dot: 'bg-indigo-500',
    bar: 'bg-indigo-500',
    soft: 'bg-indigo-500/10',
    text: 'text-indigo-600 dark:text-indigo-400',
    gradient: 'from-indigo-500 to-purple-500',
  },
]

const FALLBACK_COLOR = DECK_COLORS[0]

export function resolveDeckColor(value: string | null | undefined): DeckColorOption {
  return DECK_COLORS.find((color) => color.value === value) ?? FALLBACK_COLOR
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return 'LE'
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'LE'
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}
