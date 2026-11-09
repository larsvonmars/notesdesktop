import {
  chatWithCustomTools,
  sendAIRequest,
  type AIMessage,
  type AITool,
  type ToolCallHandler,
} from '@/lib/ai'
import { createCards, getCardsByDeck, searchCards, updateCard } from './cards'
import { createDeck, getDecks, updateDeck, deleteDeck } from './decks'
import { getDocuments, getDocumentText, updateDocument } from './documents'
import { getDailyProgress, getSessionHistory, getUserStats } from './stats'
import type { Card, Deck, LearnDocument } from './types'

// ─── Context ────────────────────────────────────────────────────────────────

export interface LearnAIContext {
  currentDeckId?: string
  currentDeckName?: string
  currentCard?: { id: string; front: string; back: string } | null
  stats?: {
    level: number
    xp: number
    xpToNextLevel: number
    streak: number
    totalCardsReviewed: number
    totalDecks: number
    dailyGoal: number
    badgeNames: string[]
  } | null
}

export interface LearnAICallbacks {
  onToken?: (token: string) => void
  onReasoning?: (token: string) => void
  onToolCall?: (call: { id: string; name: string; arguments: Record<string, unknown> }) => void
  onToolResult?: (result: { id: string; name: string; result: string }) => void
}

// ─── Card generation helpers ────────────────────────────────────────────────

function parseCardArray(raw: string): Array<{ front: string; back: string }> {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed: unknown = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        const candidate = item as { front?: unknown; back?: unknown }
        if (typeof candidate.front !== 'string' || typeof candidate.back !== 'string') return null
        const front = candidate.front.trim()
        const back = candidate.back.trim()
        return front && back ? { front, back } : null
      })
      .filter((card): card is { front: string; back: string } => card !== null)
  } catch {
    return []
  }
}

const CARD_JSON_INSTRUCTION = `Return ONLY a JSON array with this exact shape:
[{"front": "question text", "back": "answer text"}]
Every card must be distinct and non-overlapping. The front is one clear question or prompt; the back is a concise 1–2 sentence answer.`

/**
 * Generate cards with 2–3 parallel sub-agents, each covering a different
 * aspect of the topic, then de-duplicate the combined result.
 */
export async function generateCards(topic: string, count: number): Promise<Array<{ front: string; back: string }>> {
  const safeCount = Math.max(1, Math.min(count, 60))
  const agentCount = safeCount <= 10 ? 2 : 3
  const cardsPerAgent = Math.ceil(safeCount / agentCount)
  const aspects = [
    'core concepts and definitions',
    'examples and applications',
    'relationships and connections to other topics',
  ]

  const results = await Promise.all(
    Array.from({ length: agentCount }, (_, index) => {
      const aspect = aspects[index] ?? 'key facts and details'
      const prompt = `You are a flashcard generator. Generate exactly ${cardsPerAgent} flashcards about "${topic}" focusing on ${aspect}.

Each card must have:
- "front": A clear, concise question or prompt (1 sentence)
- "back": A clear, concise answer (1-2 sentences)

${CARD_JSON_INSTRUCTION}`
      return sendAIRequest([{ role: 'user', content: prompt }], { maxTokens: 2000 }).catch(() => '')
    }),
  )

  const seen = new Set<string>()
  const cards: Array<{ front: string; back: string }> = []
  for (const raw of results) {
    for (const card of parseCardArray(raw)) {
      const key = `${card.front.toLowerCase()}::${card.back.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      cards.push(card)
    }
  }

  return cards.slice(0, safeCount)
}

/** Two parallel reviews: topic coverage and clarity/formatting. */
export async function analyzeDeckQuality(cards: Card[]): Promise<{ coverage: string; clarity: string }> {
  const cardList = cards
    .map((card, index) => `${index + 1}. Front: "${card.front}" / Back: "${card.back}"${card.mastered ? ' [mastered]' : ''}`)
    .join('\n')

  const coveragePrompt = `You are a flashcard quality reviewer. Analyze the TOPIC COVERAGE of these flashcards:

${cardList}

Evaluate:
1. Are the cards well-distributed across subtopics, or do they cluster on a few narrow areas?
2. Are there obvious gaps — important aspects of the topic that are missing entirely?
3. Is the difficulty balanced (mix of basic and advanced questions)?

Keep your analysis concise — 3-5 sentences total. Be constructive and specific.`

  const clarityPrompt = `You are a flashcard quality reviewer. Analyze the CLARITY and FORMATTING of these flashcards:

${cardList}

Evaluate:
1. Are the front/questions clear, specific, and unambiguous? Flag any vague or confusing prompts.
2. Are the back/answers concise and accurate? Flag any overly verbose or incomplete answers.
3. Is the difficulty appropriate? Flag cards that are trivially easy or impossibly hard.

Keep your analysis concise — 3-5 sentences total. Be constructive and specific. Flag specific card numbers when you find issues.`

  const [coverage, clarity] = await Promise.all([
    sendAIRequest([{ role: 'user', content: coveragePrompt }], { maxTokens: 500 }).catch(() => 'Analysis unavailable.'),
    sendAIRequest([{ role: 'user', content: clarityPrompt }], { maxTokens: 500 }).catch(() => 'Analysis unavailable.'),
  ])

  return { coverage: coverage.trim(), clarity: clarity.trim() }
}

/** Generate cards from extracted PDF text, chunk by chunk, then de-duplicate. */
export async function generateCardsFromDocument(
  text: string,
  options?: {
    deckTitle?: string
    maxCards?: number
    onProgress?: (message: string) => void
  },
): Promise<Array<{ front: string; back: string }>> {
  const { chunkText, checkTextQuality } = await import('./pdf-text')
  const warning = checkTextQuality(text)
  if (warning && text.length < 100) throw new Error(warning)

  const maxCards = Math.max(5, Math.min(options?.maxCards ?? 40, 60))
  const chunks = chunkText(text, 4000)
  const perChunk = Math.max(3, Math.ceil(maxCards / chunks.length))
  const subject = options?.deckTitle ? `the document "${options.deckTitle}"` : 'the uploaded document'

  const collected: Array<{ front: string; back: string }> = []
  const seen = new Set<string>()

  for (let index = 0; index < chunks.length; index += 1) {
    options?.onProgress?.(`Generating cards from part ${index + 1} of ${chunks.length}…`)
    const prompt = `You are an expert flashcard creator. Create up to ${perChunk} high-quality flashcards from this excerpt of ${subject}.

EXCERPT:
"""
${chunks[index]}
"""

Focus on the most important facts, definitions, and relationships. Do not invent information that is not in the text.

${CARD_JSON_INSTRUCTION}`

    const raw = await sendAIRequest([{ role: 'user', content: prompt }], { maxTokens: 2500 })
    for (const card of parseCardArray(raw)) {
      const key = `${card.front.toLowerCase()}::${card.back.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      collected.push(card)
      if (collected.length >= maxCards) break
    }
    if (collected.length >= maxCards) break
  }

  if (collected.length === 0) {
    throw new Error('The AI could not generate flashcards from this document. Try a document with more text.')
  }

  return collected
}

// ─── Assistant tool definitions ─────────────────────────────────────────────

export const LEARN_TOOLS: AITool[] = [
  {
    type: 'function',
    function: {
      name: 'list_decks',
      description: "List all of the user's study decks with card/mastered counts.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cards',
      description: 'Get all cards in a specific deck.',
      parameters: {
        type: 'object',
        properties: { deckId: { type: 'string', description: 'The id of the deck' } },
        required: ['deckId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_deck',
      description: 'Create a new study deck.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of the new deck' },
          description: { type: 'string', description: 'Optional description for the deck' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_cards',
      description: 'Add one or more flashcards to a deck. Prefer adding multiple cards in one call.',
      parameters: {
        type: 'object',
        properties: {
          deckId: { type: 'string', description: 'The id of the deck to add cards to' },
          cards: {
            type: 'array',
            description: 'Cards to add',
            items: {
              type: 'object',
              properties: {
                front: { type: 'string', description: 'Question text' },
                back: { type: 'string', description: 'Answer text' },
              },
              required: ['front', 'back'],
            },
          },
        },
        required: ['deckId', 'cards'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_card',
      description: 'Update the front, back, or mastered status of a card.',
      parameters: {
        type: 'object',
        properties: {
          cardId: { type: 'string', description: 'The id of the card to update' },
          front: { type: 'string', description: 'New front text' },
          back: { type: 'string', description: 'New back text' },
          mastered: { type: 'boolean', description: 'Mark as mastered or not' },
        },
        required: ['cardId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_deck',
      description: "Update a deck's title or description.",
      parameters: {
        type: 'object',
        properties: {
          deckId: { type: 'string', description: 'The id of the deck to update' },
          title: { type: 'string', description: 'New title' },
          description: { type: 'string', description: 'New description' },
        },
        required: ['deckId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_card',
      description:
        'Delete a card. Call with confirmed=false first to preview; only call with confirmed=true after the user explicitly confirms.',
      parameters: {
        type: 'object',
        properties: {
          cardId: { type: 'string', description: 'The id of the card to delete' },
          cardFront: { type: 'string', description: 'Front text of the card for the confirmation message' },
          confirmed: { type: 'boolean', description: 'false = preview only; true = actually delete' },
        },
        required: ['cardId', 'cardFront', 'confirmed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_deck',
      description:
        'Delete a deck and all its cards. Call with confirmed=false first to preview; only call with confirmed=true after the user explicitly confirms.',
      parameters: {
        type: 'object',
        properties: {
          deckId: { type: 'string', description: 'The id of the deck to delete' },
          deckTitle: { type: 'string', description: 'Title of the deck for the confirmation message' },
          confirmed: { type: 'boolean', description: 'false = preview only; true = actually delete' },
        },
        required: ['deckId', 'deckTitle', 'confirmed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stats',
      description:
        "Fetch the user's XP, level, streak, badges, accuracy and goals. Use this for progress, leveling or achievement questions.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_progress',
      description: "Get today's study progress: cards reviewed, correct count and daily goal status.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_study_history',
      description: 'Get recent study session history.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of recent sessions (default 5, max 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_cards',
      description: 'Search cards across all decks (or one deck) by keyword, matching front and back.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          deckId: { type: 'string', description: 'Optional deck id to limit the search' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_cards_parallel',
      description:
        'Generate high-quality flashcards about a topic using parallel sub-agents. Use for bulk generation of 5+ cards.',
      parameters: {
        type: 'object',
        properties: {
          deckId: { type: 'string', description: 'Deck to add the generated cards to' },
          topic: { type: 'string', description: 'Topic to generate cards about' },
          count: { type: 'number', description: 'How many cards to generate (1-40)' },
        },
        required: ['deckId', 'topic', 'count'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_deck_quality',
      description: "Analyze a deck's quality: topic coverage and card clarity.",
      parameters: {
        type: 'object',
        properties: { deckId: { type: 'string', description: 'The id of the deck to analyze' } },
        required: ['deckId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_documents',
      description: 'List uploaded PDF documents with id, filename, status and linked deck.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_deck_from_document',
      description:
        'Create a study deck from an uploaded PDF by extracting its text and generating flashcards.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'The id of the document' },
          deckTitle: { type: 'string', description: 'Optional title for the new deck' },
          cardCount: { type: 'number', description: 'Target number of cards (default 20)' },
        },
        required: ['documentId'],
      },
    },
  },
]

function formatDeckList(decks: Deck[]): string {
  if (decks.length === 0) return 'You have no decks yet.'
  return decks
    .map((deck) => `• "${deck.title}" (id: ${deck.id}) — ${deck.cardCount} cards, ${deck.masteredCount} mastered`)
    .join('\n')
}

function formatCards(cards: Card[]): string {
  if (cards.length === 0) return 'This deck has no cards yet.'
  return cards
    .map(
      (card, index) =>
        `${index + 1}. Front: "${card.front}" | Back: "${card.back}"${card.mastered ? ' ✓ mastered' : ''} (id: ${card.id})`,
    )
    .join('\n')
}

function formatDocuments(documents: LearnDocument[]): string {
  if (documents.length === 0) {
    return "You haven't uploaded any PDF documents yet. Upload one from the assistant's Documents panel or the deck editor."
  }
  return [
    `📄 **Your uploaded documents (${documents.length})**`,
    ...documents.map(
      (document) =>
        `• ${document.filename} (id: ${document.id}) — ${document.status}${document.deckId ? ` · Deck linked: ${document.deckId}` : ''} · ${(document.fileSize / 1024).toFixed(0)} KB`,
    ),
  ].join('\n')
}

/** Build the tool executor for the Learn assistant. */
export function createLearnToolHandler(timezoneOffset = 0): ToolCallHandler {
  return async (name, args) => {
    switch (name) {
      case 'list_decks':
        return formatDeckList(await getDecks())

      case 'get_cards': {
        const deckId = String(args.deckId ?? '')
        if (!deckId) return 'Missing deckId.'
        return formatCards(await getCardsByDeck(deckId))
      }

      case 'create_deck': {
        const deck = await createDeck({
          title: String(args.title ?? 'Untitled deck'),
          description: args.description ? String(args.description) : undefined,
        })
        return `Created deck "${deck.title}" (id: ${deck.id})`
      }

      case 'add_cards': {
        const deckId = String(args.deckId ?? '')
        const cards = Array.isArray(args.cards) ? (args.cards as Array<{ front: string; back: string }>) : []
        const valid = cards.filter(
          (card) => typeof card?.front === 'string' && typeof card?.back === 'string' && card.front && card.back,
        )
        if (!deckId || valid.length === 0) return 'No valid cards were provided.'
        await createCards(deckId, valid)
        return `Added ${valid.length} card${valid.length === 1 ? '' : 's'} to the deck.`
      }

      case 'update_card': {
        const cardId = String(args.cardId ?? '')
        if (!cardId) return 'Missing cardId.'
        await updateCard(cardId, {
          front: typeof args.front === 'string' ? args.front : undefined,
          back: typeof args.back === 'string' ? args.back : undefined,
          mastered: typeof args.mastered === 'boolean' ? args.mastered : undefined,
        })
        return `Updated card ${cardId}.`
      }

      case 'update_deck': {
        const deckId = String(args.deckId ?? '')
        if (!deckId) return 'Missing deckId.'
        await updateDeck(deckId, {
          title: typeof args.title === 'string' ? args.title : undefined,
          description: typeof args.description === 'string' ? args.description : undefined,
        })
        return `Updated deck ${deckId}.`
      }

      case 'delete_card': {
        const cardId = String(args.cardId ?? '')
        if (!args.confirmed) {
          return `About to delete card: "${String(args.cardFront ?? 'this card')}". Reply "yes" or "confirm" to proceed.`
        }
        if (!cardId) return 'Missing cardId.'
        const { deleteCard } = await import('./cards')
        await deleteCard(cardId)
        return `Deleted card "${String(args.cardFront ?? cardId)}".`
      }

      case 'delete_deck': {
        const deckId = String(args.deckId ?? '')
        if (!args.confirmed) {
          return `About to permanently delete deck "${String(args.deckTitle ?? 'this deck')}" and all its cards. Reply "yes" or "confirm" to proceed.`
        }
        if (!deckId) return 'Missing deckId.'
        await deleteDeck(deckId)
        return `Deleted deck "${String(args.deckTitle ?? deckId)}".`
      }

      case 'get_stats': {
        const stats = await getUserStats(timezoneOffset)
        if (!stats) return 'Unable to load stats. Please try again.'
        const earnedBadges = stats.badges.filter((badge) => badge.earnedAt)
        const accuracy =
          stats.totalCardsReviewed > 0 ? Math.round((stats.totalCorrect / stats.totalCardsReviewed) * 100) : 0
        return [
          '📊 **Your stats**',
          `• Level ${stats.level} — ${stats.xp} XP (${Math.max(0, stats.xpToNextLevel - stats.xp)} XP to next level)`,
          `• ${stats.streak}-day streak 🔥`,
          `• ${stats.totalCardsReviewed} cards reviewed total`,
          `• ${stats.totalDecks} decks`,
          `• ${stats.totalSessions} study sessions`,
          `• Accuracy: ${accuracy}% (${stats.totalCorrect} correct)`,
          `• Today: ${stats.dailyCardsReviewed}/${stats.dailyGoal} cards${stats.dailyGoalMet ? ' ✅ Goal met!' : ''}`,
          `• Badges earned: ${earnedBadges.length > 0 ? earnedBadges.map((badge) => `${badge.icon} ${badge.name}`).join(', ') : 'None yet'}`,
        ].join('\n')
      }

      case 'get_daily_progress': {
        const progress = await getDailyProgress(timezoneOffset)
        return [
          "📅 **Today's progress**",
          `• ${progress.cardsReviewed}/${progress.goal} cards reviewed`,
          `• ${progress.correct} correct`,
          `• Goal progress: ${progress.goalProgress}%${progress.goalMet ? ' ✅ Goal met!' : ''}`,
        ].join('\n')
      }

      case 'get_study_history': {
        const limit = Math.min(Number(args.limit ?? 5) || 5, 10)
        const sessions = await getSessionHistory(limit)
        if (sessions.length === 0) return 'No study sessions recorded yet.'
        return [
          `📋 **Recent sessions (last ${sessions.length})**`,
          ...sessions.map(
            (session) =>
              `• ${session.deckTitle} — ${session.cardsReviewed} cards (${session.correct} correct) · ${session.xpEarned} XP · ${session.mode ?? 'flashcard'} mode`,
          ),
        ].join('\n')
      }

      case 'search_cards': {
        const query = String(args.query ?? '').trim()
        if (!query) return 'Please provide a search query.'
        const cards = await searchCards(query, args.deckId ? String(args.deckId) : undefined)
        if (cards.length === 0) return `No cards found matching "${query}".`
        return [
          `🔍 **Search results for "${query}" (${cards.length} cards)**`,
          ...cards.map((card, index) => `${index + 1}. Front: "${card.front}" → Back: "${card.back}"`),
        ].join('\n')
      }

      case 'generate_cards_parallel': {
        const deckId = String(args.deckId ?? '')
        const topic = String(args.topic ?? '').trim()
        const count = Math.max(1, Math.min(Number(args.count ?? 10) || 10, 40))
        if (!deckId || !topic) return 'Missing deckId or topic.'
        const cards = await generateCards(topic, count)
        if (cards.length === 0) return 'Card generation failed. Please try again.'
        await createCards(deckId, cards)
        return [
          `✅ Generated and added ${cards.length} cards about "${topic}".`,
          '',
          ...cards.map((card, index) => `${index + 1}. **${card.front}** → ${card.back}`),
        ].join('\n')
      }

      case 'analyze_deck_quality': {
        const deckId = String(args.deckId ?? '')
        if (!deckId) return 'Missing deckId.'
        const cards = await getCardsByDeck(deckId)
        if (cards.length === 0) return 'This deck has no cards to analyze.'
        const { coverage, clarity } = await analyzeDeckQuality(cards)
        return [
          `🔎 **Deck quality analysis** (${cards.length} cards)`,
          '',
          '**📊 Topic coverage:**',
          coverage,
          '',
          '**📝 Clarity & formatting:**',
          clarity,
          '',
          '💡 Use this feedback to fill gaps and rephrase unclear cards.',
        ].join('\n')
      }

      case 'list_documents':
        return formatDocuments(await getDocuments())

      case 'create_deck_from_document': {
        const documentId = String(args.documentId ?? '')
        if (!documentId) return 'Missing documentId.'
        const deckTitle = typeof args.deckTitle === 'string' && args.deckTitle.trim()
          ? args.deckTitle.trim()
          : 'Document deck'
        const cardCount = Math.max(5, Math.min(Number(args.cardCount ?? 20) || 20, 60))
        const extracted = await getDocumentText(documentId)
        const cards = await generateCardsFromDocument(extracted.text, { deckTitle, maxCards: cardCount })
        const deck = await createDeck({ title: deckTitle, description: `Generated from a PDF (${extracted.numPages} pages)` })
        await createCards(deck.id, cards)
        await updateDocument(documentId, { status: 'processed', deckId: deck.id }).catch(() => {})
        return `✅ Created deck "${deck.title}" (id: ${deck.id}) with ${cards.length} cards from the document.`
      }

      default:
        return `Unknown tool: ${name}`
    }
  }
}

// ─── System prompt ──────────────────────────────────────────────────────────

export function buildLearnSystemPrompt(context?: LearnAIContext): string {
  const deckContext =
    context?.currentDeckId && context.currentDeckName
      ? `\n\nThe user is currently viewing the deck "${context.currentDeckName}" (id: ${context.currentDeckId}). When they say "this deck", use this id.`
      : ''

  const cardContext = context?.currentCard
    ? `\n\nThe user is studying this flashcard:\n- Front: "${context.currentCard.front}"\n- Back: "${context.currentCard.back}"\nWhen they ask about "this card", explain this content.`
    : ''

  const statsContext = context?.stats
    ? `\n\nUser stats: level ${context.stats.level}, ${context.stats.xp}/${context.stats.xpToNextLevel} XP, ${context.stats.streak}-day streak, ${context.stats.totalCardsReviewed} cards reviewed, ${context.stats.totalDecks} decks, daily goal ${context.stats.dailyGoal} cards. Badges: ${
        context.stats.badgeNames.length > 0 ? context.stats.badgeNames.join(', ') : 'none yet'
      }. Personalize encouragement naturally.`
    : ''

  return `You are an AI study assistant for MindViz Learn, the learning workspace inside a desktop notes app.
You help users manage decks and flashcards through conversation and help them understand card content.

Your capabilities:
- List decks and view their cards
- Create decks and add multiple cards at once
- Update and delete decks/cards (deletions require explicit confirmation)
- Explain and give examples for the card being studied
- Look up stats, daily progress and study history
- Search cards across all decks
- Analyze study patterns and suggest improvements
- Generate high-quality flashcards in bulk with parallel sub-agents
- Analyze deck quality for coverage and clarity
- List uploaded PDFs and create decks from their content

Guidelines:
- Be concise and friendly.
- Use "this card" context when provided.
- Generate clear question/answer pairs; never invent facts for document import.
- Prefer generate_cards_parallel for 5+ new cards.
- For deletions, call the tool with confirmed=false first, then wait for a clear confirmation before confirmed=true.
- Format tool results clearly (e.g. "✅ Created deck 'X'").
- Never expose internal IDs unless needed for disambiguation.${deckContext}${cardContext}${statsContext}`
}

/** Send a turn to the Learn assistant with the full tool suite. */
export async function runLearnAssistant(input: {
  history: AIMessage[]
  message: string
  context?: LearnAIContext
  callbacks?: LearnAICallbacks
  timezoneOffset?: number
}): Promise<string> {
  const messages: AIMessage[] = [
    { role: 'system', content: buildLearnSystemPrompt(input.context) },
    ...input.history,
    { role: 'user', content: input.message },
  ]

  return chatWithCustomTools(messages, LEARN_TOOLS, createLearnToolHandler(input.timezoneOffset ?? 0), {
    maxIterations: 12,
    onToken: input.callbacks?.onToken,
    onReasoning: input.callbacks?.onReasoning,
    onToolCall: input.callbacks?.onToolCall,
    onToolResult: input.callbacks?.onToolResult,
  })
}

// ─── Tutor & AI Learn ───────────────────────────────────────────────────────

export type TutorStyle = 'socratic' | 'oral-exam' | 'conversational' | 'rapid-fire'

export const TUTOR_STYLES: Array<{ id: TutorStyle; label: string; description: string }> = [
  {
    id: 'socratic',
    label: 'Socratic',
    description: 'I ask questions, you answer, and I guide you with hints toward the right answer.',
  },
  {
    id: 'oral-exam',
    label: 'Oral Exam',
    description: 'Formal examination. I grade each answer out of 10 and give a final report.',
  },
  {
    id: 'conversational',
    label: 'Conversational',
    description: 'Casual, friendly discussion — like talking to a knowledgeable friend.',
  },
  {
    id: 'rapid-fire',
    label: 'Rapid Fire',
    description: '⚡ Fast-paced quiz with short answers and instant feedback.',
  },
]

function buildCardContext(cardContent: string[]): string {
  if (cardContent.length === 0) return ''
  return `\n\nHere are the flashcards the user is studying:\n${cardContent.map((card, index) => `${index + 1}. ${card}`).join('\n')}`
}

export function buildTutorSystemPrompt(style: TutorStyle, deckTitle: string, cardContent: string[]): string {
  const context = buildCardContext(cardContent)
  const tools = `TOOLS YOU CAN USE:
- lookup_card(cardNumber): get the full content of a flashcard by its 1-based number.
- mark_card_mastered(cardNumber): mark a card mastered after a correct, confident answer.
- suggest_related_cards(topic): find other cards related to a topic.
- get_study_tip(): get a contextual study tip.`

  if (style === 'oral-exam') {
    return `You are an AI oral examiner for MindViz Learn, testing a student on "${deckTitle}".

YOUR ROLE — FORMAL EXAMINER:
- Introduce yourself and explain the format: one question at a time, evaluated answers, final assessment.
- Ask challenging, precise questions based on the flashcards.
- Do NOT give hints or reveal answers — this is an exam.
- ✅ Correct: "Correct. [Brief reinforcement]. Score: 10/10."
- ⚠️ Partially correct: state what was right/missing and give a score out of 10.
- ❌ Wrong: "Incorrect. Score: 0/10." Then briefly state the correct answer and move on.
- Ask the next question immediately after evaluating.
- Cover ALL cards. When done (or the user says "end exam"), give a final report: total score, grade (A 90%+, B 80-89%, C 70-79%, D 60-69%, F below 60%), strengths and areas to improve.
- Professional but encouraging. Keep responses 2-3 sentences except the final report.

${tools}
Mark mastered only for scores of 8+/10. Use markdown sparingly. Do not mention card numbers.${context}`
  }

  if (style === 'conversational') {
    return `You are an AI study buddy for MindViz Learn, having a relaxed conversation about "${deckTitle}".

YOUR ROLE — CASUAL STUDY PARTNER:
- Start with a warm, informal greeting.
- Have a natural, flowing conversation; weave flashcard topics in organically.
- Share interesting facts, real-world examples and connections.
- Let the conversation breathe — go deeper where the student is interested.
- ✅ Correct: "Exactly! And here's something cool about that…"
- ⚠️ Partially correct: "You're onto something! The other piece is…"
- ❌ Wrong: "I can see why you'd think that! Actually, …"
- 😕 "I don't know": "No worries! Let me break it down…"

${tools}
Be warm, casual and curious. Keep responses 2-5 sentences. When the user says "wrap up", summarize what you discussed and suggest a topic for next time. Do not mention card numbers.${context}`
  }

  if (style === 'rapid-fire') {
    return `You are an AI rapid-fire quiz master for MindViz Learn, running a fast review of "${deckTitle}".

YOUR ROLE — SPEED QUIZ HOST:
- Start with "⚡ Rapid Fire time! Quick questions, quick answers — let's go!"
- Ask one-sentence questions at maximum speed.
- ✅ Correct: "✅ Yes!" or "✅ Nailed it!" — 1-3 words, then the next question.
- ⚠️ Partially correct: "⚠️ Close! [1 sentence correction] — Next:"
- ❌ Wrong: "❌ Nope — [answer]. Next:"
- Do NOT give long explanations. After every 5 questions, give a quick stats burst.
- Cover ALL cards. When done (or the user says "stop"/"end"), summarize: total X/Y correct, speed rating, weakest topic.
- Maximum energy, minimum words. 1-2 sentences per response. Use emojis liberally.

${tools}
Do not mention card numbers.${context}`
  }

  return `You are an AI Socratic tutor for MindViz Learn, helping a student explore "${deckTitle}".

YOUR ROLE:
- Lead the conversation — do NOT wait for the student to ask you.
- Start immediately with a friendly introduction and your first question.
- Ask one question at a time, then wait for the student's response.
- Use the flashcards below as your primary source material.

HOW TO RESPOND:
- ✅ Correct: acknowledge enthusiastically, briefly explain why, then ask a deeper follow-up.
- ⚠️ Partially correct: "You're on the right track! [What's correct]. However, [gentle correction]. Let me ask you this…"
- ❌ Wrong: don't give the answer immediately — give a hint or rephrase.
- 😕 "I don't know": give an encouraging hint and break the concept into smaller pieces.

${tools}
Be encouraging and curious. Cover different cards. Keep responses concise (2-4 sentences). When the user says "end session" or "summarize", provide a warm summary with strengths and 1-2 review areas. Do not mention card numbers or IDs.${context}`
}

export function buildAiLearnSystemPrompt(deckTitle: string, cardContent: string[]): string {
  const context = buildCardContext(cardContent)
  return `You are an AI tutor for MindViz Learn guiding a student through "${deckTitle}" card by card.

FOLLOW THIS STRUCTURE:
1. Start with a friendly greeting and your first question (based on card 1).
2. After the user answers, evaluate:
   - ✅ Correct: acknowledge enthusiastically, reinforce why, move to the next card.
   - ⚠️ Partially correct: "Close! Here's what you got right… The nuance is… Score: X/100". Then move on.
   - ❌ Wrong: give a helpful hint, let them try once more. If still wrong, explain and move on.
   - 😕 "I don't know": give a hint, break it down.
3. After each evaluation ALWAYS include a score like "Score: 85/100".
4. Go through EVERY card — don't skip any.
5. After all cards, say "That's all X cards!" and give a warm performance summary.

TOOLS YOU CAN USE:
- lookup_card(cardNumber): get a card's full content.
- mark_card_mastered(cardNumber): mark a card mastered when the student scores 80+/100.

RULES:
- Be encouraging and conversational.
- Keep responses 2-4 sentences except summaries.
- Ask one question at a time.
- When the user says "end session", "wrap up" or "summarize", stop covering new cards and summarize immediately.
- Do not mention card numbers or IDs.${context}`
}

export const TUTOR_TOOLS: AITool[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_card',
      description: 'Get the full content (front and back) of a flashcard by its 1-based number.',
      parameters: {
        type: 'object',
        properties: {
          cardNumber: { type: 'number', description: '1-based index of the card' },
        },
        required: ['cardNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_card_mastered',
      description:
        'Mark a flashcard as mastered. Only when the student clearly demonstrates understanding.',
      parameters: {
        type: 'object',
        properties: {
          cardNumber: { type: 'number', description: '1-based index of the card to mark mastered' },
        },
        required: ['cardNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_related_cards',
      description: 'Find cards related to a topic to help the student make connections.',
      parameters: {
        type: 'object',
        properties: { topic: { type: 'string', description: 'Keyword or topic' } },
        required: ['topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_study_tip',
      description: 'Get a contextual study tip for the current topic.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
]

export function createTutorToolHandler(input: {
  deckTitle: string
  cardContent: string[]
  cardIds: string[]
}): ToolCallHandler {
  const tips = [
    `💡 **Active Recall**: Close your eyes and try to recall the key points about "${input.deckTitle}" from memory instead of re-reading.`,
    `💡 **Spaced Repetition**: Review "${input.deckTitle}" at increasing intervals — today, tomorrow, in 3 days, then a week.`,
    `💡 **Teach Someone**: Explain "${input.deckTitle}" out loud as if teaching a friend. If you can't explain it simply, you don't understand it yet.`,
    `💡 **Make Connections**: Link new concepts in "${input.deckTitle}" to things you already know.`,
    `💡 **Mix It Up**: Interleave "${input.deckTitle}" with other topics. It feels harder but improves long-term learning.`,
    `💡 **Test Yourself First**: Guess the answer before studying a card. Even a wrong guess primes your brain.`,
  ]

  return async (name, args) => {
    switch (name) {
      case 'lookup_card': {
        const cardNumber = Number(args.cardNumber ?? 0)
        const index = cardNumber - 1
        if (!Number.isInteger(cardNumber) || index < 0 || index >= input.cardContent.length) {
          return `Card #${cardNumber} not found. There are ${input.cardContent.length} cards in this deck.`
        }
        return `Card #${cardNumber}: ${input.cardContent[index]}`
      }

      case 'mark_card_mastered': {
        const cardNumber = Number(args.cardNumber ?? 0)
        const cardId = input.cardIds[cardNumber - 1]
        if (!cardId) return `Card #${cardNumber} cannot be marked — no card ID available.`
        await updateCard(cardId, { mastered: true })
        return `✅ Marked card #${cardNumber} as mastered.`
      }

      case 'suggest_related_cards': {
        const topic = String(args.topic ?? '').trim()
        if (!topic) return 'Please provide a more specific topic.'
        const cards = await searchCards(topic)
        if (cards.length === 0) return `No related cards found for "${topic}".`
        return [
          `🔗 **Cards related to "${topic}"** (${cards.length} found):`,
          ...cards.slice(0, 10).map((card, index) => `${index + 1}. Front: "${card.front}" → Back: "${card.back}"`),
        ].join('\n')
      }

      case 'get_study_tip':
        return tips[Math.floor(Math.random() * tips.length)]

      default:
        return `Unknown tool: ${name}`
    }
  }
}

/** Send a tutor turn. Returns the assistant reply. */
export async function runTutorChat(input: {
  style: TutorStyle
  deckTitle: string
  cardContent: string[]
  cardIds: string[]
  history: AIMessage[]
  message: string
  callbacks?: LearnAICallbacks
}): Promise<string> {
  const messages: AIMessage[] = [
    { role: 'system', content: buildTutorSystemPrompt(input.style, input.deckTitle, input.cardContent) },
    ...input.history,
    { role: 'user', content: input.message },
  ]

  return chatWithCustomTools(
    messages,
    TUTOR_TOOLS,
    createTutorToolHandler({ deckTitle: input.deckTitle, cardContent: input.cardContent, cardIds: input.cardIds }),
    {
      maxIterations: 6,
      onToken: input.callbacks?.onToken,
      onReasoning: input.callbacks?.onReasoning,
      onToolCall: input.callbacks?.onToolCall,
      onToolResult: input.callbacks?.onToolResult,
    },
  )
}

/** Send an AI Learn turn. */
export async function runAiLearnChat(input: {
  deckTitle: string
  cardContent: string[]
  cardIds: string[]
  history: AIMessage[]
  message: string
  callbacks?: LearnAICallbacks
}): Promise<string> {
  const messages: AIMessage[] = [
    { role: 'system', content: buildAiLearnSystemPrompt(input.deckTitle, input.cardContent) },
    ...input.history,
    { role: 'user', content: input.message },
  ]

  return chatWithCustomTools(
    messages,
    TUTOR_TOOLS.filter((tool) => ['lookup_card', 'mark_card_mastered'].includes(tool.function.name)),
    createTutorToolHandler({ deckTitle: input.deckTitle, cardContent: input.cardContent, cardIds: input.cardIds }),
    {
      maxIterations: 6,
      onToken: input.callbacks?.onToken,
      onReasoning: input.callbacks?.onReasoning,
      onToolCall: input.callbacks?.onToolCall,
      onToolResult: input.callbacks?.onToolResult,
    },
  )
}
