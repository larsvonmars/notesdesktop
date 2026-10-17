/**
 * Small IndexedDB wrapper used for the offline note cache and write-behind
 * queue. When IndexedDB is unavailable (SSR, tests, locked-down WebViews) it
 * transparently falls back to an in-memory store so callers never have to
 * branch on platform.
 */

export type OfflineStoreName = 'notes' | 'folders' | 'outbox'

interface StoredRow {
  id: string
}

const DB_NAME = 'mindviz-offline'
const DB_VERSION = 1
const ROW_STORES: OfflineStoreName[] = ['notes', 'folders', 'outbox']

const FORCE_MEMORY = process.env.NODE_ENV === 'test'

type MemoryState = {
  rows: Record<OfflineStoreName, Map<string, unknown>>
  meta: Map<string, unknown>
}

let memoryState: MemoryState | null = null
let databasePromise: Promise<IDBDatabase> | null = null
let indexedDbUnavailable = false

function createMemoryState(): MemoryState {
  return {
    rows: {
      notes: new Map(),
      folders: new Map(),
      outbox: new Map(),
    },
    meta: new Map(),
  }
}

function getMemoryState(): MemoryState {
  if (!memoryState) memoryState = createMemoryState()
  return memoryState
}

function canUseIndexedDb(): boolean {
  if (FORCE_MEMORY || indexedDbUnavailable) return false
  return typeof indexedDB !== 'undefined' && indexedDB !== null
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

function openDatabase(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }
  if (databasePromise) return databasePromise

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of ROW_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' })
        }
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open offline database'))
    request.onblocked = () => reject(new Error('Offline database upgrade blocked'))
  }).catch((error) => {
    indexedDbUnavailable = true
    databasePromise = null
    throw error
  })

  return databasePromise
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

async function withStore<T>(
  storeName: OfflineStoreName | 'meta',
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDatabase()
  const tx = db.transaction(storeName, mode)
  const store = tx.objectStore(storeName)
  const result = await operation(store)
  await transactionDone(tx)
  return result
}

export async function getAllRows<T>(storeName: OfflineStoreName): Promise<T[]> {
  if (!canUseIndexedDb()) {
    return Array.from(getMemoryState().rows[storeName].values()).map((row) => clone(row as T))
  }
  try {
    return await withStore(storeName, 'readonly', (store) => requestToPromise(store.getAll() as IDBRequest<T[]>))
  } catch {
    return Array.from(getMemoryState().rows[storeName].values()).map((row) => clone(row as T))
  }
}

export async function getRow<T>(storeName: OfflineStoreName, key: string): Promise<T | undefined> {
  if (!canUseIndexedDb()) {
    const value = getMemoryState().rows[storeName].get(key)
    return value === undefined ? undefined : clone(value as T)
  }
  try {
    return await withStore(storeName, 'readonly', (store) => requestToPromise(store.get(key) as IDBRequest<T | undefined>))
  } catch {
    const value = getMemoryState().rows[storeName].get(key)
    return value === undefined ? undefined : clone(value as T)
  }
}

export async function putRow<T extends StoredRow>(storeName: OfflineStoreName, row: T): Promise<void> {
  if (!canUseIndexedDb()) {
    getMemoryState().rows[storeName].set(row.id, clone(row))
    return
  }
  try {
    await withStore(storeName, 'readwrite', (store) => requestToPromise(store.put(row)))
  } catch {
    getMemoryState().rows[storeName].set(row.id, clone(row))
  }
}

export async function putRows<T extends StoredRow>(storeName: OfflineStoreName, rows: T[]): Promise<void> {
  if (rows.length === 0) return
  if (!canUseIndexedDb()) {
    const target = getMemoryState().rows[storeName]
    for (const row of rows) target.set(row.id, clone(row))
    return
  }
  try {
    await withStore(storeName, 'readwrite', async (store) => {
      for (const row of rows) store.put(row)
    })
  } catch {
    const target = getMemoryState().rows[storeName]
    for (const row of rows) target.set(row.id, clone(row))
  }
}

export async function deleteRow(storeName: OfflineStoreName, key: string): Promise<void> {
  if (!canUseIndexedDb()) {
    getMemoryState().rows[storeName].delete(key)
    return
  }
  try {
    await withStore(storeName, 'readwrite', (store) => requestToPromise(store.delete(key)))
  } catch {
    getMemoryState().rows[storeName].delete(key)
  }
}

export async function clearRows(storeName: OfflineStoreName): Promise<void> {
  if (!canUseIndexedDb()) {
    getMemoryState().rows[storeName].clear()
    return
  }
  try {
    await withStore(storeName, 'readwrite', (store) => requestToPromise(store.clear()))
  } catch {
    getMemoryState().rows[storeName].clear()
  }
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  if (!canUseIndexedDb()) {
    return getMemoryState().meta.get(key) as T | undefined
  }
  try {
    const record = await withStore('meta', 'readonly', (store) =>
      requestToPromise(store.get(key) as IDBRequest<{ key: string; value: T } | undefined>)
    )
    return record?.value
  } catch {
    return getMemoryState().meta.get(key) as T | undefined
  }
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  if (!canUseIndexedDb()) {
    getMemoryState().meta.set(key, value)
    return
  }
  try {
    await withStore('meta', 'readwrite', (store) => requestToPromise(store.put({ key, value })))
  } catch {
    getMemoryState().meta.set(key, value)
  }
}

export async function deleteMeta(key: string): Promise<void> {
  if (!canUseIndexedDb()) {
    getMemoryState().meta.delete(key)
    return
  }
  try {
    await withStore('meta', 'readwrite', (store) => requestToPromise(store.delete(key)))
  } catch {
    getMemoryState().meta.delete(key)
  }
}

export async function clearOfflineStorage(): Promise<void> {
  await Promise.all(ROW_STORES.map((store) => clearRows(store)))
  const metaKeys = ['notes.fullSyncedAt', 'notes.summarySyncedAt', 'folders.syncedAt']
  await Promise.all(metaKeys.map((key) => deleteMeta(key)))
}

/** Test helper: drop cached data and recreate the in-memory store. */
export function __resetOfflineStorageForTests(): void {
  memoryState = createMemoryState()
  indexedDbUnavailable = true
}
