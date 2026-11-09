import { supabase } from '@/lib/supabase'
import type { LearnCardRow, LearnDeckRow, LearnDocumentRow, LearnUserStatsRow } from '@/lib/database.types'
import type { Card, DocumentStatus, LearnDocument } from './types'

export class LearnAuthError extends Error {
  constructor(message = 'Not authenticated') {
    super(message)
    this.name = 'LearnAuthError'
  }
}

/** Current Supabase user id, or a typed error the UI can recover from. */
export async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new LearnAuthError()
  return user.id
}

export function isLearnAuthError(error: unknown): boolean {
  return error instanceof LearnAuthError || (error as { message?: string } | null)?.message === 'Not authenticated'
}

export function describeLearnError(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message
  const candidate = error as { message?: string; details?: string } | null
  return candidate?.message ?? candidate?.details ?? fallback
}

export function mapCard(row: LearnCardRow): Card {
  return {
    id: row.id,
    deckId: row.deck_id,
    front: row.front,
    back: row.back,
    mastered: row.mastered,
    dueDate: row.due_date ?? null,
    easeFactor: row.ease_factor ?? 2.5,
    intervalDays: row.interval_days ?? 1,
    correctCount: row.correct_count ?? 0,
    incorrectCount: row.incorrect_count ?? 0,
  }
}

export function mapDeckSummary(row: LearnDeckRow): {
  id: string
  title: string
  description?: string
  color: string
} {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    color: row.color,
  }
}

export function mapDocument(row: LearnDocumentRow): LearnDocument {
  return {
    id: row.id,
    userId: row.user_id,
    filename: row.filename,
    filePath: row.file_path,
    fileSize: row.file_size,
    status: (row.status as DocumentStatus) ?? 'uploaded',
    deckId: row.deck_id ?? undefined,
    createdAt: row.created_at,
  }
}

export function mapStatsRow(row: LearnUserStatsRow) {
  return {
    xp: row.xp ?? 0,
    level: row.level ?? 1,
    streak: row.streak ?? 0,
    lastStudiedAt: row.last_studied_at ?? null,
    totalCardsReviewed: row.total_cards_reviewed ?? 0,
    totalSessions: row.total_sessions ?? 0,
    totalCorrect: row.total_correct ?? 0,
    dailyGoal: row.daily_goal ?? 20,
    streakReminderEnabled: row.streak_reminder_enabled ?? true,
  }
}
