'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { Note } from '@/lib/notes'
import type { FolderNode, Folder } from '@/lib/folders'
import { getNoteTypePresentation } from '@/lib/note-types'

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────
interface GraphNode {
  id: string
  label: string
  noteType: string
  folderId: string | null
  x: number
  y: number
  vx: number
  vy: number
  fill: string
  stroke: string
  radius: number
}

interface GraphEdge {
  source: string
  target: string
}

interface FolderCluster {
  id: string
  name: string
  color: string
  cx: number
  cy: number
  radius: number
}

export interface NoteGraphProps {
  notes: Note[]
  folders: Folder[]
  onSelectNote: (note: Note) => void
  className?: string
}

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

function flattenFolders(tree: FolderNode[]): Folder[] {
  const result: Folder[] = []
  const visit = (nodes: FolderNode[]) => {
    for (const n of nodes) {
      result.push(n)
      if (n.children?.length) visit(n.children)
    }
  }
  visit(tree)
  return result
}

/** Simple seeded random for repeatable layouts */
function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ────────────────────────────────────────────────────────────────────────────
export default function NoteGraph({ notes, folders, onSelectNote, className }: NoteGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const animRef = useRef<number>(0)
  const nodesRef = useRef<GraphNode[]>([])
  const [, forceRender] = useState(0)

  // ── Memoize note map for click handler ──────────────────────────────────
  const noteMap = useMemo(() => {
    const m = new Map<string, Note>()
    notes.forEach(n => m.set(n.id, n))
    return m
  }, [notes])

  // ── Build graph data ────────────────────────────────────────────────────
  const { initialNodes, edges, folderMap } = useMemo(() => {
    const rand = seededRandom(42)
    const w = dimensions.width
    const h = dimensions.height
    const cx = w / 2
    const cy = h / 2

    // Group notes by folder
    const byFolder = new Map<string, Note[]>()
    for (const note of notes) {
      const key = note.folder_id ?? '__root__'
      if (!byFolder.has(key)) byFolder.set(key, [])
      byFolder.get(key)!.push(note)
    }

    // Assign cluster centers in a circle
    const folderKeys = Array.from(byFolder.keys())
    const clusterAngle = (2 * Math.PI) / Math.max(folderKeys.length, 1)
    const clusterRadius = Math.min(w, h) * 0.3

    const fMap = new Map<string, { cx: number; cy: number; name: string; color: string }>()
    folderKeys.forEach((key, i) => {
      const angle = clusterAngle * i - Math.PI / 2
      const folder = folders.find(f => f.id === key)
      fMap.set(key, {
        cx: cx + Math.cos(angle) * clusterRadius,
        cy: cy + Math.sin(angle) * clusterRadius,
        name: folder?.name ?? 'Unfiled',
        color: '#6B7280',
      })
    })

    // Build nodes
    const nodes: GraphNode[] = []
    for (const note of notes) {
      const key = note.folder_id ?? '__root__'
      const cluster = fMap.get(key)!
      const pres = getNoteTypePresentation(note.note_type)
      const spread = 60

      nodes.push({
        id: note.id,
        label: note.title || 'Untitled',
        noteType: note.note_type,
        folderId: note.folder_id,
        x: cluster.cx + (rand() - 0.5) * spread * 2,
        y: cluster.cy + (rand() - 0.5) * spread * 2,
        vx: 0,
        vy: 0,
        fill: pres.graphFill,
        stroke: pres.graphStroke,
        radius: 8,
      })
    }

    // Build edges: connect notes within the same folder
    const edgeList: GraphEdge[] = []
    Array.from(byFolder.values()).forEach(group => {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          edgeList.push({ source: group[i].id, target: group[j].id })
        }
      }
    })

    return { initialNodes: nodes, edges: edgeList, folderMap: fMap }
  }, [notes, folders, dimensions])

  // ── Observe container size ──────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setDimensions({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Force simulation via requestAnimationFrame ──────────────────────────
  useEffect(() => {
    // Clone nodes for mutation
    const nodes = initialNodes.map(n => ({ ...n }))
    nodesRef.current = nodes

    // Index for quick lookup
    const idx = new Map<string, number>()
    nodes.forEach((n, i) => idx.set(n.id, i))

    // Edge index pairs
    const edgePairs = edges
      .map(e => [idx.get(e.source)!, idx.get(e.target)!] as [number, number])
      .filter(([a, b]) => a !== undefined && b !== undefined)

    let alpha = 1
    const alphaDecay = 0.02
    const minAlpha = 0.001

    const tick = () => {
      if (alpha < minAlpha) {
        forceRender(r => r + 1) // final render
        return
      }

      const w = dimensions.width
      const h = dimensions.height
      const cx = w / 2
      const cy = h / 2

      // --- Forces ---

      // 1. Repulsion (all pairs — O(n²) but fine for < 200 nodes)
      const repulStrength = 800
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = nodes[j].x - nodes[i].x
          let dy = nodes[j].y - nodes[i].y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) d2 = 1
          const f = (repulStrength * alpha) / d2
          const fx = dx * f
          const fy = dy * f
          nodes[i].vx -= fx
          nodes[i].vy -= fy
          nodes[j].vx += fx
          nodes[j].vy += fy
        }
      }

      // 2. Spring attraction along edges
      const springLen = 50
      const springStrength = 0.05
      for (const [i, j] of edgePairs) {
        const dx = nodes[j].x - nodes[i].x
        const dy = nodes[j].y - nodes[i].y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const displacement = (d - springLen) * springStrength * alpha
        const fx = (dx / d) * displacement
        const fy = (dy / d) * displacement
        nodes[i].vx += fx
        nodes[i].vy += fy
        nodes[j].vx -= fx
        nodes[j].vy -= fy
      }

      // 3. Centering gravity
      const gravity = 0.02
      for (const node of nodes) {
        node.vx += (cx - node.x) * gravity * alpha
        node.vy += (cy - node.y) * gravity * alpha
      }

      // 4. Cluster pull (attract toward folder cluster center)
      const clusterStrength = 0.04
      for (const node of nodes) {
        const key = node.folderId ?? '__root__'
        const cluster = folderMap.get(key)
        if (cluster) {
          node.vx += (cluster.cx - node.x) * clusterStrength * alpha
          node.vy += (cluster.cy - node.y) * clusterStrength * alpha
        }
      }

      // Integrate & dampen
      const damping = 0.6
      const padding = 20
      for (const node of nodes) {
        node.vx *= damping
        node.vy *= damping
        node.x += node.vx
        node.y += node.vy
        // Keep in bounds
        node.x = Math.max(padding, Math.min(w - padding, node.x))
        node.y = Math.max(padding, Math.min(h - padding, node.y))
      }

      alpha -= alphaDecay
      forceRender(r => r + 1)
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [initialNodes, edges, folderMap, dimensions])

  // ── Render ──────────────────────────────────────────────────────────────
  const nodes = nodesRef.current
  const nodeIdx = useMemo(() => {
    const m = new Map<string, number>()
    nodes.forEach((n, i) => m.set(n.id, i))
    return m
  }, [nodes])

  // Compute cluster hulls (simple bounding circle per folder)
  const folderClusters = useMemo<FolderCluster[]>(() => {
    const byFolder = new Map<string, GraphNode[]>()
    for (const n of nodes) {
      const key = n.folderId ?? '__root__'
      if (!byFolder.has(key)) byFolder.set(key, [])
      byFolder.get(key)!.push(n)
    }
    const clusters: FolderCluster[] = []
    Array.from(byFolder.entries()).forEach(([key, group]) => {
      if (group.length < 2) return
      const cx = group.reduce((s: number, n: GraphNode) => s + n.x, 0) / group.length
      const cy = group.reduce((s: number, n: GraphNode) => s + n.y, 0) / group.length
      let maxR = 0
      for (const n of group) {
        const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2)
        if (d > maxR) maxR = d
      }
      const info = folderMap.get(key)
      clusters.push({
        id: key,
        name: info?.name ?? 'Unfiled',
        color: info?.color ?? '#6B7280',
        cx,
        cy,
        radius: maxR + 30,
      })
    })
    return clusters
  }, [nodes, folderMap])

  if (notes.length === 0) {
    return (
      <div className={`flex items-center justify-center text-sm text-muted ${className ?? ''}`}>
        No notes in this project yet
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`relative w-full h-full min-h-[300px] ${className ?? ''}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="w-full h-full"
        style={{ cursor: 'default' }}
      >
        {/* Folder cluster backgrounds */}
        {folderClusters.map(c => (
          <g key={c.id}>
            <circle
              cx={c.cx}
              cy={c.cy}
              r={c.radius}
              fill="currentColor"
              className="text-surface-hover"
              opacity={0.35}
            />
            <text
              x={c.cx}
              y={c.cy - c.radius - 6}
              textAnchor="middle"
              className="fill-muted text-[11px] font-medium"
            >
              {c.name}
            </text>
          </g>
        ))}

        {/* Edges */}
        {edges.map((e, i) => {
          const si = nodeIdx.get(e.source)
          const ti = nodeIdx.get(e.target)
          if (si === undefined || ti === undefined) return null
          const s = nodes[si]
          const t = nodes[ti]
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
              opacity={0.4}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const isHovered = hoveredNode === node.id
          return (
            <g
              key={node.id}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => {
                const n = noteMap.get(node.id)
                if (n) onSelectNote(n)
              }}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={isHovered ? node.radius + 3 : node.radius}
                fill={node.fill}
                stroke={node.stroke}
                strokeWidth={isHovered ? 2.5 : 1.5}
                style={{ transition: 'r 0.15s, stroke-width 0.15s' }}
              />
              {isHovered && (
                <text
                  x={node.x}
                  y={node.y - node.radius - 6}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-medium pointer-events-none"
                >
                  {node.label.length > 28 ? node.label.slice(0, 26) + '…' : node.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-2 right-2 flex flex-wrap gap-2 text-[10px] bg-surface  rounded-lg px-2 py-1.5">
        {Array.from(new Set(notes.map(n => n.note_type))).map(type => {
          const pres = getNoteTypePresentation(type)
          return (
            <span key={type} className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: pres.graphStroke }}
              />
              <span className="text-muted">{pres.label}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
