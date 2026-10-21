import { createApp, defineComponent, nextTick } from 'vue'
import { loadRuntimeDefaultConfig, normalizeGlobalConfig } from '../src/config'
import { createCharacterAsset, createEpisodeGroup, createInitialState, STORAGE_KEY } from '../src/defaults'
import { buildDataFiles, canonicalJson } from '../src/dataFiles'
import { LocalRepository, STORE_PREFIX } from '../src/storage'
import { useAppState } from '../src/useAppState'
import type { AppState } from '../src/types'
import { databaseRecords, recordingDatabase, testDatabaseName } from './indexeddb-helper'
import { MemoryStorage } from './point-ledger'

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
async function rejects(action: () => Promise<unknown>) {
  let failed = false
  try { await action() } catch { failed = true }
  assert(failed, 'expected a rejection')
}

export async function runIndexedDBTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  async function test(name: string, action: () => Promise<void>) {
    try { await action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: error instanceof Error ? error.stack : String(error) }) }
  }
  await test('Full legacy localStorage migrates without any setItem; preferences and sync baselines survive', async () => {
    const state = createInitialState(config)
    state.episodes[0].characters = [createCharacterAsset('Actor', 'Costume', 'Deep voice')]
    const storage = new MemoryStorage()
    for (const [path, file] of buildDataFiles(state)) storage.setItem(`${STORE_PREFIX}${path}`, canonicalJson(file))
    storage.setItem(`${STORE_PREFIX}directory`, canonicalJson({ formatVersion: 1, paths: [] }))
    storage.setItem(`${STORE_PREFIX}ui`, canonicalJson({ activeEpisodeId: state.activeEpisodeId }))
    storage.setItem(`${STORE_PREFIX}sync`, canonicalJson({ dav: { files: { 'settings.json': { etag: 'etag', title: 'Settings' } }, pendingDeletes: ['groups/old.json'], lastCompleteAt: '2026-10-01' } }))
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    storage.setItem('theme-preference', 'dark')
    storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') }
    const repository = new LocalRepository(storage, testDatabaseName())
    const loaded = await repository.load(config)
    assert(loaded.episodes[0].characters[0].voiceDescription === 'Deep voice', 'voice description lost')
    assert(storage.length === 1 && storage.getItem('theme-preference') === 'dark', 'cleanup removed preferences or retained business copies')
    const baseline = await repository.readSyncTarget('dav')
    assert(baseline.files['settings.json'].etag === 'etag' && baseline.pendingDeletes.length === 1, 'sync registry lost')
    await repository.close()
  })
  await test('A failed or unavailable database leaves the old snapshot intact', async () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify(createInitialState(config))
    storage.setItem(STORAGE_KEY, raw)
    const factory = { open() { throw new DOMException('Blocked', 'SecurityError') } } as unknown as IDBFactory
    await rejects(() => new LocalRepository(storage, testDatabaseName(), factory).load(config))
    assert(storage.getItem(STORAGE_KEY) === raw, 'old snapshot was changed')
  })
  await test('Legacy fourth-profile groups retain their prompt binding after migration', async () => {
    const storage = new MemoryStorage()
    const state = createInitialState(config)
    const group = createEpisodeGroup(config.prompt.profiles[3].id)
    state.episodeGroups = [group]
    state.episodes[0].groupId = group.id
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    const repository = new LocalRepository(storage, testDatabaseName())
    try {
      const loaded = await repository.load(config)
      assert(loaded.episodeGroups[0].promptProfileId === config.prompt.profiles[3].id, 'fourth profile lost')
    } finally { await repository.close() }
  })
  await test('Invalid legacy records fail before migration, with no fallback to stale snapshots', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(createInitialState(config)))
    storage.setItem(`${STORE_PREFIX}directory`, canonicalJson({ formatVersion: 1, paths: [] }))
    storage.setItem(`${STORE_PREFIX}settings.json`, '{broken')
    const before = Array.from({ length: storage.length }, (_, i) => [storage.key(i), storage.getItem(storage.key(i)!)])
    const repository = new LocalRepository(storage, testDatabaseName())
    await rejects(() => repository.load(config))
    assert((await databaseRecords(repository.databaseName)).size === 0, 'invalid migration wrote records')
    assert(before.every(([key, value]) => storage.getItem(key!) === value), 'source changed after failure')
    await repository.close()
  })
  await test('More than five MiB persists and reloads without any localStorage business writes', async () => {
    const storage = new MemoryStorage()
    storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') }
    const repository = new LocalRepository(storage, testDatabaseName())
    const state = await repository.load(config)
    state.episodes[0].scriptText = '剧本正文'.repeat(900000)
    await repository.save(state)
    const reloaded = await repository.load(config)
    assert(reloaded.episodes[0].scriptText === state.episodes[0].scriptText, 'large script lost')
    assert(storage.length === 0 && !(await databaseRecords(repository.databaseName)).has(`${STORE_PREFIX}transaction`), 'business write or journal in localStorage')
    await repository.close()
  })
  await test('Queued saves capture snapshots at invocation and preserve later edits', async () => {
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    const state = await repository.load(config)
    state.episodes[0].scriptText = 'first'
    const first = repository.save(state)
    state.episodes[0].scriptText = 'second'
    const second = repository.save(state)
    await Promise.all([first, second])
    assert((await repository.load(config)).episodes[0].scriptText === 'second', 'old snapshot overwrote latest')
    await repository.close()
  })
  await test('State replacement and sync baselines roll back together on a failed write', async () => {
    const database = recordingDatabase()
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName(), database.factory)
    const state = await repository.load(config)
    await repository.updateSyncTarget('dav', target => { target.lastCompleteAt = 'old' })
    state.episodes[0].scriptText = 'downloaded'
    database.control.failOnce = `${STORE_PREFIX}ui`
    await rejects(() => repository.save(state, { identity: 'dav', update: target => { target.lastCompleteAt = 'new' } }))
    assert((await repository.load(config)).episodes[0].scriptText !== 'downloaded', 'partial state remained')
    assert((await repository.readSyncTarget('dav')).lastCompleteAt === 'old', 'partial baseline remained')
    await repository.close()
  })
  await test('Runtime defaults remain available when the optional localStorage cache is full', async () => {
    const original = localStorage.setItem
    const storagePrototype = Object.getPrototypeOf(localStorage)
    const method = storagePrototype.setItem
    storagePrototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') }
    try { assert(Boolean((await loadRuntimeDefaultConfig({ fresh: true })).prompt.profiles.length), 'valid fetched defaults discarded') }
    finally { storagePrototype.setItem = method; assert(localStorage.setItem === original, 'cache method not restored') }
  })

  function savingFixture() {
    const writes: { snapshot: AppState; resolve: (date: string) => void; reject: (error: Error) => void }[] = []
    const repository = { save(snapshot: AppState) {
      return new Promise<string>((resolve, reject) => writes.push({ snapshot: JSON.parse(JSON.stringify(snapshot)), resolve, reject }))
    } } as unknown as LocalRepository
    let controller!: ReturnType<typeof useAppState>
    const element = document.createElement('div')
    const app = createApp(defineComponent({ setup() { controller = useAppState(createInitialState(config), repository); return () => null } }))
    app.mount(element)
    return { controller, writes, stop: () => app.unmount() }
  }
  const settle = async () => { for (let i = 0; i < 10; i++) await nextTick() }
  await test('Autosave drains continuous edits, waits for completion, and warns only while unsaved', async () => {
    const { controller, writes, stop } = savingFixture()
    try {
      controller.state.episodes[0].scriptText = 'first'
      await settle()
      assert(writes.length === 1, 'initial save missing')
      controller.state.episodes[0].scriptText = 'second'
      await settle()
      assert(writes.length === 1, 'concurrent saves overlapped')
      const pending = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(pending)
      assert(pending.defaultPrevented, 'unsaved navigation not guarded')
      writes[0].resolve('2026-10-01')
      await settle()
      assert(writes.length === 2 && writes[1].snapshot.episodes[0].scriptText === 'second', 'later edit skipped')
      writes[1].resolve('2026-10-02')
      assert(await controller.saveNow(), 'flush failed')
      assert(controller.state.lastSavedAt === '2026-10-02', 'saved time updated before latest save')
      const saved = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(saved)
      assert(!saved.defaultPrevented, 'saved navigation blocked')
    } finally { stop() }
  })
  await test('Autosave failure retains live edits; retry clears the error only after commit', async () => {
    const { controller, writes, stop } = savingFixture()
    try {
      controller.state.episodes[0].scriptText = 'keep this edit'
      await settle()
      const first = controller.saveNow()
      writes[0].reject(new Error('Test write failure'))
      assert(!await first && controller.saveError.value === 'Test write failure', 'failure was hidden')
      assert(controller.state.episodes[0].scriptText === 'keep this edit' && controller.state.lastSavedAt === null, 'unsaved state discarded')
      const retry = controller.saveNow()
      assert(Boolean(controller.saveError.value), 'error cleared before successful commit')
      writes[1].resolve('2026-10-02')
      assert(await retry && !controller.saveError.value, 'retry did not clear error')
    } finally { stop() }
  })
  await test('Failed downloaded-state save keeps the original UI state and unlocks editing', async () => {
    const { controller, writes, stop } = savingFixture()
    try {
      const next = JSON.parse(JSON.stringify(controller.state)) as AppState
      next.episodes[0].scriptText = 'downloaded'
      const replacement = controller.replaceState(next, { identity: 'dav', update: () => {} })
      const failure = rejects(() => replacement)
      await settle()
      assert(controller.isReplacing.value, 'replacement did not guard edits')
      writes[0].reject(new Error('Test replacement failure'))
      await failure
      assert(!controller.isReplacing.value && controller.state.episodes[0].scriptText !== 'downloaded', 'failed replacement changed UI')
    } finally { stop() }
  })
  return { passed: results.filter(result => result.passed).length, total: results.length, results }
}
