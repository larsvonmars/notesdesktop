// ============================================================================
// Mindmap — small shared helpers (edge ids, styles, visibility, note links)
// ============================================================================

import type { MindmapAttachment, MindmapData, MindmapEdgeStyle, MindmapTextNote } from './types'
import { EDGE_DEFAULTS, NOTE_ATTACHMENT_PREFIX } from './constants'

export function parentEdgeId(childId: string): string {
  return `parent:${childId}`
}

export function customEdgeId(edgeId: string): string {
  return `custom:${edgeId}`
}

export function isParentEdgeSelection(edgeId: string | null): boolean {
  return Boolean(edgeId?.startsWith('parent:'))
}

export function isCustomEdgeSelection(edgeId: string | null): boolean {
  return Boolean(edgeId?.startsWith('custom:'))
}

export function mergeEdgeStyle(style?: MindmapEdgeStyle): Required<MindmapEdgeStyle> {
  return {
    color: style?.color ?? EDGE_DEFAULTS.color,
    width: style?.width ?? EDGE_DEFAULTS.width,
    lineType: style?.lineType ?? EDGE_DEFAULTS.lineType,
    opacity: style?.opacity ?? EDGE_DEFAULTS.opacity,
    arrowType: style?.arrowType ?? EDGE_DEFAULTS.arrowType,
  }
}

export function collectVisibleNodeIds(mindmapData: MindmapData): Set<string> {
  const visible = new Set<string>()
  const walk = (nodeId: string) => {
    const node = mindmapData.nodes[nodeId]
    if (!node) return
    visible.add(nodeId)
    if (node.collapsed) return
    node.children.forEach((childId) => walk(childId))
  }
  walk(mindmapData.rootId)
  return visible
}

export function htmlToPlainText(html: string): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function getLinkedTextNoteIdFromAttachments(attachments: MindmapAttachment[]): string | null {
  const linkedAttachment = attachments.find((attachment) => attachment.url.startsWith(NOTE_ATTACHMENT_PREFIX))
  if (!linkedAttachment) return null
  const noteId = linkedAttachment.url.slice(NOTE_ATTACHMENT_PREFIX.length).trim()
  return noteId || null
}

export function getTextNoteIdFromAttachment(attachment: MindmapAttachment): string | null {
  if (!attachment.url.startsWith(NOTE_ATTACHMENT_PREFIX)) return null
  const noteId = attachment.url.slice(NOTE_ATTACHMENT_PREFIX.length).trim()
  return noteId || null
}

export function withLinkedTextNoteAttachment(
  attachments: MindmapAttachment[],
  linkedNote: Pick<MindmapTextNote, 'id' | 'title'>
): MindmapAttachment[] {
  const withoutExistingLinkedNote = attachments.filter(
    (attachment) => !attachment.url.startsWith(NOTE_ATTACHMENT_PREFIX)
  )

  const linkedAttachment: MindmapAttachment = {
    id: `linked-note-${linkedNote.id}`,
    label: `Linked note: ${linkedNote.title || 'Untitled'}`,
    url: `${NOTE_ATTACHMENT_PREFIX}${linkedNote.id}`,
    type: 'link',
  }

  return [linkedAttachment, ...withoutExistingLinkedNote]
}
