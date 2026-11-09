/**
 * Chat tool registry: OpenAI-compatible function definitions together with the
 * client-side executors that run them against the user's own workspace data.
 *
 * The executors run in the renderer with the signed-in Supabase session, so no
 * privileged keys are ever involved. Names listed here must stay in sync with
 * the server-side whitelist in `app/api/ai/validation.ts` and
 * `cloudflare/ai-worker/src/index.js`.
 */

import { createNote, getAllNoteSummaries, getNote, searchNotes, updateNote } from '@/lib/notes'
import type { NoteSummary, NoteType } from '@/lib/notes'
import { getFolders } from '@/lib/folders'
import { getProjects } from '@/lib/projects'
import { completeTask, createTask, getTaskStats, getTasks } from '@/lib/tasks'
import type { Task, TaskPriority, TaskStatus } from '@/lib/tasks'
import { stripHtmlForAI, textToHtml } from '@/lib/ai'
import { createCards as createLearnCards, searchCards as searchLearnCards } from '@/lib/learn/cards'
import { createDeck as createLearnDeck, getDecks as getLearnDecks } from '@/lib/learn/decks'
import { getUserStats as getLearnStats } from '@/lib/learn/stats'

export interface ChatToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ChatToolContext {
  userId: string
  signal?: AbortSignal
}

export interface ChatToolSpec {
  definition: ChatToolDefinition
  execute: (args: Record<string, unknown>, ctx: ChatToolContext) => Promise<string>
}

const NOTE_TYPES: NoteType[] = [
  'rich-text',
  'drawing',
  'mindmap',
  'bullet-journal',
  'data-sheet',
  'pdf-annotation',
]

const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'waiting', 'completed', 'cancelled']
const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.round(parsed)))
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n\n[... truncated]` : text
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 16).replace('T', ' ')
}

async function nameLookups() {
  const [folders, projects] = await Promise.all([
    getFolders().catch(() => []),
    getProjects().catch(() => []),
  ])
  return {
    folderNames: new Map(folders.map((folder) => [folder.id, folder.name])),
    projectNames: new Map(projects.map((project) => [project.id, project.name])),
  }
}

function summariseNote(
  note: NoteSummary,
  names: { folderNames: Map<string, string>; projectNames: Map<string, string> },
): string {
  const location = note.folder_id ? names.folderNames.get(note.folder_id) : null
  const project = note.project_id ? names.projectNames.get(note.project_id) : null
  const parts = [
    `- ${note.title || 'Untitled'}  [id: ${note.id}]`,
    `  type: ${note.note_type}`,
    `  updated: ${formatDate(note.updated_at)}`,
  ]
  if (project) parts.push(`  project: ${project}`)
  if (location) parts.push(`  folder: ${location}`)
  return parts.join('\n')
}

function summariseTask(task: Task): string {
  const bits = [
    `- ${task.title}  [id: ${task.id}]`,
    `  status: ${task.status}`,
    `  priority: ${task.priority}`,
  ]
  if (task.due_date) bits.push(`  due: ${formatDate(task.due_date)}`)
  if (task.description) bits.push(`  notes: ${task.description.slice(0, 200)}`)
  return bits.join('\n')
}

async function resolveNoteId(args: Record<string, unknown>): Promise<string | null> {
  const noteId = str(args.noteId ?? args.note_id)
  if (noteId) return noteId

  const title = str(args.noteTitle ?? args.title)
  if (!title) return null

  const summaries = await getAllNoteSummaries(2000)
  const needle = title.toLowerCase()
  const exact = summaries.find((note) => note.title.toLowerCase() === needle)
  if (exact) return exact.id
  const partial = summaries.find((note) => note.title.toLowerCase().includes(needle))
  return partial?.id ?? null
}

const getCurrentDate: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'get_current_date',
      description:
        'Get the current date and time. Use this whenever the answer depends on "now" (today, this week, how many days until an event).',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Optional IANA timezone, e.g. "Europe/Zurich". Defaults to the device timezone.',
          },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const timezone = str(args.timezone)
    const now = new Date()
    let local = now.toString()
    try {
      local = now.toLocaleString('en-US', timezone ? { timeZone: timezone } : undefined)
    } catch {
      // Unknown timezone → keep the device representation.
    }
    return JSON.stringify({
      iso: now.toISOString(),
      local,
      weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
      timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  },
}

const listNotes: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'list_notes',
      description:
        'List the user\'s notes with ids, types and locations. Optionally filter by folder name, project name, note type or a title/content keyword.',
      parameters: {
        type: 'object',
        properties: {
          folder: { type: 'string', description: 'Folder name to filter by' },
          project: { type: 'string', description: 'Project name to filter by' },
          type: { type: 'string', enum: NOTE_TYPES, description: 'Note type to filter by' },
          query: { type: 'string', description: 'Keyword matched against note titles' },
          limit: { type: 'number', minimum: 1, maximum: 100, description: 'Maximum results (default 25)' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const limit = num(args.limit, 25, 1, 100)
    const folderFilter = str(args.folder).toLowerCase()
    const projectFilter = str(args.project).toLowerCase()
    const typeFilter = str(args.type)
    const queryFilter = str(args.query).toLowerCase()

    const [summaries, names] = await Promise.all([getAllNoteSummaries(5000), nameLookups()])

    const filtered = summaries.filter((note) => {
      if (typeFilter && note.note_type !== typeFilter) return false
      if (queryFilter && !note.title.toLowerCase().includes(queryFilter)) return false
      if (folderFilter) {
        const folderName = note.folder_id ? names.folderNames.get(note.folder_id) : ''
        if (!folderName || !folderName.toLowerCase().includes(folderFilter)) return false
      }
      if (projectFilter) {
        const projectName = note.project_id ? names.projectNames.get(note.project_id) : ''
        if (!projectName || !projectName.toLowerCase().includes(projectFilter)) return false
      }
      return true
    })

    if (filtered.length === 0) {
      return 'No notes matched. The workspace has ' + summaries.length + ' notes in total.'
    }

    const shown = filtered.slice(0, limit)
    return [
      `${filtered.length} matching note${filtered.length === 1 ? '' : 's'} (showing ${shown.length}):`,
      ...shown.map((note) => summariseNote(note, names)),
    ].join('\n')
  },
}

const searchNotesTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'search_notes',
      description:
        'Search the full text of the user\'s notes. Returns matching notes with a short excerpt so you can answer questions about their content.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words to look for in note titles and content' },
          maxResults: { type: 'number', minimum: 1, maximum: 20, description: 'Maximum matches (default 8)' },
        },
        required: ['query'],
      },
    },
  },
  execute: async (args) => {
    const query = str(args.query)
    if (!query) return 'Error: query is required.'

    const limit = num(args.maxResults, 8, 1, 20)
    const [matches, names] = await Promise.all([searchNotes(query, { limit }), nameLookups()])

    if (matches.length === 0) return `No notes matched "${query}".`

    return [
      `${matches.length} note${matches.length === 1 ? '' : 's'} matched "${query}":`,
      ...matches.map((note) => {
        const excerpt = truncate(stripHtmlForAI(note.content || '').replace(/\s+/g, ' '), 400)
        return [
          summariseNote(note, names),
          excerpt ? `  excerpt: ${excerpt}` : '  excerpt: (empty note)',
        ].join('\n')
      }),
    ].join('\n')
  },
}

const readNote: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'read_note',
      description:
        'Read the full plain-text content of one note. Pass either the note id (preferred) or its title.',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string', description: 'Note id from list_notes or search_notes' },
          noteTitle: { type: 'string', description: 'Note title, used when no id is known' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const noteId = await resolveNoteId(args)
    if (!noteId) return 'Error: note not found. Use list_notes or search_notes first to find the id.'

    const note = await getNote(noteId)
    if (!note) return `Error: no note with id ${noteId}.`

    const text = stripHtmlForAI(note.content || '')
    return [
      `# ${note.title || 'Untitled'}`,
      `type: ${note.note_type} · updated: ${formatDate(note.updated_at)}`,
      '',
      truncate(text || '(empty note)', 12000),
    ].join('\n')
  },
}

const createNoteTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'create_note',
      description:
        'Create a new rich-text note containing the supplied content. Use this when the user asks you to write something down, draft a note, or save an outline.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title (defaults to "Untitled")' },
          content: {
            type: 'string',
            description: 'Note body as plain text or simple HTML. Blank lines separate paragraphs.',
          },
          folder: { type: 'string', description: 'Optional folder name to file the note in' },
          project: { type: 'string', description: 'Optional project name to file the note in' },
        },
        required: ['content'],
      },
    },
  },
  execute: async (args, ctx) => {
    const content = str(args.content)
    if (!content) return 'Error: content is required.'

    const title = str(args.title) || 'Untitled'
    const folderName = str(args.folder).toLowerCase()
    const projectName = str(args.project).toLowerCase()

    let folderId: string | null = null
    let projectId: string | null = null
    if (folderName || projectName) {
      const [folders, projects] = await Promise.all([
        getFolders().catch(() => []),
        getProjects().catch(() => []),
      ])
      if (folderName) {
        folderId = folders.find((folder) => folder.name.toLowerCase() === folderName)?.id ?? null
      }
      if (projectName) {
        projectId = projects.find((project) => project.name.toLowerCase() === projectName)?.id ?? null
      }
      if (!folderId && folderName) {
        return `Error: no folder named "${args.folder}". Use list_notes to inspect available folders.`
      }
      if (!projectId && projectName) {
        return `Error: no project named "${args.project}".`
      }
    }

    const html = /<\/?[a-z][\s\S]*>/i.test(content) ? content : textToHtml(content)
    const note = await createNote({
      title,
      content: html,
      folder_id: folderId,
      project_id: projectId,
      note_type: 'rich-text',
    })

    return `Created note "${note.title}" [id: ${note.id}] for user ${ctx.userId}.`
  },
}

const appendToNote: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'append_to_note',
      description:
        'Append text to the end of an existing note without touching its existing content. Prefer this over rewriting notes.',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string', description: 'Target note id' },
          noteTitle: { type: 'string', description: 'Target note title when the id is unknown' },
          content: { type: 'string', description: 'Text to append (plain text or simple HTML)' },
        },
        required: ['content'],
      },
    },
  },
  execute: async (args) => {
    const content = str(args.content)
    if (!content) return 'Error: content is required.'

    const noteId = await resolveNoteId(args)
    if (!noteId) return 'Error: note not found. Use search_notes to find the id first.'

    const note = await getNote(noteId)
    if (!note) return `Error: no note with id ${noteId}.`

    const addition = /<\/?[a-z][\s\S]*>/i.test(content) ? content : textToHtml(content)
    await updateNote(note.id, { content: `${note.content || ''}${addition}` })

    return `Appended ${content.length} characters to "${note.title || 'Untitled'}".`
  },
}

const listFolders: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'list_folders',
      description: 'List the user\'s note folders (with project and parent folder names).',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  execute: async () => {
    const [folders, projects] = await Promise.all([
      getFolders().catch(() => []),
      getProjects().catch(() => []),
    ])
    if (folders.length === 0) return 'No folders yet.'

    const projectNames = new Map(projects.map((project) => [project.id, project.name]))
    const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]))

    return [
      `${folders.length} folder${folders.length === 1 ? '' : 's'}:`,
      ...folders.map((folder) => {
        const parent = folder.parent_id ? folderNames.get(folder.parent_id) : null
        const project = folder.project_id ? projectNames.get(folder.project_id) : null
        const suffix = [project ? `project: ${project}` : null, parent ? `inside: ${parent}` : null]
          .filter(Boolean)
          .join(' · ')
        return `- ${folder.name}  [id: ${folder.id}]${suffix ? `  (${suffix})` : ''}`
      }),
    ].join('\n')
  },
}

const listProjects: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'list_projects',
      description: 'List the user\'s active projects with their descriptions.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  execute: async () => {
    const projects = await getProjects().catch(() => [])
    if (projects.length === 0) return 'No projects yet.'

    return [
      `${projects.length} project${projects.length === 1 ? '' : 's'}:`,
      ...projects.map((project) => {
        const bits = [`- ${project.name}  [id: ${project.id}]`]
        if (project.description) bits.push(`  ${project.description.slice(0, 300)}`)
        return bits.join('\n')
      }),
    ].join('\n')
  },
}

const listTasks: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'list_tasks',
      description:
        'List the user\'s tasks with status, priority and due dates. By default only open tasks are returned.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: TASK_STATUSES, description: 'Filter by status' },
          includeCompleted: { type: 'boolean', description: 'Include completed tasks (default false)' },
          dueWithinDays: {
            type: 'number',
            minimum: 0,
            maximum: 365,
            description: 'Only tasks due within this many days',
          },
          limit: { type: 'number', minimum: 1, maximum: 100, description: 'Maximum results (default 30)' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const limit = num(args.limit, 30, 1, 100)
    const status = TASK_STATUSES.includes(str(args.status) as TaskStatus)
      ? (str(args.status) as TaskStatus)
      : undefined
    const includeCompleted = args.includeCompleted === true || status === 'completed'

    const tasks = await getTasks({ status, includeCompleted })
    const dueWithinDays =
      typeof args.dueWithinDays === 'number' ? num(args.dueWithinDays, 0, 0, 365) : null

    const filtered =
      dueWithinDays === null
        ? tasks
        : tasks.filter((task) => {
            if (!task.due_date) return false
            const due = new Date(task.due_date).getTime()
            if (Number.isNaN(due)) return false
            return due <= Date.now() + dueWithinDays * 24 * 60 * 60 * 1000
          })

    if (filtered.length === 0) return 'No tasks matched.'

    return [
      `${filtered.length} task${filtered.length === 1 ? '' : 's'} (showing ${Math.min(limit, filtered.length)}):`,
      ...filtered.slice(0, limit).map(summariseTask),
    ].join('\n')
  },
}

const createTaskTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a task in the planner. Use ISO dates (YYYY-MM-DD) for due dates.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short task title' },
          description: { type: 'string', description: 'Optional details' },
          dueDate: { type: 'string', description: 'Due date as YYYY-MM-DD or a full ISO timestamp' },
          priority: { type: 'string', enum: TASK_PRIORITIES, description: 'Priority (default medium)' },
        },
        required: ['title'],
      },
    },
  },
  execute: async (args) => {
    const title = str(args.title)
    if (!title) return 'Error: title is required.'

    const dueDateRaw = str(args.dueDate)
    let dueDate: Date | undefined
    if (dueDateRaw) {
      const parsed = new Date(dueDateRaw.length === 10 ? `${dueDateRaw}T09:00:00` : dueDateRaw)
      if (Number.isNaN(parsed.getTime())) return `Error: could not parse due date "${dueDateRaw}".`
      dueDate = parsed
    }

    const priority = TASK_PRIORITIES.includes(str(args.priority) as TaskPriority)
      ? (str(args.priority) as TaskPriority)
      : 'medium'

    const task = await createTask(title, {
      description: str(args.description) || undefined,
      dueDate,
      priority,
    })

    return `Created task "${task.title}" [id: ${task.id}]${dueDate ? ` due ${formatDate(dueDate.toISOString())}` : ''}.`
  },
}

const completeTaskTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Mark a task as completed. Accepts a task id or an exact title.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task id from list_tasks' },
          title: { type: 'string', description: 'Task title when the id is unknown' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    let taskId = str(args.taskId ?? args.task_id)
    if (!taskId) {
      const title = str(args.title).toLowerCase()
      if (!title) return 'Error: provide a taskId or title.'
      const tasks = await getTasks({ includeCompleted: false })
      const match = tasks.find((task) => task.title.toLowerCase() === title)
      if (!match) return `Error: no open task titled "${args.title}".`
      taskId = match.id
    }

    const task = await completeTask(taskId)
    return `Completed "${task.title}".`
  },
}

const getTaskStatsTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'get_task_stats',
      description:
        'Get a summary of the user\'s task load: totals, overdue, due today, due this week and starred.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  execute: async () => {
    const stats = await getTaskStats()
    return [
      `total: ${stats.total}`,
      `todo: ${stats.todo}`,
      `in progress: ${stats.in_progress}`,
      `completed: ${stats.completed}`,
      `overdue: ${stats.overdue}`,
      `due today: ${stats.due_today}`,
      `due this week: ${stats.due_this_week}`,
      `starred: ${stats.starred}`,
    ].join('\n')
  },
}


// ─── Learn tools ────────────────────────────────────────────────────────────

const listLearnDecksTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'list_decks',
      description:
        'List the user\'s Learn flashcard decks with card counts, mastery and last-studied date.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  execute: async () => {
    const decks = await getLearnDecks()
    if (decks.length === 0) return 'No Learn decks yet.'
    return decks
      .map(
        (deck) =>
          `- ${deck.title}  [id: ${deck.id}]\n  cards: ${deck.cardCount}\n  mastered: ${deck.masteredCount}${deck.lastStudied ? `\n  last studied: ${formatDate(deck.lastStudied as string)}` : ''}`,
      )
      .join('\n')
  },
}

const createLearnDeckTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'create_deck',
      description: 'Create a new Learn flashcard deck.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Deck title' },
          description: { type: 'string', description: 'Optional deck description' },
        },
        required: ['title'],
      },
    },
  },
  execute: async (args) => {
    const title = str(args.title)
    if (!title) return 'Error: provide a deck title.'
    const deck = await createLearnDeck({
      title,
      description: str(args.description) || undefined,
    })
    return `Created Learn deck "${deck.title}" [id: ${deck.id}].`
  },
}

const addLearnCardsTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'add_cards',
      description:
        'Add one or more flashcards (front/back pairs) to a Learn deck. Prefer adding multiple cards in one call.',
      parameters: {
        type: 'object',
        properties: {
          deckId: { type: 'string', description: 'The Learn deck id' },
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
  execute: async (args) => {
    const deckId = str(args.deckId)
    const cards = Array.isArray(args.cards)
      ? (args.cards as Array<Record<string, unknown>>)
          .map((card) => ({ front: str(card.front), back: str(card.back) }))
          .filter((card) => card.front && card.back)
      : []
    if (!deckId) return 'Error: provide a deckId.'
    if (cards.length === 0) return 'Error: provide at least one front/back card.'
    await createLearnCards(deckId, cards)
    return `Added ${cards.length} card${cards.length === 1 ? '' : 's'} to the Learn deck.`
  },
}

const getLearnStatsTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'get_stats',
      description:
        'Get the user\'s Learn stats: level, XP, streak, daily goal, totals and earned badges.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  execute: async () => {
    const stats = await getLearnStats(new Date().getTimezoneOffset())
    if (!stats) return 'Error: could not load Learn stats.'
    const earned = stats.badges.filter((badge) => badge.earnedAt)
    return [
      `level: ${stats.level}`,
      `xp: ${stats.xp} (next level at ${stats.xpToNextLevel})`,
      `streak: ${stats.streak} days`,
      `today: ${stats.dailyCardsReviewed}/${stats.dailyGoal} cards`,
      `total cards reviewed: ${stats.totalCardsReviewed}`,
      `total sessions: ${stats.totalSessions}`,
      `accuracy: ${stats.totalCardsReviewed > 0 ? Math.round((stats.totalCorrect / stats.totalCardsReviewed) * 100) : 0}%`,
      `decks: ${stats.totalDecks}`,
      `badges: ${earned.length > 0 ? earned.map((badge) => badge.name).join(', ') : 'none yet'}`,
    ].join('\n')
  },
}

const searchLearnCardsTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'search_cards',
      description: 'Search flashcards across all Learn decks by keyword, matching front and back.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keyword to search for' },
          deckId: { type: 'string', description: 'Optional Learn deck id to limit the search' },
        },
        required: ['query'],
      },
    },
  },
  execute: async (args) => {
    const query = str(args.query)
    if (!query) return 'Error: provide a search query.'
    const cards = await searchLearnCards(query, str(args.deckId) || undefined)
    if (cards.length === 0) return `No Learn cards found matching "${query}".`
    return cards
      .map((card) => `- "${card.front}" → "${card.back}"  [deck: ${card.deckId}]`)
      .join('\n')
  },
}

/** Tools available in both chat and agent mode. */
export const BASE_CHAT_TOOLS: Record<string, ChatToolSpec> = {
  get_current_date: getCurrentDate,
  list_folders: listFolders,
  list_projects: listProjects,
  list_notes: listNotes,
  search_notes: searchNotesTool,
  read_note: readNote,
  create_note: createNoteTool,
  append_to_note: appendToNote,
  list_tasks: listTasks,
  create_task: createTaskTool,
  complete_task: completeTaskTool,
  get_task_stats: getTaskStatsTool,
  list_decks: listLearnDecksTool,
  create_deck: createLearnDeckTool,
  add_cards: addLearnCardsTool,
  get_stats: getLearnStatsTool,
  search_cards: searchLearnCardsTool,
}

/** Domain groups a sub-agent can be granted (mirrors the agent's tool picker). */
export const CHAT_TOOL_GROUPS: Record<string, string[]> = {
  notes: ['list_folders', 'list_notes', 'search_notes', 'read_note', 'create_note', 'append_to_note'],
  tasks: ['list_tasks', 'create_task', 'complete_task', 'get_task_stats'],
  projects: ['list_projects', 'list_folders'],
  learn: ['list_decks', 'create_deck', 'add_cards', 'get_stats', 'search_cards'],
  datetime: ['get_current_date'],
}

export const CHAT_TOOL_GROUP_NAMES = Object.keys(CHAT_TOOL_GROUPS)

/** Pick a flat tool subset for a sub-agent from group names. */
export function getChatToolsByGroups(groups: string[]): Record<string, ChatToolSpec> {
  const selected: Record<string, ChatToolSpec> = {}
  for (const group of groups) {
    for (const name of CHAT_TOOL_GROUPS[group] ?? []) {
      const spec = BASE_CHAT_TOOLS[name]
      if (spec) selected[name] = spec
    }
  }
  return selected
}

/** Build the OpenAI `tools` array for the given specs. */
export function toToolDefinitions(specs: Record<string, ChatToolSpec>): ChatToolDefinition[] {
  return Object.values(specs).map((spec) => spec.definition)
}
