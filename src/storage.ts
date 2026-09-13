import { assembleDataFiles, buildDataFiles, canonicalJson, parseDataFile } from './dataFiles'
import { createInitialState, STORAGE_KEY } from './defaults'
import { normalizeAppState } from './stateNormalization'
import type { AppState, GlobalConfig } from './types'

export const STORE_PREFIX = 'script2prompt.files.v1.'
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
type Change = { key: string; before: string | null; after: string | null }

function setValue(storage: Storage, key: string, value: string | null) {
  if (value === null) storage.removeItem(key)
  else storage.setItem(key, value)
}

// A journal contains only changed records. A failed/interrupted multi-record save is rolled back.
export function recoverStorage(storage: Storage) {
  const raw = storage.getItem(JOURNAL_KEY)
  if (!raw) return
  const changes = JSON.parse(raw) as Change[]
  if (!Array.isArray(changes) || changes.some((change) => typeof change.key !== 'string'
    || !change.key.startsWith(STORE_PREFIX) || change.key === JOURNAL_KEY
    || (change.before !== null && typeof change.before !== 'string'))) throw new Error('本地保存日志损坏，请保留浏览器数据并从备份恢复')
  for (const change of changes) setValue(storage, change.key, change.before)
  storage.removeItem(JOURNAL_KEY)
}

export function commitStorage(storage: Storage, values: Map<string, string | null>) {
  recoverStorage(storage)
  const changes: Change[] = []
  for (const [key, after] of values) {
    const before = storage.getItem(key)
    if (before !== after) changes.push({ key, before, after })
  }
  if (!changes.length) return false
  storage.setItem(JOURNAL_KEY, JSON.stringify(changes))
  try {
    for (const change of changes) {
      setValue(storage, change.key, change.after)
      if (storage.getItem(change.key) !== change.after) throw new Error('保存校验失败')
    }
    storage.removeItem(JOURNAL_KEY)
  } catch (error) {
    recoverStorage(storage)
    throw error
  }
  return true
}

function readRegistry(storage: Storage): SyncRegistry {
  const raw = storage.getItem(SYNC_KEY)
  if (!raw) return {}
  const value = JSON.parse(raw) as SyncRegistry
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.values(value).some((target) => !target || !target.files || !Array.isArray(target.pendingDeletes))) {
    throw new Error('本地同步记录损坏，请保留数据并恢复备份')
  }
  return value
}

export function readSyncTarget(storage: Storage, identity: string): SyncTarget {
  return readRegistry(storage)[identity] ?? { files: {}, pendingDeletes: [], lastCompleteAt: null }
}

export function updateSyncTarget(storage: Storage, identity: string, update: (target: SyncTarget) => void) {
  const registry = readRegistry(storage)
  const target = registry[identity] ?? { files: {}, pendingDeletes: [], lastCompleteAt: null }
  update(target)
  registry[identity] = target
  commitStorage(storage, new Map([[SYNC_KEY, canonicalJson(registry)]]))
  return target
}

export class LocalRepository {
  private directory: string | null
  constructor(private storage: Storage) {
    recoverStorage(storage)
    this.directory = storage.getItem(DIRECTORY_KEY)
  }

  load(defaultConfig: GlobalConfig): AppState {
    if (this.directory) {
      const directory = JSON.parse(this.directory)
      if (directory.formatVersion !== 1 || !Array.isArray(directory.paths)) throw new Error('本地分组目录格式无效')
      const files = new Map()
      for (const path of ['settings.json', 'ungrouped.json', ...directory.paths]) {
        if (typeof path !== 'string' || files.has(path)) throw new Error('本地分组目录重复或损坏')
        const raw = this.storage.getItem(`${STORE_PREFIX}${path}`)
        if (raw === null) throw new Error(`本地文件缺失：${path}；原存档未被覆盖`)
        files.set(path, parseDataFile(raw, path))
      }
      const ui = JSON.parse(this.storage.getItem(UI_KEY) ?? '{}')
      return assembleDataFiles(files, ui)
    }
    const legacy = this.storage.getItem(STORAGE_KEY)
    const state = legacy ? normalizeAppState(JSON.parse(legacy), defaultConfig) : createInitialState(defaultConfig)
    // The legacy entry is deliberately retained. The directory is the migration completion marker.
    state.lastSavedAt = this.save(state)
    return state
  }

  save(state: AppState, syncUpdate?: { identity: string; update: (target: SyncTarget) => void }): string {
    if (this.storage.getItem(DIRECTORY_KEY) !== this.directory) throw new Error('其他标签页已更新本地数据，请刷新后继续编辑')
    const files = buildDataFiles(state)
    const paths = [...files.keys()].filter((path) => path.startsWith('groups/'))
    const previousPaths: string[] = this.directory ? JSON.parse(this.directory).paths : []
    const registry = readRegistry(this.storage)
    for (const target of Object.values(registry)) {
      target.pendingDeletes = target.pendingDeletes.filter((path) => !paths.includes(path))
      for (const path of previousPaths) {
        if (!paths.includes(path) && target.files[path] && !target.pendingDeletes.includes(path)) target.pendingDeletes.push(path)
      }
    }
    if (syncUpdate) {
      const target = registry[syncUpdate.identity] ?? { files: {}, pendingDeletes: [], lastCompleteAt: null }
      syncUpdate.update(target)
      registry[syncUpdate.identity] = target
    }
    const values = new Map<string, string | null>()
    for (const [path, file] of files) values.set(`${STORE_PREFIX}${path}`, canonicalJson(file))
    for (const path of previousPaths) if (!files.has(path)) values.set(`${STORE_PREFIX}${path}`, null)
    values.set(SYNC_KEY, canonicalJson(registry))
    const savedAt = new Date().toISOString()
    values.set(UI_KEY, canonicalJson({
      activeEpisodeId: state.activeEpisodeId, shotViewMode: state.shotViewMode,
      singleExpandedShotId: state.singleExpandedShotId, lastSavedAt: savedAt,
    }))
    // Last: the directory marks successful migration and detects other tabs' edits.
    const directory = canonicalJson({ formatVersion: 1, paths, revision: `${Date.now()}-${Math.random()}` })
    values.set(DIRECTORY_KEY, directory)
    commitStorage(this.storage, values)
    this.directory = directory
    return savedAt
  }
}
