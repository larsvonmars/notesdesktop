/**
 * Extract outgoing note ids from a note body, regardless of note type.
 *
 * Rich-text notes link through `[data-block-type="note-link"]` blocks; mindmap
 * nodes link through `note://<id>` attachments. Keeping both extractors here
 * means the backlink index, the knowledge graph and the editor agree about what
 * counts as a connection.
 */

import { NOTE_ATTACHMENT_PREFIX } from './mindmap/constants'

export function extractNoteLinkIdsFromHtml(html: string): string[] {
  if (!html) return []

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return Array.from(doc.querySelectorAll('[data-block-type="note-link"]'))
      .map((element) => element.getAttribute('data-note-id'))
      .filter((id): id is string => !!id)
  }

  const ids: string[] = []
  const pattern = /data-note-id="([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) ids.push(match[1])
  return ids
}

export function extractNoteLinkIdsFromMindmap(content: string): string[] {
  if (!content) return []
  try {
    const data = JSON.parse(content) as {
      nodes?: Record<string, { attachments?: Array<{ url?: unknown }> }>
    }
    const ids = new Set<string>()
    for (const node of Object.values(data.nodes ?? {})) {
      for (const attachment of node.attachments ?? []) {
        if (typeof attachment?.url !== 'string') continue
        if (!attachment.url.startsWith(NOTE_ATTACHMENT_PREFIX)) continue
        const id = attachment.url.slice(NOTE_ATTACHMENT_PREFIX.length).trim()
        if (id) ids.add(id)
      }
    }
    return Array.from(ids)
  } catch {
    return []
  }
}

export function extractNoteLinkIdsFromContent(
  noteType: string | null | undefined,
  content: string,
): string[] {
  if (noteType === 'mindmap') return extractNoteLinkIdsFromMindmap(content)
  if (noteType === 'rich-text') return extractNoteLinkIdsFromHtml(content)
  return []
}
