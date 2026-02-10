"use client"

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { X, ZoomIn, ZoomOut, Maximize2, FolderTree, Loader2, RefreshCw, Crosshair } from 'lucide-react'
import type { Note } from '@/lib/notes'
import { getNotes } from '@/lib/notes'
import type { FolderNode } from '@/lib/folders'

interface KnowledgeGraphModalProps {
  isOpen: boolean
  onClose: () => void
  currentNoteId?: string
  onSelectNote?: (note: Note) => void
  folders?: FolderNode[]
  selectedFolderId?: string | null
}

interface GraphNode {
  id: string
  label: string
  x: number
  y: number
  vx: number
  vy: number
  connections: number
  folderId?: string | null
}

interface GraphLink {
  source: string
  target: string
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const NODE_MIN_RADIUS = 4
const NODE_BASE_RADIUS = 5
const NODE_RADIUS_SCALE = 1.8
const NODE_MAX_RADIUS = 14
const ARROW_SIZE = 4
const LABEL_FONT = '500 10px "Inter", "SF Pro Text", system-ui, sans-serif'
const STATS_FONT = '600 12px "Inter", "SF Pro Text", system-ui, sans-serif'
const TEXT_COLOR = '#1f2937'
const GRID_COLOR = 'rgba(148, 163, 184, 0.13)'

function getNodeRadius(node: GraphNode): number {
  const c = Math.max(0, node.connections)
  const scaled = NODE_BASE_RADIUS + Math.log2(c + 1) * NODE_RADIUS_SCALE
  return Math.min(NODE_MAX_RADIUS, Math.max(NODE_MIN_RADIUS, scaled))
}

function applyInitialLayout(nodes: GraphNode[], currentNodeId?: string | null): GraphNode[] {
  const count = nodes.length
  if (count === 0) return []
  if (count === 1) {
    const n = nodes[0]
    return [{ ...n, x: 0, y: 0, vx: 0, vy: 0 }]
  }

  const spacing = Math.max(20, Math.sqrt(count) * 12)

  const placed = nodes.map((node, index) => {
    const radius = spacing * Math.sqrt(index + 1)
    const angle = index * GOLDEN_ANGLE
    return {
      ...node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    }
  })

  if (currentNodeId) {
    const center = placed.find(n => n.id === currentNodeId)
    if (center) {
      return placed.map(n => ({ ...n, x: n.x - center.x, y: n.y - center.y }))
    }
  }

  const avgX = placed.reduce((s, n) => s + n.x, 0) / count
  const avgY = placed.reduce((s, n) => s + n.y, 0) / count
  return placed.map(n => ({ ...n, x: n.x - avgX, y: n.y - avgY }))
}

function calculateGraphBounds(nodes: GraphNode[]): { minX: number; maxX: number; minY: number; maxY: number } {
  if (nodes.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  nodes.forEach(node => {
    const r = getNodeRadius(node)
    minX = Math.min(minX, node.x - r)
    maxX = Math.max(maxX, node.x + r)
    minY = Math.min(minY, node.y - r)
    maxY = Math.max(maxY, node.y + r)
  })

  return { minX, maxX, minY, maxY }
}

// Extract note links from HTML content
function extractNoteLinkIds(htmlContent: string): string[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlContent, 'text/html')
  const linkElements = doc.querySelectorAll('[data-block-type="note-link"]')
  
  return Array.from(linkElements)
    .map(el => el.getAttribute('data-note-id'))
    .filter((id): id is string => !!id)
}

export default function KnowledgeGraphModal({
  isOpen,
  onClose,
  currentNoteId,
  onSelectNote,
  folders = [],
  selectedFolderId
}: KnowledgeGraphModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(currentNoteId || null)
  const [filterFolderId, setFilterFolderId] = useState<string | null | 'all'>(
    selectedFolderId === undefined ? 'all' : selectedFolderId
  )
  const [allNotes, setAllNotes] = useState<Note[]>([])
  const [isLoadingNotes, setIsLoadingNotes] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hasAutoFit, setHasAutoFit] = useState(false)
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])

  // Fetch all notes when modal opens
  useEffect(() => {
    if (!isOpen) return

    const fetchAllNotes = async () => {
      setIsLoadingNotes(true)
      setLoadError(null)
      try {
        const notes = await getNotes()
        setAllNotes(notes)
      } catch (error) {
        console.error('Error fetching notes for knowledge graph:', error)
        setLoadError('Failed to load notes')
      } finally {
        setIsLoadingNotes(false)
      }
    }

    fetchAllNotes()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setHasAutoFit(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setHasAutoFit(false)
    }
  }, [filterFolderId, isOpen])

  // Helper to get all folder IDs in a folder tree (including nested)
  const getAllFolderIds = (folderId: string | null): string[] => {
    if (folderId === null) return []
    
    const collectIds = (folder: FolderNode): string[] => {
      const ids = [folder.id]
      if (folder.children) {
        folder.children.forEach(child => {
          ids.push(...collectIds(child))
        })
      }
      return ids
    }

    const findFolder = (folders: FolderNode[], targetId: string): FolderNode | null => {
      for (const folder of folders) {
        if (folder.id === targetId) return folder
        if (folder.children) {
          const found = findFolder(folder.children, targetId)
          if (found) return found
        }
      }
      return null
    }

    const folder = findFolder(folders, folderId)
    return folder ? collectIds(folder) : [folderId]
  }

  // Filter notes based on selected folder
  const filteredNotes = useMemo(() => {
    if (filterFolderId === 'all') return allNotes
    if (filterFolderId === null) return allNotes.filter(n => n.folder_id === null)

    const folderIds = getAllFolderIds(filterFolderId)
    return allNotes.filter(n => n.folder_id && folderIds.includes(n.folder_id))
  }, [allNotes, filterFolderId, folders])

  // Build graph data from filtered notes
  const { nodes, links } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>()
    const linkList: GraphLink[] = []
    const linkSet = new Set<string>()

    filteredNotes.forEach(note => {
      if (!nodeMap.has(note.id)) {
        nodeMap.set(note.id, {
          id: note.id,
          label: note.title || 'Untitled',
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          connections: 0,
          folderId: note.folder_id,
        })
      }
    })

    filteredNotes.forEach(note => {
      const linkedIds = extractNoteLinkIds(note.content)
      linkedIds.forEach(targetId => {
        if (!nodeMap.has(targetId) || targetId === note.id) return
        const key = [note.id, targetId].sort().join('|')
        if (linkSet.has(key)) return
        linkSet.add(key)
        linkList.push({ source: note.id, target: targetId })

        const a = nodeMap.get(note.id)
        const b = nodeMap.get(targetId)
        if (a) a.connections += 1
        if (b) b.connections += 1
      })
    })

    return { nodes: Array.from(nodeMap.values()), links: linkList }
  }, [filteredNotes])

  // Initialize nodes and links refs
  useEffect(() => {
    if (!isOpen) return

    nodesRef.current = applyInitialLayout(nodes.map(n => ({ ...n })), currentNoteId)
    linksRef.current = links.map(l => ({ ...l }))
    setSelectedNode(currentNoteId || null)
    setHasAutoFit(false)
  }, [isOpen, nodes, links, currentNoteId])

  useEffect(() => {
    if (!isOpen || hasAutoFit || isLoadingNotes || loadError) return
    if (!containerRef.current) return
    if (nodesRef.current.length === 0) return

    const { width, height } = containerRef.current.getBoundingClientRect()
    if (width === 0 || height === 0) return

    const bounds = calculateGraphBounds(nodesRef.current)
    const padding = 60
    const graphWidth = Math.max(bounds.maxX - bounds.minX, 1) + padding
    const graphHeight = Math.max(bounds.maxY - bounds.minY, 1) + padding
    const scale = Math.min(width / graphWidth, height / graphHeight)
    setZoom(Math.max(0.5, Math.min(3, scale || 1)))
    setPan({ x: 0, y: 0 })
    setHasAutoFit(true)
  }, [isOpen, filteredNotes, hasAutoFit, isLoadingNotes, loadError])

  // Physics simulation for force-directed layout
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Ensure canvas is sized before first render
    const rect = containerRef.current.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const newW = Math.round(rect.width * dpr)
    const newH = Math.round(rect.height * dpr)
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW
      canvas.height = newH
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    let lastTime = Date.now()

    const simulate = () => {
      const now = Date.now()
      const dt = Math.min((now - lastTime) / 1000, 0.1) // Cap dt to prevent large jumps
      lastTime = now

      const nodes = nodesRef.current
      const links = linksRef.current

      // Apply forces
      const nodeCount = Math.max(nodes.length, 1)
      const damping = 0.86
      const repulsion = 400 * (1 + Math.log10(nodeCount + 1))
      const targetDistance = 35 + Math.sqrt(nodeCount) * 4
      const attractionStrength = 0.03
      const centerForce = 0.015

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x
          const dy = nodes[j].y - nodes[i].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const minDistance = getNodeRadius(nodes[i]) + getNodeRadius(nodes[j]) + 8
          const overlap = Math.max(0, minDistance - dist)
          const force = repulsion / (dist * dist) + overlap * 6
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          nodes[i].vx -= fx
          nodes[i].vy -= fy
          nodes[j].vx += fx
          nodes[j].vy += fy
        }
      }

      // Attraction along links
      links.forEach(link => {
        const source = nodes.find(n => n.id === link.source)
        const target = nodes.find(n => n.id === link.target)
        if (!source || !target) return
        const dx = target.x - source.x
        const dy = target.y - source.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const diff = dist - targetDistance
        const force = diff * attractionStrength
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        source.vx += fx
        source.vy += fy
        target.vx -= fx
        target.vy -= fy
      })

      // Center force (pull towards origin)
      nodes.forEach(node => {
        node.vx -= node.x * centerForce
        node.vy -= node.y * centerForce
      })

      // Apply velocity and damping
      nodes.forEach(node => {
        node.vx *= damping
        node.vy *= damping
        node.vx = Math.max(-200, Math.min(200, node.vx))
        node.vy = Math.max(-200, Math.min(200, node.vy))
        node.x += node.vx * dt
        node.y += node.vy * dt
      })

      // Render
      render()

      animationFrameRef.current = requestAnimationFrame(simulate)
    }

    const render = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return

      const dpr = window.devicePixelRatio || 1
      const cssWidth = canvas.width / dpr
      const cssHeight = canvas.height / dpr

      // Reset transform completely before clearing to avoid accumulation
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Scale for HiDPI — all subsequent drawing uses CSS coordinates
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Subtle grid background for orientation
      ctx.save()
      ctx.translate(cssWidth / 2, cssHeight / 2)
      ctx.strokeStyle = GRID_COLOR
      ctx.lineWidth = 0.5
      const gridSize = 50
      const gridOffsetX = pan.x % gridSize
      const gridOffsetY = pan.y % gridSize
      for (let x = -cssWidth; x < cssWidth; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x + gridOffsetX, -cssHeight)
        ctx.lineTo(x + gridOffsetX, cssHeight)
        ctx.stroke()
      }
      for (let y = -cssHeight; y < cssHeight; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(-cssWidth, y + gridOffsetY)
        ctx.lineTo(cssWidth, y + gridOffsetY)
        ctx.stroke()
      }
      ctx.restore()

      ctx.save()
      ctx.translate(cssWidth / 2 + pan.x, cssHeight / 2 + pan.y)
      ctx.scale(zoom, zoom)

      // Draw links with arrows
      linksRef.current.forEach(link => {
        const source = nodesRef.current.find(n => n.id === link.source)
        const target = nodesRef.current.find(n => n.id === link.target)
        if (source && target) {
          const dx = target.x - source.x
          const dy = target.y - source.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (distance < 0.1) return // Skip if nodes overlap
          
          const angle = Math.atan2(dy, dx)
          
          // Get node radii (in graph coordinates)
          const sourceRadius = getNodeRadius(source)
          const targetRadius = getNodeRadius(target)
          
          // Calculate start and end points (adjust for node radius)
          const startX = source.x + (dx / distance) * sourceRadius
          const startY = source.y + (dy / distance) * sourceRadius
          const endX = target.x - (dx / distance) * targetRadius
          const endY = target.y - (dy / distance) * targetRadius

          ctx.strokeStyle = '#cbd5e1'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(startX, startY)
          ctx.lineTo(endX, endY)
          ctx.stroke()

          const arrowX = endX - (dx / distance) * (ARROW_SIZE * 0.25)
          const arrowY = endY - (dy / distance) * (ARROW_SIZE * 0.25)

          ctx.beginPath()
          ctx.moveTo(arrowX, arrowY)
          ctx.lineTo(
            arrowX - ARROW_SIZE * Math.cos(angle - Math.PI / 6),
            arrowY - ARROW_SIZE * Math.sin(angle - Math.PI / 6)
          )
          ctx.lineTo(
            arrowX - ARROW_SIZE * Math.cos(angle + Math.PI / 6),
            arrowY - ARROW_SIZE * Math.sin(angle + Math.PI / 6)
          )
          ctx.closePath()
          ctx.fillStyle = '#cbd5e1'
          ctx.fill()
        }
      })

      // Draw nodes
      nodesRef.current.forEach(node => {
        const isHovered = hoveredNode === node.id
        const isSelected = selectedNode === node.id
        const isCurrent = currentNoteId === node.id
        const radius = getNodeRadius(node)

        // Determine node color based on note type
        let nodeColor = '#e0f2fe'
        let strokeColor = '#2563eb'
        
        const note = allNotes.find((n: Note) => n.id === node.id)
        if (note) {
          if (note.note_type === 'drawing') {
            nodeColor = '#f3e8ff'
            strokeColor = '#9333ea'
          } else if (note.note_type === 'mindmap') {
            nodeColor = '#dcfce7'
            strokeColor = '#16a34a'
          }
        }

        if (isCurrent) {
          nodeColor = '#fef9c3'
          strokeColor = '#f59e0b'
        } else if (isSelected) {
          strokeColor = '#0ea5e9'
        } else if (isHovered) {
          strokeColor = '#3b82f6'
        }

        ctx.save()
        ctx.shadowColor = 'rgba(0, 0, 0, 0.14)'
        ctx.shadowBlur = 3
        ctx.shadowOffsetX = 0.5
        ctx.shadowOffsetY = 1
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = nodeColor
        ctx.fill()
        ctx.restore()

        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = isCurrent ? 2 : isSelected || isHovered ? 1.6 : 1
        ctx.stroke()

        const showLabel = isHovered || isSelected || isCurrent || zoom > 0.7
        if (showLabel) {
          const label = node.label.length > 24 ? `${node.label.slice(0, 24)}...` : node.label
          ctx.font = LABEL_FONT
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'

          const metrics = ctx.measureText(label)
          const padding = 2
          const labelY = node.y + radius + 4

          ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
          ctx.fillRect(
            node.x - metrics.width / 2 - padding,
            labelY - 1,
            metrics.width + padding * 2,
            12 + padding * 2
          )

          ctx.fillStyle = TEXT_COLOR
          ctx.fillText(label, node.x, labelY)
        }
      })

      ctx.restore()
    }

    // Start simulation
    simulate()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isOpen, zoom, pan, hoveredNode, selectedNode, currentNoteId])

  // Resize canvas for HiDPI
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !containerRef.current) return

    const resizeCanvas = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      
      // Only resize if dimensions actually changed
      const newWidth = Math.round(rect.width * dpr)
      const newHeight = Math.round(rect.height * dpr)
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth
        canvas.height = newHeight
        canvas.style.width = `${rect.width}px`
        canvas.style.height = `${rect.height}px`
      }
    }

    resizeCanvas()
    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(containerRef.current)
    window.addEventListener('resize', resizeCanvas)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [isOpen])

  // Handle mouse interactions
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    // Use CSS dimensions (rect), not canvas.width/height which includes DPR scaling
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Transform to graph coordinates using CSS dimensions
    const graphX = (x - rect.width / 2 - pan.x) / zoom
    const graphY = (y - rect.height / 2 - pan.y) / zoom

    // Check if clicking on a node (radius is in graph coordinates, graphX/Y are also in graph coordinates)
    const clickedNode = nodesRef.current.find(node => {
      const dx = node.x - graphX
      const dy = node.y - graphY
      const radius = getNodeRadius(node)
      return Math.sqrt(dx * dx + dy * dy) < radius
    })

    if (clickedNode) {
      setSelectedNode(clickedNode.id)
      if (onSelectNote) {
        const note = allNotes.find((n: Note) => n.id === clickedNode.id)
        if (note) {
          onSelectNote(note)
          onClose()
        }
      }
    } else {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    } else {
      // Check hover - use CSS dimensions from getBoundingClientRect
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const graphX = (x - rect.width / 2 - pan.x) / zoom
      const graphY = (y - rect.height / 2 - pan.y) / zoom

      const hoveredNode = nodesRef.current.find(node => {
        const dx = node.x - graphX
        const dy = node.y - graphY
        const radius = getNodeRadius(node)
        return Math.sqrt(dx * dx + dy * dy) < radius
      })

      setHoveredNode(hoveredNode?.id || null)
      canvas.style.cursor = hoveredNode ? 'pointer' : isDragging ? 'grabbing' : 'grab'
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
    setHoveredNode(null)
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.max(0.1, Math.min(3, prev * delta)))
  }

  const handleZoomIn = () => {
    setZoom(prev => Math.min(3, prev * 1.2))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(0.1, prev / 1.2))
  }

  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  if (!isOpen) return null

  const stats = {
    totalNotes: filteredNotes.length,
    totalLinks: links.length,
    connectedNotes: nodes.filter(n => n.connections > 0).length,
  }

  // Build folder options for dropdown
  const folderOptions: Array<{ id: string | null | 'all'; name: string; depth: number }> = [
    { id: 'all', name: 'All Notes', depth: 0 },
    { id: null, name: 'Root Folder', depth: 0 }
  ]

  const addFolderOptions = (folders: FolderNode[], depth = 0) => {
    folders.forEach(folder => {
      folderOptions.push({
        id: folder.id,
        name: folder.name,
        depth
      })
      if (folder.children && folder.children.length > 0) {
        addFolderOptions(folder.children, depth + 1)
      }
    })
  }

  addFolderOptions(folders)

  // Get current folder name for display
  const getCurrentFolderName = () => {
    if (filterFolderId === 'all') return 'All Notes'
    if (filterFolderId === null) return 'Root Folder'
    
    const findFolderName = (folders: FolderNode[], targetId: string): string | null => {
      for (const folder of folders) {
        if (folder.id === targetId) return folder.name
        if (folder.children) {
          const found = findFolderName(folder.children, targetId)
          if (found) return found
        }
      }
      return null
    }
    
    return findFolderName(folders, filterFolderId) || 'Unknown Folder'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-start gap-4 flex-1">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-alpine-50 text-alpine-700 text-xs font-semibold uppercase tracking-wide">
                Knowledge Graph
              </div>
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-700" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                <span>{stats.totalNotes} notes</span>
                <span>•</span>
                <span>{stats.totalLinks} links</span>
                <span>•</span>
                <span>{stats.connectedNotes} connected</span>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <FolderTree size={16} className="text-gray-500" />
              <select
                value={filterFolderId === null ? 'root' : filterFolderId}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === 'all') setFilterFolderId('all')
                  else if (value === 'root') setFilterFolderId(null)
                  else setFilterFolderId(value)
                }}
                className="text-sm px-3 py-1.5 border border-gray-300 rounded-md bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-alpine-500 focus:border-transparent"
              >
                {folderOptions.map(option => (
                  <option
                    key={option.id === null ? 'root' : option.id}
                    value={option.id === null ? 'root' : option.id}
                  >
                    {'\u00A0'.repeat(option.depth * 2)}{option.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setHasAutoFit(false)}
                className="p-2 rounded-md border border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800"
                title="Re-center graph"
              >
                <Crosshair size={16} />
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Graph Canvas */}
        <div ref={containerRef} className="flex-1 relative bg-gray-50">
          {isLoadingNotes ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Loader2 size={48} className="animate-spin text-alpine-500 mx-auto mb-4" />
                <p className="text-gray-600">Loading all notes...</p>
              </div>
            </div>
          ) : loadError ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-red-600">
                <p className="font-medium mb-2">Error loading notes</p>
                <p className="text-sm">{loadError}</p>
              </div>
            </div>
          ) : allNotes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <p className="font-medium mb-2">No notes found</p>
                <p className="text-sm">Create some notes to see the knowledge graph</p>
              </div>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onWheel={handleWheel}
              style={{ display: 'block', width: '100%', height: '100%' }}
            />
          )}
        </div>

        {!isLoadingNotes && !loadError && allNotes.length > 0 && (
          <>
            <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
              <button
                onClick={handleZoomIn}
                className="p-1.5 bg-white rounded-md shadow-lg hover:bg-gray-50 transition-colors"
                title="Zoom In"
              >
                <ZoomIn size={16} />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-1.5 bg-white rounded-md shadow-lg hover:bg-gray-50 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut size={16} />
              </button>
              <button
                onClick={handleReset}
                className="p-1.5 bg-white rounded-md shadow-lg hover:bg-gray-50 transition-colors"
                title="Reset View"
              >
                <Maximize2 size={16} />
              </button>
            </div>

            <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 text-xs max-w-[200px]">
              <div className="font-medium text-gray-900 mb-1.5 text-xs">Legend</div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-100 border-[1.5px] border-orange-500 flex-shrink-0"></div>
                  <span className="text-gray-600">Current Note</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-alpine-100 border-[1.5px] border-alpine-500 flex-shrink-0"></div>
                  <span className="text-gray-600">Text Note</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-100 border-[1.5px] border-purple-500 flex-shrink-0"></div>
                  <span className="text-gray-600">Drawing Note</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-100 border-[1.5px] border-green-500 flex-shrink-0"></div>
                  <span className="text-gray-600">Mindmap Note</span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 text-[10px] text-gray-500">
                <div>Larger nodes = more connections</div>
                <div className="mt-0.5">Drag to pan · Scroll to zoom · Click to open</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
