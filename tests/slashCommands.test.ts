import { describe, it, expect } from 'vitest'
import {
  filterSlashCommands,
  groupSlashCommands,
  matchSlashTrigger,
  SLASH_CATEGORY_ORDER,
  SLASH_COMMANDS,
  SLASH_QUERY_MAX_LENGTH,
} from '../lib/editor/slashCommands'

describe('slashCommands', () => {
  describe('matchSlashTrigger', () => {
    it('ignores text without a slash trigger', () => {
      expect(matchSlashTrigger('')).toBeNull()
      expect(matchSlashTrigger('plain text')).toBeNull()
      expect(matchSlashTrigger('a / b')).toBeNull() // space after the slash
      expect(matchSlashTrigger('a/he')).toBeNull() // slash must be preceded by whitespace
      expect(matchSlashTrigger('path/to/file')).toBeNull()
    })

    it('matches a bare slash at the start of a line', () => {
      expect(matchSlashTrigger('/')).toEqual({ query: '', start: 0 })
      expect(matchSlashTrigger('/h')).toEqual({ query: 'h', start: 0 })
      expect(matchSlashTrigger('/heading 1')).toBeNull() // spaces end the query
    })

    it('matches after whitespace and reports the slash offset', () => {
      expect(matchSlashTrigger('hello /')).toEqual({ query: '', start: 6 })
      expect(matchSlashTrigger('hello /h1')).toEqual({ query: 'h1', start: 6 })
    })

    it('only looks at the current line', () => {
      expect(matchSlashTrigger('first /heading\nsecond')).toBeNull()
      expect(matchSlashTrigger('first\n/second')).toEqual({ query: 'second', start: 6 })
    })

    it('stops matching when a second slash or a long query shows up', () => {
      expect(matchSlashTrigger('/he/ho')).toBeNull()
      expect(matchSlashTrigger(`/${'q'.repeat(SLASH_QUERY_MAX_LENGTH)}`)).not.toBeNull()
      expect(matchSlashTrigger(`/${'q'.repeat(SLASH_QUERY_MAX_LENGTH + 1)}`)).toBeNull()
    })
  })

  describe('filterSlashCommands', () => {
    it('returns the whole catalogue for an empty query', () => {
      expect(filterSlashCommands('', SLASH_COMMANDS)).toEqual(SLASH_COMMANDS)
      expect(filterSlashCommands('   ', SLASH_COMMANDS)).toEqual(SLASH_COMMANDS)
    })

    it('ranks label matches above keyword matches', () => {
      expect(filterSlashCommands('bullet', SLASH_COMMANDS)[0].id).toBe('ul')
      expect(filterSlashCommands('todo', SLASH_COMMANDS)[0].id).toBe('checklist')
      expect(filterSlashCommands('hr', SLASH_COMMANDS)[0].id).toBe('divider')
      expect(filterSlashCommands('grid', SLASH_COMMANDS)[0].id).toBe('table')
    })

    it('covers every block the editor can insert', () => {
      const byId = (query: string) => filterSlashCommands(query, SLASH_COMMANDS)[0]?.id

      expect(byId('text')).toBe('paragraph')
      expect(byId('h6')).toBe('h6')
      expect(byId('link')).toBe('hyperlink')
      expect(byId('nl')).toBe('note-link')
      expect(byId('dst')).toBe('data-sheet-table')
      expect(byId('img')).toBe('image')
      expect(byId('attach')).toBe('file')
      expect(byId('pre')).toBe('code')
    })

    it('prefers an exact label match and stays case-insensitive', () => {
      expect(filterSlashCommands('quote', SLASH_COMMANDS)[0].id).toBe('quote')
      expect(filterSlashCommands('TABLE', SLASH_COMMANDS)[0].id).toBe('table')
      expect(filterSlashCommands('H1', SLASH_COMMANDS)[0].id).toBe('h1')
    })

    it('keeps catalogue order for equally good matches', () => {
      const ids = filterSlashCommands('heading', SLASH_COMMANDS).map((command) => command.id)
      expect(ids).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    })

    it('returns nothing for an unknown query', () => {
      expect(filterSlashCommands('zzz', SLASH_COMMANDS)).toEqual([])
    })
  })

  describe('groupSlashCommands', () => {
    it('splits the catalogue into ordered category sections', () => {
      const groups = groupSlashCommands(SLASH_COMMANDS)

      expect(groups.map((group) => group.category)).toEqual([
        'Text',
        'Headings',
        'Lists',
        'Content',
        'Media',
      ])
      expect(groups[1].commands.map((command) => command.id)).toEqual([
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
      ])
    })

    it('keeps every command exactly once and in catalogue order', () => {
      const flattened = groupSlashCommands(SLASH_COMMANDS).flatMap((group) => group.commands)

      expect(flattened).toHaveLength(SLASH_COMMANDS.length)
      expect(flattened.map((command) => command.id)).toEqual(
        SLASH_COMMANDS.map((command) => command.id)
      )
    })

    it('only emits sections that actually contain commands', () => {
      const headings = SLASH_COMMANDS.filter((command) => command.category === 'Headings')
      const groups = groupSlashCommands(headings)

      expect(groups).toHaveLength(1)
      expect(groups[0].category).toBe('Headings')
      expect(SLASH_CATEGORY_ORDER).toContain('Media')
    })
  })
})
