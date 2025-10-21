/**
 * Note Link Feature - Example Usage
 * 
 * This file demonstrates how to use the note link feature in your notes
 */

import { noteLinkBlock, createNoteLinkHTML } from '@/lib/editor/noteLinkBlock'
import type { Note } from '@/lib/notes'

/**
 * Example 1: Using the note link in a rich text editor
 * 
 * The note link block is automatically registered in NoteEditor.tsx,
 * so you can use it immediately via the slash command.
 */

// Slash command usage:
// 1. Type "/" in the editor
// 2. Type "note" or "link"
// 3. Select "Note Link" from the menu
// 4. Choose a note from the dialog

/**
 * Example 2: Programmatically creating note links
 */

// If you have a reference to the editor, you can insert note links programmatically
function insertNoteLinkExample(editorRef: any, targetNote: Note) {
  if (!editorRef.current) return
  
  // Use the insertCustomBlock method
  editorRef.current.insertCustomBlock('note-link', {
    noteId: targetNote.id,
    noteTitle: targetNote.title,
    folderId: targetNote.folder_id
  })
}

/**
 * Example 3: Creating note link HTML directly
 */

// You can also create the HTML manually (less common)
function createNoteLinkManually(note: Note): string {
  return createNoteLinkHTML(note.id, note.title, note.folder_id)
}

/**
 * Example 4: Building a table of contents with note links
 */

function createTableOfContents(notes: Note[]): string {
  const tocTitle = '<h2>Table of Contents</h2>'
  const tocList = '<ul>' + notes.map(note => 
    `<li>${createNoteLinkHTML(note.id, note.title, note.folder_id)}</li>`
  ).join('') + '</ul>'
  
  return tocTitle + tocList
}

/**
 * Example 5: Creating a dashboard note with categorized links
 */

function createDashboardNote(
  projectNotes: Note[],
  meetingNotes: Note[],
  referenceNotes: Note[]
): string {
  const html = `
    <h1>My Dashboard</h1>
    
    <h2>📁 Projects</h2>
    <ul>
      ${projectNotes.map(n => `<li>${createNoteLinkHTML(n.id, n.title)}</li>`).join('')}
    </ul>
    
    <h2>📅 Meetings</h2>
    <ul>
      ${meetingNotes.map(n => `<li>${createNoteLinkHTML(n.id, n.title)}</li>`).join('')}
    </ul>
    
    <h2>📚 Reference</h2>
    <ul>
      ${referenceNotes.map(n => `<li>${createNoteLinkHTML(n.id, n.title)}</li>`).join('')}
    </ul>
  `
  
  return html
}

/**
 * Example 6: Handling note link clicks in custom components
 */

function setupNoteLinkClickHandler(notes: Note[], onNavigate: (note: Note) => void) {
  const handleClick = (event: Event) => {
    const customEvent = event as CustomEvent<{ noteId: string }>
    const noteId = customEvent.detail?.noteId
    
    if (noteId) {
      const note = notes.find(n => n.id === noteId)
      if (note) {
        onNavigate(note)
      } else {
        console.error('Note not found:', noteId)
      }
    }
  }
  
  window.addEventListener('note-link-click', handleClick)
  
  // Return cleanup function
  return () => window.removeEventListener('note-link-click', handleClick)
}

/**
 * Example 7: Extracting all note links from a note's content
 */

function extractNoteLinks(htmlContent: string): Array<{ noteId: string; noteTitle: string }> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlContent, 'text/html')
  const linkElements = doc.querySelectorAll('[data-block-type="note-link"]')
  
  return Array.from(linkElements).map(el => ({
    noteId: el.getAttribute('data-note-id') || '',
    noteTitle: el.getAttribute('data-note-title') || ''
  })).filter(link => link.noteId && link.noteTitle)
}

/**
 * Example 8: Building a backlinks system
 */

interface BacklinkInfo {
  fromNoteId: string
  fromNoteTitle: string
  toNoteId: string
}

function findBacklinks(allNotes: Note[], targetNoteId: string): BacklinkInfo[] {
  const backlinks: BacklinkInfo[] = []
  
  for (const note of allNotes) {
    if (note.id === targetNoteId) continue // Skip the target note itself
    
    const links = extractNoteLinks(note.content)
    for (const link of links) {
      if (link.noteId === targetNoteId) {
        backlinks.push({
          fromNoteId: note.id,
          fromNoteTitle: note.title,
          toNoteId: targetNoteId
        })
      }
    }
  }
  
  return backlinks
}

/**
 * Example 9: Validating note links (finding broken links)
 */

function findBrokenLinks(note: Note, allNotes: Note[]): string[] {
  const links = extractNoteLinks(note.content)
  const noteIds = new Set(allNotes.map(n => n.id))
  
  return links
    .filter(link => !noteIds.has(link.noteId))
    .map(link => link.noteId)
}

/**
 * Example 10: Creating a note link with custom styling
 */

function createStyledNoteLink(noteId: string, title: string, emoji?: string): string {
  const icon = emoji || '📝'
  // Note: The actual styling is in the noteLinkBlock.render() method
  // This is just an example of how you might customize it
  return createNoteLinkHTML(noteId, `${icon} ${title}`)
}

/**
 * Real-world use case: Project documentation
 */

const projectDocExample = `
<h1>🚀 Project Alpha</h1>

<h2>Overview</h2>
<p>
  This project aims to build a new feature for our application.
  See ${createNoteLinkHTML('note-1', 'Technical Specification')} for details.
</p>

<h2>Timeline</h2>
<ul>
  <li>Week 1: ${createNoteLinkHTML('note-2', 'Sprint Planning Notes')}</li>
  <li>Week 2: ${createNoteLinkHTML('note-3', 'Development Tasks')}</li>
  <li>Week 3: ${createNoteLinkHTML('note-4', 'Testing Checklist')}</li>
</ul>

<h2>Related Documents</h2>
<p>
  Also see: ${createNoteLinkHTML('note-5', 'Design Mockups')} and 
  ${createNoteLinkHTML('note-6', 'API Documentation')}
</p>
`

export {
  insertNoteLinkExample,
  createNoteLinkManually,
  createTableOfContents,
  createDashboardNote,
  setupNoteLinkClickHandler,
  extractNoteLinks,
  findBacklinks,
  findBrokenLinks,
  createStyledNoteLink,
  projectDocExample
}
