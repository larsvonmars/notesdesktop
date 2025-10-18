type Row = Record<string, any>

class MockQuery {
  result: any
  selectOptions: any | null = null
  inserted: any = null
  filter: { column?: string, value?: any } | null = null

  constructor(result: any) {
    this.result = result
  }

  select(_cols?: any, options?: any) {
    this.selectOptions = options || null
    return this
  }

  order() { return this }
  eq(column?: string, value?: any) {
    if (column) this.filter = { column, value }
    return this
  }
  is(column?: string, value?: any) {
    if (column) this.filter = { column, value }
    return this
  }

  or(condition?: string) {
    // naive parser: look for the %term% and filter by title or content containing term
    if (!condition) return this
    const match = condition.match(/%(.+?)%/)
    if (!match) return this
    const term = match[1].toLowerCase()
    if (Array.isArray(this.result)) {
      this.result = this.result.filter((r: any) => {
        const title = (r.title || '').toString().toLowerCase()
        const content = (r.content || '').toString().toLowerCase()
        return title.includes(term) || content.includes(term)
      })
    }
    return this
  }

  insert(obj: any) {
    // simulate insert by returning the provided object
    this.inserted = { ...obj, id: obj.id ?? 'new-id', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    // also push into result array for subsequent selects
    if (Array.isArray(this.result)) this.result.push(this.inserted)
    return this
  }

  update(obj: any) {
    // apply update using previously set filter if available
    if (Array.isArray(this.result)) {
      if (this.filter && this.filter.column) {
        const col = this.filter.column
        const val = this.filter.value
        for (let i = 0; i < this.result.length; i++) {
          if (this.result[i][col] === val) {
            this.result[i] = { ...this.result[i], ...obj }
          }
        }
      } else if (obj && (obj as any).id) {
        const idx = this.result.findIndex((r: any) => r.id === (obj as any).id)
        if (idx >= 0) this.result[idx] = { ...this.result[idx], ...obj }
      }
    }
    this.inserted = obj
    return this
  }

  delete() { return this }

  // called in code as .single()
  single() {
    let data
    if (this.inserted) data = this.inserted
    else if (this.filter && Array.isArray(this.result)) {
      const col = this.filter.column as string
      const val = this.filter.value
      const found = this.result.find((r: any) => r[col] === val)
      data = found ?? null
    } else data = Array.isArray(this.result) ? this.result[0] : this.result

    return Promise.resolve({ data, error: null })
  }

  // make the builder awaitable: await query -> { data, error, count? }
  then(resolve: (value?: any) => void) {
    // apply filter if set
    let data = this.result
    if (this.filter && Array.isArray(this.result)) {
      const col = this.filter.column as string
      const val = this.filter.value
      data = this.result.filter((r: any) => r[col] === val)
    }

    if (this.selectOptions && this.selectOptions.head && this.selectOptions.count === 'exact') {
      resolve({ count: Array.isArray(data) ? data.length : 0, error: null })
    } else {
      resolve({ data, error: null })
    }
  }
}

// A minimal supabase mock object and a way to configure responses in tests
const mockState = {
  notes: [] as Row[],
  user: { id: 'user-1' },
}

export const supabase = {
  from(table: string) {
    if (table === 'notes') {
      return new MockQuery(mockState.notes)
    }
    return new MockQuery([])
  },
  auth: {
    async getUser() {
      return { data: { user: mockState.user } }
    }
  },
  // simple channel mock
  channel() { return { on() { return this }, subscribe() { return this } } },
  removeChannel() {},
  __mockState: mockState,
}

// Expose on global for tests to configure
;(globalThis as any).__supabase_mock = supabase
