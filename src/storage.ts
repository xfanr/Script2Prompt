import { assembleDataFiles, buildDataFiles, canonicalJson, parseDataFile } from './dataFiles'
import { createId, createInitialState, STORAGE_KEY } from './defaults'
import { normalizeAppState } from './stateNormalization'
import type { AppState, GlobalConfig } from './types'

export const STORE_PREFIX = 'script2prompt.files.v1.'
export const DATABASE_NAME = 'script2prompt.data.v1'
const RECORDS = 'records'
const DIRECTORY_KEY = `${STORE_PREFIX}directory`
const UI_KEY = `${STORE_PREFIX}ui`
const JOURNAL_KEY = `${STORE_PREFIX}transaction`
const SYNC_KEY = `${STORE_PREFIX}sync`
export interface FileBaseline { etag: string | null; title: string }
export interface SyncTarget {
  files: Record<string, FileBaseline>
  pendingDeletes: string[]
  lastCompleteAt: string | null
}
type SyncRegistry = Record<string, SyncTarget>
type SyncUpdate = { identity: string; update: (target: SyncTarget) => void }
type Records = Map<string, string>
const emptyTarget = (): SyncTarget => ({ files: {}, pendingDeletes: [], lastCompleteAt: null })

function readRegistry(records: Records): SyncRegistry {
  const value = JSON.parse(records.get(SYNC_KEY) ?? '{}') as SyncRegistry
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.values(value).some(target => !target || !target.files || !Array.isArray(target.pendingDeletes))) {
    throw new Error('本地同步记录损坏，请保留数据并恢复备份')
  }
  return value
}

function stateFromRecords(records: Records): AppState {
  const directory = JSON.parse(records.get(DIRECTORY_KEY) ?? 'null')
  if (directory?.formatVersion !== 1 || !Array.isArray(directory.paths)) throw new Error('本地分组目录格式无效')
  const files = new Map()
  for (const path of ['settings.json', 'ungrouped.json', ...directory.paths]) {
    if (typeof path !== 'string' || files.has(path)) throw new Error('本地分组目录重复或损坏')
    const raw = records.get(`${STORE_PREFIX}${path}`)
    if (raw === undefined) throw new Error(`本地文件缺失：${path}；原存档未被覆盖`)
    files.set(path, parseDataFile(raw, path))
  }
  readRegistry(records)
  return assembleDataFiles(files, JSON.parse(records.get(UI_KEY) ?? '{}'))
}

// Recover the old journal in memory, without writing into an already-full localStorage.
function legacyRecords(storage: Storage) {
  const records: Records = new Map()
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)!
    if (key.startsWith(STORE_PREFIX) || key === STORAGE_KEY) records.set(key, storage.getItem(key)!)
  }
  return records
}

function recoverLegacyRecords(source: Records) {
  const records = new Map(source)
  const raw = records.get(JOURNAL_KEY)
  if (raw) {
    const changes = JSON.parse(raw) as { key: string; before: string | null }[]
    if (!Array.isArray(changes) || changes.some(change => !change || typeof change.key !== 'string'
      || !change.key.startsWith(STORE_PREFIX) || change.key === JOURNAL_KEY
      || (change.before !== null && typeof change.before !== 'string'))) throw new Error('本地保存日志损坏，请保留浏览器数据并从备份恢复')
    for (const change of changes) {
      if (change.before === null) records.delete(change.key)
      else records.set(change.key, change.before)
    }
  }
  records.delete(JOURNAL_KEY)
  return records
}

export function readSyncTarget(repository: LocalRepository, identity: string) {
  return repository.readSyncTarget(identity)
}

export function updateSyncTarget(repository: LocalRepository, identity: string, update: (target: SyncTarget) => void) {
  return repository.updateSyncTarget(identity, update)
}

export class LocalRepository {
  private database: Promise<IDBDatabase> | null = null
  private directory: string | null = null
  private pending: Promise<unknown> = Promise.resolve()

  constructor(private legacyStorage: Storage, readonly databaseName = DATABASE_NAME, private factory: IDBFactory = indexedDB) {}

  private open() {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.factory.open(this.databaseName, 1)
        let blocked = false
        request.onupgradeneeded = () => request.result.createObjectStore(RECORDS)
        request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
        request.onblocked = () => { blocked = true; reject(new Error('其他标签页正在使用旧版数据库，请关闭后重试')) }
        request.onsuccess = () => {
          const database = request.result
          if (blocked) { database.close(); return }
          database.onversionchange = () => { database.close(); this.database = null }
          resolve(database)
        }
      }).catch(error => { this.database = null; throw error })
    }
    return this.database
  }

  // Native transactions commit the complete batch or leave the old records intact.
  private async transaction<T>(mode: IDBTransactionMode, action: (records: Records) => T): Promise<T> {
    const database = await this.open()
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(RECORDS, mode)
      const store = transaction.objectStore(RECORDS)
      const records: Records = new Map()
      let result: T
      let failure: unknown
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('本地数据库事务已中止'))
      transaction.onerror = () => { /* onabort reports the transaction error. */ }
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        try {
          const entry = cursor.result
          if (entry) { records.set(String(entry.key), entry.value); entry.continue(); return }
          const before = new Map(records)
          result = action(records)
          if (mode === 'readonly') return
          for (const [key, value] of records) if (before.get(key) !== value) store.put(value, key)
          for (const key of before.keys()) if (!records.has(key)) store.delete(key)
        } catch (error) { failure = error; transaction.abort() }
      }
    })
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.pending.then(action, action)
    this.pending = result.catch(() => {})
    return result
  }

  async close() {
    await this.pending
    if (this.database) (await this.database).close()
    this.database = null
  }

  load(defaultConfig: GlobalConfig): Promise<AppState> {
    return this.enqueue(async () => {
      const existing = await this.transaction('readonly', records => new Map(records))
      if (!existing.has(DIRECTORY_KEY)) {
        if (existing.size) throw new Error('本地数据库目录缺失，请保留数据并恢复备份')
        const source = legacyRecords(this.legacyStorage)
        const legacy = recoverLegacyRecords(source)
        const oldSnapshot = legacy.get(STORAGE_KEY)
        const state = legacy.has(DIRECTORY_KEY) ? stateFromRecords(legacy)
          : oldSnapshot ? normalizeAppState(JSON.parse(oldSnapshot), defaultConfig) : createInitialState(defaultConfig)
        const registry = readRegistry(legacy)
        const migrated = await this.transaction('readwrite', records => {
          if (records.has(DIRECTORY_KEY)) return null
          if (canonicalJson([...legacyRecords(this.legacyStorage)].sort()) !== canonicalJson([...source].sort())) {
            throw new Error('旧存档在迁移期间发生变化，请关闭其他标签页后重试')
          }
          records.set(SYNC_KEY, canonicalJson(registry))
          this.writeState(records, state, null)
          return new Map(records)
        })
        if (migrated) {
          const verified = await this.transaction('readonly', records => {
            for (const [key, value] of migrated) if (records.get(key) !== value) throw new Error('旧存档迁移校验失败，原存档已保留')
            return stateFromRecords(records)
          })
          // Only clean up this app's legacy keys after committed data passes validation.
          if (canonicalJson([...legacyRecords(this.legacyStorage)].sort()) === canonicalJson([...source].sort())) {
            this.legacyStorage.removeItem(DIRECTORY_KEY)
            for (const key of source.keys()) this.legacyStorage.removeItem(key)
          }
          this.directory = migrated.get(DIRECTORY_KEY)!
          return verified
        }
      }
      return this.transaction('readonly', records => {
        const state = stateFromRecords(records)
        this.directory = records.get(DIRECTORY_KEY)!
        return state
      })
    })
  }

  private writeState(records: Records, state: AppState, expected: string | null, syncUpdate?: SyncUpdate) {
    if ((records.get(DIRECTORY_KEY) ?? null) !== expected) throw new Error('其他标签页已更新本地数据，请刷新后继续编辑')
    const files = buildDataFiles(state)
    const paths = [...files.keys()].filter(path => path.startsWith('groups/'))
    const previousPaths: string[] = expected ? JSON.parse(expected).paths : []
    const registry = readRegistry(records)
    for (const target of Object.values(registry)) {
      target.pendingDeletes = target.pendingDeletes.filter(path => !paths.includes(path))
      for (const path of previousPaths) {
        if (!paths.includes(path) && target.files[path] && !target.pendingDeletes.includes(path)) target.pendingDeletes.push(path)
      }
    }
    if (syncUpdate) {
      const target = registry[syncUpdate.identity] ?? emptyTarget()
      syncUpdate.update(target)
      registry[syncUpdate.identity] = target
    }
    for (const [path, file] of files) records.set(`${STORE_PREFIX}${path}`, canonicalJson(file))
    for (const path of previousPaths) if (!files.has(path)) records.delete(`${STORE_PREFIX}${path}`)
    records.set(SYNC_KEY, canonicalJson(registry))
    const savedAt = new Date().toISOString()
    records.set(UI_KEY, canonicalJson({
      activeEpisodeId: state.activeEpisodeId, shotViewMode: state.shotViewMode,
      singleExpandedShotId: state.singleExpandedShotId, lastSavedAt: savedAt,
    }))
    const directory = canonicalJson({ formatVersion: 1, paths, revision: createId('revision') })
    records.set(DIRECTORY_KEY, directory)
    return { savedAt, directory }
  }

  save(state: AppState, syncUpdate?: SyncUpdate): Promise<string> {
    const snapshot = JSON.parse(JSON.stringify(state)) as AppState
    return this.enqueue(async () => {
      const saved = await this.transaction('readwrite', records => this.writeState(records, snapshot, this.directory, syncUpdate))
      this.directory = saved.directory
      return saved.savedAt
    })
  }

  readSyncTarget(identity: string): Promise<SyncTarget> {
    return this.enqueue(() => this.transaction('readonly', records => readRegistry(records)[identity] ?? emptyTarget()))
  }

  updateSyncTarget(identity: string, update: (target: SyncTarget) => void): Promise<SyncTarget> {
    return this.enqueue(() => this.transaction('readwrite', records => {
      const registry = readRegistry(records)
      const target = registry[identity] ?? emptyTarget()
      update(target)
      registry[identity] = target
      records.set(SYNC_KEY, canonicalJson(registry))
      return target
    }))
  }
}
