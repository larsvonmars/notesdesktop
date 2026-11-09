/**
 * Chat tool registry: OpenAI-compatible function definitions together with the
 * client-side executors that run them against the user's own workspace data.
 *
 * The executors run in the renderer with the signed-in Supabase session, so no
 * privileged keys are ever involved. Names listed here must stay in sync with
 * the server-side whitelist in `app/api/ai/validation.ts` and
 * `cloudflare/ai-worker/src/index.js`.
 */

import {
  createNote,
  deleteNote,
  getAllNoteSummaries,
  getNote,
  moveNote,
  searchNotes,
  updateNote,
} from '@/lib/notes'
import type { Note, NoteSummary, NoteType } from '@/lib/notes'
import { createFolder, getFolders } from '@/lib/folders'
import { createProject, getProjects, updateProject } from '@/lib/projects'
import {
  completeTask,
  createTask,
  deleteTask,
  getTaskStats,
  getTasks,
  updateTask,
} from '@/lib/tasks'
import type { Task, TaskPriority, TaskStatus } from '@/lib/tasks'
import { createEvent, deleteEvent, getEvents, updateEvent } from '@/lib/events'
import type { CalendarEvent } from '@/lib/events'
import { stripHtmlForAI, textToHtml } from '@/lib/ai'
import {
  createCards as createLearnCards,
  deleteCard as deleteLearnCard,
  getCardsByDeck,
  searchCards as searchLearnCards,
  updateCard as updateLearnCard,
} from '@/lib/learn/cards'
import {
  createDeck as createLearnDeck,
  deleteDeck as deleteLearnDeck,
  getDecks as getLearnDecks,
  updateDeck as updateLearnDeck,
} from '@/lib/learn/decks'
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

/** Readable text for any note type, so Chat can read more than rich text. */
function extractNoteText(note: Pick<Note, 'note_type' | 'content'>): string {
  const raw = note.content || ''
  if (!raw.trim()) return ''

  if (note.note_type === 'drawing') return '[Drawing note — no text content]'
  if (note.note_type === 'pdf-annotation') {
    return '[PDF annotation note — open it in the app to read the document]'
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>

    if (note.note_type === 'mindmap') {
      const rootId = typeof parsed.rootId === 'string' ? parsed.rootId : 'root'
      const nodes = parsed.nodes as Record<string, Record<string, unknown>> | undefined
      if (!nodes || !nodes[rootId]) return stripHtmlForAI(raw)
      const lines: string[] = []
      const seen = new Set<string>()
      const walk = (id: string, depth: number) => {
        if (seen.has(id) || depth > 8) return
        seen.add(id)
        const node = nodes[id]
        if (!node) return
        const text = typeof node.text === 'string' ? node.text : ''
        const description = typeof node.description === 'string' ? node.description : ''
        if (text) lines.push(`${'  '.repeat(depth)}- ${text}${description ? ` — ${description}` : ''}`)
        const children = Array.isArray(node.children) ? node.children : []
        for (const childId of children) {
          if (typeof childId === 'string') walk(childId, depth + 1)
        }
      }
      walk(rootId, 0)
      return lines.join('\n')
    }

    if (note.note_type === 'bullet-journal') {
      const entries = Array.isArray(parsed.entries) ? (parsed.entries as Record<string, unknown>[]) : []
      if (entries.length === 0) return '[Empty bullet journal]'
      return [...entries]
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map((entry) => {
          const signifier = typeof entry.signifier === 'string' ? entry.signifier : 'note'
          const content = typeof entry.content === 'string' ? entry.content : ''
          const indent = Math.max(0, Math.min(6, Number(entry.indent_level ?? 0)))
          const date = typeof entry.entry_date === 'string' ? `${entry.entry_date} ` : ''
          return `${'  '.repeat(indent)}- [${signifier}] ${date}${content}`.trimEnd()
        })
        .join('\n')
    }

    if (note.note_type === 'data-sheet') {
      const columns = Array.isArray(parsed.columns) ? (parsed.columns as Record<string, unknown>[]) : []
      const rows = Array.isArray(parsed.rows) ? (parsed.rows as unknown[][]) : []
      const headers = columns.map((column, index) =>
        typeof column.name === 'string' && column.name.trim() ? column.name : `Column ${index + 1}`,
      )
      if (headers.length === 0 && rows.length === 0) return '[Empty data sheet]'
      const lines = [headers.join(' | ')]
      for (const row of rows.slice(0, 200)) {
        const cells = headers.map((_, index) => String(row[index] ?? ''))
        if (cells.some((cell) => cell.trim())) lines.push(cells.join(' | '))
      }
      return lines.join('\n')
    }
  } catch {
    // Not JSON — fall back to HTML stripping below.
  }

  return stripHtmlForAI(raw)
}

function summariseEvent(event: CalendarEvent): string {
  return [
    `- ${event.title}  [id: ${event.id}]`,
    `  starts: ${formatDate(event.start_time)}`,
    `  ends: ${formatDate(event.end_time)}${event.is_all_day ? ' (all day)' : ''}`,
    event.location ? `  location: ${event.location}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Parse YYYY-MM-DD (at `fallbackHour`) or any Date-compatible timestamp. */
function parseDateTime(value: unknown, fallbackHour = 9): Date | null {
  const raw = str(value)
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T${String(fallbackHour).padStart(2, '0')}:00:00`)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

async function resolveFolderId(name: string): Promise<string | null> {
  if (!name) return null
  const folders = await getFolders().catch(() => [])
  const needle = name.toLowerCase()
  return folders.find((folder) => folder.name.toLowerCase() === needle)?.id ?? null
}

async function resolveProjectId(name: string): Promise<string | null> {
  if (!name) return null
  const projects = await getProjects().catch(() => [])
  const needle = name.toLowerCase()
  return projects.find((project) => project.name.toLowerCase() === needle)?.id ?? null
}

async function resolveTaskId(args: Record<string, unknown>): Promise<string | null> {
  const explicit = str(args.taskId ?? args.task_id)
  if (explicit) return explicit
  const title = str(args.title).toLowerCase()
  if (!title) return null
  const tasks = await getTasks({ includeCompleted: true })
  const exact = tasks.find((task) => task.title.toLowerCase() === title)
  if (exact) return exact.id
  return tasks.find((task) => task.title.toLowerCase().includes(title))?.id ?? null
}

async function resolveDeckId(args: Record<string, unknown>): Promise<string | null> {
  const explicit = str(args.deckId ?? args.deck_id)
  if (explicit) return explicit
  const title = str(args.deckTitle ?? args.title).toLowerCase()
  if (!title) return null
  const decks = await getLearnDecks()
  const exact = decks.find((deck) => deck.title.toLowerCase() === title)
  if (exact) return exact.id
  return decks.find((deck) => deck.title.toLowerCase().includes(title))?.id ?? null
}

async function resolveEventId(args: Record<string, unknown>): Promise<string | null> {
  const explicit = str(args.eventId ?? args.event_id)
  if (explicit) return explicit
  const title = str(args.title).toLowerCase()
  if (!title) return null
  const now = Date.now()
  const events = await getEvents({
    startDate: new Date(now - 365 * 24 * 60 * 60 * 1000),
    endDate: new Date(now + 365 * 24 * 60 * 60 * 1000),
  })
  const exact = events.find((event) => event.title.toLowerCase() === title)
  if (exact) return exact.id
  return events.find((event) => event.title.toLowerCase().includes(title))?.id ?? null
}

interface MindmapBranch {
  text: string
  description?: string
  children?: MindmapBranch[]
}

const MINDMAP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#84CC16', '#EC4899', '#06B6D4', '#F97316']
const MAX_MINDMAP_BRANCHES = 20
const MAX_MINDMAP_DEPTH = 3

function parseMindmapBranches(value: unknown, depth = 1): MindmapBranch[] {
  if (!Array.isArray(value) || depth > MAX_MINDMAP_DEPTH) return []
  const branches: MindmapBranch[] = []
  for (const entry of value.slice(0, MAX_MINDMAP_BRANCHES)) {
    if (typeof entry === 'string') {
      const text = entry.trim()
      if (text) branches.push({ text })
      continue
    }
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const text = str(record.text ?? record.title)
    if (!text) continue
    branches.push({
      text,
      description: str(record.description) || undefined,
      children: parseMindmapBranches(record.children, depth + 1),
    })
  }
  return branches
}

/** Build the JSON structure stored in a mindmap note's content column. */
function buildMindmapNoteContent(rootText: string, branches: MindmapBranch[]) {
  const rootId = 'root'
  const nodes: Record<string, {
    id: string
    text: string
    x: number
    y: number
    parentId: string | null
    children: string[]
    collapsed: boolean
    color: string
    description: string
    attachments: never[]
  }> = {
    [rootId]: {
      id: rootId,
      text: rootText.slice(0, 80),
      x: 400,
      y: 300,
      parentId: null,
      children: [],
      collapsed: false,
      color: MINDMAP_COLORS[0],
      description: '',
      attachments: [],
    },
  }

  let counter = 0
  const addChildren = (
    parentId: string,
    parentX: number,
    parentY: number,
    children: MindmapBranch[],
    depth: number,
    startAngle: number,
    endAngle: number,
  ) => {
    if (children.length === 0 || depth > MAX_MINDMAP_DEPTH) return
    const radius = depth === 1 ? 230 : 130
    const arc = endAngle - startAngle
    children.forEach((child, index) => {
      counter += 1
      const nodeId = `node-${depth}-${counter}`
      const angle = startAngle + (arc * (index + 1)) / (children.length + 1)
      const x = parentX + Math.cos(angle) * radius
      const y = parentY + Math.sin(angle) * radius
      nodes[parentId].children.push(nodeId)
      nodes[nodeId] = {
        id: nodeId,
        text: child.text.slice(0, 120),
        x,
        y,
        parentId,
        children: [],
        collapsed: false,
        color: MINDMAP_COLORS[counter % MINDMAP_COLORS.length],
        description: child.description?.slice(0, 300) ?? '',
        attachments: [],
      }
      if (child.children && child.children.length > 0) {
        const spread = Math.min(Math.PI * 0.8, Math.max(Math.PI / 4, (arc / children.length) * 0.9))
        addChildren(nodeId, x, y, child.children, depth + 1, angle - spread / 2, angle + spread / 2)
      }
    })
  }

  addChildren(rootId, 400, 300, branches, 1, -Math.PI, Math.PI)
  return { rootId, nodes }
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
        const excerpt = truncate(extractNoteText(note).replace(/\s+/g, ' '), 400)
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

    const text = extractNoteText(note)
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
    if (note.note_type !== 'rich-text') {
      return `Error: "${note.title}" is a ${note.note_type} note. Appending is only supported for rich-text notes.`
    }

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
          project: { type: 'string', description: 'Only tasks linked to this project name' },
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
    const projectName = str(args.project)
    const projectId = projectName ? await resolveProjectId(projectName) : null
    if (projectName && !projectId) return `Error: no project named "${projectName}".`

    const filtered = tasks.filter((task) => {
      if (projectId && task.project_id !== projectId) return false
      if (dueWithinDays === null) return true
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
          project: { type: 'string', description: 'Optional project name to link' },
          noteId: { type: 'string', description: 'Optional note id to link' },
          noteTitle: { type: 'string', description: 'Optional note title to link when the id is unknown' },
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

    const projectName = str(args.project)
    const projectId = projectName ? await resolveProjectId(projectName) : null
    if (projectName && !projectId) return `Error: no project named "${projectName}".`
    const noteId = str(args.noteId ?? args.noteTitle)
      ? await resolveNoteId({ noteId: args.noteId, noteTitle: args.noteTitle })
      : null
    if ((str(args.noteId) || str(args.noteTitle)) && !noteId) {
      return 'Error: the linked note could not be found.'
    }

    const task = await createTask(title, {
      description: str(args.description) || undefined,
      dueDate,
      priority,
      projectId: projectId ?? undefined,
      noteId: noteId ?? undefined,
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

// ─── Note maintenance tools ─────────────────────────────────────────────────

const updateNoteTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'update_note',
      description:
        'Update an existing note. Rename it, replace the body of a rich-text note, or move it into a folder/project. Read the note first when replacing content so nothing is lost.',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string', description: 'Note id from list_notes or search_notes' },
          noteTitle: { type: 'string', description: 'Note title when the id is unknown' },
          title: { type: 'string', description: 'New title' },
          content: {
            type: 'string',
            description: 'New body for a rich-text note (plain text or simple HTML). Replaces the existing body.',
          },
          folder: { type: 'string', description: 'Folder name to move the note into' },
          project: { type: 'string', description: 'Project name to file the note in' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const noteId = await resolveNoteId(args)
    if (!noteId) return 'Error: note not found. Use list_notes or search_notes first.'

    const note = await getNote(noteId)
    if (!note) return `Error: no note with id ${noteId}.`

    const content = str(args.content)
    if (content && note.note_type !== 'rich-text') {
      return `Error: "${note.title}" is a ${note.note_type} note; only rich-text bodies can be replaced.`
    }

    const folderName = str(args.folder)
    const projectName = str(args.project)
    const folderId = folderName ? await resolveFolderId(folderName) : null
    const projectId = projectName ? await resolveProjectId(projectName) : null
    if (folderName && !folderId) return `Error: no folder named "${args.folder}".`
    if (projectName && !projectId) return `Error: no project named "${args.project}".`

    if (folderName || projectName) {
      await moveNote(noteId, folderId, undefined, projectName ? projectId : undefined)
    }

    const title = str(args.title)
    if (title || content) {
      const html =
        content && !/<\/?[a-z][\s\S]*>/i.test(content) ? textToHtml(content) : content
      await updateNote(noteId, {
        ...(title ? { title } : {}),
        ...(html ? { content: html } : {}),
      })
    }

    const changes = [
      title ? `renamed to "${title}"` : '',
      content ? 'body replaced' : '',
      folderName ? `moved to folder "${folderName}"` : '',
      projectName ? `filed under project "${projectName}"` : '',
    ].filter(Boolean)
    if (changes.length === 0) return 'Nothing to update: provide a title, content, folder or project.'
    return `Updated "${title || note.title}" [id: ${noteId}]: ${changes.join(', ')}.`
  },
}

const deleteNoteTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'delete_note',
      description:
        'Delete a note permanently. Only call this after the user explicitly confirmed the deletion in their message.',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string', description: 'Note id from list_notes or search_notes' },
          noteTitle: { type: 'string', description: 'Note title when the id is unknown' },
          confirm: {
            type: 'boolean',
            description: 'Must be true; only set this when the user explicitly asked to delete the note.',
          },
        },
        required: ['confirm'],
      },
    },
  },
  execute: async (args) => {
    if (args.confirm !== true) {
      return 'Deletion not confirmed. Ask the user explicitly before deleting anything.'
    }
    const noteId = await resolveNoteId(args)
    if (!noteId) return 'Error: note not found.'
    const note = await getNote(noteId)
    await deleteNote(noteId)
    return `Deleted note "${note?.title || noteId}".`
  },
}

const createMindmapNoteTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'create_mindmap_note',
      description:
        'Create a mindmap note from a central idea and nested branches. Use this to turn an outline, brainstorm or note summary into a visual mindmap.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Mindmap note title (defaults to the root text)' },
          root: { type: 'string', description: 'Central idea shown in the middle' },
          branches: {
            type: 'array',
            description: 'First-level branches; each may have nested children (max 3 levels).',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Branch label' },
                description: { type: 'string', description: 'Optional detail for the node' },
                children: {
                  type: 'array',
                  description: 'Nested sub-branches',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string' },
                      description: { type: 'string' },
                    },
                    required: ['text'],
                  },
                },
              },
              required: ['text'],
            },
          },
          folder: { type: 'string', description: 'Optional folder name' },
          project: { type: 'string', description: 'Optional project name' },
        },
        required: ['root', 'branches'],
      },
    },
  },
  execute: async (args) => {
    const root = str(args.root)
    if (!root) return 'Error: provide the central root text.'
    const branches = parseMindmapBranches(args.branches)
    if (branches.length === 0) return 'Error: provide at least one branch.'

    const folderName = str(args.folder)
    const projectName = str(args.project)
    const folderId = folderName ? await resolveFolderId(folderName) : null
    const projectId = projectName ? await resolveProjectId(projectName) : null
    if (folderName && !folderId) return `Error: no folder named "${args.folder}".`
    if (projectName && !projectId) return `Error: no project named "${args.project}".`

    const note = await createNote({
      title: str(args.title) || root,
      content: JSON.stringify(buildMindmapNoteContent(root, branches)),
      folder_id: folderId,
      project_id: projectId,
      note_type: 'mindmap',
    })
    return `Created mindmap note "${note.title}" [id: ${note.id}] with ${branches.length} branch${branches.length === 1 ? '' : 'es'}.`
  },
}

const createDataSheetNoteTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'create_data_sheet_note',
      description: 'Create a data-sheet note from column headers and rows of cell values.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title' },
          columns: {
            type: 'array',
            description: 'Column headers in display order',
            items: { type: 'string' },
          },
          rows: {
            type: 'array',
            description: 'Rows of cell values; each row matches the column order',
            items: { type: 'array', items: { type: 'string' } },
          },
          folder: { type: 'string', description: 'Optional folder name' },
          project: { type: 'string', description: 'Optional project name' },
        },
        required: ['title', 'columns', 'rows'],
      },
    },
  },
  execute: async (args) => {
    const title = str(args.title)
    const columns = Array.isArray(args.columns)
      ? args.columns.map((value) => str(value)).filter(Boolean)
      : []
    const rows = Array.isArray(args.rows)
      ? (args.rows as unknown[][]).map((row) =>
          Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [],
        )
      : []
    if (!title) return 'Error: provide a note title.'
    if (columns.length === 0) return 'Error: provide at least one column header.'

    const folderName = str(args.folder)
    const projectName = str(args.project)
    const folderId = folderName ? await resolveFolderId(folderName) : null
    const projectId = projectName ? await resolveProjectId(projectName) : null
    if (folderName && !folderId) return `Error: no folder named "${args.folder}".`
    if (projectName && !projectId) return `Error: no project named "${args.project}".`

    const note = await createNote({
      title,
      content: JSON.stringify({
        columns: columns.map((name) => ({ name, type: 'text' })),
        rows,
      }),
      folder_id: folderId,
      project_id: projectId,
      note_type: 'data-sheet',
    })
    return `Created data-sheet note "${note.title}" [id: ${note.id}] with ${columns.length} columns and ${rows.length} rows.`
  },
}

const createBulletJournalNoteTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'create_bullet_journal_note',
      description:
        'Create a bullet-journal note from a list of entries. Signifiers: task, event, note, completed, migrated, scheduled, irrelevant.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title' },
          entries: {
            type: 'array',
            description: 'Journal entries in display order',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'Entry text' },
                signifier: {
                  type: 'string',
                  enum: ['task', 'event', 'note', 'completed', 'migrated', 'scheduled', 'irrelevant'],
                  description: 'Bullet signifier (default note)',
                },
                date: { type: 'string', description: 'Optional YYYY-MM-DD entry date' },
                indent: { type: 'number', minimum: 0, maximum: 6, description: 'Indent level (default 0)' },
              },
              required: ['content'],
            },
          },
          folder: { type: 'string', description: 'Optional folder name' },
          project: { type: 'string', description: 'Optional project name' },
        },
        required: ['title', 'entries'],
      },
    },
  },
  execute: async (args) => {
    const title = str(args.title)
    if (!title) return 'Error: provide a note title.'
    const rawEntries = Array.isArray(args.entries)
      ? (args.entries as Record<string, unknown>[])
      : []
    const today = new Date().toISOString().slice(0, 10)
    const validSignifiers = ['task', 'event', 'note', 'completed', 'migrated', 'scheduled', 'irrelevant']
    const entries = rawEntries
      .map((entry, index) => {
        const content = str(entry.content)
        if (!content) return null
        const signifier = validSignifiers.includes(str(entry.signifier)) ? str(entry.signifier) : 'note'
        return {
          signifier,
          content,
          indent_level: num(entry.indent, 0, 0, 6),
          sort_order: index,
          entry_date: /^\d{4}-\d{2}-\d{2}$/.test(str(entry.date)) ? str(entry.date) : today,
          is_starred: false,
          is_priority: false,
          is_inspiration: false,
          linked_task_id: null,
          _isNew: true,
          _key: `chat_bj_${Date.now()}_${index}`,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    if (entries.length === 0) return 'Error: provide at least one journal entry.'

    const folderName = str(args.folder)
    const projectName = str(args.project)
    const folderId = folderName ? await resolveFolderId(folderName) : null
    const projectId = projectName ? await resolveProjectId(projectName) : null
    if (folderName && !folderId) return `Error: no folder named "${args.folder}".`
    if (projectName && !projectId) return `Error: no project named "${args.project}".`

    const note = await createNote({
      title,
      content: JSON.stringify({ entries, activeDate: today, view: 'daily' }),
      folder_id: folderId,
      project_id: projectId,
      note_type: 'bullet-journal',
    })
    return `Created bullet-journal note "${note.title}" [id: ${note.id}] with ${entries.length} entries.`
  },
}

const createFolderTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'create_folder',
      description: 'Create a folder, optionally inside another folder and/or a project.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Folder name' },
          parent: { type: 'string', description: 'Optional parent folder name' },
          project: { type: 'string', description: 'Optional project name' },
        },
        required: ['name'],
      },
    },
  },
  execute: async (args) => {
    const name = str(args.name)
    if (!name) return 'Error: provide a folder name.'
    const parentName = str(args.parent)
    const projectName = str(args.project)
    const parentId = parentName ? await resolveFolderId(parentName) : null
    const projectId = projectName ? await resolveProjectId(projectName) : null
    if (parentName && !parentId) return `Error: no folder named "${parentName}".`
    if (projectName && !projectId) return `Error: no project named "${projectName}".`

    const folder = await createFolder({
      name,
      parent_id: parentId,
      project_id: projectId ?? undefined,
    })
    return `Created folder "${folder.name}" [id: ${folder.id}].`
  },
}

const createProjectTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'create_project',
      description: 'Create a project that notes, folders and tasks can be filed under.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Project name' },
          description: { type: 'string', description: 'Optional project description' },
          color: { type: 'string', description: 'Optional hex colour, e.g. #3B82F6' },
        },
        required: ['name'],
      },
    },
  },
  execute: async (args) => {
    const name = str(args.name)
    if (!name) return 'Error: provide a project name.'
    const project = await createProject({
      name,
      description: str(args.description) || undefined,
      color: str(args.color) || undefined,
    })
    return `Created project "${project.name}" [id: ${project.id}].`
  },
}

// ─── Task maintenance tools ─────────────────────────────────────────────────

const updateProjectTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'update_project',
      description: 'Rename a project or change its description or colour.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Current project name' },
          projectId: { type: 'string', description: 'Project id from list_projects' },
          newName: { type: 'string', description: 'New project name' },
          description: { type: 'string', description: 'New description' },
          color: { type: 'string', description: 'New hex colour, e.g. #3B82F6' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const explicitId = str(args.projectId)
    const name = str(args.project)
    const projectId = explicitId || (name ? await resolveProjectId(name) : null)
    if (!projectId) return 'Error: project not found. Use list_projects first.'
    const input: Parameters<typeof updateProject>[1] = {}
    if (str(args.newName)) input.name = str(args.newName)
    if (str(args.description)) input.description = str(args.description)
    if (str(args.color)) input.color = str(args.color)
    if (Object.keys(input).length === 0) return 'Nothing to update: provide a name, description or colour.'
    const project = await updateProject(projectId, input)
    return `Updated project "${project.name}" [id: ${project.id}].`
  },
}

const updateTaskTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'update_task',
      description:
        'Change an existing task: rename it, edit details, change status/priority, set or clear the due date, or star it.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task id from list_tasks' },
          title: { type: 'string', description: 'Current task title when the id is unknown' },
          newTitle: { type: 'string', description: 'New title' },
          description: { type: 'string', description: 'New description' },
          status: { type: 'string', enum: TASK_STATUSES, description: 'New status' },
          priority: { type: 'string', enum: TASK_PRIORITIES, description: 'New priority' },
          dueDate: {
            type: 'string',
            description: 'YYYY-MM-DD, a full ISO timestamp, or "none" to clear the due date',
          },
          starred: { type: 'boolean', description: 'Star or unstar the task' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const taskId = await resolveTaskId(args)
    if (!taskId) return 'Error: task not found. Use list_tasks first.'

    const updates: Parameters<typeof updateTask>[1] = {}
    const newTitle = str(args.newTitle)
    const description = str(args.description)
    const status = str(args.status)
    const priority = str(args.priority)
    const dueDate = str(args.dueDate)
    if (newTitle) updates.title = newTitle
    if (description) updates.description = description
    if (TASK_STATUSES.includes(status as TaskStatus)) updates.status = status as TaskStatus
    if (TASK_PRIORITIES.includes(priority as TaskPriority)) updates.priority = priority as TaskPriority
    if (dueDate) {
      if (dueDate.toLowerCase() === 'none') {
        updates.due_date = null
      } else {
        const parsed = parseDateTime(dueDate)
        if (!parsed) return `Error: could not parse due date "${dueDate}".`
        updates.due_date = parsed.toISOString()
      }
    }
    if (typeof args.starred === 'boolean') updates.is_starred = args.starred

    if (Object.keys(updates).length === 0) return 'Nothing to update: provide at least one field.'
    const task = await updateTask(taskId, updates)
    return `Updated task "${task.title}" [id: ${task.id}].`
  },
}

const deleteTaskTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'delete_task',
      description:
        'Delete a task permanently. Only call this after the user explicitly confirmed the deletion.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task id from list_tasks' },
          title: { type: 'string', description: 'Task title when the id is unknown' },
          confirm: {
            type: 'boolean',
            description: 'Must be true; only set when the user explicitly asked to delete the task.',
          },
        },
        required: ['confirm'],
      },
    },
  },
  execute: async (args) => {
    if (args.confirm !== true) {
      return 'Deletion not confirmed. Ask the user explicitly before deleting anything.'
    }
    const taskId = await resolveTaskId(args)
    if (!taskId) return 'Error: task not found.'
    const tasks = await getTasks({ includeCompleted: true })
    const task = tasks.find((candidate) => candidate.id === taskId)
    await deleteTask(taskId)
    return `Deleted task "${task?.title || taskId}".`
  },
}

// ─── Calendar tools ─────────────────────────────────────────────────────────

const listEventsTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'list_events',
      description:
        'List calendar events in a date range. Use this for schedule questions ("what is on my calendar tomorrow?", "when is my next meeting?").',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date/time (default: today)' },
          to: { type: 'string', description: 'End date/time (default: 30 days ahead)' },
          query: { type: 'string', description: 'Optional keyword matched against event titles' },
          limit: { type: 'number', minimum: 1, maximum: 100, description: 'Maximum results (default 30)' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const from = parseDateTime(args.from, 0) ?? new Date(new Date().setHours(0, 0, 0, 0))
    const to = parseDateTime(args.to, 23) ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    if (to.getTime() < from.getTime()) return 'Error: "to" must be after "from".'

    const limit = num(args.limit, 30, 1, 100)
    const query = str(args.query).toLowerCase()
    const events = await getEvents({ startDate: from, endDate: to })
    const filtered = query
      ? events.filter((event) => event.title.toLowerCase().includes(query))
      : events
    if (filtered.length === 0) return 'No events matched.'
    return [
      `${filtered.length} event${filtered.length === 1 ? '' : 's'} (showing ${Math.min(limit, filtered.length)}):`,
      ...filtered.slice(0, limit).map(summariseEvent),
    ].join('\n')
  },
}

const createEventTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'create_event',
      description: 'Create a calendar event. Use ISO timestamps (YYYY-MM-DDTHH:MM) or YYYY-MM-DD dates.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          start: { type: 'string', description: 'Start date/time' },
          end: { type: 'string', description: 'End date/time (defaults to one hour after start)' },
          description: { type: 'string', description: 'Optional description' },
          location: { type: 'string', description: 'Optional location' },
          allDay: { type: 'boolean', description: 'Whether the event lasts all day' },
          category: { type: 'string', description: 'Optional category label' },
          project: { type: 'string', description: 'Optional project name to link' },
          noteId: { type: 'string', description: 'Optional note id to link' },
          noteTitle: { type: 'string', description: 'Optional note title to link when the id is unknown' },
        },
        required: ['title', 'start'],
      },
    },
  },
  execute: async (args) => {
    const title = str(args.title)
    if (!title) return 'Error: provide an event title.'
    const allDay = args.allDay === true
    const start = parseDateTime(args.start, allDay ? 0 : 9)
    if (!start) return `Error: could not parse start "${args.start}".`
    const end =
      parseDateTime(args.end, allDay ? 23 : 10) ??
      new Date(start.getTime() + (allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000))
    if (end.getTime() <= start.getTime()) return 'Error: end must be after start.'

    const projectName = str(args.project)
    const projectId = projectName ? await resolveProjectId(projectName) : null
    if (projectName && !projectId) return `Error: no project named "${projectName}".`
    const noteId = str(args.noteId ?? args.noteTitle)
      ? await resolveNoteId({ noteId: args.noteId, noteTitle: args.noteTitle })
      : null
    if ((str(args.noteId) || str(args.noteTitle)) && !noteId) {
      return 'Error: the linked note could not be found.'
    }

    const event = await createEvent(title, start, end, {
      description: str(args.description) || undefined,
      location: str(args.location) || undefined,
      isAllDay: allDay,
      category: str(args.category) || undefined,
      projectId: projectId ?? undefined,
      noteId: noteId ?? undefined,
    })
    return `Created event "${event.title}" [id: ${event.id}] from ${formatDate(event.start_time)} to ${formatDate(event.end_time)}.`
  },
}

const updateEventTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'update_event',
      description: 'Edit an existing calendar event (title, time, description, location or all-day flag).',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'Event id from list_events' },
          title: { type: 'string', description: 'Current event title when the id is unknown' },
          newTitle: { type: 'string', description: 'New title' },
          start: { type: 'string', description: 'New start date/time' },
          end: { type: 'string', description: 'New end date/time' },
          description: { type: 'string', description: 'New description' },
          location: { type: 'string', description: 'New location' },
          allDay: { type: 'boolean', description: 'Whether the event lasts all day' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const eventId = await resolveEventId(args)
    if (!eventId) return 'Error: event not found. Use list_events first.'

    const updates: Parameters<typeof updateEvent>[1] = {}
    const newTitle = str(args.newTitle)
    if (newTitle) updates.title = newTitle
    if (str(args.description)) updates.description = str(args.description)
    if (str(args.location)) updates.location = str(args.location)
    if (typeof args.allDay === 'boolean') updates.is_all_day = args.allDay
    if (str(args.start)) {
      const start = parseDateTime(args.start)
      if (!start) return `Error: could not parse start "${args.start}".`
      updates.start_time = start.toISOString()
    }
    if (str(args.end)) {
      const end = parseDateTime(args.end)
      if (!end) return `Error: could not parse end "${args.end}".`
      updates.end_time = end.toISOString()
    }
    if (Object.keys(updates).length === 0) return 'Nothing to update: provide at least one field.'

    const event = await updateEvent(eventId, updates)
    return `Updated event "${event.title}" [id: ${event.id}].`
  },
}

const deleteEventTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'delete_event',
      description:
        'Delete a calendar event permanently. Only call this after the user explicitly confirmed the deletion.',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'Event id from list_events' },
          title: { type: 'string', description: 'Event title when the id is unknown' },
          confirm: {
            type: 'boolean',
            description: 'Must be true; only set when the user explicitly asked to delete the event.',
          },
        },
        required: ['confirm'],
      },
    },
  },
  execute: async (args) => {
    if (args.confirm !== true) {
      return 'Deletion not confirmed. Ask the user explicitly before deleting anything.'
    }
    const eventId = await resolveEventId(args)
    if (!eventId) return 'Error: event not found.'
    await deleteEvent(eventId)
    return `Deleted event [id: ${eventId}].`
  },
}

// ─── Learn maintenance tools ────────────────────────────────────────────────

const getLearnCardsTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'get_cards',
      description: 'List every card in a Learn deck with ids, questions, answers and mastery state.',
      parameters: {
        type: 'object',
        properties: {
          deckId: { type: 'string', description: 'Deck id from list_decks' },
          deckTitle: { type: 'string', description: 'Deck title when the id is unknown' },
          limit: { type: 'number', minimum: 1, maximum: 200, description: 'Maximum cards (default 100)' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const deckId = await resolveDeckId(args)
    if (!deckId) return 'Error: deck not found. Use list_decks first.'
    const limit = num(args.limit, 100, 1, 200)
    const cards = await getCardsByDeck(deckId)
    if (cards.length === 0) return 'This deck has no cards yet.'
    return [
      `${cards.length} card${cards.length === 1 ? '' : 's'} (showing ${Math.min(limit, cards.length)}):`,
      ...cards.slice(0, limit).map(
        (card) =>
          `- "${card.front}" → "${card.back}"  [id: ${card.id}]${card.mastered ? ' · mastered' : ''}${card.dueDate ? ` · due ${card.dueDate}` : ''}`,
      ),
    ].join('\n')
  },
}

const updateLearnCardTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'update_card',
      description: 'Edit a flashcard question/answer or mark it mastered.',
      parameters: {
        type: 'object',
        properties: {
          cardId: { type: 'string', description: 'Card id from get_cards' },
          deckId: { type: 'string', description: 'Deck id, used to find the card by question' },
          front: { type: 'string', description: 'Current question text when the id is unknown' },
          newFront: { type: 'string', description: 'New question text' },
          newBack: { type: 'string', description: 'New answer text' },
          mastered: { type: 'boolean', description: 'Mark the card mastered or not' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    let cardId = str(args.cardId ?? args.card_id)
    if (!cardId) {
      const deckId = await resolveDeckId(args)
      const front = str(args.front).toLowerCase()
      if (!deckId || !front) return 'Error: provide a cardId or a deck plus the current question text.'
      const cards = await getCardsByDeck(deckId)
      const match =
        cards.find((card) => card.front.toLowerCase() === front) ??
        cards.find((card) => card.front.toLowerCase().includes(front))
      if (!match) return 'Error: no matching card in that deck.'
      cardId = match.id
    }

    const input: Parameters<typeof updateLearnCard>[1] = {}
    if (str(args.newFront)) input.front = str(args.newFront)
    if (str(args.newBack)) input.back = str(args.newBack)
    if (typeof args.mastered === 'boolean') input.mastered = args.mastered
    if (Object.keys(input).length === 0) return 'Nothing to update: provide a new question, answer or mastery state.'
    await updateLearnCard(cardId, input)
    return `Updated card [id: ${cardId}].`
  },
}

const deleteLearnCardTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'delete_card',
      description:
        'Delete a flashcard permanently. Only call this after the user explicitly confirmed the deletion.',
      parameters: {
        type: 'object',
        properties: {
          cardId: { type: 'string', description: 'Card id from get_cards' },
          deckId: { type: 'string', description: 'Deck id, used to find the card by question' },
          front: { type: 'string', description: 'Question text when the id is unknown' },
          confirm: {
            type: 'boolean',
            description: 'Must be true; only set when the user explicitly asked to delete the card.',
          },
        },
        required: ['confirm'],
      },
    },
  },
  execute: async (args) => {
    if (args.confirm !== true) {
      return 'Deletion not confirmed. Ask the user explicitly before deleting anything.'
    }
    let cardId = str(args.cardId ?? args.card_id)
    if (!cardId) {
      const deckId = await resolveDeckId(args)
      const front = str(args.front).toLowerCase()
      if (!deckId || !front) return 'Error: provide a cardId or a deck plus the question text.'
      const cards = await getCardsByDeck(deckId)
      const match = cards.find((card) => card.front.toLowerCase().includes(front))
      if (!match) return 'Error: no matching card in that deck.'
      cardId = match.id
    }
    await deleteLearnCard(cardId)
    return `Deleted card [id: ${cardId}].`
  },
}

const updateLearnDeckTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'update_deck',
      description: 'Rename a Learn deck or change its description.',
      parameters: {
        type: 'object',
        properties: {
          deckId: { type: 'string', description: 'Deck id from list_decks' },
          deckTitle: { type: 'string', description: 'Deck title when the id is unknown' },
          newTitle: { type: 'string', description: 'New deck title' },
          description: { type: 'string', description: 'New deck description' },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const deckId = await resolveDeckId(args)
    if (!deckId) return 'Error: deck not found.'
    const input: Parameters<typeof updateLearnDeck>[1] = {}
    if (str(args.newTitle)) input.title = str(args.newTitle)
    if (str(args.description)) input.description = str(args.description)
    if (Object.keys(input).length === 0) return 'Nothing to update: provide a new title or description.'
    await updateLearnDeck(deckId, input)
    return `Updated deck [id: ${deckId}].`
  },
}

const deleteLearnDeckTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'delete_deck',
      description:
        'Delete a Learn deck and all of its cards permanently. Only call this after the user explicitly confirmed the deletion.',
      parameters: {
        type: 'object',
        properties: {
          deckId: { type: 'string', description: 'Deck id from list_decks' },
          deckTitle: { type: 'string', description: 'Deck title when the id is unknown' },
          confirm: {
            type: 'boolean',
            description: 'Must be true; only set when the user explicitly asked to delete the deck.',
          },
        },
        required: ['confirm'],
      },
    },
  },
  execute: async (args) => {
    if (args.confirm !== true) {
      return 'Deletion not confirmed. Ask the user explicitly before deleting anything.'
    }
    const deckId = await resolveDeckId(args)
    if (!deckId) return 'Error: deck not found.'
    await deleteLearnDeck(deckId)
    return `Deleted Learn deck [id: ${deckId}].`
  },
}

// ─── Workspace overview ─────────────────────────────────────────────────────

const getWorkspaceOverviewTool: ChatToolSpec = {
  definition: {
    type: 'function',
    function: {
      name: 'get_workspace_overview',
      description:
        'Get a high-level overview of the workspace: note, folder, project, task and deck counts plus recent notes and current learning progress.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  execute: async () => {
    const [notes, folders, projects, tasks, decks, taskStats, learnStats] = await Promise.all([
      getAllNoteSummaries(5000),
      getFolders().catch(() => []),
      getProjects().catch(() => []),
      getTasks({ includeCompleted: true }).catch(() => []),
      getLearnDecks().catch(() => []),
      getTaskStats(),
      getLearnStats(),
    ])

    const recent = [...notes]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5)
      .map((note) => `- ${note.title || 'Untitled'} (${note.note_type}, ${formatDate(note.updated_at)})`)

    return [
      `notes: ${notes.length}`,
      `folders: ${folders.length}`,
      `projects: ${projects.length}`,
      `tasks: ${tasks.length} (open ${taskStats.total - taskStats.completed}, completed ${taskStats.completed}, overdue ${taskStats.overdue})`,
      `learn decks: ${decks.length} (level ${learnStats?.level ?? 1}, streak ${learnStats?.streak ?? 0}, XP ${learnStats?.xp ?? 0})`,
      '',
      'recent notes:',
      ...(recent.length > 0 ? recent : ['- none yet']),
    ].join('\n')
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
  update_note: updateNoteTool,
  delete_note: deleteNoteTool,
  create_mindmap_note: createMindmapNoteTool,
  create_data_sheet_note: createDataSheetNoteTool,
  create_bullet_journal_note: createBulletJournalNoteTool,
  create_folder: createFolderTool,
  create_project: createProjectTool,
  update_project: updateProjectTool,
  list_tasks: listTasks,
  create_task: createTaskTool,
  complete_task: completeTaskTool,
  update_task: updateTaskTool,
  delete_task: deleteTaskTool,
  get_task_stats: getTaskStatsTool,
  list_events: listEventsTool,
  create_event: createEventTool,
  update_event: updateEventTool,
  delete_event: deleteEventTool,
  list_decks: listLearnDecksTool,
  create_deck: createLearnDeckTool,
  add_cards: addLearnCardsTool,
  get_cards: getLearnCardsTool,
  update_card: updateLearnCardTool,
  delete_card: deleteLearnCardTool,
  update_deck: updateLearnDeckTool,
  delete_deck: deleteLearnDeckTool,
  get_stats: getLearnStatsTool,
  search_cards: searchLearnCardsTool,
  get_workspace_overview: getWorkspaceOverviewTool,
}

/** Domain groups a sub-agent can be granted (mirrors the agent's tool picker). */
export const CHAT_TOOL_GROUPS: Record<string, string[]> = {
  notes: [
    'list_folders',
    'list_notes',
    'search_notes',
    'read_note',
    'create_note',
    'append_to_note',
    'update_note',
    'delete_note',
    'create_mindmap_note',
    'create_data_sheet_note',
    'create_bullet_journal_note',
    'create_folder',
  ],
  tasks: ['list_tasks', 'create_task', 'complete_task', 'update_task', 'delete_task', 'get_task_stats'],
  projects: ['list_projects', 'list_folders', 'create_project', 'update_project'],
  calendar: ['list_events', 'create_event', 'update_event', 'delete_event', 'get_current_date'],
  learn: [
    'list_decks',
    'create_deck',
    'add_cards',
    'get_cards',
    'update_card',
    'delete_card',
    'update_deck',
    'delete_deck',
    'get_stats',
    'search_cards',
  ],
  workspace: ['get_workspace_overview', 'list_projects', 'list_folders', 'get_task_stats'],
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
