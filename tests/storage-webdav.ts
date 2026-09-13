import { buildDataFiles, canonicalJson, groupFilePath, mergeDownloadedFiles, parseDataFile } from '../src/dataFiles'
import { createEpisode, createEpisodeGroup, createInitialState, STORAGE_KEY } from '../src/defaults'
import { normalizeGlobalConfig } from '../src/config'
import { LocalRepository, STORE_PREFIX, readSyncTarget, updateSyncTarget, recoverStorage } from '../src/storage'
import { WebDavClient, parseWebDavListing, type WebDavSettings } from '../src/webdav'
import { acceptDownloadedFiles, downloadDataFiles, legacySnapshotFiles, migrateLegacyFiles, uploadDataFiles, type UploadOptions } from '../src/webdavSync'
import type { AppState, GlobalConfig } from '../src/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
async function rejects(action: () => unknown | Promise<unknown>, message: string) {
  let failed = false
  try { await action() } catch { failed = true }
  assert(failed, message)
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

class MemoryStorage implements Storage {
  data = new Map<string, string>()
  writes: string[] = []
  failOnce = ''
  get length() { return this.data.size }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  getItem(key: string) { return this.data.get(key) ?? null }
  removeItem(key: string) { this.data.delete(key) }
  clear() { this.data.clear() }
  setItem(key: string, value: string) {
    if (key === this.failOnce) { this.failOnce = ''; throw new DOMException('Quota exceeded', 'QuotaExceededError') }
    this.writes.push(key)
    this.data.set(key, value)
  }
}

const settings: WebDavSettings = {
  baseUrl: 'http://localhost/dav/scripts/', username: 'test', password: 'test',
  legacyFilename: 'legacy.json', lastSyncedAt: null,
}
const identity = 'test-target'
export class MockDav {
  files = new Map<string, { text: string; etag: string }>()
  collections = new Set([''])
  calls: { method: string; path: string; headers: Headers }[] = []
  errors = new Map<string, number>()
  withEtag = true
  version = 0
  hook?: (method: string, path: string) => void
  set(path: string, text: string) { this.files.set(path, { text, etag: `"v${++this.version}"` }) }
  request: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    const relative = url.pathname.slice('/dav/scripts/'.length)
    const path = relative === 'legacy.json' ? '@legacy' : relative
    const method = init.method ?? 'GET'
    const headers = new Headers(init.headers)
    this.calls.push({ method, path, headers })
    this.hook?.(method, path)
    const error = this.errors.get(`${method}:${path}`)
    if (error) return new Response(null, { status: error })
    const file = this.files.get(path)
    if (method === 'GET') return file
      ? new Response(file.text, { headers: this.withEtag ? { etag: file.etag } : {} })
      : new Response(null, { status: 404 })
    if (method === 'MKCOL') {
      this.collections.add(path)
      return new Response(null, { status: 201 })
    }
    if (method === 'PROPFIND') {
      if (!this.collections.has(path)) return new Response(null, { status: 404 })
      const entries: [string, boolean][] = [[path, true]]
      if (headers.get('Depth') === '1') {
        for (const name of this.collections) if (name !== path && name.startsWith(path) && !name.slice(path.length).replace(/\/$/, '').includes('/')) entries.push([name, true])
        for (const name of this.files.keys()) {
          const listed = name === '@legacy' ? 'legacy.json' : name
          if (listed.startsWith(path) && !listed.slice(path.length).includes('/')) entries.push([listed, false])
        }
      }
      const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${entries.map(([name, collection]) => `<d:response><d:href>/dav/scripts/${name}</d:href><d:propstat><d:prop><d:resourcetype>${collection ? '<d:collection/>' : ''}</d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join('')}</d:multistatus>`
      return new Response(xml, { status: 207 })
    }
    if (headers.get('If-None-Match') === '*' && file) return new Response(null, { status: 412 })
    if (headers.has('If-Match') && headers.get('If-Match') !== file?.etag) return new Response(null, { status: 412 })
    if (method === 'PUT') {
      this.set(path, String(init.body))
      return new Response(null, { status: 201, headers: this.withEtag ? { etag: this.files.get(path)!.etag } : {} })
    }
    if (method === 'DELETE') { this.files.delete(path); return new Response(null, { status: 204 }) }
    return new Response(null, { status: 405 })
  }
  client() { return new WebDavClient(settings, this.request) }
}

export async function runTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  assert(config, 'default config')
  const results: { name: string; passed: boolean; error?: string }[] = []
  const test = async (name: string, action: () => unknown | Promise<unknown>) => {
    try { await action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: error instanceof Error ? error.stack : String(error) }) }
  }
  function fixture() {
    const state = createInitialState(config)
    const a = createEpisodeGroup(config.prompt.profiles[0].id)
    const b = createEpisodeGroup(config.prompt.profiles[1].id)
    a.title = 'Group A'; b.title = 'Group B'; b.archived = true
    state.episodeGroups = [a, b]
    state.episodes = [createEpisode(1), createEpisode(2), createEpisode(3)]
    state.episodes[0].groupId = a.id
    state.episodes[1].groupId = b.id
    state.activeEpisodeId = state.episodes[0].id
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    const repository = new LocalRepository(storage)
    const loaded = repository.load(config)
    return { state: loaded, storage, repository, a: groupFilePath(a.id), b: groupFilePath(b.id) }
  }
  function options(storage: MemoryStorage, state: AppState, overrides: Partial<UploadOptions> = {}): UploadOptions {
    return { storage, identity, confirmOverwrite: async () => true, confirmDelete: async () => true,
      isGroupPresent: (path) => state.episodeGroups.some((group) => groupFilePath(group.id) === path), ...overrides }
  }
  const upload = (dav: MockDav, f: ReturnType<typeof fixture>, overrides: Partial<UploadOptions> = {}) =>
    uploadDataFiles(dav.client(), buildDataFiles(f.state), options(f.storage, f.state, overrides))

  await test('Legacy migration retains original, IDs, archived groups and independent files', () => {
    const f = fixture()
    const old = JSON.parse(f.storage.getItem(STORAGE_KEY)!)
    const loaded = new LocalRepository(f.storage).load(config)
    assert(canonicalJson(loaded.episodes.map((e) => e.id).sort()) === canonicalJson(old.episodes.map((e: { id: string }) => e.id).sort()), 'episode ID changed')
    assert(loaded.episodeGroups[1].archived, 'archive lost')
    assert(f.storage.getItem(`${STORE_PREFIX}${f.a}`), 'group record missing')
    assert(!f.storage.getItem(`${STORE_PREFIX}settings.json`)!.includes('episodes'), 'settings contains episodes')
    assert(JSON.stringify(old) === f.storage.getItem(STORAGE_KEY), 'old snapshot changed')
  })
  await test('Editing settings writes no groups; editing one episode writes only its group', () => {
    const f = fixture()
    f.storage.writes = []
    f.state.globalConfig.dataCollection.defaultPointCost += 1
    f.repository.save(f.state)
    assert(!f.storage.writes.some((key) => key.includes('groups/') || key.endsWith('ungrouped.json')), 'settings rewrote groups')
    f.storage.writes = []
    f.state.episodes[0].scriptText = 'changed'
    f.repository.save(f.state)
    assert(f.storage.writes.includes(`${STORE_PREFIX}${f.a}`), 'edited group not written')
    assert(!f.storage.writes.includes(`${STORE_PREFIX}${f.b}`), 'other group rewritten')
    assert(!f.storage.writes.includes(`${STORE_PREFIX}settings.json`), 'episode rewrote settings')
  })
  await test('Moving episode updates both records and rolls back on quota failure', async () => {
    const f = fixture()
    const previous = canonicalJson(new LocalRepository(f.storage).load(config))
    f.state.episodes[0].groupId = f.state.episodeGroups[1].id
    f.storage.failOnce = `${STORE_PREFIX}${f.b}`
    await rejects(() => f.repository.save(f.state), 'quota must fail')
    assert(canonicalJson(new LocalRepository(f.storage).load(config)) === previous, 'partial save remained')
    f.repository.save(f.state)
    assert(new LocalRepository(f.storage).load(config).episodes.filter((e) => e.groupId === f.state.episodeGroups[1].id).length === 2, 'move missing')
  })
  await test('Interrupted transaction is rolled back; migration failure retains old snapshot', async () => {
    const f = fixture()
    const key = `${STORE_PREFIX}${f.a}`
    const before = f.storage.getItem(key)
    f.storage.setItem(`${STORE_PREFIX}transaction`, JSON.stringify([{ key, before, after: 'broken' }]))
    f.storage.setItem(key, 'broken')
    recoverStorage(f.storage)
    assert(f.storage.getItem(key) === before, 'journal not recovered')
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(f.state))
    storage.failOnce = `${STORE_PREFIX}${f.b}`
    await rejects(() => new LocalRepository(storage).load(config), 'migration should fail')
    assert(storage.getItem(STORAGE_KEY) && !storage.getItem(`${STORE_PREFIX}directory`), 'failed migration marked complete')
    new LocalRepository(storage).load(config)
  })
  await test('Other tab writes are detected; corrupt files never fall back to stale legacy data', async () => {
    const f = fixture()
    const other = new LocalRepository(f.storage)
    f.state.episodes[0].scriptText = 'new'
    f.repository.save(f.state)
    await rejects(() => other.save(f.state), 'stale tab write accepted')
    f.storage.setItem(`${STORE_PREFIX}${f.a}`, '{broken')
    await rejects(() => new LocalRepository(f.storage).load(config), 'corrupt file replaced with defaults')
    assert(f.storage.getItem(STORAGE_KEY), 'legacy removed')
  })
  await test('Initial upload creates per-group files; repeat upload performs no PUT', async () => {
    const f = fixture(), dav = new MockDav()
    assert((await upload(dav, f)).complete, 'initial upload failed')
    assert(dav.files.size === 4 && dav.collections.has('groups/'), 'wrong file layout')
    dav.calls = []
    assert((await upload(dav, f)).complete, 'repeat failed')
    assert(!dav.calls.some((call) => call.method === 'PUT'), 'unchanged files uploaded')
    assert(readSyncTarget(f.storage, identity).lastCompleteAt, 'complete timestamp missing')
  })
  await test('Download retains IDs, local-only groups and profile slot binding', async () => {
    const f = fixture(), dav = new MockDav()
    await upload(dav, f)
    const local = fixture().state
    const oldIds = local.episodeGroups.map((group) => group.id)
    const downloaded = await downloadDataFiles(dav.client())
    const next = mergeDownloadedFiles(local, downloaded.files)
    assert(oldIds.every((id) => next.episodeGroups.some((group) => group.id === id)), 'local-only group lost')
    assert(next.episodes.some((e) => e.id === f.state.episodes[0].id), 'remote ID regenerated')
    assert(next.episodeGroups.find((g) => g.id === f.state.episodeGroups[1].id)?.promptProfileId === config.prompt.profiles[1].id, 'slot binding lost')
  })
  await test('Two-device edits conflict only on changed remote group; other uploads continue', async () => {
    const a = fixture(), dav = new MockDav()
    await upload(dav, a)
    const b = fixture()
    const downloaded = await downloadDataFiles(dav.client())
    b.state = mergeDownloadedFiles(a.state, downloaded.files)
    b.repository.save(b.state, { identity, update: (target) => acceptDownloadedFiles(target, downloaded.files, downloaded.remote) })
    a.state.episodes[0].scriptText = 'Device A'
    await upload(dav, a)
    b.state.episodes.find((episode) => episode.groupId === a.state.episodeGroups[1].id)!.scriptText = 'Device B'
    let conflicts: string[] = []
    const result = await upload(dav, b, { confirmOverwrite: async (items) => { conflicts = items.map((item) => item.path); return false } })
    assert(!result.complete && conflicts.length === 1 && conflicts[0] === a.a, 'wrong conflicts')
    assert(dav.files.get(a.b)!.text.includes('Device B'), 'independent group upload did not continue')
    assert(dav.files.get(a.a)!.text.includes('Device A'), 'remote change overwritten')
  })
  await test('Conditional PUT prevents a change made after overwrite confirmation', async () => {
    const f = fixture(), dav = new MockDav()
    await upload(dav, f)
    dav.set(f.a, dav.files.get(f.a)!.text.replace('Group A', 'Remote'))
    f.state.episodeGroups[0].title = 'Local'
    const result = await upload(dav, f, { confirmOverwrite: async () => {
      dav.set(f.a, dav.files.get(f.a)!.text.replace('Remote', 'Newest'))
      return true
    } })
    assert(result.results.some((r) => r.path === f.a && r.status === 'failed'), 'race not rejected')
    assert(dav.files.get(f.a)!.text.includes('Newest'), 'new version overwritten')
  })
  await test('Missing ETag never allows silent overwrite', async () => {
    const f = fixture(), dav = new MockDav()
    dav.withEtag = false
    await upload(dav, f)
    f.state.episodeGroups[0].title = 'changed'
    dav.calls = []
    const result = await upload(dav, f)
    assert(result.results.some((r) => r.path === f.a && r.status === 'failed' && r.message.includes('ETag')), 'missing ETag accepted')
    assert(!dav.calls.some((c) => c.method === 'PUT' && c.path === f.a), 'unsafe PUT sent')
  })
  await test('Partial upload preserves successes and retries only unfinished files', async () => {
    const f = fixture(), dav = new MockDav()
    dav.errors.set(`PUT:${f.b}`, 500)
    assert(!(await upload(dav, f)).complete, 'partial operation marked complete')
    assert(readSyncTarget(f.storage, identity).lastCompleteAt === null, 'partial operation timestamp updated')
    assert(readSyncTarget(f.storage, identity).files[f.a], 'successful baseline lost')
    dav.errors.clear(); dav.calls = []
    assert((await upload(dav, f)).complete, 'retry failed')
    assert(dav.calls.filter((c) => c.method === 'PUT').length === 1, 'successful files retransmitted')
  })
  await test('Deleted group is tracked per target; cancellation retains file and tombstone', async () => {
    const f = fixture(), dav = new MockDav()
    await upload(dav, f)
    const id = f.state.episodeGroups[0].id
    f.state.episodeGroups.shift()
    f.state.episodes = f.state.episodes.filter((e) => e.groupId !== id)
    f.repository.save(f.state)
    const result = await upload(dav, f, { confirmDelete: async () => false })
    assert(!result.complete && dav.files.has(f.a), 'cancelled deletion removed cloud file')
    assert(readSyncTarget(f.storage, identity).pendingDeletes.includes(f.a), 'tombstone lost')
    assert(readSyncTarget(f.storage, 'other-target').pendingDeletes.length === 0, 'deletion leaked to another target')
    await upload(dav, f)
    assert(!dav.files.has(f.a) && !readSyncTarget(f.storage, identity).pendingDeletes.includes(f.a), 'confirmed deletion failed')
  })
  await test('Delete race retains cloud file and pending deletion', async () => {
    const f = fixture(), dav = new MockDav()
    await upload(dav, f)
    const id = f.state.episodeGroups[0].id
    f.state.episodeGroups.shift(); f.state.episodes = f.state.episodes.filter((e) => e.groupId !== id)
    f.repository.save(f.state)
    const result = await upload(dav, f, { confirmDelete: async () => { dav.set(f.a, dav.files.get(f.a)!.text); return true } })
    assert(result.results.some((r) => r.path === f.a && r.status === 'failed'), 'delete race ignored')
    assert(dav.files.has(f.a) && readSyncTarget(f.storage, identity).pendingDeletes.includes(f.a), 'file or tombstone lost')
  })
  await test('Downloading a deleted group restores it and clears its tombstone atomically', async () => {
    const f = fixture(), dav = new MockDav()
    await upload(dav, f)
    const group = f.state.episodeGroups.shift()!
    f.state.episodes = f.state.episodes.filter((e) => e.groupId !== group.id)
    f.repository.save(f.state)
    const downloaded = await downloadDataFiles(dav.client())
    const next = mergeDownloadedFiles(f.state, downloaded.files)
    f.repository.save(next, { identity, update: (target) => acceptDownloadedFiles(target, downloaded.files, downloaded.remote) })
    assert(new LocalRepository(f.storage).load(config).episodeGroups.some((g) => g.id === group.id), 'group not restored')
    assert(!readSyncTarget(f.storage, identity).pendingDeletes.includes(f.a), 'tombstone remains')
  })
  await test('Corrupt and duplicate-ID downloads fail before any local writes', async () => {
    const f = fixture(), dav = new MockDav()
    await upload(dav, f)
    f.storage.writes = []
    const valid = dav.files.get(f.a)!.text
    dav.set(f.a, '{broken')
    await rejects(() => downloadDataFiles(dav.client()), 'corrupt file accepted')
    assert(!f.storage.writes.length, 'download failure mutated local data')
    dav.set(f.a, valid)
    const other = JSON.parse(dav.files.get(f.b)!.text)
    other.episodes[0].id = f.state.episodes[0].id
    dav.set(f.b, JSON.stringify(other))
    await rejects(() => downloadDataFiles(dav.client()), 'duplicate ID accepted')
  })
  await test('Download detects cloud edits while fetching the batch', async () => {
    const f = fixture(), dav = new MockDav()
    await upload(dav, f)
    let reads = 0
    dav.hook = (method, path) => { if (method === 'GET' && path === f.a && ++reads === 2) dav.set(path, dav.files.get(path)!.text.replace('Group A', 'Changed')) }
    await rejects(() => downloadDataFiles(dav.client()), 'mixed download accepted')
  })
  await test('Failed destination upload prevents deletion of moved-from cloud group', async () => {
    const f = fixture(), dav = new MockDav()
    await upload(dav, f)
    const group = f.state.episodeGroups.shift()!
    f.state.episodes.filter((e) => e.groupId === group.id).forEach((e) => { e.groupId = f.state.episodeGroups[0].id })
    f.repository.save(f.state)
    dav.errors.set(`PUT:${f.b}`, 500)
    await upload(dav, f)
    assert(dav.files.has(f.a), 'only cloud copy deleted')
  })
  await test('Legacy migration preserves old file, resumes partial output and rejects different data', async () => {
    const f = fixture(), dav = new MockDav()
    const legacy = JSON.stringify({ version: f.state.version, episodes: f.state.episodes, episodeGroups: f.state.episodeGroups, globalConfigSnapshot: f.state.globalConfig })
    dav.set('@legacy', legacy)
    const files = legacySnapshotFiles((await dav.client().readLegacy()).text, config)
    dav.errors.set(`PUT:${f.b}`, 500)
    await migrateLegacyFiles(dav.client(), files, () => {})
    dav.errors.clear()
    assert((await migrateLegacyFiles(dav.client(), files, () => {})).every((r) => r.status !== 'failed'), 'migration retry failed')
    assert(dav.files.get('@legacy')!.text === legacy, 'legacy file overwritten')
    dav.set(f.a, dav.files.get(f.a)!.text.replace('Group A', 'Different'))
    await rejects(() => migrateLegacyFiles(dav.client(), files, () => {}), 'migration overwrote existing data')
  })
  await test('Authentication failure, invalid directory XML and external listing URLs fail safely', async () => {
    const f = fixture(), dav = new MockDav()
    dav.errors.set('PROPFIND:', 401)
    await rejects(() => upload(dav, f), 'authentication failure ignored')
    assert(!dav.calls.some((c) => c.method === 'PUT'), 'write after auth failure')
    await rejects(() => parseWebDavListing('<bad/>', 'http://localhost/dav/scripts/'), 'bad XML accepted')
    await rejects(() => parseWebDavListing('<d:multistatus xmlns:d="DAV:"><d:response><d:href>http://other.example/x.json</d:href><d:status>HTTP/1.1 200 OK</d:status></d:response></d:multistatus>', 'http://localhost/dav/scripts/'), 'external URL accepted')
  })
  await test('Legacy generated timing IDs are stable across migration retries', () => {
    const f = fixture()
    f.state.episodes[0].shots[0].text = 'An action without saved timing metadata.'
    f.state.episodes[0].shots[0].timingSegments = []
    const legacy = JSON.stringify({ version: f.state.version, episodes: f.state.episodes, episodeGroups: f.state.episodeGroups, globalConfigSnapshot: f.state.globalConfig })
    const first = legacySnapshotFiles(legacy, config)
    const second = legacySnapshotFiles(legacy, config)
    for (const [path, file] of first) assert(canonicalJson(file) === canonicalJson(second.get(path)), 'generated ID changed on retry')
  })
  await test('Profile ID changes preserve local-only group slots after download', async () => {
    const f = fixture(), dav = new MockDav()
    f.state.globalConfig.prompt.profiles.forEach((p, index) => { p.id = `cloud-profile-${index}` })
    f.state.globalConfig.prompt.activeProfileId = 'cloud-profile-0'
    f.state.episodeGroups[0].promptProfileId = 'cloud-profile-0'
    f.state.episodeGroups[1].promptProfileId = 'cloud-profile-1'
    await upload(dav, f)
    const local = fixture().state
    const localGroup = local.episodeGroups[1].id
    const downloaded = await downloadDataFiles(dav.client())
    const next = mergeDownloadedFiles(local, downloaded.files)
    assert(next.episodeGroups.find((g) => g.id === localGroup)?.promptProfileId === 'cloud-profile-1', 'local-only slot was not remapped')
  })
  await test('Network errors and invalid settings files cannot modify local storage', async () => {
    const f = fixture(), dav = new MockDav()
    await upload(dav, f)
    const before = canonicalJson([...f.storage.data])
    const disconnected = new WebDavClient(settings, async () => { throw new TypeError('network offline') })
    await rejects(() => downloadDataFiles(disconnected), 'network failure ignored')
    dav.set('settings.json', JSON.stringify({ formatVersion: 1, appVersion: f.state.version, kind: 'settings', globalConfig: {} }))
    await rejects(() => downloadDataFiles(dav.client()), 'invalid settings accepted')
    assert(canonicalJson([...f.storage.data]) === before, 'failure modified local storage')
  })
  await test('Direct directory URLs are not extended; original connectivity status codes work', async () => {
    const urls: string[] = []
    const client = new WebDavClient(settings, async (url, init) => {
      urls.push(String(url))
      if (init?.method === 'PROPFIND') return new Response(null, { status: 200 })
      return new Response(null, { status: 404 })
    })
    await client.test()
    await client.read('settings.json')
    assert(urls[0] === settings.baseUrl, 'test used a different directory')
    assert(urls[1] === `${settings.baseUrl}settings.json`, 'an extra directory was appended')
  })
  await test('Migration writes into the configured root and preserves the legacy file', async () => {
    const f = fixture(), dav = new MockDav()
    const legacy = JSON.stringify({ version: f.state.version, episodes: f.state.episodes, episodeGroups: f.state.episodeGroups, globalConfigSnapshot: f.state.globalConfig })
    dav.set('@legacy', legacy)
    const target = dav.client()
    const results = await migrateLegacyFiles(target, legacySnapshotFiles(legacy, config), () => {})
    assert(results.every((r) => r.status !== 'failed'), 'migration failed')
    assert(dav.files.has('settings.json') && dav.files.has('ungrouped.json'), 'root files missing')
    assert([...dav.files.keys()].some((path) => path.startsWith('groups/')), 'groups directory files missing')
    assert(![...dav.files.keys()].some((path) => path.startsWith('screenplays/')), 'extra directory created')
    assert(dav.files.get('@legacy')?.text === legacy, 'original overwritten')
    await downloadDataFiles(target)
  })
  await test('Proxy directory mapping accepts direct children but rejects outside files', async () => {
    const xml = (href: string, collection = false) => `<d:multistatus xmlns:d="DAV:"><d:response><d:href>${href}</d:href><d:propstat><d:prop><d:resourcetype>${collection ? '<d:collection/>' : ''}</d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`
    const client = new WebDavClient(settings, async (_url, init) => new Response(
      new Headers(init?.headers).get('Depth') === '0' ? xml('/backend/scripts', true) : xml('/backend/scripts/settings.json'), { status: 207 }))
    assert((await client.list())?.[0]?.path === 'settings.json', 'proxy mapping rejected')
    await rejects(() => parseWebDavListing(xml('/backend/other/file.json'), settings.baseUrl, '/backend/scripts'), 'outside file accepted')
    await rejects(() => parseWebDavListing(xml('http://other.example/backend/scripts/file.json'), settings.baseUrl, '/backend/scripts'), 'external origin accepted')
  })
  return { passed: results.filter((r) => r.passed).length, total: results.length, results }
}
