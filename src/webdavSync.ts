import { assembleDataFiles, buildDataFiles, canonicalJson, parseDataFile, type DataFile } from './dataFiles'
import { normalizeAppState } from './stateNormalization'
import { APP_VERSION, createInitialState } from './defaults'
import { normalizeGlobalConfigSnapshot } from './config'
import { readSyncTarget, updateSyncTarget, type SyncTarget } from './storage'
import { WebDavClient, WebDavError, type RemoteFile } from './webdav'
import type { AppState, GlobalConfig } from './types'

export interface TransferResult {
  path: string
  title: string
  status: 'uploaded' | 'downloaded' | 'unchanged' | 'deleted' | 'skipped' | 'failed'
  message: string
}
export interface TransferItem { path: string; title: string; reason: string }
export interface UploadOptions {
  storage: Storage
  identity: string
  confirmOverwrite: (items: TransferItem[]) => Promise<boolean>
  confirmDelete: (items: TransferItem[]) => Promise<boolean>
  onResult?: (result: TransferResult) => void
  isGroupPresent: (path: string) => boolean
}

export function dataFileTitle(path: string, file: DataFile) {
  return file.kind === 'settings' ? '全局设置' : file.group?.title ?? '未分组'
}

export async function uploadDataFiles(client: WebDavClient, files: Map<string, DataFile>, options: UploadOptions) {
  await client.ensureDirectories()
  const baseline = readSyncTarget(options.storage, options.identity)
  const plans: { path: string; title: string; text: string; remote: RemoteFile | null; conflict: boolean; same: boolean }[] = []
  const results: TransferResult[] = []
  const report = (result: TransferResult) => { results.push(result); options.onResult?.(result) }
  for (const [path, file] of files) {
    const title = dataFileTitle(path, file)
    try {
      const remote = await client.read(path)
      const text = canonicalJson(file)
      let same = false
      try { same = remote !== null && canonicalJson(JSON.parse(remote.text)) === text } catch { /* Corrupt remote content requires confirmation. */ }
      const known = baseline.files[path]
      const conflict = !same && (remote
        ? !remote.etag || !known?.etag || remote.etag !== known.etag
        : Boolean(known))
      plans.push({ path, title, text, remote, conflict, same })
    } catch (error) { report(failed(path, title, error)) }
  }
  const conflicts = plans.filter((plan) => plan.conflict).map((plan) => ({
    path: plan.path, title: plan.title,
    reason: plan.remote ? '云端已有不同内容或已被其他设备更新' : '云端文件已删除，本次将重新创建',
  }))
  const overwrite = !conflicts.length || await options.confirmOverwrite(conflicts)
  // Settings last; profile bindings in group files use stable slots, not settings IDs.
  plans.sort((a, b) => Number(a.path === 'settings.json') - Number(b.path === 'settings.json'))
  for (const plan of plans) {
    const { path, title } = plan
    if (plan.conflict && !overwrite) {
      report({ path, title, status: 'skipped', message: '已取消覆盖' })
      continue
    }
    try {
      const saved = plan.same ? plan.remote! : await client.write(path, plan.text, plan.remote)
      updateSyncTarget(options.storage, options.identity, (target) => {
        target.files[path] = { etag: saved.etag, title }
        if (path.startsWith('groups/') && !options.isGroupPresent(path) && !target.pendingDeletes.includes(path)) target.pendingDeletes.push(path)
      })
      report({ path, title, status: plan.same ? 'unchanged' : 'uploaded', message: plan.same ? '内容相同，未上传' : '已上传并校验' })
    } catch (error) { report(failed(path, title, error)) }
  }

  const deletionPlans: { path: string; title: string; remote: RemoteFile }[] = []
  const current = readSyncTarget(options.storage, options.identity)
  for (const path of current.pendingDeletes) {
    if (!path.startsWith('groups/') || options.isGroupPresent(path)) continue
    const title = current.files[path]?.title ?? path
    try {
      const remote = await client.read(path)
      if (remote) deletionPlans.push({ path, title, remote })
      else {
        clearDeleted(options, path)
        report({ path, title, status: 'deleted', message: '云端文件已不存在' })
      }
    } catch (error) { report(failed(path, title, error)) }
  }
  // Do not remove the only cloud copy after an unsuccessful upload (e.g. moving episodes out of a group).
  const uploadsComplete = !results.some((result) => result.status === 'failed' || result.status === 'skipped')
  const deleteConfirmed = uploadsComplete && deletionPlans.length > 0 && await options.confirmDelete(deletionPlans.map((plan) => ({
    path: plan.path, title: plan.title,
    reason: current.files[plan.path]?.etag !== plan.remote.etag || !plan.remote.etag
      ? '云端版本已变化，请确认是否仍要删除' : '本地已删除，确认删除云端文件后无法通过本应用恢复',
  })))
  for (const plan of deletionPlans) {
    const { path, title } = plan
    if (!deleteConfirmed || options.isGroupPresent(path)) {
      report({ path, title, status: 'skipped', message: uploadsComplete ? '已保留云端文件和待删除记录' : '上传未完成，暂不删除云端文件' })
      continue
    }
    try {
      await client.remove(path, plan.remote)
      clearDeleted(options, path)
      report({ path, title, status: 'deleted', message: '已删除云端文件' })
    } catch (error) { report(failed(path, title, error)) }
  }
  const complete = results.every((result) => result.status !== 'failed' && result.status !== 'skipped')
  if (complete) updateSyncTarget(options.storage, options.identity, (target) => { target.lastCompleteAt = new Date().toISOString() })
  return { complete, results }
}

function clearDeleted(options: UploadOptions, path: string) {
  updateSyncTarget(options.storage, options.identity, (target) => {
    delete target.files[path]
    target.pendingDeletes = target.pendingDeletes.filter((item) => item !== path)
  })
}

function failed(path: string, title: string, error: unknown): TransferResult {
  return { path, title, status: 'failed', message: error instanceof Error ? error.message : '传输失败' }
}

async function remotePaths(client: WebDavClient) {
  const root = await client.list()
  if (root === null) throw new WebDavError('云端尚无新格式数据，请先上传或迁移旧文件', 404)
  if (!root.some((item) => item.path === 'settings.json' && !item.collection)
    || !root.some((item) => item.path === 'ungrouped.json' && !item.collection)
    || !root.some((item) => item.path === 'groups/' && item.collection)) throw new WebDavError('云端数据不完整，缺少设置、未分组文件或分组目录')
  const entries = await client.list('groups/')
  if (entries === null) throw new WebDavError('云端分组目录缺失')
  return ['settings.json', 'ungrouped.json', ...entries.filter((entry) => !entry.collection && entry.path.endsWith('.json')).map((entry) => `groups/${entry.path}`)].sort()
}

export async function downloadDataFiles(client: WebDavClient) {
  const paths = await remotePaths(client)
  const files = new Map<string, DataFile>()
  const remote = new Map<string, RemoteFile>()
  for (const path of paths) {
    const file = await client.read(path)
    if (!file) throw new WebDavError(`下载期间文件已删除：${path}`)
    files.set(path, parseDataFile(file.text, path))
    remote.set(path, file)
  }
  const settings = files.get('settings.json')!
  if (settings.kind !== 'settings') throw new WebDavError('全局设置格式无效')
  assembleDataFiles(files, createInitialState(settings.globalConfig))
  if (JSON.stringify(paths) !== JSON.stringify(await remotePaths(client))) throw new WebDavError('下载期间云端目录发生变化，请重试', 412)
  for (const [path, observed] of remote) {
    const latest = await client.read(path)
    if (!latest || latest.etag !== observed.etag || latest.text !== observed.text) throw new WebDavError(`下载期间文件发生变化：${path}，请重试`, 412)
  }
  return { files, remote }
}

export function acceptDownloadedFiles(target: SyncTarget, files: Map<string, DataFile>, remote: Map<string, RemoteFile>) {
  for (const [path, file] of files) {
    target.files[path] = { etag: remote.get(path)!.etag, title: dataFileTitle(path, file) }
  }
  target.pendingDeletes = target.pendingDeletes.filter((path) => !files.has(path))
  target.lastCompleteAt = new Date().toISOString()
}

export function legacySnapshotFiles(text: string, defaultConfig: GlobalConfig) {
  const payload = JSON.parse(text)
  if (!payload || !payload.globalConfigSnapshot || (!Array.isArray(payload.episodes) && !payload.episode)) throw new WebDavError('旧版同步文件格式无效')
  const version = payload.version ?? 1
  if (!Number.isInteger(version) || version < 1 || version > APP_VERSION) throw new WebDavError('旧版同步文件版本不受支持')
  const config = normalizeGlobalConfigSnapshot(payload.globalConfigSnapshot, version, defaultConfig)
  if (!config) throw new WebDavError('旧版同步文件中的设置无效')
  // Generated compatibility IDs must be deterministic so interrupted migrations can resume.
  if (!payload.globalConfigSnapshot.prompt?.profiles) {
    const activeIndex = config.prompt.profiles.findIndex((profile) => profile.id === config.prompt.activeProfileId)
    config.prompt.profiles.forEach((profile, index) => { profile.id = `legacy-profile-slot-${index}` })
    config.prompt.activeProfileId = config.prompt.profiles[Math.max(0, activeIndex)].id
  }
  const state = normalizeAppState({
    ...createInitialState(defaultConfig), version: APP_VERSION,
    globalConfig: config, episodeGroups: payload.episodeGroups ?? [],
    episodes: payload.episodes ?? [payload.episode],
  }, defaultConfig)
  const originalEpisodes = payload.episodes ?? [payload.episode]
  for (const episode of state.episodes) {
    const original = originalEpisodes.find((item: { id: string }) => item.id === episode.id)
    for (const shot of episode.shots) {
      const ids = new Set(original?.shots?.find((item: { id: string }) => item.id === shot.id)?.timingSegments?.map((item: { id: string }) => item.id) ?? [])
      shot.timingSegments.forEach((segment, index) => {
        if (!ids.has(segment.id)) segment.id = `legacy-timing-${shot.id}-${index}`
      })
    }
  }
  const files = buildDataFiles(state)
  for (const [path, file] of files) parseDataFile(canonicalJson(file), path)
  return files
}

export async function migrateLegacyFiles(client: WebDavClient, files: Map<string, DataFile>, onResult: (result: TransferResult) => void) {
  // Permit resuming identical partial output, but never overwrite different target data.
  const root = await client.list()
  const groups = root ? await client.list('groups/') : null
  const existing = new Set<string>()
  for (const entry of root ?? []) {
    if (!entry.collection && entry.path === encodeURIComponent(client.settings.legacyFilename)) continue
    if (entry.collection && entry.path === 'groups/') continue
    if (entry.collection || !files.has(entry.path)) throw new WebDavError('新同步目录已有不同数据，请使用空目录进行旧文件迁移')
    existing.add(entry.path)
  }
  for (const entry of groups ?? []) {
    const path = `groups/${entry.path}`
    if (entry.collection || !files.has(path)) throw new WebDavError('新同步目录已有不同数据，请使用空目录进行旧文件迁移')
    existing.add(path)
  }
  for (const path of existing) {
    const file = await client.read(path)
    if (!file || canonicalJson(JSON.parse(file.text)) !== canonicalJson(files.get(path))) throw new WebDavError(`目标文件已有不同数据，迁移已停止：${path}`)
  }
  await client.ensureDirectories()
  const results: TransferResult[] = []
  for (const [path, file] of files) {
    const title = dataFileTitle(path, file)
    let result: TransferResult
    try {
      if (!existing.has(path)) await client.write(path, canonicalJson(file), null)
      result = { path, title, status: existing.has(path) ? 'unchanged' : 'uploaded', message: '已迁移；旧文件保留' }
    } catch (error) { result = failed(path, title, error) }
    results.push(result)
    onResult(result)
  }
  return results
}
