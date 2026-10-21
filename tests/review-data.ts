import { normalizeGlobalConfig } from '../src/config'
import { createInitialState, createPromptReview, STORAGE_KEY } from '../src/defaults'
import { assembleDataFiles, buildDataFiles, canonicalJson } from '../src/dataFiles'
import { normalizeAppState } from '../src/stateNormalization'
import { LocalRepository } from '../src/storage'
import { testDatabaseName } from './indexeddb-helper'
import { MemoryStorage } from './point-ledger'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function hasSubtitleData(value: unknown) {
  return /"noSubtitle(?:Count)?"\s*:/.test(JSON.stringify(value))
}

export async function runReviewDataTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const makeLegacy = () => {
    const state = createInitialState(config)
    Object.assign(state.episodes[0].shots[0].review, {
      rating: 3, drawCount: 5, notePrefix: '分类→选项', note: '保留备注', noSubtitle: true, noSubtitleCount: 4,
    })
    return state
  }
  const results: { name: string; passed: boolean; error?: string }[] = []
  async function test(name: string, action: () => void | Promise<void>) {
    try { await action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  await test('New reviews have only rating, draw count and notes', async () => {
    assert(canonicalJson(createPromptReview()) === canonicalJson({ rating: 0, drawCount: 1, notePrefix: '', note: '' }), 'obsolete default fields remain')
  })
  await test('Legacy boolean and count are discarded without changing retained review data', async () => {
    const normalized = normalizeAppState(makeLegacy(), config)
    assert(!hasSubtitleData(normalized), 'obsolete review fields remain')
    assert(canonicalJson(normalized.episodes[0].shots[0].review) === canonicalJson({ rating: 3, drawCount: 5, notePrefix: '分类→选项', note: '保留备注' }), 'retained review data changed')
  })
  await test('Records whose only data was subtitle information return to default', async () => {
    const state = createInitialState(config)
    Object.assign(state.episodes[0].shots[0].review, { noSubtitle: true, noSubtitleCount: 1 })
    const review = normalizeAppState(state, config).episodes[0].shots[0].review
    assert(canonicalJson(review) === canonicalJson({ rating: 0, drawCount: 1, notePrefix: '', note: '' }), 'subtitle-only review is not default')
  })
  await test('Legacy storage loads clean reviews and subsequent saves omit old fields', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(makeLegacy()))
    const repository = new LocalRepository(storage, testDatabaseName())
    const state = await repository.load(config)
    assert(!hasSubtitleData(state), 'legacy storage load retained subtitle data')
    await repository.save(state)
    assert(!hasSubtitleData(await new LocalRepository(storage, repository.databaseName).load(config)), 'reload restored subtitle data')
    const files = buildDataFiles(state)
    for (const file of files.values()) assert(!hasSubtitleData(file), 'saved or exported data retains subtitle fields')
  })
  await test('Data-file import removes subtitle fields and preserves other scoring data', async () => {
    const state = makeLegacy()
    const restored = assembleDataFiles(buildDataFiles(state), state)
    assert(!hasSubtitleData(restored), 'data-file import retained obsolete fields')
    assert(restored.episodes[0].shots[0].review.drawCount === 5 && restored.episodes[0].shots[0].review.rating === 3, 'data-file import changed score')
  })
  await test('Subtitle differences no longer change normalized review data', async () => {
    const first = makeLegacy()
    const second = JSON.parse(JSON.stringify(first))
    second.episodes[0].shots[0].review.noSubtitle = false
    second.episodes[0].shots[0].review.noSubtitleCount = 0
    assert(canonicalJson(normalizeAppState(first, config)) === canonicalJson(normalizeAppState(second, config)), 'obsolete data still affects normalized comparison')
  })
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
