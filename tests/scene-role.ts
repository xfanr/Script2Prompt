import { normalizeGlobalConfig } from '../src/config'
import { createInitialState, createSceneConfig, createShot, normalizeShotSceneSelection, STORAGE_KEY } from '../src/defaults'
import { buildDataFiles, assembleDataFiles, mergeDownloadedFiles, parseDataFile } from '../src/dataFiles'
import { composePrompt, composeSceneSettings, composeShotDetail } from '../src/prompt'
import { formatShotNumber, formatShotReference } from '../src/shotNumber'
import { normalizeAppState } from '../src/stateNormalization'
import { LocalRepository } from '../src/storage'
import { testDatabaseName } from './indexeddb-helper'
import { MemoryStorage } from './point-ledger'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function runSceneRoleTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const state = createInitialState(config)
  const shot = state.episodes[0].shots[0]
  const selected = createSceneConfig('Office', '深夜', '室外', 'Rain')
  shot.scenes = [createSceneConfig(), selected, createSceneConfig('Home')]
  shot.usePositionReference = false
  state.episodes[0].props = ['legacy prop']
  const results: { name: string; passed: boolean; error?: string }[] = []
  async function test(name: string, action: () => void | Promise<void>) {
    try { await action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  await test('Single-scene selection retains first configured scene and its state', async () => {
    const scenes = normalizeShotSceneSelection(shot.scenes)
    assert(scenes.length === 1 && scenes[0] === selected && scenes[0].statusText === 'Rain', 'configured scene lost')
    assert(shot.scenes.length === 3, 'input array mutated')
    const empty = normalizeShotSceneSelection([])
    assert(empty.length === 1 && empty[0].name === '', 'empty selection needs one editable scene')
  })
  await test('State migration keeps one scene, enables position reference and preserves compatibility fields', async () => {
    const migrated = normalizeAppState(state, config)
    const migratedShot = migrated.episodes[0].shots[0]
    assert(migratedShot.scenes.length === 1 && migratedShot.scenes[0].name === 'Office', 'multiple scenes remain')
    assert(migratedShot.scenes[0].time === '深夜' && migratedShot.scenes[0].space === '室外' && migratedShot.scenes[0].statusText === 'Rain', 'scene configuration changed')
    assert(migratedShot.usePositionReference && !migratedShot.useReverseAngle, 'position reference is not permanent')
    assert(migrated.episodes[0].props[0] === 'legacy prop', 'compatibility field lost')
  })
  await test('Legacy browser storage migrates and reloads the single scene', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    const repository = new LocalRepository(storage, testDatabaseName())
    await repository.load(config)
    const reloaded = (await repository.load(config)).episodes[0].shots[0]
    assert(reloaded.scenes.length === 1 && reloaded.scenes[0].statusText === 'Rain' && reloaded.usePositionReference, 'storage roundtrip changed configuration')
  })
  await test('Data-file import normalizes multiple scenes and disabled position reference', async () => {
    const imported = assembleDataFiles(buildDataFiles(state)).episodes[0].shots[0]
    assert(imported.scenes.length === 1 && imported.scenes[0].name === 'Office' && imported.usePositionReference, 'data-file import did not normalize scene configuration')
  })
  await test('Prompt always includes positioning even with a legacy disabled flag', async () => {
    const text = composeSceneSettings({ ...shot, scenes: [selected] })
    assert(text.includes('深夜，室外，Office，Rain') && text.includes('多角色位置参考@'), 'scene state or permanent positioning missing')
  })
  await test('Reference defaults span units and selected numbers drive both prompt references', () => {
    const episode = createInitialState(config).episodes[0]
    episode.title = '第 05 集'
    episode.shots = Array.from({ length: 8 }, (_, index) => createShot(Math.min(index + 1, 3)))
    const current = episode.shots[5]
    assert(formatShotNumber(episode, 5) === '5-3-4', 'actual shot number changed')
    assert(formatShotReference(episode, 5) === '5-6', 'default is not the episode-wide ordinal')
    current.referenceShotNumber = 6
    current.firstFrameMode = true
    current.text = '（（@））\n正文@'
    const referenceName = formatShotReference(episode, 5)
    const detail = composeShotDetail(config, current, undefined, 8, [], referenceName)
    const full = composePrompt(config, current, undefined, 8, [], referenceName)
    assert(full.includes('多角色位置参考 [5-6.png] '), 'selected position reference missing')
    assert(detail.includes('\n [5-6.png] \n') && full.endsWith(`三、分镜详情\n${detail}`), 'first-frame reference or shared detail mismatch')
    assert(detail.endsWith('正文@') && current.text === '（（@））\n正文@', 'custom at sign or source changed')
    current.referenceShotNumber = 8
    episode.shots[0].referenceShotNumber = 8
    assert(formatShotReference(episode, 0) === '5-8', 'duplicate selection not allowed')
    episode.shots.reverse()
    assert(formatShotReference(episode, 2) === '5-8', 'manual reference followed its target instead of retaining number')
    assert(formatShotReference(episode, 0) === '5-1', 'default did not follow own reordered position')
  })
  await test('Legacy, invalid and out-of-range references normalize to the current default', () => {
    for (const value of [undefined, null, 0, -1, 1.5, '1', 2]) {
      const stored = JSON.parse(JSON.stringify(state))
      stored.episodes[0].shots[0].referenceShotNumber = value
      const loaded = normalizeAppState(stored, config)
      assert(loaded.episodes[0].shots[0].referenceShotNumber === null, `invalid reference retained: ${value}`)
      assert(formatShotReference(loaded.episodes[0], 0).endsWith('-1'), 'default reference not restored')
    }
  })
  await test('References survive IndexedDB, JSON data files and WebDAV merging', async () => {
    const stored = createInitialState(config)
    stored.episodes[0].shots.push(createShot())
    stored.episodes[0].shots[0].referenceShotNumber = 2
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(stored)
    assert((await repository.load(config)).episodes[0].shots[0].referenceShotNumber === 2, 'IndexedDB lost reference')
    const files = new Map([...buildDataFiles(stored)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    assert(assembleDataFiles(files, stored).episodes[0].shots[0].referenceShotNumber === 2, 'JSON lost reference')
    assert(mergeDownloadedFiles(createInitialState(config), files).episodes[0].shots[0].referenceShotNumber === 2, 'download lost reference')
    stored.episodes[0].shots.pop()
    const shrunk = normalizeAppState(stored, config)
    assert(shrunk.episodes[0].shots[0].referenceShotNumber === null, 'out-of-range reference retained after shrink')
  })
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
