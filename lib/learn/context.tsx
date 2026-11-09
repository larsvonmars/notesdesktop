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
import { useAuth } from '@/lib/auth-context'
import { getDecks } from './decks'
import { getUserStats } from './stats'
import type { Card, Deck, LearnScreen, UserStats } from './types'

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
  /** Current Learn destination, shared by the Learn sidebar, top bar and view. */
  screen: LearnScreen
  setScreen: (screen: LearnScreen) => void
  openAssistant: (prompt?: string) => void
  /** Switch to the deck list and open the create-deck dialog. */
  requestCreateDeck: () => void
  consumeCreateDeckRequest: () => void
  /** Timestamp of the pending create-deck request; 0 = none. */
  createDeckSignal: number
  openDeck: (deckId: string) => void
  startStudy: (deckId: string) => void
}

const LearningContext = createContext<LearningContextValue | null>(null)

export function LearningProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [decks, setDecks] = useState<Deck[]>([])
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [isLoadingDecks, setIsLoadingDecks] = useState(true)
  const [currentCard, setCurrentCard] = useState<Card | null>(null)
  const [aiRefreshCounter, setAiRefreshCounter] = useState(0)
  const [screen, setScreen] = useState<LearnScreen>({ kind: 'dashboard' })
  const [createDeckSignal, setCreateDeckSignal] = useState(0)
  const loadedForUserRef = useRef<string | null>(null)
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
    if (authLoading) return
    if (!user) {
      loadedForUserRef.current = null
      return
    }
    if (loadedForUserRef.current === user.id) return
    loadedForUserRef.current = user.id
    void refreshStats()
    void refreshDecks()
  }, [authLoading, user, refreshStats, refreshDecks])

  const triggerAiRefresh = useCallback(
    () => setAiRefreshCounter((count) => count + 1),
    []
  )

  const openAssistant = useCallback((prompt?: string) => {
    setScreen({ kind: 'assistant', prompt, key: Date.now() })
  }, [])

  const requestCreateDeck = useCallback(() => {
    setScreen({ kind: 'decks' })
    setCreateDeckSignal(Date.now())
  }, [])

  const consumeCreateDeckRequest = useCallback(() => setCreateDeckSignal(0), [])

  const openDeck = useCallback(
    (deckId: string) => setScreen({ kind: 'deck', deckId }),
    []
  )
  const startStudy = useCallback(
    (deckId: string) => setScreen({ kind: 'study', deckId }),
    []
  )

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
      screen,
      setScreen,
      openAssistant,
      requestCreateDeck,
      consumeCreateDeckRequest,
      createDeckSignal,
      openDeck,
      startStudy,
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
      screen,
      openAssistant,
      requestCreateDeck,
      consumeCreateDeckRequest,
      createDeckSignal,
      openDeck,
      startStudy,
    ]
  )

  return (
    <LearningContext.Provider value={value}>
      {children}
    </LearningContext.Provider>
  )
}

export function useLearning(): LearningContextValue {
  const context = useContext(LearningContext)
  if (!context)
    throw new Error('useLearning must be used inside LearningProvider')
  return context
}
