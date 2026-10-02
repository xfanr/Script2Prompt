import { normalizeGlobalConfig } from '../src/config'
import { createEpisode, createInitialState } from '../src/defaults'
import { assembleDataFiles, buildDataFiles, canonicalJson, parseDataFile } from '../src/dataFiles'
import { canSelectPointEpisode, createPointInvoice, createPointUsage, effectiveProductionData, formatPointInvoiceExport, invoicePointPrice, mergePointInvoices, normalizePointInvoices, remapPointInvoices } from '../src/pointLedger'
import { copyText } from '../src/clipboard'
import { normalizeAppState } from '../src/stateNormalization'
import { LocalRepository } from '../src/storage'
import { downloadDataFiles, legacySnapshotFiles, uploadDataFiles } from '../src/webdavSync'
import { MockDav } from './storage-webdav'

export class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  clear() { this.data.clear() }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const close = (a: number, b: number) => Math.abs(a - b) < 1e-10

export async function runPointLedgerTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const state = createInitialState(config)
  state.episodes = [createEpisode(1), createEpisode(2), createEpisode(3)]
  state.activeEpisodeId = state.episodes[0].id
  const episode = state.episodes[0]
  episode.productionData = { pointUsage: 77, pointCost: 0.12, productionDate: '2025-01-01' }
  const invoice = createPointInvoice([])
  invoice.amount = 100.01
  invoice.initialPoints = 1000
  invoice.receivedPoints = 300
  const usage = createPointUsage()
  usage.date = '2026-10-02'
  usage.points = 100
  usage.episodes = state.episodes.map((item) => ({ episodeId: item.id, episodeTitle: item.title, groupTitle: '未分组' }))
  invoice.usages = [usage]
  state.pointInvoices = [invoice]
  const results: { name: string; passed: boolean; error?: string }[] = []
  async function test(name: string, action: () => void | Promise<void>) {
    try { await action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  await test('Default invoice numbers increase; precision and zero-point validation', () => {
    assert(createPointInvoice([invoice, { ...invoice, number: '未开票8' }]).number === '未开票9', 'default numbering')
    assert(invoicePointPrice(createPointInvoice([])) === null, 'zero price')
    assert(close(invoicePointPrice(invoice)!, 100.01 / 1300), 'price rounded early')
    const rounded = normalizePointInvoices([{ ...invoice, amount: 100.015 }])[0]
    assert(rounded.amount === 100.02, 'amount precision')
    for (const invalid of [
      { ...invoice, number: ' ' }, { ...invoice, initialPoints: 0, receivedPoints: 0 },
      { ...invoice, usages: [{ ...usage, date: '2026-02-30' }] },
      { ...invoice, usages: [{ ...usage, points: 1.5 }] },
      { ...invoice, usages: [{ ...usage, episodes: [] }] },
    ]) {
      let rejected = false
      try { normalizePointInvoices([invalid]) } catch { rejected = true }
      assert(rejected, 'invalid invoice accepted')
    }
    assert(normalizePointInvoices([{ ...invoice, usages: [{ ...usage, points: 2000 }] }]).length === 1, 'over-budget should be allowed')
  })
  await test('Fractional sharing, multiple invoice costs, latest date and historical fallback', () => {
    const data = effectiveProductionData(episode, [invoice])
    assert(close(data.pointUsage, 100 / 3), 'share rounded')
    assert(close(data.totalCost, 100 / 3 * 100.01 / 1300), 'cost incorrect')
    const second = { ...invoice, id: 'second', amount: 200, usages: [{ ...usage, id: 'second-usage', date: '2026-10-01' }] }
    const combined = effectiveProductionData(episode, [second, invoice])
    assert(close(combined.totalCost, 100 / 3 * 300.01 / 1300), 'multiple prices not summed')
    assert(combined.productionDate === '2026-10-02', 'date not latest')
    const old = effectiveProductionData(episode, [])
    assert(old.pointUsage === 77 && old.productionDate === '2025-01-01' && close(old.totalCost, 77 * 0.12), 'historical fallback')
    assert(episode.productionData.pointUsage === 77, 'historical value overwritten')
  })
  await test('Renaming, moving and deleting episodes retain association and allocation denominator', () => {
    const changed = { ...episode, title: 'renamed', groupId: 'other-group' }
    assert(effectiveProductionData(changed, [invoice]).fromRecords, 'association broken')
    assert(close(effectiveProductionData(changed, [invoice]).pointUsage, 100 / 3), 'deleted targets redistributed')
    assert(invoice.usages[0].episodes.length === 3, 'history altered')
  })
  await test('Legacy state and settings migrate without changing costs or dates', () => {
    const old = clone(state) as any
    old.version = 9
    delete old.pointInvoices
    const loaded = normalizeAppState(old, config)
    assert(loaded.version === 10 && !loaded.pointInvoices.length, 'legacy migration')
    assert(loaded.episodes[0].productionData.productionDate === '2025-01-01', 'legacy date changed')
    const files = buildDataFiles(state)
    const settings = files.get('settings.json')!
    if (settings.kind === 'settings') delete settings.pointInvoices
    assert(!assembleDataFiles(files, state).pointInvoices.length, 'old settings not accepted')
  })
  await test('Producer and tool defaults migrate; edited metadata survives storage and import', () => {
    const legacy = clone(invoice) as any
    delete legacy.producer
    delete legacy.toolType
    const migrated = normalizePointInvoices([legacy])[0]
    assert(migrated.producer === '\u6768\u4e91\u5e06' && migrated.toolType === 'updream', 'metadata defaults missing')
    assert(canonicalJson(normalizePointInvoices([migrated])) === canonicalJson([migrated]), 'metadata migration unstable')
    const edited = { ...migrated, producer: 'producer-edited', toolType: 'tool-edited' }
    const updated = { ...state, pointInvoices: [edited] }
    const repository = new LocalRepository(new MemoryStorage())
    repository.save(updated)
    const loaded = repository.load(config)
    assert(loaded.pointInvoices[0].producer === edited.producer && loaded.pointInvoices[0].toolType === edited.toolType, 'metadata not persisted')
    const restored = assembleDataFiles(buildDataFiles(updated), state)
    assert(canonicalJson(restored.pointInvoices) === canonicalJson(updated.pointInvoices), 'metadata lost in data files')
    const imported = remapPointInvoices(normalizePointInvoices(JSON.parse(JSON.stringify(updated.pointInvoices))), new Map())
    assert(imported[0].producer === edited.producer && imported[0].toolType === edited.toolType, 'metadata lost in JSON import')
    assert(mergePointInvoices([invoice], [edited], new Set(state.episodes.map((item) => item.id))).length === 2, 'different metadata merged away')
  })
  await test('Local repository, data files and legacy WebDAV snapshots round trip', () => {
    const files = buildDataFiles(state)
    const parsed = new Map([...files].map(([path, file]) => [path, parseDataFile(canonicalJson(file), path)]))
    assert(canonicalJson(assembleDataFiles(parsed, state).pointInvoices) === canonicalJson(state.pointInvoices), 'file roundtrip')
    const storage = new MemoryStorage()
    const repo = new LocalRepository(storage)
    repo.save(state)
    assert(canonicalJson(new LocalRepository(storage).load(config).pointInvoices) === canonicalJson(state.pointInvoices), 'local roundtrip')
    const snapshot = JSON.stringify({ version: 10, episodes: state.episodes, episodeGroups: [], globalConfigSnapshot: config, pointInvoices: state.pointInvoices })
    const restored = assembleDataFiles(legacySnapshotFiles(snapshot, config), state)
    assert(canonicalJson(restored.pointInvoices) === canonicalJson(state.pointInvoices), 'legacy snapshot ledger dropped')
  })
  await test('Import remaps targets; repeated imports deduplicate; differing invoices survive', () => {
    const ids = new Map(state.episodes.map((item, index) => [item.id, `target-${index}`]))
    const imported = remapPointInvoices([invoice], ids)
    assert(imported[0].id !== invoice.id && imported[0].usages[0].id !== usage.id, 'invoice IDs not remapped')
    assert(imported[0].usages[0].episodes[0].episodeId === 'target-0', 'episode not remapped')
    const targets = new Set(ids.values())
    assert(mergePointInvoices(imported, remapPointInvoices([invoice], ids), targets).length === 1, 'repeated import duplicates')
    const newer = { ...invoice, usages: [usage, { ...usage, id: 'new-usage', date: '2026-10-03', points: 200 }] }
    const merged = mergePointInvoices(imported, remapPointInvoices([newer], ids), targets)
    assert(merged.length === 1 && merged[0].usages.length === 2, 'new snapshot duplicated old usage')
    assert(merged[0].usages.reduce((sum, item) => sum + item.points, 0) === 300, 'merged usage counted twice')
    assert(imported[0].usages.length === 1, 'merge mutated original records')
    assert(mergePointInvoices(imported, [{ ...imported[0], id: 'different', amount: 999 }], targets).length === 2, 'differing invoice lost')
    const missing = new Set<string>()
    assert(mergePointInvoices(imported, remapPointInvoices([invoice], new Map()), missing).length === 1, 'deleted target history duplicates')
  })
  await test('WebDAV upload and download retain invoice IDs and exact episode associations', async () => {
    const dav = new MockDav()
    const storage = new MemoryStorage()
    const uploaded = await uploadDataFiles(dav.client(), buildDataFiles(state), {
      storage, identity: 'ledger-test', confirmOverwrite: async () => true, confirmDelete: async () => true,
      isGroupPresent: () => false,
    })
    assert(uploaded.results.every((result) => result.status !== 'failed'), 'upload failed')
    const downloaded = await downloadDataFiles(dav.client())
    const restored = assembleDataFiles(downloaded.files, state)
    assert(canonicalJson(restored.pointInvoices) === canonicalJson(state.pointInvoices), 'WebDAV ledger mismatch')
    assert(close(effectiveProductionData(restored.episodes[0], restored.pointInvoices).totalCost,
      effectiveProductionData(episode, state.pointInvoices).totalCost), 'restored costs differ')
  })
  await test('TSV export groups dramas, sorts first dates and subtracts unrounded costs', () => {
    const episodes = [createEpisode(38), createEpisode(39), createEpisode(40), createEpisode(9), createEpisode(10)]
    episodes.forEach((item, index) => { item.groupId = index < 3 ? 'a' : 'b' })
    const groups = [
      { id: 'a', title: 'A', archived: false, starred: false, promptProfileId: '' },
      { id: 'b', title: 'B', archived: true, starred: false, promptProfileId: '' },
    ]
    const references = episodes.map((item) => ({ episodeId: item.id, episodeTitle: item.title, groupTitle: 'old' }))
    const exported = { ...invoice, amount: 999, initialPoints: 11039, receivedPoints: 0, rechargeDate: '2026-09-18', usages: [
      { ...usage, id: 'b', date: '2026-09-21', points: 527, episodes: references.slice(3) },
      { ...usage, id: 'a', date: '2026-09-19', points: 4604, episodes: references.slice(0, 3) },
      { ...usage, id: 'a2', date: '2026-09-22', points: 1, episodes: references.slice(0, 1) },
    ] }
    const rows = formatPointInvoiceExport(exported, episodes, groups).split('\n').map((line) => line.split('\t'))
    assert(rows.length === 2 && rows.every((row) => row.length === 12), 'TSV shape or header wrong')
    assert(rows[0][2] === '《A》' && rows[1][2] === '《B》', 'first-use ordering wrong')
    assert(rows[0][4] === '9月18日' && rows[0][7] === '0.0905' && rows[0][8] === '4605', 'format or aggregation wrong')
    assert(rows[0][10] === '《A》38/39/40，共3集', 'episode deduplication wrong')
    assert(rows[0][9] === (4605 * 999 / 11039).toFixed(2), 'rounded unit price used')
    assert(rows[1][11] === (999 - (4605 + 527) * 999 / 11039).toFixed(2), 'remaining money incorrect')
    assert(!formatPointInvoiceExport({ ...exported, usages: [] }, episodes, groups), 'empty export')
  })
  await test('Cross-drama export preserves deleted shares, custom titles and negative balances', () => {
    const moved = { ...episode, title: 'special\tname\n', groupId: 'moved' }
    const groups = [{ id: 'moved', title: 'Moved', archived: false, starred: false, promptProfileId: '' }]
    const exported = { ...invoice, producer: 'person\tname', amount: 10, initialPoints: 3, receivedPoints: 0, rechargeDate: '', usages: [
      { ...usage, points: 10, episodes: [usage.episodes[0],
        { episodeId: 'gone', episodeTitle: '第 02 集', groupTitle: 'Old' },
        { episodeId: 'gone2', episodeTitle: '第 03 集', groupTitle: 'Old' }] },
    ] }
    const rows = formatPointInvoiceExport(exported, [moved], groups).split('\n').map((line) => line.split('\t'))
    assert(rows.every((row) => row.length === 12 && row[4] === ''), 'unsafe text or blank date changed TSV columns')
    assert(rows.find((row) => row[2] === '《Moved》')![8] === '3.33', 'share lost')
    assert(rows.find((row) => row[2] === '《Old》')![10] === '《Old》02（已删除）/03（已删除），共2集', 'deleted references lost')
    assert(rows[1][11] === '-23.33', 'negative balance or fractional calculation wrong')
    let rejected = false
    try { formatPointInvoiceExport({ ...exported, initialPoints: 0 }, [moved], groups) } catch { rejected = true }
    assert(rejected, 'invalid export accepted')
  })
  await test('Single-drama selection allows clear-to-switch and legacy removals only', () => {
    const episodes = state.episodes.map((item, index) => ({ ...item, groupId: index ? 'b' : 'a' }))
    const groups = ['a', 'b'].map((id) => ({ id, title: id, archived: false, starred: false, promptProfileId: '' }))
    const selected = { ...usage, episodes: usage.episodes.slice(0, 1) }
    assert(canSelectPointEpisode({ ...selected, episodes: [] }, usage.episodes[1], episodes, groups), 'empty selection locked')
    assert(!canSelectPointEpisode(selected, usage.episodes[1], episodes, groups), 'cross-drama selection accepted')
    const legacy = { ...usage, episodes: usage.episodes.slice(0, 2) }
    assert(canSelectPointEpisode(legacy, usage.episodes[0], episodes, groups), 'existing selection cannot be removed')
    assert(!canSelectPointEpisode(legacy, usage.episodes[2], episodes, groups), 'legacy record accepts additions')
    assert(canSelectPointEpisode({ ...legacy, episodes: [usage.episodes[1]] }, usage.episodes[2], episodes, groups), 'single-drama additions blocked')
  })
  await test('Clipboard uses secure API and HTTP fallback, and cleans up after failure', async () => {
    const secure = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    const exec = Object.getOwnPropertyDescriptor(document, 'execCommand')
    let modern = ''
    let fallback = ''
    try {
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { modern = text } } })
      Object.defineProperty(document, 'execCommand', { configurable: true, value: () => { fallback = (document.activeElement as HTMLTextAreaElement).value; return true } })
      assert(await copyText('secure') && modern === 'secure' && !fallback, 'secure copy failed')
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
      assert(await copyText('http') && fallback === 'http', 'HTTP fallback failed')
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('restricted') } } })
      assert(await copyText('restricted') && String(fallback) === 'restricted', 'restricted fallback failed')
      const count = document.querySelectorAll('textarea').length
      Object.defineProperty(document, 'execCommand', { configurable: true, value: () => { throw new Error('copy failed') } })
      assert(!await copyText('failed') && document.querySelectorAll('textarea').length === count, 'failure or cleanup incorrect')
    } finally {
      if (secure) Object.defineProperty(window, 'isSecureContext', secure); else delete (window as any).isSecureContext
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard); else delete (navigator as any).clipboard
      if (exec) Object.defineProperty(document, 'execCommand', exec); else delete (document as any).execCommand
    }
  })
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
