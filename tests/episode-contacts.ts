import { mergeGlobalConfigs, migrateLegacyGlobalConfig, normalizeGlobalConfig } from '../src/config'
import { createEpisode, createEpisodeGroup, createInitialState } from '../src/defaults'
import { assembleDataFiles, buildDataFiles, parseDataFile } from '../src/dataFiles'
import { clearInteriorEpisodeContacts, contactEditableEpisodeIds, mergeContactPersonOptions, renameEpisodeContacts } from '../src/episodeContacts'
import { normalizeAppState } from '../src/stateNormalization'
import { LocalRepository } from '../src/storage'
import { downloadDataFiles, uploadDataFiles } from '../src/webdavSync'
import { testDatabaseName } from './indexeddb-helper'
import { MemoryStorage } from './point-ledger'
import { MockDav } from './storage-webdav'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const episodesFor = (numbers: number[], groupId: string | null = null) => numbers.map((number) => ({ ...createEpisode(number), groupId }))

export async function runEpisodeContactTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  async function test(name: string, action: () => void | Promise<void>) {
    try { await action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }

  await test('Example sequence allows only singleton and range endpoints', () => {
    const episodes = episodesFor([4, 5, 6, 7, 9, 15, 16, 17])
    const editable = contactEditableEpisodeIds(episodes)
    assert(episodes.filter((episode) => editable.has(episode.id)).map((episode) => episode.title.match(/\d+/)![0]).join('/') === '04/07/09/15/17', 'wrong boundary rows')
  })
  await test('Singletons, two consecutive episodes and different groups remain independent', () => {
    const episodes = [...episodesFor([1, 2], 'a'), ...episodesFor([3], 'b'), ...episodesFor([1, 2, 3])]
    const editable = contactEditableEpisodeIds(episodes)
    assert(episodes.slice(0, 3).every((episode) => editable.has(episode.id)), 'cross-group adjacency used')
    assert(!editable.has(episodes[4].id) && editable.size === 5, 'ungrouped sequence ignored')
    assert(contactEditableEpisodeIds(episodesFor([8])).size === 1, 'singleton disabled')
  })
  await test('Legacy titles without valid numbers are standalone and duplicate numbers share adjacency', () => {
    const episodes = episodesFor([1, 2, 2, 3])
    episodes.push({ ...createEpisode(), title: '番外' }, { ...createEpisode(), title: '第 00 集' })
    const editable = contactEditableEpisodeIds(episodes)
    assert(!editable.has(episodes[1].id) && !editable.has(episodes[2].id), 'duplicate middle numbers became boundaries')
    assert(editable.has(episodes[4].id) && editable.has(episodes[5].id), 'legacy standalone title disabled')
  })
  await test('Adding a neighbor clears an old boundary and deleting it does not restore the value', () => {
    const episodes = episodesFor([4, 5, 6, 7])
    episodes.forEach((episode) => { episode.contactPerson = '张三' })
    clearInteriorEpisodeContacts(episodes)
    assert(episodes[0].contactPerson === '张三' && episodes[3].contactPerson === '张三' && !episodes[1].contactPerson && !episodes[2].contactPerson, 'initial clearing incorrect')
    episodes.unshift(createEpisode(3))
    clearInteriorEpisodeContacts(episodes)
    assert(episodes[1].contactPerson === '', 'old endpoint not cleared')
    episodes.shift()
    clearInteriorEpisodeContacts(episodes)
    assert(episodes[0].contactPerson === '', 'cleared contact restored')
  })
  await test('Moves and committed renames recalculate source and destination ranges', () => {
    const episodes = [...episodesFor([4, 6], 'a'), ...episodesFor([5], 'b')]
    episodes.forEach((episode) => { episode.contactPerson = '张三' })
    episodes[2].groupId = 'a'
    clearInteriorEpisodeContacts(episodes)
    assert(episodes[2].contactPerson === '', 'moved middle contact retained')
    episodes[2].contactPerson = '李四'
    episodes[1].title = '第 09 集'
    clearInteriorEpisodeContacts(episodes)
    assert(episodes[2].contactPerson === '李四', 'new endpoint not editable')
    episodes[1].title = '第 06 集'
    clearInteriorEpisodeContacts(episodes)
    assert(episodes[2].contactPerson === '', 'renamed neighbor did not clear middle')
  })
  await test('Option renames use stable IDs, support swaps, and deletion keeps historical names', () => {
    const episodes = episodesFor([1, 3, 5])
    episodes[0].contactPerson = '张三'
    episodes[1].contactPerson = '李四'
    episodes[2].contactPerson = '已删除对接人'
    renameEpisodeContacts(episodes, [{ id: 'a', label: '张三' }, { id: 'b', label: '李四' }, { id: 'c', label: '已删除对接人' }], [{ id: 'a', label: '李四' }, { id: 'b', label: '张三' }])
    assert(episodes.map((episode) => episode.contactPerson).join('/') === '李四/张三/已删除对接人', 'rename cascaded or deletion erased history')
  })
  await test('Config migration defaults to empty options and preserves fallback options for legacy config', () => {
    const old = clone(config)
    delete (old.dataCollection as Partial<typeof old.dataCollection>).contactPersonOptions
    assert(normalizeGlobalConfig(old)?.dataCollection.contactPersonOptions.length === 0, 'old config rejected')
    const fallback = clone(config)
    fallback.dataCollection.contactPersonOptions = [{ id: 'a', label: '张三' }]
    assert(migrateLegacyGlobalConfig({}, 1, fallback).dataCollection.contactPersonOptions[0].label === '张三', 'legacy fallback lost')
    assert(createEpisode().contactPerson === '', 'new episode not empty')
  })
  await test('Config validates blank names, duplicates, IDs and trims names', () => {
    const value = clone(config)
    value.dataCollection.contactPersonOptions = [{ id: 'a', label: '  张三  ' }]
    assert(normalizeGlobalConfig(value)?.dataCollection.contactPersonOptions[0].label === '张三', 'name not trimmed')
    value.dataCollection.contactPersonOptions[0].label = ' '
    assert(!normalizeGlobalConfig(value), 'blank name accepted')
    value.dataCollection.contactPersonOptions = [{ id: 'a', label: '张三' }, { id: 'b', label: ' 张三 ' }]
    assert(!normalizeGlobalConfig(value), 'duplicate name accepted')
    value.dataCollection.contactPersonOptions = [{ id: 'a', label: '张三' }, { id: 'a', label: '李四' }]
    assert(!normalizeGlobalConfig(value), 'duplicate ID accepted')
  })
  await test('Option merging retains local order and IDs and resolves imported ID conflicts', () => {
    const current = [{ id: 'a', label: '张三' }]
    const imported = [{ id: 'b', label: '张三' }, { id: 'a', label: '李四' }]
    const merged = mergeContactPersonOptions(current, imported)
    assert(merged.length === 2 && merged[0].id === 'a' && merged[1].id !== 'a' && merged[1].label === '李四', 'merge conflict not resolved')
    assert(current.length === 1 && imported[1].id === 'a', 'merge mutated input')
    const a = clone(config), b = clone(config)
    a.dataCollection.contactPersonOptions = current
    b.dataCollection.contactPersonOptions = imported
    assert(mergeGlobalConfigs(a, b).dataCollection.contactPersonOptions.length === 2, 'global merge omitted contacts')
  })
  await test('State migration clears interior contacts across archived groups without touching scripts', () => {
    const state = createInitialState(config)
    const group = createEpisodeGroup(config.prompt.activeProfileId)
    group.archived = true
    state.episodeGroups = [group]
    state.episodes = episodesFor([4, 5, 6], group.id)
    state.episodes.forEach((episode) => { episode.contactPerson = ' 张三 '; episode.scriptText = '原始剧本'; episode.splitScriptText = '拆分草稿' })
    delete (state.episodes[0] as Partial<typeof state.episodes[0]>).contactPerson
    const loaded = normalizeAppState(state, config)
    assert(loaded.episodes[0].contactPerson === '' && loaded.episodes[1].contactPerson === '' && loaded.episodes[2].contactPerson === '张三', 'migration boundary clearing failed')
    assert(loaded.episodes.every((episode) => episode.scriptText === '原始剧本' && episode.splitScriptText === '拆分草稿'), 'script changes lost')
  })
  await test('JSON data files roundtrip contacts and options and reject an invalid contact field', () => {
    const state = createInitialState(config)
    state.episodes[0].contactPerson = '张三'
    state.globalConfig.dataCollection.contactPersonOptions = [{ id: 'a', label: '张三' }]
    const files = new Map([...buildDataFiles(state)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    const loaded = assembleDataFiles(files, state)
    assert(loaded.episodes[0].contactPerson === '张三' && loaded.globalConfig.dataCollection.contactPersonOptions[0].id === 'a', 'JSON lost contact data')
    const invalid = JSON.parse(JSON.stringify(files.get('ungrouped.json')))
    invalid.episodes[0].contactPerson = 42
    let rejected = false
    try { parseDataFile(JSON.stringify(invalid), 'ungrouped.json') } catch { rejected = true }
    assert(rejected, 'invalid contact accepted')
  })
  await test('Final combined episode set decides which imported contacts are cleared', () => {
    const state = createInitialState(config)
    const first = episodesFor([4, 5])
    const second = episodesFor([6, 7])
    first.forEach((episode) => { episode.contactPerson = '张三' })
    second.forEach((episode) => { episode.contactPerson = '李四' })
    state.episodes = [...first, ...second]
    const loaded = normalizeAppState(state, config)
    assert(loaded.episodes.map((episode) => episode.contactPerson).join('/') === '张三///李四', 'combined boundaries incorrect')
  })
  await test('IndexedDB reload retains endpoint contacts and clears middle contacts', async () => {
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    try {
      const state = createInitialState(config)
      state.episodes = episodesFor([4, 5, 6])
      state.episodes.forEach((episode) => { episode.contactPerson = '张三' })
      await repository.save(state)
      const loaded = await repository.load(config)
      assert(loaded.episodes.map((episode) => episode.contactPerson).join('/') === '张三//张三', 'IndexedDB contact normalization failed')
    } finally { repository.close() }
  })
  await test('WebDAV roundtrip preserves configured and historical contact names', async () => {
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    try {
      const state = createInitialState(config)
      state.episodes = episodesFor([4, 6])
      state.episodes[0].contactPerson = '张三'
      state.episodes[1].contactPerson = '已删除对接人'
      state.globalConfig.dataCollection.contactPersonOptions = [{ id: 'a', label: '张三' }]
      const dav = new MockDav()
      const result = await uploadDataFiles(dav.client(), buildDataFiles(state), { repository, identity: 'contact-test', confirmOverwrite: async () => true, confirmDelete: async () => true, isGroupPresent: () => false })
      assert(result.complete, 'upload failed')
      const downloaded = await downloadDataFiles(dav.client())
      const loaded = assembleDataFiles(downloaded.files, state)
      assert(loaded.episodes[0].contactPerson === '张三' && loaded.episodes[1].contactPerson === '已删除对接人' && loaded.globalConfig.dataCollection.contactPersonOptions[0].label === '张三', 'WebDAV lost contact data')
    } finally { repository.close() }
  })
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
