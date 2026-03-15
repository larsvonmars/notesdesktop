import type { MindmapData, MindmapNode } from '../components/MindmapEditor'

// ============================================================================
// Mindmap Template System
// ============================================================================

export interface MindmapTemplate {
  id: string
  label: string
  description: string
  /** Lucide icon key for visual display */
  iconKey: 'blank' | 'project' | 'swot' | 'brainstorm' | 'proscons'
  /** Factory that produces a fresh MindmapData (new IDs each time) */
  createData: () => MindmapData
}

// ============================================================================
// Color palette (matches MindmapEditor DEFAULT_COLORS)
// ============================================================================

const COLORS = {
  blue: '#3B82F6',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  purple: '#8B5CF6',
  pink: '#EC4899',
  cyan: '#06B6D4',
  orange: '#F97316',
} as const

// ============================================================================
// Layout helpers
// ============================================================================

const CENTER_X = 400
const CENTER_Y = 300
const RING_RADIUS = 200

/**
 * Builds a MindmapNode with sensible defaults.
 */
function makeNode(
  id: string,
  text: string,
  x: number,
  y: number,
  color: string,
  parentId: string | null = null,
  children: string[] = [],
  description = ''
): MindmapNode {
  return {
    id,
    text,
    x,
    y,
    parentId,
    children,
    collapsed: false,
    color,
    description,
    attachments: [],
  }
}

/**
 * Distributes children evenly around a center point at a given radius.
 * Returns an array of { x, y } positions.
 */
function radialPositions(
  centerX: number,
  centerY: number,
  count: number,
  radius: number,
  startAngle = -Math.PI / 2
): Array<{ x: number; y: number }> {
  if (count === 0) return []
  const step = (Math.PI * 2) / count
  return Array.from({ length: count }, (_, i) => ({
    x: centerX + Math.cos(startAngle + i * step) * radius,
    y: centerY + Math.sin(startAngle + i * step) * radius,
  }))
}

// ============================================================================
// Template: Blank
// ============================================================================

function createBlankData(): MindmapData {
  return {
    rootId: 'root',
    customEdges: [],
    parentEdgeMeta: {},
    nodes: {
      root: makeNode('root', 'Central Idea', CENTER_X, CENTER_Y, COLORS.blue),
    },
  }
}

// ============================================================================
// Template: Project Planning
// ============================================================================

function createProjectPlanningData(): MindmapData {
  const nodes: Record<string, MindmapNode> = {}

  // Root
  const rootId = 'root'
  const branchIds = ['goals', 'tasks', 'resources']
  nodes[rootId] = makeNode(rootId, 'Project Name', CENTER_X, CENTER_Y, COLORS.blue, null, branchIds)

  // First-level branches
  const positions = radialPositions(CENTER_X, CENTER_Y, 3, RING_RADIUS)
  const branchDefs: Array<{ id: string; text: string; color: string; children: Array<{ id: string; text: string }> }> = [
    {
      id: 'goals',
      text: 'Goals',
      color: COLORS.green,
      children: [
        { id: 'goal-1', text: 'Goal 1' },
        { id: 'goal-2', text: 'Goal 2' },
      ],
    },
    {
      id: 'tasks',
      text: 'Tasks',
      color: COLORS.amber,
      children: [
        { id: 'task-1', text: 'Task 1' },
        { id: 'task-2', text: 'Task 2' },
        { id: 'task-3', text: 'Task 3' },
      ],
    },
    {
      id: 'resources',
      text: 'Resources',
      color: COLORS.purple,
      children: [
        { id: 'resource-1', text: 'Resource 1' },
        { id: 'resource-2', text: 'Resource 2' },
      ],
    },
  ]

  branchDefs.forEach((branch, i) => {
    const pos = positions[i]
    const childIds = branch.children.map((c) => c.id)
    nodes[branch.id] = makeNode(branch.id, branch.text, pos.x, pos.y, branch.color, rootId, childIds)

    // Second-level children
    const childPositions = radialPositions(pos.x, pos.y, branch.children.length, RING_RADIUS * 0.65, Math.atan2(pos.y - CENTER_Y, pos.x - CENTER_X) - (Math.PI / 4))
    branch.children.forEach((child, j) => {
      const cp = childPositions[j]
      nodes[child.id] = makeNode(child.id, child.text, cp.x, cp.y, branch.color, branch.id)
    })
  })

  return { rootId, nodes, customEdges: [], parentEdgeMeta: {} }
}

// ============================================================================
// Template: SWOT Analysis
// ============================================================================

function createSWOTData(): MindmapData {
  const nodes: Record<string, MindmapNode> = {}

  const rootId = 'root'
  const quadrants = [
    { id: 'strengths', text: 'Strengths', color: COLORS.green, items: ['Strength 1', 'Strength 2'] },
    { id: 'weaknesses', text: 'Weaknesses', color: COLORS.red, items: ['Weakness 1', 'Weakness 2'] },
    { id: 'opportunities', text: 'Opportunities', color: COLORS.amber, items: ['Opportunity 1', 'Opportunity 2'] },
    { id: 'threats', text: 'Threats', color: COLORS.purple, items: ['Threat 1', 'Threat 2'] },
  ]

  nodes[rootId] = makeNode(rootId, 'SWOT Analysis', CENTER_X, CENTER_Y, COLORS.blue, null, quadrants.map((q) => q.id))

  const positions = radialPositions(CENTER_X, CENTER_Y, 4, RING_RADIUS)

  quadrants.forEach((quad, i) => {
    const pos = positions[i]
    const childIds = quad.items.map((_, j) => `${quad.id}-${j}`)
    nodes[quad.id] = makeNode(quad.id, quad.text, pos.x, pos.y, quad.color, rootId, childIds)

    const childPositions = radialPositions(pos.x, pos.y, quad.items.length, RING_RADIUS * 0.6, Math.atan2(pos.y - CENTER_Y, pos.x - CENTER_X) - (Math.PI / 6))
    quad.items.forEach((itemText, j) => {
      const cp = childPositions[j]
      nodes[`${quad.id}-${j}`] = makeNode(`${quad.id}-${j}`, itemText, cp.x, cp.y, quad.color, quad.id)
    })
  })

  return { rootId, nodes, customEdges: [], parentEdgeMeta: {} }
}

// ============================================================================
// Template: Brainstorming
// ============================================================================

function createBrainstormingData(): MindmapData {
  const nodes: Record<string, MindmapNode> = {}

  const rootId = 'root'
  const branchCount = 5
  const branchColors = [COLORS.blue, COLORS.green, COLORS.amber, COLORS.pink, COLORS.cyan]
  const branchIds = Array.from({ length: branchCount }, (_, i) => `idea-${i + 1}`)

  nodes[rootId] = makeNode(rootId, 'Topic', CENTER_X, CENTER_Y, COLORS.purple, null, branchIds)

  const positions = radialPositions(CENTER_X, CENTER_Y, branchCount, RING_RADIUS)

  branchIds.forEach((id, i) => {
    const pos = positions[i]
    const subIds = [`${id}-a`, `${id}-b`]
    nodes[id] = makeNode(id, `Idea ${i + 1}`, pos.x, pos.y, branchColors[i], rootId, subIds)

    // Two sub-ideas per branch
    const subPositions = radialPositions(pos.x, pos.y, 2, RING_RADIUS * 0.55, Math.atan2(pos.y - CENTER_Y, pos.x - CENTER_X) - (Math.PI / 6))
    subIds.forEach((subId, j) => {
      const sp = subPositions[j]
      nodes[subId] = makeNode(subId, `Detail ${j + 1}`, sp.x, sp.y, branchColors[i], id)
    })
  })

  return { rootId, nodes, customEdges: [], parentEdgeMeta: {} }
}

// ============================================================================
// Template: Pros & Cons
// ============================================================================

function createProsConsData(): MindmapData {
  const nodes: Record<string, MindmapNode> = {}

  const rootId = 'root'
  nodes[rootId] = makeNode(rootId, 'Decision', CENTER_X, CENTER_Y, COLORS.blue, null, ['pros', 'cons'])

  // Pros — left side
  const prosX = CENTER_X - RING_RADIUS
  const prosItems = ['Pro 1', 'Pro 2', 'Pro 3']
  const prosChildIds = prosItems.map((_, i) => `pro-${i + 1}`)
  nodes['pros'] = makeNode('pros', 'Pros', prosX, CENTER_Y, COLORS.green, rootId, prosChildIds)

  const prosPositions = radialPositions(prosX, CENTER_Y, prosItems.length, RING_RADIUS * 0.6, -Math.PI / 2)
  prosItems.forEach((text, i) => {
    const p = prosPositions[i]
    nodes[`pro-${i + 1}`] = makeNode(`pro-${i + 1}`, text, p.x, p.y, COLORS.green, 'pros')
  })

  // Cons — right side
  const consX = CENTER_X + RING_RADIUS
  const consItems = ['Con 1', 'Con 2', 'Con 3']
  const consChildIds = consItems.map((_, i) => `con-${i + 1}`)
  nodes['cons'] = makeNode('cons', 'Cons', consX, CENTER_Y, COLORS.red, rootId, consChildIds)

  const consPositions = radialPositions(consX, CENTER_Y, consItems.length, RING_RADIUS * 0.6, -Math.PI / 2)
  consItems.forEach((text, i) => {
    const p = consPositions[i]
    nodes[`con-${i + 1}`] = makeNode(`con-${i + 1}`, text, p.x, p.y, COLORS.red, 'cons')
  })

  return { rootId, nodes, customEdges: [], parentEdgeMeta: {} }
}

// ============================================================================
// Exported template registry
// ============================================================================

export const MINDMAP_TEMPLATES: MindmapTemplate[] = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'Start from scratch with a single root node',
    iconKey: 'blank',
    createData: createBlankData,
  },
  {
    id: 'project-planning',
    label: 'Project Planning',
    description: 'Goals, tasks & resources structure',
    iconKey: 'project',
    createData: createProjectPlanningData,
  },
  {
    id: 'swot',
    label: 'SWOT Analysis',
    description: 'Strengths, weaknesses, opportunities & threats',
    iconKey: 'swot',
    createData: createSWOTData,
  },
  {
    id: 'brainstorming',
    label: 'Brainstorming',
    description: 'Central topic with radiating idea branches',
    iconKey: 'brainstorm',
    createData: createBrainstormingData,
  },
  {
    id: 'pros-cons',
    label: 'Pros & Cons',
    description: 'Balanced comparison for decision-making',
    iconKey: 'proscons',
    createData: createProsConsData,
  },
]

/**
 * Get a template by ID, falling back to 'blank' if not found.
 */
export function getMindmapTemplate(id: string): MindmapTemplate {
  return MINDMAP_TEMPLATES.find((t) => t.id === id) ?? MINDMAP_TEMPLATES[0]
}
