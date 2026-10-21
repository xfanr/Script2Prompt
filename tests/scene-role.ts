import { normalizeGlobalConfig } from '../src/config'
import { createInitialState, createSceneConfig, normalizeShotSceneSelection, STORAGE_KEY } from '../src/defaults'
import { buildDataFiles, assembleDataFiles } from '../src/dataFiles'
import { composeSceneSettings } from '../src/prompt'
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
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
