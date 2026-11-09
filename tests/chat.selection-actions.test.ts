import { describe, expect, it } from 'vitest'

import {
  SELECTION_AI_ACTIONS,
  buildSelectionDraft,
  buildSelectionPrompt,
  getSelectionAIAction,
  quoteSelection,
} from '@/lib/chat/selection-actions'
import { CHAT_SYSTEM_PROMPT, buildChatSystemPrompt } from '@/lib/chat/prompts'

describe('selection actions', () => {
  it('offers unique actions with prompt builders for each id', () => {
    const ids = SELECTION_AI_ACTIONS.map((action) => action.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('ask')

    for (const action of SELECTION_AI_ACTIONS) {
      const prompt = buildSelectionPrompt(action.id, 'Some selected text', 'Weekly plan')
      expect(prompt).toContain('Some selected text')
    }
  })

  it('quotes every line of the selection and keeps blank lines as empty quotes', () => {
    expect(quoteSelection('First line\n\nSecond line\r\n')).toBe('> First line\n>\n> Second line')
  })

  it('names the source note when a title is known', () => {
    expect(buildSelectionPrompt('summarise', 'Body', 'Weekly plan')).toContain('my note "Weekly plan"')
    expect(buildSelectionPrompt('summarise', 'Body')).not.toContain('my note')
  })

  it('caps very long selections', () => {
    const prompt = buildSelectionPrompt('summarise', 'x'.repeat(20000))
    expect(prompt.length).toBeLessThan(7000)
  })

  it('drafts an open-ended question about the passage', () => {
    const draft = buildSelectionDraft('Passage body', 'Weekly plan')
    expect(draft).toContain('About this passage')
    expect(draft).toContain('> Passage body')
    expect(draft.trimEnd().endsWith('> Passage body')).toBe(true)
  })

  it('resolves actions by id', () => {
    expect(getSelectionAIAction('tasks')?.label).toBe('Extract tasks')
    expect(getSelectionAIAction('nope')).toBeUndefined()
    expect(getSelectionAIAction(null)).toBeUndefined()
  })
})

describe('buildChatSystemPrompt', () => {
  it('returns the base prompt when nothing is focused', () => {
    expect(buildChatSystemPrompt(CHAT_SYSTEM_PROMPT)).toBe(CHAT_SYSTEM_PROMPT)
    expect(buildChatSystemPrompt(CHAT_SYSTEM_PROMPT, {})).toBe(CHAT_SYSTEM_PROMPT)
  })

  it('appends the focused note with its id and type', () => {
    const prompt = buildChatSystemPrompt(CHAT_SYSTEM_PROMPT, {
      noteId: 'note-1',
      noteTitle: 'Weekly plan',
      noteType: 'rich-text',
    })

    expect(prompt.startsWith(CHAT_SYSTEM_PROMPT)).toBe(true)
    expect(prompt).toContain('## Current focus')
    expect(prompt).toContain('"Weekly plan"')
    expect(prompt).toContain('(rich-text note)')
    expect(prompt).toContain('[id: note-1]')
  })

  it('works with an id but no title', () => {
    const prompt = buildChatSystemPrompt(CHAT_SYSTEM_PROMPT, { noteId: 'note-2' })
    expect(prompt).toContain('[id: note-2]')
    expect(prompt).toContain('## Current focus')
  })
})
