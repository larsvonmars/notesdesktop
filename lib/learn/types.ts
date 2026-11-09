/**
 * Domain types for the Learn workspace.
 *
 * The shapes mirror the `learn_*` tables in the shared Supabase project. The
 * app converts DB rows (snake_case) into these camelCase models at the data
 * layer so UI components never deal with column names.
 */

export interface Card {
  id: string
  front: string
  back: string
  deckId: string
  mastered: boolean
  /** ISO date (YYYY-MM-DD) when the card is due; null = never studied via SR. */
  dueDate: string | null
  easeFactor: number
  intervalDays: number
  correctCount: number
  incorrectCount: number
}

export type DocumentStatus = 'uploaded' | 'processing' | 'processed' | 'error'

export interface LearnDocument {
  id: string
  userId: string
  filename: string
  filePath: string
  fileSize: number
  status: DocumentStatus
  deckId?: string
  createdAt: string
}

export type StudyMode =
  | 'flashcard'
  | 'multiple-choice'
  | 'spaced-repetition'
  | 'typed-answer'
  | 'test'
  | 'smart'
  | 'ai-learn'
  | 'tutor'

export interface SessionResult {
  cardsReviewed: number
  correct: number
  perfect: boolean
  mode: StudyMode
  sessionTimeSeconds?: number
}

export interface Deck {
  id: string
  title: string
  description?: string
  cardCount: number
  color: string
  lastStudied?: Date | string
  masteredCount: number
  accuracy?: number
}

export type BadgeId =
  | 'first-deck'
  | 'collector-5'
  | 'collector-10'
  | 'streak-3'
  | 'streak-7'
  | 'streak-14'
  | 'streak-30'
  | 'level-5'
  | 'level-10'
  | 'level-25'
  | 'century'
  | 'millennium'
  | 'marathon'
  | 'quiz-master'
  | 'speed-demon'
  | 'perfect-session'

export interface Badge {
  id: BadgeId
  name: string
  description: string
  icon: string
  earnedAt?: Date
}

export interface UserStats {
  xp: number
  xpToNextLevel: number
  level: number
  streak: number
  badges: Badge[]
  totalCardsReviewed: number
  totalDecks: number
  totalSessions: number
  totalCorrect: number
  dailyCardsReviewed: number
  dailyGoalMet: boolean
  dailyGoal: number
  streakReminderEnabled: boolean
}

export interface DailyProgress {
  cardsReviewed: number
  correct: number
  goal: number
  goalMet: boolean
  /** 0–100 */
  goalProgress: number
}

export interface StudySessionSummary {
  id: string
  deckId: string
  deckTitle: string
  mode: StudyMode | null
  cardsReviewed: number
  correct: number
  xpEarned: number
  /** ISO date */
  completedAt: string
}

export interface LearnProfile {
  username: string | null
  email: string | null
}

export const BADGE_DEFINITIONS: Omit<Badge, 'earnedAt'>[] = [
  { id: 'first-deck', name: 'First Deck', description: 'Created your first deck', icon: '🎉' },
  { id: 'collector-5', name: 'Collector', description: 'Created 5 decks', icon: '📚' },
  { id: 'collector-10', name: 'Archivist', description: 'Created 10 decks', icon: '🗂️' },
  { id: 'streak-3', name: 'Hot Streak', description: 'Studied 3 days in a row', icon: '🔥' },
  { id: 'streak-7', name: 'On Fire', description: 'Studied 7 days in a row', icon: '⚡' },
  { id: 'streak-14', name: 'Unstoppable', description: 'Studied 14 days in a row', icon: '🌋' },
  { id: 'streak-30', name: 'Legendary', description: 'Studied 30 days in a row', icon: '💎' },
  { id: 'level-5', name: 'Rising Star', description: 'Reached level 5', icon: '⭐' },
  { id: 'level-10', name: 'Scholar', description: 'Reached level 10', icon: '📖' },
  { id: 'level-25', name: 'Master', description: 'Reached level 25', icon: '🎓' },
  { id: 'century', name: 'Century', description: 'Reviewed 100 cards', icon: '💯' },
  { id: 'millennium', name: 'Millennium', description: 'Reviewed 1,000 cards', icon: '🏅' },
  { id: 'marathon', name: 'Marathon', description: 'Reviewed 5,000 cards', icon: '🏃' },
  { id: 'quiz-master', name: 'Quiz Master', description: '10 perfect multiple-choice sessions', icon: '🧠' },
  { id: 'speed-demon', name: 'Speed Demon', description: 'Completed a test in under 30 seconds', icon: '⚡' },
  { id: 'perfect-session', name: 'Perfect Session', description: 'Got every card right in a session', icon: '🏆' },
]

export const STUDY_MODE_LABELS: Record<StudyMode, string> = {
  flashcard: 'Flashcard',
  'multiple-choice': 'Multiple Choice',
  'spaced-repetition': 'Spaced Repetition',
  'typed-answer': 'Typed Answer',
  test: 'Test',
  smart: 'Smart Learning',
  'ai-learn': 'AI Learn',
  tutor: 'AI Tutor',
}
