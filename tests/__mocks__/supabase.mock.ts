/**
 * In-memory Supabase mock with enough PostgREST surface for the data layer:
 * projections, pagination, nullable filters, conditional updates and queue
 * flushes. Tests can toggle `__mockState.offline` to simulate a dead network.
 */

type Row = Record<string, any>

type Filter =
  | { kind: 'eq'; column: string; value: any }
  | { kind: 'neq'; column: string; value: any }
  | { kind: 'is'; column: string; value: any }
  | { kind: 'in'; column: string; values: any[] }
  | { kind: 'notIs'; column: string; value: any }

type OrderSpec = { column: string; ascending: boolean }

const DEFAULT_ROW: Row = {
  note_type: 'rich-text',
  position: 0,
  content: '',
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(): string {
  return `mock-${Math.random().toString(36).slice(2, 10)}`
}

function applyProjection(row: Row, columns: string | null): Row {
  if (!columns || columns.trim() === '*') return { ...row }
  const keys = columns.split(',').map((column) => column.trim()).filter(Boolean)
  const projected: Row = {}
  for (const key of keys) projected[key] = row[key]
  return projected
}

function matches(row: Row, filter: Filter): boolean {
  switch (filter.kind) {
    case 'eq':
      return row[filter.column] === filter.value
    case 'neq':
      return row[filter.column] !== filter.value
    case 'is':
      return (row[filter.column] ?? null) === filter.value
    case 'in':
      return filter.values.includes(row[filter.column])
    case 'notIs':
      return (row[filter.column] ?? null) !== filter.value
    default:
      return true
  }
}

class MockQuery implements PromiseLike<{ data: any; error: any; count?: number }> {
  private filters: Filter[] = []
  private orderSpec: OrderSpec[] = []
  private projection: string | null = null
  private selectOptions: { count?: string; head?: boolean } | null = null
  private limitCount: number | null = null
  private rangeSpec: { from: number; to: number } | null = null
  private orCondition: string | null = null
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | Row[] | null = null

  constructor(
    private readonly table: string,
    private readonly getRows: () => Row[],
    private readonly setRows: (rows: Row[]) => void
  ) {
    void this.table
  }

  select(columns: string | null = '*', options?: { count?: string; head?: boolean }) {
    this.projection = columns
    this.selectOptions = options ?? null
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderSpec.push({ column, ascending: options?.ascending !== false })
    return this
  }

  eq(column: string, value: any) {
    this.filters.push({ kind: 'eq', column, value })
    return this
  }

  neq(column: string, value: any) {
    this.filters.push({ kind: 'neq', column, value })
    return this
  }

  is(column: string, value: any) {
    this.filters.push({ kind: 'is', column, value })
    return this
  }

  in(column: string, values: any[]) {
    this.filters.push({ kind: 'in', column, values })
    return this
  }

  not(column: string, operator: string, value: any) {
    if (operator === 'is') this.filters.push({ kind: 'notIs', column, value })
    return this
  }

  or(condition: string) {
    this.orCondition = condition
    return this
  }

  limit(count: number) {
    this.limitCount = count
    return this
  }

  range(from: number, to: number) {
    this.rangeSpec = { from, to }
    return this
  }

  insert(payload: Row | Row[]) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  private execute(): { data: any; error: any; count?: number } {
    if (mockState.offline) {
      return { data: null, error: { message: 'Failed to fetch', name: 'TypeError' } }
    }
    if (mockState.nextError) {
      const error = mockState.nextError
      mockState.nextError = null
      return { data: null, error }
    }

    const rows = this.getRows()

    if (this.operation === 'insert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
      const inserted = incoming.map((row) => ({
        ...DEFAULT_ROW,
        id: row.id ?? makeId(),
        created_at: row.created_at ?? nowIso(),
        updated_at: row.updated_at ?? nowIso(),
        ...row,
      }))
      this.setRows([...rows, ...inserted])
      return { data: this.resultFor(inserted), error: null }
    }

    const matching = (row: Row) => this.filters.every((filter) => matches(row, filter))
    const selected = rows.filter(matching)
    const filtered = this.applyOrFilter(selected)

    if (this.operation === 'update') {
      const patch = this.payload as Row
      const updated: Row[] = []
      const next = rows.map((row) => {
        if (!filtered.includes(row)) return row
        const nextRow = {
          ...row,
          ...patch,
          updated_at: patch.updated_at ?? nowIso(),
        }
        updated.push(nextRow)
        return nextRow
      })
      this.setRows(next)
      return { data: this.resultFor(updated), error: null }
    }

    if (this.operation === 'delete') {
      this.setRows(rows.filter((row) => !filtered.includes(row)))
      return { data: null, error: null }
    }

    let result = this.applyOrFilter(selected)
    result = this.applyOrder(result)
    result = this.applyRange(result)

    if (this.selectOptions?.head && this.selectOptions.count === 'exact') {
      return { data: null, error: null, count: result.length }
    }

    return { data: this.resultFor(result), error: null }
  }

  private applyOrFilter(rows: Row[]): Row[] {
    if (!this.orCondition) return rows
    const match = this.orCondition.match(/%(.+?)%/)
    if (!match) return rows
    const term = match[1].toLowerCase()
    return rows.filter((row) => {
      const title = (row.title ?? '').toString().toLowerCase()
      const content = (row.content ?? '').toString().toLowerCase()
      return title.includes(term) || content.includes(term)
    })
  }

  private applyOrder(rows: Row[]): Row[] {
    if (this.orderSpec.length === 0) return rows
    return [...rows].sort((a, b) => {
      for (const spec of this.orderSpec) {
        const av = a[spec.column]
        const bv = b[spec.column]
        if (av === bv) continue
        if (av === null || av === undefined) return spec.ascending ? -1 : 1
        if (bv === null || bv === undefined) return spec.ascending ? 1 : -1
        if (av < bv) return spec.ascending ? -1 : 1
        if (av > bv) return spec.ascending ? 1 : -1
      }
      return 0
    })
  }

  private applyRange(rows: Row[]): Row[] {
    let result = rows
    if (this.rangeSpec) {
      result = result.slice(this.rangeSpec.from, this.rangeSpec.to + 1)
    }
    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount)
    }
    return result
  }

  private resultFor(rows: Row[]): Row[] {
    return rows.map((row) => applyProjection(row, this.projection))
  }

  private async runSingle(strict: boolean): Promise<{ data: any; error: any }> {
    const result = this.execute()
    if (result.error) return { data: null, error: result.error }

    const rows = result.data as Row[] | null
    if (!rows || rows.length === 0) {
      return strict
        ? { data: null, error: { code: 'PGRST116', message: 'No rows found' } }
        : { data: null, error: null }
    }
    return { data: rows[0], error: null }
  }

  single() {
    return this.runSingle(true)
  }

  maybeSingle() {
    return this.runSingle(false)
  }

  then<TResult1 = { data: any; error: any; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }
}

const mockState = {
  notes: [] as Row[],
  folders: [] as Row[],
  projects: [] as Row[],
  other: {} as Record<string, Row[]>,
  user: { id: 'user-1' } as { id: string } | null,
  offline: false,
  nextError: null as any,
}

function rowsForTable(table: string): Row[] {
  if (table === 'notes') return mockState.notes
  if (table === 'folders') return mockState.folders
  if (table === 'projects') return mockState.projects
  if (!mockState.other[table]) mockState.other[table] = []
  return mockState.other[table]
}

function setRowsForTable(table: string, rows: Row[]) {
  if (table === 'notes') mockState.notes = rows
  else if (table === 'folders') mockState.folders = rows
  else if (table === 'projects') mockState.projects = rows
  else mockState.other[table] = rows
}

export const supabase = {
  from(table: string) {
    return new MockQuery(table, () => rowsForTable(table), (rows) => setRowsForTable(table, rows))
  },
  auth: {
    async getUser() {
      return { data: { user: mockState.user } }
    },
    async getSession() {
      return {
        data: {
          session: mockState.user ? { user: mockState.user } : null,
        },
      }
    },
    async signOut() {
      mockState.user = null
    },
  },
  channel() {
    const channel = {
      on() {
        return channel
      },
      subscribe() {
        return channel
      },
    }
    return channel
  },
  removeChannel() {},
  __mockState: mockState,
  __resetMockState() {
    mockState.notes = []
    mockState.folders = []
    mockState.projects = []
    mockState.other = {}
    mockState.user = { id: 'user-1' }
    mockState.offline = false
    mockState.nextError = null
  },
}

;(globalThis as any).__supabase_mock = supabase
