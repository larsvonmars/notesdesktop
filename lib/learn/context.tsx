'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getDecks } from './decks'
import { getUserStats } from './stats'
import type { Card, Deck, UserStats } from './types'

interface LearningContextValue {
  stats: UserStats | null
  decks: Deck[]
  isLoadingStats: boolean
  isLoadingDecks: boolean
  refreshStats: () => Promise<void>
  refreshDecks: () => Promise<void>
  currentCard: Card | null
  setCurrentCard: (card: Card | null) => void
  /** Bumped when the AI changes data so open screens reload. */
  aiRefreshCounter: number
  triggerAiRefresh: () => void
  openAssistant: (prompt?: string) => void
  /** Prompt waiting to be consumed by the assistant screen. */
  pendingAssistantPrompt: string | null
  consumeAssistantPrompt: () => void
}

const LearningContext = createContext<LearningContextValue | null>(null)

export function LearningProvider({
  children,
  openAssistant: openAssistantProp,
}: {
  children: ReactNode
  openAssistant?: (prompt?: string) => void
}) {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [decks, setDecks] = useState<Deck[]>([])
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [isLoadingDecks, setIsLoadingDecks] = useState(true)
  const [currentCard, setCurrentCard] = useState<Card | null>(null)
  const [aiRefreshCounter, setAiRefreshCounter] = useState(0)
  const [pendingAssistantPrompt, setPendingAssistantPrompt] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refreshStats = useCallback(async () => {
    setIsLoadingStats(true)
    try {
      const next = await getUserStats(new Date().getTimezoneOffset())
      if (mountedRef.current) setStats(next)
    } catch (error) {
      console.warn('Failed to load Learn stats:', error)
    } finally {
      if (mountedRef.current) setIsLoadingStats(false)
    }
  }, [])

  const refreshDecks = useCallback(async () => {
    setIsLoadingDecks(true)
    try {
      const next = await getDecks()
      if (mountedRef.current) setDecks(next)
    } catch (error) {
      console.warn('Failed to load Learn decks:', error)
    } finally {
      if (mountedRef.current) setIsLoadingDecks(false)
    }
  }, [])

  useEffect(() => {
    void refreshStats()
    void refreshDecks()
  }, [refreshStats, refreshDecks])

  const triggerAiRefresh = useCallback(() => setAiRefreshCounter((count) => count + 1), [])

  const openAssistant = useCallback(
    (prompt?: string) => {
      setPendingAssistantPrompt(prompt ?? null)
      openAssistantProp?.(prompt)
    },
    [openAssistantProp],
  )

  const consumeAssistantPrompt = useCallback(() => setPendingAssistantPrompt(null), [])

  const value = useMemo(
    () => ({
      stats,
      decks,
      isLoadingStats,
      isLoadingDecks,
      refreshStats,
      refreshDecks,
      currentCard,
      setCurrentCard,
      aiRefreshCounter,
      triggerAiRefresh,
      openAssistant,
      pendingAssistantPrompt,
      consumeAssistantPrompt,
    }),
    [
      stats,
      decks,
      isLoadingStats,
      isLoadingDecks,
      refreshStats,
      refreshDecks,
      currentCard,
      aiRefreshCounter,
      triggerAiRefresh,
      openAssistant,
      pendingAssistantPrompt,
      consumeAssistantPrompt,
    ],
  )

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>
}

export function useLearning(): LearningContextValue {
  const context = useContext(LearningContext)
  if (!context) throw new Error('useLearning must be used inside LearningProvider')
  return context
}
