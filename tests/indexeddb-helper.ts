export const testDatabaseName = () => `script2prompt-test-${crypto.randomUUID()}`

// Keep the browser's real IndexedDB, recording writes and injecting one failed write.
export function recordingDatabase() {
  const control = { writes: [] as string[], failOnce: '' }
  const bound = (object: any, key: PropertyKey) => {
    const value = Reflect.get(object, key, object)
    return typeof value === 'function' ? value.bind(object) : value
  }
  const database = (db: IDBDatabase) => new Proxy(db, {
    get(target, key) {
      if (key !== 'transaction') return bound(target, key)
      return (...args: Parameters<IDBDatabase['transaction']>) => {
        const transaction = target.transaction(...args)
        return new Proxy(transaction, {
          get(tx, property) {
            if (property !== 'objectStore') return bound(tx, property)
            return (name: string) => new Proxy(tx.objectStore(name), {
              get(store, operation) {
                if (operation !== 'put' && operation !== 'delete') return bound(store, operation)
                return (...values: unknown[]) => {
                  const recordKey = String(values[operation === 'put' ? 1 : 0])
                  if (control.failOnce === recordKey) {
                    control.failOnce = ''
                    throw new DOMException('Test quota failure', 'QuotaExceededError')
                  }
                  control.writes.push(recordKey)
                  return (store[operation] as Function).apply(store, values)
                }
              },
            })
          },
          set(tx, property, value) { return Reflect.set(tx, property, value, tx) },
        })
      }
    },
    set(target, key, value) { return Reflect.set(target, key, value, target) },
  })
  const factory = new Proxy(indexedDB, {
    get(target, key) {
      if (key !== 'open') return bound(target, key)
      return (...args: Parameters<IDBFactory['open']>) => {
        const request = target.open(...args)
        return new Proxy(request, {
          get(req, property) { return property === 'result' ? database(req.result) : bound(req, property) },
          set(req, property, value) { return Reflect.set(req, property, value, req) },
        })
      }
    },
  })
  return { control, factory }
}

export async function databaseRecords(name: string, update?: (records: Map<string, string>) => void) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('records')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    return await new Promise<Map<string, string>>((resolve, reject) => {
      const transaction = database.transaction('records', update ? 'readwrite' : 'readonly')
      const store = transaction.objectStore('records')
      const records = new Map<string, string>()
      transaction.oncomplete = () => resolve(records)
      transaction.onabort = () => reject(transaction.error)
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        const entry = cursor.result
        if (entry) { records.set(String(entry.key), entry.value); entry.continue(); return }
        if (update) {
          const keys = [...records.keys()]
          update(records)
          for (const [key, value] of records) store.put(value, key)
          for (const key of keys) if (!records.has(key)) store.delete(key)
        }
      }
    })
  } finally { database.close() }
}
