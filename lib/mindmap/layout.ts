// ============================================================================
// Mindmap — automatic layout engines
//
// Provides two deterministic layout strategies:
//   • "lr"    — left-to-right tidy tree (Reingold–Tilford / Buchheim et al.)
//               parents centred over their children, adjacent subtrees never
//               overlap, siblings ordered top-to-bottom.
//   • "radial" — weighted radial fan: each branch receives an angular slice
//               proportional to its leaf count so deep branches get room and
//               don't fan into their neighbours.
//
// Both honour `preserveRoot` (keep the root where it is) and `preserve`
// (a list of node ids whose current positions must be kept — their subtrees
// are translated as a unit).
// ============================================================================

import type { MindmapData, MindmapNode, Point } from './types'
import { NODE_HEIGHT } from './constants'

export type MindmapLayoutDirection = 'lr' | 'radial'

export interface MindmapLayoutOptions {
  direction?: MindmapLayoutDirection
  /** Horizontal gap between levels (lr) or ring step (radial). */
  levelGap?: number
  /** Minimum vertical gap between adjacent nodes in the same level (lr). */
  siblingGap?: number
  /** Keep the root node at its current position (default true). */
  preserveRoot?: boolean
  /** Node ids whose current positions must not change. */
  preserve?: string[]
  /** Where to place the root when `preserveRoot` is false (default 400,300). */
  center?: Point
}

export type MindmapLayoutResult = Record<string, Point>

// ---------------------------------------------------------------------------
// Tidy-tree (left-to-right) — Buchheim et al. improved Walker algorithm
// ---------------------------------------------------------------------------

interface TidyNode {
  id: string
  parent: TidyNode | null
  children: TidyNode[]
  /** 1-based index among siblings. */
  number: number
  depth: number
  prelim: number
  mod: number
  shift: number
  change: number
  thread: TidyNode | null
  ancestor: TidyNode | null
}

function nextLeft(v: TidyNode): TidyNode | null {
  return v.children.length > 0 ? v.children[0] : v.thread
}

function nextRight(v: TidyNode): TidyNode | null {
  return v.children.length > 0 ? v.children[v.children.length - 1] : v.thread
}

function leftSiblingOf(v: TidyNode): TidyNode | null {
  if (!v.parent || v.number <= 1) return null
  return v.parent.children[v.number - 2]
}

function leftmostSiblingOf(v: TidyNode): TidyNode | null {
  if (!v.parent || v.parent.children.length === 0) return null
  return v.parent.children[0]
}

function ancestorOf(vim: TidyNode, v: TidyNode, defaultAncestor: TidyNode): TidyNode {
  return vim.ancestor && vim.ancestor.parent === v.parent ? vim.ancestor : defaultAncestor
}

function moveSubtree(wm: TidyNode, wp: TidyNode, shift: number): void {
  const subtrees = wp.number - wm.number
  if (subtrees === 0) return
  wp.change -= shift / subtrees
  wp.shift += shift
  wp.prelim += shift
  wp.mod += shift
  wm.change += shift / subtrees
}

function executeShifts(v: TidyNode): void {
  let shift = 0
  let change = 0
  for (let i = v.children.length - 1; i >= 0; i -= 1) {
    const w = v.children[i]
    w.prelim += shift
    w.mod += shift
    change += w.change
    shift += w.shift + change
  }
}

function firstWalk(v: TidyNode, distance: number): void {
  if (v.children.length === 0) {
    const leftSibling = leftSiblingOf(v)
    v.prelim = leftSibling ? leftSibling.prelim + distance : 0
    return
  }

  let defaultAncestor = v.children[0]
  for (const w of v.children) {
    firstWalk(w, distance)
    defaultAncestor = apportion(w, defaultAncestor, distance)
  }

  executeShifts(v)

  const midpoint = (v.children[0].prelim + v.children[v.children.length - 1].prelim) / 2
  const leftSibling = leftSiblingOf(v)
  if (leftSibling) {
    v.prelim = leftSibling.prelim + distance
    v.mod = v.prelim - midpoint
  } else {
    v.prelim = midpoint
  }
}

function apportion(v: TidyNode, defaultAncestor: TidyNode, distance: number): TidyNode {
  const leftSibling = leftSiblingOf(v)
  if (!leftSibling) return defaultAncestor

  let vir = v
  let vor = v
  let vil = leftSibling
  let vol = leftmostSiblingOf(v)
  if (!vol) return defaultAncestor

  let sir = v.mod
  let sor = v.mod
  let sil = vil.mod
  let sol = vol.mod

  let nextRightVil = nextRight(vil)
  let nextLeftVir = nextLeft(vir)

  while (nextRightVil && nextLeftVir) {
    vil = nextRightVil
    vir = nextLeftVir
    const nextLeftVol = nextLeft(vol)
    const nextRightVor = nextRight(vor)
    if (!nextLeftVol || !nextRightVor) break
    vol = nextLeftVol
    vor = nextRightVor
    vor.ancestor = v

    const shift = vil.prelim + sil - (vir.prelim + sir) + distance
    if (shift > 0) {
      moveSubtree(ancestorOf(vil, v, defaultAncestor), v, shift)
      sir += shift
      sor += shift
    }

    sil += vil.mod
    sir += vir.mod
    sol += vol.mod
    sor += vor.mod

    nextRightVil = nextRight(vil)
    nextLeftVir = nextLeft(vir)
  }

  if (nextRight(vil) && !nextRight(vor)) {
    const threadTarget = nextRight(vil)
    if (threadTarget) {
      vor.thread = threadTarget
      vor.mod += sil - sor
    }
  } else {
    const nextLeftVirAfter = nextLeft(vir)
    if (nextLeftVirAfter && !nextLeft(vol)) {
      vol.thread = nextLeftVirAfter
      vol.mod += sir - sol
    }
    defaultAncestor = v
  }

  return defaultAncestor
}

function secondWalk(v: TidyNode, m: number, positions: MindmapLayoutResult, levelGap: number): void {
  positions[v.id] = { x: v.depth * levelGap, y: v.prelim + m }
  for (const w of v.children) {
    secondWalk(w, m + v.mod, positions, levelGap)
  }
}

function layoutTidyTree(data: MindmapData, levelGap: number, siblingGap: number): MindmapLayoutResult {
  const positions: MindmapLayoutResult = {}
  const nodeMap = new Map<string, TidyNode>()

  for (const id of Object.keys(data.nodes)) {
    nodeMap.set(id, {
      id,
      parent: null,
      children: [],
      number: 0,
      depth: 0,
      prelim: 0,
      mod: 0,
      shift: 0,
      change: 0,
      thread: null,
      ancestor: null,
    })
  }

  for (const node of Object.values(data.nodes)) {
    const tidy = nodeMap.get(node.id)
    if (!tidy) continue
    tidy.children = node.children
      .map((childId) => nodeMap.get(childId))
      .filter((child): child is TidyNode => Boolean(child))
  }

  const root = nodeMap.get(data.rootId)
  if (!root) return positions

  const setParentLinks = (node: TidyNode, depth: number): void => {
    node.depth = depth
    node.children.forEach((child, index) => {
      child.parent = node
      child.number = index + 1
      setParentLinks(child, depth + 1)
    })
  }
  setParentLinks(root, 0)

  const distance = NODE_HEIGHT + siblingGap
  firstWalk(root, distance)
  secondWalk(root, 0, positions, levelGap)

  return positions
}

// ---------------------------------------------------------------------------
// Weighted radial layout
// ---------------------------------------------------------------------------

function layoutWeightedRadial(data: MindmapData, levelGap: number): MindmapLayoutResult {
  const positions: MindmapLayoutResult = {}
  const weights = new Map<string, number>()

  const computeWeight = (nodeId: string): number => {
    const node = data.nodes[nodeId]
    if (!node) return 0
    if (node.children.length === 0) {
      weights.set(nodeId, 1)
      return 1
    }
    let total = 0
    for (const childId of node.children) {
      total += computeWeight(childId)
    }
    weights.set(nodeId, total)
    return total
  }

  computeWeight(data.rootId)

  const place = (nodeId: string, depth: number, startAngle: number, endAngle: number): void => {
    const node = data.nodes[nodeId]
    if (!node) return
    const radius = depth * levelGap
    const midAngle = (startAngle + endAngle) / 2
    positions[nodeId] = { x: Math.cos(midAngle) * radius, y: Math.sin(midAngle) * radius }

    const totalWeight = (weights.get(nodeId) ?? node.children.length) || 1
    let angle = startAngle
    for (const childId of node.children) {
      const childWeight = weights.get(childId) ?? 1
      const slice = (endAngle - startAngle) * (childWeight / totalWeight)
      place(childId, depth + 1, angle, angle + slice)
      angle += slice
    }
  }

  place(data.rootId, 0, -Math.PI / 2, (Math.PI * 3) / 2)
  return positions
}

// ---------------------------------------------------------------------------
// Shared translation helpers
// ---------------------------------------------------------------------------

function collectSubtreeIds(data: MindmapData, startId: string): string[] {
  const ids: string[] = []
  const stack = [startId]
  while (stack.length > 0) {
    const id = stack.pop() as string
    ids.push(id)
    const node = data.nodes[id]
    if (node) node.children.forEach((childId) => stack.push(childId))
  }
  return ids
}

function translate(positions: MindmapLayoutResult, ids: string[], delta: Point): void {
  for (const id of ids) {
    const pos = positions[id]
    if (!pos) continue
    pos.x += delta.x
    pos.y += delta.y
  }
}

/**
 * Computes a full set of node positions for the given mindmap data.
 *
 * @param data    Normalized mindmap data (see normalizeMindmapData).
 * @param options Layout strategy + spacing / preservation options.
 * @returns A map of nodeId → desired { x, y } (center coordinates).
 */
export function layoutMindmap(data: MindmapData, options: MindmapLayoutOptions = {}): MindmapLayoutResult {
  const direction: MindmapLayoutDirection = options.direction ?? 'lr'
  const preserveRoot = options.preserveRoot !== false
  const root = data.nodes[data.rootId]

  const levelGap = options.levelGap ?? (direction === 'lr' ? 180 : 220)
  const siblingGap = options.siblingGap ?? 36

  const positions: MindmapLayoutResult =
    direction === 'radial'
      ? layoutWeightedRadial(data, levelGap)
      : layoutTidyTree(data, levelGap, siblingGap)

  if (!root || !positions[data.rootId]) return positions

  // Anchor the layout on the root: either keep the root where it is or move
  // it to the requested center.
  const rootComputed = positions[data.rootId]
  const rootTarget: Point = preserveRoot
    ? { x: root.x, y: root.y }
    : { x: options.center?.x ?? 400, y: options.center?.y ?? 300 }

  const rootDelta = { x: rootTarget.x - rootComputed.x, y: rootTarget.y - rootComputed.y }
  translate(positions, Object.keys(positions), rootDelta)

  // Preserve hand-placed nodes: for each top-level preserved node (no
  // preserved ancestor), shift its entire subtree so the node stays put.
  const preserveIds = options.preserve ?? []
  if (preserveIds.length > 0) {
    const preserveSet = new Set(preserveIds)
    const topLevel = preserveIds.filter((id) => {
      if (id === data.rootId) return false // root handled above
      let current: MindmapNode | undefined = data.nodes[id]
      while (current && current.parentId) {
        if (preserveSet.has(current.parentId)) return false
        current = data.nodes[current.parentId]
      }
      return true
    })

    for (const id of topLevel) {
      const node = data.nodes[id]
      const computed = positions[id]
      if (!node || !computed) continue
      const delta = { x: node.x - computed.x, y: node.y - computed.y }
      if (delta.x === 0 && delta.y === 0) continue
      translate(positions, collectSubtreeIds(data, id), delta)
    }
  }

  return positions
}
