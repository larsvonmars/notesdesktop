import { describe, it, expect } from 'vitest'
import {
  filterSlashOptions,
  resolveCommandHighlight,
  SLASH_COMMANDS,
  type SlashCommandDefinition,
} from '../lib/editor/slashCommands'
import {
  buildDataSheetTablePayload,
  resolveCell,
  resolveSheetData,
} from '../lib/editor/dataSheetSnapshot'

describe('filterSlashOptions', () => {
  const options = [
    { id: 'a', label: 'Weekly review', description: 'Journal' },
    { id: 'b', label: 'Roadmap', description: 'Planning', keywords: ['product', '2026'] },
    { id: 'c', label: 'Groceries' },
  ]

  it('returns everything for an empty query', () => {
    expect(filterSlashOptions('', options)).toEqual(options)
  })

  it('matches labels, keywords and the secondary line', () => {
    expect(filterSlashOptions('week', options).map((option) => option.id)).toEqual(['a'])
    expect(filterSlashOptions('product', options).map((option) => option.id)).toEqual(['b'])
    expect(filterSlashOptions('planning', options).map((option) => option.id)).toEqual(['b'])
  })

  it('prefers label matches over description matches', () => {
    const result = filterSlashOptions('road', options)
    expect(result.map((option) => option.id)).toEqual(['b'])
  })

  it('returns nothing for an unknown query', () => {
    expect(filterSlashOptions('zzz', options)).toEqual([])
  })
})

describe('resolveCommandHighlight', () => {
  const items: SlashCommandDefinition[] = SLASH_COMMANDS
  const indexOf = (id: string) => items.findIndex((item) => item.id === id)

  it('pre-highlights the last used command on a fresh open', () => {
    expect(
      resolveCommandHighlight({
        items,
        query: '',
        previousQuery: null,
        previousIndex: 0,
        lastUsedId: 'h3',
      })
    ).toBe(indexOf('h3'))
  })

  it('falls back to the first row when the remembered command is unknown or gone', () => {
    expect(
      resolveCommandHighlight({
        items,
        query: '',
        previousQuery: null,
        previousIndex: 4,
        lastUsedId: 'nope' as never,
      })
    ).toBe(0)
  })

  it('jumps to the best match when the query changes', () => {
    expect(
      resolveCommandHighlight({
        items,
        query: 'h2',
        previousQuery: 'h',
        previousIndex: 7,
        lastUsedId: 'divider',
      })
    ).toBe(0)
  })

  it('keeps the user position while the query does not change', () => {
    expect(
      resolveCommandHighlight({
        items,
        query: '',
        previousQuery: '',
        previousIndex: 5,
        lastUsedId: 'h3',
      })
    ).toBe(5)
  })

  it('returns to the remembered command when the query is emptied again', () => {
    expect(
      resolveCommandHighlight({
        items,
        query: '',
        previousQuery: 'quo',
        previousIndex: 0,
        lastUsedId: 'checklist',
      })
    ).toBe(indexOf('checklist'))
  })

  it('handles empty lists', () => {
    expect(
      resolveCommandHighlight({
        items: [],
        query: '',
        previousQuery: null,
        previousIndex: 3,
        lastUsedId: 'h1',
      })
    ).toBe(0)
  })
})

describe('dataSheetSnapshot', () => {
  it('resolves single cell references and leaves compound formulas visible', () => {
    const rows = [
      ['1', '2'],
      ['4', '5'],
    ]

    expect(resolveCell('plain', rows)).toBe('plain')
    expect(resolveCell('=A1', rows)).toBe('1')
    expect(resolveCell('=B2', rows)).toBe('5')
    // Only single references are evaluated (pre-existing resolver behaviour) —
    // compound expressions stay readable instead of turning into garbage.
    expect(resolveCell('=A1+B1', rows)).toBe('=A1+B1')
  })

  it('maps out-of-range and circular references to zero', () => {
    const rows = [['=C1'], ['=A2']]

    expect(resolveCell('=C1', rows)).toBe('0') // column C does not exist
    expect(resolveCell('=A2', rows)).toBe('0') // A2 -> A1 -> out of range
    expect(resolveCell('=Z9', rows)).toBe('0')

    const circular = [['=B1', '=A1']]
    expect(resolveCell('=B1', circular)).toBe('0') // must terminate
  })

  it('maps a sheet blob to columns and resolved rows', () => {
    const resolved = resolveSheetData({
      columns: [{ name: 'A' }, { name: 'B' }],
      rows: [
        ['1', '2'],
        ['=A1', '4'],
      ],
      headerRows: [0],
    } as never)

    expect(resolved.columns).toEqual(['A', 'B'])
    expect(resolved.rows).toEqual([
      ['1', '2'],
      ['1', '4'],
    ])
    expect(resolved.headerRows).toEqual([0])
  })

  describe('buildDataSheetTablePayload', () => {
    it('snapshots a sheet note', () => {
      const payload = buildDataSheetTablePayload({
        id: 'sheet-1',
        title: 'Budget',
        content: JSON.stringify({ columns: [{ name: 'Item' }, { name: 'Cost' }], rows: [['Coffee', '3']] }),
      })

      expect(payload).not.toBeNull()
      expect(payload!.sourceNoteId).toBe('sheet-1')
      expect(payload!.sourceNoteTitle).toBe('Budget')
      expect(payload!.columns).toEqual(['Item', 'Cost'])
      expect(payload!.rows).toEqual([['Coffee', '3']])
      expect(typeof payload!.snapshotAt).toBe('string')
    })

    it('falls back to a default title', () => {
      const payload = buildDataSheetTablePayload({
        id: 'sheet-2',
        title: null,
        content: JSON.stringify({ columns: [{ name: 'A' }], rows: [['1']] }),
      })

      expect(payload!.sourceNoteTitle).toBe('Data Sheet')
    })

    it('returns null for empty or broken content', () => {
      expect(buildDataSheetTablePayload({ id: 'x', content: '' })).toBeNull()
      expect(buildDataSheetTablePayload({ id: 'x', content: 'not json' })).toBeNull()
      expect(buildDataSheetTablePayload({ id: 'x', content: '{"rows":[]}' })).toBeNull()
    })
  })
})
