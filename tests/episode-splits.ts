import { normalizeGlobalConfig } from '../src/config'
import { createEpisode, createEpisodeGroup, createInitialState } from '../src/defaults'
import { assembleDataFiles, buildDataFiles, mergeDownloadedFiles, parseDataFile } from '../src/dataFiles'
import { clearInteriorSplitEpisodeNumbers, episodePreviewRanges, normalizeSplitEpisodeNumber } from '../src/episodeSplits'
import { normalizeAppState } from '../src/stateNormalization'
import { LocalRepository } from '../src/storage'
import { downloadDataFiles } from '../src/webdavSync'
import { testDatabaseName } from './indexeddb-helper'
import { MemoryStorage } from './point-ledger'
import { MockDav } from './storage-webdav'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function runEpisodeSplitTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  async function test(name: string, action: () => void | Promise<void>) {
    try { await action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  const episodesFor = (numbers: number[], groupId: string | null = null) => numbers.map((number) => ({ ...createEpisode(number), groupId }))

  await test('Only positive safe integers are stored, and legacy episodes default to null', () => {
    for (const value of [undefined, null, '', '8', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert(normalizeSplitEpisodeNumber(value) === null, `invalid number accepted: ${value}`)
    }
    assert(normalizeSplitEpisodeNumber(8) === 8 && createEpisode().splitEpisodeNumber === null, 'positive number or default incorrect')
    const state = createInitialState(config)
    delete (state.episodes[0] as Partial<typeof state.episodes[0]>).splitEpisodeNumber
    assert(normalizeAppState(state, config).episodes[0].splitEpisodeNumber === null, 'legacy missing field not initialized')
  })
  await test('Original 04/05/06 with endpoints 08 and 12 yields five split episodes', () => {
    const episodes = episodesFor([4, 5, 6])
    episodes[0].splitEpisodeNumber = 8
    episodes[2].splitEpisodeNumber = 12
    const ranges = episodePreviewRanges(episodes)
    assert(ranges.length === 1 && ranges[0].originals.length === 3, 'original continuous range broken')
    assert(ranges[0].splitNumbers.join('/') === '8/9/10/11/12', 'split endpoints not expanded inclusively')
  })
  await test('Gaps, singletons, distinct groups and legacy titles create independent preview ranges', () => {
    const episodes = [...episodesFor([4, 5, 6, 9, 15, 16, 17], 'a'), ...episodesFor([18], 'b'), { ...createEpisode(), title: '番外' }]
    episodes.forEach((episode, index) => { episode.splitEpisodeNumber = index + 1 })
    clearInteriorSplitEpisodeNumbers(episodes)
    const ranges = episodePreviewRanges(episodes)
    assert(ranges.map((range) => range.originals.length).join('/') === '3/1/3/1/1', 'range isolation incorrect')
    assert(ranges[1].splitNumbers.join('/') === '4' && ranges[3].splitNumbers.join('/') === '8', 'singleton number expanded incorrectly')
    assert(episodes[1].splitEpisodeNumber === null && episodes[5].splitEpisodeNumber === null, 'middle numbers retained')
  })
  await test('Missing or reversed endpoints show only recorded numbers, without inferring a range', () => {
    const episodes = episodesFor([4, 5, 6])
    assert(episodePreviewRanges(episodes)[0].splitNumbers.length === 0, 'empty range fabricated')
    episodes[0].splitEpisodeNumber = 8
    assert(episodePreviewRanges(episodes)[0].splitNumbers.join('/') === '8', 'missing end fabricated')
    episodes[0].splitEpisodeNumber = null
    episodes[2].splitEpisodeNumber = 12
    assert(episodePreviewRanges(episodes)[0].splitNumbers.join('/') === '12', 'missing start fabricated')
    episodes[0].splitEpisodeNumber = 15
    assert(episodePreviewRanges(episodes)[0].splitNumbers.length === 2, 'reversed range expanded')
  })
  await test('New neighbors clear former boundaries and deleting them never restores old numbers', () => {
    const episodes = episodesFor([4, 5, 6])
    episodes[0].splitEpisodeNumber = 8
    episodes[2].splitEpisodeNumber = 12
    episodes.push(createEpisode(7))
    clearInteriorSplitEpisodeNumbers(episodes)
    assert(episodes[2].splitEpisodeNumber === null && episodes[0].splitEpisodeNumber === 8, 'new middle number not cleared')
    episodes.pop()
    clearInteriorSplitEpisodeNumbers(episodes)
    assert(episodes[2].splitEpisodeNumber === null, 'deleted neighbor restored data')
    episodes[2].groupId = 'another'
    episodes[1].splitEpisodeNumber = 9
    clearInteriorSplitEpisodeNumbers(episodes)
    assert(episodes[1].splitEpisodeNumber === 9, 'move did not create editable boundary')
    episodes[2].groupId = null
    clearInteriorSplitEpisodeNumbers(episodes)
    assert(episodes[1].splitEpisodeNumber === null, 'move back did not clear new middle')
  })
  await test('Final imported membership clears only interior split numbers and preserves endpoints', () => {
    const state = createInitialState(config)
    state.episodes = episodesFor([4, 5, 6, 7])
    state.episodes.forEach((episode, index) => { episode.splitEpisodeNumber = index + 8 })
    const loaded = normalizeAppState(state, config)
    assert(loaded.episodes.map((episode) => episode.splitEpisodeNumber ?? '-').join('/') === '8/-/-/11', 'combined membership not used')
  })
  await test('JSON data files roundtrip numbers and reject invalid provided values', () => {
    const state = createInitialState(config)
    state.episodes[0].splitEpisodeNumber = 8
    const files = new Map([...buildDataFiles(state)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    assert(assembleDataFiles(files, state).episodes[0].splitEpisodeNumber === 8, 'JSON number lost')
    for (const value of [0, -1, 1.5, '8']) {
      const invalid = JSON.parse(JSON.stringify(files.get('ungrouped.json')))
      invalid.episodes[0].splitEpisodeNumber = value
      let rejected = false
      try { parseDataFile(JSON.stringify(invalid), 'ungrouped.json') } catch { rejected = true }
      assert(rejected, `invalid data file accepted: ${value}`)
    }
  })
  await test('WebDAV download and IndexedDB reload retain split numbers and rederive ranges', async () => {
    const state = createInitialState(config)
    const group = createEpisodeGroup(config.prompt.activeProfileId)
    state.episodeGroups = [group]
    state.episodes = episodesFor([4, 5, 6], group.id)
    state.episodes[0].splitEpisodeNumber = 8
    state.episodes[2].splitEpisodeNumber = 12
    state.activeEpisodeId = state.episodes[0].id
    const dav = new MockDav()
    dav.collections.add('groups/')
    buildDataFiles(state).forEach((file, path) => dav.set(path, JSON.stringify(file)))
    const downloaded = await downloadDataFiles(dav.client())
    const merged = mergeDownloadedFiles(createInitialState(config), downloaded.files)
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    try {
      await repository.save(merged)
      const loaded = await repository.load(config)
      assert(episodePreviewRanges(loaded.episodes.filter((episode) => episode.groupId === group.id))[0].splitNumbers.join('/') === '8/9/10/11/12', 'WebDAV or IndexedDB lost endpoints')
    } finally { repository.close() }
  })
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
