import { normalizeGlobalConfig } from '../src/config'
import { createEpisode, createEpisodeGroup, createInitialState } from '../src/defaults'
import { assembleDataFiles, buildDataFiles, mergeDownloadedFiles, parseDataFile } from '../src/dataFiles'
import { isHistoricalEpisodeGroup, latestGroupProductionDate } from '../src/groupHistory'
import { createPointInvoice, createPointUsage } from '../src/pointLedger'
import { LocalRepository } from '../src/storage'
import { downloadDataFiles } from '../src/webdavSync'
import { testDatabaseName } from './indexeddb-helper'
import { MemoryStorage } from './point-ledger'
import { MockDav } from './storage-webdav'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function runGroupHistoryTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const today = new Date(2026, 9, 26)
  const results: { name: string; passed: boolean; error?: string }[] = []
  async function test(name: string, action: () => void | Promise<void>) {
    try { await action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  function fixture() {
    const state = createInitialState(config)
    const group = createEpisodeGroup(config.prompt.activeProfileId)
    group.archived = true
    state.episodeGroups = [group]
    state.episodes[0].groupId = group.id
    state.episodes[0].productionData.productionDate = '2026-08-26'
    return { state, group }
  }

  await test('Only more than 60 local calendar days qualifies, independently of time of day', () => {
    const { group } = fixture()
    assert(!isHistoricalEpisodeGroup(group, '2026-08-28', today), '59 days qualified')
    assert(!isHistoricalEpisodeGroup(group, '2026-08-27', new Date(2026, 9, 26, 23, 59)), '60 days qualified')
    assert(isHistoricalEpisodeGroup(group, '2026-08-26', today), '61 days did not qualify')
    assert(!isHistoricalEpisodeGroup(group, '2026-10-27', today), 'future date qualified')
  })
  await test('Calendar days cross years, leap February and daylight-saving boundaries', () => {
    const { group } = fixture()
    for (const [now, day60, day61] of [
      [new Date(2026, 0, 15), '2025-11-16', '2025-11-15'],
      [new Date(2024, 3, 29), '2024-02-29', '2024-02-28'],
      [new Date(2026, 3, 10), '2026-02-09', '2026-02-08'],
    ] as const) {
      assert(!isHistoricalEpisodeGroup(group, day60, now), `60-day boundary failed: ${day60}`)
      assert(isHistoricalEpisodeGroup(group, day61, now), `61-day boundary failed: ${day61}`)
    }
  })
  await test('Only archived groups without either performance value qualify; received is irrelevant', () => {
    const { group } = fixture()
    group.archived = false
    assert(!isHistoricalEpisodeGroup(group, '2026-08-26', today), 'active group qualified')
    group.archived = true
    group.results.playCount = 2000
    assert(!isHistoricalEpisodeGroup(group, '2026-08-26', today), 'play count ignored')
    group.results.playCount = 0
    group.results.commission = 500
    assert(!isHistoricalEpisodeGroup(group, '2026-08-26', today), 'commission ignored')
    group.results.commission = 0
    group.results.received = true
    assert(isHistoricalEpisodeGroup(group, '2026-08-26', today), 'received blocked classification')
  })
  await test('Newest valid date wins, missing dates and other drama groups are ignored', () => {
    const { state, group } = fixture()
    const later = createEpisode(2), missing = createEpisode(3), other = createEpisode(4)
    later.groupId = missing.groupId = group.id
    later.productionData.productionDate = '2026-09-01'
    other.productionData.productionDate = '2026-10-26'
    state.episodes.push(later, missing, other)
    const latest = latestGroupProductionDate(group.id, state.episodes, [])
    assert(latest === '2026-09-01' && !isHistoricalEpisodeGroup(group, latest, today), 'latest date or scope incorrect')
    later.productionData.productionDate = ''
    assert(isHistoricalEpisodeGroup(group, latestGroupProductionDate(group.id, state.episodes, []), today), 'missing date blocked history')
  })
  await test('Empty groups, missing dates and malformed calendar dates stay archived', () => {
    const { state, group } = fixture()
    for (const value of ['', '2026-02-30', '2026-13-01', '2026-8-01', 'invalid']) {
      state.episodes[0].productionData.productionDate = value
      assert(latestGroupProductionDate(group.id, state.episodes, []) === '', `accepted invalid date: ${value}`)
      assert(!isHistoricalEpisodeGroup(group, value, today), `invalid group qualified: ${value}`)
    }
    assert(latestGroupProductionDate(group.id, [], []) === '', 'empty group date fabricated')
  })
  await test('Invoice usage dates take precedence exactly as in full-drama data', () => {
    const { state, group } = fixture()
    const invoice = createPointInvoice([])
    invoice.initialPoints = 100
    invoice.amount = 1
    const usage = createPointUsage()
    usage.date = '2026-10-01'
    usage.episodes = [{ episodeId: state.episodes[0].id, groupTitle: group.title, episodeTitle: state.episodes[0].title }]
    invoice.usages = [usage]
    assert(latestGroupProductionDate(group.id, state.episodes, [invoice]) === usage.date, 'invoice date ignored')
    assert(!isHistoricalEpisodeGroup(group, usage.date, today), 'recent usage stayed historical')
    invoice.initialPoints = 0
    assert(latestGroupProductionDate(group.id, state.episodes, [invoice]) === '2026-08-26', 'invalid-price invoice changed production date')
  })
  await test('Editing performance, production date or archive state immediately changes classification', () => {
    const { state, group } = fixture()
    const historical = () => isHistoricalEpisodeGroup(group, latestGroupProductionDate(group.id, state.episodes, []), today)
    assert(historical(), 'initial history missing')
    group.results.commission = 500
    assert(!historical(), 'performance did not return to archive')
    group.results.commission = 0
    assert(historical(), 'clearing performance did not return to history')
    state.episodes[0].productionData.productionDate = '2026-10-25'
    assert(!historical(), 'recent date did not return to archive')
    state.episodes[0].productionData.productionDate = '2026-08-26'
    group.archived = false
    assert(!historical(), 'unarchive retained history')
  })
  await test('JSON data files and IndexedDB reload rederive classification without storing a category', async () => {
    const { state, group } = fixture()
    const before = JSON.stringify(state)
    const files = new Map([...buildDataFiles(state)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    const restored = assembleDataFiles(files, state)
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    try {
      await repository.save(restored)
      const loaded = await repository.load(config)
      const loadedGroup = loaded.episodeGroups.find((item) => item.id === group.id)!
      assert(isHistoricalEpisodeGroup(loadedGroup, latestGroupProductionDate(group.id, loaded.episodes, loaded.pointInvoices), today), 'reload lost history')
      assert(JSON.stringify(state) === before && loadedGroup.archived, 'classification changed saved state')
      assert(!('historical' in loadedGroup), 'category persisted')
    } finally { repository.close() }
  })
  await test('WebDAV downloads classify the final data set and retain historical groups as archived', async () => {
    const { state, group } = fixture()
    const dav = new MockDav()
    dav.collections.add('groups/')
    buildDataFiles(state).forEach((file, path) => dav.set(path, JSON.stringify(file)))
    const downloaded = await downloadDataFiles(dav.client())
    const merged = mergeDownloadedFiles(createInitialState(config), downloaded.files)
    const loadedGroup = merged.episodeGroups.find((item) => item.id === group.id)!
    assert(isHistoricalEpisodeGroup(loadedGroup, latestGroupProductionDate(group.id, merged.episodes, merged.pointInvoices), today), 'download lost history')
    assert(loadedGroup.archived && !('historical' in loadedGroup), 'download changed the persisted group category')
  })
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
