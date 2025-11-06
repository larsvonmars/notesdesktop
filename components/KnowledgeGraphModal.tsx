'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { X, ZoomIn, ZoomOut, Maximize2, FolderTree, Loader2 } from 'lucide-react'
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
  links: number // number of connections
  folderId?: string | null
}

interface GraphLink {
  source: string
  target: string
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const NODE_BASE_RADIUS = 16
const NODE_RADIUS_SCALE = 6
const NODE_MAX_RADIUS = 34

function getNodeRadius(node: GraphNode): number {
  const connections = Math.max(0, node.links)
  return Math.min(NODE_MAX_RADIUS, NODE_BASE_RADIUS + Math.sqrt(connections) * NODE_RADIUS_SCALE)
}

function applyInitialLayout(nodes: GraphNode[], currentNodeId?: string | null): GraphNode[] {
  const count = nodes.length
  if (count === 0) return []
  if (count === 1) {
    const single = nodes[0]
    return [{ ...single, x: 0, y: 0, vx: 0, vy: 0 }]
  }

  const spacing = Math.max(120, Math.sqrt(count) * 55)

  const arranged = nodes.map((node, index) => {
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
    const centerNode = arranged.find(node => node.id === currentNodeId)
    if (centerNode) {
      const offsetX = centerNode.x
      const offsetY = centerNode.y
      return arranged.map(node => ({
        ...node,
        x: node.x - offsetX,
        y: node.y - offsetY,
      }))
    }
  }

  const avgX = arranged.reduce((sum, node) => sum + node.x, 0) / count
  const avgY = arranged.reduce((sum, node) => sum + node.y, 0) / count
  return arranged.map(node => ({
    ...node,
    x: node.x - avgX,
    y: node.y - avgY,
  }))
}

function calculateGraphBounds(nodes: GraphNode[]): { minX: number; maxX: number; minY: number; maxY: number } {
  if (nodes.length === 0) {
    return { minX: -1, maxX: 1, minY: -1, maxY: 1 }
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  nodes.forEach(node => {
    const radius = getNodeRadius(node)
    minX = Math.min(minX, node.x - radius)
    maxX = Math.max(maxX, node.x + radius)
    minY = Math.min(minY, node.y - radius)
    maxY = Math.max(maxY, node.y + radius)
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
    if (filterFolderId === 'all') {
      return allNotes
    }
    
    if (filterFolderId === null) {
      // Root folder only
      return allNotes.filter((note: Note) => note.folder_id === null)
    }

    // Get all folder IDs including nested folders
    const folderIds = getAllFolderIds(filterFolderId)
    return allNotes.filter((note: Note) => 
      note.folder_id && folderIds.includes(note.folder_id)
    )
  }, [allNotes, filterFolderId, folders])

  // Build graph data from filtered notes
  const { nodes, links } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>()
    const linkList: GraphLink[] = []

    // Create nodes for all filtered notes
    filteredNotes.forEach((note: Note) => {
      if (!nodeMap.has(note.id)) {
        nodeMap.set(note.id, {
          id: note.id,
          label: note.title || 'Untitled',
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          links: 0,
          folderId: note.folder_id
        })
      }
    })

    // Extract links and create edges
    filteredNotes.forEach((note: Note) => {
      const linkedIds = extractNoteLinkIds(note.content)
      linkedIds.forEach(targetId => {
        if (nodeMap.has(targetId) && targetId !== note.id) {
          linkList.push({
            source: note.id,
            target: targetId
          })
          // Increment link count
          const sourceNode = nodeMap.get(note.id)
          const targetNode = nodeMap.get(targetId)
          if (sourceNode) sourceNode.links++
          if (targetNode) targetNode.links++
        }
      })
    })

    return {
      nodes: Array.from(nodeMap.values()),
      links: linkList
    }
  }, [filteredNotes])

  // Initialize nodes and links refs
  useEffect(() => {
    if (!isOpen) return

    const preparedNodes = applyInitialLayout(nodes.map(node => ({ ...node })), currentNoteId)
    nodesRef.current = preparedNodes
    linksRef.current = links.map(link => ({ ...link }))
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
    const padding = 200
    const graphWidth = Math.max(bounds.maxX - bounds.minX, 1) + padding
    const graphHeight = Math.max(bounds.maxY - bounds.minY, 1) + padding
    const scale = Math.min(width / graphWidth, height / graphHeight)
    const clampedScale = Math.max(0.3, Math.min(2.5, scale || 1))

    setZoom(clampedScale)
    setPan({ x: 0, y: 0 })
    setHasAutoFit(true)
  }, [isOpen, filteredNotes, hasAutoFit, isLoadingNotes, loadError])

  // Physics simulation for force-directed layout
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastTime = Date.now()

    const simulate = () => {
      const now = Date.now()
      const dt = Math.min((now - lastTime) / 1000, 0.1) // Cap dt to prevent large jumps
      lastTime = now

      const nodes = nodesRef.current
      const links = linksRef.current

      // Apply forces
  const nodeCount = Math.max(nodes.length, 1)
  const damping = 0.82
  const repulsion = 2400 * (1 + Math.log10(nodeCount + 1))
  const targetDistance = 140 + Math.sqrt(nodeCount) * 18
  const attractionStrength = 0.015
  const centerForce = 0.02

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x
          const dy = nodes[j].y - nodes[i].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const minDistance = getNodeRadius(nodes[i]) + getNodeRadius(nodes[j]) + 30
          const overlap = Math.max(0, minDistance - dist)
          const force = repulsion / (dist * dist) + overlap * 25
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
        if (source && target) {
          const dx = target.x - source.x
          const dy = target.y - source.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const diff = dist - targetDistance
          const force = diff * attractionStrength
          const limitedForce = Math.max(-160, Math.min(160, force))
          const fx = (dx / dist) * limitedForce
          const fy = (dy / dist) * limitedForce
          source.vx += fx
          source.vy += fy
          target.vx -= fx
          target.vy -= fy
        }
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
        node.vx = Math.max(-600, Math.min(600, node.vx))
        node.vy = Math.max(-600, Math.min(600, node.vy))
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

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Apply transformations
      ctx.save()
      ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y)
      ctx.scale(zoom, zoom)

      // Draw links with arrows
      linksRef.current.forEach(link => {
        const source = nodesRef.current.find(n => n.id === link.source)
        const target = nodesRef.current.find(n => n.id === link.target)
        if (source && target) {
          const dx = target.x - source.x
          const dy = target.y - source.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          const angle = Math.atan2(dy, dx)
          
          // Calculate start and end points (adjust for node radius)
          const sourceRadius = getNodeRadius(source) / zoom
          const targetRadius = getNodeRadius(target) / zoom
          const startX = source.x + (dx / distance) * sourceRadius
          const startY = source.y + (dy / distance) * sourceRadius
          const endX = target.x - (dx / distance) * targetRadius
          const endY = target.y - (dy / distance) * targetRadius

          // Draw line
          ctx.strokeStyle = '#94a3b8'
          ctx.lineWidth = 1.5 / zoom
          ctx.beginPath()
          ctx.moveTo(startX, startY)
          ctx.lineTo(endX, endY)
          ctx.stroke()

          // Draw arrowhead at the target end
          const arrowSize = 10 / zoom
          const arrowX = endX - (dx / distance) * (arrowSize * 0.5)
          const arrowY = endY - (dy / distance) * (arrowSize * 0.5)

          ctx.beginPath()
          ctx.moveTo(arrowX, arrowY)
          ctx.lineTo(
            arrowX - arrowSize * Math.cos(angle - Math.PI / 6),
            arrowY - arrowSize * Math.sin(angle - Math.PI / 6)
          )
          ctx.lineTo(
            arrowX - arrowSize * Math.cos(angle + Math.PI / 6),
            arrowY - arrowSize * Math.sin(angle + Math.PI / 6)
          )
          ctx.closePath()
          ctx.fillStyle = '#94a3b8'
          ctx.fill()
        }
      })

      // Draw nodes
      nodesRef.current.forEach(node => {
        const isHovered = hoveredNode === node.id
        const isSelected = selectedNode === node.id
        const isCurrent = currentNoteId === node.id
  const radius = getNodeRadius(node) / zoom

        // Determine node color based on note type
        let nodeColor = '#dbeafe' // default blue for text notes
        let strokeColor = '#3b82f6'
        
        const note = allNotes.find((n: Note) => n.id === node.id)
        if (note) {
          if (note.note_type === 'drawing') {
            nodeColor = '#e9d5ff' // purple
            strokeColor = '#a855f7'
          } else if (note.note_type === 'mindmap') {
            nodeColor = '#d1fae5' // green
            strokeColor = '#10b981'
          }
        }

        // Adjust colors for states
        if (isCurrent) {
          nodeColor = '#fef3c7' // yellow highlight for current
          strokeColor = '#f59e0b'
        } else if (isSelected) {
          // Brighten the color
          strokeColor = isCurrent ? strokeColor : strokeColor
        } else if (isHovered) {
          // Slightly brighten on hover
          nodeColor = nodeColor
        }

        // Node circle
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = nodeColor
        ctx.fill()
        
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = (isCurrent ? 3 : isSelected || isHovered ? 2.5 : 2) / zoom
        ctx.stroke()

        // Node label
        if (isHovered || isSelected || isCurrent || zoom > 0.8) {
          ctx.fillStyle = '#1e293b'
          ctx.font = `${Math.min(14 / zoom, 14)}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          
          const maxWidth = 100 / zoom
          const label = node.label.length > 20 ? node.label.substring(0, 20) + '...' : node.label
          
          // Background for text
          const metrics = ctx.measureText(label)
          const padding = 4 / zoom
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
          ctx.fillRect(
            node.x - metrics.width / 2 - padding,
            node.y + radius + 4 / zoom - padding,
            metrics.width + padding * 2,
            14 / zoom + padding * 2
          )
          
          ctx.fillStyle = '#1e293b'
          ctx.fillText(label, node.x, node.y + radius + 4 / zoom)
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

  // Handle canvas resize
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !containerRef.current) return

    const resizeCanvas = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [isOpen])

  // Handle mouse interactions
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Transform to graph coordinates
    const graphX = (x - canvas.width / 2 - pan.x) / zoom
    const graphY = (y - canvas.height / 2 - pan.y) / zoom

    // Check if clicking on a node
    const clickedNode = nodesRef.current.find(node => {
      const dx = node.x - graphX
      const dy = node.y - graphY
      const radius = getNodeRadius(node) / zoom
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
      // Check hover
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const graphX = (x - canvas.width / 2 - pan.x) / zoom
      const graphY = (y - canvas.height / 2 - pan.y) / zoom

      const hoveredNode = nodesRef.current.find(node => {
        const dx = node.x - graphX
        const dy = node.y - graphY
        const radius = getNodeRadius(node) / zoom
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
    connectedNotes: nodes.filter(n => n.links > 0).length
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-7xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 border-b border-gray-200 gap-3 sm:gap-0">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 w-full sm:w-auto">
            <div className="flex-1">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Knowledge Graph</h2>
              <p className="text-xs sm:text-sm text-gray-500">
                {stats.totalNotes} notes · {stats.totalLinks} links · {stats.connectedNotes} connected
              </p>
            </div>
            
            {/* Folder Filter */}
            <div className="flex items-center gap-1.5 sm:gap-2 sm:ml-auto sm:mr-4">
              <FolderTree size={14} className="sm:w-4 sm:h-4 text-gray-500" />
              <select
                value={filterFolderId === null ? 'root' : filterFolderId}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === 'all') {
                    setFilterFolderId('all')
                  } else if (value === 'root') {
                    setFilterFolderId(null)
                  } else {
                    setFilterFolderId(value)
                  }
                }}
                className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 border border-gray-300 rounded-md bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 absolute top-3 right-3 sm:static"
            aria-label="Close"
          >
            <X size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Graph Canvas */}
        <div ref={containerRef} className="flex-1 relative bg-gray-50">
          {isLoadingNotes ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Loader2 size={48} className="animate-spin text-blue-500 mx-auto mb-4" />
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
              className="w-full h-full"
            />
          )}
        </div>

        {/* Controls - only show when not loading */}
        {!isLoadingNotes && !loadError && allNotes.length > 0 && (
          <div className="absolute bottom-6 right-6 flex flex-col gap-2">
          <button
            onClick={handleZoomIn}
            className="p-2 bg-white rounded-lg shadow-lg hover:bg-gray-50 transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={20} />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 bg-white rounded-lg shadow-lg hover:bg-gray-50 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={20} />
          </button>
          <button
            onClick={handleReset}
            className="p-2 bg-white rounded-lg shadow-lg hover:bg-gray-50 transition-colors"
            title="Reset View"
          >
            <Maximize2 size={20} />
          </button>
        </div>
        )}

        {/* Legend - only show when not loading */}
        {!isLoadingNotes && !loadError && allNotes.length > 0 && (
          <div className="absolute bottom-6 left-6 bg-white rounded-lg shadow-lg p-4 text-sm max-w-xs">
          <div className="font-medium text-gray-900 mb-2">Legend</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-yellow-100 border-2 border-orange-500"></div>
              <span className="text-gray-600">Current Note</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-100 border-2 border-blue-500"></div>
              <span className="text-gray-600">Text Note</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-purple-100 border-2 border-purple-500"></div>
              <span className="text-gray-600">Drawing Note</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-100 border-2 border-green-500"></div>
              <span className="text-gray-600">Mindmap Note</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
            <div>Larger nodes = more connections</div>
            <div className="mt-1">Drag to pan · Scroll to zoom · Click to open</div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
